import type { AstroGlobal } from 'astro';
import {
  DATA_FILTERS,
  DURATION_FILTERS,
  type ComparePlan,
  type DataFilter,
  type DestinationPayload,
  type DurationFilter,
  dataMatches,
  durationMatches,
  fetchComparePlans,
  fetchDestination,
  isBundle,
  parseDataFilter,
  parseDurationFilter,
} from './data';
import { type Lang, localePath } from './i18n';
import { fingerprint } from './seo';

export const PLAN_PAGE_SIZE = 12;

export interface DestinationPageData {
  payload: DestinationPayload;
  /** Buyable plan list; falls back to the cached six when compare is down. */
  plans: ComparePlan[];
  visiblePlans: ComparePlan[];
  totalMatching: number;
  dataFilter: DataFilter;
  durationFilter: DurationFilter;
  visibleCount: number;
  buyable: boolean;
  bundle: boolean;
  coverage: Array<{ country: string; operators: string[] }>;
  etag: string;
}

export type DestinationLoad =
  | { kind: 'ok'; data: DestinationPageData }
  | { kind: 'redirect'; status: 301 | 302; location: string }
  | { kind: 'not-found' };

/** Fallback list built from the destination payload (no buyable ids). */
function fallbackPlans(payload: DestinationPayload): ComparePlan[] {
  return payload.esim.plans.map((plan, index) => ({
    id: `cached:${payload.country.code}:${index}`,
    name: plan.name,
    country: payload.country.code,
    dataGB: plan.dataGB,
    durationDays: plan.durationDays,
    price: plan.price,
    currency: 'USD',
    speed: '3G/4G/5G',
  }));
}

function coverageFromPlans(plans: ComparePlan[]): Array<{ country: string; operators: string[] }> {
  const byCountry = new Map<string, Set<string>>();
  for (const plan of plans) {
    for (const entry of plan.coverage ?? []) {
      const country = String(entry.country || '').trim();
      if (!country) continue;
      const operators = byCountry.get(country) ?? new Set<string>();
      for (const operator of entry.operators ?? []) {
        const name = String(operator.name || '').trim();
        if (!name) continue;
        operators.add(operator.networkType ? `${name} (${operator.networkType})` : name);
      }
      byCountry.set(country, operators);
    }
  }
  return [...byCountry.entries()]
    .map(([country, operators]) => ({ country, operators: [...operators].sort() }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

function withTheme(location: string, url: URL): string {
  const theme = url.searchParams.get('theme');
  const skin = url.searchParams.get('skin');
  if (!theme && !skin) return location;
  const [path, existing] = location.split('?');
  const params = new URLSearchParams(existing ?? '');
  if (theme) params.set('theme', theme);
  if (skin) params.set('skin', skin);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Resolve one destination page: canonical slug, plan list, filters.
 *
 * The rules mirror the React page exactly:
 *  - unknown destination → 404 (never a thin page),
 *  - a non-canonical key (ISO code, wrong case) → 301 to the slug,
 *  - fewer than five funded plans → 302 into the full plan browser.
 */
export async function loadDestinationPage(
  astro: AstroGlobal,
  slug: string,
  lang: Lang,
): Promise<DestinationLoad> {
  const payload = await fetchDestination(astro.locals, slug);
  if (!payload) return { kind: 'not-found' };

  const canonical = payload.country.slug;
  if (canonical && canonical !== slug.toLowerCase()) {
    const target = withTheme(localePath(`/destination/${canonical}`, lang), astro.url);
    return { kind: 'redirect', status: 301, location: target };
  }

  if (payload.esim.planCount < 5) {
    const target = isBundle(payload.country.code)
      ? '/esim?t=regional'
      : `/esim?c=${payload.country.code}`;
    return { kind: 'redirect', status: 302, location: withTheme(localePath(target, lang), astro.url) };
  }

  const comparePlans = await fetchComparePlans(astro.locals, payload.country.code);
  const plans = comparePlans.length > 0 ? comparePlans : fallbackPlans(payload);

  const dataFilter = parseDataFilter(astro.url.searchParams.get('data'));
  const durationFilter = parseDurationFilter(astro.url.searchParams.get('dur'));
  const matching = plans.filter(
    (plan) => dataMatches(dataFilter, plan.dataGB) && durationMatches(durationFilter, plan.durationDays),
  );

  const requested = Number.parseInt(astro.url.searchParams.get('n') ?? '', 10);
  const visibleCount = Number.isFinite(requested)
    ? Math.min(Math.max(requested, PLAN_PAGE_SIZE), matching.length)
    : PLAN_PAGE_SIZE;

  const bundle = isBundle(payload.country.code);

  return {
    kind: 'ok',
    data: {
      payload,
      plans,
      visiblePlans: matching.slice(0, visibleCount),
      totalMatching: matching.length,
      dataFilter,
      durationFilter,
      visibleCount,
      buyable: comparePlans.length > 0,
      bundle,
      coverage: bundle ? coverageFromPlans(comparePlans) : [],
      etag: fingerprint({
        country: payload.country,
        planCount: payload.esim.planCount,
        fromUsd: payload.esim.fromUsd,
        ids: plans.map((plan) => [plan.id, plan.price]),
        lang,
        dataFilter,
        durationFilter,
        visibleCount,
      }),
    },
  };
}

export const FILTER_LABELS = { DATA_FILTERS, DURATION_FILTERS };
