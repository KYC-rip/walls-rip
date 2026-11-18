import type { AstroGlobal } from 'astro';
import { ApiError, apiGet } from './api';
import { isDeadOrderError } from './order-errors';
import {
  fetchVpnCatalog,
  fetchVpnPlans,
  type ConnectivityPlan,
  type VpnProtocol,
  type VpnServer,
} from './catalogue';
import { decodePlanRef, encodePlanRef } from './checkout';
import { localePath, type Lang } from './i18n';
import {
  COOKIE,
  clearVpnOrderState,
  ensureCsrf,
  readFlash,
  readVpnOrderState,
  rotateClientRef,
  setFlash,
  walletBalance,
  walletToken,
  type VpnOrderState,
} from './wallet';

/**
 * No-JS VPN purchase, status and config download.
 *
 * The browser only names an opaque plan reference. Price and availability are
 * re-resolved from the live catalogue; the purchase, status and config calls
 * carry the wallet token as `Authorization: Bearer` (the connectivity
 * endpoints read it nowhere else), and the order id lives only in `wr_vpn`.
 * The config is a capability: it is fetched server-side with the cookie token
 * and never enters a URL.
 */

export const VPN_PLAN_REF = { encode: encodePlanRef, decode: decodePlanRef };

export async function findVpnPlan(locals: unknown, planId: string): Promise<ConnectivityPlan | null> {
  const plans = await fetchVpnPlans(locals, { fresh: true });
  const plan = plans.find((entry) => entry.id === planId);
  return plan && plan.available && plan.price > 0 ? plan : null;
}

/** The API's exact rule: vless servers only serve vless; wireguard servers
 *  serve wireguard and openvpn; anything else serves only its own protocol. */
export function pairAllowed(server: VpnServer, protocol: VpnProtocol, protocols: VpnProtocol[]): boolean {
  if (!protocols.includes(protocol)) return false;
  if (protocol === 'vless') return server.protocol === 'vless';
  return server.protocol === 'wireguard' || server.protocol === protocol;
}

export function configFilename(protocol: VpnProtocol, serverId: number): string {
  const extension = protocol === 'wireguard' ? 'conf' : protocol === 'openvpn' ? 'ovpn' : 'txt';
  return `walls-vpn-${serverId}.${extension}`;
}

export interface VpnStatus {
  status: string;
  expiresAt?: number;
  username?: string;
  password?: string;
}

export async function fetchVpnStatus(
  locals: unknown,
  token: string,
  orderId: string,
): Promise<VpnStatus> {
  return apiGet<VpnStatus>(
    locals,
    `/v1/tools/vpn/status?order_id=${encodeURIComponent(orderId)}`,
    { token, fresh: true, timeoutMs: 8000 },
  );
}

export interface VpnConfig {
  name: string;
  content: string;
  qrPayload?: string;
}

export async function fetchVpnConfig(
  locals: unknown,
  token: string,
  orderId: string,
  protocol: VpnProtocol,
  serverId: number,
): Promise<VpnConfig> {
  return apiGet<VpnConfig>(
    locals,
    `/v1/tools/vpn/config?order_id=${encodeURIComponent(orderId)}&protocol=${encodeURIComponent(protocol)}&server_id=${serverId}`,
    { token, fresh: true, timeoutMs: 20_000 },
  );
}

export { isDeadOrderError } from './order-errors';

/** 4xx from the config endpoint means the pair drifted, not an outage. */
export function isConfigSelectionError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/** Customer-facing text for a purchase failure, keyed on the API's code. */
export function vpnPurchaseError(error: unknown): { message: string; toOrder: boolean } {
  const api = error instanceof ApiError ? error : null;
  const code = api?.code;
  if (code === 'PURCHASE_HELD') {
    // No order id exists on hold: send the visitor back to the purchase page.
    return {
      message:
        'The provider did not confirm. Your funds are held for review — do not pay again; retry this same purchase or contact support with the order time.',
      toOrder: false,
    };
  }
  if (code === 'INSUFFICIENT_WALLET_FUNDS') {
    return { message: 'Insufficient wallet balance — add funds and try again.', toOrder: false };
  }
  if (code === 'TOO_MANY_ATTEMPTS') {
    return { message: 'Too many attempts on this wallet — try again later.', toOrder: false };
  }
  if (code === 'PROVIDER_REFUSED') {
    return { message: 'The provider refused the purchase. Your balance was returned.', toOrder: false };
  }
  if (code === 'QUOTE_REQUIRED' || api?.status === 428) {
    return { message: 'Checkout is temporarily unavailable — try again later.', toOrder: false };
  }
  if (api?.status === 409 || /duplicate/i.test(api?.message ?? '')) {
    return { message: 'This purchase was already submitted — the order page shows the result.', toOrder: true };
  }
  if (api?.status === 503) {
    return { message: 'VPN sales are not open right now — try again later.', toOrder: false };
  }
  return { message: 'The purchase could not be completed. Try again, or pick another plan.', toOrder: false };
}

/* ── Page preparation ───────────────────────────────────────────────── */

export type PrepareResult<T> =
  | { kind: 'ok'; props: T }
  | { kind: 'redirect'; response: Response };

function redirect(path: string, status = 303): Response {
  return new Response(null, {
    status,
    headers: { location: path, 'cache-control': 'no-store' },
  });
}

function noStore(astro: AstroGlobal) {
  astro.response.headers.set('cache-control', 'no-store');
  astro.response.headers.set('referrer-policy', 'no-referrer');
}

function vpnPath(lang: Lang, suffix = '') {
  return localePath(`/vpn${suffix}`, lang);
}

const DEPOSIT_CAP = 200;

export interface VpnPurchaseProps {
  planRef: string;
  planName: string;
  days?: number;
  price: number;
  balance: number;
  hasWallet: boolean;
  csrf: string;
  lang: Lang;
  returnTo: string;
  flash: string | null;
  depositAmount: number;
  depositCapped: boolean;
}

export async function prepareVpnPurchase(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<VpnPurchaseProps>> {
  noStore(astro);

  const ref = astro.url.searchParams.get('plan') ?? '';
  const planId = decodePlanRef(ref);
  if (!planId) return { kind: 'redirect', response: redirect(vpnPath(lang)) };

  let plan: ConnectivityPlan | null = null;
  try {
    plan = await findVpnPlan(astro.locals, planId);
  } catch {
    setFlash(astro, 'VPN plans are unavailable right now. Nothing was charged — try again shortly.');
    return { kind: 'redirect', response: redirect(vpnPath(lang)) };
  }
  if (!plan) {
    setFlash(astro, 'That plan changed or sold out. Pick another one.');
    return { kind: 'redirect', response: redirect(vpnPath(lang)) };
  }

  const token = walletToken(astro);
  const balance = token ? await walletBalance(astro.locals, token) : 0;
  const csrf = ensureCsrf(astro);
  rotateClientRef(astro, `vpn:${ref}`, COOKIE.refVpn);

  const returnTo = `${vpnPath(lang, '/purchase')}?plan=${encodeURIComponent(ref)}`;
  const shortfall = Math.max(0, plan.price - balance);
  const depositAmount = Math.min(DEPOSIT_CAP, Math.max(0.5, Math.ceil(shortfall * 100) / 100));

  return {
    kind: 'ok',
    props: {
      planRef: ref,
      planName: plan.name,
      days: plan.days,
      price: plan.price,
      balance,
      hasWallet: !!token,
      csrf,
      lang,
      returnTo,
      flash: readFlash(astro),
      depositAmount,
      depositCapped: shortfall > DEPOSIT_CAP,
    },
  };
}

export interface VpnOrderProps {
  order: VpnOrderState;
  status: string;
  expiresAt?: number;
  username?: string;
  password?: string;
  servers: VpnServer[];
  protocols: VpnProtocol[];
  catalogError: boolean;
  unreachable: boolean;
  csrf: string;
  lang: Lang;
  flash: string | null;
}

export async function prepareVpnOrder(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<VpnOrderProps>> {
  noStore(astro);

  const order = readVpnOrderState(astro);
  const token = walletToken(astro);
  if (!order || !token) {
    setFlash(astro, 'No VPN order on this device. Buy a plan first.');
    return { kind: 'redirect', response: redirect(vpnPath(lang)) };
  }

  let status: VpnStatus | null = null;
  let unreachable = false;
  try {
    status = await fetchVpnStatus(astro.locals, token, order.orderId);
  } catch (error) {
    if (isDeadOrderError(error)) {
      // 404/401: the order is gone for this wallet. End the session instead of
      // meta-refreshing a status that will never exist.
      clearVpnOrderState(astro);
      setFlash(astro, 'This order is no longer available on this device. Buy a plan to start again.');
      return { kind: 'redirect', response: redirect(vpnPath(lang)) };
    }
    unreachable = true;
  }

  // A dead order clears after the final render so it cannot shadow the next buy.
  if (status?.status === 'EXPIRED') clearVpnOrderState(astro);

  let servers: VpnServer[] = [];
  let protocols: VpnProtocol[] = [];
  let catalogError = false;
  if (status?.status === 'ACTIVE') {
    try {
      const catalog = await fetchVpnCatalog(astro.locals);
      servers = catalog.servers;
      protocols = catalog.protocols;
    } catch {
      catalogError = true;
    }
  }

  return {
    kind: 'ok',
    props: {
      order,
      status: status?.status ?? 'UNKNOWN',
      expiresAt: status?.expiresAt,
      username: status?.username,
      password: status?.password,
      servers,
      protocols,
      catalogError,
      unreachable,
      csrf: ensureCsrf(astro),
      lang,
      flash: readFlash(astro),
    },
  };
}

export interface VpnConfigProps {
  order: VpnOrderState;
  protocol: VpnProtocol;
  server: VpnServer;
  config: VpnConfig;
  csrf: string;
  lang: Lang;
  flash: string | null;
}

export async function prepareVpnConfig(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<VpnConfigProps>> {
  noStore(astro);

  const order = readVpnOrderState(astro);
  const token = walletToken(astro);
  if (!order || !token) {
    setFlash(astro, 'No VPN order on this device. Buy a plan first.');
    return { kind: 'redirect', response: redirect(vpnPath(lang)) };
  }

  const orderPath = vpnPath(lang, '/order');
  const protocol = (astro.url.searchParams.get('protocol') ?? '') as VpnProtocol;
  const serverId = Number(astro.url.searchParams.get('server'));

  let catalog;
  try {
    catalog = await fetchVpnCatalog(astro.locals);
  } catch {
    setFlash(astro, 'Configuration is unavailable right now — try again in a moment.');
    return { kind: 'redirect', response: redirect(orderPath) };
  }
  const server = catalog.servers.find((entry) => entry.id === serverId);
  if (!server || !pairAllowed(server, protocol, catalog.protocols)) {
    setFlash(astro, 'That server and protocol combination is not available.');
    return { kind: 'redirect', response: redirect(orderPath) };
  }

  let config: VpnConfig;
  try {
    config = await fetchVpnConfig(astro.locals, token, order.orderId, protocol, serverId);
  } catch (error) {
    setFlash(
      astro,
      isConfigSelectionError(error)
        ? 'That server and protocol combination is not available — pick another.'
        : 'The configuration is not ready yet — the order page shows the current status.',
    );
    return { kind: 'redirect', response: redirect(orderPath) };
  }

  return {
    kind: 'ok',
    props: {
      order,
      protocol,
      server,
      config,
      csrf: ensureCsrf(astro),
      lang,
      flash: readFlash(astro),
    },
  };
}
