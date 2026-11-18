import type { APIRoute } from 'astro';
import { localePath } from '../../../lib/i18n';
import { resendSms } from '../../../lib/sms-checkout';
import { checkCsrf, localeFrom, readSmsOrderState, setFlash, walletToken } from '../../../lib/wallet';

/**
 * Ask the provider for another code on the same number. POST only: a GET
 * link would let a prefetcher or link scanner spend a resend.
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
    setFlash(context, 'No open order on this device. Buy a number first.');
    return context.redirect(localePath('/sms', lang), 303);
  }

  try {
    const result = await resendSms(context.locals, order.orderId, token);
    if (!result.success) {
      setFlash(context, result.message || 'The provider could not send another code.');
      return context.redirect(checkPath, 303);
    }
    setFlash(context, 'Another code requested. This page keeps checking until it arrives.');
    return context.redirect(`${checkPath}?watch=1`, 303);
  } catch (error) {
    setFlash(context, (error as Error).message || 'Could not request another code.');
    return context.redirect(checkPath, 303);
  }
};
