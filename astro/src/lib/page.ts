import type { AstroGlobal } from 'astro';
import { splitLangPath, type Lang } from './i18n';

/**
 * The language of the current request, read from the URL prefix.
 *
 * Localized routes live under `/[lang]/...` and render the same page
 * components as the unprefixed routes; the URL is the only source of truth,
 * so no header or cookie can change which language a response is cached as.
 */
export function pageLang(astro: AstroGlobal): Lang {
  return splitLangPath(astro.url.pathname).lang;
}

/** The unprefixed path, e.g. `/destination/thailand`. */
export function pagePath(astro: AstroGlobal): string {
  return splitLangPath(astro.url.pathname).path;
}
