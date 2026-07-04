import { useState, useEffect, useMemo } from 'react';
import { Phone, PhoneCall, MessageSquare, Globe, Wallet, Check, Copy, RefreshCw, X, Shield, Database, Clock, AlertTriangle, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';
import { PaymentGate } from '../components/PaymentGate';

// ─── Types ───
interface PhonePlan {
  id: string; name: string; country: string; dataGB: number;
  durationDays: number; price: number; currency: string; engine: string;
  planType?: 'data' | 'phone'; hasVoice?: boolean; hasSms?: boolean;
  voiceMinutes?: number; smsCount?: number;
  coverageCount?: number;
}
interface PurchaseResult {
  orderId: string; planId: string; qrCode?: string; activationUrl?: string;
  status: string; engine: string; createdAt: number; balanceUSD: number; charged: number;
}
interface ProfileResult { qrCode?: string; activationUrl?: string }

const WALLET_KEY = 'walls_sms_wallet'; // shared wallet with SMS/eSIM

type RegionTab = 'US' | 'GLOBAL';

function initialFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return { order: p.get('id') || p.get('order') || undefined };
}

export default function PhoneWall() {
  const { t } = useTranslation();
  const initial = useMemo(initialFromUrl, []);

  const [plans, setPlans] = useState<PhonePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [region, setRegion] = useState<RegionTab>('US');

  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState(0);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreToken, setRestoreToken] = useState('');
  const [restoring, setRestoring] = useState(false);

  const [selected, setSelected] = useState<PhonePlan | null>(null);
  const [modalStep, setModalStep] = useState<'details' | 'purchasing' | 'success' | 'error'>('details');
  const [modalError, setModalError] = useState('');

  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [profileData, setProfileData] = useState<ProfileResult | null>(null);
  const [step, setStep] = useState<'SELECT' | 'PURCHASED'>('SELECT');
  const [copied, setCopied] = useState('');

  // ─── Load phone plans ───
  useEffect(() => {
    apiClient<PhonePlan[]>('/v1/tools/phone/plans')
      .then((p) => { setPlans(p); setLoading(false); })
      .catch((e: any) => {
        setLoading(false);
        if (e?.code === 'PHONE_NOT_CONFIGURED' || e?.status === 503) setNotConfigured(true);
        else toast.error('Failed to load phone plans');
      });
  }, []);

  // ─── Wallet balance ───
  useEffect(() => {
    if (!walletToken) return;
    apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${walletToken}`)
      .then((d) => setBalanceUSD(d.balanceUSD))
      .catch(() => { localStorage.removeItem(WALLET_KEY); setWalletToken(null); setBalanceUSD(0); });
  }, [walletToken]);

  // ─── Restore order from ?id= ───
  useEffect(() => {
    if (!initial.order) return;
    const token = walletToken || localStorage.getItem(WALLET_KEY);
    if (!token) return;
    const orderId = initial.order;
    setPurchase({ orderId, planId: '', status: 'PENDING', engine: orderId.split(':')[0] || '', createdAt: 0, balanceUSD: 0, charged: 0 });
    setStep('PURCHASED');
    apiClient<ProfileResult>(`/v1/tools/esim/profile?order_id=${encodeURIComponent(orderId)}&token=${token}`)
      .then((pr) => { if (pr.qrCode || pr.activationUrl) setProfileData(pr); else pollProfile(orderId, token); })
      .catch(() => pollProfile(orderId, token));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestore = async () => {
    if (!restoreToken.trim()) return;
    setRestoring(true);
    try {
      const d = await apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${restoreToken.trim()}`);
      setWalletToken(restoreToken.trim()); setBalanceUSD(d.balanceUSD);
      localStorage.setItem(WALLET_KEY, restoreToken.trim());
      setShowRestore(false); setRestoreToken('');
      toast.success(t('phone.wallet_restored', 'Wallet restored!'));
    } catch { toast.error(t('phone.invalid_token', 'Invalid wallet token')); }
    finally { setRestoring(false); }
  };

  // ─── Purchase flow (reuses eSIM lifecycle — same packageCode) ───
  const executePurchase = async (planId: string, token: string, engine?: string, country?: string) => {
    const data = await apiClient<PurchaseResult>('/v1/tools/esim/purchase', {
      method: 'POST', body: { planId, token, engine, country },
    });
    if (!data.orderId) throw new Error('Purchase failed — no order ID returned');
    setPurchase(data); setBalanceUSD(data.balanceUSD); setStep('PURCHASED');
    const rawId = data.orderId.includes(':') ? data.orderId.split(':').slice(1).join(':') : data.orderId;
    window.history.replaceState(null, '', `${window.location.pathname}?id=${rawId}`);
    if (data.qrCode || data.activationUrl) setProfileData({ qrCode: data.qrCode, activationUrl: data.activationUrl });
    else pollProfile(data.orderId, token);
  };

  const pollProfile = async (orderId: string, token: string) => {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const pr = await apiClient<ProfileResult>(`/v1/tools/esim/profile?order_id=${orderId}&token=${token}`);
        if (pr.qrCode || pr.activationUrl) { setProfileData(pr); return; }
      } catch { /* keep trying */ }
    }
  };

  const handleModalPurchase = async (plan: PhonePlan) => {
    if (!walletToken || balanceUSD < plan.price) return;
    setModalStep('purchasing');
    try { await executePurchase(plan.id, walletToken, plan.engine, plan.country); setModalStep('success'); }
    catch (e: any) { setModalStep('error'); setModalError(e?.message || 'Purchase failed'); }
  };

  const handlePaymentDeposit = async (usd: number, auto: { planId: string; engine: string; country: string }) => {
    setBalanceUSD((prev) => prev + usd);
    toast.success(`$${usd.toFixed(2)} deposited`);
    const token = walletToken || localStorage.getItem(WALLET_KEY);
    if (token) {
      try { const d = await apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${token}`); setBalanceUSD(d.balanceUSD); } catch { /* optimistic */ }
      setModalStep('purchasing');
      try { await executePurchase(auto.planId, token, auto.engine, auto.country); setModalStep('success'); }
      catch { setModalStep('error'); setModalError('Purchase failed after payment'); }
    }
  };

  const copy = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 2000); };

  const openPlan = (p: PhonePlan) => { setSelected(p); setModalStep('details'); setModalError(''); };
  const closeModal = () => { setSelected(null); setModalStep('details'); };
  const reset = () => {
    setPurchase(null); setProfileData(null); setStep('SELECT');
    window.history.replaceState(null, '', window.location.pathname);
  };

  const visible = plans.filter((p) => (region === 'US' ? p.country === 'US' : p.country === 'GLOBAL'));
  const hasBalance = !!selected && !!walletToken && balanceUSD >= selected.price;
  const qrValue = profileData?.qrCode || profileData?.activationUrl || '';

  return (
    <div className="min-h-screen flex flex-col items-center text-current relative">
      <SEO
        title="Phone Plans — anonymous eSIM with a real number, voice & SMS"
        description="Anonymous phone plans with a real number, voice calling and SMS. US & Global coverage, no KYC. Pay with Monero, Lightning or USDT — number assigned on activation."
        path="/phone"
        image="/og-esim.jpg"
        schemas={[{
          '@context': 'https://schema.org', '@type': 'Service',
          name: 'Anonymous Phone Plans — Number + Voice + SMS + Data',
          serviceType: 'eSIM Phone Plans', areaServed: 'Worldwide',
          description: 'Anonymous eSIM phone plans with a real number, voice calling and SMS. No KYC. Pay with Monero, Lightning or USDT.',
          provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          offers: { '@type': 'Offer', price: '9.45', priceCurrency: 'USD' },
        }]}
      />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />

      <main className="w-full max-w-4xl px-4 md:px-6 relative z-10 pb-12">
        <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-8 md:pb-12">

          {/* HERO */}
          <div className="text-center py-8 scale-90 md:scale-100 origin-top">
            <div className="mx-auto w-16 h-16 rounded-full bg-wr-accent/10 flex items-center justify-center text-wr-accent border border-wr-accent/20 mb-4">
              <Phone size={38} />
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mb-2">
              <span className="text-wr-accent">{t('phone.title_a', 'Phone')}</span>{t('phone.title_b', ' Plans')}
            </h1>
            <p className="text-wr-dim text-sm max-w-md mx-auto">
              {t('phone.subtitle', 'A real phone number with voice, SMS and data — anonymous, no KYC. Number assigned after you activate the eSIM.')}
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-4">
              {[
                { icon: <PhoneCall size={12} />, label: t('phone.tag_voice', 'Voice calling') },
                { icon: <MessageSquare size={12} />, label: t('phone.tag_sms', 'SMS') },
                { icon: <Database size={12} />, label: t('phone.tag_data', 'Data') },
                { icon: <Shield size={12} />, label: t('phone.tag_nokyc', 'No KYC') },
              ].map((tg) => (
                <span key={tg.label} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-wr-accent/20 text-wr-accent/80">
                  {tg.icon}{tg.label}
                </span>
              ))}
            </div>
          </div>

          {notConfigured && (
            <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-accent/30 p-6 md:p-8 rounded-sm text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-wr-accent/10 flex items-center justify-center text-wr-accent border border-wr-accent/20"><Phone size={22} /></div>
              <h2 className="text-wr-accent font-bold tracking-widest text-sm uppercase">{t('phone.coming_soon', 'Coming Soon')}</h2>
              <p className="text-xs text-wr-dim max-w-md mx-auto">{t('phone.coming_soon_desc', 'Anonymous phone plans are being provisioned. Check back shortly.')}</p>
            </div>
          )}

          {!notConfigured && (
            <>
              {/* WALLET BAR */}
              <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-border rounded-sm relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />
                <div className="p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-green-500/10 text-green-400 rounded-full border border-green-400/20"><Wallet size={20} /></div>
                    <div>
                      <div className="text-xs text-wr-dim uppercase tracking-widest">{t('phone.balance', 'Wallet balance')}</div>
                      <div className="text-lg font-black text-green-400">${balanceUSD.toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!walletToken && !showRestore && (
                      <button onClick={() => setShowRestore(true)} className="text-xs px-3 py-2 border border-wr-border rounded-sm text-wr-dim hover:text-current transition-colors uppercase tracking-widest">
                        {t('phone.restore_wallet', 'Restore wallet')}
                      </button>
                    )}
                    {showRestore && (
                      <div className="flex items-center gap-2">
                        <input value={restoreToken} onChange={(e) => setRestoreToken(e.target.value)} placeholder={t('phone.wallet_token', 'wallet token')} className="text-xs px-2 py-2 bg-wr-base border border-wr-border rounded-sm font-mono w-40" />
                        <button disabled={restoring} onClick={handleRestore} className="text-xs px-3 py-2 bg-green-500 text-black rounded-sm font-bold disabled:opacity-50">{restoring ? '…' : 'OK'}</button>
                        <button onClick={() => { setShowRestore(false); setRestoreToken(''); }} className="text-wr-dim"><X size={16} /></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* NUMBER-ASSIGNED NOTICE */}
              <div className="mx-2 md:mx-0 flex items-start gap-3 bg-wr-accent/5 border border-wr-accent/20 rounded-sm p-3.5 text-xs text-wr-dim">
                <AlertTriangle size={16} className="text-wr-accent shrink-0 mt-0.5" />
                <span>{t('phone.number_notice', 'The phone number is assigned automatically after you activate the eSIM on your device. Voice + SMS + data are included for the plan duration.')}</span>
              </div>

              {/* REGION TOGGLE */}
              <div className="flex justify-center gap-2">
                {(['US', 'GLOBAL'] as RegionTab[]).map((r) => (
                  <button key={r} onClick={() => setRegion(r)}
                    className={`inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold uppercase tracking-widest rounded-sm border transition-all ${region === r ? 'bg-wr-accent text-black border-wr-accent' : 'border-wr-border text-wr-dim hover:text-current'}`}>
                    {r === 'US' ? '🇺🇸' : <Globe size={13} />} {r === 'US' ? t('phone.tab_us', 'United States') : t('phone.tab_global', 'Global')}
                    <span className="opacity-60">({plans.filter((p) => (r === 'US' ? p.country === 'US' : p.country === 'GLOBAL')).length})</span>
                  </button>
                ))}
              </div>

              {/* PLAN GRID */}
              {loading ? (
                <div className="text-center py-16 text-wr-dim text-sm flex items-center justify-center gap-2"><RefreshCw size={16} className="animate-spin" /> {t('phone.loading', 'Loading plans…')}</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mx-2 md:mx-0">
                  {visible.map((p) => (
                    <button key={p.id} onClick={() => openPlan(p)}
                      className="text-left bg-wr-surface border border-wr-border hover:border-wr-accent/50 rounded-sm p-4 transition-all group relative overflow-hidden">
                      <div className="absolute right-0 top-0 px-2 py-0.5 bg-wr-accent/10 text-wr-accent text-[10px] font-bold uppercase tracking-widest rounded-bl-sm flex items-center gap-1">
                        <Phone size={10} /> {t('phone.badge_number', 'Number')}
                      </div>
                      <div className="flex items-center gap-1.5 text-wr-dim text-[11px] mb-2">
                        {p.country === 'US' ? '🇺🇸 United States' : <><Globe size={11} /> {t('phone.tab_global', 'Global')}{p.coverageCount ? ` · ${p.coverageCount}` : ''}</>}
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="text-2xl font-black text-current">{p.dataGB}<span className="text-sm font-bold text-wr-dim">GB</span></span>
                        <span className="text-xs text-wr-dim flex items-center gap-1"><Clock size={11} /> {p.durationDays}d</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-green-400/90 mb-3 font-semibold">
                        <span className="inline-flex items-center gap-1"><PhoneCall size={10} /> {p.voiceMinutes != null ? `${p.voiceMinutes} min` : t('phone.voice', 'Voice')}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare size={10} /> {p.smsCount != null ? `${p.smsCount} SMS` : 'SMS'}</span>
                        <span className="inline-flex items-center gap-1"><Database size={10} /> {p.dataGB}GB</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-wr-border/40">
                        <span className="text-lg font-black text-wr-accent">${p.price.toFixed(2)}</span>
                        <span className="text-[10px] uppercase tracking-widest text-wr-dim group-hover:text-wr-accent transition-colors">{t('phone.buy', 'Buy')} →</span>
                      </div>
                    </button>
                  ))}
                  {visible.length === 0 && <div className="col-span-full text-center py-12 text-wr-dim text-sm">{t('phone.none', 'No plans in this region.')}</div>}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ═══ PLAN DETAIL / PURCHASE MODAL ═══ */}
      {selected && step === 'SELECT' && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4" onClick={closeModal}>
          <div className="bg-wr-base border border-wr-border rounded-t-lg md:rounded-lg w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-wr-base border-b border-wr-border px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2 text-sm font-bold"><Phone size={16} className="text-wr-accent" /> {selected.country === 'US' ? '🇺🇸 US' : '🌐 Global'} {t('phone.plan', 'Phone Plan')}</div>
              <button onClick={closeModal} className="text-wr-dim hover:text-current"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">
              {modalStep === 'details' && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-wr-surface border border-wr-border rounded-sm py-3"><div className="text-lg font-black">{selected.dataGB}GB</div><div className="text-[10px] text-wr-dim uppercase">{t('phone.data', 'Data')}</div></div>
                    <div className="bg-wr-surface border border-wr-border rounded-sm py-3"><div className="text-lg font-black">{selected.durationDays}d</div><div className="text-[10px] text-wr-dim uppercase">{t('phone.validity', 'Validity')}</div></div>
                    <div className="bg-wr-surface border border-wr-border rounded-sm py-3"><div className="text-lg font-black text-wr-accent">${selected.price.toFixed(2)}</div><div className="text-[10px] text-wr-dim uppercase">{t('phone.price', 'Price')}</div></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-green-500/5 border border-green-500/20 rounded-sm py-2.5"><div className="text-sm font-black text-green-400 inline-flex items-center gap-1"><PhoneCall size={13} /> {selected.voiceMinutes != null ? selected.voiceMinutes : '✓'}</div><div className="text-[10px] text-wr-dim uppercase">{selected.voiceMinutes != null ? t('phone.voice_min', 'Voice min') : t('phone.voice', 'Voice')}</div></div>
                    <div className="bg-green-500/5 border border-green-500/20 rounded-sm py-2.5"><div className="text-sm font-black text-green-400 inline-flex items-center gap-1"><MessageSquare size={13} /> {selected.smsCount != null ? selected.smsCount : '✓'}</div><div className="text-[10px] text-wr-dim uppercase">{selected.smsCount != null ? t('phone.texts', 'Texts') : 'SMS'}</div></div>
                    <div className="bg-green-500/5 border border-green-500/20 rounded-sm py-2.5"><div className="text-sm font-black text-green-400 inline-flex items-center gap-1"><Phone size={13} /> ✓</div><div className="text-[10px] text-wr-dim uppercase">{t('phone.number', 'Number')}</div></div>
                  </div>
                  <div className="flex items-start gap-2 text-[11px] text-wr-dim bg-wr-accent/5 border border-wr-accent/20 rounded-sm p-3">
                    <AlertTriangle size={14} className="text-wr-accent shrink-0 mt-0.5" />
                    <span>{t('phone.number_notice', 'The phone number is assigned automatically after you activate the eSIM on your device. Voice + SMS + data are included for the plan duration.')}</span>
                  </div>

                  {walletToken && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-wr-dim">{t('phone.balance', 'Wallet balance')}</span>
                      <span className={`font-bold ${hasBalance ? 'text-green-400' : 'text-wr-dim'}`}>${balanceUSD.toFixed(2)}</span>
                    </div>
                  )}

                  {hasBalance ? (
                    <div className="flex items-center gap-3 pt-1">
                      <button onClick={closeModal} className="px-4 py-2.5 text-xs text-wr-dim hover:text-current uppercase tracking-widest">{t('common.cancel', 'Cancel')}</button>
                      <button onClick={() => handleModalPurchase(selected)} className="flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-sm bg-green-500 text-black hover:bg-green-400 flex items-center justify-center gap-2">
                        <Check size={14} /> {t('phone.confirm', 'Confirm purchase')}
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
                        onDeposit={(usd) => handlePaymentDeposit(usd, { planId: selected.id, engine: selected.engine, country: selected.country })}
                      />
                      <div className="text-[11px] text-wr-accent/70 text-center mt-3">{t('phone.auto_purchase', 'Your phone plan is purchased automatically after payment.')}</div>
                    </div>
                  )}
                </>
              )}

              {modalStep === 'purchasing' && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/30"><Phone size={26} className="text-green-400 animate-pulse" /></div>
                  <p className="text-sm font-bold text-green-400 uppercase tracking-wider">{t('phone.confirmed', 'Payment confirmed!')}</p>
                  <p className="text-xs text-wr-dim">{t('phone.provisioning', 'Provisioning your phone plan…')}</p>
                </div>
              )}

              {modalStep === 'error' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center">
                  <AlertTriangle size={32} className="text-red-400" />
                  <p className="text-sm font-bold text-red-400">{t('phone.error', 'Purchase failed')}</p>
                  <p className="text-xs text-wr-dim">{modalError}</p>
                  <button onClick={() => setModalStep('details')} className="text-xs px-4 py-2 border border-wr-border rounded-sm uppercase tracking-widest">{t('common.retry', 'Retry')}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PURCHASED — QR / ACTIVATION ═══ */}
      {step === 'PURCHASED' && purchase && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={reset}>
          <div className="bg-wr-base border border-green-500/40 rounded-lg w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-wr-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-green-400"><Check size={16} /> {t('phone.purchased', 'Phone plan purchased')}</div>
              <button onClick={reset} className="text-wr-dim hover:text-current"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 text-center">
              <p className="text-xs text-wr-dim">{t('phone.scan_activate', 'Scan the QR code with your phone to install the eSIM. Your number, voice, SMS and data activate once installed.')}</p>
              {qrValue ? (
                <div className="bg-white p-4 rounded-sm inline-block mx-auto"><QRCodeCanvas value={qrValue} size={200} /></div>
              ) : (
                <div className="py-8 text-wr-dim text-sm flex items-center justify-center gap-2"><RefreshCw size={16} className="animate-spin" /> {t('phone.awaiting', 'Awaiting eSIM provisioning…')}</div>
              )}
              {profileData?.activationUrl && (
                <button onClick={() => copy(profileData.activationUrl!, 'act')} className="w-full flex items-center justify-between gap-2 bg-wr-surface border border-wr-border rounded-sm px-3 py-2.5 text-xs font-mono">
                  <span className="truncate text-wr-dim">{profileData.activationUrl}</span>
                  {copied === 'act' ? <Check size={14} className="text-green-400 shrink-0" /> : <Copy size={14} className="text-wr-dim shrink-0" />}
                </button>
              )}
              <div className="flex items-center justify-between text-[11px] text-wr-dim pt-1">
                <span>{t('phone.order', 'Order')}</span>
                <button onClick={() => copy(purchase.orderId, 'ord')} className="font-mono flex items-center gap-1 hover:text-current">
                  {purchase.orderId.slice(0, 18)}… {copied === 'ord' ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                </button>
              </div>
              <a href={`/esim/topup?order=${encodeURIComponent(purchase.orderId)}`} className="w-full flex items-center justify-center gap-1.5 py-3 text-xs font-black uppercase tracking-widest rounded-sm bg-wr-accent/10 border border-wr-accent/30 text-wr-accent hover:bg-wr-accent/20 transition-all">
                <Zap size={13} /> {t('phone.topup', 'Top up / add data')}
              </a>
              <button onClick={reset} className="w-full py-3 text-xs font-black uppercase tracking-widest rounded-sm border border-wr-border hover:border-wr-border/60 text-wr-dim hover:text-current transition-all">
                {t('phone.buy_another', 'Buy another plan')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
