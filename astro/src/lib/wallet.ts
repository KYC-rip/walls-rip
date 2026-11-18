import type { AstroCookies } from 'astro';
import { apiGet, apiPost, ApiError } from './api';
import type { Lang } from './i18n';

/**
 * No-JS wallet and payment state.
 *
 * Everything lives in HttpOnly, SameSite=Strict cookies. The wallet token is
 * the capability; it never appears in a URL, never in the HTML and never in a
 * log line. POSTs additionally carry a double-submit CSRF token.
 */

export const COOKIE = {
  wallet: 'wr_wallet',
  csrf: 'wr_csrf',
  pay: 'wr_pay',
  order: 'wr_order',
  ref: 'wr_ref',
  /** SMS orders and their idempotency ref live apart from the eSIM ones. */
  sms: 'wr_sms',
  refSms: 'wr_ref_sms',
  /** Phone purchases keep their own idempotency ref (never clobber eSIM/SMS). */
  refPhone: 'wr_ref_phone',
  /** VPN order (config download) and its idempotency ref. */
  vpn: 'wr_vpn',
  refVpn: 'wr_ref_vpn',
  /** UK number order (delivery + renewals) and its idempotency ref. */
  uk: 'wr_uk',
  refUk: 'wr_ref_uk',
  flash: 'wr_flash',
} as const;

const DAY = 60 * 60 * 24;

export interface CookieContext {
  cookies: AstroCookies;
  url: URL;
}

function cookieOptions(ctx: CookieContext, maxAge: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: ctx.url.protocol === 'https:',
    maxAge,
  };
}

function readJson<T>(ctx: CookieContext, name: string): T | null {
  const raw = ctx.cookies.get(name)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(ctx: CookieContext, name: string, value: unknown, maxAge: number) {
  ctx.cookies.set(name, JSON.stringify(value), cookieOptions(ctx, maxAge));
}

/* ── CSRF ───────────────────────────────────────────────────────────── */

function randomToken(bytes = 24): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return [...array].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Return the existing double-submit token, minting one on first use. */
export function ensureCsrf(ctx: CookieContext): string {
  const existing = ctx.cookies.get(COOKIE.csrf)?.value;
  if (existing && /^[a-f0-9]{32,64}$/.test(existing)) return existing;
  const token = randomToken();
  ctx.cookies.set(COOKIE.csrf, token, cookieOptions(ctx, 12 * 60 * 60));
  return token;
}

/** Constant-time comparison of the submitted token with the cookie. */
export function checkCsrf(ctx: CookieContext, submitted: FormDataEntryValue | null): boolean {
  const expected = ctx.cookies.get(COOKIE.csrf)?.value ?? '';
  const given = typeof submitted === 'string' ? submitted : '';
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
}

/* ── Wallet token ───────────────────────────────────────────────────── */

/** Shape check only — a token still has to be accepted by the API. */
export function isWalletToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export function walletToken(ctx: CookieContext): string | null {
  const token = ctx.cookies.get(COOKIE.wallet)?.value;
  return token && isWalletToken(token) ? token : null;
}

export function setWalletToken(ctx: CookieContext, token: string) {
  if (!isWalletToken(token)) return;
  ctx.cookies.set(COOKIE.wallet, token, cookieOptions(ctx, 90 * DAY));
}

/* ── Flash message (one redirect) ───────────────────────────────────── */

export function setFlash(ctx: CookieContext, message: string) {
  ctx.cookies.set(COOKIE.flash, message.slice(0, 300), cookieOptions(ctx, 60));
}

export function readFlash(ctx: CookieContext): string | null {
  const value = ctx.cookies.get(COOKIE.flash)?.value ?? null;
  if (value) ctx.cookies.delete(COOKIE.flash, { path: '/' });
  return value;
}

/* ── Return-path safety ─────────────────────────────────────────────── */

export function safeReturn(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value.slice(0, 300);
}

export function localeFrom(value: FormDataEntryValue | null): Lang {
  const langs = ['en', 'es', 'ja', 'pt', 'ru', 'zh-TW', 'zh'];
  return typeof value === 'string' && langs.includes(value) ? (value as Lang) : 'en';
}

/* ── Deposit state ──────────────────────────────────────────────────── */

export type DepositService = 'esim' | 'sms';

export interface PayState {
  paymentId: string;
  method: 'XMR' | 'LN';
  address: string;
  amount: number;
  usd: number;
  returnTo: string;
  createdAt: number;
  /** Which deposit endpoint minted this payment; the status check must match. */
  svc?: DepositService;
}

export function setPayState(ctx: CookieContext, state: PayState) {
  writeJson(ctx, COOKIE.pay, state, 2 * 60 * 60);
}

export function readPayState(ctx: CookieContext): PayState | null {
  return readJson<PayState>(ctx, COOKIE.pay);
}

/**
 * A double-submitted deposit form must not mint a second invoice: the first
 * QR would be orphaned and any funds sent to it would be invisible. Reusing
 * the live payment for the same amount and method is safe; anything older
 * than 30 minutes or already resolved falls through to a fresh payment.
 */
export function shouldReuseDeposit(
  existing: PayState | null,
  amount: number,
  method: 'XMR' | 'LN',
  now = Date.now(),
): boolean {
  if (!existing) return false;
  if (existing.method !== method) return false;
  if (Math.abs(existing.usd - amount) > 0.001) return false;
  return now - existing.createdAt < 30 * 60_000;
}

export function clearPayState(ctx: CookieContext) {
  ctx.cookies.delete(COOKIE.pay, { path: '/' });
}

/* ── Last order ─────────────────────────────────────────────────────── */

export interface OrderState {
  orderId: string;
  name: string;
  country: string;
  price: number;
  qrCode?: string;
  activationUrl?: string;
  at: number;
}

export function setOrderState(ctx: CookieContext, state: OrderState) {
  writeJson(ctx, COOKIE.order, state, 30 * DAY);
}

export function readOrderState(ctx: CookieContext): OrderState | null {
  return readJson<OrderState>(ctx, COOKIE.order);
}

/* ── Last SMS order ─────────────────────────────────────────────────── */

export interface SmsOrderState {
  orderId: string;
  service: string;
  country: string;
  number?: string;
  charged: number;
  at: number;
}

export function setSmsOrderState(ctx: CookieContext, state: SmsOrderState) {
  // The API keeps the hot order record for 7 days; a longer cookie would only
  // promise status the API can no longer serve.
  writeJson(ctx, COOKIE.sms, state, 7 * DAY);
}

export function readSmsOrderState(ctx: CookieContext): SmsOrderState | null {
  const state = readJson<SmsOrderState>(ctx, COOKIE.sms);
  return state && typeof state.orderId === 'string' && state.orderId ? state : null;
}

export function clearSmsOrderState(ctx: CookieContext) {
  ctx.cookies.delete(COOKIE.sms, { path: '/' });
}

/* ── Last VPN order ─────────────────────────────────────────────────── */

export interface VpnOrderState {
  orderId: string;
  name: string;
  charged: number;
  at: number;
}

export function setVpnOrderState(ctx: CookieContext, state: VpnOrderState) {
  // The config stays fetchable as long as the order exists at the provider;
  // 7 days matches the other order cookies and the API's hot records.
  writeJson(ctx, COOKIE.vpn, state, 7 * DAY);
}

export function readVpnOrderState(ctx: CookieContext): VpnOrderState | null {
  const state = readJson<VpnOrderState>(ctx, COOKIE.vpn);
  return state && typeof state.orderId === 'string' && state.orderId ? state : null;
}

export function clearVpnOrderState(ctx: CookieContext) {
  ctx.cookies.delete(COOKIE.vpn, { path: '/' });
}

/* ── Last UK number order ───────────────────────────────────────────── */

export interface UkOrderState {
  orderId: string;
  name: string;
  charged: number;
  /** Entered on renewal; prefilled next time. */
  phone?: string;
  /** New end date after a renewal (API `activeUntil`). */
  activeUntil?: string;
  at: number;
}

export function setUkOrderState(ctx: CookieContext, state: UkOrderState) {
  writeJson(ctx, COOKIE.uk, state, 7 * DAY);
}

export function readUkOrderState(ctx: CookieContext): UkOrderState | null {
  const state = readJson<UkOrderState>(ctx, COOKIE.uk);
  return state && typeof state.orderId === 'string' && state.orderId ? state : null;
}

export function clearUkOrderState(ctx: CookieContext) {
  ctx.cookies.delete(COOKIE.uk, { path: '/' });
}

/* ── Idempotency reference ──────────────────────────────────────────── */

/**
 * One clientRef per (plan, checkout). A retry after a timeout reuses it, so
 * the API's dedup cannot create a second provider order; a different plan
 * gets a fresh reference.
 */
interface RefState {
  planId: string;
  ref: string;
  /** Set when a purchase with this ref was submitted successfully. */
  soldAt?: number;
}

/**
 * How long a sold ref stays in the cookie. A browser replay of the purchase
 * form (back button, "confirm resubmission", double Enter) then hits the API's
 * clientRef dedup and is refused, instead of buying a second number.
 */
const SOLD_REF_TTL = 10 * 60_000;

export function clearClientRef(ctx: CookieContext, cookie: string = COOKIE.ref) {
  ctx.cookies.delete(cookie, { path: '/' });
}

/**
 * One ref per (product, route) pair. eSIM and SMS use separate cookies: a
 * shared one meant opening an SMS checkout page quietly replaced a pending
 * eSIM retry ref, so the retry created a second provider order.
 */
export function clientRefFor(
  ctx: CookieContext,
  planId: string,
  cookie: string = COOKIE.ref,
): string {
  const existing = readJson<RefState>(ctx, cookie);
  if (existing && existing.planId === planId && /^[a-f0-9-]{16,64}$/i.test(existing.ref)) {
    const sold = typeof existing.soldAt === 'number';
    if (!sold || Date.now() - existing.soldAt! < SOLD_REF_TTL) return existing.ref;
  }
  const ref = crypto.randomUUID();
  writeJson(ctx, cookie, { planId, ref }, DAY);
  return ref;
}

/** Mint a brand-new ref, keeping the previous one for replay detection. */
export function rotateClientRef(
  ctx: CookieContext,
  planId: string,
  cookie: string = COOKIE.ref,
): string {
  const ref = crypto.randomUUID();
  writeJson(ctx, cookie, { planId, ref }, DAY);
  return ref;
}

/**
 * Mark the ref as used. The ref stays for SOLD_REF_TTL so a resubmitted form
 * reuses it; the API then answers 409 instead of creating a second order.
 */
export function markClientRefSold(ctx: CookieContext, cookie: string = COOKIE.ref) {
  const existing = readJson<RefState>(ctx, cookie);
  if (!existing?.ref) return;
  writeJson(ctx, cookie, { ...existing, soldAt: Date.now() }, DAY);
}

/* ── API calls ──────────────────────────────────────────────────────── */

export interface DepositResult {
  method: 'XMR' | 'LN';
  address: string;
  paymentId: string;
  amount: number;
  usd: number;
  walletToken?: string;
}

/**
 * Deposits credit one shared wallet, but each product posts to its own create
 * endpoint so the deposit stats are attributed honestly (`service` in the API's
 * deposit log) and its limits apply.
 */
export async function createDeposit(
  locals: unknown,
  input: {
    amount: number;
    method: 'XMR' | 'LN';
    walletToken: string | null;
    svc?: DepositService;
  },
): Promise<DepositResult> {
  const svc: DepositService = input.svc === 'sms' ? 'sms' : 'esim';
  const result = await apiPost<DepositResult>(locals, `/v1/tools/${svc}/payment/create`, {
    amount: input.amount,
    method: input.method,
    ...(input.walletToken ? { walletToken: input.walletToken } : {}),
  });
  if (!result?.address || !result?.paymentId) throw new ApiError(502, 'Deposit could not be created');
  return result;
}

export async function paymentStatus(
  locals: unknown,
  paymentId: string,
  svc: DepositService = 'esim',
): Promise<'COMPLETED' | 'PENDING' | 'EXPIRED'> {
  try {
    const data = await apiGet<{ status?: string }>(
      locals,
      `/v1/tools/${svc === 'sms' ? 'sms' : 'esim'}/payment/check?paymentId=${encodeURIComponent(paymentId)}`,
      // 2s coalesces simultaneous tabs/refreshes without hiding a real change.
      { ttlMs: 2000 },
    );
    return data.status === 'COMPLETED' ? 'COMPLETED' : data.status === 'EXPIRED' ? 'EXPIRED' : 'PENDING';
  } catch {
    return 'PENDING';
  }
}

export async function walletBalance(locals: unknown, token: string): Promise<number> {
  try {
    const data = await apiGet<{ balanceUSD?: number }>(
      locals,
      `/v1/tools/esim/balance?token=${encodeURIComponent(token)}`,
      { ttlMs: 2000 },
    );
    return typeof data.balanceUSD === 'number' ? data.balanceUSD : 0;
  } catch {
    return 0;
  }
}

/**
 * Validate a pasted wallet token. Unlike `walletBalance`, a rejected token
 * throws instead of reporting 0 — the import flow must tell a $0 wallet apart
 * from a token the API refuses.
 */
export async function walletBalanceStrict(locals: unknown, token: string): Promise<number> {
  const data = await apiGet<{ balanceUSD?: number }>(
    locals,
    `/v1/tools/esim/balance?token=${encodeURIComponent(token)}`,
    { fresh: true },
  );
  return typeof data.balanceUSD === 'number' ? data.balanceUSD : 0;
}
