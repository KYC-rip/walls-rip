import { afterEach, describe, expect, it, vi } from 'vitest';
import { activationBounds } from '../src/lib/checkout';
import {
  decodePhoneRef,
  encodePhoneRef,
  findPhonePlan,
  toBuyable,
  validActivationDate,
} from '../src/lib/phone-checkout';

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

const REF = { engine: 'pikasim', country: 'AU', planId: 'pikasim:AU_30' };

const PLAN = {
  id: REF.planId,
  engine: 'pikasim',
  name: 'Australia 30 days',
  country: 'AU',
  dataGB: 20,
  durationDays: 30,
  price: 12.5,
  currency: 'USD',
  hasVoice: true,
  hasSms: true,
  requiresActivationDate: true,
};

describe('phone refs', () => {
  it('round-trips engine, country and plan id', () => {
    expect(decodePhoneRef(encodePhoneRef(REF))).toEqual(REF);
  });

  it('rejects malformed refs', () => {
    expect(decodePhoneRef('')).toBeNull();
    expect(decodePhoneRef(btoa('no-separators'))).toBeNull();
    expect(decodePhoneRef(btoa('pikasim|AUS|plan'))).toBeNull();
    expect(decodePhoneRef(btoa('|AU|plan'))).toBeNull();
    expect(decodePhoneRef(btoa('pikasim|AU|'))).toBeNull();
  });
});

describe('phone resolution', () => {
  it('re-resolves price and engine from the live catalogue', async () => {
    stubFetch([PLAN]);
    const plan = await findPhonePlan({}, REF);
    expect(plan?.price).toBe(12.5);
    expect(plan?.engine).toBe('pikasim');
    expect(plan?.requiresActivationDate).toBe(true);
    expect(toBuyable(plan!).engine).toBe('pikasim');
  });

  it('returns null when the plan vanished or changed engine', async () => {
    stubFetch([{ ...PLAN, engine: 'other' }]);
    expect(await findPhonePlan({}, REF)).toBeNull();
  });

  it('drops plans without an engine key', async () => {
    stubFetch([{ ...PLAN, engine: undefined }]);
    expect(await findPhonePlan({}, REF)).toBeNull();
  });

  it('never carries a provider brand in the rendered plan name', async () => {
    stubFetch([{ ...PLAN, name: 'PikaSim AU 30 days' }]);
    const plan = await findPhonePlan({}, REF);
    expect(plan?.name.toLowerCase()).not.toContain('pikasim');
    expect(plan?.name).toContain('30 days');
  });
});

describe('phone activation bounds', () => {
  it('uses the 2-60 day default and rejects out-of-window dates', () => {
    const plan = toBuyable(PLAN);
    const { min, max } = activationBounds(plan);
    expect(min < max).toBe(true);
    expect(validActivationDate(plan, min)).toBe(true);
    expect(validActivationDate(plan, max)).toBe(true);
    expect(validActivationDate(plan, '2000-01-01')).toBe(false);
    expect(validActivationDate(plan, null)).toBe(false);
    expect(validActivationDate(plan, 'next tuesday')).toBe(false);
  });

  it('does not require a date when the plan does not', () => {
    const plan = toBuyable({ ...PLAN, requiresActivationDate: false });
    expect(validActivationDate(plan, null)).toBe(true);
  });
});
