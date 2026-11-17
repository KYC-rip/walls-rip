import { useState } from 'react';
import { Globe, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { localePath, resolveLang } from '../../utils/localePath';
import { countryMatches, countrySearchRank } from '../../utils/countryAliases';
import { compareDestinations } from '../../utils/popularDestinations';

export interface Destination {
  code: string;
  name: string;
  /** API-owned country slug; absent on rows built before the v3 index. */
  slug?: string;
  /** 'region' for multi-area bundles ("Asia (12 areas)"); country rows omit it. */
  kind?: 'region';
  fromUsd: number;
  planCount: number;
  /** False when a provider covers the country but cannot report a full plan list. */
  countComplete?: boolean;
}

interface FallbackCountry { code: string; name: string }

interface DestinationsGridProps {
  destinations: Destination[];
  fallbackCountries: FallbackCountry[];
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (code: string) => void;
  /** Jump to the Regional tab (regions + multi-area bundles). Optional. */
  onOpenRegions?: () => void;
}

const matches = (query: string, code: string, name: string) => countryMatches(query, code, name);

/** Storefront order matches the SimJuno reference: Popular (curated) | A–Z. */
type SortMode = 'popular' | 'az';
const SORT_KEY = 'walls_dest_sort';

function readSortMode(): SortMode {
  try {
    return localStorage.getItem(SORT_KEY) === 'az' ? 'az' : 'popular';
  } catch {
    return 'popular';
  }
}

export function DestinationsGrid({
  destinations,
  fallbackCountries,
  loading,
  search,
  onSearch,
  onSelect,
  onOpenRegions,
}: DestinationsGridProps) {
  const { t, i18n } = useTranslation();
  const lang = resolveLang(i18n.language);
  const [sortMode, setSortMode] = useState<SortMode>(readSortMode);

  const changeSort = (mode: SortMode) => {
    setSortMode(mode);
    try { localStorage.setItem(SORT_KEY, mode); } catch { /* private mode */ }
  };

  type Card = { code: string; name: string; slug?: string; fromUsd: number | null; planCount: number | null; countComplete?: boolean };
  const priced = destinations.length > 0;
  // The country grid stays countries: multi-area bundles are linked from the
  // Regional tab (and have their own /destination/<slug> pages).
  const countriesOnly = destinations.filter(d => d.kind !== 'region' && !/-AREAS$/i.test(d.code));
  const items: Card[] = (priced
    ? countriesOnly
    : fallbackCountries.map(c => ({ code: c.code, name: c.name, fromUsd: null, planCount: null }))
  ).filter(item => matches(search, item.code, item.name))
    // Relevance first while searching, then the chosen storefront order.
    .sort((a, b) => countrySearchRank(search, a.code, a.name) - countrySearchRank(search, b.code, b.name)
      || (sortMode === 'az' ? a.name.localeCompare(b.name) : compareDestinations(a, b)));

  return (
    <div className="space-y-4">
      {/* One toolbar row: search, the regions entrance, then the order toggle. */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="relative w-full md:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
          <input
            type="search"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('esim.destination_search', 'Where are you traveling?')}
            aria-label={t('esim.destination_search', 'Where are you traveling?')}
            className="min-h-12 w-full rounded-sm border border-wr-border bg-wr-base py-3 pl-10 pr-3 font-mono text-base text-current outline-none transition-colors placeholder-wr-dim/50 focus:border-wr-accent md:text-sm"
          />
        </div>

        {onOpenRegions && (
          <button
            type="button"
            onClick={onOpenRegions}
            className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm text-[11px] font-mono font-bold uppercase tracking-widest text-wr-accent transition-colors hover:text-wr-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base md:min-h-0 md:self-auto"
          >
            <Globe size={12} aria-hidden />
            {t('esim.regions_entry', 'Regions & global packages')}
            <span aria-hidden>→</span>
          </button>
        )}

        <div className="flex items-center gap-2 md:ml-auto">
          <span className="text-[11px] font-mono uppercase tracking-widest text-wr-dim">
            {t('esim.sort_by', 'Sort')}
          </span>
          {(['popular', 'az'] as SortMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              aria-pressed={sortMode === mode}
              onClick={() => changeSort(mode)}
              className={`inline-flex min-h-11 items-center rounded-sm border px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base md:min-h-0 ${sortMode === mode ? 'border-wr-accent bg-wr-accent text-black' : 'border-wr-border text-wr-dim hover:border-wr-accent/60 hover:text-current'}`}
            >
              {mode === 'popular' ? t('esim.sort_popular', 'Popular') : t('esim.sort_az', 'A–Z')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-sm border border-wr-border bg-wr-base/60" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 xl:grid-cols-4">
          {items.map(item => {
            const code = item.code;
            const name = item.name;
            const from = item.fromUsd;
            const count = item.planCount;
            // A partial count is a lower bound, not a fact: render "N+".
            const partial = item.countComplete === false;
            const cardClass = 'group flex min-h-24 flex-col justify-between gap-3 rounded-sm border border-wr-border bg-wr-surface/50 p-3 text-left transition-colors hover:border-wr-accent hover:bg-wr-accent/5';
            const body = (
              <>
                <div className="flex items-start gap-2">
                  <img
                    src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
                    alt=""
                    loading="lazy"
                    className="mt-0.5 h-4 w-6 shrink-0 rounded-xs object-cover"
                  />
                  <span className="min-w-0 text-sm font-bold leading-tight text-current">{name}</span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  {from != null ? (
                    <span className="font-mono text-[11px] text-wr-dim">
                      {t('esim.from_price', 'from')} <span className="text-base font-black text-wr-accent">${from.toFixed(2)}</span>
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-wr-dim">{t('esim.browse_plans', 'Browse plans')}</span>
                  )}
                  {count != null && count > 0 && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-wr-dim">
                      {count}{partial ? '+' : ''} {t('esim.plans_available', 'plans')}
                    </span>
                  )}
                </div>
              </>
            );
            // Rows without a slug (legacy v2 index / fallback list) keep the
            // in-place selection; everything else links to the public page.
            return item.slug ? (
              <Link
                key={code}
                to={localePath(`/destination/${item.slug}`, lang)}
                className={cardClass}
                aria-label={t('destination.view_page', { country: name, defaultValue: `${name} eSIM plans` })}
              >
                {body}
              </Link>
            ) : (
              <button key={code} onClick={() => onSelect(code)} className={cardClass}>
                {body}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-sm border border-wr-border bg-wr-base/50 px-4 py-6 text-center text-xs text-wr-dim">
          {t('esim.no_countries', 'No destinations match this search.')}
        </div>
      )}
    </div>
  );
}
