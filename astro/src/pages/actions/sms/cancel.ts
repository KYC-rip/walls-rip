import type { APIRoute } from 'astro';
import { localePath } from '../../../lib/i18n';
import { cancelSms } from '../../../lib/sms-checkout';
import { formatUsd } from '../../../lib/data';
import {
  checkCsrf,
  clearSmsOrderState,
  localeFrom,
  readSmsOrderState,
  setFlash,
  walletToken,
} from '../../../lib/wallet';

/**
 * Cancel an open SMS order. POST only: a GET link would let a prefetcher or
 * link scanner refund an order on the visitor's behalf. The refund itself is
 * the API's `/sms/cancel` (provider-accepted cancels only); this action only
 * reports what happened and drops the local order.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const checkPath = localePath('/sms/check', lang);

  if (!checkCsrf(context, form.get('csrf'))) {
    setFlash(context, 'That form expired. Try again from the order page.');
    return context.redirect(checkPath, 303);
  }

  const order = readSmsOrderState(context);
  const token = walletToken(context);
  if (!order || !token) {
    setFlash(context, 'No open order on this device.');
    return context.redirect(localePath('/sms', lang), 303);
  }

  try {
    const result = await cancelSms(context.locals, order.orderId, token);

    if (!result.success) {
      setFlash(
        context,
        result.delivered
          ? 'A code was already delivered on this number, so the order cannot be refunded.'
          : result.message || 'The provider refused to cancel this order.',
      );
      return context.redirect(checkPath, 303);
    }

    clearSmsOrderState(context);
    // Never promise an amount: the API only credits the wallet when its order
    // record still exists. Report the balance it actually returns.
    setFlash(
      context,
      typeof result.balanceUSD === 'number'
        ? `Cancelled. Your wallet balance is ${formatUsd(result.balanceUSD)}.`
        : 'Cancelled.',
    );
    return context.redirect(localePath('/sms', lang), 303);
  } catch (error) {
    setFlash(context, (error as Error).message || 'The order could not be cancelled.');
    return context.redirect(checkPath, 303);
  }
};
