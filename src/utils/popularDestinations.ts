/**
 * Operator-curated demand order for destination lists, modeled on the SimJuno
 * reference page: the countries people actually buy first, then the rest
 * alphabetically. Edit this array to change the storefront order — nothing else
 * depends on it.
 *
 * Codes that never appear here (or are no longer in the catalog) simply sort
 * into the alphabetical tail.
 */
export const POPULAR_DESTINATIONS: string[] = [
  // Top demand (operator list, 2026-11)
  'US', 'JP', 'AU', 'DE', 'CN', 'TH', 'CA', 'TR', 'CH', 'SG',
  'VN', 'GB', 'BR', 'ID', 'AT', 'MX', 'MY', 'AR', 'FR', 'HK',
  'KR', 'IT', 'NZ', 'IN', 'HR', 'GR', 'NL', 'EG', 'PE', 'DK',
  'ES', 'PH', 'MA', 'CL', 'NO', 'PT', 'HU', 'BE', 'CZ', 'IS',
  'AE', 'IE', 'SE', 'KH', 'ZA', 'PL', 'AL', 'FI', 'RO', 'LK',
  'IL', 'SA', 'QA', 'MT', 'BH', 'RS', 'MV', 'CO', 'KW', 'BG',
];

const RANK = new Map(POPULAR_DESTINATIONS.map((code, index) => [code, index]));

/** 0-based popularity position, or MAX_SAFE_INTEGER when unlisted. */
export function destinationRank(code: string): number {
  return RANK.get(String(code || '').toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
}

/** Popular first (curated order), then everything else alphabetically. */
export function compareDestinations(a: { code: string; name: string }, b: { code: string; name: string }): number {
  const ra = destinationRank(a.code);
  const rb = destinationRank(b.code);
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name);
}
