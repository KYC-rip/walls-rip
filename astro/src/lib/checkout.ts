import { apiGet, apiPost } from './api';

/**
 * Server-side plan resolution and purchase for the no-JS checkout.
 *
 * `/esim/compare` carries the engine key and buyable id; both stay on the
 * server and never enter the HTML. The browser only ever sees the opaque
 * plan id that the compare response already publishes.
 */

export interface BuyablePlan {
  id: string;
  name: string;
  country: string;
  dataGB: number;
  durationDays: number;
  price: number;
  engine: string;
  nonRefundable?: boolean;
  requiresActivationDate?: boolean;
  activationDateMinDays?: number;
  activationDateMaxDays?: number;
}

export interface PurchaseResult {
  orderId?: string;
  status?: string;
  qrCode?: string;
  activationUrl?: string;
  balanceUSD?: number;
  charged?: number;
}

export interface OrderStatus {
  orderId?: string;
  status?: string;
  qrCode?: string;
  activationUrl?: string;
  [key: string]: unknown;
}

/**
 * Plan ids carry a provider hint (`simjuno:TH_1_7`). They are already public in
 * the compare API, but the pages keep provider names out of visible URLs by
 * carrying a base64url reference instead. Decoding is not a security boundary:
 * the plan is always re-resolved against the live catalogue before purchase.
 */
export function encodePlanRef(planId: string): string {
  return btoa(planId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePlanRef(ref: string): string | null {
  if (!ref) return null;
  try {
    const base = ref.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base + '='.repeat((4 - (base.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

export async function findBuyablePlan(
  locals: unknown,
  country: string,
  planId: string,
): Promise<BuyablePlan | null> {
  let data: { plans?: unknown[] };
  try {
    data = await apiGet<{ plans?: unknown[] }>(
      locals,
      `/v1/tools/esim/compare?country=${encodeURIComponent(country)}`,
      { ttlMs: 60_000 },
    );
  } catch {
    return null;
  }

  for (const entry of Array.isArray(data.plans) ? data.plans : []) {
    const plan = entry as Record<string, unknown>;
    if (plan.id !== planId) continue;
    const engine = typeof plan.engine === 'string' ? plan.engine : '';
    const price = typeof plan.price === 'number' ? plan.price : 0;
    if (!engine || price <= 0) return null;
    return {
      id: planId,
      name: typeof plan.name === 'string' ? plan.name : planId,
      country: typeof plan.country === 'string' ? plan.country : country,
      dataGB: typeof plan.dataGB === 'number' ? plan.dataGB : 0,
      durationDays: typeof plan.durationDays === 'number' ? plan.durationDays : 0,
      price,
      engine,
      nonRefundable: plan.nonRefundable === true,
      requiresActivationDate: plan.requiresActivationDate === true,
      activationDateMinDays:
        typeof plan.activationDateMinDays === 'number' ? plan.activationDateMinDays : undefined,
      activationDateMaxDays:
        typeof plan.activationDateMaxDays === 'number' ? plan.activationDateMaxDays : undefined,
    };
  }
  return null;
}

export function activationBounds(plan: Pick<BuyablePlan, 'activationDateMinDays' | 'activationDateMaxDays'>) {
  const minDays = plan.activationDateMinDays ?? 2;
  const maxDays = plan.activationDateMaxDays ?? 60;
  const now = new Date();
  const iso = (offset: number) => {
    const date = new Date(now.getTime() + offset * 86_400_000);
    return date.toISOString().slice(0, 10);
  };
  return { min: iso(minDays), max: iso(maxDays) };
}

/** Validate the client's start date against the plan's window. */
export function validActivationDate(plan: BuyablePlan, value: string | null): boolean {
  if (!plan.requiresActivationDate) return true;
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { min, max } = activationBounds(plan);
  return value >= min && value <= max;
}

export async function buyPlan(
  locals: unknown,
  input: {
    token: string;
    plan: BuyablePlan;
    clientRef: string;
    activationDate?: string;
  },
): Promise<PurchaseResult> {
  return apiPost<PurchaseResult>(locals, '/v1/tools/esim/purchase', {
    planId: input.plan.id,
    token: input.token,
    engine: input.plan.engine,
    country: input.plan.country,
    clientRef: input.clientRef,
    ...(input.activationDate ? { activationDate: input.activationDate } : {}),
  });
}

export async function orderStatus(
  locals: unknown,
  orderId: string,
  token: string,
): Promise<OrderStatus | null> {
  try {
    return await apiGet<OrderStatus>(
      locals,
      `/v1/tools/esim/status?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
      { ttlMs: 0, fresh: true },
    );
  } catch {
    return null;
  }
}
