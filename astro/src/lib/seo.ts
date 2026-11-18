import type { AstroGlobal } from 'astro';

export const CLEARNET_ORIGIN = 'https://walls.rip';

/**
 * The published Tor mirror. Advertised on the clearnet build through the
 * `Onion-Location` header (Tor Browser shows a switch button) and a footer
 * link. Never link or advertise it from the onion build itself.
 */
export const ONION_ORIGIN =
  'http://wallsg4qendpmhrqqoz2q2mctb4zcipprylxm7iqyi6d64yzqf2lxtyd.onion';

/**
 * Absolute URLs in canonical/OG/JSON-LD. The clearnet build always points at
 * walls.rip; the onion build points at whatever host the request arrived on
 * (the .onion address), because there is no other public identity there.
 */
export function siteOrigin(astro: AstroGlobal): string {
  if (__ONION__) {
    const origin = astro.url.origin;
    // The Node adapter reports http behind Caddy; keep the host, drop the scheme
    // problems by trusting the request origin for onion identity.
    return origin;
  }
  return CLEARNET_ORIGIN;
}

export function absolute(origin: string, path: string): string {
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function organizationSchema(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'walls.rip',
    url: origin,
    logo: absolute(origin, '/favicon.svg'),
    description:
      'No-account digital infrastructure: eSIM data, phone numbers, SMS verification and residential proxies. Pay with Monero, Lightning or USDT.',
  };
}

export function websiteSchema(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'walls.rip',
    url: origin,
  };
}

export function serviceOfferSchema(input: {
  origin: string;
  country: string;
  slug: string;
  planCount: number;
  fromUsd: number | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${input.country} eSIM data plans`,
    serviceType: 'eSIM Data Plans',
    areaServed: input.country,
    description: `${input.planCount} eSIM data plans for ${input.country} from $${(
      input.fromUsd ?? 0
    ).toFixed(2)}. No KYC, instant delivery.`,
    provider: { '@type': 'Organization', name: 'walls.rip', url: input.origin },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: (input.fromUsd ?? 0).toFixed(2),
      offerCount: input.planCount,
      availability: 'https://schema.org/InStock',
      url: absolute(input.origin, `/destination/${input.slug}`),
    },
  };
}

export function breadcrumbSchema(
  origin: string,
  items: Array<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolute(origin, item.path),
    })),
  };
}

export function faqSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

/** FNV-1a — a small, stable ETag input. Not a security primitive. */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
