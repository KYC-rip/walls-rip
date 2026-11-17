import { defineMiddleware } from 'astro:middleware';
import { canonicalPath, crossSiteFormPost, needsTrailingSlashRedirect } from './lib/security';

/**
 * Per-request policy shared by both origins:
 *  - one canonical URL per page (no trailing slash),
 *  - a same-origin rule for HTML form POSTs that does not rely on an Origin
 *    header (Tor Browser / privacy browsers omit it for some submissions),
 *  - a deny-by-default CSP with no third-party origins.
 *
 * Caching is left to the pages themselves; transactional pages send no-store.
 */

function securityHeaders(headers: Headers, url: URL) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // HSTS is meaningless on .onion and only correct on an HTTPS origin.
  if (!__ONION__ && url.protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Report-only first (Phase A acceptance). Phase D flips this to enforcement
  // once the Tor mirror has been exercised end to end. `default-src 'none'`
  // already blocks scripts; JSON-LD is a data block, not executable script.
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

  if (needsTrailingSlashRedirect(context.request, url.pathname)) {
    return new Response(null, {
      status: 301,
      headers: {
        location: canonicalPath(url.pathname) + url.search,
        'cache-control': 'public, max-age=86400',
      },
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
  // only meaningful in a build.
  const headers = new Headers(response.headers);
  if (import.meta.env.PROD) securityHeaders(headers, url);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
