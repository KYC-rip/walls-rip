import type { APIRoute } from 'astro';
import { localePath } from '../../lib/i18n';
import {
  checkCsrf,
  createDeposit,
  localeFrom,
  safeReturn,
  setFlash,
  setPayState,
  setWalletToken,
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
    return new Response('Invalid form token', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const amount = Number(form.get('amount'));
  const method = form.get('method') === 'LN' ? 'LN' : 'XMR';

  if (!Number.isFinite(amount) || amount < 0.5 || amount > 200) {
    setFlash(context, 'Deposit amount must be between $0.50 and $200.');
    return context.redirect(returnTo, 303);
  }

  try {
    const result = await createDeposit(context.locals, {
      amount: Math.round(amount * 100) / 100,
      method,
      walletToken: walletToken(context),
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
    });

    return context.redirect(localePath('/pay', lang), 303);
  } catch (error) {
    setFlash(context, (error as Error).message || 'The deposit could not be created.');
    return context.redirect(returnTo, 303);
  }
};
