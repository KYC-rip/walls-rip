import type { AstroGlobal } from 'astro';
import { ApiError, apiGet, apiPost } from './api';
import { fetchSmsRoutes, type SmsRoute } from './catalogue';
import { localePath, type Lang } from './i18n';
import {
  COOKIE,
  clearSmsOrderState,
  ensureCsrf,
  rotateClientRef,
  readFlash,
  readSmsOrderState,
  setFlash,
  walletBalance,
  walletToken,
  type SmsOrderState,
} from './wallet';

/**
 * No-JS SMS purchase.
 *
 * The browser only ever names an opaque route reference. Engine, provider
 * country/service ids, pool and price are re-derived from the live compare
 * response on every purchase, so nothing money-relevant can be posted.
 */

const FIELD_SEP = '\u001f';

export interface RouteRef {
  engine: string;
  countryId: string;
  serviceId: string;
  pool: string;
}

export function encodeRouteRef(route: Pick<SmsRoute, 'engine' | 'countryId' | 'serviceId' | 'pool'>): string {
  const raw = [route.engine, route.countryId, route.serviceId, route.pool ?? ''].join(FIELD_SEP);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decoding is not a security boundary — it is a selector. Encode/decode only
 * exist so provider identifiers stay out of visible URLs.
 */
export function decodeRouteRef(ref: string): RouteRef | null {
  if (!ref || ref.length > 300) return null;
  try {
    const base = ref.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base + '='.repeat((4 - (base.length % 4)) % 4);
    const parts = atob(padded).split(FIELD_SEP);
    if (parts.length !== 4) return null;
    const [engine, countryId, serviceId, pool] = parts;
    if (!engine || !countryId || !serviceId) return null;
    return { engine, countryId, serviceId, pool };
  } catch {
    return null;
  }
}

/**
 * Resolve a reference against the live catalogue.
 *
 * An exact (engine, country, service, pool) row wins. When only the pool moved
 * — SMSPool re-tiers its operator pools while prices drift — the reference
 * still names a real route, so it falls back to that engine's cheapest current
 * row. The purchase page always renders the resolved live price before anyone
 * pays, so a stale pool changes what is offered, never what is charged
 * silently. A route that is gone (engine/country/service) resolves to null.
 */
/** Match a decoded ref against a route list (exact pool, else the same
 *  engine/country/service's cheapest row — pools re-tier constantly). */
export function matchSmsRoute(routes: SmsRoute[], wanted: RouteRef): SmsRoute | null {
  let exact: SmsRoute | null = null;
  let sameRoute: SmsRoute | null = null;
  for (const route of routes) {
    if (route.engine !== wanted.engine) continue;
    if (route.countryId !== wanted.countryId) continue;
    if (route.serviceId !== wanted.serviceId) continue;
    if (!sameRoute || route.price < sameRoute.price) sameRoute = route;
    if ((route.pool ?? '') !== wanted.pool) continue;
    if (!exact || route.price < exact.price) exact = route;
  }
  return exact ?? sameRoute;
}

export async function findSmsRoute(
  locals: unknown,
  country: string,
  service: string,
  ref: string,
  options: { fresh?: boolean } = {},
): Promise<SmsRoute | null> {
  const wanted = decodeRouteRef(ref);
  if (!wanted) return null;
  const routes = await fetchSmsRoutes(locals, country, service, options);
  return matchSmsRoute(routes, wanted);
}

/**
 * Purchase fallback: the selected route first, then any available route priced
 * at or below it, cheapest first. The buyer is never charged more than the
 * price the purchase page showed, and a drained route no longer kills the
 * sale while another engine still has stock.
 */
export function fallbackCandidates(routes: SmsRoute[], selected: SmsRoute): SmsRoute[] {
  const keyOf = (route: SmsRoute) => `${route.engine}|${route.countryId}|${route.serviceId}|${route.pool ?? ''}`;
  const selectedKey = keyOf(selected);
  const others = routes
    .filter((route) => route.available
      && route.price > 0
      && route.price <= selected.price + 0.001
      && keyOf(route) !== selectedKey)
    .sort((a, b) => a.price - b.price);
  return [selected, ...others];
}

/**
 * A provider refusal that another route can plausibly satisfy (stock, pool,
 * whitelist, lost price race). Ambiguous outcomes (held), wallet problems and
 * duplicates are never retried: those must settle/redirect, not buy again.
 */
export function isRetryableRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 502) return false;
  const message = error.message ?? '';
  if (/held|review/i.test(message)) return false;
  if (/insufficient|balance|not enough|no funds|top ?up|low balance/i.test(message)) return false;
  return /no[_ ]?free|no[_ ]?numbers|out[_ ]?of[_ ]?stock|no[_ ]?stock|sold out|unavailable|whitelist|max price|declined/i.test(message);
}

export interface SmsPurchaseResult {
  orderId?: string;
  phoneNumber?: string;
  balanceUSD?: number;
  charged?: number;
  status?: string;
}

/**
 * Buy from the wallet. A live `quoteId` (aggregator v2) binds the exact
 * provider route in KV; the explicit fields are the fallback when that quote
 * expires between the compare and the purchase.
 */
export async function buySmsNumber(
  locals: unknown,
  input: { token: string; route: SmsRoute; clientRef: string },
): Promise<SmsPurchaseResult> {
  return apiPost<SmsPurchaseResult>(
    locals,
    '/v1/tools/sms/purchase',
    {
      country: input.route.countryId,
      service: input.route.serviceId,
      engine: input.route.engine,
      ...(input.route.pool ? { pool: input.route.pool } : {}),
      ...(input.route.quoteId ? { quoteId: input.route.quoteId } : {}),
      ...(input.clientRef ? { clientRef: input.clientRef } : {}),
      token: input.token,
    },
    { timeoutMs: 60_000 },
  );
}

export interface SmsStatus {
  status: string;
  sms?: string;
  fullSms?: string;
  refunded?: number;
  balanceUSD?: number;
}

/**
 * `null` means the API could not be reached — not "still pending".
 * `unauthorized` means the wallet cookie is dead, which needs a different
 * answer than a transient outage.
 */
export async function checkSms(
  locals: unknown,
  orderId: string,
  token: string,
): Promise<{ status: SmsStatus | null; unauthorized: boolean }> {
  try {
    const data = await apiGet<Record<string, unknown>>(
      locals,
      `/v1/tools/sms/check?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
      { ttlMs: 2000 },
    );
    const status = typeof data.status === 'string' ? data.status.toUpperCase() : 'PENDING';
    return {
      unauthorized: false,
      status: {
        status,
        sms: typeof data.sms === 'string' ? data.sms : undefined,
        fullSms: typeof data.fullSms === 'string' ? data.fullSms : undefined,
        refunded: typeof data.refunded === 'number' ? data.refunded : undefined,
        balanceUSD: typeof data.balanceUSD === 'number' ? data.balanceUSD : undefined,
      },
    };
  } catch (error) {
    return { status: null, unauthorized: error instanceof ApiError && error.status === 401 };
  }
}

export interface SmsMessage {
  sender?: string;
  message: string;
  timestamp?: string;
}

/**
 * Full message history for the activation. This is the floor the page renders:
 * a code that once arrived stays on screen even when the provider reports
 * PENDING again (a resend resets some engines' state).
 */
export async function fetchSmsMessages(
  locals: unknown,
  orderId: string,
  token: string,
): Promise<SmsMessage[]> {
  try {
    const data = await apiGet<{ messages?: unknown[] }>(
      locals,
      `/v1/tools/sms/messages?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
      { ttlMs: 2000 },
    );
    return (Array.isArray(data.messages) ? data.messages : [])
      .map((entry): SmsMessage | null => {
        const row = entry as Record<string, unknown>;
        const message = typeof row.message === 'string' ? row.message.trim() : '';
        if (!message) return null;
        return {
          message,
          sender: typeof row.sender === 'string' ? row.sender : undefined,
          timestamp: typeof row.timestamp === 'string' ? row.timestamp : undefined,
        };
      })
      .filter((row): row is SmsMessage => row !== null);
  } catch {
    return [];
  }
}

export async function resendSms(
  locals: unknown,
  orderId: string,
  token: string,
): Promise<{ success: boolean; message?: string }> {
  return apiGet<{ success: boolean; message?: string }>(
    locals,
    `/v1/tools/sms/resend?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
    { fresh: true },
  );
}

export async function cancelSms(
  locals: unknown,
  orderId: string,
  token: string,
): Promise<{ success: boolean; message?: string; balanceUSD?: number; delivered?: boolean }> {
  return apiGet<{ success: boolean; message?: string; balanceUSD?: number; delivered?: boolean }>(
    locals,
    `/v1/tools/sms/cancel?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
    { fresh: true },
  );
}

/* ── Page preparation ───────────────────────────────────────────────── */

export type PrepareResult<T> =
  | { kind: 'ok'; props: T }
  | { kind: 'redirect'; response: Response };

function redirect(path: string, status = 303): Response {
  return new Response(null, {
    status,
    headers: { location: path, 'cache-control': 'no-store' },
  });
}

function noStore(astro: AstroGlobal) {
  astro.response.headers.set('cache-control', 'no-store');
  astro.response.headers.set('referrer-policy', 'no-referrer');
}

function smsPath(lang: Lang, suffix = '') {
  return localePath(`/sms${suffix}`, lang);
}

export interface SmsPurchaseProps {
  country: string;
  service: string;
  routeRef: string;
  price: number;
  /** Cheapest fallback route at or below `price` (equal when there is none). */
  priceMin: number;
  successRate: number;
  stock: number | null;
  balance: number;
  hasWallet: boolean;
  csrf: string;
  lang: Lang;
  returnTo: string;
  flash: string | null;
  depositAmount: number;
}

export async function prepareSmsPurchase(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<SmsPurchaseProps>> {
  noStore(astro);

  const country = (astro.url.searchParams.get('c') ?? '').toUpperCase();
  const service = (astro.url.searchParams.get('s') ?? '').trim().slice(0, 64);
  const ref = astro.url.searchParams.get('route') ?? '';
  if (!/^[A-Z]{2}$/.test(country) || !service || !ref) {
    return { kind: 'redirect', response: redirect(smsPath(lang)) };
  }

  const listPath = `${smsPath(lang)}?c=${encodeURIComponent(country)}&s=${encodeURIComponent(service)}`;

  let route: SmsRoute | null = null;
  let routes: SmsRoute[] = [];
  try {
    // Fresh: the price on this page is what the visitor confirms.
    routes = await fetchSmsRoutes(astro.locals, country, service, { fresh: true });
    const wanted = decodeRouteRef(ref);
    route = wanted ? matchSmsRoute(routes, wanted) : null;
  } catch {
    setFlash(astro, 'Routes are unavailable right now. Nothing was charged — try again shortly.');
    return { kind: 'redirect', response: redirect(listPath) };
  }
  if (!route) {
    // Never bounce back to this same URL: a vanished route would loop.
    setFlash(astro, 'That route changed or sold out. Pick another one.');
    return { kind: 'redirect', response: redirect(listPath) };
  }
  if (!route.available) {
    setFlash(astro, 'That route is out of stock right now. Pick another one.');
    return { kind: 'redirect', response: redirect(listPath) };
  }

  const token = walletToken(astro);
  const balance = token ? await walletBalance(astro.locals, token) : 0;
  const csrf = ensureCsrf(astro);
  // A fresh page view is a fresh purchase intent: rotate the reference so a
  // deliberate second buy of the same route is not refused as a duplicate,
  // while a plain resubmission of an older form still hits the sold ref.
  rotateClientRef(astro, `sms:${encodeRouteRef(route)}`, COOKIE.refSms);

  const returnTo = `${smsPath(lang, '/purchase')}?c=${encodeURIComponent(country)}&s=${encodeURIComponent(service)}&route=${encodeURIComponent(ref)}`;
  // The fallback may use a cheaper route; it never uses a pricier one.
  const cheaper = routes.filter((entry) => entry.available && entry.price > 0 && entry.price < route.price);
  const priceMin = cheaper.length ? Math.min(...cheaper.map((entry) => entry.price)) : route.price;
  const shortfall = Math.max(0, route.price - balance);

  return {
    kind: 'ok',
    props: {
      country,
      service,
      routeRef: ref,
      price: route.price,
      priceMin,
      successRate: route.successRate,
      stock: route.stock,
      balance,
      hasWallet: !!token,
      csrf,
      lang,
      returnTo,
      flash: readFlash(astro),
      depositAmount: Math.max(0.5, Math.ceil(shortfall * 100) / 100),
    },
  };
}

export interface SmsCheckProps {
  order: SmsOrderState;
  status: string;
  /** True when the API could not be reached this load. */
  unreachable: boolean;
  messages: SmsMessage[];
  number?: string;
  charged: number;
  refunded?: number;
  balance: number;
  csrf: string;
  lang: Lang;
  flash: string | null;
  /** Where the meta refresh points, and whether it is armed at all. */
  refreshUrl: string | null;
  /** `/sms/check` without a refresh cycle — the stop/keep-checking target. */
  plainUrl: string;
  watching: boolean;
  stopped: boolean;
  terminal: boolean;
}

const MAX_CYCLES = 60;

export async function prepareSmsCheck(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<SmsCheckProps>> {
  noStore(astro);

  const order = readSmsOrderState(astro);
  const token = walletToken(astro);
  if (!order || !token) {
    return { kind: 'redirect', response: redirect(smsPath(lang)) };
  }

  const [checked, messages] = await Promise.all([
    checkSms(astro.locals, order.orderId, token),
    fetchSmsMessages(astro.locals, order.orderId, token),
  ]);

  if (checked.unauthorized) {
    // The wallet behind this cookie no longer exists: the order cannot be read
    // or refunded from here, so send the visitor back to a fresh start.
    clearSmsOrderState(astro);
    setFlash(astro, 'The wallet on this device is no longer valid. A new wallet is created with your next deposit.');
    return { kind: 'redirect', response: redirect(smsPath(lang)) };
  }

  const status = checked.status;
  const state = status?.status ?? 'UNKNOWN';
  const terminal = ['RECEIVED', 'EXPIRED', 'CANCELLED', 'CANCELED', 'REFUNDED', 'FAILED'].includes(state);
  const watching = astro.url.searchParams.get('watch') === '1';
  // "Stop refreshing" must actually stop: without this the plain URL starts
  // polling again immediately (PENDING re-arms the refresh).
  const stopped = astro.url.searchParams.get('stop') === '1';
  const cycle = Math.max(0, Number(astro.url.searchParams.get('r') ?? '0') || 0);

  // A live code the history endpoint has not recorded yet is appended as the
  // newest entry so it is on screen immediately; history is the floor, never
  // replaced by a later PENDING poll.
  const merged = [...messages];
  const live = status?.sms ?? '';
  if (live && !merged.some((row) => row.message.includes(live))) {
    merged.push({ message: status?.fullSms || live });
  }

  const balance =
    typeof status?.balanceUSD === 'number'
      ? status.balanceUSD
      : await walletBalance(astro.locals, token);

  if (state === 'CANCELLED' || state === 'CANCELED') clearSmsOrderState(astro);

  const pending = state === 'PENDING';
  const refreshArmed = !terminal && !stopped && (pending || watching) && cycle < MAX_CYCLES;
  const query = `?r=${cycle + 1}${watching ? '&watch=1' : ''}`;

  return {
    kind: 'ok',
    props: {
      order,
      status: state,
      unreachable: status === null,
      messages: merged.reverse(),
      number: order.number,
      charged: order.charged,
      refunded: status?.refunded,
      balance,
      csrf: ensureCsrf(astro),
      lang,
      flash: readFlash(astro),
      refreshUrl: refreshArmed ? `${smsPath(lang, '/check')}${query}` : null,
      plainUrl: smsPath(lang, '/check'),
      watching,
      stopped,
      terminal,
    },
  };
}

/** Friendly text for a provider refusal, matching the React flow's wording. */
export function purchaseErrorMessage(raw: string): string {
  // Providers answer with either prose or SCREAMING_CASE codes ("NO_NUMBERS").
  if (/no[_ ]?free[_ ]?phones|no[_ ]?numbers|out[_ ]?of[_ ]?stock|no[_ ]?stock/i.test(raw)) {
    return 'No numbers available on this route right now — pick another route or country.';
  }
  if (/max price/i.test(raw)) {
    return 'The provider price moved above the quote — retry or pick another route.';
  }
  if (/whitelist/i.test(raw)) {
    return 'This service is not available from this route — pick another one.';
  }
  if (/insufficient|balance/i.test(raw)) {
    return 'Insufficient wallet balance — add funds and try again.';
  }
  if (/duplicate/i.test(raw)) {
    return 'This purchase was already submitted — check the open order before retrying.';
  }
  // Never echo upstream text: provider names and raw status codes are not for
  // the customer. The detail stays in the API response and the logs.
  return 'The provider could not complete this request. Try again, or pick another route.';
}
