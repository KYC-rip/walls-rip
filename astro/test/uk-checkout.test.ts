import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api';
import {
  fetchUkRenewalPlans,
  findUkPlan,
  UK_PLAN_REF,
  ukError,
  validUkPhone,
} from '../src/lib/uk-checkout';

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

const PLANS = {
  available: true,
  plans: [
    { id: 'uk-6m', name: 'BuyUKeSIM UK 6 months', months: 6, price: 30, available: true },
    { id: 'uk-off', name: 'Sold out', months: 12, price: 50, available: false },
  ],
};

describe('uk plan refs', () => {
  it('round-trips the plan id', () => {
    expect(UK_PLAN_REF.decode(UK_PLAN_REF.encode('uk-6m'))).toBe('uk-6m');
    expect(UK_PLAN_REF.decode('')).toBeNull();
  });
});

describe('uk plan resolution', () => {
  it('re-resolves the price and cleans provider names', async () => {
    stubFetch(PLANS);
    const plan = await findUkPlan({}, 'uk-6m');
    expect(plan?.price).toBe(30);
    expect(plan?.name.toLowerCase()).not.toContain('buyukesim');
    expect(plan?.name).toContain('6 months');
  });

  it('refuses unavailable or missing plans', async () => {
    stubFetch(PLANS);
    expect(await findUkPlan({}, 'uk-off')).toBeNull();
    expect(await findUkPlan({}, 'nope')).toBeNull();
  });
});

describe('uk phone validation (API regex)', () => {
  it('accepts only +447 followed by 9 digits', () => {
    expect(validUkPhone('+447123456789')).toBe(true);
    expect(validUkPhone('+447000000000')).toBe(true);
    expect(validUkPhone('+44712345678')).toBe(false);
    expect(validUkPhone('+4471234567890')).toBe(false);
    expect(validUkPhone('07123456789')).toBe(false);
    expect(validUkPhone('+33712345678')).toBe(false);
  });
});

describe('uk renewal plans', () => {
  it('keeps only 1/2/4-period plans with a price, sorted', async () => {
    stubFetch({
      available: true,
      plans: [
        { periods: 2, days: 360, price: 60 },
        { periods: 4, days: 720, price: 110 },
        { periods: 3, days: 540, price: 90 },
        { periods: 1, days: 180, price: 30 },
        { periods: 1, days: 180, price: 0 },
      ],
    });
    const plans = await fetchUkRenewalPlans({}, 'tok', 'buyukesim:5');
    expect(plans.map((plan) => plan.periods)).toEqual([1, 2, 4]);
  });
});

describe('uk errors', () => {
  it('keys copy on API codes and never echoes upstream text', () => {
    expect(ukError(new ApiError(402, 'x', 'INSUFFICIENT_WALLET_FUNDS')).message).toMatch(/add funds/i);
    expect(ukError(new ApiError(502, 'x', 'PURCHASE_HELD')).message).toMatch(/held for review/i);
    expect(ukError(new ApiError(428, 'x', 'QUOTE_REQUIRED')).message).toMatch(/temporarily unavailable/i);
    expect(ukError(new ApiError(429, 'x', 'TOO_MANY_ATTEMPTS')).message).toMatch(/too many attempts/i);
    expect(ukError(new ApiError(503, 'Not available yet')).message).toMatch(/not on sale/i);
    expect(ukError(new Error('buyukesim exploded')).message).not.toMatch(/buyukesim/i);
  });

  it('routes duplicates and renewal holds to the order page', () => {
    expect(ukError(new ApiError(409, 'duplicate clientRef')).toOrder).toBe(true);
    expect(ukError(new ApiError(502, 'x', 'PURCHASE_HELD'), { heldToOrder: true }).toOrder).toBe(true);
    expect(ukError(new ApiError(502, 'x', 'PURCHASE_HELD')).toOrder).toBe(false);
  });
});
