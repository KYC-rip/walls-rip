import en from '../i18n/locales/en/common.json';
import es from '../i18n/locales/es/common.json';
import ja from '../i18n/locales/ja/common.json';
import pt from '../i18n/locales/pt/common.json';
import ru from '../i18n/locales/ru/common.json';
import zhTW from '../i18n/locales/zh-TW/common.json';

export const SUPPORTED_LANGS = ['en', 'es', 'ja', 'pt', 'ru', 'zh-TW', 'zh'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

/**
 * `zh` is an alias of the Traditional Chinese bundle, exactly like the React
 * app. English has no URL prefix; everything else is served from `/<lang>/`.
 */
const BUNDLES: Record<Lang, unknown> = {
  en,
  es,
  ja,
  pt,
  ru,
  'zh-TW': zhTW,
  zh: zhTW,
};

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  es: 'Español',
  ja: '日本語',
  pt: 'Português',
  ru: 'Русский',
  'zh-TW': '繁體中文',
  zh: '繁體中文',
};

/** Two-letter BCP 47 value for <html lang>. */
export function htmlLang(lang: Lang): string {
  return lang === 'zh' ? 'zh-TW' : lang;
}

export function resolveLang(value: string | null | undefined): Lang {
  return value && (SUPPORTED_LANGS as readonly string[]).includes(value)
    ? (value as Lang)
    : 'en';
}

function lookup(bundle: unknown, key: string): unknown {
  let node: unknown = bundle;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => {
    const value = vars[name];
    return value == null ? '' : String(value);
  });
}

/**
 * Translate a dot-path key, falling back to English and finally to `fallback`.
 * Numbers passed as `count` are interpolated verbatim (no plural machinery —
 * the copy is written to read correctly for both 1 and N).
 */
export function t(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
  fallback?: string,
): string {
  const primary = lookup(BUNDLES[lang], key);
  const value =
    typeof primary === 'string'
      ? primary
      : lang === 'en'
        ? undefined
        : lookup(BUNDLES.en, key);
  if (typeof value !== 'string') return interpolate(fallback ?? key, vars);
  return interpolate(value, vars);
}

/** Locale-prefixed absolute path. English has no prefix. */
export function localePath(path: string, lang: Lang): string {
  if (lang === 'en') return path;
  return `/${lang}${path === '/' ? '' : path}`;
}

/** The language of a URL's first segment, and the unprefixed path. */
export function splitLangPath(pathname: string): { lang: Lang; path: string } {
  const parts = pathname.split('/').filter(Boolean);
  const first = parts[0];
  if (first && (SUPPORTED_LANGS as readonly string[]).includes(first) && first !== 'en') {
    return { lang: first as Lang, path: '/' + parts.slice(1).join('/') };
  }
  return { lang: 'en', path: pathname || '/' };
}
