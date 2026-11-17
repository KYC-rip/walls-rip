/**
 * Common shorthands people type for a country that are neither its ISO code
 * nor a substring of its name. "uk" is the canonical case: the code is GB and
 * the name is "United Kingdom", so a naive code/name filter finds nothing.
 *
 * Keys are matched against the whole normalised query (lowercase, no dots),
 * never as substrings, so adding "us" cannot make every query starting with
 * "us" behave oddly.
 */
const ALIAS_TO_ISO: Record<string, string> = {
  uk: 'GB',
  'great britain': 'GB',
  britain: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  usa: 'US',
  us: 'US',
  america: 'US',
  uae: 'AE',
  emirates: 'AE',
  holland: 'NL',
  burma: 'MM',
  'ivory coast': 'CI',
  'czech republic': 'CZ',
  'south korea': 'KR',
  korea: 'KR',
  'north korea': 'KP',
  'cape verde': 'CV',
  swaziland: 'SZ',
  'east timor': 'TL',
  vatican: 'VA',
  'holy see': 'VA',
  macau: 'MO',
  macao: 'MO',
  russia: 'RU',
};

export function normalizeCountryQuery(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\./g, '');
}

/** ISO code a whole-word shorthand points at, or null. */
export function countryAliasCode(query: string): string | null {
  return ALIAS_TO_ISO[normalizeCountryQuery(query)] ?? null;
}

/** Every shorthand for an ISO code (used to widen fuzzy-search text). */
export function countryAliasesFor(code: string): string[] {
  const iso = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return [];
  return Object.entries(ALIAS_TO_ISO).filter(([, value]) => value === iso).map(([alias]) => alias);
}

/**
 * Ordering for filtered country lists: an exact code or shorthand match first,
 * then names that start with the query, then the rest. Stable sort input order
 * is preserved inside each bucket.
 */
export function countrySearchRank(query: string, code: string, name: string): number {
  const q = normalizeCountryQuery(query);
  if (!q) return 0;
  if (code.toLowerCase() === q || countryAliasCode(q) === code.toUpperCase()) return 0;
  if (normalizeCountryQuery(name).startsWith(q)) return 1;
  return 2;
}

/** One predicate for every country list/search in the app. */
export function countryMatches(query: string, code: string, name: string): boolean {
  const q = normalizeCountryQuery(query);
  if (!q) return true;
  if (code.toLowerCase() === q) return true;
  if (normalizeCountryQuery(name).includes(q)) return true;
  return countryAliasCode(q) === code.toUpperCase();
}
