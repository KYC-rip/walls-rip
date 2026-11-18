import type { AstroGlobal } from 'astro';
import { ApiError, apiGet } from './api';
import {
  fetchProxyLocations,
  fetchProxyPlans,
  type ProxyLocation,
  type ProxyPlan,
} from './catalogue';
import { localePath, type Lang } from './i18n';
import { isDeadOrderError } from './order-errors';
import {
  COOKIE,
  clearProxyOrderState,
  ensureCsrf,
  readFlash,
  readProxyOrderState,
  rotateClientRef,
  setFlash,
  walletToken,
  type ProxyOrderState,
} from './wallet';

/**
 * No-JS proxy purchase and credentials.
 *
 * Proxy has its OWN wallet namespace (`proxy:wallet:` at the API), so the
 * balance and deposits here never touch the shared eSIM/SMS wallet. The token
 * travels in the request body/query (the API's contract), always server-side —
 * it never reaches the browser. A purchase needs both the plan id and a
 * location id; the ref carries both and is re-resolved live.
 */

const FIELD_SEP = '|';

export interface ProxyRef {
  planId: string;
  locationId: string;
}

export function encodeProxyRef(ref: ProxyRef): string {
  const raw = [ref.planId, ref.locationId].join(FIELD_SEP);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeProxyRef(ref: string): ProxyRef | null {
  if (!ref || ref.length > 400) return null;
  try {
    const base = ref.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base + '='.repeat((4 - (base.length % 4)) % 4);
    const [planId, locationId] = atob(padded).split(FIELD_SEP);
    if (!planId || planId.length > 160) return null;
    if (!locationId || locationId.length > 160) return null;
    return { planId, locationId };
  } catch {
    return null;
  }
}

export async function findProxyPlan(locals: unknown, planId: string): Promise<ProxyPlan | null> {
  const plans = await fetchProxyPlans(locals, '', { fresh: true });
  const plan = plans.find((entry) => entry.id === planId);
  return plan && plan.price > 0 ? plan : null;
}

export async function findProxyLocation(
  locals: unknown,
  locationId: string,
  options: { fresh?: boolean } = {},
): Promise<ProxyLocation | null> {
  const locations = await fetchProxyLocations(locals, options);
  return locations.find((entry) => entry.id === locationId) ?? null;
}

/** The proxy wallet balance (separate from the shared wallet). */
export async function fetchProxyBalance(locals: unknown, token: string): Promise<number> {
  const data = await apiGet<{ balanceUSD?: number }>(
    locals,
    `/v1/tools/proxy/balance?token=${encodeURIComponent(token)}`,
    { fresh: true },
  );
  return typeof data.balanceUSD === 'number' ? data.balanceUSD : 0;
}

export interface ProxyStatus {
  status?: string;
  expiresAt?: number;
}

export async function fetchProxyStatus(
  locals: unknown,
  token: string,
  orderId: string,
): Promise<ProxyStatus> {
  return apiGet<ProxyStatus>(
    locals,
    `/v1/tools/proxy/status?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
    { fresh: true, timeoutMs: 8000 },
  );
}

export interface ProxyCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: string;
}

export async function fetchProxyCredentials(
  locals: unknown,
  token: string,
  orderId: string,
): Promise<ProxyCredentials> {
  return apiGet<ProxyCredentials>(
    locals,
    `/v1/tools/proxy/credentials?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
    { fresh: true, timeoutMs: 10_000 },
  );
}

/** Customer-facing text for a failed proxy purchase, keyed on the API code. */
export function proxyError(error: unknown): { message: string; toOrder: boolean } {
  const api = error instanceof ApiError ? error : null;
  const code = api?.code;
  if (code === 'PURCHASE_HELD') {
    return {
      message:
        'The provider did not confirm. Your funds are held for review — do not pay again; check the order page or contact support with the time.',
      toOrder: false,
    };
  }
  if (code === 'PLAN_NOT_OFFERED' || code === 'PROVIDER_LOW_BALANCE') {
    return { message: 'This plan is temporarily unavailable — pick another one.', toOrder: false };
  }
  if (code === 'INSUFFICIENT_WALLET_FUNDS') {
    return { message: 'Insufficient proxy balance — add funds and try again.', toOrder: false };
  }
  if (code === 'TOO_MANY_ATTEMPTS') {
    return { message: 'Too many attempts on this wallet — try again later.', toOrder: false };
  }
  if (code === 'QUOTE_REQUIRED' || api?.status === 428) {
    return { message: 'Checkout is temporarily unavailable — try again later.', toOrder: false };
  }
  if (api?.status === 409 || /duplicate/i.test(api?.message ?? '')) {
    return { message: 'This purchase was already submitted — the order page shows the result.', toOrder: true };
  }
  return { message: 'The purchase could not be completed. Try again, or pick another plan.', toOrder: false };
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

function proxyPath(lang: Lang, suffix = '') {
  return localePath(`/proxy${suffix}`, lang);
}

const DEPOSIT_MIN = 1;
const DEPOSIT_MAX = 500;

export interface ProxyPurchaseProps {
  planRef: string;
  planName: string;
  planType?: string;
  bandwidthGB?: number;
  durationDays?: number;
  price: number;
  locationName: string;
  locationCode: string;
  balance: number;
  hasWallet: boolean;
  csrf: string;
  lang: Lang;
  returnTo: string;
  flash: string | null;
  depositAmount: number;
  depositCapped: boolean;
}

export async function prepareProxyPurchase(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<ProxyPurchaseProps>> {
  noStore(astro);

  const ref = astro.url.searchParams.get('plan') ?? '';
  const decoded = decodeProxyRef(ref);
  if (!decoded) return { kind: 'redirect', response: redirect(proxyPath(lang)) };

  let plan: ProxyPlan | null = null;
  let location: ProxyLocation | null = null;
  try {
    plan = await findProxyPlan(astro.locals, decoded.planId);
    if (plan) location = await findProxyLocation(astro.locals, decoded.locationId);
  } catch {
    setFlash(astro, 'Proxy plans are unavailable right now. Nothing was charged — try again shortly.');
    return { kind: 'redirect', response: redirect(proxyPath(lang)) };
  }
  if (!plan || !location) {
    setFlash(astro, 'That plan or location changed. Pick another one.');
    return { kind: 'redirect', response: redirect(proxyPath(lang)) };
  }

  const token = walletToken(astro);
  // The proxy wallet is its own balance: never show the shared wallet here.
  const balance = token ? await fetchProxyBalance(astro.locals, token).catch(() => 0) : 0;
  const csrf = ensureCsrf(astro);
  rotateClientRef(astro, `proxy:${ref}`, COOKIE.refProxy);

  const returnTo = `${proxyPath(lang, '/purchase')}?plan=${encodeURIComponent(ref)}`;
  const shortfall = Math.max(0, plan.price - balance);
  const depositAmount = Math.min(DEPOSIT_MAX, Math.max(DEPOSIT_MIN, Math.ceil(shortfall * 100) / 100));

  return {
    kind: 'ok',
    props: {
      planRef: ref,
      planName: plan.name,
      planType: plan.type,
      bandwidthGB: plan.gb,
      durationDays: plan.days,
      price: plan.price,
      locationName: location.name,
      locationCode: location.code,
      balance,
      hasWallet: !!token,
      csrf,
      lang,
      returnTo,
      flash: readFlash(astro),
      depositAmount,
      depositCapped: shortfall > DEPOSIT_MAX,
    },
  };
}

export interface ProxyOrderProps {
  order: ProxyOrderState;
  status: string;
  credentials: ProxyCredentials | null;
  credentialsError: boolean;
  credentialsDead: boolean;
  unreachable: boolean;
  csrf: string;
  lang: Lang;
  flash: string | null;
}

export async function prepareProxyOrder(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<ProxyOrderProps>> {
  noStore(astro);

  const order = readProxyOrderState(astro);
  const token = walletToken(astro);
  if (!order || !token) {
    setFlash(astro, 'No proxy order on this device. Buy a plan first.');
    return { kind: 'redirect', response: redirect(proxyPath(lang)) };
  }

  let status = 'UNKNOWN';
  let unreachable = false;
  try {
    const result = await fetchProxyStatus(astro.locals, token, order.orderId);
    status = String(result.status ?? 'UNKNOWN').toUpperCase();
  } catch (error) {
    if (isDeadOrderError(error)) {
      clearProxyOrderState(astro);
      setFlash(astro, 'This order is no longer available on this device. Buy a plan to start again.');
      return { kind: 'redirect', response: redirect(proxyPath(lang)) };
    }
    unreachable = true;
  }

  // EXPIRED clears after the final render; SUSPENDED is terminal but the order
  // stays so support can reference it.
  if (status === 'EXPIRED') clearProxyOrderState(astro);

  let credentials: ProxyCredentials | null = null;
  let credentialsError = false;
  let credentialsDead = false;
  if (status === 'ACTIVE') {
    try {
      credentials = await fetchProxyCredentials(astro.locals, token, order.orderId);
    } catch (error) {
      credentialsError = true;
      // A 4xx means the record is gone/rotated, not a transient outage.
      credentialsDead = error instanceof ApiError && error.status >= 400 && error.status < 500;
    }
  }

  return {
    kind: 'ok',
    props: {
      order,
      status,
      credentials,
      credentialsError,
      credentialsDead,
      unreachable,
      csrf: ensureCsrf(astro),
      lang,
      flash: readFlash(astro),
    },
  };
}
