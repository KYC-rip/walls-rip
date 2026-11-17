import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { apiClient } from '../services/client';
import { localePath, resolveLang } from '../utils/localePath';
import { matchScore } from '../utils/fuzzy';
import { countryAliasCode, countryAliasesFor } from '../utils/countryAliases';
import { NAV_KEYS } from './Header';
import { REGION_I18N_KEYS, REGION_NAMES } from '../config/regions';

type Group = 'products' | 'destinations' | 'regions' | 'proxy';

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: Group;
  /** Unprefixed route; the language prefix is applied when navigating. */
  path: string;
}

const GROUP_ORDER: Group[] = ['products', 'destinations', 'regions', 'proxy'];
const GROUP_KEY: Record<Group, string> = {
  products: 'command.products',
  destinations: 'command.destinations',
  regions: 'command.regions',
  proxy: 'command.proxy_countries',
};
const GROUP_LIMIT = 8;

// One fetch per source per session. The palette never hits the network while
// the visitor types.
let destinationsCache: Item[] | null = null;
let destinationsPending: Promise<Item[]> | null = null;
let proxyCache: Item[] | null = null;
let proxyPending: Promise<Item[]> | null = null;

function loadDestinations(): Promise<Item[]> {
  if (destinationsCache) return Promise.resolve(destinationsCache);
  if (!destinationsPending) {
    destinationsPending = apiClient<{ destinations?: Array<{ code: string; name: string; slug?: string }> }>('/v1/tools/esim/destinations')
      .then(data => {
        const items: Item[] = (data.destinations || [])
          .filter(row => row.code && row.slug)
          .map(row => ({
            id: `d:${row.code}`,
            label: row.name,
            hint: row.code,
            group: 'destinations' as const,
            path: `/destination/${row.slug}`,
          }));
        destinationsCache = items;
        return items;
      })
      .catch(() => [])
      .finally(() => { destinationsPending = null; });
  }
  return destinationsPending;
}

function loadProxyCountries(): Promise<Item[]> {
  if (proxyCache) return Promise.resolve(proxyCache);
  if (!proxyPending) {
    proxyPending = apiClient<Array<{ id: string; country: string; countryCode: string }>>('/v1/tools/proxy/locations')
      .then(locations => {
        const seen = new Set<string>();
        const items: Item[] = [];
        for (const location of locations) {
          const code = String(location.countryCode || '').toUpperCase();
          if (!code || seen.has(code)) continue;
          seen.add(code);
          items.push({
            id: `x:${code}`,
            label: location.country,
            hint: code,
            group: 'proxy' as const,
            path: `/proxy?country=${code}`,
          });
        }
        items.sort((a, b) => a.label.localeCompare(b.label));
        proxyCache = items;
        return items;
      })
      .catch(() => [])
      .finally(() => { proxyPending = null; });
  }
  return proxyPending;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = resolveLang(i18n.language);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [destinations, setDestinations] = useState<Item[]>(destinationsCache ?? []);
  const [proxyCountries, setProxyCountries] = useState<Item[]>(proxyCache ?? []);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) previousFocus.current?.focus?.();
  }, []);

  const openPalette = useCallback(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    setOpen(true);
    setQuery('');
    setActive(0);
    if (!destinationsCache) {
      setLoading(true);
      loadDestinations().then(items => setDestinations(items)).finally(() => setLoading(false));
    }
    if (!proxyCache) loadProxyCountries().then(items => setProxyCountries(items));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (open) close();
        else openPalette();
      }
    };
    const onOpen = () => openPalette();
    window.addEventListener('keydown', onKey);
    window.addEventListener('walls:command-open', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('walls:command-open', onOpen);
    };
  }, [open, close, openPalette]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const groups = useMemo(() => {
    const products: Item[] = [];
    const seenPaths = new Set<string>();
    for (const entry of [...NAV_KEYS, { path: '/network', key: 'header.network' }]) {
      if (seenPaths.has(entry.path)) continue;
      seenPaths.add(entry.path);
      products.push({
        id: `p:${entry.path}`,
        label: t(entry.key),
        group: 'products',
        path: entry.path,
      });
    }
    const regions: Item[] = REGION_NAMES.map(name => ({
      id: `r:${name}`,
      label: t(REGION_I18N_KEYS[name]),
      hint: name,
      group: 'regions' as const,
      path: `/esim?t=regional&r=${encodeURIComponent(name)}`,
    }));

    if (!query.trim()) {
      return [
        { group: 'products' as Group, items: products, total: products.length, best: 0 },
        { group: 'regions' as Group, items: regions, total: regions.length, best: 0 },
      ];
    }

    // The hint is only useful for matching when it adds information (an ISO
    // code); duplicating the label would lower an exact match's score.
    // A shorthand like "uk" is neither the label nor the ISO code, so widen
    // the searchable text with the known aliases for two-letter hints.
    const searchText = (item: Item) => {
      const base = item.hint && item.hint !== item.label ? `${item.label} ${item.hint}` : item.label;
      const aliases = item.hint ? countryAliasesFor(item.hint) : [];
      return aliases.length ? `${base} ${aliases.join(' ')}` : base;
    };
    // A whole-word alias ("uk" -> GB) is unambiguous: rank its country above
    // ordinary prefix matches such as "Ukraine" for the same letters.
    const alias = countryAliasCode(query);
    const scored = [...products, ...destinations, ...regions, ...proxyCountries]
      .map(item => {
        const score = matchScore(query, searchText(item));
        if (score == null) return { item, score };
        const isAliasCountry = alias != null && item.hint?.toUpperCase() === alias;
        return { item, score: isAliasCountry ? Math.max(score, 96) : score };
      })
      .filter((entry): entry is { item: Item; score: number } => entry.score != null)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));

    const byGroup: Record<Group, Item[]> = { products: [], destinations: [], regions: [], proxy: [] };
    const totals: Record<Group, number> = { products: 0, destinations: 0, regions: 0, proxy: 0 };
    const best: Record<Group, number> = { products: 0, destinations: 0, regions: 0, proxy: 0 };
    for (const { item, score } of scored) {
      totals[item.group] += 1;
      best[item.group] = Math.max(best[item.group], score);
      if (byGroup[item.group].length < GROUP_LIMIT) byGroup[item.group].push(item);
    }
    // When searching, the strongest group comes first so Enter selects the
    // best match rather than whatever happens to be first in group order.
    return GROUP_ORDER
      .map(group => ({ group, items: byGroup[group], total: totals[group], best: best[group] }))
      .filter(entry => entry.items.length > 0)
      .sort((a, b) => b.best - a.best);
  }, [query, t, destinations, proxyCountries]);

  const flat = useMemo(() => groups.flatMap(entry => entry.items), [groups]);
  const indexById = useMemo(() => new Map(flat.map((item, index) => [item.id, index])), [flat]);

  useEffect(() => {
    setActive(current => (flat.length === 0 ? 0 : Math.min(current, flat.length - 1)));
  }, [flat.length]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`command-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const select = (item: Item) => {
    setOpen(false);
    navigate(localePath(item.path, lang));
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    // The input owns keyboard focus: with the activedescendant pattern focus
    // must not escape into the page behind an aria-modal dialog.
    if (event.key === 'Tab') {
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(current => (flat.length ? (current + 1) % flat.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(current => (flat.length ? (current - 1 + flat.length) % flat.length : 0));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActive(Math.max(0, flat.length - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = flat[active];
      if (item) select(item);
    }
  };

  const activeItem = flat[active];

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 pt-[10vh] backdrop-blur-sm"
      onMouseDown={event => { if (event.target === event.currentTarget) close(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('command.title', 'Search walls.rip')}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}
        className="mb-10 w-full max-w-xl overflow-hidden rounded-sm border border-wr-border bg-wr-base shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-wr-border px-3">
          <Search size={16} className="shrink-0 text-wr-dim" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? `command-option-${active}` : undefined}
            aria-label={t('command.placeholder', 'Search products, destinations, regions…')}
            value={query}
            onChange={event => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={onInputKeyDown}
            placeholder={t('command.placeholder', 'Search products, destinations, regions…')}
            className="min-h-12 w-full bg-transparent py-3 font-mono text-base text-current outline-none placeholder-wr-dim/60"
          />
          <kbd className="shrink-0 rounded border border-wr-border px-1.5 py-0.5 text-[10px] text-wr-dim">Esc</kbd>
        </div>

        <div id="command-results" role="listbox" aria-label={t('command.results_label', 'Search results')} className="max-h-[60vh] overflow-y-auto p-2">
          {groups.map(entry => (
            <div key={entry.group} role="group" aria-label={t(GROUP_KEY[entry.group])}>
              <div className="flex items-center justify-between px-2 pb-1 pt-2 text-[10px] font-mono uppercase tracking-widest text-wr-dim">
                <span>{t(GROUP_KEY[entry.group])}</span>
                {entry.total > entry.items.length && <span>{entry.items.length}/{entry.total}</span>}
              </div>
              {entry.items.map(item => {
                const index = indexById.get(item.id) ?? -1;
                const selected = index === active;
                return (
                  <div
                    key={item.id}
                    id={`command-option-${index}`}
                    role="option"
                    aria-selected={selected}
                    onMouseDown={event => event.preventDefault()}
                    onMouseMove={() => { if (!selected) setActive(index); }}
                    onClick={() => select(item)}
                    className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm transition-colors ${selected ? 'bg-wr-accent/10 text-wr-accent' : 'text-current hover:bg-wr-surface'}`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.hint && item.hint !== item.label && (
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-wr-dim">{item.hint}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {flat.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-wr-dim">
              {loading ? t('command.loading', 'Searching…') : t('command.no_results', 'No matches')}
            </div>
          )}
        </div>

        <div aria-live="polite" className="sr-only">
          {t('command.results', { count: flat.length, defaultValue: '{{count}} results' })}
        </div>

        <div className="hidden items-center gap-3 border-t border-wr-border px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-wr-dim md:flex">
          <span>↑↓ {t('command.navigate', 'navigate')}</span>
          <span>↵ {t('command.open_hint', 'open')}</span>
          <span>Esc {t('command.close_hint', 'close')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
