import type { APIRoute } from 'astro';
import { fetchRegionBundles } from '../lib/catalogue';
import { fetchDestinationIndex as fetchDestinations } from '../lib/data';
import { SUPPORTED_LANGS, localePath } from '../lib/i18n';

const STATIC_PAGES = ['/', '/esim', '/sms', '/phone', '/proxy', '/vpn', '/uk-sim', '/network', '/faq', '/api'];

function urlEntry(origin: string, path: string, lastmod: string): string {
  return `<url><loc>${origin}${path}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq></url>`;
}

export const GET: APIRoute = async ({ locals }) => {
  // The onion mirror is not indexed, and its addresses must never be copied
  // into a clearnet sitemap.
  if (__ONION__) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const origin = 'https://walls.rip';
  const lastmod = new Date().toISOString().slice(0, 10);
  const entries: string[] = [];

  for (const lang of SUPPORTED_LANGS) {
    if (lang === 'zh') continue;
    for (const page of STATIC_PAGES) entries.push(urlEntry(origin, localePath(page, lang), lastmod));
  }

  try {
    const [destinations, bundles] = await Promise.all([
      fetchDestinations(locals),
      fetchRegionBundles(locals),
    ]);

    for (const lang of SUPPORTED_LANGS) {
      if (lang === 'zh') continue;
      for (const row of destinations) {
        if ((row.planCount ?? 0) < 5) continue;
        entries.push(urlEntry(origin, localePath(`/destination/${row.slug}`, lang), lastmod));
      }
      for (const bundle of bundles) {
        entries.push(urlEntry(origin, localePath(`/destination/${bundle.slug}`, lang), lastmod));
      }
    }
  } catch {
    // A catalogue outage must not take the sitemap down: serve the static set.
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=1800, s-maxage=3600',
    },
  });
};
