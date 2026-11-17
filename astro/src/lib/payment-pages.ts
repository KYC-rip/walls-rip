import type { AstroGlobal } from 'astro';
import {
  activationBounds,
  decodePlanRef,
  findBuyablePlan,
  orderStatus,
  type BuyablePlan,
  type OrderStatus,
} from './checkout';
import { localePath, type Lang } from './i18n';
import {
  clientRefFor,
  ensureCsrf,
  paymentStatus,
  readFlash,
  readOrderState,
  readPayState,
  setFlash,
  setOrderState,
  clearPayState,
  walletBalance,
  walletToken,
  type OrderState,
  type PayState,
} from './wallet';

export interface CheckoutProps {
  plan: BuyablePlan;
  balance: number;
  hasWallet: boolean;
  csrf: string;
  lang: Lang;
  returnTo: string;
  flash: string | null;
  activationMin: string;
  activationMax: string;
}

export interface PayProps {
  pay: PayState;
  qrPayload: string;
  lang: Lang;
  checking: boolean;
}

export interface OrderProps {
  order: OrderState;
  status: OrderStatus | null;
  state: string;
  qrCode?: string;
  activationUrl?: string;
  lang: Lang;
}

export type PrepareResult<T> =
  | { kind: 'ok'; props: T }
  | { kind: 'redirect'; response: Response }
  | { kind: 'expired' };

function redirect(path: string, status = 303): Response {
  return new Response(null, {
    status,
    headers: { location: path, 'cache-control': 'no-store' },
  });
}

function noStore(astro: AstroGlobal) {
  astro.response.headers.set('cache-control', 'no-store');
  astro.response.headers.set('referrer-policy', 'no-referrer');
}

export async function prepareCheckout(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<CheckoutProps>> {
  noStore(astro);

  const country = (astro.url.searchParams.get('c') ?? '').toUpperCase();
  const ref = astro.url.searchParams.get('plan') ?? '';
  const planId = ref ? decodePlanRef(ref) : null;
  if (!country || !planId) return { kind: 'redirect', response: redirect(localePath('/esim', lang)) };

  const plan = await findBuyablePlan(astro.locals, country, planId);
  if (!plan) {
    return { kind: 'redirect', response: redirect(localePath('/esim', lang)) };
  }

  const token = walletToken(astro);
  const balance = token ? await walletBalance(astro.locals, token) : 0;

  const csrf = ensureCsrf(astro);
  clientRefFor(astro, plan.id);

  const returnTo = `${localePath('/checkout', lang)}?c=${encodeURIComponent(country)}&plan=${encodeURIComponent(ref)}`;
  const bounds = activationBounds(plan);

  return {
    kind: 'ok',
    props: {
      plan,
      balance,
      hasWallet: !!token,
      csrf,
      lang,
      returnTo,
      flash: readFlash(astro),
      activationMin: bounds.min,
      activationMax: bounds.max,
    },
  };
}

export async function preparePay(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<PayProps>> {
  noStore(astro);

  const pay = readPayState(astro);
  if (!pay) {
    return { kind: 'redirect', response: redirect(localePath('/esim', lang)) };
  }

  const status = await paymentStatus(astro.locals, pay.paymentId);
  if (status === 'COMPLETED') {
    clearPayState(astro);
    return { kind: 'redirect', response: redirect(pay.returnTo) };
  }
  if (status === 'EXPIRED') {
    setFlash(astro, 'That payment expired. Create a new one to continue.');
    clearPayState(astro);
    return { kind: 'redirect', response: redirect(pay.returnTo) };
  }

  const qrPayload =
    pay.method === 'LN'
      ? pay.address
      : `monero:${pay.address}?tx_amount=${pay.amount}`;

  return { kind: 'ok', props: { pay, qrPayload, lang, checking: true } };
}

export async function prepareOrder(
  astro: AstroGlobal,
  lang: Lang,
): Promise<PrepareResult<OrderProps>> {
  noStore(astro);

  let order = readOrderState(astro);
  const queryId = astro.url.searchParams.get('id');
  const token = walletToken(astro);

  if (!order && queryId && token) {
    order = {
      orderId: queryId,
      name: 'eSIM order',
      country: '',
      price: 0,
      at: Date.now(),
    };
  }
  if (!order) {
    return { kind: 'redirect', response: redirect(localePath('/esim', lang)) };
  }

  const status = token ? await orderStatus(astro.locals, order.orderId, token) : null;

  if (status) {
    const qrCode = typeof status.qrCode === 'string' ? status.qrCode : undefined;
    const activationUrl =
      typeof status.activationUrl === 'string' ? status.activationUrl : undefined;
    if (qrCode || activationUrl) {
      const next: OrderState = { ...order, qrCode: qrCode ?? order.qrCode, activationUrl: activationUrl ?? order.activationUrl };
      setOrderState(astro, next);
      order = next;
    }
  }

  return {
    kind: 'ok',
    props: {
      order,
      status,
      state: typeof status?.status === 'string' ? status.status : 'PENDING',
      qrCode: (typeof status?.qrCode === 'string' ? status.qrCode : undefined) ?? order.qrCode,
      activationUrl:
        (typeof status?.activationUrl === 'string' ? status.activationUrl : undefined) ??
        order.activationUrl,
      lang,
    },
  };
}
