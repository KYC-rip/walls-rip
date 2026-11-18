/**
 * Server-side client for api.kyc.rip.
 *
 * The browser never talks to a third-party origin: every request leaves from
 * the Cloudflare Worker (clearnet) or the Tor box (onion), so the visitor's IP
 * is not exposed and the API's CORS rules are unchanged.
 */

export const DEFAULT_API_BASE = 'https://api.kyc.rip';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * The API origin, baked in at build time (`WALLS_API_BASE`). Astro 7 removed
 * `Astro.locals.runtime`, and a build constant keeps the clearnet and onion
 * builds identical apart from the value.
 */
export function apiBase(): string {
  return typeof __WALLS_API_BASE__ === 'string' && __WALLS_API_BASE__
    ? __WALLS_API_BASE__
    : DEFAULT_API_BASE;
}

type CacheEntry = { at: number; value: unknown };

/** Per-isolate read-through cache. The API already caches upstream data; this
 * only stops one page render from issuing the same request twice. */
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const CACHE_CAP = 400;

function evict() {
  if (cache.size <= CACHE_CAP) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of oldest.slice(0, cache.size - CACHE_CAP)) cache.delete(key);
}

export interface ApiOptions {
  ttlMs?: number;
  timeoutMs?: number;
  /** Skip the read cache (admin/checkout paths will want this). */
  fresh?: boolean;
}

export async function apiGet<T>(_locals: unknown, path: string, options: ApiOptions = {}): Promise<T> {
  const base = apiBase();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const ttl = options.ttlMs ?? 60_000;

  if (!options.fresh) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < ttl) return hit.value as T;
    const pending = inflight.get(url);
    if (pending) return pending as Promise<T>;
  }

  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'walls-astro/0.1 (+https://walls.rip)',
        },
        signal:
          typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(options.timeoutMs ?? 6000)
            : undefined,
      });
    } catch (error) {
      throw new ApiError(503, `Upstream unreachable: ${(error as Error).message}`);
    }

    if (!response.ok) {
      throw new ApiError(response.status, `Upstream responded ${response.status}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(502, 'Upstream returned invalid JSON');
    }

    cache.set(url, { at: Date.now(), value: data });
    evict();
    return data as T;
  })().finally(() => inflight.delete(url));

  if (!options.fresh) inflight.set(url, request);
  return request;
}

/** JSON POST. Error bodies from the API (`{error, code}`) become ApiError. */
export async function apiPost<T>(
  _locals: unknown,
  path: string,
  body: unknown,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const base = apiBase();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'walls-astro/0.1 (+https://walls.rip)',
      },
      body: JSON.stringify(body),
      signal:
        typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(options.timeoutMs ?? 45_000)
          : undefined,
    });
  } catch (error) {
    throw new ApiError(503, `Upstream unreachable: ${(error as Error).message}`);
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* empty body is fine on some errors */
  }

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Upstream responded ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return data as T;
}
