import type { APIRoute } from 'astro';
import { localePath } from '../../../lib/i18n';
import { fetchVpnCatalog, type VpnProtocol } from '../../../lib/catalogue';
import { configFilename, fetchVpnConfig, isConfigSelectionError, pairAllowed } from '../../../lib/vpn-checkout';
import {
  checkCsrf,
  localeFrom,
  readVpnOrderState,
  setFlash,
  walletToken,
} from '../../../lib/wallet';

/**
 * Stream the VPN configuration as a file.
 *
 * POST + CSRF so a link prefetcher or scanner cannot pull the config with the
 * visitor's cookies. The content is fetched fresh server-side and sent with
 * `no-store`; nothing about the wallet or order appears in the URL.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const orderPath = localePath('/vpn/order', lang);

  if (!checkCsrf(context, form.get('csrf'))) {
    setFlash(context, 'That form expired. Try again from the order page.');
    return context.redirect(orderPath, 303);
  }

  const order = readVpnOrderState(context);
  const token = walletToken(context);
  if (!order || !token) {
    setFlash(context, 'No VPN order on this device.');
    return context.redirect(localePath('/vpn', lang), 303);
  }

  const protocol = (String(form.get('protocol') ?? '') || '') as VpnProtocol;
  const serverId = Number(form.get('server'));

  try {
    const catalog = await fetchVpnCatalog(context.locals);
    const server = catalog.servers.find((entry) => entry.id === serverId);
    if (!server || !pairAllowed(server, protocol, catalog.protocols)) {
      setFlash(context, 'That server and protocol combination is not available.');
      return context.redirect(orderPath, 303);
    }

    const config = await fetchVpnConfig(context.locals, token, order.orderId, protocol, serverId);
    return new Response(config.content, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${configFilename(protocol, serverId)}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    setFlash(
      context,
      isConfigSelectionError(error)
        ? 'That server and protocol combination is not available — pick another.'
        : 'The configuration is not ready yet — the order page shows the current status.',
    );
    return context.redirect(orderPath, 303);
  }
};
