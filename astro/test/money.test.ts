import { afterEach, describe, expect, it, vi } from 'vitest';
import { preparePay } from '../src/lib/payment-pages';
import { POST as checkoutPOST } from '../src/pages/actions/checkout';

/**
 * State-transition tests for the no-JS money path: the payment page's
 * COMPLETED / PENDING / EXPIRED branches and the purchase handler's success,
 * held and CSRF paths.
 */

function jar(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    cookies: {
      get: (name: string) => (map.has(name) ? { value: map.get(name)! } : undefined),
      set: (name: string, value: string) => map.set(name, value),
      delete: (name: string) => map.delete(name),
    },
  };
}

function fakeAstro(initial: Record<string, string>, url = 'https://walls.rip/pay') {
  const store = jar(initial);
  return {
    store,
    cookies: store.cookies,
    locals: {},
    response: { headers: new Headers() },
    url: new URL(url),
    request: new Request(url),
  } as never;
}

function payCookie(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    paymentId: 'pay-1',
    method: 'XMR',
    address: 'integrated-address',
    amount: 0.0012,
    usd: 1,
    returnTo: '/checkout?c=TH&plan=ref',
    createdAt: Date.now(),
    ...overrides,
  });
}

function stubPayment(status: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ status }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preparePay', () => {
  it('redirects to the checkout when the payment completed and clears the pay cookie', async () => {
    stubPayment('COMPLETED');
    const astro = fakeAstro({ wr_pay: payCookie({ paymentId: 'pay-completed' }) });
    const result = await preparePay(astro, 'en');

    expect(result.kind).toBe('redirect');
    if (result.kind !== 'redirect') return;
    expect(result.response.status).toBe(303);
    expect(result.response.headers.get('location')).toBe('/checkout?c=TH&plan=ref');
    expect((astro as unknown as { store: { map: Map<string, string> } }).store.map.has('wr_pay')).toBe(false);
  });

  it('renders the payment page while pending, with a Monero URI', async () => {
    stubPayment('PENDING');
    const result = await preparePay(fakeAstro({ wr_pay: payCookie({ paymentId: 'pay-pending' }) }), 'en');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.props.qrPayload).toBe('monero:integrated-address?tx_amount=0.0012');
  });

  it('uses the raw invoice as the QR payload for Lightning', async () => {
    stubPayment('PENDING');
    const result = await preparePay(
      fakeAstro({ wr_pay: payCookie({ paymentId: 'pay-ln', method: 'LN', address: 'lnbc1invoice' }) }),
      'en',
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.props.qrPayload).toBe('lnbc1invoice');
  });

  it('sends an expired payment back with a flash', async () => {
    stubPayment('EXPIRED');
    const astro = fakeAstro({ wr_pay: payCookie({ paymentId: 'pay-expired' }) });
    const result = await preparePay(astro, 'en');

    expect(result.kind).toBe('redirect');
    if (result.kind !== 'redirect') return;
    expect(result.response.headers.get('location')).toBe('/checkout?c=TH&plan=ref');
    const store = (astro as unknown as { store: { map: Map<string, string> } }).store.map;
    expect(store.has('wr_pay')).toBe(false);
    expect(store.get('wr_flash')).toContain('expired');
  });

  it('sends a visitor without payment state to /esim', async () => {
    const result = await preparePay(fakeAstro({}), 'en');
    expect(result.kind).toBe('redirect');
    if (result.kind !== 'redirect') return;
    expect(result.response.headers.get('location')).toBe('/esim');
  });
});

function form(fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields);
  return new Request('https://walls.rip/actions/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

function actionContext(request: Request, initial: Record<string, string>) {
  const store = jar(initial);
  return {
    store,
    request,
    cookies: store.cookies,
    locals: {},
    url: new URL(request.url),
    redirect: (path: string, status = 302) =>
      new Response(null, { status, headers: { location: path } }),
  } as never;
}

function stubPurchase(outcome: 'ok' | 'held') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/esim/compare')) {
        return new Response(
          JSON.stringify({
            plans: [
              {
                id: 'simjuno:QA_1_7',
                name: 'QA 1GB',
                country: 'QA',
                dataGB: 1,
                durationDays: 7,
                price: 2,
                engine: 'simjuno',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/esim/purchase')) {
        if (outcome === 'held') {
          return new Response(
            JSON.stringify({ error: 'The purchase is held for review.', code: 'PURCHASE_HELD' }),
            { status: 502, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({ orderId: 'simjuno:QA-ORDER', charged: 2, balanceUSD: 0 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    }),
  );
}

const PLAN_REF = Buffer.from('simjuno:QA_1_7').toString('base64url');

function checkoutFields(csrf: string) {
  return {
    csrf,
    lang: 'en',
    returnTo: '/checkout?c=QA&plan=' + PLAN_REF,
    c: 'QA',
    plan: PLAN_REF,
  };
}

describe('POST /actions/checkout', () => {
  it('buys the plan, stores the order and rotates the idempotency ref', async () => {
    stubPurchase('ok');
    const csrf = 'a'.repeat(48);
    const astro = actionContext(form(checkoutFields(csrf)), {
      wr_csrf: csrf,
      wr_wallet: 'w'.repeat(64),
      wr_ref: JSON.stringify({ planId: 'simjuno:QA_1_7', ref: '11111111-1111-1111-1111-111111111111' }),
    });

    const response = await checkoutPOST(astro);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/order');

    const map = (astro as unknown as { store: { map: Map<string, string> } }).store.map;
    expect(JSON.parse(map.get('wr_order')!)).toMatchObject({
      orderId: 'simjuno:QA-ORDER',
      country: 'QA',
      price: 2,
    });
    expect(map.has('wr_ref')).toBe(false);
  });

  it('keeps the user on checkout with an honest message when funds are held', async () => {
    stubPurchase('held');
    const csrf = 'b'.repeat(48);
    const astro = actionContext(form(checkoutFields(csrf)), {
      wr_csrf: csrf,
      wr_wallet: 'w'.repeat(64),
      wr_ref: JSON.stringify({ planId: 'simjuno:QA_1_7', ref: '22222222-2222-2222-2222-222222222222' }),
    });

    const response = await checkoutPOST(astro);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('/checkout?c=QA');
    const map = (astro as unknown as { store: { map: Map<string, string> } }).store.map;
    expect(map.get('wr_flash')!.toLowerCase()).toContain('held');
    // The ref must survive an uncertain purchase so a retry cannot double-buy.
    expect(map.has('wr_ref')).toBe(true);
  });

  it('rejects a stale form with a redirect instead of a dead-end 403', async () => {
    const astro = actionContext(form(checkoutFields('deadbeef')), {
      wr_csrf: 'c'.repeat(48),
      wr_wallet: 'w'.repeat(64),
    });
    const response = await checkoutPOST(astro);
    expect(response.status).toBe(303);
    const map = (astro as unknown as { store: { map: Map<string, string> } }).store.map;
    expect(map.get('wr_flash')!.toLowerCase()).toContain('expired');
  });
});
