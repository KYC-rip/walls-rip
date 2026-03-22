// CF Pages catch-all — SPA routing + server-side OG meta injection for social crawlers

const SITE = 'https://walls.rip';

const OG_META: Record<string, { title: string; description: string; image: string }> = {
  '/': {
    title: 'walls.rip — Break walls for anonymous communication',
    description: 'Anonymous communication toolkit. Ghost Mail, Dead Drop, SMS Wall, eSIM, Proxy, Ghost Chat — no identity, no logs, no walls.',
    image: '/og-image.jpg',
  },
  '/mail': {
    title: 'Ghost Mail — Burner email that burns',
    description: 'Disposable encrypted email inboxes. No signup, no identity. PGP encryption, custom domains, auto-destruct timers.',
    image: '/og-ghostmail.jpg',
  },
  '/drop': {
    title: 'Dead Drop — Self-destructing secrets',
    description: 'Create encrypted, self-destructing messages. AES-256-GCM client-side encryption. Server never sees your data.',
    image: '/og-deaddrop.jpg',
  },
  '/sms': {
    title: 'SMS Wall — Anonymous phone verification',
    description: 'Get temporary phone numbers for anonymous SMS verification. 150+ countries, 1700+ services. Pay with XMR.',
    image: '/og-sms.jpg',
  },
  '/esim': {
    title: 'eSIM — Anonymous mobile data worldwide',
    description: 'Buy anonymous eSIM data plans for 120+ countries. No KYC, no registration. 3G/4G/5G. Pay with Monero or Lightning.',
    image: '/og-esim.jpg',
  },
  '/proxy': {
    title: 'Proxy Wall — Anonymous proxy access',
    description: 'Get anonymous residential, datacenter, and mobile proxies. Global coverage, SOCKS5/HTTP. Pay with XMR or Lightning.',
    image: '/og-proxy.jpg',
  },
  '/comms': {
    title: 'Ghost Chat — PGP-encrypted comms over Nostr',
    description: 'End-to-end encrypted messaging via decentralized Nostr relays. Ephemeral identities, no server trust.',
    image: '/og-ghostchat.jpg',
  },
  '/api': {
    title: 'API Reference — walls.rip',
    description: 'walls.rip public API documentation. Programmatic access to SMS, eSIM, Proxy, and Dead Drop. No API keys needed.',
    image: '/og-api.jpg',
  },
  '/faq': {
    title: 'FAQ — walls.rip',
    description: 'Frequently asked questions about walls.rip anonymous communication tools.',
    image: '/og-image.jpg',
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
    <meta name="description" content="${meta.description}" />`;

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
