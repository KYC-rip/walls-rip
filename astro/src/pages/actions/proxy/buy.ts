import type { APIRoute } from 'astro';
import { apiPost } from '../../../lib/api';
import { localePath } from '../../../lib/i18n';
import {
  decodeProxyRef,
  findProxyLocation,
  findProxyPlan,
  proxyError,
} from '../../../lib/proxy-checkout';
import {
  COOKIE,
  checkCsrf,
  clientRefFor,
  localeFrom,
  markClientRefSold,
  safeReturn,
  setFlash,
  setProxyOrderState,
  walletToken,
} from '../../../lib/wallet';

/**
 * No-JS proxy purchase. Plan AND location are re-resolved from the live
 * catalogue; the wallet token travels in the body (the API's proxy contract).
 * The proxy wallet is a separate namespace, so this can only spend funds the
 * customer deposited through svc=proxy.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const listPath = localePath('/proxy', lang);
  const returnTo = safeReturn(form.get('returnTo'), listPath);

  if (!checkCsrf(context, form.get('csrf'))) {
    setFlash(context, 'That form expired. Review the plan and submit again.');
    return context.redirect(returnTo, 303);
  }

  const token = walletToken(context);
  if (!token) {
    setFlash(context, 'No wallet on this device. Deposit first, then buy.');
    return context.redirect(returnTo, 303);
  }

  const ref = String(form.get('plan') ?? '');
  const decoded = decodeProxyRef(ref);
  if (!decoded) {
    setFlash(context, 'Pick a plan first.');
    return context.redirect(listPath, 303);
  }

  let plan;
  let location;
  try {
    plan = await findProxyPlan(context.locals, decoded.planId);
    // The location must still exist in the live list; a tampered ref cannot
    // name an arbitrary id.
    location = plan ? await findProxyLocation(context.locals, decoded.locationId, { fresh: true }) : null;
    if (!plan || !location) {
      setFlash(context, 'That plan or location changed. Pick another one.');
      return context.redirect(listPath, 303);
    }
  } catch {
    setFlash(context, 'Proxy plans are unavailable right now. Nothing was charged — try again shortly.');
    return context.redirect(listPath, 303);
  }

  try {
    const result = await apiPost<{ orderId?: string; charged?: number; balanceUSD?: number }>(
      context.locals,
      '/v1/tools/proxy/purchase',
      {
        planId: decoded.planId,
        location: decoded.locationId,
        token,
        clientRef: clientRefFor(context, `proxy:${ref}`, COOKIE.refProxy),
      },
      { timeoutMs: 45_000 },
    );
    if (!result.orderId) throw new Error('The provider did not return an order id.');

    markClientRefSold(context, COOKIE.refProxy);

    // Store only our own fields: the API spreads the engine's order object.
    setProxyOrderState(context, {
      orderId: result.orderId,
      name: plan.name,
      charged: result.charged ?? plan.price,
      at: Date.now(),
    });

    return context.redirect(localePath('/proxy/order', lang), 303);
  } catch (error) {
    const mapped = proxyError(error);
    setFlash(context, mapped.message);
    return context.redirect(mapped.toOrder ? localePath('/proxy/order', lang) : returnTo, 303);
  }
};
