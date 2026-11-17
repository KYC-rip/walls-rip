import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchComparePlans } from '../src/lib/data';
import { fetchSmsOffers } from '../src/lib/catalogue';

/**
 * White-label guarantee: provider names and raw costs exist in the upstream
 * payloads, and must never survive into the objects the pages render.
 */

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('eSIM compare plans', () => {
  it('drops engine and costPrice', async () => {
    stubFetch({
      plans: [
        {
          id: 'simjuno:TH_1_7',
          name: 'Thailand 1GB 7Days',
          country: 'TH',
          dataGB: 1,
          durationDays: 7,
          price: 1.79,
          currency: 'USD',
          engine: 'simjuno',
          costPrice: 0.87,
          speed: '3G/4G/5G',
          coverage: [{ country: 'Thailand', operators: [{ name: 'AIS', networkType: '5G' }] }],
        },
      ],
    });

    const plans = await fetchComparePlans({}, 'TH-LEAK-TEST');
    expect(plans).toHaveLength(1);
    const plan = plans[0] as unknown as Record<string, unknown>;
    expect(plan.id).toBe('simjuno:TH_1_7');
    expect(plan.price).toBe(1.79);
    expect(plan.engine).toBeUndefined();
    expect(plan.costPrice).toBeUndefined();
    // The public buyable id still carries the provider hint; the pages wrap it
    // in a base64url reference so visible URLs do not. Raw cost never survives.
    expect(JSON.stringify(plans)).not.toContain('costPrice');
    expect(JSON.stringify(plans)).not.toContain('0.87');
  });

  it('returns an empty list instead of throwing when upstream fails', async () => {
    stubFetch({ error: 'down' }, 503);
    await expect(fetchComparePlans({}, 'XX-LEAK-TEST')).resolves.toEqual([]);
  });
});

describe('SMS offers', () => {
  it('keeps price, stock and success rate only', async () => {
    stubFetch({
      results: [
        {
          engine: 'smspool',
          countryId: '1',
          serviceId: '907',
          price: 0.9,
          costPrice: 0.6,
          successRate: 45,
          stock: 7073,
          pool: '7',
          available: true,
        },
        { engine: 'x', price: 0, costPrice: 0, available: true },
      ],
    });

    const offers = await fetchSmsOffers({}, 'US-LEAK-TEST', 'telegram');
    expect(offers).toHaveLength(1);
    expect(offers[0]).toEqual({ price: 0.9, successRate: 45, stock: 7073, available: true });
    expect(JSON.stringify(offers)).not.toContain('smspool');
    expect(JSON.stringify(offers)).not.toContain('costPrice');
  });
});
