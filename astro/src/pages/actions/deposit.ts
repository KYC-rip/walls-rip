import type { APIRoute } from 'astro';
import { localePath } from '../../lib/i18n';
import {
  checkCsrf,
  createDeposit,
  localeFrom,
  paymentStatus,
  readPayState,
  safeReturn,
  setFlash,
  setPayState,
  setWalletToken,
  shouldReuseDeposit,
  walletToken,
} from '../../lib/wallet';

/**
 * No-JS deposit: create a payment, remember it in an HttpOnly cookie and send
 * the visitor to the server-rendered payment page.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const returnTo = safeReturn(form.get('returnTo'), localePath('/esim', lang));

  if (!checkCsrf(context, form.get('csrf'))) {
    // A stale tab has an expired token; send it back so the GET re-mints one.
    setFlash(context, 'That form expired. Check the amount and submit again.');
    return context.redirect(returnTo, 303);
  }

  // Which product's deposit endpoint mints the payment (and whose limits
  // apply). Anything but an explicit `sms` stays on the eSIM path.
  const svc = form.get('svc') === 'sms' ? 'sms' : 'esim';
  const maxUsd = svc === 'sms' ? 100 : 200;

  const amount = Number(form.get('amount'));
  const method = form.get('method') === 'LN' ? 'LN' : 'XMR';
  const usd = Math.round(amount * 100) / 100;

  if (!Number.isFinite(usd) || usd < 0.5 || usd > maxUsd) {
    setFlash(context, `Deposit amount must be between $0.50 and $${maxUsd}.`);
    return context.redirect(returnTo, 303);
  }

  try {
    const existing = readPayState(context);
    if (shouldReuseDeposit(existing, usd, method) && (existing!.svc ?? 'esim') === svc) {
      const status = await paymentStatus(context.locals, existing!.paymentId, existing!.svc);
      if (status === 'PENDING') {
        // Reused invoice, current return path: an old PayState must not bounce
        // the payer back to whatever page started the previous deposit.
        setPayState(context, { ...existing!, returnTo });
        return context.redirect(localePath('/pay', lang), 303);
      }
    }

    const result = await createDeposit(context.locals, {
      amount: usd,
      method,
      walletToken: walletToken(context),
      svc,
    });

    if (result.walletToken) setWalletToken(context, result.walletToken);

    setPayState(context, {
      paymentId: result.paymentId,
      method: result.method === 'LN' ? 'LN' : 'XMR',
      address: result.address,
      amount: result.amount,
      usd: result.usd,
      returnTo,
      createdAt: Date.now(),
      svc,
    });

    return context.redirect(localePath('/pay', lang), 303);
  } catch (error) {
    setFlash(context, (error as Error).message || 'The deposit could not be created.');
    return context.redirect(returnTo, 303);
  }
};
