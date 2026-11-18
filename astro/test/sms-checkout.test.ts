import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeRouteRef,
  encodeRouteRef,
  findSmsRoute,
  prepareSmsCheck,
  prepareSmsPurchase,
  purchaseErrorMessage,
} from '../src/lib/sms-checkout';
import { fetchSmsRoutes } from '../src/lib/catalogue';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

const ROW = {
  engine: 'smspool',
  countryId: '1',
  serviceId: '907',
  pool: '7',
  quoteId: '11111111-2222-3333-4444-555555555555',
  price: 0.9,
  costPrice: 0.6,
  successRate: 45,
  stock: 7073,
  available: true,
};

describe('route references', () => {
  it('round-trip engine, provider ids and pool without plaintext', () => {
    const ref = encodeRouteRef(ROW);
    expect(ref).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ref).not.toContain('smspool');
    expect(decodeRouteRef(ref)).toEqual({
      engine: 'smspool',
      countryId: '1',
      serviceId: '907',
      pool: '7',
    });
  });

  it('treats a missing pool as empty, never as a wildcard', () => {
    const ref = encodeRouteRef({ ...ROW, pool: undefined });
    expect(decodeRouteRef(ref)).toEqual({
      engine: 'smspool',
      countryId: '1',
      serviceId: '907',
      pool: '',
    });
  });

  it('rejects malformed or oversized references', () => {
    expect(decodeRouteRef('')).toBeNull();
    expect(decodeRouteRef('%%%')).toBeNull();
    expect(decodeRouteRef('eA')).toBeNull(); // decodes to a single field
    expect(decodeRouteRef('A'.repeat(400))).toBeNull();
  });
});

describe('findSmsRoute', () => {
  it('resolves against the live catalogue, not the reference payload', async () => {
    stubFetch({ results: [{ ...ROW, price: 1.23 }] });

    const ref = encodeRouteRef(ROW);
    const route = await findSmsRoute({}, 'ZZ', 'search-one', ref, { fresh: true });

    expect(route).not.toBeNull();
    // Price and quote always come from the response.
    expect(route?.price).toBe(1.23);
    expect(route?.quoteId).toBe(ROW.quoteId);
    expect(JSON.stringify(route)).not.toContain('costPrice');
  });

  it('follows a re-tiered pool to the same route instead of failing', async () => {
    stubFetch({ results: [{ ...ROW, pool: '8', price: 1.26 }] });
    const ref = encodeRouteRef(ROW);
    const route = await findSmsRoute({}, 'ZZ', 'search-two', ref, { fresh: true });
    expect(route?.pool).toBe('8');
    expect(route?.price).toBe(1.26);
  });

  it('refuses a vanished route instead of guessing another row', async () => {
    stubFetch({ results: [{ ...ROW, engine: 'other' }] });
    const ref = encodeRouteRef(ROW);
    await expect(findSmsRoute({}, 'ZZ', 'search-three', ref, { fresh: true })).resolves.toBeNull();
  });

  it('picks the cheapest row when the pair repeats (aggregator v2)', async () => {
    stubFetch({
      results: [
        { ...ROW, price: 2 },
        { ...ROW, price: 1.5, quoteId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      ],
    });
    const ref = encodeRouteRef(ROW);
    const route = await findSmsRoute({}, 'ZZ', 'search-four', ref, { fresh: true });
    expect(route?.price).toBe(1.5);
  });

  it('propagates an upstream failure so the page can say "unavailable"', async () => {
    stubFetch({ error: 'down' }, 503);
    const ref = encodeRouteRef(ROW);
    await expect(findSmsRoute({}, 'ZZ', 'search-five', ref, { fresh: true })).rejects.toThrow();
  });
});

describe('fetchSmsRoutes', () => {
  it('drops provider cost and keeps availability order', async () => {
    stubFetch({
      results: [
        { ...ROW, available: false, price: 0.5 },
        { ...ROW, available: true, price: 0.9 },
        { ...ROW, price: 0, available: true },
        { engine: '', countryId: '1', serviceId: '907', price: 1 },
      ],
    });
    const routes = await fetchSmsRoutes({}, 'ZZ', 'order-one');
    expect(routes).toHaveLength(2);
    expect(routes[0].available).toBe(true);
    expect(routes[0].price).toBe(0.9);
    expect(JSON.stringify(routes)).not.toContain('costPrice');
  });
});

describe('prepareSmsCheck', () => {
  function mockAstro(path: string, orderId: string) {
    const jar = new Map<string, string>([
      ['wr_wallet', 'a'.repeat(32)],
      [
        'wr_sms',
        JSON.stringify({ orderId, service: 'telegram', country: 'TH', number: '+1', charged: 0.7, at: Date.now() }),
      ],
    ]);
    return {
      url: new URL(`https://walls.rip${path}`),
      locals: {},
      cookies: {
        get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
        set: (name: string, value: string) => jar.set(name, value),
        delete: (name: string) => jar.delete(name),
      },
      response: { headers: new Headers() },
    } as never;
  }

  function stubStatus(check: unknown, messages: unknown[] = [], checkStatus = 200) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes('/sms/check')
          ? check
          : url.includes('/sms/messages')
            ? { messages }
            : url.includes('/balance')
              ? { balanceUSD: 3 }
              : {};
        return new Response(JSON.stringify(body), {
          status: url.includes('/sms/check') ? checkStatus : 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
  }

  it('keeps a delivered code on screen and stops refreshing', async () => {
    stubStatus({ status: 'RECEIVED', sms: '123456', fullSms: 'Your code is 123456' }, [
      { message: 'earlier message', timestamp: '2026-11-18T10:00:00Z' },
    ]);

    const result = await prepareSmsCheck(mockAstro('/sms/check', 'smspool:keep-1'), 'en');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    // Newest first: the live code the history has not recorded yet.
    expect(result.props.messages).toHaveLength(2);
    expect(result.props.messages[0].message).toContain('123456');
    expect(result.props.status).toBe('RECEIVED');
    expect(result.props.refreshUrl).toBeNull();
  });

  it('does not duplicate a code the history already recorded', async () => {
    stubStatus({ status: 'RECEIVED', sms: '123456' }, [{ message: 'Your code is 123456' }]);
    const result = await prepareSmsCheck(mockAstro('/sms/check', 'smspool:keep-2'), 'en');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.props.messages).toHaveLength(1);
  });

  it('arms the refresh while pending and honours the cycle bound', async () => {
    stubStatus({ status: 'PENDING' });
    const first = await prepareSmsCheck(mockAstro('/sms/check', 'smspool:keep-3'), 'en');
    expect(first.kind).toBe('ok');
    if (first.kind !== 'ok') return;
    expect(first.props.refreshUrl).toBe('/sms/check?r=1');

    const exhausted = await prepareSmsCheck(mockAstro('/sms/check?r=60', 'smspool:keep-3'), 'en');
    expect(exhausted.kind).toBe('ok');
    if (exhausted.kind !== 'ok') return;
    expect(exhausted.props.refreshUrl).toBeNull();
  });

  it('stops refreshing when asked to, even while pending', async () => {
    stubStatus({ status: 'PENDING' });
    const result = await prepareSmsCheck(mockAstro('/sms/check?stop=1', 'smspool:keep-4'), 'en');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.props.stopped).toBe(true);
    expect(result.props.refreshUrl).toBeNull();
  });

  it('does not auto-refresh when the status API is unreachable', async () => {
    stubStatus({ error: 'down' }, [], 503);
    const result = await prepareSmsCheck(mockAstro('/sms/check', 'smspool:keep-5'), 'en');
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.props.unreachable).toBe(true);
    expect(result.props.refreshUrl).toBeNull();
  });

  it('sends a dead wallet back to a fresh start', async () => {
    stubStatus({ error: 'Invalid wallet' }, [], 401);
    const result = await prepareSmsCheck(mockAstro('/sms/check', 'smspool:keep-6'), 'en');
    expect(result.kind).toBe('redirect');
    if (result.kind !== 'redirect') return;
    expect(result.response.status).toBe(303);
    expect(result.response.headers.get('location')).toBe('/sms');
  });
});

describe('prepareSmsPurchase', () => {
  function purchaseAstro(path: string) {
    const jar = new Map<string, string>();
    return {
      url: new URL(`https://walls.rip${path}`),
      locals: {},
      cookies: {
        get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
        set: (name: string, value: string) => jar.set(name, value),
        delete: (name: string) => jar.delete(name),
      },
      response: { headers: new Headers() },
    } as never;
  }

  it('refuses a checkout page for a route that is out of stock', async () => {
    stubFetch({ results: [{ ...ROW, available: false }] });
    const ref = encodeRouteRef(ROW);
    const result = await prepareSmsPurchase(
      purchaseAstro(`/sms/purchase?c=ZZ&s=telegram&route=${ref}`),
      'en',
    );
    expect(result.kind).toBe('redirect');
    if (result.kind !== 'redirect') return;
    expect(result.response.headers.get('location')).toBe('/sms?c=ZZ&s=telegram');
  });

  it('is a redirect (never a loop) when the route is gone', async () => {
    stubFetch({ results: [] });
    const ref = encodeRouteRef(ROW);
    const result = await prepareSmsPurchase(
      purchaseAstro(`/sms/purchase?c=ZZ&s=telegram&route=${ref}`),
      'en',
    );
    expect(result.kind).toBe('redirect');
    if (result.kind !== 'redirect') return;
    expect(result.response.headers.get('location')).toBe('/sms?c=ZZ&s=telegram');
  });
});

describe('purchaseErrorMessage', () => {
  it('maps provider refusals to actionable copy', () => {
    expect(purchaseErrorMessage('NO_NUMBERS')).toMatch(/no numbers|another route/i);
    expect(purchaseErrorMessage('max price exceeded')).toMatch(/price moved/i);
    expect(purchaseErrorMessage('service not in whitelist')).toMatch(/not available from this route/i);
    expect(purchaseErrorMessage('insufficient balance')).toMatch(/add funds/i);
    expect(purchaseErrorMessage('duplicate ref')).toMatch(/already submitted/i);
  });

  it('never echoes upstream text (provider names, raw status codes)', () => {
    const leak = purchaseErrorMessage('herosms setStatus: ACCESS_CANCEL');
    expect(leak).not.toMatch(/herosms|access_cancel/i);
    expect(purchaseErrorMessage('boom')).toMatch(/try again/i);
  });
});
