import type { AstroGlobal } from 'astro';
import { ApiError, apiGet } from './api';
import { fetchUkNumberPlans, type ConnectivityPlan } from './catalogue';
import { decodePlanRef, encodePlanRef } from './checkout';
import { localePath, type Lang } from './i18n';
import { isDeadOrderError } from './order-errors';
import {
  COOKIE,
  clearUkOrderState,
  ensureCsrf,
  readFlash,
  readUkOrderState,
  rotateClientRef,
  setFlash,
  walletBalance,
  walletToken,
  type UkOrderState,
} from './wallet';

/**
 * No-JS UK number purchase and renewals.
 *
 * Same template as VPN: the browser names an opaque plan reference, every
 * price/period is re-resolved from the live catalogue, the connectivity
 * endpoints authenticate with `Authorization: Bearer`, and the order id lives
 * only in `wr_uk`. The eSIM delivery (QR, activation string/code, SM-DP+
 * address, PUK) is rendered server-side on no-store pages.
 *
 * The assigned number is NOT returned by the API: the renewal form asks the
 * customer for it (prefilled from the last renewal) and the copy asks them to
 * confirm it — a wrong number would extend another line.
 */

export const UK_PLAN_REF = { encode: encodePlanRef, decode: decodePlanRef };

export interface UkDelivery {
  status: string;
  qrCode?: string;
  activationUrl?: string;
  smdpAddress?: string;
  activationCode?: string;
  pukCode?: string;
}

export async function findUkPlan(locals: unknown, planId: string): Promise<ConnectivityPlan | null> {
  const plans = await fetchUkNumberPlans(locals, { fresh: true });
  const plan = plans.find((entry) => entry.id === planId);
  return plan && plan.available && plan.price > 0 ? plan : null;
}

export async function fetchUkStatus(
  locals: unknown,
  token: string,
  orderId: string,
): Promise<UkDelivery> {
  return apiGet<UkDelivery>(
    locals,
    `/v1/tools/phone/rentals/status?order_id=${encodeURIComponent(orderId)}`,
    { token, fresh: true, timeoutMs: 8000 },
  );
}

export interface UkRenewalPlan {
  periods: number;
  days: number;
  price: number;
}

export async function fetchUkRenewalPlans(
  locals: unknown,
  token: string,
  orderId: string,
): Promise<UkRenewalPlan[]> {
  const data = await apiGet<{ available?: boolean; plans?: unknown[] }>(
    locals,
    `/v1/tools/phone/rentals/renewal-plans?order_id=${encodeURIComponent(orderId)}`,
    { token, fresh: true, timeoutMs: 8000 },
  );
  return (Array.isArray(data.plans) ? data.plans : [])
    .map((entry): UkRenewalPlan | null => {
      const plan = entry as Record<string, unknown>;
      const periods = typeof plan.periods === 'number' ? plan.periods : Number.NaN;
      const days = typeof plan.days === 'number' ? plan.days : 0;
      const price = typeof plan.price === 'number' ? plan.price : 0;
      if (![1, 2, 4].includes(periods) || price <= 0) return null;
      return { periods, days, price };
    })
    .filter((plan): plan is UkRenewalPlan => plan !== null)
    .sort((a, b) => a.periods - b.periods);
}

/** The API's own regex for a UK mobile number. */
export function validUkPhone(value: string): boolean {
  return /^\+447\d{9}$/.test(value);
}

/** Customer-facing text for a failed purchase or renewal, keyed on codes. */
export function ukError(
  error: unknown,
  options: { heldToOrder?: boolean } = {},
): { message: string; toOrder: boolean } {
  const api = error instanceof ApiError ? error : null;
  const code = api?.code;
  if (code === 'PURCHASE_HELD') {
    return {
      message:
        'The provider did not confirm. Your funds are held for review — do not pay again; check the order page or contact support with the time.',
      toOrder: options.heldToOrder === true,
    };
  }
  if (code === 'INSUFFICIENT_WALLET_FUNDS') {
    return { message: 'Insufficient wallet balance — add funds and try again.', toOrder: false };
  }
  if (code === 'TOO_MANY_ATTEMPTS') {
    return { message: 'Too many attempts on this wallet — try again later.', toOrder: false };
  }
  if (code === 'PROVIDER_REFUSED') {
    return { message: 'The provider refused the request. Your balance was returned.', toOrder: false };
  }
  if (code === 'QUOTE_REQUIRED' || api?.status === 428) {
    return { message: 'Checkout is temporarily unavailable — try again later.', toOrder: false };
  }
  if (api?.status === 409 || /duplicate/i.test(api?.message ?? '')) {
    return { message: 'This request was already submitted — the order page shows the result.', toOrder: true };
  }
  if (api?.status === 503) {
    return { message: 'UK numbers are not on sale right now — try again later.', toOrder: false };
  }
  return { message: 'The request could not be completed. Try again in a moment.', toOrder: false };
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

function ukPath(lang: Lang, suffix = '') {
  return localePath(`/uk-sim${suffix}`, lang);
}

const DEPOSIT_CAP = 200;

export interface UkPurchaseProps {
  planRef: string;
  planName: string;
  months?: number;
  price: number;
  balance: number;
  hasWallet: boolean;
  csrf: string;
  lang: Lang;
  returnTo: string;
  flash: string | null;
  depositAmount: number;
  depositCapped: boolean;
}

export async function prepareUkPurchase(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<UkPurchaseProps>> {
  noStore(astro);

  const ref = astro.url.searchParams.get('plan') ?? '';
  const planId = decodePlanRef(ref);
  if (!planId) return { kind: 'redirect', response: redirect(ukPath(lang)) };

  let plan: ConnectivityPlan | null = null;
  try {
    plan = await findUkPlan(astro.locals, planId);
  } catch {
    setFlash(astro, 'UK number plans are unavailable right now. Nothing was charged — try again shortly.');
    return { kind: 'redirect', response: redirect(ukPath(lang)) };
  }
  if (!plan) {
    setFlash(astro, 'That plan changed or sold out. Pick another one.');
    return { kind: 'redirect', response: redirect(ukPath(lang)) };
  }

  const token = walletToken(astro);
  const balance = token ? await walletBalance(astro.locals, token) : 0;
  const csrf = ensureCsrf(astro);
  rotateClientRef(astro, `uk:${ref}`, COOKIE.refUk);

  const returnTo = `${ukPath(lang, '/purchase')}?plan=${encodeURIComponent(ref)}`;
  const shortfall = Math.max(0, plan.price - balance);
  const depositAmount = Math.min(DEPOSIT_CAP, Math.max(0.5, Math.ceil(shortfall * 100) / 100));

  return {
    kind: 'ok',
    props: {
      planRef: ref,
      planName: plan.name,
      months: plan.months,
      price: plan.price,
      balance,
      hasWallet: !!token,
      csrf,
      lang,
      returnTo,
      flash: readFlash(astro),
      depositAmount,
      depositCapped: shortfall > DEPOSIT_CAP,
    },
  };
}

export interface UkOrderProps {
  order: UkOrderState;
  delivery: UkDelivery | null;
  status: string;
  renewalPlans: UkRenewalPlan[];
  renewalError: boolean;
  unreachable: boolean;
  csrf: string;
  lang: Lang;
  flash: string | null;
}

export async function prepareUkOrder(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<UkOrderProps>> {
  noStore(astro);

  const order = readUkOrderState(astro);
  const token = walletToken(astro);
  if (!order || !token) {
    setFlash(astro, 'No UK number order on this device. Buy a plan first.');
    return { kind: 'redirect', response: redirect(ukPath(lang)) };
  }

  let delivery: UkDelivery | null = null;
  let unreachable = false;
  try {
    delivery = await fetchUkStatus(astro.locals, token, order.orderId);
  } catch (error) {
    if (isDeadOrderError(error)) {
      clearUkOrderState(astro);
      setFlash(astro, 'This order is no longer available on this device. Buy a plan to start again.');
      return { kind: 'redirect', response: redirect(ukPath(lang)) };
    }
    unreachable = true;
  }

  if (delivery?.status === 'EXPIRED') clearUkOrderState(astro);

  let renewalPlans: UkRenewalPlan[] = [];
  let renewalError = false;
  if (delivery?.status === 'ACTIVE') {
    try {
      renewalPlans = await fetchUkRenewalPlans(astro.locals, token, order.orderId);
    } catch {
      renewalError = true;
    }
  }

  return {
    kind: 'ok',
    props: {
      order,
      delivery,
      status: delivery?.status ?? 'UNKNOWN',
      renewalPlans,
      renewalError,
      unreachable,
      csrf: ensureCsrf(astro),
      lang,
      flash: readFlash(astro),
    },
  };
}
