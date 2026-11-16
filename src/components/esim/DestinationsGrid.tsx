import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface Destination {
  code: string;
  name: string;
  fromUsd: number;
  planCount: number;
}

interface FallbackCountry { code: string; name: string }

interface DestinationsGridProps {
  destinations: Destination[];
  fallbackCountries: FallbackCountry[];
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (code: string) => void;
}

const matches = (query: string, code: string, name: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return code.toLowerCase() === q || name.toLowerCase().includes(q);
};

export function DestinationsGrid({
  destinations,
  fallbackCountries,
  loading,
  search,
  onSearch,
  onSelect,
}: DestinationsGridProps) {
  const { t } = useTranslation();

  type Card = { code: string; name: string; fromUsd: number | null; planCount: number | null };
  const priced = destinations.length > 0;
  const items: Card[] = (priced
    ? destinations
    : fallbackCountries.map(c => ({ code: c.code, name: c.name, fromUsd: null, planCount: null }))
  ).filter(item => matches(search, item.code, item.name));

  return (
    <div className="space-y-4">
      <div className="relative">
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
            return (
              <button
                key={code}
                onClick={() => onSelect(code)}
                className="group flex min-h-24 flex-col justify-between gap-3 rounded-sm border border-wr-border bg-wr-surface/50 p-3 text-left transition-colors hover:border-wr-accent hover:bg-wr-accent/5"
              >
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
                      {count} {t('esim.plans_available', 'plans')}
                    </span>
                  )}
                </div>
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
