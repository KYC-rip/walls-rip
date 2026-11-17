import { apiGet, ApiError } from './api';

/* ── API shapes ─────────────────────────────────────────────────────── */

export interface CountryRef {
  code: string;
  name: string;
  slug: string;
}

export interface DestinationPlan {
  name: string;
  dataGB: number;
  durationDays: number;
  price: number;
}

export interface DestinationProduct {
  key: ProductKey;
  available: boolean;
  fromUsd: number | null;
}

export type ProductKey =
  | 'esim'
  | 'phone'
  | 'sms'
  | 'sms_rental'
  | 'proxy'
  | 'uk_number';

export interface DestinationPayload {
  country: CountryRef;
  esim: {
    fromUsd: number | null;
    planCount: number;
    networks: string[];
    durations: number[];
    plans: DestinationPlan[];
  };
  proxy: { available: boolean; fromUsd: number | null };
  sms: { available: boolean };
  products?: DestinationProduct[];
  global?: { vpn?: { available: boolean; fromUsd: number | null } };
  partial?: boolean;
}

export interface DestinationRow {
  code: string;
  name: string;
  slug: string;
  planCount: number;
  countComplete?: boolean;
  fromUsd: number | null;
}

export interface CoverageOperator {
  name: string;
  networkType?: string;
}

export interface ComparePlan {
  id: string;
  name: string;
  country: string;
  dataGB: number;
  durationDays: number;
  price: number;
  currency: string;
  speed?: string;
  extendable?: boolean;
  coverage?: Array<{ country: string; operators: CoverageOperator[] }>;
  coverageCount?: number;
  nonRefundable?: boolean;
  requiresActivationDate?: boolean;
  activationDateMinDays?: number;
  activationDateMaxDays?: number;
}

/* ── Fetchers ───────────────────────────────────────────────────────── */

/** One country page payload. Returns null when the destination does not exist. */
export async function fetchDestination(
  locals: unknown,
  key: string,
): Promise<DestinationPayload | null> {
  try {
    return await apiGet<DestinationPayload>(
      locals,
      `/v1/tools/destinations/${encodeURIComponent(key)}`,
      { ttlMs: 5 * 60_000 },
    );
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

/**
 * The full buyable plan list. The public response carries buyable ids; the
 * provider cost (`costPrice`) and engine key are stripped here and must never
 * reach the HTML.
 */
export async function fetchComparePlans(locals: unknown, country: string): Promise<ComparePlan[]> {
  try {
    const data = await apiGet<{ plans?: unknown[] }>(
      locals,
      `/v1/tools/esim/compare?country=${encodeURIComponent(country)}`,
      { ttlMs: 3 * 60_000 },
    );
    const raw = Array.isArray(data.plans) ? data.plans : [];
    return raw.map(toPublicPlan).filter((plan): plan is ComparePlan => plan !== null);
  } catch {
    // The cached six-plan payload is a complete fallback; a compare failure
    // must not take the page down.
    return [];
  }
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toPublicPlan(input: unknown): ComparePlan | null {
  if (!input || typeof input !== 'object') return null;
  const plan = input as Record<string, unknown>;
  if (typeof plan.id !== 'string' || typeof plan.name !== 'string') return null;

  const coverage = Array.isArray(plan.coverage)
    ? (plan.coverage as Array<Record<string, unknown>>)
        .map((entry) => ({
          country: String(entry.country ?? ''),
          operators: Array.isArray(entry.operators)
            ? (entry.operators as Array<Record<string, unknown>>)
                .map((operator) => ({
                  name: String(operator.name ?? ''),
                  networkType:
                    typeof operator.networkType === 'string' ? operator.networkType : undefined,
                }))
                .filter((operator) => operator.name)
            : [],
        }))
        .filter((entry) => entry.country)
    : undefined;

  return {
    id: plan.id,
    name: plan.name,
    country: String(plan.country ?? ''),
    dataGB: numberValue(plan.dataGB),
    durationDays: numberValue(plan.durationDays),
    price: numberValue(plan.price),
    currency: typeof plan.currency === 'string' ? plan.currency : 'USD',
    speed: typeof plan.speed === 'string' ? plan.speed : undefined,
    extendable: plan.extendable === true,
    coverage,
    coverageCount: typeof plan.coverageCount === 'number' ? plan.coverageCount : undefined,
    nonRefundable: plan.nonRefundable === true,
    requiresActivationDate: plan.requiresActivationDate === true,
    activationDateMinDays:
      typeof plan.activationDateMinDays === 'number' ? plan.activationDateMinDays : undefined,
    activationDateMaxDays:
      typeof plan.activationDateMaxDays === 'number' ? plan.activationDateMaxDays : undefined,
  };
}

export async function fetchDestinationIndex(locals: unknown): Promise<DestinationRow[]> {
  const data = await apiGet<{ destinations?: DestinationRow[] }>(
    locals,
    '/v1/tools/esim/destinations',
    { ttlMs: 10 * 60_000 },
  );
  return Array.isArray(data.destinations) ? data.destinations : [];
}

/* ── Display helpers ────────────────────────────────────────────────── */

export function formatData(gb: number): string {
  if (!Number.isFinite(gb)) return '';
  if (gb < 1) return `${Math.round(gb * 1000)}MB`;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)}GB`;
}

export function formatDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
}

/** Deterministic hero gradient so a country always looks the same. */
export function gradientFor(code: string): string {
  let hue = 0;
  for (const ch of code) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  const second = (hue + 42) % 360;
  return `linear-gradient(135deg, hsl(${hue} 62% 24%), hsl(${second} 68% 10%))`;
}

/** Multi-area bundles have no flag or landmark; they carry a `-AREAS` suffix. */
export function isBundle(code: string): boolean {
  return /^[A-Z0-9-]+-AREAS$/i.test(code);
}

/* ── Filters (mirrored by the GET links on the page) ────────────────── */

export type DataFilter = 'all' | 'lt1' | '1to5' | '5to20' | '20plus';
export type DurationFilter = 'all' | 'le7' | '8to15' | '16to30' | 'gt30';

export const DATA_FILTERS: Array<{ key: DataFilter; label: string; fallback: string }> = [
  { key: 'all', label: 'destination.filter_all', fallback: 'All' },
  { key: 'lt1', label: 'destination.filter_lt1', fallback: '< 1GB' },
  { key: '1to5', label: 'destination.filter_1to5', fallback: '1–5GB' },
  { key: '5to20', label: 'destination.filter_5to20', fallback: '5–20GB' },
  { key: '20plus', label: 'destination.filter_20plus', fallback: '20GB+' },
];

export const DURATION_FILTERS: Array<{ key: DurationFilter; label: string; fallback: string }> = [
  { key: 'all', label: 'destination.filter_all', fallback: 'All' },
  { key: 'le7', label: 'destination.filter_le7', fallback: '≤ 7d' },
  { key: '8to15', label: 'destination.filter_8to15', fallback: '8–15d' },
  { key: '16to30', label: 'destination.filter_16to30', fallback: '16–30d' },
  { key: 'gt30', label: 'destination.filter_gt30', fallback: '30d+' },
];

export function parseDataFilter(value: string | null): DataFilter {
  return DATA_FILTERS.some((filter) => filter.key === value) ? (value as DataFilter) : 'all';
}

export function parseDurationFilter(value: string | null): DurationFilter {
  return DURATION_FILTERS.some((filter) => filter.key === value)
    ? (value as DurationFilter)
    : 'all';
}

export function dataMatches(filter: DataFilter, gb: number): boolean {
  switch (filter) {
    case 'lt1':
      return gb < 1;
    case '1to5':
      return gb >= 1 && gb <= 5;
    case '5to20':
      return gb > 5 && gb <= 20;
    case '20plus':
      return gb > 20;
    default:
      return true;
  }
}

export function durationMatches(filter: DurationFilter, days: number): boolean {
  switch (filter) {
    case 'le7':
      return days <= 7;
    case '8to15':
      return days > 7 && days <= 15;
    case '16to30':
      return days > 15 && days <= 30;
    case 'gt30':
      return days > 30;
    default:
      return true;
  }
}

/* ── Storefront order ───────────────────────────────────────────────── */

export const POPULAR_DESTINATIONS = [
  'US', 'JP', 'AU', 'DE', 'CN', 'TH', 'CA', 'TR', 'CH', 'SG',
  'VN', 'GB', 'BR', 'ID', 'AT', 'MX', 'MY', 'AR', 'FR', 'HK',
  'KR', 'IT', 'NZ', 'IN', 'HR', 'GR', 'NL', 'EG', 'PE', 'DK',
  'ES', 'PH', 'MA', 'CL', 'NO', 'PT', 'HU', 'BE', 'CZ', 'IS',
  'AE', 'IE', 'SE', 'KH', 'ZA', 'PL', 'AL', 'FI', 'RO', 'LK',
  'IL', 'SA', 'QA', 'MT', 'BH', 'RS', 'MV', 'CO', 'KW', 'BG',
];

const RANK = new Map(POPULAR_DESTINATIONS.map((code, index) => [code, index]));

export function destinationRank(code: string): number {
  return RANK.get(String(code || '').toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
}

export function compareDestinations(
  a: { code: string; name: string },
  b: { code: string; name: string },
): number {
  const ra = destinationRank(a.code);
  const rb = destinationRank(b.code);
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name);
}

/* ── Product presentation ───────────────────────────────────────────── */

export interface ProductMeta {
  labelKey: string;
  labelFallback: string;
  descKey: string;
  descFallback: string;
  /** href receives the country code (and is locale-prefixed by the caller) */
  href: (code: string) => string;
}

export const PRODUCT_META: Record<ProductKey, ProductMeta> = {
  esim: {
    labelKey: 'destination.product_esim',
    labelFallback: 'eSIM data',
    descKey: 'destination.product_esim_desc',
    descFallback: 'Prepaid data-only eSIM, no KYC',
    href: (code) => `/esim?c=${code}`,
  },
  phone: {
    labelKey: 'destination.product_phone',
    labelFallback: 'Phone number plan',
    descKey: 'destination.product_phone_desc',
    descFallback: 'A real number with voice, SMS and data',
    href: (code) => `/phone?country=${code}`,
  },
  sms: {
    labelKey: 'destination.product_sms',
    labelFallback: 'SMS numbers',
    descKey: 'destination.product_sms_desc',
    descFallback: 'Receive one-time verification codes',
    href: (code) => `/sms?c=${code}`,
  },
  sms_rental: {
    labelKey: 'destination.product_rental',
    labelFallback: 'Number rental',
    descKey: 'destination.product_rental_desc',
    descFallback: 'Keep a number for 30–360 days',
    href: (code) => `/sms?tab=rentals&c=${code}`,
  },
  proxy: {
    labelKey: 'destination.product_proxy',
    labelFallback: 'Residential proxies',
    descKey: 'destination.product_proxy_desc',
    descFallback: 'Residential IPs for apps and scripts',
    href: (code) => `/proxy?country=${code}`,
  },
  uk_number: {
    labelKey: 'destination.product_uk',
    labelFallback: 'UK mobile number',
    descKey: 'destination.product_uk_desc',
    descFallback: 'Long-term +44 number with SMS',
    href: () => '/uk-sim',
  },
};

export const PRODUCT_ORDER: ProductKey[] = [
  'esim',
  'phone',
  'sms',
  'sms_rental',
  'proxy',
  'uk_number',
];
