import { useState, useEffect, useMemo } from 'react';
import { Phone, PhoneCall, MessageSquare, Globe, Check, Copy, RefreshCw, X, Shield, Database, Clock, AlertTriangle, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SUPPORTED_LANGS } from '../i18n/config';
import { Header } from '../components/Header';
import { WalletBanner } from '../components/WalletBanner';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';
import { PaymentGate } from '../components/PaymentGate';

const displayOrderId = (id: string): string => (id.includes(':') ? id.split(':').slice(1).join(':') : id);

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

/**
 * A visible tab is a country code ('US', 'GLOBAL', or any country PikaSim
 * really sells phone plans for). Destination pages deep-link `/phone?country=XX`.
 */
type RegionTab = string;

function initialFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return { order: p.get('id') || p.get('order') || undefined };
}

/** `?country=` wins over `?region=`; both are optional and keep old links working. */
function initialRegion(): RegionTab {
  const params = new URLSearchParams(window.location.search);
  const country = (params.get('country') || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(country)) return country;
  return params.get('region') === 'GLOBAL' ? 'GLOBAL' : 'US';
}

function flagOf(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map(ch => 127397 + ch.charCodeAt(0)));
}

export default function PhoneWall() {
  const { t, i18n } = useTranslation();
  const initial = useMemo(initialFromUrl, []);

  const [plans, setPlans] = useState<PhonePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [region, setRegion] = useState<RegionTab>(initialRegion);

  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState(0);
  const [showRestore, setShowRestore] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
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

  const countriesWithPlans = useMemo(() => new Set(plans.map(p => p.country)), [plans]);
  // A deep-linked country with no plans falls back to the default tab instead of
  // an empty page. Runs once the catalog has loaded.
  useEffect(() => {
    if (loading) return;
    if (region !== 'US' && region !== 'GLOBAL' && !countriesWithPlans.has(region)) setRegion('US');
  }, [loading, region, countriesWithPlans]);
  // The tab comes from the deep link (not the current selection), so switching
  // to Global and back keeps the destination-page entry point available.
  const requestedCountry = useMemo(() => {
    const raw = (new URLSearchParams(window.location.search).get('country') || '').toUpperCase();
    return /^[A-Z]{2}$/.test(raw) ? raw : null;
  }, []);
  const countryTab = requestedCountry && requestedCountry !== 'US' && countriesWithPlans.has(requestedCountry)
    ? requestedCountry : null;

  const visible = plans.filter((p) => p.country === region);
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
        }]}
      />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />

      <main className="w-full max-w-6xl px-4 md:px-6 relative z-10 pb-12">
        <div className="max-w-6xl mx-auto space-y-6 md:space-y-8 pb-8 md:pb-12">

          {/* HERO */}
          <div className="px-2 md:px-0 pt-8 md:pt-12 pb-2">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] font-bold text-wr-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-wr-accent" />
              {t('phone.kicker', 'Connectivity / Phone')}
            </div>
            <h1 className="mt-3 font-display text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">
              <span className="text-wr-accent">{t('phone.title_a', 'Phone')}</span>{t('phone.title_b', ' Plans')}
            </h1>
            <p className="mt-3 text-sm md:text-base text-wr-dim max-w-2xl leading-7">
              {t('phone.subtitle', 'A real phone number with voice, SMS and data — anonymous, no KYC. Number assigned after you activate the eSIM.')}
            </p>
            <div className="flex flex-wrap gap-2 pt-4">
              {[
                { icon: <PhoneCall size={12} />, label: t('phone.tag_voice', 'Voice calling'), tone: 'border-wr-secondary/30 text-wr-secondary' },
                { icon: <MessageSquare size={12} />, label: t('phone.tag_sms', 'SMS'), tone: 'border-wr-info/30 text-wr-info' },
                { icon: <Database size={12} />, label: t('phone.tag_data', 'Data'), tone: 'border-wr-accent/30 text-wr-accent' },
                { icon: <Shield size={12} />, label: t('phone.tag_nokyc', 'No KYC'), tone: 'border-wr-border text-wr-dim' },
              ].map((tg) => (
                <span key={tg.label} className={`inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] px-2.5 py-1.5 rounded-sm border ${tg.tone}`}>
                  {tg.icon}{tg.label}
                </span>
              ))}
            </div>
          </div>

          {notConfigured && (
            <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-border p-6 md:p-8 rounded-sm space-y-3">
              <div className="inline-flex p-2.5 bg-wr-info/10 text-wr-info border border-wr-info/20 rounded-sm"><Phone size={20} /></div>
              <h2 className="text-wr-info font-mono font-bold tracking-[0.18em] text-[11px] uppercase">{t('phone.coming_soon', 'Coming Soon')}</h2>
              <p className="text-xs text-wr-dim max-w-md">{t('phone.coming_soon_desc', 'Anonymous phone plans are being provisioned. Check back shortly.')}</p>
            </div>
          )}

          {!notConfigured && (
            <>
              <WalletBanner
                token={walletToken}
                balance={balanceUSD}
                helper={t('phone.wallet_helper', 'One prepaid balance covers eSIMs, SMS and phone plans — deposit once and use it across pages.')}
                onDeposit={() => setShowDeposit(true)}
                restoreOpen={showRestore}
                setRestoreOpen={setShowRestore}
                restoreToken={restoreToken}
                setRestoreToken={setRestoreToken}
                onRestore={handleRestore}
                restoring={restoring}
              />

              {/* NUMBER-ASSIGNED NOTICE */}
              <div className="mx-2 md:mx-0 flex items-start gap-3 bg-wr-warning/5 border border-wr-warning/25 rounded-sm p-3.5 text-xs text-wr-dim">
                <AlertTriangle size={16} className="text-wr-warning shrink-0 mt-0.5" />
                <span>{t('phone.number_notice', 'The phone number is assigned automatically after you activate the eSIM on your device. Voice + SMS + data are included for the plan duration.')}</span>
              </div>

              {/* REGION / PRODUCT TOGGLE */}
              <div className="flex justify-start gap-2 flex-wrap px-2 md:px-0">
                {(['US', 'GLOBAL'] as RegionTab[]).map((r) => (
                  <button key={r} onClick={() => { setRegion(r); const url = new URL(window.location.href); if (r === 'US') url.searchParams.delete('region'); else url.searchParams.set('region', r); window.history.replaceState(null, '', `${url.pathname}${url.search}`); }}
                    className={`min-h-11 inline-flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-[0.18em] rounded-sm border transition-colors ${region === r ? 'bg-wr-accent text-black border-wr-accent' : 'border-wr-border text-wr-dim hover:text-current hover:border-wr-accent/50'}`}>
                    {r === 'US' ? '🇺🇸' : <Globe size={13} />} {r === 'US' ? t('phone.tab_us', 'United States') : t('phone.tab_global', 'Global')}
                    <span className="opacity-60">({plans.filter((p) => p.country === r).length})</span>
                  </button>
                ))}
                {countryTab && (
                  // Only the URL-preselected country gets a tab; clicking it does
                  // not rewrite the query (a reload must land on the same view).
                  <button onClick={() => setRegion(countryTab)}
                    className={`min-h-11 inline-flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-[0.18em] rounded-sm border transition-colors ${region === countryTab ? 'bg-wr-accent text-black border-wr-accent' : 'border-wr-border text-wr-dim hover:text-current hover:border-wr-accent/50'}`}>
                    {flagOf(countryTab)} {countryTab}
                    <span className="opacity-60">({plans.filter((p) => p.country === countryTab).length})</span>
                  </button>
                )}
                <Link to={`${i18n.language !== 'en' && (SUPPORTED_LANGS as readonly string[]).includes(i18n.language) ? `/${i18n.language}` : ''}/uk-sim`}
                  className="min-h-11 inline-flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-mono font-bold uppercase tracking-[0.18em] rounded-sm border transition-colors border-wr-secondary/40 text-wr-secondary hover:border-wr-secondary">🇬🇧 United Kingdom</Link>
              </div>

              {/* PLAN GRID */}
              {loading ? (
                <div className="text-center py-16 text-wr-dim text-sm flex items-center justify-center gap-2"><RefreshCw size={16} className="animate-spin" /> {t('phone.loading', 'Loading plans…')}</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mx-2 md:mx-0">
                  {visible.map((p) => (
                    <button key={p.id} onClick={() => openPlan(p)}
                      className="text-left bg-wr-surface border border-wr-border hover:border-wr-accent/60 rounded-sm p-4 transition-colors group flex flex-col">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.16em] text-wr-dim">
                          {p.country === 'US' ? '🇺🇸 United States' : <><Globe size={11} className="text-wr-secondary" /> {t('phone.tab_global', 'Global')}{p.coverageCount ? ` · ${p.coverageCount}` : ''}</>}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.16em] text-wr-info">
                          <Clock size={11} /> {p.durationDays}d
                        </span>
                      </div>
                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-3xl font-black tabular-nums">{p.dataGB}<span className="text-sm font-bold text-wr-dim">GB</span></span>
                        <span className="ml-auto text-[11px] font-mono uppercase tracking-[0.16em] px-2 py-0.5 border border-wr-accent/30 text-wr-accent rounded-sm">
                          <Phone size={10} className="inline mr-1" />{t('phone.badge_number', 'Number')}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5 border-t border-wr-border/60 pt-3 text-[11px] font-mono">
                        <div className="flex items-center justify-between gap-2 text-wr-dim">
                          <span className="inline-flex items-center gap-1.5"><PhoneCall size={11} className="text-wr-secondary" /> {t('phone.voice', 'Voice')}</span>
                          <span className="text-current tabular-nums">{p.voiceMinutes != null ? `${p.voiceMinutes} min` : '✓'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-wr-dim">
                          <span className="inline-flex items-center gap-1.5"><MessageSquare size={11} className="text-wr-info" /> {t('phone.tag_sms', 'SMS')}</span>
                          <span className="text-current tabular-nums">{p.smsCount != null ? `${p.smsCount}` : '✓'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-wr-dim">
                          <span className="inline-flex items-center gap-1.5"><Database size={11} className="text-wr-accent" /> {t('phone.data', 'Data')}</span>
                          <span className="text-current tabular-nums">{p.dataGB}GB</span>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-wr-border pt-3">
                        <span className="text-xl font-black tabular-nums">${p.price.toFixed(2)}</span>
                        <span className="inline-flex min-h-9 items-center gap-1 px-3 border border-wr-border rounded-sm text-[11px] font-mono uppercase tracking-[0.18em] text-wr-dim group-hover:border-wr-accent group-hover:text-wr-accent transition-colors">{t('phone.buy', 'Buy')} →</span>
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
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-wr-base border border-wr-border rounded-sm py-3 px-2"><div className="text-lg font-black tabular-nums">{selected.dataGB}GB</div><div className="text-[11px] font-mono text-wr-dim uppercase tracking-[0.14em]">{t('phone.data', 'Data')}</div></div>
                    <div className="bg-wr-base border border-wr-border rounded-sm py-3 px-2"><div className="text-lg font-black tabular-nums">{selected.durationDays}d</div><div className="text-[11px] font-mono text-wr-dim uppercase tracking-[0.14em]">{t('phone.validity', 'Validity')}</div></div>
                    <div className="bg-wr-base border border-wr-border rounded-sm py-3 px-2"><div className="text-lg font-black tabular-nums text-wr-accent">${selected.price.toFixed(2)}</div><div className="text-[11px] font-mono text-wr-dim uppercase tracking-[0.14em]">{t('phone.price', 'Price')}</div></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-wr-secondary/5 border border-wr-secondary/20 rounded-sm py-2.5 px-1"><div className="text-sm font-black text-wr-secondary inline-flex items-center gap-1 tabular-nums"><PhoneCall size={13} /> {selected.voiceMinutes != null ? selected.voiceMinutes : '✓'}</div><div className="text-[11px] font-mono text-wr-dim uppercase tracking-[0.14em]">{selected.voiceMinutes != null ? t('phone.voice_min', 'Voice min') : t('phone.voice', 'Voice')}</div></div>
                    <div className="bg-wr-info/5 border border-wr-info/20 rounded-sm py-2.5 px-1"><div className="text-sm font-black text-wr-info inline-flex items-center gap-1 tabular-nums"><MessageSquare size={13} /> {selected.smsCount != null ? selected.smsCount : '✓'}</div><div className="text-[11px] font-mono text-wr-dim uppercase tracking-[0.14em]">{selected.smsCount != null ? t('phone.texts', 'Texts') : 'SMS'}</div></div>
                    <div className="bg-wr-accent/5 border border-wr-accent/20 rounded-sm py-2.5 px-1"><div className="text-sm font-black text-wr-accent inline-flex items-center gap-1"><Phone size={13} /> ✓</div><div className="text-[11px] font-mono text-wr-dim uppercase tracking-[0.14em]">{t('phone.number', 'Number')}</div></div>
                  </div>
                  <div className="flex items-start gap-2 text-[11px] text-wr-dim bg-wr-warning/5 border border-wr-warning/25 rounded-sm p-3">
                    <AlertTriangle size={14} className="text-wr-warning shrink-0 mt-0.5" />
                    <span>{t('phone.number_notice', 'The phone number is assigned automatically after you activate the eSIM on your device. Voice + SMS + data are included for the plan duration.')}</span>
                  </div>

                  {walletToken && (
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-wr-dim">{t('phone.balance', 'Wallet balance')}</span>
                      <span className={`font-bold tabular-nums ${hasBalance ? 'text-wr-accent' : 'text-wr-dim'}`}>${balanceUSD.toFixed(2)}</span>
                    </div>
                  )}

                  {hasBalance ? (
                    <div className="sticky bottom-0 -mx-5 px-5 -mb-5 pb-5 pt-3 bg-wr-base border-t border-wr-border flex items-center gap-3">
                      <button onClick={closeModal} className="min-h-11 px-4 py-2.5 text-[11px] font-mono text-wr-dim hover:text-current uppercase tracking-[0.18em]">{t('common.cancel', 'Cancel')}</button>
                      <button onClick={() => handleModalPurchase(selected)} className="min-h-11 flex-1 py-3 text-xs font-black uppercase tracking-[0.18em] rounded-sm bg-wr-accent text-black hover:opacity-90 flex items-center justify-center gap-2">
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
                      <div className="text-[11px] text-wr-info text-center mt-3">{t('phone.auto_purchase', 'Your phone plan is purchased automatically after payment.')}</div>
                    </div>
                  )}
                </>
              )}

              {modalStep === 'purchasing' && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="w-16 h-16 rounded-sm bg-wr-accent/10 flex items-center justify-center border border-wr-accent/30"><Phone size={26} className="text-wr-accent animate-pulse" /></div>
                  <p className="text-sm font-bold text-wr-accent uppercase tracking-[0.18em]">{t('phone.confirmed', 'Payment confirmed!')}</p>
                  <p className="text-xs text-wr-info">{t('phone.provisioning', 'Provisioning your phone plan…')}</p>
                </div>
              )}

              {modalStep === 'error' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center">
                  <AlertTriangle size={32} className="text-wr-error" />
                  <p className="text-sm font-bold text-wr-error">{t('phone.error', 'Purchase failed')}</p>
                  <p className="text-xs text-wr-dim">{modalError}</p>
                  <button onClick={() => setModalStep('details')} className="min-h-11 text-xs px-4 py-2.5 border border-wr-border rounded-sm uppercase tracking-[0.18em] hover:border-wr-accent hover:text-wr-accent">{t('common.retry', 'Retry')}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PURCHASED — QR / ACTIVATION ═══ */}
      {step === 'PURCHASED' && purchase && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={reset}>
          <div className="bg-wr-base border border-wr-accent/40 rounded-lg w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-wr-base px-5 py-4 border-b border-wr-border flex items-center justify-between z-10">
              <div className="flex items-center gap-2 text-sm font-bold text-wr-accent"><Check size={16} /> {t('phone.purchased', 'Phone plan purchased')}</div>
              <button onClick={reset} className="p-2.5 text-wr-dim hover:text-current" aria-label={t('common.close', 'Close')}><X size={18} /></button>
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
                  {copied === 'act' ? <Check size={14} className="text-wr-accent shrink-0" /> : <Copy size={14} className="text-wr-dim shrink-0" />}
                </button>
              )}
              <div className="flex items-center justify-between text-[11px] font-mono text-wr-dim pt-1">
                <span>{t('phone.order', 'Order')}</span>
                <button onClick={() => copy(displayOrderId(purchase.orderId), 'ord')} className="font-mono flex items-center gap-1 hover:text-current min-h-11">
                  {displayOrderId(purchase.orderId).slice(0, 18)} {copied === 'ord' ? <Check size={11} className="text-wr-accent" /> : <Copy size={11} />}
                </button>
              </div>
              <a href={`/esim/topup?order=${encodeURIComponent(purchase.orderId)}`} className="min-h-11 w-full flex items-center justify-center gap-1.5 py-3 text-xs font-black uppercase tracking-[0.18em] rounded-sm bg-wr-secondary/10 border border-wr-secondary/30 text-wr-secondary hover:bg-wr-secondary/20 transition-colors">
                <Zap size={13} /> {t('phone.topup', 'Top up / add data')}
              </a>
              <button onClick={reset} className="min-h-11 w-full py-3 text-xs font-black uppercase tracking-[0.18em] rounded-sm border border-wr-border hover:border-wr-accent hover:text-wr-accent text-wr-dim transition-colors">
                {t('phone.buy_another', 'Buy another plan')}
              </button>
            </div>
          </div>
        </div>
      )}

      <PaymentGate
        amount={5}
        methods={['XMR', 'LN', 'XMR402', 'USDT']}
        walletToken={walletToken || undefined}
        serviceName="phone"
        createEndpoint="/v1/tools/esim/payment/create"
        checkEndpoint="/v1/tools/sms/payment/check"
        showPresets={true}
        presets={[3, 5, 10, 20]}
        isOpen={showDeposit}
        onClose={() => setShowDeposit(false)}
        onWalletCreated={(token) => {
          if (!walletToken) { setWalletToken(token); localStorage.setItem(WALLET_KEY, token); }
        }}
        onDeposit={(usd) => {
          setBalanceUSD(prev => prev + usd);
          toast.success(`$${usd.toFixed(2)} deposited`);
          setShowDeposit(false);
          const token = walletToken || localStorage.getItem(WALLET_KEY);
          if (token) {
            apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${token}`)
              .then(d => setBalanceUSD(d.balanceUSD))
              .catch(() => {});
          }
        }}
      />

      <Footer />
    </div>
  );
}
