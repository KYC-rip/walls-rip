// CF Pages catch-all — SPA routing + server-side OG meta injection for social crawlers

const SITE = 'https://walls.rip';

const OG_META: Record<string, { title: string; description: string; image: string; schemas?: Record<string, unknown>[] }> = {
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

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  // Let static assets through
  if (url.pathname.match(/\.(js|css|svg|png|jpg|ico|woff2?|txt|xml|json|webmanifest)$/)) {
    return context.next();
  }

  // Get the base HTML
  const res = await context.env.ASSETS.fetch(new Request(new URL('/', url.origin), context.request));

  // Only inject OG tags for crawlers or if we have meta for this path
  const meta = OG_META[url.pathname];
  if (!meta) return res;

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

    return new Response(html, {
      headers: {
        ...Object.fromEntries(res.headers.entries()),
        'content-type': 'text/html; charset=utf-8',
      },
    });
  }

  // For regular users, just serve the SPA
  return res;
};
