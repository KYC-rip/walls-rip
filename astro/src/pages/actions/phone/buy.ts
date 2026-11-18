import type { APIRoute } from 'astro';
import { ApiError } from '../../../lib/api';
import { localePath } from '../../../lib/i18n';
import {
  buyPlan,
  decodePhoneRef,
  findPhonePlan,
  toBuyable,
  validActivationDate,
} from '../../../lib/phone-checkout';
import {
  COOKIE,
  checkCsrf,
  clientRefFor,
  localeFrom,
  markClientRefSold,
  safeReturn,
  setFlash,
  setOrderState,
  walletToken,
} from '../../../lib/wallet';

/**
 * No-JS phone purchase.
 *
 * The posted `plan` is only a selector: engine, plan id, country and price are
 * re-resolved against the live phone catalogue here, so a tampered form cannot
 * buy a cheaper plan than it shows. `clientRef` comes from a phone-specific
 * cookie so a double submit reuses the same idempotency key without touching a
 * pending eSIM or SMS retry.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const returnTo = safeReturn(form.get('returnTo'), localePath('/phone', lang));
  const listPath = localePath('/phone', lang);

  if (!checkCsrf(context, form.get('csrf'))) {
    setFlash(context, 'That form expired. Review the plan and submit again.');
    return context.redirect(returnTo, 303);
  }

  const token = walletToken(context);
  if (!token) {
    setFlash(context, 'No wallet on this device. Deposit first, then buy.');
    return context.redirect(returnTo, 303);
  }

  const country = String(form.get('c') ?? '').toUpperCase();
  const ref = String(form.get('plan') ?? '');
  const decoded = decodePhoneRef(ref);
  if (!decoded || decoded.country !== country) {
    setFlash(context, 'Pick a plan first.');
    return context.redirect(listPath, 303);
  }

  const listWithCountry = `${listPath}?country=${encodeURIComponent(country)}`;

  let plan;
  try {
    plan = await findPhonePlan(context.locals, decoded);
  } catch {
    setFlash(context, 'Phone plans are unavailable right now. Nothing was charged — try again shortly.');
    return context.redirect(listWithCountry, 303);
  }
  if (!plan) {
    setFlash(context, 'That plan changed or sold out. Pick another one.');
    return context.redirect(listWithCountry, 303);
  }

  const buyable = toBuyable(plan);
  const activationDate = String(form.get('activationDate') ?? '') || null;
  if (!validActivationDate(buyable, activationDate)) {
    setFlash(context, 'Choose a valid start date for this plan.');
    return context.redirect(returnTo, 303);
  }

  try {
    const result = await buyPlan(context.locals, {
      token,
      plan: buyable,
      clientRef: clientRefFor(context, `phone:${ref}`, COOKIE.refPhone),
      ...(activationDate ? { activationDate } : {}),
    });
    if (!result.orderId) throw new ApiError(502, 'The provider did not return an order id.');

    // A completed purchase consumes the reference: replaying this form hits
    // the API dedup instead of buying a second plan.
    markClientRefSold(context, COOKIE.refPhone);

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

    // A duplicate means an earlier submit may have gone through.
    if (apiError?.status === 409 || /duplicate/i.test(message)) {
      setFlash(context, 'This purchase was already submitted — the order page shows the result.');
      return context.redirect(localePath('/order', lang), 303);
    }

    // Never render upstream text (provider names, raw status codes).
    const held = /held|review/i.test(message);
    setFlash(
      context,
      held
        ? 'The provider did not confirm. Your funds are held for review — do not pay again; retry this same purchase or contact support with the order time.'
        : 'The purchase could not be completed. Try again, or pick another plan.',
    );
    return context.redirect(returnTo, 303);
  }
};
