import { describe, expect, it } from 'vitest';
import {
  checkCsrf,
  clearClientRef,
  clientRefFor,
  ensureCsrf,
  localeFrom,
  safeReturn,
} from '../src/lib/wallet';

function mockContext(protocol = 'https:') {
  const jar = new Map<string, string>();
  return {
    url: new URL(`${protocol}//walls.rip/checkout`),
    jar,
    cookies: {
      get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
    },
  } as never;
}

describe('safeReturn', () => {
  it('accepts same-origin paths', () => {
    expect(safeReturn('/checkout?c=TH', '/esim')).toBe('/checkout?c=TH');
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(safeReturn('//evil.example', '/esim')).toBe('/esim');
    expect(safeReturn('https://evil.example', '/esim')).toBe('/esim');
    expect(safeReturn('/ok\\..\\evil', '/esim')).toBe('/esim');
    expect(safeReturn(null, '/esim')).toBe('/esim');
  });
});

describe('localeFrom', () => {
  it('accepts supported languages only', () => {
    expect(localeFrom('ja')).toBe('ja');
    expect(localeFrom('zh-TW')).toBe('zh-TW');
    expect(localeFrom('de')).toBe('en');
    expect(localeFrom(null)).toBe('en');
  });
});

describe('CSRF double submit', () => {
  it('mints a token once and accepts it back', () => {
    const ctx = mockContext();
    const first = ensureCsrf(ctx);
    const second = ensureCsrf(ctx);
    expect(first).toMatch(/^[a-f0-9]{48}$/);
    expect(second).toBe(first);
    expect(checkCsrf(ctx, first)).toBe(true);
  });

  it('rejects a wrong, empty or missing token', () => {
    const ctx = mockContext();
    const token = ensureCsrf(ctx);
    const wrong = token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
    expect(checkCsrf(ctx, wrong)).toBe(false);
    expect(checkCsrf(ctx, '')).toBe(false);
    expect(checkCsrf(ctx, null)).toBe(false);
    expect(checkCsrf(mockContext(), token)).toBe(false);
  });
});

describe('clientRefFor', () => {
  it('reuses the reference for the same plan and rotates for a new one', () => {
    const ctx = mockContext();
    const first = clientRefFor(ctx, 'plan-a');
    expect(clientRefFor(ctx, 'plan-a')).toBe(first);
    expect(clientRefFor(ctx, 'plan-b')).not.toBe(first);
  });

  it('mints a fresh reference after a completed purchase', () => {
    const ctx = mockContext();
    const first = clientRefFor(ctx, 'plan-a');
    clearClientRef(ctx);
    expect(clientRefFor(ctx, 'plan-a')).not.toBe(first);
  });

  it('keeps the SMS reference apart from a pending eSIM retry', async () => {
    const { COOKIE } = await import('../src/lib/wallet');
    const ctx = mockContext();
    const esimRef = clientRefFor(ctx, 'plan-a');
    const smsRef = clientRefFor(ctx, 'sms:route-a', COOKIE.refSms);

    expect(smsRef).not.toBe(esimRef);
    // Opening an SMS checkout must not have replaced the eSIM retry key.
    expect(clientRefFor(ctx, 'plan-a')).toBe(esimRef);
  });

  it('reuses a just-sold reference so a resubmitted form is refused, not re-bought', async () => {
    const { COOKIE, markClientRefSold, rotateClientRef } = await import('../src/lib/wallet');
    const ctx = mockContext();
    const ref = rotateClientRef(ctx, 'sms:route-a', COOKIE.refSms);
    markClientRefSold(ctx, COOKIE.refSms);

    // The browser replays the same POST: the same ref reaches the API, whose
    // dedup answers 409 instead of creating a second provider order.
    expect(clientRefFor(ctx, 'sms:route-a', COOKIE.refSms)).toBe(ref);
  });

  it('allows a deliberate re-buy: a fresh page view rotates the reference', async () => {
    const { COOKIE, markClientRefSold, rotateClientRef } = await import('../src/lib/wallet');
    const ctx = mockContext();
    const first = rotateClientRef(ctx, 'sms:route-a', COOKIE.refSms);
    markClientRefSold(ctx, COOKIE.refSms);
    const second = rotateClientRef(ctx, 'sms:route-a', COOKIE.refSms);

    expect(second).not.toBe(first);
    expect(clientRefFor(ctx, 'sms:route-a', COOKIE.refSms)).toBe(second);
  });

  it('mints a new reference once the sold window has passed', async () => {
    const { COOKIE, markClientRefSold, rotateClientRef } = await import('../src/lib/wallet');
    const ctx = mockContext();
    const ref = rotateClientRef(ctx, 'sms:route-a', COOKIE.refSms);
    markClientRefSold(ctx, COOKIE.refSms);
    // Age the sold marker beyond the replay window.
    const stored = JSON.parse((ctx as never as { jar: Map<string, string> }).jar.get(COOKIE.refSms)!);
    (ctx as never as { jar: Map<string, string> }).jar.set(
      COOKIE.refSms,
      JSON.stringify({ ...stored, soldAt: Date.now() - 11 * 60_000 }),
    );

    expect(clientRefFor(ctx, 'sms:route-a', COOKIE.refSms)).not.toBe(ref);
  });
});

describe('wallet cookie', () => {
  it('only stores tokens that look like tokens', async () => {
    const { setWalletToken, walletToken } = await import('../src/lib/wallet');
    const ctx = mockContext();
    setWalletToken(ctx, '<script>alert(1)</script>');
    expect(walletToken(ctx)).toBeNull();

    setWalletToken(ctx, 'a'.repeat(64));
    expect(walletToken(ctx)).toBe('a'.repeat(64));
  });

  it('accepts only token-shaped imports', async () => {
    const { isWalletToken } = await import('../src/lib/wallet');
    expect(isWalletToken('a'.repeat(16))).toBe(true);
    expect(isWalletToken('ab_-'.repeat(8))).toBe(true);
    expect(isWalletToken('a'.repeat(128))).toBe(true);
    expect(isWalletToken('a'.repeat(15))).toBe(false);
    expect(isWalletToken('a'.repeat(129))).toBe(false);
    expect(isWalletToken('has space in it')).toBe(false);
    expect(isWalletToken('<script>alert(1)</script>')).toBe(false);
  });
});
