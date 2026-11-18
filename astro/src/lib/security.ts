/**
 * Pure request-policy helpers, kept out of middleware so they can be tested
 * without the `astro:middleware` virtual module.
 */

const FORM_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_CONTENT = /^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)/;

/**
 * Reject a cross-origin HTML form POST.
 *
 * An Origin header is authoritative when present; Tor Browser and privacy
 * browsers sometimes omit it, so `Sec-Fetch-Site` is the fallback. A request
 * with neither signal is allowed — it cannot be forged into a cross-site POST
 * by a browser, and non-browser clients are not the CSRF threat model.
 */
export function crossSiteFormPost(request: Request): boolean {
  if (!FORM_METHODS.has(request.method)) return false;
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!FORM_CONTENT.test(contentType)) return false;

  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') {
    try {
      return new URL(origin).host !== new URL(request.url).host;
    } catch {
      return true;
    }
  }
  return request.headers.get('sec-fetch-site') === 'cross-site';
}

/** `/a/b/` → `/a/b`; `//` and `/` stay `/`; never returns an empty path. */
export function canonicalPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

/** True when the request is a GET/HEAD that needs the trailing-slash 301. */
export function needsTrailingSlashRedirect(request: Request, pathname: string): boolean {
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    pathname.length > 1 &&
    pathname.endsWith('/')
  );
}
