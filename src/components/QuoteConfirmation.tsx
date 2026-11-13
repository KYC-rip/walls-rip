import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export interface ConfirmedQuote { quoteId: string; provider: string; name: string; price: number; chargeCents: number; expiresAt: number; terms: Record<string, unknown> }
interface Prompt { quote: ConfirmedQuote; finish(value: boolean): void }
let listener: ((prompt: Prompt | null) => void) | null = null;
let pending: Prompt | null = null;
export function confirmQuote(quote: ConfirmedQuote): Promise<boolean> {
  pending?.finish(false);
  if (!listener) return Promise.resolve(false);
  return new Promise(resolve => {
    const prompt: Prompt = { quote, finish(value) {
      if (pending === prompt) { pending = null; listener?.(null); }
      resolve(value);
    } };
    pending = prompt; listener!(prompt);
  });
}
export function QuoteConfirmation() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [now, setNow] = useState(Date.now());
  const { pathname } = useLocation();
  const { t } = useTranslation();
  useEffect(() => {
    listener = setPrompt;
    return () => { pending?.finish(false); listener = null; };
  }, []);
  useEffect(() => { pending?.finish(false); }, [pathname]);
  useEffect(() => {
    if (!prompt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [prompt]);
  if (!prompt) return null;
  const q = prompt.quote, seconds = Math.max(0, Math.floor((q.expiresAt - now) / 1000));
  return <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="quote-title" className="w-full max-w-md rounded-sm border border-wr-accent bg-wr-surface p-6 space-y-4">
      <h2 id="quote-title" className="font-bold text-xl">{t('quote.confirm', 'Confirm purchase')}</h2>
      <p>{q.name}</p>
      <div className="flex flex-wrap gap-2 text-xs text-wr-dim">{Object.entries(q.terms).filter(([key]) => ['dataGB', 'durationDays', 'days', 'months', 'country'].includes(key)).map(([key, value]) => <span key={key}>{t(`quote.terms.${key}`, ({ dataGB: 'Data (GB)', durationDays: 'Validity (days)', days: 'Validity (days)', months: 'Validity (months)', country: 'Country' } as Record<string, string>)[key])}: {String(value)}</span>)}</div>
      <p className="text-3xl font-bold text-wr-accent">${q.price.toFixed(2)} <span className="text-sm">USD</span></p>
      <p className="text-sm text-wr-dim">{t('quote.ceiling', 'Your wallet will be charged no more than this amount. A price or plan change requires another confirmation.')}</p>
      <p className="text-xs text-wr-dim">{seconds > 0 ? t('quote.expires', 'Quote expires in {{seconds}} seconds', { seconds }) : t('quote.expired', 'Quote expired. Request a new quote.')}</p>
      <div className="flex justify-end gap-3"><button className="px-4 py-2 border border-wr-border" onClick={() => prompt.finish(false)}>{t('quote.cancel', 'Cancel')}</button>
        <button className="px-4 py-2 bg-wr-accent text-black font-bold disabled:opacity-40" disabled={seconds === 0} onClick={() => prompt.finish(true)}>{t('quote.buy', 'Confirm and buy')}</button></div>
    </section>
  </div>;
}
