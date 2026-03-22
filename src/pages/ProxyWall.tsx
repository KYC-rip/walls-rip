import { useState, useEffect } from 'react';
import {
  Shield, Globe, Search, Copy, Check, RefreshCw, ChevronRight,
  Wallet, Zap, X, Plus, Wifi, Server, Smartphone, AlertTriangle,
  ExternalLink, Eye,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';

// ─── Types ───

type ProxyType = 'residential' | 'datacenter' | 'mobile';
type ProxyProtocol = 'socks5' | 'http';

interface ProxyPlan {
  id: string;
  name: string;
  type: ProxyType;
  bandwidthGB: number;
  durationDays: number;
  price: number;
  costPrice: number;
  engine: string;
}

interface ProxyLocation {
  id: string;
  country: string;
  countryCode: string;
  city?: string;
  engine: string;
}

interface ProxyCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: ProxyProtocol;
}

interface ProxyOrder {
  orderId: string;
  planId: string;
  location: string;
  credentials: ProxyCredentials;
  expiresAt: number;
  engine: string;
  createdAt: number;
  balanceUSD: number;
  charged: number;
}

interface PaymentData {
  method: 'XMR' | 'LN';
  address: string;
  paymentId: string;
  amount: number;
  usd: number;
}

interface ProxyHealthResult {
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  latency: number;
  message?: string;
}

// ─── Constants ───

const WALLET_KEY = 'walls_proxy_wallet';
const DEPOSIT_AMOUNTS = [5, 10, 25, 50];

const PROXY_TYPE_CONFIG: Record<ProxyType, { label: string; icon: typeof Wifi; color: string; borderColor: string; bgColor: string; shadowColor: string }> = {
  residential: {
    label: 'Residential',
    icon: Wifi,
    color: 'text-green-400',
    borderColor: 'border-green-400',
    bgColor: 'bg-green-400',
    shadowColor: 'shadow-green-500/20',
  },
  datacenter: {
    label: 'Datacenter',
    icon: Server,
    color: 'text-cyan-400',
    borderColor: 'border-cyan-400',
    bgColor: 'bg-cyan-400',
    shadowColor: 'shadow-cyan-500/20',
  },
  mobile: {
    label: 'Mobile',
    icon: Smartphone,
    color: 'text-purple-400',
    borderColor: 'border-purple-400',
    bgColor: 'bg-purple-400',
    shadowColor: 'shadow-purple-500/20',
  },
};

const POPULAR_LOCATIONS = ['US', 'GB', 'DE', 'NL', 'FR', 'JP', 'SG', 'CA', 'SE'];

export function ProxyWall() {
  // Data
  const [plans, setPlans] = useState<ProxyPlan[]>([]);
  const [locations, setLocations] = useState<ProxyLocation[]>([]);
  const [healthData, setHealthData] = useState<ProxyHealthResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [engineError, setEngineError] = useState(false);

  // Selection
  const [selectedType, setSelectedType] = useState<ProxyType>('residential');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [locationSearch, setLocationSearch] = useState('');
  const [selectedProtocol, setSelectedProtocol] = useState<ProxyProtocol>('socks5');

  // Wallet
  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState<number>(0);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'XMR' | 'LN'>('XMR');
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMethodInModal, setShowMethodInModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentPolling, setPaymentPolling] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState<{ planId: string; location: string } | null>(null);
  const [creatingPayment, setCreatingPayment] = useState(false);

  // Order
  const [order, setOrder] = useState<ProxyOrder | null>(null);
  const [step, setStep] = useState<'SELECT' | 'CREDENTIALS'>('SELECT');
  const [copied, setCopied] = useState<string>('');

  // ─── Load data ───
  useEffect(() => {
    Promise.all([
      apiClient<ProxyPlan[]>('/v1/tools/proxy/plans').catch(() => []),
      apiClient<ProxyLocation[]>('/v1/tools/proxy/locations').catch(() => []),
      apiClient<ProxyHealthResult[]>('/v1/tools/proxy/health').catch(() => []),
    ]).then(([p, l, h]) => {
      setPlans(p);
      setLocations(l);
      setHealthData(h);
      // Check if all engines are in MAINTENANCE
      const allMaint = h.length > 0 && h.every(e => e.status === 'MAINTENANCE');
      setEngineError(p.length === 0 || allMaint);
      if (l.length > 0 && !selectedLocation) {
        const us = l.find(loc => loc.countryCode === 'US');
        if (us) setSelectedLocation(us.id);
      }
    }).finally(() => setLoading(false));
  }, []);

  // ─── Wallet balance check ───
  useEffect(() => {
    if (!walletToken) return;
    apiClient<{ balanceUSD: number }>(`/v1/tools/proxy/balance?token=${walletToken}`)
      .then(data => setBalanceUSD(data.balanceUSD))
      .catch(() => { localStorage.removeItem(WALLET_KEY); setWalletToken(null); setBalanceUSD(0); });
  }, [walletToken]);

  // ─── Poll for payment ───
  useEffect(() => {
    if (!paymentPolling || !paymentData) return;
    const interval = setInterval(async () => {
      try {
        const result = await apiClient<{ status: string; walletToken?: string; balanceUSD?: number }>(
          `/v1/tools/proxy/payment/check?paymentId=${paymentData.paymentId}`
        );
        if (result.status === 'COMPLETED' && result.walletToken) {
          setPaymentPolling(false);
          setWalletToken(result.walletToken);
          setBalanceUSD(result.balanceUSD || 0);
          localStorage.setItem(WALLET_KEY, result.walletToken);
          setPaymentData(null);
          setShowPaymentModal(false);
          toast.success(`$${paymentData.usd.toFixed(2)} deposited!`);

          if (pendingPurchase) {
            setTimeout(() => executePurchase(pendingPurchase.planId, pendingPurchase.location, result.walletToken!), 500);
            setPendingPurchase(null);
          }
        } else if (result.status === 'EXPIRED') {
          setPaymentPolling(false);
          setPaymentData(null);
          setPendingPurchase(null);
          toast.error('Payment expired');
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [paymentPolling, paymentData, pendingPurchase]);

  // ─── Helpers ───

  const createPayment = async (usdAmount: number, purchaseAfter?: { planId: string; location: string }) => {
    setCreatingPayment(true);
    try {
      const data = await apiClient<PaymentData>('/v1/tools/proxy/payment/create', {
        method: 'POST',
        body: { amount: usdAmount, method: paymentMethod, walletToken },
      });
      setPaymentData(data);
      setPaymentPolling(true);
      setShowPaymentModal(true);
      setShowMethodInModal(false);
      if (purchaseAfter) setPendingPurchase(purchaseAfter);
    } catch { toast.error('Failed to create payment'); }
    finally { setCreatingPayment(false); }
  };

  const executePurchase = async (planId: string, location: string, token: string) => {
    try {
      const data = await apiClient<ProxyOrder>('/v1/tools/proxy/purchase', {
        method: 'POST',
        body: { planId, location, token },
      });
      if (data.orderId) {
        setOrder(data);
        setBalanceUSD(data.balanceUSD);
        setStep('CREDENTIALS');
      } else {
        toast.error('Failed to purchase proxy');
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message || 'Purchase failed';
      toast.error(msg);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPlan || !selectedLocation) return;
    const plan = filteredPlans.find(p => p.id === selectedPlan);
    if (!plan) return;

    if (walletToken && balanceUSD >= plan.price) {
      executePurchase(selectedPlan, selectedLocation, walletToken);
    } else {
      const needed = walletToken ? plan.price - balanceUSD : plan.price;
      const depositAmt = Math.max(needed, 5);
      setDepositAmount(parseFloat(Math.ceil(depositAmt).toFixed(2)));
      createPayment(Math.ceil(depositAmt), { planId: selectedPlan, location: selectedLocation });
    }
  };

  const handleDeposit = () => {
    createPayment(depositAmount);
  };

  const copyText = (text: string, label?: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label || text);
    setTimeout(() => setCopied(''), 2000);
    toast.success('Copied!');
  };

  const reset = () => {
    setOrder(null);
    setStep('SELECT');
    setSelectedPlan('');
  };

  // ─── Derived state ───

  const filteredPlans = plans.filter(p => p.type === selectedType);
  const filteredLocations = locations
    .filter(l => l.country.toLowerCase().includes(locationSearch.toLowerCase()) || l.countryCode.toLowerCase().includes(locationSearch.toLowerCase()));
  const selectedLocationObj = locations.find(l => l.id === selectedLocation);
  const selectedPlanObj = plans.find(p => p.id === selectedPlan);
  const typeConfig = PROXY_TYPE_CONFIG[selectedType];

  // ─── Loading ───

  if (loading) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 animate-pulse text-wr-dim">
          <RefreshCw size={32} className="animate-spin mb-4" />
          <p className="text-xs tracking-widest uppercase">Loading proxy services...</p>
        </div>
      </div>
    );
  }

  // ─── CREDENTIALS state ───

  if (step === 'CREDENTIALS' && order) {
    const cred = order.credentials;
    const connString = selectedProtocol === 'socks5'
      ? `socks5://${cred.username}:${cred.password}@${cred.host}:${cred.port}`
      : `http://${cred.username}:${cred.password}@${cred.host}:${cred.port}`;

    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
        <div className="fixed inset-0 z-40 pointer-events-none vignette" />
        <Header />
        <main className="w-full max-w-2xl px-4 relative z-10 flex flex-col gap-8 mb-20 mt-8">
          <div className="p-8 rounded-sm border border-wr-green bg-wr-surface text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 border border-green-400/20">
              <Shield size={32} />
            </div>
            <h2 className="text-lg font-bold tracking-wider text-wr-green">PROXY ACTIVE</h2>
            <p className="text-xs text-wr-dim">Your proxy credentials are ready. Use them in your browser, CLI, or any application.</p>

            {/* Protocol toggle */}
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setSelectedProtocol('socks5')}
                className={`text-xs px-4 py-2 rounded-sm border font-bold transition-all ${selectedProtocol === 'socks5' ? 'border-wr-green bg-wr-green/10 text-wr-green' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                SOCKS5
              </button>
              <button onClick={() => setSelectedProtocol('http')}
                className={`text-xs px-4 py-2 rounded-sm border font-bold transition-all ${selectedProtocol === 'http' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                HTTP
              </button>
            </div>

            {/* Connection string */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-green-400 to-cyan-400 rounded-sm blur opacity-30 group-hover:opacity-50 transition duration-300" />
              <button onClick={() => copyText(connString, 'conn')}
                className="w-full relative p-4 rounded bg-wr-base border border-wr-border flex items-center justify-between gap-4 hover:border-wr-green transition-colors text-left">
                <span className="font-mono text-sm text-wr-green break-all">{connString}</span>
                {copied === 'conn' ? <Check size={18} className="text-green-500 shrink-0" /> : <Copy size={18} className="text-wr-dim shrink-0" />}
              </button>
            </div>

            {/* Individual fields */}
            <div className="grid grid-cols-2 gap-3 text-left">
              {[
                { label: 'Host', value: cred.host, key: 'host' },
                { label: 'Port', value: String(cred.port), key: 'port' },
                { label: 'Username', value: cred.username, key: 'user' },
                { label: 'Password', value: cred.password, key: 'pass' },
              ].map(f => (
                <button key={f.key} onClick={() => copyText(f.value, f.key)}
                  className="p-3 rounded bg-wr-base border border-wr-border hover:border-wr-green/50 transition-colors group">
                  <div className="text-[9px] text-wr-dim uppercase tracking-widest mb-1">{f.label}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-current truncate">{f.value}</span>
                    {copied === f.key ? <Check size={12} className="text-green-500 shrink-0" /> : <Copy size={12} className="text-wr-dim shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </div>
                </button>
              ))}
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-wr-border/30">
              <div className="text-center">
                <div className="text-[9px] text-wr-dim uppercase tracking-widest">Protocol</div>
                <div className="text-xs font-bold text-wr-accent uppercase">{selectedProtocol}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-wr-dim uppercase tracking-widest">Expires</div>
                <div className="text-xs font-bold text-current">{new Date(order.expiresAt).toLocaleDateString()}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-wr-dim uppercase tracking-widest">Charged</div>
                <div className="text-xs font-bold text-wr-green">${order.charged.toFixed(2)}</div>
              </div>
            </div>

            {/* Connection test hint */}
            <div className="flex items-start gap-2 text-xs text-wr-dim p-3 rounded bg-wr-base border border-wr-border/50">
              <Eye size={14} className="shrink-0 mt-0.5 text-wr-accent" />
              <span>Test: <code className="text-wr-accent">curl --proxy {selectedProtocol === 'socks5' ? '--socks5' : ''} {cred.host}:{cred.port} -U {cred.username}:{cred.password} https://api.ipify.org</code></span>
            </div>

            <div className="text-[10px] text-wr-dim">Wallet: ${balanceUSD.toFixed(2)}</div>
            <button onClick={reset} className="text-xs font-bold uppercase text-wr-accent hover:underline">Buy Another Proxy</button>
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
        title="Proxy Wall — Anonymous proxy access"
        description="Get anonymous residential, datacenter, and mobile proxies. Global coverage, SOCKS5/HTTP. Pay with XMR or Lightning."
        path="/proxy"
        image="/og-proxy.jpg"
        schemas={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Proxy Wall',
            url: 'https://walls.rip/proxy',
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Web',
            description: 'Anonymous residential, datacenter, and mobile proxies. SOCKS5 & HTTP. Global coverage.',
            offers: { '@type': 'Offer', price: '3.00', priceCurrency: 'USD', description: 'Starting price for proxy access' },
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: 'Proxy Wall — Anonymous Proxy Access',
            serviceType: 'Anonymous Proxy Access',
            areaServed: 'Worldwide',
            description: 'Residential, datacenter, and mobile proxies with SOCKS5/HTTP support. Pay with Monero or Lightning.',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
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
              <Shield size={40} />
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mb-2">
              PROXY <span className="text-cyan-400">WALL</span>
            </h1>
            <p className="text-wr-dim text-sm">Anonymous proxies. Residential, datacenter, mobile. Global coverage.</p>
          </div>

          {/* ═══ COMING SOON BANNER (when engine not configured) ═══ */}
          {engineError && (
            <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-warning/30 p-6 rounded-sm relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-wr-warning" />
              <div className="flex items-start gap-4">
                <div className="p-3 bg-wr-warning/10 text-wr-warning rounded-full shrink-0 border border-wr-warning/20">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-wr-warning font-bold tracking-widest text-sm mb-1 uppercase">Coming Soon</h3>
                  <p className="text-xs text-wr-dim font-mono leading-relaxed max-w-lg">
                    Proxy service is currently being configured. The plans and locations shown below are previews.
                    Deposits and purchases will be enabled once a provider is live.
                  </p>
                  {healthData.length > 0 && healthData[0].message && (
                    <p className="text-[10px] text-wr-dim/60 mt-2 font-mono">{healthData[0].message}</p>
                  )}
                </div>
              </div>
            </div>
          )}

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
                    ? 'Funds are stored anonymously. No account needed. Top up anytime with XMR or Lightning.'
                    : 'Deposit XMR or Lightning to purchase proxies. One wallet, multiple proxy subscriptions.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => { setShowMethodInModal(true); setShowPaymentModal(true); }}
              disabled={engineError}
              className="relative z-10 w-full md:w-auto px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold tracking-widest uppercase transition-all rounded-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 hover:-translate-y-0.5 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <Plus size={14} /> {walletToken ? 'TOP UP' : 'DEPOSIT'} <ChevronRight size={14} />
            </button>
          </div>

          {/* ═══ PROXY TYPE TABS ═══ */}
          <div className="mx-2 md:mx-0">
            <div className="grid grid-cols-3 gap-3">
              {(Object.entries(PROXY_TYPE_CONFIG) as [ProxyType, typeof PROXY_TYPE_CONFIG[ProxyType]][]).map(([type, config]) => {
                const Icon = config.icon;
                const count = plans.filter(p => p.type === type).length;
                return (
                  <button key={type} onClick={() => { setSelectedType(type); setSelectedPlan(''); }}
                    className={`p-4 rounded-sm border transition-all text-center ${selectedType === type
                      ? `${config.borderColor} ${config.color} bg-${type === 'residential' ? 'green' : type === 'datacenter' ? 'cyan' : 'purple'}-400/10 shadow-[0_0_20px_rgba(0,0,0,0.1)]`
                      : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                    <Icon size={20} className="mx-auto mb-2" />
                    <div className="text-xs font-bold tracking-widest uppercase">{config.label}</div>
                    <div className="text-[10px] text-wr-dim mt-1">{count} plan{count !== 1 ? 's' : ''}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ═══ MAIN CONFIG PANEL ═══ */}
          <div className="bg-wr-surface border border-wr-border p-4 md:p-10 relative overflow-hidden shadow-2xl mx-2 md:mx-0">
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">

              {/* ─── Location Selector ─── */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                  <Globe size={12} className="text-wr-accent" /> Location
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                  <input type="text" value={locationSearch} onChange={e => setLocationSearch(e.target.value)} placeholder="Search locations..."
                    className="w-full pl-10 pr-3 py-3 md:py-4 bg-wr-base border-2 border-wr-border outline-none font-mono text-base transition-all rounded-sm focus:border-wr-accent text-current placeholder-wr-dim/30" />
                </div>
                {/* Popular locations */}
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_LOCATIONS.map(code => {
                    const loc = locations.find(l => l.countryCode === code);
                    if (!loc) return null;
                    return (
                      <button key={loc.id} onClick={() => setSelectedLocation(loc.id)} title={loc.country}
                        className={`text-xs px-3 py-1.5 rounded-full border font-bold transition-all ${selectedLocation === loc.id ? 'border-wr-accent text-wr-accent bg-wr-accent/10' : 'border-wr-border text-wr-dim hover:border-wr-accent/30 hover:text-wr-accent'}`}>
                        {loc.countryCode}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-wr-border/30" />
                {/* All locations */}
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto content-start p-1">
                  {filteredLocations.map(l => (
                    <button key={l.id} onClick={() => setSelectedLocation(l.id)} title={l.country}
                      className={`text-xs px-3 py-1.5 rounded border font-mono transition-all ${selectedLocation === l.id
                        ? 'border-wr-accent text-wr-accent bg-wr-accent/20 font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                        : 'border-wr-border text-current hover:border-wr-accent/40 hover:text-wr-accent'}`}>
                      {l.countryCode}
                    </button>
                  ))}
                </div>
                {selectedLocationObj && (
                  <div className="text-[10px] text-wr-accent font-bold animate-pulse">
                    {"● "}{selectedLocationObj.country}
                  </div>
                )}
              </div>

              {/* ─── Plan Cards ─── */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                  {(() => { const Icon = typeConfig.icon; return <Icon size={12} className={typeConfig.color} />; })()}
                  {typeConfig.label} Plans
                </label>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {filteredPlans.length === 0 ? (
                    <div className="text-center py-8 text-wr-dim text-xs">No {typeConfig.label.toLowerCase()} plans available</div>
                  ) : filteredPlans.map(plan => (
                    <button key={plan.id} onClick={() => setSelectedPlan(plan.id)}
                      className={`w-full text-left p-4 rounded-sm border transition-all group ${selectedPlan === plan.id
                        ? `${typeConfig.borderColor} ${typeConfig.color} bg-${selectedType === 'residential' ? 'green' : selectedType === 'datacenter' ? 'cyan' : 'purple'}-400/10`
                        : 'border-wr-border hover:border-wr-dim'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm tracking-wider">{plan.name}</span>
                        <span className={`font-bold text-lg font-mono ${selectedPlan === plan.id ? typeConfig.color : 'text-current'}`}>
                          ${plan.price.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-wr-dim uppercase tracking-widest">
                        <span>{plan.bandwidthGB === -1 ? 'Unlimited' : `${plan.bandwidthGB} GB`}</span>
                        <span className="text-wr-border">|</span>
                        <span>{plan.durationDays} days</span>
                        <span className="text-wr-border">|</span>
                        <span>{plan.type}</span>
                      </div>
                    </button>
                  ))}
                </div>
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
                {selectedPlanObj && selectedLocationObj ? (
                  <span>
                    <span className={`${typeConfig.color} animate-pulse`}>●</span>{' '}
                    {selectedPlanObj.name} / {selectedLocationObj.country} — {selectedPlanObj.bandwidthGB === -1 ? 'Unlimited' : `${selectedPlanObj.bandwidthGB} GB`}
                  </span>
                ) : (
                  <span><span className="text-wr-dim">●</span> Select location & plan</span>
                )}
              </div>

              {selectedPlanObj ? (
                <button
                  onClick={handlePurchase}
                  disabled={!selectedPlan || !selectedLocation || creatingPayment || engineError}
                  className={`w-full md:w-auto group relative px-8 py-4 text-sm font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 overflow-hidden rounded-sm
                    ${creatingPayment ? 'bg-wr-surface border border-wr-border text-wr-dim cursor-wait' : engineError ? 'bg-wr-surface border border-wr-border text-wr-dim cursor-not-allowed' : paymentMethod === 'XMR' ? 'bg-wr-green text-black shadow-[0_0_20px_rgba(0,255,65,0.4)]' : 'bg-wr-accent text-black shadow-[0_0_20px_rgba(34,211,238,0.4)]'}
                    disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  {creatingPayment ? (
                    <><RefreshCw size={16} className="animate-spin" /> Generating...</>
                  ) : engineError ? (
                    <>Coming Soon</>
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:animate-[scan_1s_ease-in-out_infinite] skew-x-12" />
                      <span>Purchase</span>
                      <span className="opacity-40">|</span>
                      <span>${selectedPlanObj.price.toFixed(2)}</span>
                      <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              ) : (
                <div className="px-8 py-4 bg-wr-surface border border-wr-border text-wr-dim text-sm rounded-sm cursor-not-allowed">
                  Select plan to see price
                </div>
              )}
            </div>
          </div>

          {/* ═══ INFO CARDS ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center mx-2 md:mx-0">
            {[
              { title: 'SOCKS5 & HTTP', desc: 'Both protocols supported. Switch anytime.' },
              { title: 'Global IPs', desc: '15+ countries, residential and datacenter pools' },
              { title: 'XMR / Lightning', desc: 'Anonymous payments. No KYC. No trails.' },
            ].map(item => (
              <div key={item.title} className="p-4 rounded-sm border border-wr-border/50 bg-wr-surface/30">
                <h4 className="text-[10px] font-bold uppercase text-wr-accent mb-1">{item.title}</h4>
                <p className="text-[10px] text-wr-dim">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* ═══ USE CASES ═══ */}
          <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-border p-6 md:p-8 rounded-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-wr-accent mb-6 flex items-center gap-2">
              <Shield size={14} /> Use Cases
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: 'Web Scraping', desc: 'Rotate residential IPs to avoid blocks and CAPTCHAs.' },
                { title: 'Privacy Browsing', desc: 'Hide your real IP. No DNS leaks with SOCKS5.' },
                { title: 'Geo-Unblocking', desc: 'Access region-locked content from any country.' },
                { title: 'Ad Verification', desc: 'Verify ads from different locations and ISPs.' },
              ].map(uc => (
                <div key={uc.title} className="flex items-start gap-3 p-3 rounded bg-wr-base border border-wr-border/30">
                  <ExternalLink size={14} className="text-wr-accent shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-current mb-0.5">{uc.title}</div>
                    <div className="text-[10px] text-wr-dim">{uc.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* ═══ PAYMENT MODAL ═══ */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-wr-base/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
          <div className={`border bg-wr-base p-0 max-w-lg w-full relative shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden rounded-sm ${paymentMethod === 'LN' ? 'border-wr-accent' : 'border-wr-green'}`}>
            <button onClick={() => { setShowPaymentModal(false); setPaymentData(null); setPaymentPolling(false); setPendingPurchase(null); }}
              className="absolute top-4 right-4 text-wr-dim hover:text-wr-green z-10"><X size={20} /></button>

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
                  <button onClick={() => copyText(paymentData.address, 'addr')}
                    className="w-full p-3 rounded bg-wr-surface border border-wr-border text-[10px] font-mono text-wr-green break-all text-left hover:border-wr-green/50 transition-colors cursor-pointer">
                    {paymentData.address}
                  </button>
                  <div className="flex items-center justify-center gap-2 text-[10px] text-wr-dim uppercase tracking-widest">
                    <RefreshCw size={10} className="animate-spin" /> Awaiting confirmation...
                  </div>
                  {pendingPurchase && selectedPlanObj && selectedLocationObj && (
                    <div className="text-[10px] text-wr-green/60">
                      Will auto-purchase {selectedPlanObj.name} / {selectedLocationObj.country} on confirmation
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
