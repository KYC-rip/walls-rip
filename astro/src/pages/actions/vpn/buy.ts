import type { APIRoute } from 'astro';
import { apiPost } from '../../../lib/api';
import { localePath } from '../../../lib/i18n';
import { findVpnPlan, VPN_PLAN_REF, vpnPurchaseError } from '../../../lib/vpn-checkout';
import {
  COOKIE,
  checkCsrf,
  clientRefFor,
  localeFrom,
  markClientRefSold,
  safeReturn,
  setFlash,
  setVpnOrderState,
  walletToken,
} from '../../../lib/wallet';

/**
 * No-JS VPN purchase.
 *
 * The plan is re-resolved from the live catalogue here, and the wallet token
 * travels as `Authorization: Bearer` (the connectivity endpoints read it
 * nowhere else). `clientRef` comes from its own cookie so a double submit is
 * deduped without touching a pending eSIM, SMS or phone ref.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const listPath = localePath('/vpn', lang);
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
  const planId = VPN_PLAN_REF.decode(ref);
  if (!planId) {
    setFlash(context, 'Pick a plan first.');
    return context.redirect(listPath, 303);
  }

  let plan;
  try {
    plan = await findVpnPlan(context.locals, planId);
  } catch {
    setFlash(context, 'VPN plans are unavailable right now. Nothing was charged — try again shortly.');
    return context.redirect(listPath, 303);
  }
  if (!plan) {
    setFlash(context, 'That plan changed or sold out. Pick another one.');
    return context.redirect(listPath, 303);
  }

  try {
    const result = await apiPost<{ orderId?: string; charged?: number; balanceUSD?: number }>(
      context.locals,
      '/v1/tools/vpn/purchase',
      { planId, clientRef: clientRefFor(context, `vpn:${ref}`, COOKIE.refVpn) },
      { token, timeoutMs: 30_000 },
    );
    if (!result.orderId) throw new Error('The provider did not return an order id.');

    // A completed purchase consumes the reference; a replay then hits dedup.
    markClientRefSold(context, COOKIE.refVpn);

    setVpnOrderState(context, {
      orderId: result.orderId,
      name: plan.name,
      charged: result.charged ?? plan.price,
      at: Date.now(),
    });

    return context.redirect(localePath('/vpn/order', lang), 303);
  } catch (error) {
    const mapped = vpnPurchaseError(error);
    setFlash(context, mapped.message);
    return context.redirect(mapped.toOrder ? localePath('/vpn/order', lang) : returnTo, 303);
  }
};
