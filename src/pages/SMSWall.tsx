import { useState, useEffect } from 'react';
import { Phone, Globe, Search, Copy, Check, RefreshCw, Clock, AlertTriangle, ChevronRight, Wallet, Zap, X, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';

interface Country { ID: number; name: string; short_name: string }
interface Service { ID: number; name: string; favourite: number }
interface PriceInfo { price: string; cost_price: string; success_rate: number }

interface PaymentData {
  method: 'XMR' | 'LN';
  address: string;
  paymentId: string;
  amount: number;
  usd: number;
}

interface PurchaseResult {
  success: number;
  number: string;
  order_id: string;
  balanceUSD: number;
  charged: number;
}

interface SMSCheckResult {
  success: number;
  sms?: string;
  full_sms?: string;
  status: number;
  refunded?: number;
  balanceUSD?: number;
}

const WALLET_KEY = 'walls_sms_wallet';
const DEPOSIT_AMOUNTS = [0.50, 1, 3, 5];

const POPULAR_COUNTRIES = ['US', 'GB', 'NL', 'DE', 'FR', 'SE', 'PH', 'IN', 'MX'];

const POPULAR_SERVICES = [
  'Telegram', 'Discord', 'Google', 'WhatsApp', 'Twitter',
  'Instagram', 'Facebook', 'Steam', 'Microsoft', 'Amazon',
];

export function SMSWall() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('1');
  const [selectedService, setSelectedService] = useState<string>('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // Wallet
  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState<number>(0);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'XMR' | 'LN'>('XMR');
  const [depositAmount, setDepositAmount] = useState<number>(1);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMethodInModal, setShowMethodInModal] = useState(false); // show XMR/LN picker in deposit modal
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentPolling, setPaymentPolling] = useState(false);
  // Track what to do after payment completes
  const [pendingPurchase, setPendingPurchase] = useState<{ country: string; service: string } | null>(null);

  // SMS flow
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [smsResult, setSmsResult] = useState<SMSCheckResult | null>(null);
  const [polling, setPolling] = useState(false);
  const [step, setStep] = useState<'SELECT' | 'WAITING' | 'RECEIVED'>('SELECT');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load data
  useEffect(() => {
    Promise.all([
      apiClient<Country[]>('/v1/tools/sms/countries'),
      apiClient<Service[]>('/v1/tools/sms/services'),
    ]).then(([c, s]) => { setCountries(c); setServices(s); })
      .catch(() => toast.error('Failed to load SMS data'))
      .finally(() => setLoading(false));
  }, []);

  // Check wallet balance
  useEffect(() => {
    if (!walletToken) return;
    apiClient<{ balanceUSD: number }>(`/v1/tools/sms/balance?token=${walletToken}`)
      .then(data => setBalanceUSD(data.balanceUSD))
      .catch(() => { localStorage.removeItem(WALLET_KEY); setWalletToken(null); setBalanceUSD(0); });
  }, [walletToken]);

  // Fetch price
  useEffect(() => {
    if (!selectedCountry || !selectedService) { setPriceInfo(null); return; }
    setLoadingPrice(true);
    apiClient<PriceInfo>(`/v1/tools/sms/price?country=${selectedCountry}&service=${selectedService}`)
      .then(data => setPriceInfo(data))
      .catch(() => { setPriceInfo(null); toast.error('Service not available'); })
      .finally(() => setLoadingPrice(false));
  }, [selectedCountry, selectedService]);

  // Poll for SMS
  useEffect(() => {
    if (!polling || !purchase) return;
    const interval = setInterval(async () => {
      try {
        const result = await apiClient<SMSCheckResult>(`/v1/tools/sms/check?order_id=${purchase.order_id}&token=${walletToken}`);
        if (result.status === 3 && result.sms) {
          setSmsResult(result); setPolling(false); setStep('RECEIVED');
          toast.success('SMS received!');
        } else if (result.status === 2) {
          setPolling(false); setStep('SELECT');
          if (result.refunded) {
            setBalanceUSD(result.balanceUSD || balanceUSD + result.refunded);
            toast.success(`Expired — $${result.refunded.toFixed(2)} refunded`);
          } else {
            toast.error('Order expired');
          }
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [polling, purchase, walletToken, balanceUSD]);

  // Poll for payment
  useEffect(() => {
    if (!paymentPolling || !paymentData) return;
    const interval = setInterval(async () => {
      try {
        const result = await apiClient<{ status: string; walletToken?: string; balanceUSD?: number }>(
          `/v1/tools/sms/payment/check?paymentId=${paymentData.paymentId}`
        );
        if (result.status === 'COMPLETED' && result.walletToken) {
          setPaymentPolling(false);
          setWalletToken(result.walletToken);
          setBalanceUSD(result.balanceUSD || 0);
          localStorage.setItem(WALLET_KEY, result.walletToken);
          setPaymentData(null); setShowPaymentModal(false);
          toast.success(`$${paymentData.usd.toFixed(2)} deposited!`);

          // If per-sms mode, auto-purchase after payment
          if (pendingPurchase) {
            setTimeout(() => executePurchase(pendingPurchase.country, pendingPurchase.service, result.walletToken!), 500);
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

  const [creatingPayment, setCreatingPayment] = useState(false);

  const createPayment = async (usdAmount: number, purchaseAfter?: { country: string; service: string }) => {
    setCreatingPayment(true);
    try {
      const data = await apiClient<PaymentData>('/v1/tools/sms/payment/create', {
        method: 'POST',
        body: { amount: usdAmount, method: paymentMethod, walletToken },
      });
      setPaymentData(data); setPaymentPolling(true); setShowPaymentModal(true); setShowMethodInModal(false);
      if (purchaseAfter) setPendingPurchase(purchaseAfter);
    } catch { toast.error('Failed to create payment'); }
    finally { setCreatingPayment(false); }
  };

  const executePurchase = async (country: string, service: string, token: string) => {
    try {
      const data = await apiClient<PurchaseResult>('/v1/tools/sms/purchase', {
        method: 'POST',
        body: { country, service, token },
      });
      if (data.success === 1) {
        setPurchase(data); setBalanceUSD(data.balanceUSD); setPolling(true); setStep('WAITING');
      } else {
        toast.error('Failed to get number');
      }
    } catch { toast.error('Purchase failed'); }
  };

  const handleGetNumber = async () => {
    if (!priceInfo || !selectedCountry || !selectedService) return;
    const price = parseFloat(priceInfo.price);

    if (walletToken && balanceUSD >= price) {
      // Enough balance — purchase directly
      executePurchase(selectedCountry, selectedService, walletToken);
    } else {
      // Need payment first
      const needed = walletToken ? price - balanceUSD : price;
      // Round up to nearest $0.50 or the exact price, whichever is higher
      const depositAmt = Math.max(needed, 0.50);
      setDepositAmount(parseFloat(depositAmt.toFixed(2)));
      createPayment(depositAmt, { country: selectedCountry, service: selectedService });
    }
  };

  const handleDeposit = () => {
    createPayment(depositAmount);
  };

  const handleCancel = async () => {
    if (!purchase || !walletToken) return;
    try {
      const data = await apiClient<{ balanceUSD: number }>(`/v1/tools/sms/cancel?order_id=${purchase.order_id}&token=${walletToken}`);
      setBalanceUSD(data.balanceUSD); setPurchase(null); setPolling(false); setStep('SELECT');
      toast.success('Cancelled — refunded to wallet');
    } catch { toast.error('Failed to cancel'); }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text); setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setPurchase(null); setSmsResult(null); setPolling(false);
    setStep('SELECT'); setSelectedService(''); setPriceInfo(null);
  };

  const filteredServices = services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()));
  const filteredCountries = countries.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()));

  const selectedCountryName = countries.find(c => String(c.ID) === selectedCountry)?.name || '';
  const selectedServiceName = services.find(s => String(s.ID) === selectedService)?.name || '';

  if (loading) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 animate-pulse text-wr-dim">
          <RefreshCw size={32} className="animate-spin mb-4" />
          <p className="text-xs tracking-widest uppercase">Loading services...</p>
        </div>
      </div>
    );
  }

  // WAITING / RECEIVED states — full-page
  if (step === 'WAITING' && purchase) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
        <div className="fixed inset-0 z-40 pointer-events-none vignette" />
        <Header />
        <main className="w-full max-w-2xl px-4 relative z-10 flex flex-col gap-8 mb-20 mt-8">
          <div className="p-8 rounded-sm border border-wr-border bg-wr-surface text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 border border-green-400/20">
              <Clock size={32} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-wider text-wr-green mb-2">WAITING FOR SMS</h2>
              <p className="text-wr-dim text-xs">Use this number on the target service.</p>
            </div>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-green-400 to-cyan-400 rounded-sm blur opacity-30 group-hover:opacity-50 transition duration-300" />
              <button onClick={() => copyText(purchase.number)} className="w-full relative p-5 rounded bg-wr-base border border-wr-border flex items-center justify-between gap-4 hover:border-wr-green transition-colors">
                <span className="font-mono text-2xl font-bold text-wr-green">{purchase.number}</span>
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} className="text-wr-dim" />}
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-wr-dim">
              <RefreshCw size={12} className="animate-spin" /> Polling every 5 seconds...
            </div>
            <div className="text-[10px] text-wr-dim">Charged: ${purchase.charged.toFixed(2)} — Wallet: ${balanceUSD.toFixed(2)}</div>
            <button onClick={handleCancel} className="text-xs font-bold uppercase text-wr-dim hover:text-red-400 transition-colors">
              Cancel (refund to wallet)
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (step === 'RECEIVED' && smsResult) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
        <div className="fixed inset-0 z-40 pointer-events-none vignette" />
        <Header />
        <main className="w-full max-w-2xl px-4 relative z-10 flex flex-col gap-8 mb-20 mt-8">
          <div className="p-8 rounded-sm border border-wr-green bg-wr-surface text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 border border-green-400/20">
              <Check size={32} />
            </div>
            <h2 className="text-lg font-bold tracking-wider text-wr-green">SMS RECEIVED</h2>
            <button onClick={() => copyText(smsResult.sms || '')} className="w-full p-5 rounded bg-wr-base border border-wr-green flex items-center justify-between gap-4 hover:bg-wr-green/5 transition-colors text-left">
              <div>
                <div className="font-mono text-2xl font-bold text-wr-green mb-1">{smsResult.sms}</div>
                {smsResult.full_sms && <div className="text-xs text-wr-dim">{smsResult.full_sms}</div>}
              </div>
              {copied ? <Check size={18} className="text-green-500 shrink-0" /> : <Copy size={18} className="text-wr-dim shrink-0" />}
            </button>
            <div className="text-xs text-wr-dim">Wallet: ${balanceUSD.toFixed(2)}</div>
            <button onClick={reset} className="text-xs font-bold uppercase text-wr-accent hover:underline">Get Another Number</button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // SELECT state — main config page (Ghost Mail structure)
  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO title="SMS Wall — Anonymous phone verification" description="Get temporary phone numbers for anonymous SMS verification. 150+ countries, 1700+ services. Pay with XMR." path="/sms" />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />

      <main className="w-full max-w-5xl px-4 md:px-6 relative z-10 pb-12">
        <div className="max-w-5xl mx-auto space-y-6 md:space-y-10 pb-8 md:pb-12">

          {/* ═══ HERO ═══ */}
          <div className="text-center py-8 scale-90 md:scale-100 origin-top">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 border border-green-400/20 mb-4">
              <Phone size={40} />
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mb-2">
              SMS <span className="text-green-400">WALL</span>
            </h1>
            <p className="text-wr-dim text-sm">Anonymous phone verification. 150+ countries. Pay per SMS.</p>
          </div>

          {/* ═══ WALLET BANNER (like Telegram banner in Ghost Mail) ═══ */}
          <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-border p-4 md:p-6 rounded-sm flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden group">
            <div className="absolute inset-0 bg-green-500/5 group-hover:bg-green-500/10 transition-colors pointer-events-none" />
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />

            <div className="flex items-start gap-4 relative z-10">
              <div className="p-3 bg-green-500/10 text-green-400 rounded-full shrink-0 border border-green-400/20">
                <Wallet size={24} />
              </div>
              <div>
                <h3 className="text-green-400 font-bold tracking-widest text-sm mb-1 uppercase flex items-center gap-2">
                  {walletToken ? (
                    <>WALLET BALANCE <span className="text-[9px] bg-green-500 text-black px-1.5 py-0.5 rounded-xs">${balanceUSD.toFixed(2)}</span></>
                  ) : (
                    <>ANONYMOUS WALLET <span className="text-[9px] bg-wr-accent text-black px-1.5 py-0.5 rounded-xs">NEW</span></>
                  )}
                </h3>
                <p className="text-xs text-wr-dim font-mono leading-relaxed max-w-lg text-left">
                  {walletToken
                    ? 'Funds are stored anonymously. No account needed. Top up anytime with XMR or Lightning.'
                    : 'Deposit XMR or Lightning to get started. One payment, multiple SMS verifications.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => { setShowMethodInModal(true); setShowPaymentModal(true); }}
              className="relative z-10 w-full md:w-auto px-6 py-3 bg-green-500 hover:bg-green-400 text-black text-xs font-bold tracking-widest uppercase transition-all rounded-sm flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 hover:-translate-y-0.5"
            >
              <Plus size={14} /> {walletToken ? 'TOP UP' : 'DEPOSIT'} <ChevronRight size={14} />
            </button>
          </div>

          {/* ═══ COUNTRY + SERVICE SELECTORS ═══ */}
          <div className="bg-wr-surface border border-wr-border p-4 md:p-10 relative overflow-hidden shadow-2xl mx-2 md:mx-0">
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">

              {/* Country */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                  <Globe size={12} className="text-wr-accent" /> Country
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                  <input type="text" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} placeholder="Search countries..."
                    className="w-full pl-10 pr-3 py-3 md:py-4 bg-wr-base border-2 border-wr-border outline-none font-mono text-base transition-all rounded-sm focus:border-wr-accent text-current placeholder-wr-dim/30" />
                </div>
                {/* Popular countries */}
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_COUNTRIES.map(code => {
                    const country = countries.find(c => c.short_name === code);
                    if (!country) return null;
                    return (
                      <button key={country.ID} onClick={() => setSelectedCountry(String(country.ID))} title={country.name}
                        className={`text-xs px-3 py-1.5 rounded-full border font-bold transition-all ${selectedCountry === String(country.ID) ? 'border-wr-accent text-wr-accent bg-wr-accent/10' : 'border-wr-border text-wr-dim hover:border-wr-accent/30 hover:text-wr-accent'}`}>
                        {country.short_name}
                      </button>
                    );
                  })}
                </div>
                {/* Separator */}
                <div className="border-t border-wr-border/30" />
                {/* All countries */}
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto content-start p-1">
                  {filteredCountries.map(c => (
                    <button key={c.ID} onClick={() => setSelectedCountry(String(c.ID))} title={c.name}
                      className={`text-xs px-3 py-1.5 rounded border font-mono transition-all ${selectedCountry === String(c.ID) ? 'border-wr-accent text-wr-accent bg-wr-accent/20 font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)]' : 'border-wr-border text-current hover:border-wr-accent/40 hover:text-wr-accent'}`}>
                      {c.short_name}
                    </button>
                  ))}
                </div>
                {selectedCountryName && (
                  <div className="text-[10px] text-wr-accent font-bold animate-pulse">
                    {"● "}{selectedCountryName}
                  </div>
                )}
              </div>

              {/* Service */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                  <Phone size={12} className="text-green-400" /> Service
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                  <input type="text" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} placeholder="Search all services..."
                    className="w-full pl-10 pr-3 py-3 md:py-4 bg-wr-base border-2 border-wr-border outline-none font-mono text-base transition-all rounded-sm focus:border-green-400 text-current placeholder-wr-dim/30" />
                </div>
                {/* Popular services */}
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_SERVICES.map(name => {
                    const svc = services.find(s => s.name.toLowerCase() === name.toLowerCase());
                    if (!svc) return null;
                    return (
                      <button key={svc.ID} onClick={() => { setSelectedService(String(svc.ID)); setServiceSearch(''); }}
                        className={`text-xs px-3 py-1.5 rounded-full border font-bold transition-all ${selectedService === String(svc.ID) ? 'border-green-400 text-green-400 bg-green-400/10' : 'border-wr-border text-wr-dim hover:border-green-400/30 hover:text-green-400'}`}>
                        {svc.name}
                      </button>
                    );
                  })}
                </div>
                {/* Separator */}
                <div className="border-t border-wr-border/30" />
                {/* All services */}
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto content-start p-1">
                  {(serviceSearch ? filteredServices : services).slice(0, 80).map(s => (
                    <button key={s.ID} onClick={() => { setSelectedService(String(s.ID)); setServiceSearch(''); }}
                      className={`text-xs px-3 py-1.5 rounded border font-mono transition-all ${selectedService === String(s.ID) ? 'border-green-400 text-green-400 bg-green-400/20 font-bold shadow-[0_0_12px_rgba(74,222,128,0.25)]' : 'border-wr-border text-current hover:border-green-400/40 hover:text-green-400'}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
                {selectedServiceName && (
                  <div className="text-[10px] text-green-400 font-bold animate-pulse">
                    {"● "}{selectedServiceName}
                  </div>
                )}
              </div>
            </div>

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
                {priceInfo ? (
                  <span>
                    <span className="text-wr-green animate-pulse">●</span>{' '}
                    {selectedServiceName} / {selectedCountryName} — {priceInfo.success_rate}% success
                  </span>
                ) : (
                  <span><span className="text-wr-dim">●</span> Select country & service</span>
                )}
              </div>

              {loadingPrice ? (
                <div className="flex items-center gap-2 text-wr-dim text-xs"><RefreshCw size={14} className="animate-spin" /> Checking price...</div>
              ) : priceInfo ? (
                <button
                  onClick={handleGetNumber}
                  disabled={!selectedService || creatingPayment}
                  className={`w-full md:w-auto group relative px-8 py-4 text-sm font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 overflow-hidden rounded-sm
                    ${creatingPayment ? 'bg-wr-surface border border-wr-border text-wr-dim cursor-wait' : paymentMethod === 'XMR' ? 'bg-wr-green text-black shadow-[0_0_20px_rgba(0,255,65,0.4)]' : 'bg-wr-accent text-black shadow-[0_0_20px_rgba(34,211,238,0.4)]'}
                    disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  {creatingPayment ? (
                    <><RefreshCw size={16} className="animate-spin" /> Generating...</>
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:animate-[scan_1s_ease-in-out_infinite] skew-x-12" />
                      <span>Get Number</span>
                      <span className="opacity-40">|</span>
                      <span>${priceInfo.price}</span>
                      <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              ) : (
                <div className="px-8 py-4 bg-wr-surface border border-wr-border text-wr-dim text-sm rounded-sm cursor-not-allowed">
                  Select service to see price
                </div>
              )}
            </div>

            {priceInfo && priceInfo.success_rate < 50 && (
              <div className="mt-4 flex items-start gap-2 text-xs text-wr-warning p-3 rounded bg-wr-warning/10 border border-wr-warning/20">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>Low success rate. If SMS not received, the charge is refunded to your wallet automatically.</span>
              </div>
            )}
          </div>

          {/* ═══ INFO CARDS ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center mx-2 md:mx-0">
            {[
              { title: 'Pay with XMR/LN', desc: 'Monero or Lightning — both untraceable' },
              { title: 'Auto-Refund', desc: 'Wallet refunded if SMS not received' },
              { title: '1,700+ Services', desc: 'Discord, Telegram, Google, and more' },
            ].map(item => (
              <div key={item.title} className="p-4 rounded-sm border border-wr-border/50 bg-wr-surface/30">
                <h4 className="text-[10px] font-bold uppercase text-wr-accent mb-1">{item.title}</h4>
                <p className="text-[10px] text-wr-dim">{item.desc}</p>
              </div>
            ))}
          </div>
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
                    <div className="text-[10px] text-wr-green/60">
                      Will auto-purchase {selectedServiceName} / {selectedCountryName} on confirmation
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

                  {/* Payment method — only shown when opened from banner */}
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
