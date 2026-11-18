/**
 * Provider names that must never reach visible copy.
 *
 * The API is white-label for costs and engine fields, but plan names and a few
 * hand-written strings can still carry a provider brand. Everything the user
 * sees goes through here (names) or is checked by the source-scan test.
 */
const PROVIDER_TOKENS: RegExp[] = [
  /simjuno/gi,
  /pikasim/gi,
  /smspool/gi,
  /buyukesim/gi,
  /herosms/gi,
  /fivesim/gi,
  /proxyapp/gi,
  /el\s*capo/gi,
];

const FORBIDDEN_IN_COPY = ['pikasim', 'simjuno', 'smspool', 'buyukesim', 'herosms', 'fivesim', 'proxyapp'];

/** Remove provider brands from a provider-composed plan name. */
export function cleanPlanName(name: string): string {
  if (!name) return name;
  let out = name;
  for (const pattern of PROVIDER_TOKENS) out = out.replace(pattern, '');
  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '')
    .trim();
  // A name that was only the brand falls back to the original rather than an
  // empty label; the caller still has a usable string.
  return out || name.trim();
}

/** Used by the source-scan test. */
export function containsProviderName(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_IN_COPY.some((token) => lower.includes(token));
}
