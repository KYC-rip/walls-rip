import { useEffect, useState } from 'react';
import { apiClient } from '../services/client';

interface DestinationRow {
  code: string;
  slug?: string;
}

// One index fetch per session, shared by every page that links into
// destinations. The API response is ~13 KB and already KV-cached.
let cache: Map<string, string> | null = null;
let inflight: Promise<Map<string, string>> | null = null;

function load(): Promise<Map<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = apiClient<{ destinations?: DestinationRow[] }>('/v1/tools/esim/destinations')
      .then(data => {
        const map = new Map<string, string>();
        for (const row of data.destinations || []) {
          if (row.code && row.slug) map.set(row.code.toUpperCase(), row.slug);
        }
        cache = map;
        return map;
      })
      .catch(() => new Map<string, string>())
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/**
 * ISO country code → public destination slug. Returns null while the index is
 * loading or when the country has no page (below the 5-plan threshold).
 */
export function useDestinationSlug(): (code: string | undefined | null) => string | null {
  const [map, setMap] = useState<Map<string, string> | null>(cache);
  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    load().then(next => { if (!cancelled) setMap(next); });
    return () => { cancelled = true; };
  }, []);
  return (code) => {
    if (!code || !map) return null;
    return map.get(code.toUpperCase()) ?? null;
  };
}
