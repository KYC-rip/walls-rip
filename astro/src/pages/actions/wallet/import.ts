import type { APIRoute } from 'astro';
import { localePath } from '../../../lib/i18n';
import { formatUsd } from '../../../lib/data';
import {
  checkCsrf,
  isWalletToken,
  localeFrom,
  safeReturn,
  setFlash,
  setWalletToken,
  walletBalanceStrict,
} from '../../../lib/wallet';

/**
 * Restore an existing wallet on this device.
 *
 * The token is a bearer capability: POST only (never a URL), validated against
 * the API before it is written to the HttpOnly cookie, and never echoed — not
 * in the flash, not in the redirect, not in logs.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const returnTo = safeReturn(form.get('returnTo'), localePath('/sms', lang));

  if (!checkCsrf(context, form.get('csrf'))) {
    setFlash(context, 'That form expired. Paste the token again.');
    return context.redirect(returnTo, 303);
  }

  const token = String(form.get('token') ?? '').trim();
  if (!isWalletToken(token)) {
    setFlash(context, 'That wallet token was not accepted.');
    return context.redirect(returnTo, 303);
  }

  try {
    const balance = await walletBalanceStrict(context.locals, token);
    setWalletToken(context, token);
    setFlash(context, `Wallet restored — balance ${formatUsd(balance)}.`);
  } catch {
    // A rejected token and an API outage look the same to the visitor.
    setFlash(context, 'That wallet token was not accepted.');
  }

  return context.redirect(returnTo, 303);
};
