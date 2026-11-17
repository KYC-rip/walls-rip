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
});
