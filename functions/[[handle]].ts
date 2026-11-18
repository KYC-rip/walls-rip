// CF Pages catch-all — SPA routing + server-side OG meta injection for social crawlers

const SITE = 'https://walls.rip';

const OG_META: Record<string, { title: string; description: string; image: string; schemas?: Record<string, unknown>[] }> = {
  '/vpn': {
    title: 'Private VPN — walls.rip',
    description: 'Prepaid VPN access with WireGuard, OpenVPN and VLESS configuration downloads. Pay from your shared walls wallet.',
    image: '/og-image.jpg',
  },
  '/phone': {
    title: 'Phone Plans — walls.rip',
    description: 'Compare US and global phone eSIM plans with voice, SMS and data coverage.',
    image: '/og-image.jpg',
  },
  '/uk-sim': {
    title: 'Long-term UK number — walls.rip',
    description: 'A UK +44 phone eSIM for receiving SMS on your own phone. Prepaid terms and renewals, paid from your walls wallet.',
    image: '/og-image.jpg',
  },
  '/topup': {
    title: 'Renew a UK number — walls.rip',
    description: 'Extend a UK +44 line bought through walls.rip by 6, 12 or 24 months from the same wallet. Keep the same eSIM and QR.',
    image: '/og-image.jpg',
  },
  '/': {
    title: 'walls.rip — Break walls for anonymous communication',
    description: 'Anonymous communication toolkit. Ghost Mail, Dead Drop, SMS Wall, eSIM, Proxy, Ghost Chat — no identity, no logs, no walls.',
    image: '/og-image.jpg',
    schemas: [
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'walls.rip', url: 'https://walls.rip', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web', description: 'Anonymous communication toolkit. Burner email, encrypted dead drops, anonymous SMS verification, PGP chat over Nostr.' },
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip', logo: 'https://walls.rip/favicon.svg', description: 'Anonymous communication toolkit.' },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://walls.rip/' },
        { '@type': 'ListItem', position: 2, name: 'Ghost Mail', item: 'https://walls.rip/mail' },
        { '@type': 'ListItem', position: 3, name: 'Dead Drop', item: 'https://walls.rip/drop' },
        { '@type': 'ListItem', position: 4, name: 'SMS Wall', item: 'https://walls.rip/sms' },
        { '@type': 'ListItem', position: 5, name: 'Ghost Chat', item: 'https://walls.rip/comms' },
        { '@type': 'ListItem', position: 6, name: 'API', item: 'https://walls.rip/api' },
      ]},
    ],
  },
  '/mail': {
    title: 'Ghost Mail — Burner email that burns',
    description: 'Disposable encrypted email inboxes. No signup, no identity. PGP encryption, custom domains, auto-destruct timers.',
    image: '/og-ghostmail.jpg',
    schemas: [
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Ghost Mail', url: 'https://walls.rip/mail', applicationCategory: 'CommunicationApplication', operatingSystem: 'Web', description: 'Disposable encrypted email inboxes with PGP support, custom domains, and auto-destruct timers.', offers: { '@type': 'Offer', price: '0.15', priceCurrency: 'USD' } },
    ],
  },
  '/drop': {
    title: 'Dead Drop — Self-destructing secrets',
    description: 'Create encrypted, self-destructing messages. AES-256-GCM client-side encryption. Server never sees your data.',
    image: '/og-deaddrop.jpg',
    schemas: [
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Dead Drop', url: 'https://walls.rip/drop', applicationCategory: 'SecurityApplication', operatingSystem: 'Web', description: 'Self-destructing encrypted messages. AES-256-GCM client-side encryption.', featureList: 'AES-256-GCM encryption, Self-destructing messages, Client-side encryption, Zero knowledge server' },
    ],
  },
  '/sms': {
    title: 'SMS Wall — Anonymous phone verification',
    description: 'Get temporary phone numbers for anonymous SMS verification. 150+ countries, 1700+ services. Pay with XMR.',
    image: '/og-sms.jpg',
    schemas: [
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'SMS Wall', url: 'https://walls.rip/sms', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web', description: 'Get temporary phone numbers for anonymous SMS verification. 150+ countries, 1700+ services.', offers: { '@type': 'Offer', price: '0.10', priceCurrency: 'USD' } },
      { '@context': 'https://schema.org', '@type': 'Service', name: 'SMS Wall — Anonymous SMS Verification', serviceType: 'SMS Verification', areaServed: 'Worldwide', provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' } },
    ],
  },
  '/esim': {
    title: 'eSIM — Anonymous mobile data worldwide',
    description: 'Buy anonymous eSIM data plans for 120+ countries. No KYC, no registration. 3G/4G/5G. Pay with Monero or Lightning.',
    image: '/og-esim.jpg',
    schemas: [
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'eSIM', url: 'https://walls.rip/esim', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web', description: 'Anonymous eSIM data plans for 120+ countries. No KYC, no registration. 3G/4G/5G.', offers: { '@type': 'Offer', price: '0.80', priceCurrency: 'USD' } },
      { '@context': 'https://schema.org', '@type': 'Service', name: 'eSIM — Anonymous Data Plans', serviceType: 'eSIM Data Plans', areaServed: 'Worldwide', provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' } },
    ],
  },
  '/proxy': {
    title: 'Proxy Wall — Anonymous proxy access',
    description: 'Get anonymous residential, datacenter, and mobile proxies. Global coverage, SOCKS5/HTTP. Pay with XMR or Lightning.',
    image: '/og-proxy.jpg',
    schemas: [
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Proxy Wall', url: 'https://walls.rip/proxy', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web', description: 'Anonymous residential, datacenter, and mobile proxies. SOCKS5 & HTTP. Global coverage.', offers: { '@type': 'Offer', price: '3.00', priceCurrency: 'USD' } },
      { '@context': 'https://schema.org', '@type': 'Service', name: 'Proxy Wall — Anonymous Proxy Access', serviceType: 'Anonymous Proxy Access', areaServed: 'Worldwide', provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' } },
    ],
  },
  '/comms': {
    title: 'Ghost Chat — PGP-encrypted comms over Nostr',
    description: 'End-to-end encrypted messaging via decentralized Nostr relays. Ephemeral identities, no server trust.',
    image: '/og-ghostchat.jpg',
    schemas: [
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Ghost Chat', url: 'https://walls.rip/comms', applicationCategory: 'CommunicationApplication', operatingSystem: 'Web', description: 'End-to-end encrypted messaging via decentralized Nostr relays. Ephemeral identities, no server trust.', featureList: 'PGP encryption, Nostr relays, Ephemeral identities, No server trust' },
    ],
  },
  '/api': {
    title: 'API Reference — walls.rip',
    description: 'walls.rip public API documentation. Programmatic access to SMS, eSIM, Proxy, and Dead Drop. No API keys needed.',
    image: '/og-api.jpg',
    schemas: [
      { '@context': 'https://schema.org', '@type': 'TechArticle', headline: 'walls.rip API Reference', url: 'https://walls.rip/api', description: 'Public API documentation for walls.rip anonymous communication tools.', author: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' } },
      { '@context': 'https://schema.org', '@type': 'WebAPI', name: 'walls.rip API', url: 'https://api.kyc.rip/v1/tools', description: 'REST API for anonymous communication tools. No API keys required.', documentation: 'https://walls.rip/api', provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' } },
    ],
  },
  '/faq': {
    title: 'FAQ — walls.rip',
    description: 'Frequently asked questions about walls.rip anonymous communication tools.',
    image: '/og-image.jpg',
    schemas: [
      { '@context': 'https://schema.org', '@type': 'FAQPage', name: 'walls.rip FAQ', url: 'https://walls.rip/faq', description: 'Frequently asked questions about walls.rip anonymous communication tools.' },
    ],
  },
};

function isCrawler(ua: string): boolean {
  return /bot|crawl|spider|slurp|facebook|twitter|telegram|discord|slack|whatsapp|signal|preview|embed|curl|wget|headless/i.test(ua);
}

/** The published Tor mirror, advertised to Tor Browser on HTML responses. */
const ONION_ORIGIN =
  'http://wallsg4qendpmhrqqoz2q2mctb4zcipprylxm7iqyi6d64yzqf2lxtyd.onion';

/** Add `Onion-Location` to an HTML response so Tor Browser offers the switch. */
function withOnionLocation(res: Response, url: URL): Response {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return res;
  const headers = new Headers(res.headers);
  headers.set('Onion-Location', ONION_ORIGIN + url.pathname + url.search);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

// The catch-all Function runs before `_redirects`, so ISO-code and
// sub-threshold redirects are resolved here from a build-generated map:
//   "TH"/"th" -> "thailand" (301 to the slug page)
//   "iran"/"IR" -> "/esim?c=IR" (302, country has < 5 funded plans)
// Memoized per isolate; a failed read falls back to normal SPA routing.
let destinationRedirects: Record<string, string> | null = null;
let destinationRedirectsPending: Promise<Record<string, string>> | null = null;
async function loadDestinationRedirects(assets: Fetcher, origin: string): Promise<Record<string, string>> {
  if (destinationRedirects) return destinationRedirects;
  if (!destinationRedirectsPending) {
    destinationRedirectsPending = assets.fetch(new Request(new URL('/destination-redirects.json', origin)))
      .then(res => res.ok ? res.json<Record<string, string>>() : {})
      .then(map => { destinationRedirects = map; return map; })
      .catch(() => ({}))
      .finally(() => { destinationRedirectsPending = null; });
  }
  return destinationRedirectsPending;
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  // ── Astro cutover (2026-11-18) ─────────────────────────────────────────
  // The commerce surface is server-rendered by the walls-astro Worker; the
  // rest of walls.rip (home, Ghost Mail, Dead Drop, Comms, top-ups) stays on
  // this Pages project. A Worker route cannot override a Pages custom domain,
  // so the Function proxies the page paths explicitly. Origin is rewritten to
  // the upstream host so the Worker's same-origin form check accepts the POST
  // (the browser still sends Origin: https://walls.rip).
  const ASTRO_ORIGIN = 'https://astro.walls.rip';
  const ASTRO_EXACT = new Set([
    '/esim', '/sms', '/phone', '/proxy', '/vpn', '/uk-sim', '/network',
    '/faq', '/api', '/checkout', '/pay', '/order', '/robots.txt', '/sitemap.xml',
    // Exact, not a /phone/ prefix: /phone/topup and /phone/uk-esim are React.
    '/phone/purchase',
  ]);
  // /sms/ carries the no-JS purchase + code pages; React has no /sms/* route,
  // so the prefix cannot shadow it.
  const ASTRO_PREFIXES = ['/destination/', '/actions/', '/flags/', '/sms/'];
  // PNG icon set + favicon the Astro pages reference (Tor Browser does not
  // paint SVG). Exact paths, because /icons/ itself belongs to the React PWA
  // (/icons/icon-192.png etc.) and must stay on Pages.
  const ASTRO_ASSETS = new Set([
    '/favicon.png',
    '/icons/arrow.png', '/icons/calendar.png', '/icons/check.png',
    '/icons/chevron.png', '/icons/clock.png', '/icons/close.png',
    '/icons/globe.png', '/icons/lock.png', '/icons/message.png',
    '/icons/phone.png', '/icons/refresh.png', '/icons/shield.png',
    '/icons/wifi.png', '/icons/zap.png',
  ]);
  const LOCALES = ['es', 'ja', 'pt', 'ru', 'zh-TW', 'zh'];
  const localeMatch = url.pathname.match(/^\/(es|ja|pt|ru|zh-TW|zh)(\/.*)?$/);
  // Localized commerce paths are server-rendered too; localized Mail/Drop/
  // Comms and the home page stay on React.
  const effectivePath = localeMatch ? (localeMatch[2] || '/') : url.pathname;
  const isAstroPath = ASTRO_EXACT.has(effectivePath)
    || ASTRO_ASSETS.has(effectivePath)
    || ASTRO_PREFIXES.some((prefix) => effectivePath.startsWith(prefix));
  if (isAstroPath) {
    // Keep the locale prefix upstream; effectivePath is only for matching.
    const target = new URL(url.pathname + url.search, ASTRO_ORIGIN);
    const headers = new Headers(context.request.headers);
    headers.set('origin', ASTRO_ORIGIN);
    headers.set('referer', ASTRO_ORIGIN + url.pathname);
    const upstream = await fetch(new Request(target, {
      method: context.request.method,
      headers,
      body: context.request.method === 'GET' || context.request.method === 'HEAD'
        ? undefined
        : context.request.body,
      redirect: 'manual',
    }));
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  }

  // Let static assets through
  if (url.pathname.match(/\.(js|css|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|txt|xml|json|webmanifest|html)$/)) {
    return context.next();
  }

  // Static HTML pages (CF Pages strips .html extension)
  const staticPages = ['/wall-test', '/wall-test2', '/wall-test3'];
  if (staticPages.includes(url.pathname)) {
    return context.next();
  }

  // Prerendered destination pages (Phase 2). These carry their own title/OG/
  // JSON-LD and a <noscript> summary, so they deliberately bypass the geo and
  // crawler injection below. Only an asset with the exact slug marker is
  // served: a 200 SPA shell must never masquerade as a prerendered page.
  // Countries below the 5-plan threshold have no file and fall through.
  const destination = url.pathname.match(/^\/destination\/([A-Za-z0-9-]+)(\/?)$/);
  if (destination) {
    const key = destination[1];
    const redirects = await loadDestinationRedirects(context.env.ASSETS, url.origin);
    const target = redirects[key] ?? redirects[key.toUpperCase()] ?? redirects[key.toLowerCase()];
    // Never redirect a page to itself (a self entry would loop forever).
    if (target && target !== key) {
      const isPath = target.startsWith('/');
      return Response.redirect(
        new URL(isPath ? target : `/destination/${target}`, url.origin).toString(),
        isPath ? 302 : 301,
      );
    }
    const slug = key;
    // Directory indexes are served at the trailing-slash form by the asset
    // layer; keep the public URL slash-free. A _redirects rule would loop
    // against the asset layer's own canonicalization, so do it here.
    if (destination[2] === '/') {
      return Response.redirect(new URL(`/destination/${slug}`, url.origin).toString(), 301);
    }
    const asset = await context.env.ASSETS.fetch(
      new Request(new URL(`/destination/${slug}/`, url.origin)),
    );
    if (asset.status === 200 && (asset.headers.get('content-type') || '').includes('text/html')) {
      const html = await asset.text();
      if (html.includes(`name="x-prerender" content="${slug}"`)) {
        return withOnionLocation(new Response(html, {
          status: 200,
          headers: { ...Object.fromEntries(asset.headers.entries()), 'content-type': 'text/html; charset=utf-8' },
        }), url);
      }
    }
  }

  // Get the base HTML
  const res = await context.env.ASSETS.fetch(new Request(new URL('/', url.origin), context.request));

  // Only inject OG tags for crawlers or if we have meta for this path
  const meta = OG_META[url.pathname];
  if (!meta) return withOnionLocation(res, url);

  const ua = context.request.headers.get('user-agent') || '';

  // For crawlers, inject OG meta tags into the HTML head
  if (isCrawler(ua)) {
    let html = await res.text();
    const ogImage = `${SITE}${meta.image}`;
    const ogUrl = `${SITE}${url.pathname}`;

    const ldJsonScripts = (meta.schemas || [])
      .map(s => `    <script type="application/ld+json">${JSON.stringify(s)}</script>`)
      .join('\n');

    const ogTags = `
    <meta property="og:title" content="${meta.title}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="walls.rip" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${meta.title}" />
    <meta name="twitter:description" content="${meta.description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta name="description" content="${meta.description}" />
${ldJsonScripts}`;

    html = html.replace('</head>', `${ogTags}\n</head>`);

    return withOnionLocation(new Response(html, {
      headers: {
        ...Object.fromEntries(res.headers.entries()),
        'content-type': 'text/html; charset=utf-8',
      },
    }), url);
  }

  // For regular users, inject geo country code for client-side use
  const geoCountry = context.request.headers.get('CF-IPCountry') || '';
  if (geoCountry && url.pathname === '/esim') {
    let html = await res.text();
    html = html.replace('</head>', `<script>window.__GEO_COUNTRY="${geoCountry}";</script>\n</head>`);
    return withOnionLocation(new Response(html, {
      headers: { ...Object.fromEntries(res.headers.entries()), 'content-type': 'text/html; charset=utf-8' },
    }), url);
  }

  return withOnionLocation(res, url);
};
