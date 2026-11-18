import { apiGet } from './api';
import { cleanPlanName } from './whiteLabel';

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
  /** Engine key — server-side only; never rendered. */
  engine: string;
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

/**
 * One purchasable SMS route. `engine`/`countryId`/`serviceId`/`pool`/`quoteId`
 * stay server-side; the pages only ever render the opaque `ref`, the price and
 * the stock/success figures. Raw cost never survives this shape.
 */
export interface SmsRoute {
  engine: string;
  countryId: string;
  serviceId: string;
  pool?: string;
  quoteId?: string;
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

export async function fetchPhonePlans(
  locals: unknown,
  country: string,
  options: { fresh?: boolean } = {},
): Promise<PhonePlan[]> {
  const data = await apiGet<unknown[]>(
    locals,
    `/v1/tools/phone/plans?country=${encodeURIComponent(country)}`,
    { ttlMs: 5 * 60_000, ...(options.fresh ? { fresh: true } : {}) },
  );
  return (Array.isArray(data) ? data : [])
    .map((entry): PhonePlan | null => {
      const plan = entry as Record<string, unknown>;
      const id = str(plan.id);
      const engine = str(plan.engine);
      if (!id || !engine) return null;
      return {
        id,
        name: cleanPlanName(str(plan.name) || id),
        country: str(plan.country),
        engine,
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

/**
 * Purchasable routes for one country/service. Available routes come first,
 * then cheapest; unavailable ones are still listed so the page can say so.
 * `fresh` skips the isolate cache on the buy path, where a stale price and a
 * stale `quoteId` must never be used to charge someone.
 */
export async function fetchSmsRoutes(
  locals: unknown,
  country: string,
  service: string,
  options: { fresh?: boolean } = {},
): Promise<SmsRoute[]> {
  const data = await apiGet<{ results?: unknown[] }>(
    locals,
    `/v1/tools/sms/compare?country=${encodeURIComponent(country)}&service=${encodeURIComponent(service)}`,
    options.fresh ? { fresh: true } : { ttlMs: 2 * 60_000 },
  );
  return (data.results ?? [])
    .map((entry): SmsRoute | null => {
      const route = entry as Record<string, unknown>;
      const engine = str(route.engine);
      const countryId = str(route.countryId);
      const serviceId = str(route.serviceId);
      const price = num(route.price);
      // An unidentifiable or unpriced route cannot be bought: drop it rather
      // than render a button that always fails.
      if (!engine || !countryId || !serviceId || price <= 0) return null;
      return {
        engine,
        countryId,
        serviceId,
        pool: str(route.pool) || undefined,
        quoteId: str(route.quoteId) || undefined,
        price,
        successRate: num(route.successRate),
        stock: typeof route.stock === 'number' ? route.stock : null,
        available: route.available !== false,
      };
    })
    .filter((route): route is SmsRoute => route !== null)
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (a.price !== b.price) return a.price - b.price;
      return (a.pool ?? '').localeCompare(b.pool ?? '');
    });
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
        // ProxyApp: { country: "Afghanistan", countryCode: "AF" }. Accept the
        // older {code, name} shape too so a provider change cannot blank the page.
        const code = str(row.countryCode ?? row.code).toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) return null;
        const name = str(row.name) || str(row.country);
        return {
          code,
          name: name && name.toUpperCase() !== code ? name : regionDisplayName(code),
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
          days: typeof plan.durationDays === 'number' ? plan.durationDays
            : typeof plan.days === 'number' ? plan.days : undefined,
          gb: typeof plan.bandwidthGB === 'number' ? plan.bandwidthGB
            : typeof plan.gb === 'number' ? plan.gb : undefined,
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
        name: cleanPlanName(str(plan.name) || id),
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

export async function fetchVpnPlans(
  locals: unknown,
  options: { fresh?: boolean } = {},
): Promise<ConnectivityPlan[]> {
  const data = await apiGet<unknown>(locals, '/v1/tools/vpn/plans', {
    ttlMs: 10 * 60_000,
    ...(options.fresh ? { fresh: true } : {}),
  });
  return publicConnectivityPlans(data).sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
}

export type VpnProtocol = 'wireguard' | 'openvpn' | 'vless';

export interface VpnServer {
  id: number;
  countryCode: string;
  city: string;
  protocol: VpnProtocol;
}

export interface VpnCatalog {
  plans: ConnectivityPlan[];
  servers: VpnServer[];
  protocols: VpnProtocol[];
}

const VPN_PROTOCOLS: VpnProtocol[] = ['wireguard', 'openvpn', 'vless'];

/** Servers/protocols are needed for the config form and are never rendered raw. */
export async function fetchVpnCatalog(locals: unknown): Promise<VpnCatalog> {
  const data = await apiGet<unknown>(locals, '/v1/tools/vpn/plans', {
    ttlMs: 10 * 60_000,
    fresh: true,
  });
  const root = (data ?? {}) as Record<string, unknown>;
  const servers = (Array.isArray(root.servers) ? root.servers : [])
    .map((entry): VpnServer | null => {
      const server = entry as Record<string, unknown>;
      const id = typeof server.id === 'number' ? server.id : Number.NaN;
      const protocol = str(server.protocol).toLowerCase() as VpnProtocol;
      if (!Number.isSafeInteger(id) || id <= 0 || !VPN_PROTOCOLS.includes(protocol)) return null;
      return {
        id,
        countryCode: str(server.country_code).toUpperCase(),
        city: str(server.city),
        protocol,
      };
    })
    .filter((server): server is VpnServer => server !== null)
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.city.localeCompare(b.city) || a.id - b.id);
  const protocols = (Array.isArray(root.protocols) ? root.protocols : [])
    .map((value) => str(value).toLowerCase() as VpnProtocol)
    .filter((value) => VPN_PROTOCOLS.includes(value));
  return {
    plans: publicConnectivityPlans(data).sort((a, b) => (a.days ?? 0) - (b.days ?? 0)),
    servers,
    protocols: protocols.length ? [...new Set(protocols)] : VPN_PROTOCOLS,
  };
}

export async function fetchUkNumberPlans(locals: unknown): Promise<ConnectivityPlan[]> {
  const data = await apiGet<unknown>(locals, '/v1/tools/phone/rentals/plans', { ttlMs: 10 * 60_000 });
  return publicConnectivityPlans(data).sort((a, b) => (a.months ?? 0) - (b.months ?? 0));
}
