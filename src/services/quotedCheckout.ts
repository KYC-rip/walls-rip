import { APIError } from './client';
import { confirmQuote, type ConfirmedQuote } from '../components/QuoteConfirmation';

type Inputs = Record<string, string | number>;
type Requester = <T>(endpoint: string, config?: { method?: string; body?: unknown; headers?: Record<string, string>; timeout?: number }) => Promise<T>;
const products: Record<string, string> = {
  '/v1/tools/sms/purchase': 'sms', '/v1/tools/sms/rentals/order': 'rental', '/v1/tools/esim/purchase': 'data',
  '/v1/tools/esim/topup/purchase': 'topup', '/v1/tools/phone/rentals/purchase': 'phone',
  '/v1/tools/phone/rentals/renew': 'renewal', '/v1/tools/vpn/purchase': 'vpn', '/v1/tools/proxy/purchase': 'proxy',
};
type Attempt = { quoteId: string; clientRef: string };
const attempts = new Map<string, Attempt>();
function savedAttempt(key: string): Attempt | undefined {
  if (attempts.has(key)) return attempts.get(key);
  try {
    const raw = localStorage.getItem(`walls:attempt:${key}`);
    const value = raw ? JSON.parse(raw) : null;
    if (typeof value?.quoteId === 'string' && typeof value.clientRef === 'string') return value;
  } catch { /* Storage can be unavailable in a private browser. */ }
}
function rememberAttempt(key: string, value?: Attempt) {
  if (value) attempts.set(key, value); else attempts.delete(key);
  try {
    if (value) localStorage.setItem(`walls:attempt:${key}`, JSON.stringify(value));
    else localStorage.removeItem(`walls:attempt:${key}`);
  } catch { /* In-memory deduplication still protects the current tab. */ }
}
export async function quotedCheckout<T>(endpoint: string, body: unknown, headers: Record<string, string> | undefined, request: Requester): Promise<{ handled: boolean; value?: T }> {
  const product = products[endpoint];
  if (!product || !body || typeof body !== 'object') return { handled: false };
  // A missing/failing probe must never break the legacy purchase paths: if the
  // walls API is not deployed yet (or the probe errors), fall back to legacy.
  const config = await request<{ enabled: boolean; enforceQuotes: boolean; products?: Record<string, boolean>;
    providerProducts?: Record<string, Record<string, boolean>> }>('/v1/tools/walls/config')
    .catch((): { enabled: boolean; enforceQuotes: boolean; products?: Record<string, boolean>;
      providerProducts?: Record<string, Record<string, boolean>> } => ({ enabled: false, enforceQuotes: false }));
  if (!config.enabled) return { handled: false };
  if (config.products?.[product] !== true) return { handled: false };
  const b = body as Record<string, unknown>;
  const token = String(b.token || headers?.Authorization?.replace(/^Bearer /, '') || '');
  if (!token) throw new APIError('Fund or restore your wallet first.', 401);
  const text = (key: string) => String(b[key] ?? '');
  let provider = text('engine') || (text('planId').includes(':') ? text('planId').split(':')[0] : ['phone', 'vpn', 'renewal'].includes(product) ? 'buyukesim' : '');
  const inputs: Inputs = product === 'sms' ? { country: text('country'), service: text('service'), pool: text('pool'), planId: text('service') }
    : product === 'rental' ? { country: text('country'), service: text('service'), days: Number(b.days || 0), planId: text('service') }
    : product === 'renewal' ? { planId: text('periods'), parentId: text('orderId'), phone: text('phone') }
    : product === 'topup' ? { planId: text('plan'), parentId: String(b.orderId || b.order_id || '') }
    : { planId: text('planId'), country: text('country'), ...(product === 'proxy' ? { location: text('location'), duration: Number(b.duration || 0) } : {}) };
  const auth = { Authorization: `Bearer ${token}` };
  if (!provider && inputs.parentId?.toString().startsWith('WO-')) provider = (await request<{ provider: string }>(`/v1/tools/walls/orders/${inputs.parentId}`, { headers: auth })).provider;
  if (!provider) throw new APIError('Select a provider before requesting a quote.', 400);
  if (!config.enforceQuotes && config.providerProducts?.[provider]?.[product] !== true) return { handled: false };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${token}:${endpoint}:${JSON.stringify(inputs)}`));
  const key = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  let attempt = savedAttempt(key);
  if (!attempt) {
    const quote = await request<ConfirmedQuote>('/v1/tools/walls/quotes', { body: { provider, product, inputs }, headers: auth, timeout: 45000 });
    if (!await confirmQuote(quote)) {
      void request(`/v1/tools/walls/quotes/${quote.quoteId}`, { method: 'DELETE', headers: auth }).catch(() => {});
      throw new APIError('Purchase cancelled. No funds were spent.', 409, { code: 'QUOTE_CANCELLED' });
    }
    attempt = { quoteId: quote.quoteId, clientRef: crypto.randomUUID() };
    rememberAttempt(key, attempt);
  }
  try {
    const result = await request<T & { phase?: string; code?: string }>('/v1/tools/walls/purchases', {
      body: { ...attempt, inputs }, headers: auth, timeout: 60000,
    });
    if (result.phase === 'unknown') throw new APIError('Your purchase is under review. Please do not buy again.', 502, { code: 'PURCHASE_HELD' });
    rememberAttempt(key);
    return { handled: true, value: result };
  } catch (e) {
    if (e instanceof APIError && e.status < 500 && e.status !== 0) rememberAttempt(key);
    throw e;
  }
}
