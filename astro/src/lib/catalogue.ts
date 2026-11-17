import { apiGet } from './api';

/**
 * Public catalogue fetchers for the product pages.
 *
 * Every response is re-shaped here: provider/engine identifiers, raw costs and
 * `_raw` payloads never cross into the HTML. Prices are the retail `price`
 * the API already applied.
 */

export interface CountryOption {
  code: string;
  name: string;
}

export interface EsimBundle {
  code: string;
  name: string;
  slug: string;
  areas: number;
}

export interface PhonePlan {
  id: string;
  name: string;
  country: string;
  dataGB: number;
  durationDays: number;
  price: number;
  currency: string;
  speed?: string;
  planType?: string;
  hasVoice?: boolean;
  hasSms?: boolean;
  voiceMinutes?: number;
  smsCount?: number;
  nonRefundable?: boolean;
  requiresActivationDate?: boolean;
}

export interface SmsService {
  id: string;
  name: string;
  category?: string;
}

export interface SmsOffer {
  price: number;
  successRate: number;
  stock: number | null;
  available: boolean;
}

export interface ProxyLocation {
  code: string;
  name: string;
  count?: number;
}

export interface ProxyPlan {
  id: string;
  name: string;
  country?: string;
  days?: number;
  gb?: number;
  price: number;
  currency: string;
}

export interface ConnectivityPlan {
  id: string;
  name: string;
  days?: number;
  months?: number;
  country?: string;
  price: number;
  currency: string;
  available: boolean;
  prepayPeriods?: number;
  hasSms?: boolean;
  protocols?: string[];
}

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const REGION_NAMES: Record<string, string> = {
  GLOBAL: 'Global',
  EU: 'Europe',
  GL: 'Global',
};

export function regionDisplayName(code: string): string {
  const upper = code.toUpperCase();
  if (REGION_NAMES[upper]) return REGION_NAMES[upper];
  if (!/^[A-Z]{2}$/.test(upper)) return code;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(upper) ?? code;
  } catch {
    return code;
  }
}

/* ── eSIM ───────────────────────────────────────────────────────────── */

export async function fetchRegionBundles(locals: unknown): Promise<EsimBundle[]> {
  const data = await apiGet<{ bundles?: unknown[] }>(locals, '/v1/tools/esim/region-bundles', {
    ttlMs: 30 * 60_000,
  });
  return (data.bundles ?? [])
    .map((entry) => {
      const bundle = entry as Record<string, unknown>;
      const code = str(bundle.code);
      const slug = str(bundle.slug);
      if (!code || !slug) return null;
      return { code, slug, name: str(bundle.name) || code, areas: num(bundle.areas) };
    })
    .filter((bundle): bundle is EsimBundle => bundle !== null);
}

/* ── Phone ──────────────────────────────────────────────────────────── */

export async function fetchPhoneCountries(locals: unknown): Promise<CountryOption[]> {
  const data = await apiGet<unknown[]>(locals, '/v1/tools/phone/countries', { ttlMs: 30 * 60_000 });
  const seen = new Set<string>();
  const rows: CountryOption[] = [];
  for (const entry of Array.isArray(data) ? data : []) {
    const row = entry as Record<string, unknown>;
    const code = str(row.code).toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    rows.push({ code, name: regionDisplayName(code) });
  }
  return rows;
}

export async function fetchPhonePlans(locals: unknown, country: string): Promise<PhonePlan[]> {
  const data = await apiGet<unknown[]>(
    locals,
    `/v1/tools/phone/plans?country=${encodeURIComponent(country)}`,
    { ttlMs: 5 * 60_000 },
  );
  return (Array.isArray(data) ? data : [])
    .map((entry): PhonePlan | null => {
      const plan = entry as Record<string, unknown>;
      const id = str(plan.id);
      if (!id) return null;
      return {
        id,
        name: str(plan.name) || id,
        country: str(plan.country),
        dataGB: num(plan.dataGB),
        durationDays: num(plan.durationDays),
        price: num(plan.price),
        currency: str(plan.currency) || 'USD',
        speed: str(plan.speed) || undefined,
        planType: str(plan.planType) || undefined,
        hasVoice: plan.hasVoice === true,
        hasSms: plan.hasSms === true,
        voiceMinutes: typeof plan.voiceMinutes === 'number' ? plan.voiceMinutes : undefined,
        smsCount: typeof plan.smsCount === 'number' ? plan.smsCount : undefined,
        nonRefundable: plan.nonRefundable === true,
        requiresActivationDate: plan.requiresActivationDate === true,
      };
    })
    .filter((plan): plan is PhonePlan => plan !== null)
    .sort((a, b) => a.price - b.price);
}

/* ── SMS ────────────────────────────────────────────────────────────── */

export async function fetchSmsCountries(locals: unknown): Promise<CountryOption[]> {
  const data = await apiGet<unknown[]>(locals, '/v1/tools/sms/countries', { ttlMs: 30 * 60_000 });
  const seen = new Set<string>();
  const rows: CountryOption[] = [];
  for (const entry of Array.isArray(data) ? data : []) {
    const row = entry as Record<string, unknown>;
    const code = str(row.shortName).toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    rows.push({ code, name: str(row.name) || regionDisplayName(code) });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchSmsServices(locals: unknown): Promise<SmsService[]> {
  const data = await apiGet<unknown[]>(locals, '/v1/tools/sms/services/unified', {
    ttlMs: 15 * 60_000,
    timeoutMs: 12_000,
  });
  return (Array.isArray(data) ? data : [])
    .map((entry): SmsService | null => {
      const service = entry as Record<string, unknown>;
      const id = str(service.id);
      if (!id) return null;
      return { id, name: str(service.name).trim() || id, category: str(service.category) || undefined };
    })
    .filter((service): service is SmsService => service !== null);
}

export async function fetchSmsOffers(
  locals: unknown,
  country: string,
  service: string,
): Promise<SmsOffer[]> {
  const data = await apiGet<{ results?: unknown[] }>(
    locals,
    `/v1/tools/sms/compare?country=${encodeURIComponent(country)}&service=${encodeURIComponent(service)}`,
    { ttlMs: 2 * 60_000 },
  );
  return (data.results ?? [])
    .map((entry) => {
      const offer = entry as Record<string, unknown>;
      return {
        price: num(offer.price),
        successRate: num(offer.successRate),
        stock: typeof offer.stock === 'number' ? offer.stock : null,
        available: offer.available !== false,
      };
    })
    .filter((offer) => offer.price > 0)
    .sort((a, b) => a.price - b.price);
}

/** Curated services shown before the visitor searches the full list. */
export const POPULAR_SMS_SERVICES: Array<{ id: string; name: string }> = [
  { id: 'telegram', name: 'Telegram' },
  { id: 'whatsapp', name: 'WhatsApp' },
  { id: 'discord', name: 'Discord' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'google', name: 'Google' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'twitter', name: 'X (Twitter)' },
  { id: 'amazon', name: 'Amazon' },
  { id: 'uber', name: 'Uber' },
  { id: 'signal', name: 'Signal' },
  { id: 'openai', name: 'OpenAI' },
];

/* ── Proxy ──────────────────────────────────────────────────────────── */

export async function fetchProxyLocations(locals: unknown): Promise<ProxyLocation[]> {
  try {
    const data = await apiGet<unknown[]>(locals, '/v1/tools/proxy/locations', { ttlMs: 10 * 60_000 });
    return (Array.isArray(data) ? data : [])
      .map((entry): ProxyLocation | null => {
        const row = entry as Record<string, unknown>;
        const code = str(row.code ?? row.country).toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) return null;
        return {
          code,
          name: str(row.name) || regionDisplayName(code),
          count: typeof row.count === 'number' ? row.count : undefined,
        };
      })
      .filter((row): row is ProxyLocation => row !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function fetchProxyPlans(locals: unknown, country: string): Promise<ProxyPlan[]> {
  try {
    const data = await apiGet<unknown[]>(
      locals,
      `/v1/tools/proxy/plans?country=${encodeURIComponent(country)}`,
      { ttlMs: 5 * 60_000 },
    );
    return (Array.isArray(data) ? data : [])
      .map((entry): ProxyPlan | null => {
        const plan = entry as Record<string, unknown>;
        const id = str(plan.id);
        if (!id) return null;
        return {
          id,
          name: str(plan.name) || id,
          country: str(plan.country) || undefined,
          days: typeof plan.days === 'number' ? plan.days : undefined,
          gb: typeof plan.gb === 'number' ? plan.gb : undefined,
          price: num(plan.price),
          currency: str(plan.currency) || 'USD',
        };
      })
      .filter((plan): plan is ProxyPlan => plan !== null)
      .sort((a, b) => a.price - b.price);
  } catch {
    return [];
  }
}

/* ── Connectivity (VPN, UK number) ──────────────────────────────────── */

function publicConnectivityPlans(input: unknown): ConnectivityPlan[] {
  const root = input as Record<string, unknown> | null;
  const plans = Array.isArray(root?.plans) ? (root!.plans as unknown[]) : [];
  return plans
    .map((entry): ConnectivityPlan | null => {
      const plan = entry as Record<string, unknown>;
      const id = str(plan.id);
      if (!id) return null;
      return {
        id,
        name: str(plan.name) || id,
        days: typeof plan.days === 'number' ? plan.days : undefined,
        months: typeof plan.months === 'number' ? plan.months : undefined,
        country: str(plan.country) || undefined,
        price: num(plan.price),
        currency: str(plan.currency) || 'USD',
        available: plan.available !== false,
        prepayPeriods: typeof plan.prepayPeriods === 'number' ? plan.prepayPeriods : undefined,
        hasSms: plan.hasSms === true,
      };
    })
    .filter((plan): plan is ConnectivityPlan => plan !== null);
}

export async function fetchVpnPlans(locals: unknown): Promise<ConnectivityPlan[]> {
  const data = await apiGet<unknown>(locals, '/v1/tools/vpn/plans', { ttlMs: 10 * 60_000 });
  return publicConnectivityPlans(data).sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
}

export async function fetchUkNumberPlans(locals: unknown): Promise<ConnectivityPlan[]> {
  const data = await apiGet<unknown>(locals, '/v1/tools/phone/rentals/plans', { ttlMs: 10 * 60_000 });
  return publicConnectivityPlans(data).sort((a, b) => (a.months ?? 0) - (b.months ?? 0));
}
