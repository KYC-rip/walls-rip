import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api';
import {
  decodeProxyRef,
  encodeProxyRef,
  fetchProxyBalance,
  findProxyPlan,
  proxyError,
} from '../src/lib/proxy-checkout';
import { createDeposit, depositLimits, paymentStatus, setProxyOrderState, readProxyOrderState, setWalletToken, walletToken } from '../src/lib/wallet';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown, status = 200) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

const REF = { planId: 'plan-1gb', locationId: 'loc-th' };

describe('proxy refs', () => {
  it('round-trips plan and location ids', () => {
    expect(decodeProxyRef(encodeProxyRef(REF))).toEqual(REF);
  });

  it('rejects malformed refs', () => {
    expect(decodeProxyRef('')).toBeNull();
    expect(decodeProxyRef(btoa('only-one-field'))).toBeNull();
    expect(decodeProxyRef(btoa('plan|'))).toBeNull();
  });
});

describe('proxy resolution', () => {
  it('re-resolves the price and type from the live catalogue', async () => {
    stubFetch([
      { id: 'plan-1gb', name: '1 GB / 31 days', type: 'residential', bandwidthGB: 1, durationDays: 31, price: 6, currency: 'USD' },
    ]);
    const plan = await findProxyPlan({}, 'plan-1gb');
    expect(plan?.price).toBe(6);
    expect(plan?.type).toBe('residential');
    expect(plan?.gb).toBe(1);
  });

  it('returns null for a missing plan', async () => {
    stubFetch([{ id: 'other', name: 'x', price: 3, currency: 'USD' }]);
    expect(await findProxyPlan({}, 'plan-1gb')).toBeNull();
  });
});

describe('proxy balance', () => {
  it('reads the proxy wallet, not the shared one', async () => {
    const fn = stubFetch({ balanceUSD: 12.5 });
    expect(await fetchProxyBalance({}, 'a'.repeat(64))).toBe(12.5);
    const url = String((fn.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain('/v1/tools/proxy/balance?token=');
  });
});

describe('proxy deposit plumbing', () => {
  it('uses the proxy payment endpoints and returns the minted token', async () => {
    const fn = stubFetch({ address: 'addr', paymentId: 'pid', walletToken: 'wallet-token-64chars-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    const result = await createDeposit({}, { amount: 10, method: 'XMR', walletToken: null, svc: 'proxy' });
    expect(result.walletToken).toBe('wallet-token-64chars-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const url = String((fn.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain('/v1/tools/proxy/payment/create');
  });

  it('polls the proxy check endpoint for svc=proxy', async () => {
    const fn = stubFetch({ status: 'COMPLETED' });
    expect(await paymentStatus({}, 'pid', 'proxy')).toBe('COMPLETED');
    const url = String((fn.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain('/v1/tools/proxy/payment/check');
  });

  it('clamps per product', () => {
    expect(depositLimits('proxy')).toEqual({ minUsd: 1, maxUsd: 500 });
    expect(depositLimits('sms')).toEqual({ minUsd: 0.5, maxUsd: 100 });
    expect(depositLimits('esim')).toEqual({ minUsd: 0.5, maxUsd: 200 });
  });

  it('keeps the deposit token coherent with the cookie the purchase page reads', async () => {
    stubFetch({ address: 'addr', paymentId: 'pid', walletToken: 'a'.repeat(64) });
    const result = await createDeposit({}, { amount: 10, method: 'XMR', walletToken: null, svc: 'proxy' });
    const ctx = {
      url: new URL('https://walls.rip/proxy/purchase'),
      cookies: {
        get: () => undefined,
        set: () => {},
        delete: () => {},
      },
    } as unknown as Parameters<typeof setWalletToken>[0];
    const jar = new Map<string, string>();
    (ctx as unknown as { cookies: { get: (n: string) => { value: string } | undefined; set: (n: string, v: string) => void; delete: (n: string) => void } }).cookies = {
      get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
    };
    setWalletToken(ctx, result.walletToken!);
    expect(walletToken(ctx)).toBe(result.walletToken);
  });
});

describe('proxy order state', () => {
  it('stores only our fields (no engine leaks into the cookie)', () => {
    const jar = new Map<string, string>();
    const ctx = {
      url: new URL('https://walls.rip/proxy/order'),
      cookies: {
        get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
        set: (name: string, value: string) => jar.set(name, value),
        delete: (name: string) => jar.delete(name),
      },
    } as unknown as Parameters<typeof setProxyOrderState>[0];
    setProxyOrderState(ctx, { orderId: 'PR-1', name: '1 GB', charged: 6, at: 1 });
    const stored = readProxyOrderState(ctx);
    expect(Object.keys(stored!).sort()).toEqual(['at', 'charged', 'name', 'orderId']);
    expect(JSON.stringify(stored)).not.toMatch(/proxyapp|buyukesim|engine/i);
  });
});

describe('proxy errors', () => {
  it('keys copy on API codes', () => {
    expect(proxyError(new ApiError(400, 'x', 'PLAN_NOT_OFFERED')).message).toMatch(/temporarily unavailable/i);
    expect(proxyError(new ApiError(503, 'x', 'PROVIDER_LOW_BALANCE')).message).toMatch(/temporarily unavailable/i);
    expect(proxyError(new ApiError(502, 'x', 'PURCHASE_HELD')).message).toMatch(/held for review/i);
    expect(proxyError(new ApiError(402, 'x', 'INSUFFICIENT_WALLET_FUNDS')).message).toMatch(/proxy balance/i);
    expect(proxyError(new ApiError(429, 'x', 'TOO_MANY_ATTEMPTS')).message).toMatch(/too many attempts/i);
    expect(proxyError(new Error('proxyapp exploded')).message).not.toMatch(/proxyapp/i);
  });

  it('routes duplicates to the order page', () => {
    expect(proxyError(new ApiError(409, 'duplicate clientRef')).toOrder).toBe(true);
  });
});
