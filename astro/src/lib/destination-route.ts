import type { AstroGlobal } from 'astro';
import landmarks from '../i18n/landmarks.json';
import { destinationFaqs } from './faqs';
import { loadDestinationPage, type DestinationPageData } from './destination-page';
import { type Lang, t } from './i18n';
import {
  breadcrumbSchema,
  faqSchema,
  fingerprint,
  organizationSchema,
  serviceOfferSchema,
  siteOrigin,
  websiteSchema,
} from './seo';

export interface DestinationRouteProps {
  data: DestinationPageData;
  lang: Lang;
  title: string;
  description: string;
  path: string;
  image: string;
  preloadImage?: string;
  jsonLd: unknown[];
}

export type DestinationRouteResult =
  | { kind: 'ok'; props: DestinationRouteProps }
  | { kind: 'redirect'; response: Response }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

/**
 * Shared by `/destination/[slug]` and `/[lang]/destination/[slug]`.
 * Redirects, 404s, caching and JSON-LD live here so the two routes cannot
 * drift.
 */
export async function prepareDestinationRoute(
  astro: AstroGlobal,
  lang: Lang,
  slug: string,
): Promise<DestinationRouteResult> {
  if (!slug) return { kind: 'not-found' };

  const result = await loadDestinationPage(astro, slug, lang);
  if (result.kind === 'redirect') {
    return {
      kind: 'redirect',
      response: new Response(null, {
        status: result.status,
        headers: { location: result.location, 'cache-control': 'public, max-age=300' },
      }),
    };
  }
  if (result.kind === 'not-found') return { kind: 'not-found' };
  if (result.kind === 'unavailable') return { kind: 'unavailable' };

  const { data } = result;
  const { payload } = data;
  const country = payload.country.name;
  const price = payload.esim.fromUsd ?? 0;
  const path = `/destination/${payload.country.slug}`;

  const etag = `W/"${fingerprint({
    etag: data.etag,
    search: astro.url.search,
    lang,
  })}"`;

  const headers = new Headers({
    etag,
    'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
    vary: 'Accept-Encoding',
  });

  const ifNoneMatch = astro.request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').map((tag) => tag.trim()).includes(etag)) {
    return { kind: 'redirect', response: new Response(null, { status: 304, headers }) };
  }

  astro.response.headers.set('etag', etag);
  for (const [name, value] of headers) {
    if (name !== 'etag') astro.response.headers.set(name, value);
  }

  const origin = siteOrigin(astro);
  const faqs = destinationFaqs(lang, country, price);
  const landmark = (landmarks as Record<string, unknown>)[payload.country.code.toUpperCase()];
  const preloadImage =
    landmark && /^[A-Za-z]{2}$/.test(payload.country.code)
      ? `/landmarks/${payload.country.code.toUpperCase()}.webp`
      : undefined;

  return {
    kind: 'ok',
    props: {
      data,
      lang,
      title: `${country} eSIM — instant data plans, no KYC | walls.rip`,
      description: t(
        lang,
        'destination.meta_description',
        { count: payload.esim.planCount, country, price: price.toFixed(2) },
        `Compare ${payload.esim.planCount} eSIM data plans for ${country} from $${price.toFixed(2)}. No KYC, instant QR delivery, pay with Monero or Lightning.`,
      ),
      path,
      image: '/og-esim.jpg',
      preloadImage,
      jsonLd: [
        organizationSchema(origin),
        websiteSchema(origin),
        serviceOfferSchema({
          origin,
          country,
          slug: payload.country.slug,
          planCount: payload.esim.planCount,
          fromUsd: payload.esim.fromUsd,
        }),
        breadcrumbSchema(origin, [
          { name: 'Home', path: '/' },
          { name: 'eSIM', path: '/esim' },
          { name: country, path },
        ]),
        faqSchema(faqs),
      ],
    },
  };
}
