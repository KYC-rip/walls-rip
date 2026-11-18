import type { APIRoute } from 'astro';
import { apiPost } from '../../../lib/api';
import { localePath } from '../../../lib/i18n';
import { findUkPlan, UK_PLAN_REF, ukError } from '../../../lib/uk-checkout';
import {
  COOKIE,
  checkCsrf,
  clientRefFor,
  localeFrom,
  markClientRefSold,
  safeReturn,
  setFlash,
  setUkOrderState,
  walletToken,
} from '../../../lib/wallet';

/**
 * No-JS UK number purchase. Plan re-resolved server-side; the wallet token
 * travels as `Authorization: Bearer` (the connectivity handler reads it
 * nowhere else). `clientRef` lives on its own cookie.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const listPath = localePath('/uk-sim', lang);
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
  const planId = UK_PLAN_REF.decode(ref);
  if (!planId) {
    setFlash(context, 'Pick a plan first.');
    return context.redirect(listPath, 303);
  }

  let plan;
  try {
    plan = await findUkPlan(context.locals, planId);
  } catch {
    setFlash(context, 'UK number plans are unavailable right now. Nothing was charged — try again shortly.');
    return context.redirect(listPath, 303);
  }
  if (!plan) {
    setFlash(context, 'That plan changed or sold out. Pick another one.');
    return context.redirect(listPath, 303);
  }

  try {
    const result = await apiPost<{ orderId?: string; charged?: number; balanceUSD?: number }>(
      context.locals,
      '/v1/tools/phone/rentals/purchase',
      { planId, clientRef: clientRefFor(context, `uk:${ref}`, COOKIE.refUk) },
      { token, timeoutMs: 30_000 },
    );
    if (!result.orderId) throw new Error('The provider did not return an order id.');

    markClientRefSold(context, COOKIE.refUk);

    setUkOrderState(context, {
      orderId: result.orderId,
      name: plan.name,
      charged: result.charged ?? plan.price,
      at: Date.now(),
    });

    return context.redirect(localePath('/uk-sim/order', lang), 303);
  } catch (error) {
    const mapped = ukError(error);
    setFlash(context, mapped.message);
    return context.redirect(mapped.toOrder ? localePath('/uk-sim/order', lang) : returnTo, 303);
  }
};
