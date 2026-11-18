import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api';
import { fetchVpnCatalog } from '../src/lib/catalogue';
import {
  configFilename,
  findVpnPlan,
  isConfigSelectionError,
  isDeadOrderError,
  pairAllowed,
  VPN_PLAN_REF,
  vpnPurchaseError,
} from '../src/lib/vpn-checkout';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

const CATALOG = {
  available: true,
  plans: [
    { id: 'plan-30', name: 'BuyUKeSIM 30 days', days: 30, price: 6.35, currency: 'USD', available: true },
    { id: 'plan-off', name: 'Sold out', days: 30, price: 6.35, currency: 'USD', available: false },
  ],
  servers: [
    { id: 2, country_code: 'us', city: 'New York', protocol: 'vless' },
    { id: 1, country_code: 'de', city: 'Frankfurt', protocol: 'wireguard' },
    { id: 3, country_code: 'fr', city: 'Paris', protocol: 'openvpn' },
    { id: 0, country_code: 'xx', city: 'Invalid', protocol: 'wireguard' },
  ],
  protocols: ['wireguard', 'openvpn', 'vless'],
};

describe('vpn plan refs', () => {
  it('round-trips the plan id', () => {
    expect(VPN_PLAN_REF.decode(VPN_PLAN_REF.encode('plan-30'))).toBe('plan-30');
    expect(VPN_PLAN_REF.decode('')).toBeNull();
  });
});

describe('vpn plan resolution', () => {
  it('re-resolves price from the live catalogue and cleans provider names', async () => {
    stubFetch(CATALOG);
    const plan = await findVpnPlan({}, 'plan-30');
    expect(plan?.price).toBe(6.35);
    expect(plan?.name.toLowerCase()).not.toContain('buyukesim');
    expect(plan?.name).toContain('30 days');
  });

  it('refuses unavailable or missing plans', async () => {
    stubFetch(CATALOG);
    expect(await findVpnPlan({}, 'plan-off')).toBeNull();
    expect(await findVpnPlan({}, 'nope')).toBeNull();
  });
});

describe('vpn catalog parsing', () => {
  it('keeps valid servers, drops invalid ids, and sorts by country', async () => {
    stubFetch(CATALOG);
    const catalog = await fetchVpnCatalog({});
    expect(catalog.servers.map((s) => s.id)).toEqual([1, 3, 2]);
    expect(catalog.servers[0]).toMatchObject({ id: 1, countryCode: 'DE', city: 'Frankfurt', protocol: 'wireguard' });
    expect(catalog.protocols).toEqual(['wireguard', 'openvpn', 'vless']);
  });
});

describe('vpn protocol pairing (mirrors the API)', () => {
  const protocols: ('wireguard' | 'openvpn' | 'vless')[] = ['wireguard', 'openvpn', 'vless'];
  const wg = { id: 1, countryCode: 'DE', city: 'Frankfurt', protocol: 'wireguard' as const };
  const vless = { id: 2, countryCode: 'US', city: 'NYC', protocol: 'vless' as const };
  const ovpn = { id: 3, countryCode: 'FR', city: 'Paris', protocol: 'openvpn' as const };

  it('wireguard servers serve wireguard and openvpn only', () => {
    expect(pairAllowed(wg, 'wireguard', protocols)).toBe(true);
    expect(pairAllowed(wg, 'openvpn', protocols)).toBe(true);
    expect(pairAllowed(wg, 'vless', protocols)).toBe(false);
  });

  it('vless servers serve only vless', () => {
    expect(pairAllowed(vless, 'vless', protocols)).toBe(true);
    expect(pairAllowed(vless, 'wireguard', protocols)).toBe(false);
  });

  it('other servers serve only their own protocol', () => {
    expect(pairAllowed(ovpn, 'openvpn', protocols)).toBe(true);
    expect(pairAllowed(ovpn, 'wireguard', protocols)).toBe(false);
  });
});

describe('config filenames', () => {
  it('maps protocol to extension', () => {
    expect(configFilename('wireguard', 7)).toBe('walls-vpn-7.conf');
    expect(configFilename('openvpn', 7)).toBe('walls-vpn-7.ovpn');
    expect(configFilename('vless', 7)).toBe('walls-vpn-7.txt');
  });
});

describe('vpn order error classes', () => {
  it('treats 404/401 on status as a dead order (no endless polling)', () => {
    expect(isDeadOrderError(new ApiError(404, 'Order not found'))).toBe(true);
    expect(isDeadOrderError(new ApiError(401, 'Wallet authorization required'))).toBe(true);
    expect(isDeadOrderError(new ApiError(503, 'down'))).toBe(false);
    expect(isDeadOrderError(new Error('network'))).toBe(false);
  });

  it('classifies 4xx config failures as selection drift', () => {
    expect(isConfigSelectionError(new ApiError(400, 'Protocol unavailable'))).toBe(true);
    expect(isConfigSelectionError(new ApiError(404, 'Order not found'))).toBe(true);
    expect(isConfigSelectionError(new ApiError(502, 'upstream'))).toBe(false);
    expect(isConfigSelectionError(new Error('timeout'))).toBe(false);
  });
});

describe('vpn purchase errors', () => {
  it('keys copy on the API code, never on raw text', () => {
    expect(vpnPurchaseError(new ApiError(502, 'buyukesim exploded', 'PURCHASE_HELD')).message).toMatch(/held for review/i);
    expect(vpnPurchaseError(new ApiError(402, 'nope', 'INSUFFICIENT_WALLET_FUNDS')).message).toMatch(/add funds/i);
    expect(vpnPurchaseError(new ApiError(502, 'nope', 'PROVIDER_REFUSED')).message).toMatch(/balance was returned/i);
    expect(vpnPurchaseError(new ApiError(428, 'nope', 'QUOTE_REQUIRED')).message).toMatch(/temporarily unavailable/i);
    expect(vpnPurchaseError(new ApiError(503, 'Not available yet')).message).toMatch(/not open/i);
    expect(vpnPurchaseError(new Error('buyukesim custom text')).message).not.toMatch(/buyukesim/i);
  });

  it('sends a duplicate to the order page', () => {
    expect(vpnPurchaseError(new ApiError(409, 'duplicate clientRef')).toOrder).toBe(true);
  });
});
