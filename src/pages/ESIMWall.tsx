import { useState, useEffect, useMemo } from 'react';
import { Smartphone, Globe, Search, Copy, Check, RefreshCw, Clock, AlertTriangle, ChevronRight, Wallet, Zap, X, Plus, Wifi, Signal } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';

// ─── Types ───

interface ESIMCountry { code: string; name: string; regions?: string[]; engine: string }
interface ESIMPlan {
  id: string; name: string; country: string; dataGB: number;
  durationDays: number; price: number; currency: string; engine: string;
  speed?: string; extendable?: boolean;
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

export function ESIMWall() {
  const [countries, setCountries] = useState<ESIMCountry[]>([]);
  const [plans, setPlans] = useState<ESIMPlan[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [countrySearch, setCountrySearch] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<ESIMPlan | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);

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
  const [pendingPurchase, setPendingPurchase] = useState<{ planId: string } | null>(null);

  // Purchase flow
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [profileData, setProfileData] = useState<ProfileResult | null>(null);
  const [step, setStep] = useState<'SELECT' | 'PURCHASED'>('SELECT');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);

  // ─── Load countries ───
  useEffect(() => {
    apiClient<ESIMCountry[]>('/v1/tools/esim/countries')
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

  // ─── Fetch plans when country selected ───
  useEffect(() => {
    if (!selectedCountry) { setPlans([]); setSelectedPlan(null); return; }
    setLoadingPlans(true);
    apiClient<ESIMPlan[]>(`/v1/tools/esim/plans?country=${selectedCountry}`)
      .then(p => { setPlans(p); setSelectedPlan(null); })
      .catch(() => { setPlans([]); toast.error('Failed to load plans'); })
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
            setTimeout(() => executePurchase(pendingPurchase.planId, result.walletToken!), 500);
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

  const createPayment = async (usdAmount: number, purchaseAfter?: { planId: string }) => {
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

  const executePurchase = async (planId: string, token: string) => {
    try {
      const data = await apiClient<PurchaseResult>('/v1/tools/esim/purchase', {
        method: 'POST',
        body: { planId, token },
      });
      if (data.orderId) {
        setPurchase(data);
        setBalanceUSD(data.balanceUSD);
        setStep('PURCHASED');
        // Set profile data from purchase response
        if (data.qrCode || data.activationUrl) {
          setProfileData({ qrCode: data.qrCode, activationUrl: data.activationUrl });
        } else {
          // Poll for profile
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
    // Try to get profile a few times with delay
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

  const handleBuyPlan = async () => {
    if (!selectedPlan) return;
    const price = selectedPlan.price;

    if (walletToken && balanceUSD >= price) {
      executePurchase(selectedPlan.id, walletToken);
    } else {
      const needed = walletToken ? price - balanceUSD : price;
      const depositAmt = Math.max(needed, 3);
      // Round up to nearest integer
      setDepositAmount(Math.ceil(depositAmt));
      createPayment(Math.ceil(depositAmt), { planId: selectedPlan.id });
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
    setStep('SELECT'); setSelectedPlan(null);
  };

  // ─── Derived ───

  const filteredCountries = useMemo(() => {
    return countries
      .filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, countrySearch]);

  const selectedCountryName = countries.find(c => c.code === selectedCountry)?.name || '';

  // Group plans by data size for clean display
  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => a.dataGB - b.dataGB || a.durationDays - b.durationDays);
  }, [plans]);

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 animate-pulse text-wr-dim">
          <RefreshCw size={32} className="animate-spin mb-4" />
          <p className="text-xs tracking-widest uppercase">Loading eSIM data...</p>
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
            <h2 className="text-lg font-bold tracking-wider text-wr-green">eSIM PURCHASED</h2>
            <p className="text-xs text-wr-dim">Scan the QR code with your device to install the eSIM profile.</p>

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
                  Open Activation URL
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-xs text-wr-dim">
                  <RefreshCw size={12} className="animate-spin" /> Loading activation data...
                </div>
                <p className="text-[10px] text-wr-dim">The eSIM profile is being provisioned. This may take a few moments.</p>
              </div>
            )}

            <div className="border-t border-wr-border/30 pt-4 space-y-2">
              <div className="text-[10px] text-wr-dim">Order: {purchase.orderId}</div>
              <div className="text-[10px] text-wr-dim">Charged: ${purchase.charged.toFixed(2)} — Wallet: ${balanceUSD.toFixed(2)}</div>
            </div>

            <div className="bg-wr-base border border-wr-border/50 rounded p-4 text-left space-y-2">
              <h4 className="text-[10px] font-bold uppercase text-wr-accent tracking-widest">Installation Guide</h4>
              <ol className="text-[11px] text-wr-dim space-y-1 list-decimal list-inside">
                <li>Open your device's camera or Settings {'>'} Cellular</li>
                <li>Scan the QR code above</li>
                <li>Follow the prompts to install the eSIM profile</li>
                <li>Enable the new eSIM line for data</li>
              </ol>
            </div>

            <button onClick={reset} className="text-xs font-bold uppercase text-wr-accent hover:underline">
              Buy Another eSIM
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ─── SELECT state — main page ───
  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title="eSIM — Anonymous mobile data worldwide"
        description="Buy anonymous eSIM data plans for 100+ countries. No KYC, no registration. Pay with Monero or Lightning."
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
            offers: { '@type': 'Offer', price: '0.80', priceCurrency: 'USD', description: 'Starting price for eSIM data plan' },
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
            offers: { '@type': 'Offer', price: '0.80', priceCurrency: 'USD' },
          },
        ]}
      />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />

      <main className="w-full max-w-5xl px-4 md:px-6 relative z-10 pb-12">
        <div className="max-w-5xl mx-auto space-y-6 md:space-y-10 pb-8 md:pb-12">

          {/* ═══ HERO ═══ */}
          <div className="text-center py-8 scale-90 md:scale-100 origin-top">
            <div className="mx-auto w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-400/20 mb-4">
              <Smartphone size={40} />
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mb-2">
              <span className="text-cyan-400">e</span>SIM
            </h1>
            <p className="text-wr-dim text-sm">Anonymous mobile data. 100+ countries. No KYC.</p>
          </div>

          {/* ═══ COMING SOON / NOT CONFIGURED ═══ */}
          {notConfigured && (
            <div className="mx-2 md:mx-0 bg-wr-surface border border-cyan-400/30 p-6 md:p-8 rounded-sm text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-400/20">
                <Signal size={24} />
              </div>
              <h2 className="text-cyan-400 font-bold tracking-widest text-sm uppercase">Coming Soon</h2>
              <p className="text-xs text-wr-dim max-w-md mx-auto leading-relaxed">
                Anonymous eSIM data plans are being integrated. Buy prepaid mobile data for 100+ countries with Monero or Lightning — no identity required.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {['No KYC', 'No Registration', 'Global Coverage', 'Instant Activation', 'Pay with XMR/LN'].map(tag => (
                  <span key={tag} className="text-[10px] px-3 py-1.5 rounded-full border border-cyan-400/20 text-cyan-400/70">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!notConfigured && (
            <>
              {/* ═══ WALLET BANNER ═══ */}
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
                        <>WALLET BALANCE <span className="text-[9px] bg-cyan-500 text-black px-1.5 py-0.5 rounded-xs">${balanceUSD.toFixed(2)}</span></>
                      ) : (
                        <>ANONYMOUS WALLET <span className="text-[9px] bg-wr-accent text-black px-1.5 py-0.5 rounded-xs">NEW</span></>
                      )}
                    </h3>
                    <p className="text-xs text-wr-dim font-mono leading-relaxed max-w-lg text-left">
                      {walletToken
                        ? 'Shared wallet — funds work across SMS and eSIM. Top up anytime.'
                        : 'Deposit XMR or Lightning to get started. Wallet is shared with SMS Wall.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowMethodInModal(true); setShowPaymentModal(true); }}
                  className="relative z-10 w-full md:w-auto px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold tracking-widest uppercase transition-all rounded-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 hover:-translate-y-0.5"
                >
                  <Plus size={14} /> {walletToken ? 'TOP UP' : 'DEPOSIT'} <ChevronRight size={14} />
                </button>
              </div>

              {/* ═══ COUNTRY SELECTOR + PLANS ═══ */}
              <div className="bg-wr-surface border border-wr-border p-4 md:p-10 relative overflow-hidden shadow-2xl mx-2 md:mx-0">
                <div className="relative z-10 space-y-6 md:space-y-8">

                  {/* Country */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                      <Globe size={12} className="text-cyan-400" /> Select Country
                    </label>
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                      <input type="text" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} placeholder="Search countries..."
                        className="w-full pl-10 pr-3 py-3 md:py-4 bg-wr-base border-2 border-wr-border outline-none font-mono text-base transition-all rounded-sm focus:border-cyan-400 text-current placeholder-wr-dim/30" />
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto content-start p-1">
                      {filteredCountries.map(c => (
                        <button key={c.code} onClick={() => setSelectedCountry(c.code)}
                          className={`text-xs px-3 py-1.5 rounded border font-mono transition-all ${selectedCountry === c.code ? 'border-cyan-400 text-cyan-400 bg-cyan-400/20 font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)]' : 'border-wr-border text-current hover:border-cyan-400/40 hover:text-cyan-400'}`}>
                          {c.code} — {c.name}
                        </button>
                      ))}
                      {filteredCountries.length === 0 && !loading && (
                        <div className="text-xs text-wr-dim py-4 w-full text-center">No countries found</div>
                      )}
                    </div>
                    {selectedCountryName && (
                      <div className="text-[10px] text-cyan-400 font-bold animate-pulse">
                        {"● "}{selectedCountryName}
                      </div>
                    )}
                  </div>

                  {/* Plans */}
                  {selectedCountry && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                        <Wifi size={12} className="text-cyan-400" /> Available Plans
                      </label>

                      {loadingPlans ? (
                        <div className="flex items-center gap-2 text-wr-dim text-xs py-8 justify-center">
                          <RefreshCw size={14} className="animate-spin" /> Loading plans...
                        </div>
                      ) : sortedPlans.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {sortedPlans.map(plan => (
                            <button
                              key={plan.id}
                              onClick={() => setSelectedPlan(plan)}
                              className={`p-4 rounded-sm border text-left transition-all group/plan ${selectedPlan?.id === plan.id
                                ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)]'
                                : 'border-wr-border hover:border-cyan-400/40 bg-wr-base'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-lg font-black font-mono ${selectedPlan?.id === plan.id ? 'text-cyan-400' : 'text-current'}`}>
                                  {plan.dataGB}GB
                                </span>
                                <span className={`text-sm font-bold font-mono ${selectedPlan?.id === plan.id ? 'text-cyan-400' : 'text-wr-green'}`}>
                                  ${plan.price.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-wr-dim">
                                <Clock size={10} /> {plan.durationDays} days
                                {plan.speed && (
                                  <><span className="opacity-30">|</span><Signal size={10} /> {plan.speed}</>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 text-xs text-wr-dim p-4 rounded bg-wr-base border border-wr-border/50 justify-center">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-wr-warning" />
                          <span>No plans available for this country.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ PAYMENT METHOD ═══ */}
                  <div className="mb-6">
                    <div className="text-xs text-wr-dim mb-4 uppercase tracking-widest font-bold flex items-center gap-2">
                      <Zap size={12} className="text-wr-accent" /> Payment Protocol
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

                  {/* ═══ ACTION BAR ═══ */}
                  <div className="pt-6 border-t border-wr-border/30 flex flex-col md:flex-row justify-between items-center gap-6 md:gap-4">
                    <div className="text-xs text-wr-dim font-mono uppercase tracking-widest">
                      {selectedPlan ? (
                        <span>
                          <span className="text-cyan-400 animate-pulse">●</span>{' '}
                          {selectedCountryName} — {selectedPlan.dataGB}GB / {selectedPlan.durationDays}d
                        </span>
                      ) : (
                        <span><span className="text-wr-dim">●</span> Select a country & plan</span>
                      )}
                    </div>

                    {selectedPlan ? (
                      <button
                        onClick={handleBuyPlan}
                        disabled={creatingPayment}
                        className={`w-full md:w-auto group relative px-8 py-4 text-sm font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 overflow-hidden rounded-sm
                          ${creatingPayment ? 'bg-wr-surface border border-wr-border text-wr-dim cursor-wait' : paymentMethod === 'XMR' ? 'bg-wr-green text-black shadow-[0_0_20px_rgba(0,255,65,0.4)]' : 'bg-wr-accent text-black shadow-[0_0_20px_rgba(34,211,238,0.4)]'}
                          disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        {creatingPayment ? (
                          <><RefreshCw size={16} className="animate-spin" /> Generating...</>
                        ) : (
                          <>
                            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:animate-[scan_1s_ease-in-out_infinite] skew-x-12" />
                            <span>Buy eSIM</span>
                            <span className="opacity-40">|</span>
                            <span>${selectedPlan.price.toFixed(2)}</span>
                            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="px-8 py-4 bg-wr-surface border border-wr-border text-wr-dim text-sm rounded-sm cursor-not-allowed">
                        Select a plan to continue
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ═══ INFO CARDS ═══ */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center mx-2 md:mx-0">
                {[
                  { title: 'No KYC Required', desc: 'Buy eSIM data without identity verification' },
                  { title: 'Instant Activation', desc: 'Scan QR code and connect in seconds' },
                  { title: 'Global Coverage', desc: '100+ countries with 4G/5G data plans' },
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

      {/* ═══ PAYMENT MODAL ═══ */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-wr-base/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
          <div className={`border bg-wr-base p-0 max-w-lg w-full relative shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden rounded-sm ${paymentMethod === 'LN' ? 'border-wr-accent' : 'border-wr-green'}`}>
            <button onClick={() => { setShowPaymentModal(false); setPaymentData(null); setPaymentPolling(false); setPendingPurchase(null); }} className="absolute top-4 right-4 text-wr-dim hover:text-wr-green z-10"><X size={20} /></button>

            <div className={`p-3 md:p-4 border-b flex items-center gap-2 ${paymentData ? 'animate-pulse' : ''} ${paymentMethod === 'LN' ? 'bg-wr-accent/10 border-wr-accent/30 text-wr-accent' : 'bg-wr-green/10 border-wr-green/30 text-wr-green'}`}>
              <Wallet size={14} />
              <span className="text-xs font-bold tracking-widest uppercase">
                {paymentData ? 'AWAITING PAYMENT' : 'DEPOSIT TO WALLET'}
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
                    <div className="text-[10px] text-wr-dim uppercase mb-1">Send exactly</div>
                    <div className={`text-lg font-bold font-mono ${paymentMethod === 'LN' ? 'text-wr-accent' : 'text-wr-green'}`}>
                      {paymentData.method === 'LN' ? `${paymentData.amount} sats` : `${paymentData.amount} XMR`}
                    </div>
                  </div>
                  <button onClick={() => copyText(paymentData.address)}
                    className="w-full p-3 rounded bg-wr-surface border border-wr-border text-[10px] font-mono text-wr-green break-all text-left hover:border-wr-green/50 transition-colors cursor-pointer">
                    {paymentData.address}
                  </button>
                  <div className="flex items-center justify-center gap-2 text-[10px] text-wr-dim uppercase tracking-widest">
                    <RefreshCw size={10} className="animate-spin" /> Awaiting confirmation...
                  </div>
                  {pendingPurchase && (
                    <div className="text-[10px] text-cyan-400/60">
                      Will auto-purchase eSIM plan on confirmation
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-wr-dim uppercase tracking-widest">Deposit Amount</label>
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
                      <label className="text-[9px] font-black text-wr-dim uppercase tracking-widest">Payment Method</label>
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
                      <span className="text-[9px] text-wr-dim uppercase tracking-widest font-bold">Total Deposit</span>
                      <span className={`text-2xl font-bold font-mono ${paymentMethod === 'LN' ? 'text-wr-accent' : 'text-wr-green'}`}>${depositAmount.toFixed(2)}</span>
                    </div>
                    <button onClick={handleDeposit} disabled={creatingPayment}
                      className={`px-8 py-3 text-xs font-black hover:opacity-90 shadow-lg uppercase tracking-widest rounded-sm flex items-center gap-2 disabled:opacity-50 ${creatingPayment ? 'bg-wr-surface border border-wr-border text-wr-dim cursor-wait' : paymentMethod === 'LN' ? 'bg-wr-accent text-black shadow-wr-accent/20' : 'bg-wr-green text-black shadow-wr-green/20'}`}>
                      {creatingPayment ? <><RefreshCw size={12} className="animate-spin" /> Generating...</> : 'Deposit'}
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
