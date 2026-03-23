import { useState, useEffect, useMemo } from 'react';
import { Smartphone, Globe, Search, Copy, Check, RefreshCw, Clock, AlertTriangle, ChevronRight, Wallet, Zap, X, Plus, Wifi, Signal, ArrowUpDown, SlidersHorizontal, Shield, Tag } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';

// ─── Types ───

interface MergedCountry { code: string; name: string; regions: string[]; engines: string[] }
interface ComparePlan {
  id: string; name: string; country: string; dataGB: number;
  durationDays: number; costPrice: number; price: number;
  currency: string; engine: string;
}
interface CompareResponse {
  plans: ComparePlan[];
  engines: string[];
  cheapest: string | null;
}

interface PaymentData {
  method: 'XMR' | 'LN';
  address: string;
  paymentId: string;
  amount: number;
  usd: number;
}

interface PurchaseResult {
  orderId: string;
  planId: string;
  qrCode?: string;
  activationUrl?: string;
  status: string;
  engine: string;
  createdAt: number;
  balanceUSD: number;
  charged: number;
}

interface ProfileResult {
  qrCode?: string;
  activationUrl?: string;
}

const WALLET_KEY = 'walls_sms_wallet'; // Shared with SMS wallet
const DEPOSIT_AMOUNTS = [3, 5, 10, 20];

// ─── Engine Colors ───

const ENGINE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string; label: string }> = {
  pikasim:    { bg: 'bg-emerald-500/10', border: 'border-emerald-400/40', text: 'text-emerald-400', glow: 'shadow-emerald-500/20', label: 'PikaSim' },
  esimaccess: { bg: 'bg-violet-500/10',  border: 'border-violet-400/40',  text: 'text-violet-400',  glow: 'shadow-violet-500/20',  label: 'eSIM Access' },
  smspool:    { bg: 'bg-amber-500/10',   border: 'border-amber-400/40',   text: 'text-amber-400',   glow: 'shadow-amber-500/20',   label: 'SMSPool' },
  silentlink: { bg: 'bg-rose-500/10',    border: 'border-rose-400/40',    text: 'text-rose-400',    glow: 'shadow-rose-500/20',     label: 'SilentLink' },
};

function getEngineStyle(engine: string) {
  return ENGINE_COLORS[engine] || { bg: 'bg-cyan-500/10', border: 'border-cyan-400/40', text: 'text-cyan-400', glow: 'shadow-cyan-500/20', label: engine };
}

// ─── Data filter buckets ───
const DATA_FILTERS = [
  { label: 'All', min: 0, max: Infinity },
  { label: '1GB', min: 0.5, max: 1.5 },
  { label: '3GB', min: 2, max: 4 },
  { label: '5GB', min: 4, max: 6 },
  { label: '10GB+', min: 10, max: Infinity },
] as const;

type SortKey = 'price' | 'data' | 'duration';

export function ESIMWall() {
  const { t } = useTranslation();
  const [countries, setCountries] = useState<MergedCountry[]>([]);
  const [comparePlans, setComparePlans] = useState<ComparePlan[]>([]);
  const [activeEngines, setActiveEngines] = useState<string[]>([]);
  const [cheapestId, setCheapestId] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [countrySearch, setCountrySearch] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Filters
  const [dataFilter, setDataFilter] = useState(0); // index into DATA_FILTERS
  const [engineFilter, setEngineFilter] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('price');
  const [sortAsc, setSortAsc] = useState(true);

  // Wallet (shared with SMS)
  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState<number>(0);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'XMR' | 'LN'>('XMR');
  const [depositAmount, setDepositAmount] = useState<number>(5);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMethodInModal, setShowMethodInModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentPolling, setPaymentPolling] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState<{ planId: string; engine: string } | null>(null);

  // Purchase flow
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [profileData, setProfileData] = useState<ProfileResult | null>(null);
  const [step, setStep] = useState<'SELECT' | 'PURCHASED'>('SELECT');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);

  // ─── Load countries (merged from all engines) ───
  useEffect(() => {
    apiClient<MergedCountry[]>('/v1/tools/esim/countries/all')
      .then(c => { setCountries(c); })
      .catch((e) => {
        if (e?.data?.code === 'ESIM_NOT_CONFIGURED' || e?.message?.includes('ESIM_NOT_CONFIGURED')) {
          setNotConfigured(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // ─── Check wallet balance (shared with SMS) ───
  useEffect(() => {
    if (!walletToken) return;
    apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${walletToken}`)
      .then(data => setBalanceUSD(data.balanceUSD))
      .catch(() => { localStorage.removeItem(WALLET_KEY); setWalletToken(null); setBalanceUSD(0); });
  }, [walletToken]);

  // ─── Fetch compare plans when country selected ───
  useEffect(() => {
    if (!selectedCountry) { setComparePlans([]); setActiveEngines([]); setCheapestId(null); return; }
    setLoadingPlans(true);
    apiClient<CompareResponse>(`/v1/tools/esim/compare?country=${selectedCountry}`)
      .then(data => {
        setComparePlans(data.plans);
        setActiveEngines(data.engines);
        setCheapestId(data.cheapest);
        // Reset engine filter to show all
        setEngineFilter(new Set());
      })
      .catch(() => { setComparePlans([]); toast.error('Failed to load plans'); })
      .finally(() => setLoadingPlans(false));
  }, [selectedCountry]);

  // ─── Poll for payment ───
  useEffect(() => {
    if (!paymentPolling || !paymentData) return;
    const interval = setInterval(async () => {
      try {
        const result = await apiClient<{ status: string; walletToken?: string; balanceUSD?: number }>(
          `/v1/tools/esim/payment/check?paymentId=${paymentData.paymentId}`
        );
        if (result.status === 'COMPLETED' && result.walletToken) {
          setPaymentPolling(false);
          setWalletToken(result.walletToken);
          setBalanceUSD(result.balanceUSD || 0);
          localStorage.setItem(WALLET_KEY, result.walletToken);
          setPaymentData(null); setShowPaymentModal(false);
          toast.success(`$${paymentData.usd.toFixed(2)} deposited!`);

          if (pendingPurchase) {
            setTimeout(() => executePurchase(pendingPurchase.planId, result.walletToken!, pendingPurchase.engine), 500);
            setPendingPurchase(null);
          }
        } else if (result.status === 'EXPIRED') {
          setPaymentPolling(false); setPaymentData(null);
          setPendingPurchase(null);
          toast.error('Payment expired');
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [paymentPolling, paymentData, pendingPurchase]);

  // ─── Actions ───

  const [creatingPayment, setCreatingPayment] = useState(false);

  const createPayment = async (usdAmount: number, purchaseAfter?: { planId: string; engine: string }) => {
    setCreatingPayment(true);
    try {
      const data = await apiClient<PaymentData>('/v1/tools/esim/payment/create', {
        method: 'POST',
        body: { amount: usdAmount, method: paymentMethod, walletToken },
      });
      setPaymentData(data); setPaymentPolling(true); setShowPaymentModal(true); setShowMethodInModal(false);
      if (purchaseAfter) setPendingPurchase(purchaseAfter);
    } catch { toast.error('Failed to create payment'); }
    finally { setCreatingPayment(false); }
  };

  const executePurchase = async (planId: string, token: string, engine?: string) => {
    try {
      const data = await apiClient<PurchaseResult>('/v1/tools/esim/purchase', {
        method: 'POST',
        body: { planId, token, engine },
      });
      if (data.orderId) {
        setPurchase(data);
        setBalanceUSD(data.balanceUSD);
        setStep('PURCHASED');
        if (data.qrCode || data.activationUrl) {
          setProfileData({ qrCode: data.qrCode, activationUrl: data.activationUrl });
        } else {
          pollProfile(data.orderId, token);
        }
        toast.success('eSIM purchased!');
      } else {
        toast.error('Purchase failed');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Purchase failed');
    }
  };

  const pollProfile = async (orderId: string, token: string) => {
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const profile = await apiClient<ProfileResult>(`/v1/tools/esim/profile?order_id=${orderId}&token=${token}`);
        if (profile.qrCode || profile.activationUrl) {
          setProfileData(profile);
          return;
        }
      } catch { /* keep trying */ }
    }
  };

  const handleBuyPlan = async (plan: ComparePlan) => {
    const price = plan.price;

    if (walletToken && balanceUSD >= price) {
      executePurchase(plan.id, walletToken, plan.engine);
    } else {
      const needed = walletToken ? price - balanceUSD : price;
      const depositAmt = Math.max(needed, 3);
      setDepositAmount(Math.ceil(depositAmt));
      createPayment(Math.ceil(depositAmt), { planId: plan.id, engine: plan.engine });
    }
  };

  const handleDeposit = () => {
    createPayment(depositAmount);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text); setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setPurchase(null); setProfileData(null);
    setStep('SELECT');
  };

  // ─── Derived ───

  const filteredCountries = useMemo(() => {
    return countries
      .filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, countrySearch]);

  const selectedCountryName = countries.find(c => c.code === selectedCountry)?.name || '';

  const filteredPlans = useMemo(() => {
    let plans = [...comparePlans];

    // Data filter
    const df = DATA_FILTERS[dataFilter];
    if (df.min > 0 || df.max < Infinity) {
      plans = plans.filter(p => p.dataGB >= df.min && p.dataGB <= df.max);
    }

    // Engine filter
    if (engineFilter.size > 0) {
      plans = plans.filter(p => engineFilter.has(p.engine));
    }

    // Sort
    plans.sort((a, b) => {
      let diff = 0;
      if (sortKey === 'price') diff = a.price - b.price;
      else if (sortKey === 'data') diff = a.dataGB - b.dataGB;
      else if (sortKey === 'duration') diff = a.durationDays - b.durationDays;
      return sortAsc ? diff : -diff;
    });

    return plans;
  }, [comparePlans, dataFilter, engineFilter, sortKey, sortAsc]);

  // Highest price for savings calculation
  const highestPrice = useMemo(() => {
    if (filteredPlans.length === 0) return 0;
    return Math.max(...filteredPlans.map(p => p.price));
  }, [filteredPlans]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const toggleEngineFilter = (engine: string) => {
    setEngineFilter(prev => {
      const next = new Set(prev);
      if (next.has(engine)) next.delete(engine);
      else next.add(engine);
      return next;
    });
  };

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 animate-pulse text-wr-dim">
          <RefreshCw size={32} className="animate-spin mb-4" />
          <p className="text-xs tracking-widest uppercase">{t('esim.loading')}</p>
        </div>
      </div>
    );
  }

  // ─── PURCHASED state — show QR code & activation ───
  if (step === 'PURCHASED' && purchase) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <SEO
          title="eSIM Purchased — walls.rip"
          description="Your anonymous eSIM has been purchased. Scan the QR code to activate."
          path="/esim"
          image="/og-esim.jpg"
          schemas={[
            {
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'eSIM',
              url: 'https://walls.rip/esim',
              applicationCategory: 'UtilitiesApplication',
              operatingSystem: 'Web',
              description: 'Anonymous eSIM data plans for 120+ countries. No KYC, no registration. 3G/4G/5G.',
              provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'Service',
              name: 'eSIM — Anonymous Data Plans',
              serviceType: 'eSIM Data Plans',
              areaServed: 'Worldwide',
              description: 'Buy anonymous eSIM data plans for 120+ countries. Install via QR code, pay with Monero or Lightning.',
              provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
            },
          ]}
        />
        <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
        <div className="fixed inset-0 z-40 pointer-events-none vignette" />
        <Header />
        <main className="w-full max-w-2xl px-4 relative z-10 flex flex-col gap-8 mb-20 mt-8">
          <div className="p-8 rounded-sm border border-wr-green bg-wr-surface text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 border border-green-400/20">
              <Check size={32} />
            </div>
            <h2 className="text-lg font-bold tracking-wider text-wr-green">{t('esim.esim_purchased')}</h2>
            <p className="text-xs text-wr-dim">{t('esim.scan_qr')}</p>

            {profileData?.qrCode ? (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-sm">
                    <QRCodeCanvas
                      value={profileData.qrCode}
                      size={200} level="M" bgColor="#ffffff" fgColor="#000000"
                    />
                  </div>
                </div>
                <button onClick={() => copyText(profileData.qrCode!)}
                  className="w-full p-3 rounded bg-wr-base border border-wr-border text-[10px] font-mono text-wr-green break-all text-left hover:border-wr-green/50 transition-colors cursor-pointer flex items-center justify-between gap-2">
                  <span className="truncate">{profileData.qrCode}</span>
                  {copied ? <Check size={14} className="text-green-500 shrink-0" /> : <Copy size={14} className="text-wr-dim shrink-0" />}
                </button>
              </div>
            ) : profileData?.activationUrl ? (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-sm">
                    <QRCodeCanvas
                      value={profileData.activationUrl}
                      size={200} level="M" bgColor="#ffffff" fgColor="#000000"
                    />
                  </div>
                </div>
                <a href={profileData.activationUrl} target="_blank" rel="noreferrer"
                  className="w-full p-3 rounded bg-wr-base border border-wr-green text-xs font-mono text-wr-green break-all hover:bg-wr-green/5 transition-colors block text-center">
                  {t('esim.open_activation')}
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-xs text-wr-dim">
                  <RefreshCw size={12} className="animate-spin" /> {t('esim.loading_activation')}
                </div>
                <p className="text-[10px] text-wr-dim">{t('esim.provisioning')}</p>
              </div>
            )}

            <div className="border-t border-wr-border/30 pt-4 space-y-2">
              <div className="text-[10px] text-wr-dim">Order: {purchase.orderId}</div>
              <div className="text-[10px] text-wr-dim">Engine: {purchase.engine}</div>
              <div className="text-[10px] text-wr-dim">Charged: ${purchase.charged.toFixed(2)} — Wallet: ${balanceUSD.toFixed(2)}</div>
            </div>

            <div className="bg-wr-base border border-wr-border/50 rounded p-4 text-left space-y-2">
              <h4 className="text-[10px] font-bold uppercase text-wr-accent tracking-widest">{t('esim.installation_guide')}</h4>
              <ol className="text-[11px] text-wr-dim space-y-1 list-decimal list-inside">
                <li>{t('esim.install_step_1')}</li>
                <li>{t('esim.install_step_2')}</li>
                <li>{t('esim.install_step_3')}</li>
                <li>{t('esim.install_step_4')}</li>
              </ol>
            </div>

            <button onClick={reset} className="text-xs font-bold uppercase text-wr-accent hover:underline">
              {t('esim.buy_another')}
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ─── SELECT state — main page with comparison view ───
  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title="eSIM — Compare anonymous data plans worldwide"
        description="Compare eSIM data plans from multiple providers. Find the cheapest anonymous data for 100+ countries. No KYC, pay with Monero or Lightning."
        path="/esim"
        image="/og-esim.jpg"
        schemas={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'eSIM Plan Aggregator',
            url: 'https://walls.rip/esim',
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Web',
            description: 'Compare anonymous eSIM data plans from multiple providers. 120+ countries, 3G/4G/5G. No KYC.',
            offers: { '@type': 'Offer', price: '0.80', priceCurrency: 'USD', description: 'Starting price for eSIM data plan' },
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: 'eSIM — Anonymous Data Plan Comparison',
            serviceType: 'eSIM Data Plans',
            areaServed: 'Worldwide',
            description: 'Compare and buy anonymous eSIM data plans from multiple providers. Best prices, instant activation.',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
            offers: { '@type': 'Offer', price: '0.80', priceCurrency: 'USD' },
          },
        ]}
      />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />

      <main className="w-full max-w-6xl px-4 md:px-6 relative z-10 pb-12">
        <div className="max-w-6xl mx-auto space-y-6 md:space-y-10 pb-8 md:pb-12">

          {/* HERO */}
          <div className="text-center py-8 scale-90 md:scale-100 origin-top">
            <div className="mx-auto w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-400/20 mb-4">
              <Smartphone size={40} />
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mb-2">
              <span className="text-cyan-400">{t('esim.title_e')}</span>{t('esim.title_sim')}
              <span className="text-wr-dim text-lg md:text-2xl ml-3 font-normal">aggregator</span>
            </h1>
            <p className="text-wr-dim text-sm">{t('esim.compare_subtitle')}</p>
          </div>

          {/* COMING SOON / NOT CONFIGURED */}
          {notConfigured && (
            <div className="mx-2 md:mx-0 bg-wr-surface border border-cyan-400/30 p-6 md:p-8 rounded-sm text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-400/20">
                <Signal size={24} />
              </div>
              <h2 className="text-cyan-400 font-bold tracking-widest text-sm uppercase">{t('esim.coming_soon')}</h2>
              <p className="text-xs text-wr-dim max-w-md mx-auto leading-relaxed">
                {t('esim.coming_soon_desc')}
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {[t('esim.tag_no_kyc'), t('esim.tag_no_reg'), t('esim.tag_global'), t('esim.tag_instant'), t('esim.tag_pay')].map(tag => (
                  <span key={tag} className="text-[10px] px-3 py-1.5 rounded-full border border-cyan-400/20 text-cyan-400/70">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!notConfigured && (
            <>
              {/* WALLET BANNER */}
              <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-border p-4 md:p-6 rounded-sm flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden group">
                <div className="absolute inset-0 bg-cyan-500/5 group-hover:bg-cyan-500/10 transition-colors pointer-events-none" />
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500" />

                <div className="flex items-start gap-4 relative z-10">
                  <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-full shrink-0 border border-cyan-400/20">
                    <Wallet size={24} />
                  </div>
                  <div>
                    <h3 className="text-cyan-400 font-bold tracking-widest text-sm mb-1 uppercase flex items-center gap-2">
                      {walletToken ? (
                        <>{t('sms.wallet_balance')} <span className="text-[9px] bg-cyan-500 text-black px-1.5 py-0.5 rounded-xs">${balanceUSD.toFixed(2)}</span></>
                      ) : (
                        <>{t('sms.anonymous_wallet')} <span className="text-[9px] bg-wr-accent text-black px-1.5 py-0.5 rounded-xs">{t('sms.new')}</span></>
                      )}
                    </h3>
                    <p className="text-xs text-wr-dim font-mono leading-relaxed max-w-lg text-left">
                      {walletToken
                        ? t('esim.wallet_shared')
                        : t('esim.wallet_shared_new')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowMethodInModal(true); setShowPaymentModal(true); }}
                  className="relative z-10 w-full md:w-auto px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold tracking-widest uppercase transition-all rounded-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 hover:-translate-y-0.5"
                >
                  <Plus size={14} /> {walletToken ? t('sms.top_up') : t('sms.deposit')} <ChevronRight size={14} />
                </button>
              </div>

              {/* COUNTRY SELECTOR + COMPARISON TABLE */}
              <div className="bg-wr-surface border border-wr-border p-4 md:p-10 relative overflow-hidden shadow-2xl mx-2 md:mx-0">
                <div className="relative z-10 space-y-6 md:space-y-8">

                  {/* Country */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                      <Globe size={12} className="text-cyan-400" /> {t('esim.select_country')}
                    </label>
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                      <input type="text" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} placeholder={t('esim.search_countries')}
                        className="w-full pl-10 pr-3 py-3 md:py-4 bg-wr-base border-2 border-wr-border outline-none font-mono text-base transition-all rounded-sm focus:border-cyan-400 text-current placeholder-wr-dim/30" />
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto content-start p-1">
                      {filteredCountries.map(c => (
                        <button key={c.code} onClick={() => setSelectedCountry(c.code)}
                          className={`text-xs px-3 py-1.5 rounded border font-mono transition-all flex items-center gap-1.5 ${selectedCountry === c.code ? 'border-cyan-400 text-cyan-400 bg-cyan-400/20 font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)]' : 'border-wr-border text-current hover:border-cyan-400/40 hover:text-cyan-400'}`}>
                          {c.code} — {c.name}
                          {c.engines.length > 1 && (
                            <span className="text-[8px] bg-wr-green/20 text-wr-green px-1 rounded">{c.engines.length}</span>
                          )}
                        </button>
                      ))}
                      {filteredCountries.length === 0 && !loading && (
                        <div className="text-xs text-wr-dim py-4 w-full text-center">{t('esim.no_countries')}</div>
                      )}
                    </div>
                    {selectedCountryName && (
                      <div className="text-[10px] text-cyan-400 font-bold animate-pulse">
                        {"● "}{selectedCountryName}
                      </div>
                    )}
                  </div>

                  {/* Comparison Plans */}
                  {selectedCountry && (
                    <div className="space-y-4">
                      {/* Header with engine count */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                          <Wifi size={12} className="text-cyan-400" /> {t('esim.compare_title')}
                          {activeEngines.length > 0 && (
                            <span className="text-[9px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full normal-case tracking-normal">
                              {t('esim.providers_found', { count: activeEngines.length })}
                            </span>
                          )}
                        </label>
                      </div>

                      {loadingPlans ? (
                        <div className="flex flex-col items-center gap-3 text-wr-dim text-xs py-12 justify-center">
                          <RefreshCw size={20} className="animate-spin text-cyan-400" />
                          <span className="tracking-widest uppercase">{t('esim.loading_compare')}</span>
                          <div className="flex gap-2">
                            {['pikasim', 'esimaccess', 'smspool'].map(e => (
                              <span key={e} className={`text-[9px] px-2 py-0.5 rounded border animate-pulse ${getEngineStyle(e).border} ${getEngineStyle(e).text}`}>
                                {getEngineStyle(e).label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : comparePlans.length > 0 ? (
                        <>
                          {/* Filter toolbar */}
                          <div className="flex flex-col md:flex-row gap-3 md:items-center">
                            {/* Data size filter */}
                            <div className="flex items-center gap-1.5">
                              <SlidersHorizontal size={10} className="text-wr-dim shrink-0" />
                              <div className="flex gap-1">
                                {DATA_FILTERS.map((df, i) => (
                                  <button key={df.label} onClick={() => setDataFilter(i)}
                                    className={`text-[10px] px-2.5 py-1 rounded border font-mono transition-all ${dataFilter === i ? 'border-cyan-400 text-cyan-400 bg-cyan-400/15' : 'border-wr-border/50 text-wr-dim hover:border-wr-dim'}`}>
                                    {df.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Engine filter */}
                            <div className="flex items-center gap-1.5 md:ml-auto">
                              <Shield size={10} className="text-wr-dim shrink-0" />
                              <div className="flex gap-1">
                                {activeEngines.map(engine => {
                                  const style = getEngineStyle(engine);
                                  const active = engineFilter.size === 0 || engineFilter.has(engine);
                                  return (
                                    <button key={engine} onClick={() => toggleEngineFilter(engine)}
                                      className={`text-[10px] px-2.5 py-1 rounded border font-mono transition-all ${active ? `${style.border} ${style.text} ${style.bg}` : 'border-wr-border/30 text-wr-dim/40 line-through'}`}>
                                      {style.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Sort bar */}
                          <div className="flex items-center gap-4 text-[10px] text-wr-dim uppercase tracking-widest border-b border-wr-border/30 pb-2">
                            <span className="w-20 shrink-0">Provider</span>
                            <button onClick={() => handleSort('data')} className="flex items-center gap-1 hover:text-cyan-400 transition-colors">
                              Data <ArrowUpDown size={8} className={sortKey === 'data' ? 'text-cyan-400' : ''} />
                            </button>
                            <button onClick={() => handleSort('duration')} className="flex items-center gap-1 hover:text-cyan-400 transition-colors">
                              Duration <ArrowUpDown size={8} className={sortKey === 'duration' ? 'text-cyan-400' : ''} />
                            </button>
                            <button onClick={() => handleSort('price')} className="flex items-center gap-1 hover:text-cyan-400 transition-colors ml-auto">
                              Price <ArrowUpDown size={8} className={sortKey === 'price' ? 'text-cyan-400' : ''} />
                            </button>
                            <span className="w-16 shrink-0 text-right">Action</span>
                          </div>

                          {/* Plan rows */}
                          <div className="space-y-2">
                            {filteredPlans.map((plan, idx) => {
                              const style = getEngineStyle(plan.engine);
                              const isCheapest = plan.id === cheapestId;
                              const savings = highestPrice > plan.price ? +(highestPrice - plan.price).toFixed(2) : 0;
                              const pricePerGB = plan.dataGB > 0 ? +(plan.price / plan.dataGB).toFixed(2) : plan.price;

                              return (
                                <div
                                  key={plan.id}
                                  className={`group relative flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-3 md:p-4 rounded-sm border transition-all hover:shadow-lg ${
                                    isCheapest
                                      ? 'border-wr-green/60 bg-wr-green/5 shadow-[0_0_20px_rgba(0,255,65,0.08)]'
                                      : 'border-wr-border/50 bg-wr-base hover:border-cyan-400/30'
                                  }`}
                                >
                                  {/* Best price badge */}
                                  {isCheapest && (
                                    <div className="absolute -top-2 left-3 md:left-4 px-2 py-0.5 bg-wr-green text-black text-[8px] font-black tracking-widest uppercase rounded-xs shadow-lg shadow-wr-green/30">
                                      {t('esim.best_price')}
                                    </div>
                                  )}

                                  {/* Engine badge */}
                                  <div className={`w-20 shrink-0 flex items-center gap-1.5 ${style.text}`}>
                                    <div className={`w-2 h-2 rounded-full ${style.bg} ${style.border} border`} />
                                    <span className="text-[10px] font-bold tracking-wider uppercase truncate">{style.label}</span>
                                  </div>

                                  {/* Plan info */}
                                  <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="flex items-baseline gap-1">
                                      <span className={`text-lg font-black font-mono ${isCheapest ? 'text-wr-green' : 'text-current'}`}>
                                        {plan.dataGB}GB
                                      </span>
                                      <span className="text-[9px] text-wr-dim">${pricePerGB}{t('esim.per_gb')}</span>
                                    </div>

                                    <div className="flex items-center gap-1.5 text-[10px] text-wr-dim">
                                      <Clock size={10} /> {plan.durationDays}d
                                    </div>

                                    {/* Savings indicator */}
                                    {savings > 0.5 && idx < 3 && (
                                      <span className="hidden md:inline-flex items-center gap-1 text-[9px] text-wr-green bg-wr-green/10 border border-wr-green/20 px-1.5 py-0.5 rounded-full">
                                        <Tag size={8} /> {t('esim.save_vs_highest', { amount: savings.toFixed(2) })}
                                      </span>
                                    )}
                                  </div>

                                  {/* Price + Buy */}
                                  <div className="flex items-center gap-3 md:gap-4 shrink-0">
                                    <div className="text-right">
                                      <div className={`text-base font-black font-mono ${isCheapest ? 'text-wr-green' : 'text-current'}`}>
                                        ${plan.price.toFixed(2)}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleBuyPlan(plan)}
                                      disabled={creatingPayment}
                                      className={`w-16 py-2 text-[10px] font-bold tracking-widest uppercase rounded-sm border transition-all flex items-center justify-center ${
                                        creatingPayment
                                          ? 'border-wr-border text-wr-dim cursor-wait'
                                          : isCheapest
                                            ? 'border-wr-green text-wr-green hover:bg-wr-green hover:text-black shadow-[0_0_10px_rgba(0,255,65,0.15)]'
                                            : 'border-cyan-400/40 text-cyan-400 hover:bg-cyan-400 hover:text-black'
                                      }`}
                                    >
                                      {creatingPayment ? <RefreshCw size={10} className="animate-spin" /> : t('esim.buy')}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {filteredPlans.length === 0 && comparePlans.length > 0 && (
                            <div className="text-center py-6 text-xs text-wr-dim">
                              No plans match the current filters. Try adjusting the data size or provider filters.
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-start gap-2 text-xs text-wr-dim p-4 rounded bg-wr-base border border-wr-border/50 justify-center">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-wr-warning" />
                          <span>{t('esim.no_compare_plans')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PAYMENT METHOD */}
                  <div className="mb-6">
                    <div className="text-xs text-wr-dim mb-4 uppercase tracking-widest font-bold flex items-center gap-2">
                      <Zap size={12} className="text-wr-accent" /> {t('esim.payment_protocol')}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <button onClick={() => setPaymentMethod('XMR')}
                        className={`py-3 px-4 border flex items-center justify-center gap-3 transition-all rounded-sm ${paymentMethod === 'XMR' ? 'border-wr-green bg-wr-green/10 text-wr-green shadow-[0_0_15px_rgba(0,255,65,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                        <img src="/monero-xmr-logo.png" className="w-4 h-4" alt="XMR" />
                        <span className="text-xs font-bold tracking-widest font-mono uppercase">Monero</span>
                      </button>
                      <button onClick={() => setPaymentMethod('LN')}
                        className={`py-3 px-4 border flex items-center justify-center gap-3 transition-all rounded-sm ${paymentMethod === 'LN' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                        <Zap size={16} className="fill-current" />
                        <span className="text-xs font-bold tracking-widest font-mono uppercase">Lightning</span>
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              {/* INFO CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center mx-2 md:mx-0">
                {[
                  { title: t('esim.info_nokyc_title'), desc: t('esim.info_nokyc_desc') },
                  { title: t('esim.info_instant_title'), desc: t('esim.info_instant_desc') },
                  { title: t('esim.info_global_title'), desc: t('esim.info_global_desc') },
                ].map(item => (
                  <div key={item.title} className="p-4 rounded-sm border border-wr-border/50 bg-wr-surface/30">
                    <h4 className="text-[10px] font-bold uppercase text-cyan-400 mb-1">{item.title}</h4>
                    <p className="text-[10px] text-wr-dim">{item.desc}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-wr-base/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
          <div className={`border bg-wr-base p-0 max-w-lg w-full relative shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden rounded-sm ${paymentMethod === 'LN' ? 'border-wr-accent' : 'border-wr-green'}`}>
            <button onClick={() => { setShowPaymentModal(false); setPaymentData(null); setPaymentPolling(false); setPendingPurchase(null); }} className="absolute top-4 right-4 text-wr-dim hover:text-wr-green z-10"><X size={20} /></button>

            <div className={`p-3 md:p-4 border-b flex items-center gap-2 ${paymentData ? 'animate-pulse' : ''} ${paymentMethod === 'LN' ? 'bg-wr-accent/10 border-wr-accent/30 text-wr-accent' : 'bg-wr-green/10 border-wr-green/30 text-wr-green'}`}>
              <Wallet size={14} />
              <span className="text-xs font-bold tracking-widest uppercase">
                {paymentData ? t('sms.awaiting_payment') : t('sms.deposit_to_wallet')}
              </span>
            </div>

            <div className="p-4 md:p-8 text-center">
              {paymentData ? (
                <div className="space-y-5">
                  <div className="flex justify-center">
                    <div className="bg-white p-3 rounded-sm">
                      <QRCodeCanvas
                        value={paymentData.method === 'LN' ? paymentData.address : `monero:${paymentData.address}?tx_amount=${paymentData.amount}`}
                        size={160} level="M" bgColor="#ffffff" fgColor="#000000"
                        imageSettings={paymentData.method === 'XMR' ? { src: '/monero-xmr-logo.png', x: undefined, y: undefined, height: 30, width: 30, excavate: true } : undefined}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-wr-dim uppercase mb-1">{t('sms.send_exactly')}</div>
                    <div className={`text-lg font-bold font-mono ${paymentMethod === 'LN' ? 'text-wr-accent' : 'text-wr-green'}`}>
                      {paymentData.method === 'LN' ? `${paymentData.amount} sats` : `${paymentData.amount} XMR`}
                    </div>
                  </div>
                  <button onClick={() => copyText(paymentData.address)}
                    className="w-full p-3 rounded bg-wr-surface border border-wr-border text-[10px] font-mono text-wr-green break-all text-left hover:border-wr-green/50 transition-colors cursor-pointer">
                    {paymentData.address}
                  </button>
                  <div className="flex items-center justify-center gap-2 text-[10px] text-wr-dim uppercase tracking-widest">
                    <RefreshCw size={10} className="animate-spin" /> {t('sms.awaiting_confirmation')}
                  </div>
                  {pendingPurchase && (
                    <div className="text-[10px] text-cyan-400/60">
                      {t('esim.auto_purchase_esim')}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-wr-dim uppercase tracking-widest">{t('sms.deposit_amount')}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {DEPOSIT_AMOUNTS.map(amt => (
                        <button key={amt} onClick={() => setDepositAmount(amt)}
                          className={`py-3 rounded-sm border text-sm font-bold font-mono transition-all ${depositAmount === amt ? 'border-wr-green bg-wr-green/10 text-wr-green shadow-[0_0_15px_rgba(0,255,65,0.15)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                          ${amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {showMethodInModal && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-wr-dim uppercase tracking-widest">{t('sms.payment_method')}</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setPaymentMethod('XMR')}
                          className={`py-3 px-4 border flex items-center justify-center gap-3 transition-all rounded-sm ${paymentMethod === 'XMR' ? 'border-wr-green bg-wr-green/10 text-wr-green shadow-[0_0_15px_rgba(0,255,65,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                          <img src="/monero-xmr-logo.png" className="w-4 h-4" alt="XMR" />
                          <span className="text-xs font-bold tracking-widest font-mono uppercase">Monero</span>
                        </button>
                        <button onClick={() => setPaymentMethod('LN')}
                          className={`py-3 px-4 border flex items-center justify-center gap-3 transition-all rounded-sm ${paymentMethod === 'LN' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                          <Zap size={16} className="fill-current" />
                          <span className="text-xs font-bold tracking-widest font-mono uppercase">Lightning</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-wr-border pt-5 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-wr-dim uppercase tracking-widest font-bold">{t('sms.total_deposit')}</span>
                      <span className={`text-2xl font-bold font-mono ${paymentMethod === 'LN' ? 'text-wr-accent' : 'text-wr-green'}`}>${depositAmount.toFixed(2)}</span>
                    </div>
                    <button onClick={handleDeposit} disabled={creatingPayment}
                      className={`px-8 py-3 text-xs font-black hover:opacity-90 shadow-lg uppercase tracking-widest rounded-sm flex items-center gap-2 disabled:opacity-50 ${creatingPayment ? 'bg-wr-surface border border-wr-border text-wr-dim cursor-wait' : paymentMethod === 'LN' ? 'bg-wr-accent text-black shadow-wr-accent/20' : 'bg-wr-green text-black shadow-wr-green/20'}`}>
                      {creatingPayment ? <><RefreshCw size={12} className="animate-spin" /> {t('sms.generating')}</> : t('sms.deposit')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
