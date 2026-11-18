import type { AstroGlobal } from 'astro';
import { fetchPhonePlans, type PhonePlan } from './catalogue';
import {
  activationBounds,
  buyPlan,
  validActivationDate,
  type BuyablePlan,
  type PurchaseResult,
} from './checkout';
import { localePath, type Lang } from './i18n';
import {
  COOKIE,
  ensureCsrf,
  readFlash,
  rotateClientRef,
  setFlash,
  walletBalance,
  walletToken,
} from './wallet';

/**
 * No-JS phone purchase (PikaSim voice/SMS/data plans).
 *
 * Phone plans are a separate product (`type=phone`) but share the eSIM
 * lifecycle: the API's `/v1/tools/esim/purchase|status|profile` endpoints.
 * The browser only names an opaque `engine|country|planId` ref; engine, plan
 * id, country and price are re-resolved from the live catalogue on every
 * purchase.
 */

const FIELD_SEP = '|';

export interface PhoneRef {
  engine: string;
  country: string;
  planId: string;
}

export function encodePhoneRef(ref: PhoneRef): string {
  const raw = [ref.engine, ref.country, ref.planId].join(FIELD_SEP);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Selector, not a security boundary: the plan is always re-resolved. */
export function decodePhoneRef(ref: string): PhoneRef | null {
  if (!ref || ref.length > 300) return null;
  try {
    const base = ref.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base + '='.repeat((4 - (base.length % 4)) % 4);
    const raw = atob(padded);
    const [engine, country, planId] = raw.split(FIELD_SEP);
    if (!engine || engine.length > 40) return null;
    if (!/^[A-Z]{2}$/.test(country ?? '')) return null;
    if (!planId || planId.length > 120) return null;
    return { engine, country, planId };
  } catch {
    return null;
  }
}

/** Re-resolve against the live phone catalogue (fresh, no isolate cache). */
export async function findPhonePlan(locals: unknown, ref: PhoneRef): Promise<PhonePlan | null> {
  const plans = await fetchPhonePlans(locals, ref.country, { fresh: true });
  const plan = plans.find((entry) => entry.engine === ref.engine && entry.id === ref.planId);
  return plan && plan.price > 0 ? plan : null;
}

/** The purchase API only needs the lifecycle fields. */
export function toBuyable(plan: PhonePlan): BuyablePlan {
  return {
    id: plan.id,
    name: plan.name,
    country: plan.country,
    dataGB: plan.dataGB,
    durationDays: plan.durationDays,
    price: plan.price,
    engine: plan.engine,
    nonRefundable: plan.nonRefundable,
    requiresActivationDate: plan.requiresActivationDate,
  };
}

export { buyPlan, validActivationDate };
export type { PurchaseResult };

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

function phonePath(lang: Lang, suffix = '') {
  return localePath(`/phone${suffix}`, lang);
}

export interface PhonePurchaseProps {
  country: string;
  planRef: string;
  planName: string;
  dataGB: number;
  durationDays: number;
  price: number;
  hasVoice: boolean;
  hasSms: boolean;
  voiceMinutes?: number;
  smsCount?: number;
  nonRefundable: boolean;
  requiresActivationDate: boolean;
  activationMin?: string;
  activationMax?: string;
  balance: number;
  hasWallet: boolean;
  csrf: string;
  lang: Lang;
  returnTo: string;
  flash: string | null;
  depositAmount: number;
  /** True when the shortfall exceeds the per-deposit cap ($200). */
  depositCapped: boolean;
}

const DEPOSIT_CAP = 200;

export async function preparePhonePurchase(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<PhonePurchaseProps>> {
  noStore(astro);

  const country = (astro.url.searchParams.get('c') ?? '').toUpperCase();
  const ref = astro.url.searchParams.get('plan') ?? '';
  const decoded = decodePhoneRef(ref);
  if (!decoded || decoded.country !== country) {
    return { kind: 'redirect', response: redirect(phonePath(lang)) };
  }

  const listPath = `${phonePath(lang)}?country=${encodeURIComponent(country)}`;

  let plan: PhonePlan | null = null;
  try {
    plan = await findPhonePlan(astro.locals, decoded);
  } catch {
    setFlash(astro, 'Phone plans are unavailable right now. Nothing was charged — try again shortly.');
    return { kind: 'redirect', response: redirect(listPath) };
  }
  if (!plan) {
    // Never bounce back to this same URL: a vanished plan would loop.
    setFlash(astro, 'That plan changed or sold out. Pick another one.');
    return { kind: 'redirect', response: redirect(listPath) };
  }

  const token = walletToken(astro);
  const balance = token ? await walletBalance(astro.locals, token) : 0;
  const csrf = ensureCsrf(astro);
  // A fresh page view is a fresh purchase intent (see the SMS flow).
  rotateClientRef(astro, `phone:${ref}`, COOKIE.refPhone);

  const returnTo = `${phonePath(lang, '/purchase')}?c=${encodeURIComponent(country)}&plan=${encodeURIComponent(ref)}`;
  const shortfall = Math.max(0, plan.price - balance);
  const depositAmount = Math.min(DEPOSIT_CAP, Math.max(0.5, Math.ceil(shortfall * 100) / 100));
  // The API emits no per-plan activation bounds; Astro's 2–60 default sits
  // inside the API's hard 1–61 window.
  const bounds = plan.requiresActivationDate ? activationBounds({}) : null;

  return {
    kind: 'ok',
    props: {
      country,
      planRef: ref,
      planName: plan.name,
      dataGB: plan.dataGB,
      durationDays: plan.durationDays,
      price: plan.price,
      hasVoice: plan.hasVoice === true,
      hasSms: plan.hasSms === true,
      voiceMinutes: plan.voiceMinutes,
      smsCount: plan.smsCount,
      nonRefundable: plan.nonRefundable === true,
      requiresActivationDate: plan.requiresActivationDate === true,
      activationMin: bounds?.min,
      activationMax: bounds?.max,
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
