import type { APIRoute } from 'astro';
import { ApiError } from '../../../lib/api';
import { localePath } from '../../../lib/i18n';
import { fetchSmsRoutes } from '../../../lib/catalogue';
import {
  buySmsNumber,
  decodeRouteRef,
  encodeRouteRef,
  fallbackCandidates,
  isRetryableRefusal,
  matchSmsRoute,
  purchaseErrorMessage,
  type SmsPurchaseResult,
} from '../../../lib/sms-checkout';
import {
  COOKIE,
  checkCsrf,
  clientRefFor,
  localeFrom,
  markClientRefSold,
  safeReturn,
  setFlash,
  setSmsOrderState,
  walletToken,
} from '../../../lib/wallet';

/**
 * No-JS SMS purchase.
 *
 * The posted route reference is only a selector: the engine, provider ids and
 * price are re-resolved against the live compare response here, so a tampered
 * form cannot choose a cheaper route than it pays for. `clientRef` comes from
 * a dedicated cookie, so a double submit reuses the same idempotency key.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = localeFrom(form.get('lang'));
  const returnTo = safeReturn(form.get('returnTo'), localePath('/sms', lang));
  const listPath = localePath('/sms', lang);

  if (!checkCsrf(context, form.get('csrf'))) {
    setFlash(context, 'That form expired. Review the route and submit again.');
    return context.redirect(returnTo, 303);
  }

  const token = walletToken(context);
  if (!token) {
    setFlash(context, 'No wallet on this device. Deposit first, then buy.');
    return context.redirect(returnTo, 303);
  }

  const country = String(form.get('c') ?? '').toUpperCase();
  const service = String(form.get('s') ?? '').trim().slice(0, 64);
  const ref = String(form.get('route') ?? '');
  if (!/^[A-Z]{2}$/.test(country) || !service || !ref) {
    setFlash(context, 'Pick a country, a service and a route first.');
    return context.redirect(listPath, 303);
  }

  const listWithService = `${listPath}?c=${encodeURIComponent(country)}&s=${encodeURIComponent(service)}`;

  let route;
  let routes = [];
  try {
    routes = await fetchSmsRoutes(context.locals, country, service, { fresh: true });
    const wanted = decodeRouteRef(ref);
    route = wanted ? matchSmsRoute(routes, wanted) : null;
  } catch {
    setFlash(context, 'Routes are unavailable right now. Nothing was charged — try again shortly.');
    return context.redirect(listWithService, 303);
  }
  if (!route) {
    setFlash(context, 'That route changed or sold out. Pick another one.');
    return context.redirect(listWithService, 303);
  }
  if (!route.available) {
    setFlash(context, 'That route is out of stock right now. Pick another one.');
    return context.redirect(listWithService, 303);
  }

  try {
    // Try the selected route first, then any available route priced at or
    // below it (the amount the page showed). Provider stock refusals fall
    // through; ambiguous outcomes never do.
    let result: SmsPurchaseResult | undefined;
    let used = route;
    let lastError: unknown = null;
    for (const candidate of fallbackCandidates(routes, route)) {
      try {
        const attempt = await buySmsNumber(context.locals, {
          token,
          route: candidate,
          // Keyed on the canonical form of each candidate, so a retry of the
          // same route reuses its idempotency key and another route gets its own.
          clientRef: clientRefFor(context, `sms:${encodeRouteRef(candidate)}`, COOKIE.refSms),
        });
        if (!attempt.orderId) throw new ApiError(502, 'The provider did not return an order id.');
        result = attempt;
        used = candidate;
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableRefusal(error)) throw error;
      }
    }
    if (!result?.orderId) throw lastError ?? new ApiError(502, 'The purchase could not be completed.');

    // Keep the reference for a few minutes but mark it sold: a browser replay
    // of this form then hits the API's dedup (409 → check page) instead of
    // buying a second number. A deliberate new purchase starts from a fresh
    // GET, which rotates the reference.
    markClientRefSold(context, COOKIE.refSms);

    setSmsOrderState(context, {
      orderId: result.orderId,
      service,
      country,
      number: result.phoneNumber,
      charged: result.charged ?? used.price,
      at: Date.now(),
    });

    return context.redirect(localePath('/sms/check', lang), 303);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    const message = apiError?.message || 'The purchase could not be completed.';

    // A duplicate means an earlier submit may have gone through; the order id
    // (if any) is in the cookie, so the code page is the honest destination.
    if (apiError?.status === 409 || /duplicate/i.test(message)) {
      setFlash(context, purchaseErrorMessage('duplicate'));
      return context.redirect(localePath('/sms/check', lang), 303);
    }

    const held = message.toLowerCase().includes('held') || message.toLowerCase().includes('review');
    setFlash(
      context,
      held
        ? 'The provider did not confirm. Your funds are held for review — do not pay again; retry this same purchase or contact support with the order time.'
        : purchaseErrorMessage(message),
    );
    return context.redirect(returnTo, 303);
  }
};
