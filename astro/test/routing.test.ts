import { describe, expect, it } from 'vitest';
import { localePath, resolveLang, splitLangPath } from '../src/lib/i18n';

describe('localePath', () => {
  it('leaves English unprefixed', () => {
    expect(localePath('/esim', 'en')).toBe('/esim');
    expect(localePath('/', 'en')).toBe('/');
  });

  it('prefixes every other language', () => {
    expect(localePath('/esim', 'es')).toBe('/es/esim');
    expect(localePath('/', 'ja')).toBe('/ja');
    expect(localePath('/destination/thailand', 'zh-TW')).toBe('/zh-TW/destination/thailand');
  });
});

describe('splitLangPath', () => {
  it('recovers the language and the unprefixed path', () => {
    expect(splitLangPath('/es/destination/thailand')).toEqual({
      lang: 'es',
      path: '/destination/thailand',
    });
    expect(splitLangPath('/zh-TW')).toEqual({ lang: 'zh-TW', path: '/' });
  });

  it('treats an unknown prefix as part of the path', () => {
    expect(splitLangPath('/xx/esim')).toEqual({ lang: 'en', path: '/xx/esim' });
    expect(splitLangPath('/destination/thailand')).toEqual({
      lang: 'en',
      path: '/destination/thailand',
    });
  });
});

describe('resolveLang', () => {
  it('accepts only supported values', () => {
    expect(resolveLang('ja')).toBe('ja');
    expect(resolveLang('zh')).toBe('zh');
    expect(resolveLang('de')).toBe('en');
    expect(resolveLang(null)).toBe('en');
  });
});
