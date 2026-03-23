import { useState, useEffect } from 'react';
import { Phone, Globe, Search, Copy, Check, RefreshCw, Clock, AlertTriangle, ChevronRight, Wallet, Zap, X, Plus, Bell, BellOff, Key, MessageSquare, Calendar, Timer, Trash2, Expand, Shield, ExternalLink, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';

interface Country { id: string; name: string; shortName: string; engine: string }
interface Service { id: string; name: string; category?: string; engine: string }
interface PriceInfo { price: string; cost_price: string; success_rate: number; engine: string }

interface PaymentData {
  method: 'XMR' | 'LN';
  address: string;
  paymentId: string;
  amount: number;
  usd: number;
}

interface PurchaseResult {
  orderId: string;
  phoneNumber: string;
  country: string;
  service: string;
  costPrice: number;
  engine: string;
  createdAt: number;
  balanceUSD: number;
  charged: number;
}

interface SMSCheckResult {
  orderId: string;
  status: 'PENDING' | 'RECEIVED' | 'EXPIRED' | 'CANCELLED';
  sms?: string;
  fullSms?: string;
  engine: string;
  refunded?: number;
  balanceUSD?: number;
}

// Rental types
interface RentalService { id: string; name: string; type: 'long' | 'extended'; engine: string }
interface RentalPrice { serviceId: string; price: number; days: number; engine: string }
interface RentalOrder { orderId: string; phoneNumber: string; service: string; expiresAt: string; engine: string; createdAt: number; balanceUSD?: number; charged?: number }
interface RentalMessage { sender: string; message: string; timestamp: string }
interface RentalStatus { orderId: string; phoneNumber: string; messages: RentalMessage[]; expiresAt: string; engine: string }

// XMR402 types
interface XMR402Challenge {
  address: string;
  amount: string; // piconero
  message: string; // nonce
  timestamp: string;
}

function parseWwwAuthenticate(header: string): XMR402Challenge | null {
  const match = header.match(
    /XMR402\s+address="([^"]+)",\s*amount="([^"]+)",\s*message="([^"]+)",\s*timestamp="([^"]+)"/
  );
  if (!match) return null;
  return { address: match[1], amount: match[2], message: match[3], timestamp: match[4] };
}

function piconeroToXMR(piconero: string): string {
  const val = BigInt(piconero);
  const whole = val / BigInt(1e12);
  const frac = val % BigInt(1e12);
  return `${whole}.${frac.toString().padStart(12, '0').replace(/0+$/, '') || '0'}`;
}

const WALLET_KEY = 'walls_sms_wallet';
const DEPOSIT_AMOUNTS = [0.50, 1, 3, 5];

const POPULAR_COUNTRIES = ['US', 'GB', 'NL', 'DE', 'FR', 'SE', 'PH', 'IN', 'MX'];

const POPULAR_SERVICES = [
  'Telegram', 'Discord', 'Google', 'WhatsApp', 'Twitter',
  'Instagram', 'Facebook', 'Steam', 'Microsoft', 'Amazon',
];

interface StockInfo { available: boolean; count?: number }

export function SMSWall() {
  const { t } = useTranslation();
  const [countries, setCountries] = useState<Country[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('1');
  const [selectedService, setSelectedService] = useState<string>('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [suggestedCountryIds, setSuggestedCountryIds] = useState<Set<string>>(new Set());

  // Wallet
  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState<number>(0);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'XMR' | 'LN' | 'XMR402'>('XMR');
  const [depositAmount, setDepositAmount] = useState<number>(1);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMethodInModal, setShowMethodInModal] = useState(false); // show XMR/LN picker in deposit modal
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentPolling, setPaymentPolling] = useState(false);
  // Track what to do after payment completes
  const [pendingPurchase, setPendingPurchase] = useState<{ country: string; service: string } | null>(null);

  // XMR402 state
  const [xmr402Loading, setXmr402Loading] = useState(false);
  const [xmr402Challenge, setXmr402Challenge] = useState<XMR402Challenge | null>(null);
  const [showXmr402Modal, setShowXmr402Modal] = useState(false);

  // SMS flow
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [smsResult, setSmsResult] = useState<SMSCheckResult | null>(null);
  const [polling, setPolling] = useState(false);
  const [step, setStep] = useState<'SELECT' | 'WAITING' | 'RECEIVED'>('SELECT');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Push notifications
  const [notifEnabled, setNotifEnabled] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted');

  // Wallet management
  const [showRestoreInput, setShowRestoreInput] = useState(false);
  const [restoreToken, setRestoreToken] = useState('');
  const [restoringWallet, setRestoringWallet] = useState(false);
  const [walletStats, setWalletStats] = useState<{ totalDeposited: number; totalSpent: number }>({ totalDeposited: 0, totalSpent: 0 });
  const [walletTokenCopied, setWalletTokenCopied] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<'sms' | 'rentals'>('sms');

  // Rentals
  const [rentalServices, setRentalServices] = useState<RentalService[]>([]);
  const [rentalServiceSearch, setRentalServiceSearch] = useState('');
  const [selectedRentalService, setSelectedRentalService] = useState<string>('');
  const [rentalPrices, setRentalPrices] = useState<RentalPrice[]>([]);
  const [loadingRentalPrices, setLoadingRentalPrices] = useState(false);
  const [loadingRentalServices, setLoadingRentalServices] = useState(false);
  const [activeRentals, setActiveRentals] = useState<RentalStatus[]>([]);
  const [loadingActiveRentals, setLoadingActiveRentals] = useState(false);
  const [viewingRentalMessages, setViewingRentalMessages] = useState<string | null>(null); // orderId
  const [rentalMessages, setRentalMessages] = useState<RentalMessage[]>([]);
  const [pollingRentalMessages, setPollingRentalMessages] = useState(false);
  const [purchasingRental, setPurchasingRental] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState<string | null>(null); // orderId
  const [extendingRental, setExtendingRental] = useState(false);

  const requestNotifPermission = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifEnabled(perm === 'granted');
    if (perm === 'granted') toast.success('Notifications enabled');
  };

  const fireNotification = (title: string, body: string) => {
    if (!notifEnabled || document.hasFocus()) return;
    try { new Notification(title, { body, icon: '/og-sms.jpg', tag: 'sms-wall' }); } catch { /* noop */ }
  };

  // Load data
  useEffect(() => {
    Promise.all([
      apiClient<Country[]>('/v1/tools/sms/countries'),
      apiClient<Service[]>('/v1/tools/sms/services'),
    ]).then(([c, s]) => { setCountries(c); setServices(s); })
      .catch(() => toast.error('Failed to load SMS data'))
      .finally(() => setLoading(false));
  }, []);

  // Check wallet balance + stats
  useEffect(() => {
    if (!walletToken) return;
    apiClient<{ balanceUSD: number; totalDeposited?: number; totalSpent?: number }>(`/v1/tools/sms/balance?token=${walletToken}`)
      .then(data => {
        setBalanceUSD(data.balanceUSD);
        setWalletStats({ totalDeposited: data.totalDeposited || 0, totalSpent: data.totalSpent || 0 });
      })
      .catch(() => { localStorage.removeItem(WALLET_KEY); setWalletToken(null); setBalanceUSD(0); });
  }, [walletToken]);

  // Fetch price + stock when country+service selected
  useEffect(() => {
    if (!selectedCountry || !selectedService) { setPriceInfo(null); setStockInfo(null); return; }
    setLoadingPrice(true);
    Promise.all([
      apiClient<PriceInfo>(`/v1/tools/sms/price?country=${selectedCountry}&service=${selectedService}`),
      apiClient<StockInfo>(`/v1/tools/sms/stock?country=${selectedCountry}&service=${selectedService}`).catch(() => null),
    ]).then(([price, stock]) => {
      setPriceInfo(price);
      setStockInfo(stock);
    }).catch(() => { setPriceInfo(null); setStockInfo(null); toast.error('Service not available'); })
      .finally(() => setLoadingPrice(false));
  }, [selectedCountry, selectedService]);

  // Fetch suggested countries when service changes
  useEffect(() => {
    if (!selectedService) { setSuggestedCountryIds(new Set()); return; }
    apiClient<Country[]>(`/v1/tools/sms/suggested?service=${selectedService}`)
      .then(data => setSuggestedCountryIds(new Set(data.map(c => c.id))))
      .catch(() => setSuggestedCountryIds(new Set()));
  }, [selectedService]);

  // Poll for SMS
  useEffect(() => {
    if (!polling || !purchase) return;
    const interval = setInterval(async () => {
      try {
        const result = await apiClient<SMSCheckResult>(`/v1/tools/sms/check?order_id=${purchase.orderId}&token=${walletToken}`);
        if (result.status === 'RECEIVED' && result.sms) {
          setSmsResult(result); setPolling(false); setStep('RECEIVED');
          toast.success('SMS received!');
          fireNotification('SMS Received', `Code: ${result.sms}`);
        } else if (result.status === 'EXPIRED') {
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
          fireNotification('Payment Confirmed', `$${paymentData.usd.toFixed(2)} deposited to wallet`);

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
    // XMR402 doesn't use wallet deposits — fallback to XMR for deposit flow
    const depositMethod = paymentMethod === 'XMR402' ? 'XMR' : paymentMethod;
    try {
      const data = await apiClient<PaymentData>('/v1/tools/sms/payment/create', {
        method: 'POST',
        body: { amount: usdAmount, method: depositMethod, walletToken },
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
      if (data.orderId) {
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

  const handleXmr402Purchase = async () => {
    if (!selectedCountry || !selectedService) return;
    setXmr402Loading(true);
    setXmr402Challenge(null);
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'https://api.kyc.rip';
      const res = await fetch(`${apiBase}/v1/tools/sms/purchase/xmr402`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: selectedCountry, service: selectedService }),
      });

      if (res.status === 402) {
        const wwwAuth = res.headers.get('WWW-Authenticate');
        if (wwwAuth) {
          const challenge = parseWwwAuthenticate(wwwAuth);
          if (challenge) {
            setXmr402Challenge(challenge);
            setShowXmr402Modal(true);
          } else {
            toast.error('Failed to parse XMR402 challenge');
          }
        } else {
          toast.error('No WWW-Authenticate header in 402 response');
        }
      } else {
        toast.error(`Unexpected response: ${res.status}`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'XMR402 request failed');
    } finally {
      setXmr402Loading(false);
    }
  };


  const handleCancel = async () => {
    if (!purchase || !walletToken) return;
    try {
      const data = await apiClient<{ balanceUSD: number }>(`/v1/tools/sms/cancel?order_id=${purchase.orderId}&token=${walletToken}`);
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

  // ─── Rental: load services when tab switches ───
  useEffect(() => {
    if (activeTab !== 'rentals' || rentalServices.length > 0) return;
    setLoadingRentalServices(true);
    apiClient<RentalService[]>('/v1/tools/sms/rentals/services?type=long')
      .then(setRentalServices)
      .catch(() => toast.error('Failed to load rental services'))
      .finally(() => setLoadingRentalServices(false));
  }, [activeTab, rentalServices.length]);

  // ─── Rental: load prices when service selected ───
  useEffect(() => {
    if (!selectedRentalService) { setRentalPrices([]); return; }
    setLoadingRentalPrices(true);
    apiClient<RentalPrice[]>(`/v1/tools/sms/rentals/prices?service=${selectedRentalService}`)
      .then(setRentalPrices)
      .catch(() => { setRentalPrices([]); toast.error('Failed to load rental prices'); })
      .finally(() => setLoadingRentalPrices(false));
  }, [selectedRentalService]);

  // ─── Rental: load active rentals ───
  useEffect(() => {
    if (activeTab !== 'rentals' || !walletToken) return;
    setLoadingActiveRentals(true);
    apiClient<RentalStatus[]>(`/v1/tools/sms/rentals/active?token=${walletToken}`)
      .then(setActiveRentals)
      .catch(() => setActiveRentals([]))
      .finally(() => setLoadingActiveRentals(false));
  }, [activeTab, walletToken]);

  // ─── Rental: poll messages ───
  useEffect(() => {
    if (!pollingRentalMessages || !viewingRentalMessages || !walletToken) return;
    const fetchMessages = async () => {
      try {
        const data = await apiClient<{ messages: RentalMessage[] }>(`/v1/tools/sms/rentals/messages?rental_code=${viewingRentalMessages}&token=${walletToken}`);
        setRentalMessages(data.messages || []);
      } catch { /* keep polling */ }
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [pollingRentalMessages, viewingRentalMessages, walletToken]);

  const handleRentalPurchase = async (serviceId: string, days: number) => {
    if (!walletToken || balanceUSD < (rentalPrices.find(p => p.days === days)?.price || 0)) {
      const needed = rentalPrices.find(p => p.days === days)?.price || 5;
      setDepositAmount(parseFloat(Math.max(needed - balanceUSD, 0.50).toFixed(2)));
      setShowMethodInModal(true); setShowPaymentModal(true);
      return;
    }
    setPurchasingRental(true);
    try {
      const data = await apiClient<RentalOrder>('/v1/tools/sms/rentals/order', {
        method: 'POST', body: { service: serviceId, days, token: walletToken },
      });
      if (data.orderId) {
        toast.success(`Rental started: ${data.phoneNumber}`);
        if (data.balanceUSD !== undefined) setBalanceUSD(data.balanceUSD);
        // Refresh active rentals
        apiClient<RentalStatus[]>(`/v1/tools/sms/rentals/active?token=${walletToken}`)
          .then(setActiveRentals).catch(() => {});
        setSelectedRentalService('');
        setRentalPrices([]);
      }
    } catch { toast.error('Rental purchase failed'); }
    finally { setPurchasingRental(false); }
  };

  const handleRentalCancel = async (rentalCode: string) => {
    if (!walletToken) return;
    try {
      const data = await apiClient<{ balanceUSD?: number }>(`/v1/tools/sms/rentals/cancel?rental_code=${rentalCode}&token=${walletToken}`);
      if (data.balanceUSD !== undefined) setBalanceUSD(data.balanceUSD);
      setActiveRentals(prev => prev.filter(r => r.orderId !== rentalCode));
      toast.success('Rental cancelled');
    } catch { toast.error('Failed to cancel rental'); }
  };

  const handleRentalExtend = async (rentalCode: string, days: number) => {
    if (!walletToken) return;
    setExtendingRental(true);
    try {
      await apiClient('/v1/tools/sms/rentals/extend', {
        method: 'POST', body: { rental_code: rentalCode, days, token: walletToken },
      });
      toast.success(`Extended by ${days} day${days > 1 ? 's' : ''}`);
      setShowExtendModal(null);
      // Refresh active rentals
      apiClient<RentalStatus[]>(`/v1/tools/sms/rentals/active?token=${walletToken}`)
        .then(setActiveRentals).catch(() => {});
    } catch { toast.error('Failed to extend rental'); }
    finally { setExtendingRental(false); }
  };

  const handleRestoreWallet = async () => {
    if (!restoreToken.trim()) return;
    setRestoringWallet(true);
    try {
      const data = await apiClient<{ balanceUSD: number; totalDeposited?: number; totalSpent?: number }>(`/v1/tools/sms/balance?token=${restoreToken.trim()}`);
      setWalletToken(restoreToken.trim());
      setBalanceUSD(data.balanceUSD);
      setWalletStats({ totalDeposited: data.totalDeposited || 0, totalSpent: data.totalSpent || 0 });
      localStorage.setItem(WALLET_KEY, restoreToken.trim());
      setShowRestoreInput(false);
      setRestoreToken('');
      toast.success('Wallet restored!');
    } catch {
      toast.error('Invalid wallet token');
    } finally { setRestoringWallet(false); }
  };

  const truncateToken = (token: string) => {
    if (token.length <= 12) return token;
    return `${token.slice(0, 8)}...${token.slice(-4)}`;
  };

  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  };

  const filteredRentalServices = rentalServices.filter(s =>
    s.name.toLowerCase().includes(rentalServiceSearch.toLowerCase())
  );

  const filteredServices = services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()));
  const filteredCountries = countries
    .filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
    .sort((a, b) => {
      const aS = suggestedCountryIds.has(a.id) ? 0 : 1;
      const bS = suggestedCountryIds.has(b.id) ? 0 : 1;
      return aS - bS;
    });

  const selectedCountryName = countries.find(c => c.id === selectedCountry)?.name || '';
  const selectedServiceName = services.find(s => s.id === selectedService)?.name || '';

  if (loading) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 animate-pulse text-wr-dim">
          <RefreshCw size={32} className="animate-spin mb-4" />
          <p className="text-xs tracking-widest uppercase">{t('sms.loading_services')}</p>
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
              <h2 className="text-lg font-bold tracking-wider text-wr-green mb-2">{t('sms.waiting_for_sms')}</h2>
              <p className="text-wr-dim text-xs">{t('sms.use_number')}</p>
            </div>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-green-400 to-cyan-400 rounded-sm blur opacity-30 group-hover:opacity-50 transition duration-300" />
              <button onClick={() => copyText(purchase.phoneNumber)} className="w-full relative p-5 rounded bg-wr-base border border-wr-border flex items-center justify-between gap-4 hover:border-wr-green transition-colors">
                <span className="font-mono text-2xl font-bold text-wr-green">{purchase.phoneNumber}</span>
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} className="text-wr-dim" />}
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-wr-dim">
              <RefreshCw size={12} className="animate-spin" /> {t('sms.polling')}
            </div>
            <button onClick={notifEnabled ? () => setNotifEnabled(false) : requestNotifPermission}
              className={`flex items-center justify-center gap-2 text-xs transition-colors ${notifEnabled ? 'text-green-400 hover:text-wr-dim' : 'text-wr-dim hover:text-wr-accent'}`}>
              {notifEnabled ? <><Bell size={12} /> {t('sms.push_on')}</> : <><BellOff size={12} /> {t('sms.push_enable')}</>}
            </button>
            <div className="text-[10px] text-wr-dim">{t('sms.charged')}: ${purchase.charged.toFixed(2)} — {t('sms.wallet')}: ${balanceUSD.toFixed(2)}</div>
            <button onClick={handleCancel} className="text-xs font-bold uppercase text-wr-dim hover:text-red-400 transition-colors">
              {t('sms.cancel_refund')}
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
            <h2 className="text-lg font-bold tracking-wider text-wr-green">{t('sms.sms_received')}</h2>
            <button onClick={() => copyText(smsResult.sms || '')} className="w-full p-5 rounded bg-wr-base border border-wr-green flex items-center justify-between gap-4 hover:bg-wr-green/5 transition-colors text-left">
              <div>
                <div className="font-mono text-2xl font-bold text-wr-green mb-1">{smsResult.sms}</div>
                {smsResult.fullSms && <div className="text-xs text-wr-dim">{smsResult.fullSms}</div>}
              </div>
              {copied ? <Check size={18} className="text-green-500 shrink-0" /> : <Copy size={18} className="text-wr-dim shrink-0" />}
            </button>
            <div className="text-xs text-wr-dim">{t('sms.wallet')}: ${balanceUSD.toFixed(2)}</div>
            <button onClick={reset} className="text-xs font-bold uppercase text-wr-accent hover:underline">{t('sms.get_another')}</button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // SELECT state — main config page (Ghost Mail structure)
  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title="SMS Wall — Anonymous phone verification"
        description="Get temporary phone numbers for anonymous SMS verification. 150+ countries, 1700+ services. Pay with XMR."
        path="/sms"
        image="/og-sms.jpg"
        schemas={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'SMS Wall',
            url: 'https://walls.rip/sms',
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Web',
            description: 'Get temporary phone numbers for anonymous SMS verification. 150+ countries, 1700+ services.',
            offers: { '@type': 'Offer', price: '0.10', priceCurrency: 'USD', description: 'Starting price for SMS verification' },
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: 'SMS Wall — Anonymous SMS Verification',
            serviceType: 'SMS Verification',
            areaServed: 'Worldwide',
            description: 'Temporary phone numbers for anonymous SMS verification across 150+ countries and 1700+ services.',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
            offers: { '@type': 'Offer', price: '0.10', priceCurrency: 'USD' },
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
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 border border-green-400/20 mb-4">
              <Phone size={40} />
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mb-2">
              {t('sms.title')} <span className="text-green-400">{t('sms.title_accent')}</span>
            </h1>
            <p className="text-wr-dim text-sm">{t('sms.subtitle')}</p>
          </div>

          {/* ═══ WALLET BANNER ═══ */}
          <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-border rounded-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-green-500/5 group-hover:bg-green-500/10 transition-colors pointer-events-none" />
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />

            <div className="p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-start gap-4 relative z-10">
                <div className="p-3 bg-green-500/10 text-green-400 rounded-full shrink-0 border border-green-400/20">
                  <Wallet size={24} />
                </div>
                <div>
                  <h3 className="text-green-400 font-bold tracking-widest text-sm mb-1 uppercase flex items-center gap-2">
                    {walletToken ? (
                      <>{t('sms.wallet_balance')} <span className="text-[9px] bg-green-500 text-black px-1.5 py-0.5 rounded-xs">${balanceUSD.toFixed(2)}</span></>
                    ) : (
                      <>{t('sms.anonymous_wallet')} <span className="text-[9px] bg-wr-accent text-black px-1.5 py-0.5 rounded-xs">{t('sms.new')}</span></>
                    )}
                  </h3>
                  <p className="text-xs text-wr-dim font-mono leading-relaxed max-w-lg text-left">
                    {walletToken
                      ? t('sms.wallet_has_funds')
                      : t('sms.wallet_no_funds')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowMethodInModal(true); setShowPaymentModal(true); }}
                className="relative z-10 w-full md:w-auto px-6 py-3 bg-green-500 hover:bg-green-400 text-black text-xs font-bold tracking-widest uppercase transition-all rounded-sm flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 hover:-translate-y-0.5"
              >
                <Plus size={14} /> {walletToken ? t('sms.top_up') : t('sms.deposit')} <ChevronRight size={14} />
              </button>
            </div>

            {/* Wallet details panel */}
            {walletToken && (
              <div className="border-t border-wr-border/30 px-4 md:px-6 py-3 relative z-10">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  {/* Token + Copy */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-[10px] text-wr-dim font-mono">
                      <Key size={10} className="text-green-400/60" />
                      <span className="select-none">TOKEN:</span>
                      <span className="text-green-400/80">{truncateToken(walletToken)}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(walletToken); setWalletTokenCopied(true); setTimeout(() => setWalletTokenCopied(false), 2000); }}
                        className="p-1 hover:bg-green-500/10 rounded transition-colors"
                        title="Copy full token"
                      >
                        {walletTokenCopied ? <Check size={10} className="text-green-400" /> : <Copy size={10} className="text-wr-dim hover:text-green-400" />}
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-[10px] font-mono text-wr-dim">
                    <span>{t('sms.deposited')}: <span className="text-green-400">${walletStats.totalDeposited.toFixed(2)}</span></span>
                    <span className="text-wr-border">|</span>
                    <span>{t('sms.spent')}: <span className="text-wr-accent">${walletStats.totalSpent.toFixed(2)}</span></span>
                    <span className="text-wr-border">|</span>
                    <span>{t('sms.balance')}: <span className="text-green-400 font-bold">${balanceUSD.toFixed(2)}</span></span>
                  </div>
                </div>
              </div>
            )}

            {/* Restore wallet */}
            {!walletToken && (
              <div className="border-t border-wr-border/30 px-4 md:px-6 py-3 relative z-10">
                {showRestoreInput ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={restoreToken}
                      onChange={e => setRestoreToken(e.target.value)}
                      placeholder={t('sms.paste_token')}
                      className="flex-1 bg-wr-base border border-wr-border px-3 py-2 text-xs font-mono outline-none focus:border-green-400 rounded-sm text-current placeholder-wr-dim/30"
                      onKeyDown={e => e.key === 'Enter' && handleRestoreWallet()}
                    />
                    <button
                      onClick={handleRestoreWallet}
                      disabled={restoringWallet || !restoreToken.trim()}
                      className="px-4 py-2 bg-green-500/20 border border-green-400/30 text-green-400 text-xs font-bold uppercase tracking-widest hover:bg-green-500/30 transition-colors rounded-sm disabled:opacity-30"
                    >
                      {restoringWallet ? <RefreshCw size={12} className="animate-spin" /> : t('sms.restore')}
                    </button>
                    <button onClick={() => { setShowRestoreInput(false); setRestoreToken(''); }} className="p-2 text-wr-dim hover:text-wr-accent">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRestoreInput(true)}
                    className="text-[10px] text-wr-dim hover:text-green-400 font-mono uppercase tracking-widest transition-colors flex items-center gap-2"
                  >
                    <Key size={10} /> {t('sms.restore_wallet')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ═══ TAB SELECTOR ═══ */}
          <div className="mx-2 md:mx-0 flex border-b border-wr-border">
            <button
              onClick={() => setActiveTab('sms')}
              className={`flex-1 py-3 px-4 text-xs font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2 border-b-2 ${
                activeTab === 'sms'
                  ? 'border-green-400 text-green-400 bg-green-400/5'
                  : 'border-transparent text-wr-dim hover:text-green-400/60 hover:bg-wr-surface/50'
              }`}
            >
              <Phone size={14} /> {t('sms.one_time_sms')}
            </button>
            <button
              onClick={() => setActiveTab('rentals')}
              className={`flex-1 py-3 px-4 text-xs font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2 border-b-2 ${
                activeTab === 'rentals'
                  ? 'border-wr-accent text-wr-accent bg-wr-accent/5'
                  : 'border-transparent text-wr-dim hover:text-wr-accent/60 hover:bg-wr-surface/50'
              }`}
            >
              <Calendar size={14} /> {t('sms.number_rentals_tab')}
            </button>
          </div>

          {/* ═══ ONE-TIME SMS TAB ═══ */}
          {activeTab === 'sms' && (
          <div className="bg-wr-surface border border-wr-border p-4 md:p-10 relative overflow-hidden shadow-2xl mx-2 md:mx-0">
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">

              {/* Country */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                  <Globe size={12} className="text-wr-accent" /> {t('sms.country')}
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                  <input type="text" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} placeholder={t('sms.search_countries')}
                    className="w-full pl-10 pr-3 py-3 md:py-4 bg-wr-base border-2 border-wr-border outline-none font-mono text-base transition-all rounded-sm focus:border-wr-accent text-current placeholder-wr-dim/30" />
                </div>
                {/* Popular countries */}
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_COUNTRIES.map(code => {
                    const country = countries.find(c => c.shortName === code);
                    if (!country) return null;
                    return (
                      <button key={country.id} onClick={() => setSelectedCountry(country.id)} title={country.name}
                        className={`text-xs px-3 py-1.5 rounded-full border font-bold transition-all ${selectedCountry === country.id ? 'border-wr-accent text-wr-accent bg-wr-accent/10' : 'border-wr-border text-wr-dim hover:border-wr-accent/30 hover:text-wr-accent'}`}>
                        {country.shortName}
                      </button>
                    );
                  })}
                </div>
                {/* Separator */}
                <div className="border-t border-wr-border/30" />
                {/* All countries */}
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto content-start p-1">
                  {filteredCountries.map(c => (
                    <button key={c.id} onClick={() => setSelectedCountry(c.id)} title={`${c.name}${suggestedCountryIds.has(c.id) ? ' (recommended)' : ''}`}
                      className={`text-xs px-3 py-1.5 rounded border font-mono transition-all ${selectedCountry === c.id ? 'border-wr-accent text-wr-accent bg-wr-accent/20 font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)]' : suggestedCountryIds.has(c.id) ? 'border-green-400/40 text-green-400 hover:border-green-400 hover:text-green-300' : 'border-wr-border text-current hover:border-wr-accent/40 hover:text-wr-accent'}`}>
                      {c.shortName}{suggestedCountryIds.has(c.id) ? ' ★' : ''}
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
                  <Phone size={12} className="text-green-400" /> {t('sms.service')}
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                  <input type="text" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} placeholder={t('sms.search_services')}
                    className="w-full pl-10 pr-3 py-3 md:py-4 bg-wr-base border-2 border-wr-border outline-none font-mono text-base transition-all rounded-sm focus:border-green-400 text-current placeholder-wr-dim/30" />
                </div>
                {/* Popular services */}
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_SERVICES.map(name => {
                    const svc = services.find(s => s.name.toLowerCase() === name.toLowerCase());
                    if (!svc) return null;
                    return (
                      <button key={svc.id} onClick={() => { setSelectedService(svc.id); setServiceSearch(''); }}
                        className={`text-xs px-3 py-1.5 rounded-full border font-bold transition-all ${selectedService === svc.id ? 'border-green-400 text-green-400 bg-green-400/10' : 'border-wr-border text-wr-dim hover:border-green-400/30 hover:text-green-400'}`}>
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
                    <button key={s.id} onClick={() => { setSelectedService(s.id); setServiceSearch(''); }}
                      className={`text-xs px-3 py-1.5 rounded border font-mono transition-all ${selectedService === s.id ? 'border-green-400 text-green-400 bg-green-400/20 font-bold shadow-[0_0_12px_rgba(74,222,128,0.25)]' : 'border-wr-border text-current hover:border-green-400/40 hover:text-green-400'}`}>
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
                <Zap size={12} className="text-wr-accent" /> {t('sms.payment_protocol')}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => setPaymentMethod('XMR')}
                  className={`py-3 px-3 border flex items-center justify-center gap-2 transition-all rounded-sm ${paymentMethod === 'XMR' ? 'border-wr-green bg-wr-green/10 text-wr-green shadow-[0_0_15px_rgba(0,255,65,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                  <img src="/monero-xmr-logo.png" className="w-4 h-4" alt="XMR" />
                  <span className="text-xs font-bold tracking-widest font-mono uppercase">XMR</span>
                </button>
                <button onClick={() => setPaymentMethod('LN')}
                  className={`py-3 px-3 border flex items-center justify-center gap-2 transition-all rounded-sm ${paymentMethod === 'LN' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                  <Zap size={16} className="fill-current" />
                  <span className="text-xs font-bold tracking-widest font-mono uppercase">LN</span>
                </button>
                <button onClick={() => setPaymentMethod('XMR402')}
                  className={`py-3 px-3 border flex items-center justify-center gap-2 transition-all rounded-sm ${paymentMethod === 'XMR402' ? 'border-wr-error bg-wr-error/10 text-wr-error shadow-[0_0_15px_rgba(248,113,113,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                  <Shield size={16} />
                  <span className="text-xs font-bold tracking-widest font-mono uppercase">402</span>
                </button>
              </div>
              {paymentMethod === 'XMR402' && (
                <div className="mt-2 text-[9px] text-wr-error/70 leading-relaxed">
                  {t('sms.xmr402_hint', 'XMR402: Stateless payment — pay directly from your Monero wallet. No deposit wallet needed.')}
                </div>
              )}
            </div>

            {/* ═══ ACTION BAR ═══ */}
            <div className="pt-6 border-t border-wr-border/30 flex flex-col md:flex-row justify-between items-center gap-6 md:gap-4">
              <div className="text-xs text-wr-dim font-mono uppercase tracking-widest">
                {priceInfo ? (
                  <span>
                    <span className="text-wr-green animate-pulse">●</span>{' '}
                    {selectedServiceName} / {selectedCountryName} — {priceInfo.success_rate}% {t('sms.success_rate')}
                    {stockInfo && stockInfo.count !== undefined && (
                      <span className={stockInfo.available ? 'text-wr-green' : 'text-red-400'}> — {stockInfo.count} {t('sms.in_stock').toLowerCase()}</span>
                    )}
                  </span>
                ) : (
                  <span><span className="text-wr-dim">●</span> {t('sms.select_both')}</span>
                )}
              </div>

              {loadingPrice ? (
                <div className="flex items-center gap-2 text-wr-dim text-xs"><RefreshCw size={14} className="animate-spin" /> {t('sms.checking_price')}</div>
              ) : priceInfo ? (
                <button
                  onClick={paymentMethod === 'XMR402' ? handleXmr402Purchase : handleGetNumber}
                  disabled={!selectedService || creatingPayment || xmr402Loading}
                  className={`w-full md:w-auto group relative px-8 py-4 text-sm font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 overflow-hidden rounded-sm
                    ${creatingPayment || xmr402Loading ? 'bg-wr-surface border border-wr-border text-wr-dim cursor-wait' : paymentMethod === 'XMR402' ? 'bg-wr-error text-white shadow-[0_0_20px_rgba(248,113,113,0.4)]' : paymentMethod === 'XMR' ? 'bg-wr-green text-black shadow-[0_0_20px_rgba(0,255,65,0.4)]' : 'bg-wr-accent text-black shadow-[0_0_20px_rgba(34,211,238,0.4)]'}
                    disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  {creatingPayment || xmr402Loading ? (
                    <><RefreshCw size={16} className="animate-spin" /> {t('sms.generating')}</>
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:animate-[scan_1s_ease-in-out_infinite] skew-x-12" />
                      {paymentMethod === 'XMR402' && <Shield size={16} />}
                      <span>{paymentMethod === 'XMR402' ? t('sms.xmr402_pay', 'PAY VIA XMR402') : t('sms.get_number')}</span>
                      <span className="opacity-40">|</span>
                      <span>${priceInfo.price}</span>
                      <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              ) : (
                <div className="px-8 py-4 bg-wr-surface border border-wr-border text-wr-dim text-sm rounded-sm cursor-not-allowed">
                  {t('sms.select_service_price')}
                </div>
              )}
            </div>

            {stockInfo && !stockInfo.available && (
              <div className="mt-4 flex items-start gap-2 text-xs text-red-400 p-3 rounded bg-red-400/10 border border-red-400/20">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{t('sms.no_numbers_available')}</span>
              </div>
            )}
            {priceInfo && priceInfo.success_rate < 50 && (
              <div className="mt-4 flex items-start gap-2 text-xs text-wr-warning p-3 rounded bg-wr-warning/10 border border-wr-warning/20">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{t('sms.low_success_rate')}</span>
              </div>
            )}
          </div>
          )}

          {/* ═══ RENTALS TAB ═══ */}
          {activeTab === 'rentals' && (
          <div className="space-y-6 mx-2 md:mx-0 animate-in fade-in duration-500">

            {/* ─── Active Rentals ─── */}
            {walletToken && (
            <div className="bg-wr-surface border border-wr-border rounded-sm overflow-hidden shadow-2xl">
              <div className="p-4 md:p-6 border-b border-wr-border/30 flex items-center justify-between">
                <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-wr-accent flex items-center gap-2">
                  <Timer size={14} /> {t('sms.active_rentals')}
                </h3>
                <button
                  onClick={() => {
                    setLoadingActiveRentals(true);
                    apiClient<RentalStatus[]>(`/v1/tools/sms/rentals/active?token=${walletToken}`)
                      .then(setActiveRentals).catch(() => {}).finally(() => setLoadingActiveRentals(false));
                  }}
                  className="text-wr-dim hover:text-wr-accent transition-colors"
                >
                  <RefreshCw size={12} className={loadingActiveRentals ? 'animate-spin' : ''} />
                </button>
              </div>

              {loadingActiveRentals ? (
                <div className="p-8 text-center text-wr-dim text-xs animate-pulse">
                  <RefreshCw size={16} className="animate-spin mx-auto mb-2" /> {t('sms.loading_rental_services')}
                </div>
              ) : activeRentals.length === 0 ? (
                <div className="p-8 text-center text-wr-dim text-xs font-mono">
                  {t('sms.no_active_rentals')}.
                </div>
              ) : (
                <div className="divide-y divide-wr-border/20">
                  {activeRentals.map(rental => (
                    <div key={rental.orderId} className="p-4 md:p-5 hover:bg-wr-surface/50 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-wr-accent/10 text-wr-accent rounded border border-wr-accent/20">
                            <Phone size={16} />
                          </div>
                          <div>
                            <div className="font-mono text-sm font-bold text-wr-accent">{rental.phoneNumber}</div>
                            <div className="text-[10px] text-wr-dim flex items-center gap-2 mt-0.5">
                              <Clock size={8} /> {getTimeRemaining(rental.expiresAt)} remaining
                              {rental.messages.length > 0 && (
                                <span className="text-green-400">
                                  <MessageSquare size={8} className="inline" /> {rental.messages.length} msg{rental.messages.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (viewingRentalMessages === rental.orderId) {
                                setViewingRentalMessages(null);
                                setPollingRentalMessages(false);
                                setRentalMessages([]);
                              } else {
                                setViewingRentalMessages(rental.orderId);
                                setPollingRentalMessages(true);
                              }
                            }}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border rounded-sm transition-all ${
                              viewingRentalMessages === rental.orderId
                                ? 'border-green-400 text-green-400 bg-green-400/10'
                                : 'border-wr-border text-wr-dim hover:border-wr-accent hover:text-wr-accent'
                            }`}
                          >
                            <MessageSquare size={10} className="inline mr-1" /> {t('sms.messages')}
                          </button>
                          <button
                            onClick={() => setShowExtendModal(rental.orderId)}
                            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-wr-border text-wr-dim hover:border-green-400 hover:text-green-400 rounded-sm transition-all"
                          >
                            <Expand size={10} className="inline mr-1" /> {t('sms.extend')}
                          </button>
                          <button
                            onClick={() => handleRentalCancel(rental.orderId)}
                            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-wr-border text-wr-dim hover:border-red-400 hover:text-red-400 rounded-sm transition-all"
                          >
                            <Trash2 size={10} className="inline mr-1" /> {t('sms.cancel_rental')}
                          </button>
                        </div>
                      </div>

                      {/* Messages timeline */}
                      {viewingRentalMessages === rental.orderId && (
                        <div className="mt-4 border-t border-wr-border/20 pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] text-wr-dim uppercase tracking-widest font-bold flex items-center gap-2">
                              <RefreshCw size={8} className={pollingRentalMessages ? 'animate-spin text-green-400' : 'text-wr-dim'} />
                              {t('sms.live_messages')}
                            </span>
                          </div>
                          {rentalMessages.length === 0 ? (
                            <div className="p-4 text-center text-wr-dim text-[10px] font-mono bg-wr-base rounded border border-wr-border/30">
                              {t('sms.waiting_incoming')}
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {rentalMessages.map((msg, i) => (
                                <div key={i} className="p-3 bg-wr-base rounded border border-wr-border/30 group hover:border-green-400/30 transition-colors">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[10px] text-wr-dim mb-1 flex items-center gap-2">
                                        <span className="text-wr-accent font-bold">{msg.sender}</span>
                                        <span className="text-wr-border">|</span>
                                        <span>{new Date(msg.timestamp).toLocaleString()}</span>
                                      </div>
                                      <div className="text-xs text-current font-mono break-all">{msg.message}</div>
                                    </div>
                                    <button
                                      onClick={() => copyText(msg.message)}
                                      className="p-1 text-wr-dim hover:text-green-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Copy size={10} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* ─── Browse Rental Services ─── */}
            <div className="bg-wr-surface border border-wr-border p-4 md:p-10 relative overflow-hidden shadow-2xl rounded-sm">
              <div className="relative z-10 space-y-6">
                <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                  <Calendar size={12} className="text-wr-accent" /> {t('sms.browse_rental_services')}
                </label>

                {/* Search */}
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                  <input
                    type="text"
                    value={rentalServiceSearch}
                    onChange={e => setRentalServiceSearch(e.target.value)}
                    placeholder={t('sms.search_rental')}
                    className="w-full pl-10 pr-3 py-3 md:py-4 bg-wr-base border-2 border-wr-border outline-none font-mono text-base transition-all rounded-sm focus:border-wr-accent text-current placeholder-wr-dim/30"
                  />
                </div>

                {loadingRentalServices ? (
                  <div className="py-8 text-center text-wr-dim text-xs animate-pulse">
                    <RefreshCw size={16} className="animate-spin mx-auto mb-2" /> {t('sms.loading_services')}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto content-start p-1">
                    {filteredRentalServices.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedRentalService(s.id)}
                        className={`text-xs px-3 py-1.5 rounded border font-mono transition-all ${
                          selectedRentalService === s.id
                            ? 'border-wr-accent text-wr-accent bg-wr-accent/20 font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                            : 'border-wr-border text-current hover:border-wr-accent/40 hover:text-wr-accent'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                    {filteredRentalServices.length === 0 && !loadingRentalServices && (
                      <div className="w-full text-center text-wr-dim text-xs py-4 font-mono">{t('sms.no_services_found')}</div>
                    )}
                  </div>
                )}

                {/* Pricing tiers */}
                {selectedRentalService && (
                  <div className="space-y-4 pt-4 border-t border-wr-border/30">
                    <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                      <Zap size={12} className="text-green-400" /> {t('sms.select_duration')}
                    </label>

                    {loadingRentalPrices ? (
                      <div className="py-6 text-center text-wr-dim text-xs animate-pulse">
                        <RefreshCw size={14} className="animate-spin mx-auto mb-2" /> {t('sms.loading_prices')}
                      </div>
                    ) : rentalPrices.length === 0 ? (
                      <div className="py-6 text-center text-wr-dim text-xs font-mono">{t('sms.no_pricing')}</div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {rentalPrices.map((tier, i) => (
                          <button
                            key={i}
                            onClick={() => handleRentalPurchase(selectedRentalService, tier.days)}
                            disabled={purchasingRental}
                            className="relative p-4 md:p-5 border-2 border-wr-border bg-wr-surface/50 hover:border-wr-accent hover:bg-wr-accent/5 cursor-pointer transition-all duration-300 group overflow-hidden rounded-sm disabled:opacity-30 disabled:cursor-wait text-center"
                          >
                            <div className="text-2xl font-bold font-mono text-wr-accent mb-1">
                              {tier.days}d
                            </div>
                            <div className="text-[10px] text-wr-dim uppercase tracking-widest mb-3">
                              {tier.days === 1 ? '1 Day' : `${tier.days} Days`}
                            </div>
                            <div className="text-sm font-bold font-mono text-green-400">
                              ${tier.price.toFixed(2)}
                            </div>
                            <div className="absolute inset-0 bg-wr-accent/5 translate-x-[-100%] group-hover:animate-[scan_1s_ease-in-out_infinite] skew-x-12 pointer-events-none" />
                          </button>
                        ))}
                      </div>
                    )}

                    {purchasingRental && (
                      <div className="flex items-center justify-center gap-2 text-xs text-wr-accent">
                        <RefreshCw size={12} className="animate-spin" /> {t('sms.processing_rental')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Rental info cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
              {[
                { title: t('sms.rental_info_longterm_title'), desc: t('sms.rental_info_longterm_desc') },
                { title: t('sms.rental_info_live_title'), desc: t('sms.rental_info_live_desc') },
                { title: t('sms.rental_info_extend_title'), desc: t('sms.rental_info_extend_desc') },
              ].map(item => (
                <div key={item.title} className="p-4 rounded-sm border border-wr-border/50 bg-wr-surface/30">
                  <h4 className="text-[10px] font-bold uppercase text-wr-accent mb-1">{item.title}</h4>
                  <p className="text-[10px] text-wr-dim">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* ═══ INFO CARDS (One-Time SMS) ═══ */}
          {activeTab === 'sms' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center mx-2 md:mx-0">
            {[
              { title: t('sms.info_pay_title'), desc: t('sms.info_pay_desc') },
              { title: t('sms.info_refund_title'), desc: t('sms.info_refund_desc') },
              { title: t('sms.info_services_title'), desc: t('sms.info_services_desc') },
            ].map(item => (
              <div key={item.title} className="p-4 rounded-sm border border-wr-border/50 bg-wr-surface/30">
                <h4 className="text-[10px] font-bold uppercase text-wr-accent mb-1">{item.title}</h4>
                <p className="text-[10px] text-wr-dim">{item.desc}</p>
              </div>
            ))}
          </div>
          )}
        </div>
      </main>
      <Footer />

      {/* ═══ EXTEND RENTAL MODAL ═══ */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-wr-base/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
          <div className="border border-wr-accent bg-wr-base p-0 max-w-sm w-full relative shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden rounded-sm">
            <button onClick={() => setShowExtendModal(null)} className="absolute top-4 right-4 text-wr-dim hover:text-wr-accent z-10"><X size={20} /></button>

            <div className="p-3 md:p-4 border-b bg-wr-accent/10 border-wr-accent/30 text-wr-accent flex items-center gap-2">
              <Calendar size={14} />
              <span className="text-xs font-bold tracking-widest uppercase">{t('sms.extend_rental')}</span>
            </div>

            <div className="p-4 md:p-6 space-y-4">
              <p className="text-xs text-wr-dim font-mono text-center">{t('sms.add_more_days')}</p>
              <div className="grid grid-cols-3 gap-3">
                {[1, 7, 30].map(days => (
                  <button
                    key={days}
                    onClick={() => handleRentalExtend(showExtendModal, days)}
                    disabled={extendingRental}
                    className="py-4 border-2 border-wr-border hover:border-wr-accent bg-wr-surface/50 hover:bg-wr-accent/5 rounded-sm transition-all text-center disabled:opacity-30 disabled:cursor-wait"
                  >
                    <div className="text-xl font-bold font-mono text-wr-accent">{days}d</div>
                    <div className="text-[9px] text-wr-dim uppercase tracking-widest mt-1">
                      {days === 1 ? '1 Day' : `${days} Days`}
                    </div>
                  </button>
                ))}
              </div>
              {extendingRental && (
                <div className="flex items-center justify-center gap-2 text-xs text-wr-accent">
                  <RefreshCw size={12} className="animate-spin" /> {t('sms.extending')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PAYMENT MODAL ═══ */}
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
                    <div className="text-[10px] text-wr-green/60">
                      {t('sms.auto_purchase', { service: selectedServiceName, country: selectedCountryName })}
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

                  {/* Payment method — only shown when opened from banner */}
                  {showMethodInModal && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-wr-dim uppercase tracking-widest">{t('sms.payment_method')}</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setPaymentMethod('XMR')}
                          className={`py-3 px-4 border flex items-center justify-center gap-2 transition-all rounded-sm ${paymentMethod === 'XMR' ? 'border-wr-green bg-wr-green/10 text-wr-green shadow-[0_0_15px_rgba(0,255,65,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                          <img src="/monero-xmr-logo.png" className="w-4 h-4" alt="XMR" />
                          <span className="text-xs font-bold tracking-widest font-mono uppercase">XMR</span>
                        </button>
                        <button onClick={() => setPaymentMethod('LN')}
                          className={`py-3 px-4 border flex items-center justify-center gap-2 transition-all rounded-sm ${paymentMethod === 'LN' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                          <Zap size={16} className="fill-current" />
                          <span className="text-xs font-bold tracking-widest font-mono uppercase">LN</span>
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
