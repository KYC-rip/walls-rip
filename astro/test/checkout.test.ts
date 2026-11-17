import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activationBounds,
  decodePlanRef,
  encodePlanRef,
  findBuyablePlan,
  validActivationDate,
  type BuyablePlan,
} from '../src/lib/checkout';

const DAY = 86_400_000;

function iso(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
}

describe('activation dates', () => {
  const plan: BuyablePlan = {
    id: 'pikasim:au',
    name: 'AU — start date',
    country: 'AU',
    dataGB: 1,
    durationDays: 7,
    price: 50,
    engine: 'pikasim',
    requiresActivationDate: true,
    activationDateMinDays: 2,
    activationDateMaxDays: 60,
  };

  it('bounds are relative to today', () => {
    const bounds = activationBounds(plan);
    expect(bounds.min).toBe(iso(2));
    expect(bounds.max).toBe(iso(60));
  });

  it('accepts dates inside the window only', () => {
    expect(validActivationDate(plan, iso(2))).toBe(true);
    expect(validActivationDate(plan, iso(30))).toBe(true);
    expect(validActivationDate(plan, iso(60))).toBe(true);
    expect(validActivationDate(plan, iso(1))).toBe(false);
    expect(validActivationDate(plan, iso(61))).toBe(false);
    expect(validActivationDate(plan, null)).toBe(false);
    expect(validActivationDate(plan, '2026-2-3')).toBe(false);
  });

  it('ignores the date when the plan does not need one', () => {
    expect(validActivationDate({ ...plan, requiresActivationDate: false }, null)).toBe(true);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findBuyablePlan', () => {
  it('keeps the engine server-side and resolves by id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            plans: [
              {
                id: 'simjuno:AA_1_7',
                name: 'Test 1GB',
                country: 'AA',
                dataGB: 1,
                durationDays: 7,
                price: 2,
                engine: 'simjuno',
                costPrice: 1,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const plan = await findBuyablePlan({}, 'AA', 'simjuno:AA_1_7');
    expect(plan).not.toBeNull();
    expect(plan?.engine).toBe('simjuno');
    expect(plan?.price).toBe(2);
  });

  it('returns null for an unknown or unfunded plan', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ plans: [] }), { status: 200 })),
    );
    await expect(findBuyablePlan({}, 'BB', 'nope')).resolves.toBeNull();
  });
});

describe('plan references', () => {
  it('round-trip and never expose the provider in the visible value', () => {
    const id = 'simjuno:TH_0.1_7';
    const ref = encodePlanRef(id);
    expect(ref).not.toContain('simjuno');
    expect(ref).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePlanRef(ref)).toBe(id);
  });

  it('returns null for malformed references', () => {
    expect(decodePlanRef('%%%')).toBeNull();
    expect(decodePlanRef('')).toBeNull();
  });
});
