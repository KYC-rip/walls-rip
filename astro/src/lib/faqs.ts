import { t, type Lang } from './i18n';

export interface FaqItem {
  question: string;
  answer: string;
}

/** The four destination FAQs, shared by the visible list and the JSON-LD. */
export function destinationFaqs(lang: Lang, country: string, priceUsd: number): FaqItem[] {
  const price = priceUsd.toFixed(2);
  return [
    {
      question: t(lang, 'destination.faq_q1', { country }, `How much does an eSIM for ${country} cost?`),
      answer: t(
        lang,
        'destination.faq_a1',
        { country, price },
        `${country} eSIM plans start at $${price}. Prices are live and shown before you pay; the cheapest plan is always at the top of the list.`,
      ),
    },
    {
      question: t(lang, 'destination.faq_q2', { country }, `How do I install a ${country} eSIM?`),
      answer: t(
        lang,
        'destination.faq_a2',
        { country },
        'After checkout you get a QR code and an activation link. Scan the QR code in phone settings (Mobile Data → Add eSIM), or open the activation link on the device. Installation takes about two minutes.',
      ),
    },
    {
      question: t(lang, 'destination.faq_q3', { country }, `Do I need an ID or KYC for a ${country} eSIM?`),
      answer: t(
        lang,
        'destination.faq_a3',
        { country },
        'No. No account, name, email or identity document is required. Pay with Monero, Lightning or USDT; the plan is delivered as an installable eSIM profile.',
      ),
    },
    {
      question: t(lang, 'destination.faq_q4', { country }, `Can I top up a ${country} eSIM later?`),
      answer: t(
        lang,
        'destination.faq_a4',
        { country },
        'Yes, where the provider supports top-ups: open the eSIM top-up page with your order id and choose a recharge option. If a plan is not rechargeable, buy a new plan instead.',
      ),
    },
  ];
}
