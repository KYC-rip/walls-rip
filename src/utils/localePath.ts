import { SUPPORTED_LANGS } from '../i18n/config';

/**
 * Language-prefixed internal links. English has no prefix; every other
 * supported language is served under `/<lang>/...`.
 *
 * Shared (Footer, destination cards, command center) so a link can never point
 * at the English page while the visitor is reading a localized one.
 */
export function resolveLang(lang: string | undefined): string {
  return lang && (SUPPORTED_LANGS as readonly string[]).includes(lang) ? lang : 'en';
}

export function localePath(path: string, lang: string | undefined): string {
  const current = resolveLang(lang);
  if (current === 'en') return path;
  return `/${current}${path === '/' ? '' : path}`;
}
