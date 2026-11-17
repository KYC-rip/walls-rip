import { defineMiddleware } from 'astro:middleware';

/**
 * Per-request policy shared by both origins:
 *  - one canonical URL per page (no trailing slash),
 *  - a same-origin rule for HTML form POSTs that does not rely on an Origin
 *    header (Tor Browser / privacy browsers omit it for some submissions),
 *  - a deny-by-default CSP with no third-party origins,
 *  - no-store-free caching left to the pages themselves.
 *
 * Form POSTs do not exist yet in Phase A; the guard is here so Phase C cannot
 * ship a cross-site POST hole by forgetting it.
 */

const FORM_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_CONTENT = /^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)/;

function crossSiteFormPost(request: Request): boolean {
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
  // No usable Origin: trust the browser's own fetch-site label when present.
  return request.headers.get('sec-fetch-site') === 'cross-site';
}

function securityHeaders(headers: Headers, url: URL) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // HSTS is meaningless on .onion and is only correct on an HTTPS origin.
  if (!__ONION__ && url.protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Report-only first (Phase A acceptance). Phase D flips this to enforcement
  // once the Tor mirror has been exercised end to end.
  const csp = [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "manifest-src 'self'",
    "connect-src 'self'",
  ].join('; ');
  headers.set('Content-Security-Policy-Report-Only', csp);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  if (
    (context.request.method === 'GET' || context.request.method === 'HEAD') &&
    url.pathname.length > 1 &&
    url.pathname.endsWith('/')
  ) {
    const target = url.pathname.replace(/\/+$/, '') + url.search;
    return new Response(null, {
      status: 301,
      headers: { location: target, 'cache-control': 'public, max-age=86400' },
    });
  }

  if (crossSiteFormPost(context.request)) {
    return new Response('Cross-site form submission refused', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const response = await next();

  // The dev server injects HMR scripts; production ships none, so the CSP is
  // only meaningful (and only safe to claim) in a build.
  const headers = new Headers(response.headers);
  if (import.meta.env.PROD) securityHeaders(headers, url);

  if (headers === response.headers) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
