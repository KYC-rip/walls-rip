import type { APIRoute } from 'astro';
import { localePath } from '../../../lib/i18n';
import { fetchVpnCatalog, type VpnProtocol } from '../../../lib/catalogue';
import { pairAllowed } from '../../../lib/vpn-checkout';
import {
  checkCsrf,
  localeFrom,
  readVpnOrderState,
  setFlash,
  walletToken,
} from '../../../lib/wallet';

/**
 * Validate the server/protocol choice (CSRF-protected) and hand off to the
 * config page. The pair is checked against the live catalogue here and again
 * by the API; the config itself is fetched server-side by the page.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const orderPath = localePath('/vpn/order', lang);

  if (!checkCsrf(context, form.get('csrf'))) {
    setFlash(context, 'That form expired. Try again from the order page.');
    return context.redirect(orderPath, 303);
  }

  if (!readVpnOrderState(context) || !walletToken(context)) {
    setFlash(context, 'No VPN order on this device.');
    return context.redirect(localePath('/vpn', lang), 303);
  }

  const protocol = (String(form.get('protocol') ?? '') || '') as VpnProtocol;
  const serverId = Number(form.get('server'));

  let catalog;
  try {
    catalog = await fetchVpnCatalog(context.locals);
  } catch {
    setFlash(context, 'Configuration is unavailable right now — try again in a moment.');
    return context.redirect(orderPath, 303);
  }

  const server = catalog.servers.find((entry) => entry.id === serverId);
  if (!server || !pairAllowed(server, protocol, catalog.protocols)) {
    setFlash(context, 'That server and protocol combination is not available.');
    return context.redirect(orderPath, 303);
  }

  const target = `${localePath('/vpn/config', lang)}?protocol=${encodeURIComponent(protocol)}&server=${serverId}`;
  return context.redirect(target, 303);
};
