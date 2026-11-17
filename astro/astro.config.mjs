// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';

/**
 * One source tree, two builds.
 *
 *   astro build                 → Cloudflare Workers (clearnet)
 *   WALLS_TARGET=onion astro build → standalone Node server (the Tor box)
 *
 * The only differences are the adapter and the `__ONION__` build constant;
 * every page is server-rendered and ships zero client JavaScript, so the two
 * origins render the same bytes.
 */
const onion = process.env.WALLS_TARGET === 'onion';

export default defineConfig({
  output: 'server',
  adapter: onion
    ? node({ mode: 'standalone' })
    : cloudflare({ imageService: 'passthrough' }),
  // Origin checks for form POSTs live in src/middleware.ts. Astro's strict
  // check rejects Tor Browser / privacy-browser POSTs, which send no usable
  // Origin header for some form submissions.
  security: { checkOrigin: false },
  build: {
    // Inline every stylesheet into <head>. A cold .onion load has no JS to
    // cover a late stylesheet, and Tor latency makes the extra round-trip
    // visible as a flash of unstyled content.
    inlineStylesheets: 'always',
  },
  trailingSlash: 'never',
  compressHTML: true,
  devToolbar: { enabled: false },
  vite: {
    define: {
      __ONION__: JSON.stringify(onion),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      // Build-time API origin. Both adapters read the same constant; there is
      // no per-request runtime env lookup (Astro 7 removed locals.runtime).
      __WALLS_API_BASE__: JSON.stringify(
        (process.env.WALLS_API_BASE || 'https://api.kyc.rip').replace(/\/+$/, ''),
      ),
    },
    // Preview tunnels during review (dev only).
    server: { allowedHosts: ['.luc.wtf'] },
  },
});
