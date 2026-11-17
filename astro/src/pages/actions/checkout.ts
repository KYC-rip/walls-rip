import type { APIRoute } from 'astro';
import { ApiError } from '../../lib/api';
import {
  buyPlan,
  decodePlanRef,
  findBuyablePlan,
  validActivationDate,
} from '../../lib/checkout';
import { localePath } from '../../lib/i18n';
import {
  checkCsrf,
  clearClientRef,
  clientRefFor,
  localeFrom,
  safeReturn,
  setFlash,
  setOrderState,
  walletToken,
} from '../../lib/wallet';

/**
 * No-JS purchase. The plan is resolved again on the server so the posted price
 * can never differ from the catalogue, and `clientRef` comes from the checkout
 * cookie so a retry reuses the same idempotency key.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const returnTo = safeReturn(form.get('returnTo'), localePath('/esim', lang));

  if (!checkCsrf(context, form.get('csrf'))) {
    return new Response('Invalid form token', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const token = walletToken(context);
  if (!token) {
    setFlash(context, 'No wallet on this device. Deposit first, then buy.');
    return context.redirect(returnTo, 303);
  }

  const country = String(form.get('c') ?? '').toUpperCase();
  const ref = String(form.get('plan') ?? '');
  const planId = ref ? decodePlanRef(ref) : null;
  const plan = planId ? await findBuyablePlan(context.locals, country, planId) : null;
  if (!plan) {
    setFlash(context, 'That plan changed or sold out. Pick another one.');
    return context.redirect(localePath('/esim', lang), 303);
  }

  const activationDate = String(form.get('activationDate') ?? '') || null;
  if (!validActivationDate(plan, activationDate)) {
    setFlash(context, 'Choose a valid start date for this plan.');
    return context.redirect(returnTo, 303);
  }

  try {
    const result = await buyPlan(context.locals, {
      token,
      plan,
      clientRef: clientRefFor(context, plan.id),
      ...(activationDate ? { activationDate } : {}),
    });

    if (!result.orderId) throw new Error('The provider did not return an order id.');

    // A completed purchase consumes the idempotency reference: buying the same
    // plan again tomorrow must create a new order, not replay this one.
    clearClientRef(context);

    setOrderState(context, {
      orderId: result.orderId,
      name: plan.name,
      country: plan.country,
      price: result.charged ?? plan.price,
      qrCode: result.qrCode,
      activationUrl: result.activationUrl,
      at: Date.now(),
    });

    return context.redirect(localePath('/order', lang), 303);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    const message = apiError?.message || 'The purchase could not be completed.';
    const held = message.toLowerCase().includes('held') || message.toLowerCase().includes('review');
    setFlash(
      context,
      held
        ? 'The provider did not confirm. Your funds are held for review — do not pay again; retry this same purchase or contact support with the order time.'
        : message.slice(0, 280),
    );
    return context.redirect(returnTo, 303);
  }
};
