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

export function walletToken(ctx: CookieContext): string | null {
  const token = ctx.cookies.get(COOKIE.wallet)?.value;
  return token && /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : null;
}

export function setWalletToken(ctx: CookieContext, token: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return;
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

export interface PayState {
  paymentId: string;
  method: 'XMR' | 'LN';
  address: string;
  amount: number;
  usd: number;
  returnTo: string;
  createdAt: number;
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

/* ── Idempotency reference ──────────────────────────────────────────── */

/**
 * One clientRef per (plan, checkout). A retry after a timeout reuses it, so
 * the API's dedup cannot create a second provider order; a different plan
 * gets a fresh reference.
 */
export function clearClientRef(ctx: CookieContext) {
  ctx.cookies.delete(COOKIE.ref, { path: '/' });
}

export function clientRefFor(ctx: CookieContext, planId: string): string {
  const existing = readJson<{ planId: string; ref: string }>(ctx, COOKIE.ref);
  if (existing && existing.planId === planId && /^[a-f0-9-]{16,64}$/i.test(existing.ref)) {
    return existing.ref;
  }
  const ref = crypto.randomUUID();
  writeJson(ctx, COOKIE.ref, { planId, ref }, DAY);
  return ref;
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

export async function createDeposit(
  locals: unknown,
  input: { amount: number; method: 'XMR' | 'LN'; walletToken: string | null },
): Promise<DepositResult> {
  const result = await apiPost<DepositResult>(locals, '/v1/tools/esim/payment/create', {
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
): Promise<'COMPLETED' | 'PENDING' | 'EXPIRED'> {
  try {
    const data = await apiGet<{ status?: string }>(
      locals,
      `/v1/tools/esim/payment/check?paymentId=${encodeURIComponent(paymentId)}`,
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
