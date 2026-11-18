import type { APIRoute } from 'astro';
import { apiPost } from '../../../lib/api';
import { localePath } from '../../../lib/i18n';
import { fetchUkRenewalPlans, ukError, validUkPhone } from '../../../lib/uk-checkout';
import {
  COOKIE,
  checkCsrf,
  clientRefFor,
  localeFrom,
  markClientRefSold,
  readUkOrderState,
  setFlash,
  setUkOrderState,
  walletToken,
} from '../../../lib/wallet';

/**
 * Renew a UK number. This is a second wallet charge: the term is re-read from
 * the live renewal catalogue, the phone must match the API's `^\+447\d{9}$`,
 * and the idempotency key is per order (`uk-renew:<orderId>`).
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const orderPath = localePath('/uk-sim/order', lang);

  if (!checkCsrf(context, form.get('csrf'))) {
    setFlash(context, 'That form expired. Try again from the order page.');
    return context.redirect(orderPath, 303);
  }

  const order = readUkOrderState(context);
  const token = walletToken(context);
  if (!order || !token) {
    setFlash(context, 'No UK number order on this device.');
    return context.redirect(localePath('/uk-sim', lang), 303);
  }

  const phone = String(form.get('phone') ?? '').trim();
  if (!validUkPhone(phone)) {
    setFlash(context, 'Enter the UK number in +447… form (11 digits).');
    return context.redirect(orderPath, 303);
  }

  const periods = Number(form.get('periods'));
  let plans;
  try {
    plans = await fetchUkRenewalPlans(context.locals, token, order.orderId);
  } catch {
    setFlash(context, 'Renewal terms are unavailable right now — try again in a moment.');
    return context.redirect(orderPath, 303);
  }
  if (!plans.some((plan) => plan.periods === periods)) {
    setFlash(context, 'That renewal term is not available.');
    return context.redirect(orderPath, 303);
  }

  try {
    const result = await apiPost<{ renewalId?: number; activeUntil?: string; charged?: number; balanceUSD?: number }>(
      context.locals,
      '/v1/tools/phone/rentals/renew',
      {
        orderId: order.orderId,
        phone,
        periods,
        clientRef: clientRefFor(context, `uk-renew:${order.orderId}`, COOKIE.refUk),
      },
      { token, timeoutMs: 30_000 },
    );

    markClientRefSold(context, COOKIE.refUk);
    setUkOrderState(context, {
      ...order,
      phone,
      charged: order.charged + (result.charged ?? 0),
      ...(result.activeUntil ? { activeUntil: result.activeUntil } : {}),
    });

    setFlash(
      context,
      result.activeUntil
        ? `Renewed — the line is active until ${result.activeUntil}.`
        : 'Renewed.',
    );
    return context.redirect(orderPath, 303);
  } catch (error) {
    const mapped = ukError(error, { heldToOrder: true });
    setFlash(context, mapped.message);
    return context.redirect(orderPath, 303);
  }
};
