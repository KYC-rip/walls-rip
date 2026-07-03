import { useState, useEffect, useMemo } from 'react';
import { Zap, Search, RefreshCw, Check, X, AlertTriangle, Clock, Database, Wallet, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient, APIError } from '../services/client';
import { PaymentGate } from '../components/PaymentGate';

interface TopupPlan {
  id: string; name: string; dataGB: number; durationDays?: number;
  price: number; currency: string; speed?: string; engine: string;
}
interface TopupPlansResp { engine: string; plans: TopupPlan[] }

const WALLET_KEY = 'walls_sms_wallet';

function initialOrder() {
  const p = new URLSearchParams(window.location.search);
  return p.get('order') || p.get('order_id') || p.get('id') || '';
}

export default function TopupWall() {
  const { t } = useTranslation();
  const prefill = useMemo(initialOrder, []);

  const [query, setQuery] = useState(prefill);
  const [looking, setLooking] = useState(false);
  const [engine, setEngine] = useState<string>('');
  const [plans, setPlans] = useState<TopupPlan[] | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [unsupported, setUnsupported] = useState(false);

  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState(0);

  const [selected, setSelected] = useState<TopupPlan | null>(null);
  const [modalStep, setModalStep] = useState<'details' | 'processing' | 'success' | 'error'>('details');
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (!walletToken) return;
    apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${walletToken}`)
      .then((d) => setBalanceUSD(d.balanceUSD))
      .catch(() => { localStorage.removeItem(WALLET_KEY); setWalletToken(null); setBalanceUSD(0); });
  }, [walletToken]);

  // Auto-lookup if arriving with a prefilled order id
  useEffect(() => { if (prefill) lookup(prefill); /* eslint-disable-next-line */ }, []);

  const lookup = async (raw?: string) => {
    const id = (raw ?? query).trim();
    if (!id) return;
    setLooking(true); setLookupError(''); setUnsupported(false); setPlans(null); setEngine('');
    try {
      const d = await apiClient<TopupPlansResp>(`/v1/tools/esim/topup/plans?order_id=${encodeURIComponent(id)}`);
      setEngine(d.engine);
      setPlans(d.plans);
      if (!d.plans.length) setLookupError(t('topup.no_plans', 'No recharge options available for this eSIM.'));
    } catch (e) {
      const err = e as APIError;
      if (err?.status === 501) { setUnsupported(true); }
      else if (err?.status === 404 || err?.status === 502) setLookupError(t('topup.not_found', "Couldn't find that eSIM. Check your order number or ICCID."));
      else setLookupError(err?.message || t('topup.lookup_failed', 'Lookup failed. Try again.'));
    } finally { setLooking(false); }
  };

  const openBuy = (p: TopupPlan) => { setSelected(p); setModalStep('details'); setModalError(''); };
  const closeModal = () => { setSelected(null); setModalStep('details'); };

  const doTopup = async (token: string) => {
    if (!selected) return;
    setModalStep('processing');
    try {
      const res = await apiClient<{ ok: boolean; charged: number; balanceUSD: number; message?: string }>('/v1/tools/esim/topup/purchase', {
        method: 'POST', body: { order_id: query.trim(), plan: selected.id, token },
      });
      if (!res.ok) throw new Error(res.message || 'Top-up failed');
      setBalanceUSD(res.balanceUSD); setModalStep('success');
    } catch (e: any) { setModalStep('error'); setModalError(e?.message || 'Top-up failed'); }
  };

  const handleModalTopup = () => { if (walletToken && balanceUSD >= (selected?.price ?? 0)) doTopup(walletToken); };
  const handleDeposit = async () => {
    const token = walletToken || localStorage.getItem(WALLET_KEY);
    if (!token) return;
    try { const d = await apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${token}`); setBalanceUSD(d.balanceUSD); } catch { /* optimistic */ }
    await doTopup(token);
  };

  const hasBalance = !!selected && !!walletToken && balanceUSD >= selected.price;

  return (
    <div className="min-h-screen flex flex-col items-center text-current relative">
      <SEO
        title="Top Up Your eSIM — anonymous recharge, no account"
        description="Recharge an existing anonymous eSIM by order number or ICCID. No account, no KYC. Pay with Monero, Lightning or USDT. Cheaper than buying a new eSIM."
        path="/esim/topup"
        image="/og-esim.jpg"
      />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />

      <main className="w-full max-w-3xl px-4 md:px-6 relative z-10 pb-12">
        <div className="max-w-3xl mx-auto space-y-6 pb-8 md:pb-12">

          {/* HERO */}
          <div className="text-center py-8 scale-90 md:scale-100 origin-top">
            <div className="mx-auto w-16 h-16 rounded-full bg-wr-accent/10 flex items-center justify-center text-wr-accent border border-wr-accent/20 mb-4"><Zap size={36} /></div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mb-2">
              {t('topup.title_a', 'Top Up')} <span className="text-wr-accent">{t('topup.title_b', 'Your eSIM')}</span>
            </h1>
            <p className="text-wr-dim text-sm max-w-md mx-auto">{t('topup.subtitle', 'Recharge an existing eSIM — far cheaper than buying a new one. No account, same privacy as your original purchase.')}</p>
          </div>

          {/* PRIVACY NOTE */}
          <div className="mx-2 md:mx-0 flex items-start gap-3 bg-green-500/5 border border-green-500/20 rounded-sm p-3.5 text-xs text-wr-dim">
            <Lock size={15} className="text-green-400 shrink-0 mt-0.5" />
            <span>{t('topup.privacy', 'Anonymous & account-free. Enter your order number or ICCID to look up your eSIM — nothing is saved or stored.')}</span>
          </div>

          {/* LOOKUP */}
          <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-border rounded-sm p-5 space-y-3">
            <label className="text-xs text-wr-dim uppercase tracking-widest font-bold">{t('topup.find', 'Find your eSIM')}</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
                placeholder={t('topup.placeholder', 'Order number or ICCID (e.g. 8943108…)')}
                className="flex-1 px-3 py-3 bg-wr-bg border border-wr-border rounded-sm font-mono text-sm focus:border-wr-accent/50 outline-none"
              />
              <button onClick={() => lookup()} disabled={looking || !query.trim()}
                className="px-6 py-3 bg-wr-accent text-black rounded-sm text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                {looking ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />} {t('topup.lookup', 'Look up')}
              </button>
            </div>
            <p className="text-[11px] text-wr-dim">{t('topup.hint', 'Bought from us? Your order number is on the eSIM you purchased (or open its top-up link).')}</p>
          </div>

          {/* RESULTS */}
          {unsupported && (
            <div className="mx-2 md:mx-0 bg-wr-accent/5 border border-wr-accent/20 rounded-sm p-6 text-center space-y-2">
              <AlertTriangle size={22} className="text-wr-accent mx-auto" />
              <p className="text-sm font-bold">{t('topup.soon_title', 'Recharge coming soon')}</p>
              <p className="text-xs text-wr-dim max-w-sm mx-auto">{t('topup.soon_desc', "This eSIM's provider doesn't support top-up through us yet. It's on the way — for now you can buy a fresh eSIM.")}</p>
            </div>
          )}
          {lookupError && !unsupported && (
            <div className="mx-2 md:mx-0 bg-red-500/5 border border-red-500/20 rounded-sm p-4 text-center text-xs text-red-400 flex items-center justify-center gap-2">
              <AlertTriangle size={15} /> {lookupError}
            </div>
          )}

          {plans && plans.length > 0 && (
            <div className="mx-2 md:mx-0 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-wr-dim uppercase tracking-widest">{t('topup.options', 'Recharge options')} · <span className="text-wr-accent">{engine}</span></span>
                {walletToken && <span className="text-xs text-green-400 flex items-center gap-1"><Wallet size={12} /> ${balanceUSD.toFixed(2)}</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {plans.map((p) => (
                  <button key={p.id} onClick={() => openBuy(p)}
                    className="text-left bg-wr-surface border border-wr-border hover:border-wr-accent/50 rounded-sm p-4 transition-all group">
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="text-2xl font-black">{p.dataGB}<span className="text-sm font-bold text-wr-dim">GB</span></span>
                      {p.durationDays && <span className="text-xs text-wr-dim flex items-center gap-1"><Clock size={11} /> {p.durationDays}d</span>}
                    </div>
                    {p.speed && <div className="text-[10px] text-wr-dim mb-2 flex items-center gap-1"><Database size={10} /> {p.speed}</div>}
                    <div className="flex items-center justify-between pt-2 border-t border-wr-border/40">
                      <span className="text-lg font-black text-wr-accent">${p.price.toFixed(2)}</span>
                      <span className="text-[10px] uppercase tracking-widest text-wr-dim group-hover:text-wr-accent transition-colors">{t('topup.recharge', 'Recharge')} →</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* BUY MODAL */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4" onClick={closeModal}>
          <div className="bg-wr-bg border border-wr-border rounded-t-lg md:rounded-lg w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-wr-bg border-b border-wr-border px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2 text-sm font-bold"><Zap size={16} className="text-wr-accent" /> {t('topup.recharge', 'Recharge')} · {selected.dataGB}GB</div>
              <button onClick={closeModal} className="text-wr-dim hover:text-current"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {modalStep === 'details' && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-wr-surface border border-wr-border rounded-sm py-3"><div className="text-lg font-black">{selected.dataGB}GB</div><div className="text-[10px] text-wr-dim uppercase">{t('topup.data', 'Data')}</div></div>
                    <div className="bg-wr-surface border border-wr-border rounded-sm py-3"><div className="text-lg font-black">{selected.durationDays ?? '—'}d</div><div className="text-[10px] text-wr-dim uppercase">{t('topup.validity', 'Validity')}</div></div>
                    <div className="bg-wr-surface border border-wr-border rounded-sm py-3"><div className="text-lg font-black text-wr-accent">${selected.price.toFixed(2)}</div><div className="text-[10px] text-wr-dim uppercase">{t('topup.price', 'Price')}</div></div>
                  </div>
                  <p className="text-[11px] text-wr-dim text-center">{t('topup.added_notice', 'Data is added to your existing eSIM — no need to reinstall or scan a new QR code.')}</p>
                  {hasBalance ? (
                    <div className="flex items-center gap-3 pt-1">
                      <button onClick={closeModal} className="px-4 py-2.5 text-xs text-wr-dim hover:text-current uppercase tracking-widest">{t('common.cancel', 'Cancel')}</button>
                      <button onClick={handleModalTopup} className="flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-sm bg-green-500 text-black hover:bg-green-400 flex items-center justify-center gap-2">
                        <Check size={14} /> {t('topup.confirm', 'Confirm recharge')}
                      </button>
                    </div>
                  ) : (
                    <div className="border-t border-wr-border/40 pt-4">
                      <PaymentGate
                        amount={selected.price}
                        methods={['XMR', 'LN', 'XMR402', 'USDT']}
                        walletToken={walletToken || undefined}
                        serviceName="esim"
                        createEndpoint="/v1/tools/esim/payment/create"
                        checkEndpoint="/v1/tools/sms/payment/check"
                        inline={true}
                        onWalletCreated={(token) => { if (!walletToken) { setWalletToken(token); localStorage.setItem(WALLET_KEY, token); } }}
                        onDeposit={() => { toast.success('Deposited'); handleDeposit(); }}
                      />
                      <div className="text-[11px] text-wr-accent/70 text-center mt-3">{t('topup.auto', 'Your eSIM is recharged automatically after payment.')}</div>
                    </div>
                  )}
                </>
              )}
              {modalStep === 'processing' && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/30"><Zap size={26} className="text-green-400 animate-pulse" /></div>
                  <p className="text-sm font-bold text-green-400 uppercase tracking-wider">{t('topup.processing', 'Recharging…')}</p>
                </div>
              )}
              {modalStep === 'success' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/30"><Check size={30} className="text-green-400" /></div>
                  <p className="text-sm font-bold text-green-400">{t('topup.success', 'eSIM recharged!')}</p>
                  <p className="text-xs text-wr-dim">{t('topup.success_desc', 'Your data has been added. It may take a minute to reflect on your device.')}</p>
                  <button onClick={closeModal} className="text-xs px-4 py-2 border border-wr-border rounded-sm uppercase tracking-widest">{t('common.done', 'Done')}</button>
                </div>
              )}
              {modalStep === 'error' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center">
                  <AlertTriangle size={30} className="text-red-400" />
                  <p className="text-sm font-bold text-red-400">{t('topup.failed', 'Recharge failed')}</p>
                  <p className="text-xs text-wr-dim">{modalError}</p>
                  <button onClick={() => setModalStep('details')} className="text-xs px-4 py-2 border border-wr-border rounded-sm uppercase tracking-widest">{t('common.retry', 'Retry')}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
