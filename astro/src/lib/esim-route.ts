import type { AstroGlobal } from 'astro';
import { fetchDestination } from './data';
import { localePath, type Lang } from './i18n';

/**
 * `/esim?c=TH` is the country shortcut used by every product link. The
 * destination page is the canonical plan browser, so resolve the slug and
 * redirect there. Returns null when the page should render normally.
 *
 * Runs in the route (not the page component) because a redirect returned from
 * a child component cannot replace the response once streaming has started.
 */
export async function redirectEsimCountry(
  astro: AstroGlobal,
  lang: Lang,
): Promise<Response | null> {
  if (astro.url.searchParams.get('t')) return null;
  const country = astro.url.searchParams.get('c');
  if (!country) return null;

  const payload = await fetchDestination(astro.locals, country);
  if (!payload || payload.esim.planCount < 5) return null;

  const target = localePath(`/destination/${payload.country.slug}`, lang);
  const theme = astro.url.searchParams.get('theme');
  return new Response(null, {
    status: 302,
    headers: {
      location: theme ? `${target}?theme=${encodeURIComponent(theme)}` : target,
      'cache-control': 'public, max-age=300',
    },
  });
}
