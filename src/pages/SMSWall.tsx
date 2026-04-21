import { useState, useEffect, useMemo, useCallback } from 'react';
import { Phone, Globe, Search, Copy, Check, RefreshCw, Clock, AlertTriangle, ChevronRight, ChevronDown, Wallet, Zap, X, Plus, Bell, BellOff, Key, MessageSquare, Calendar, Timer, Trash2, Expand, Shield, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';
import { PaymentGate } from '../components/PaymentGate';

interface CountryRaw { id: string; name: string; shortName: string; engine: string }
interface UnifiedService { id: string; name: string; category?: string; engines: string[] } // id = canonical slug (from alias map) or lowercase name
interface Country { id: string; name: string; shortName: string; engines: string[] } // id = ISO (shortName), dedupped
interface Service { id: string; name: string; category?: string; engines: string[] }
interface PriceInfo { price: string; cost_price: string; success_rate: number; engine: string; pool?: string }
interface PoolOption { pool: string; poolName: string; price: number; costPrice: number; successRate: number }
interface CompareResult {
  engine: string; // e.g. "fivesim", "smspool"
  countryId: string; // engine-specific ID
  serviceId: string; // engine-specific ID
  price: number;
  costPrice: number;
  successRate: number;
  pool?: string;
  available: boolean;
  stock: number;
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

const WALLET_KEY = 'walls_sms_wallet';

const POPULAR_COUNTRIES = ['US', 'GB', 'NL', 'DE', 'FR', 'SE', 'PH', 'IN', 'MX'];

const POPULAR_SERVICES = [
  'Telegram', 'Discord', 'Google', 'WhatsApp', 'Twitter',
  'Instagram', 'Facebook', 'Steam', 'Microsoft', 'Amazon',
];

interface StockInfo { available: boolean; count?: number }

// XMR402 return proof from URL
interface Xmr402ReturnProof {
  txid: string;
  proof: string;
  country: string;
  service: string;
}

function extractXmr402ReturnParams(): Xmr402ReturnProof | null {
  const params = new URLSearchParams(window.location.search);
  const txid = params.get('xmr402_txid');
  const proof = params.get('xmr402_proof');
  const country = params.get('xmr402_country');
  const service = params.get('xmr402_service');
  if (txid && proof && country && service) {
    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete('xmr402_txid');
    url.searchParams.delete('xmr402_proof');
    url.searchParams.delete('xmr402_country');
    url.searchParams.delete('xmr402_service');
    window.history.replaceState({}, '', url.toString());
    return { txid, proof, country, service };
  }
  return null;
}

function getSmsInitialParams(): { country: string; service: string; order: string } {
  const params = new URLSearchParams(window.location.search);
  const c = params.get('c') || '';
  const s = params.get('s') || '';
  // Legacy: if numeric (old smspool IDs), default to US. User can switch.
  const country = /^\d+$/.test(c) ? 'US' : (c.toUpperCase() || 'US');
  return { country, service: s.toLowerCase(), order: params.get('id') || '' };
}

function updateSmsUrlParams(country: string, service: string) {
  // Don't overwrite order URL
  if (new URLSearchParams(window.location.search).has('id')) return;
  const params = new URLSearchParams(window.location.search);
  // Preserve XMR402 params if present
  const preserve = ['xmr402_txid', 'xmr402_proof', 'xmr402_country', 'xmr402_service'];
  const kept = new URLSearchParams();
  for (const key of preserve) { const v = params.get(key); if (v) kept.set(key, v); }
  if (country && country !== '1') kept.set('c', country);
  if (service) kept.set('s', service);
  const qs = kept.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? '?' + qs : ''}`);
}

export function SMSWall() {
  const { t } = useTranslation();
  const smsInitial = useMemo(getSmsInitialParams, []);
  const [countries, setCountries] = useState<Country[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCountry, _setSelectedCountry] = useState<string>(smsInitial.country);
  const [selectedService, _setSelectedService] = useState<string>(smsInitial.service);

  const setSelectedCountry = useCallback((c: string) => {
    _setSelectedCountry(c);
    updateSmsUrlParams(c, selectedService);
  }, [selectedService]);
  const setSelectedService = useCallback((s: string) => {
    _setSelectedService(s);
    updateSmsUrlParams(selectedCountry, s);
  }, [selectedCountry]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [poolOptions, setPoolOptions] = useState<PoolOption[]>([]);
  const [compareResults, setCompareResults] = useState<CompareResult[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>(''); // "engine:pool" key for chosen provider
  const [selectedPool, setSelectedPool] = useState<string>('');
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [suggestedCountryIds, setSuggestedCountryIds] = useState<Set<string>>(new Set());

  // Wallet
  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState<number>(0);

  // Payment
  const [depositAmount, setDepositAmount] = useState<number>(3);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // XMR402 return flow: detect proof params from URL on mount
  const [xmr402ReturnProof] = useState<Xmr402ReturnProof | null>(() => extractXmr402ReturnParams());
  const [xmr402Verifying, setXmr402Verifying] = useState(false);
  const [, setXmr402PurchaseResult] = useState<PurchaseResult | null>(null);

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
  const [walletExpiresAt, setWalletExpiresAt] = useState<number | null>(null);
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
  const [purchasing, setPurchasing] = useState(false);
  const [purchasingRental, setPurchasingRental] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState<string | null>(null); // orderId
  const [extendingRental, setExtendingRental] = useState(false);

  // FAQ accordion
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

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

  // Load data — server-side dedupe for services (via alias map), client-side dedupe for countries (ISO)
  useEffect(() => {
    Promise.all([
      apiClient<CountryRaw[]>('/v1/tools/sms/countries'),
      apiClient<UnifiedService[]>('/v1/tools/sms/services/unified'),
    ]).then(([cRaw, unifiedServices]) => {
      // Dedupe countries by shortName (ISO)
      const countryMap = new Map<string, Country>();
      for (const c of cRaw) {
        const iso = (c.shortName || '').toUpperCase();
        if (!iso) continue;
        const existing = countryMap.get(iso);
        if (existing) {
          if (!existing.engines.includes(c.engine)) existing.engines.push(c.engine);
        } else {
          countryMap.set(iso, { id: iso, name: c.name, shortName: iso, engines: [c.engine] });
        }
      }
      setCountries(Array.from(countryMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
      setServices(unifiedServices || []);
    })
      .catch(() => toast.error('Failed to load SMS data'))
      .finally(() => setLoading(false));
  }, []);

  // XMR402 return flow: handle callback result or legacy proof
  useEffect(() => {
    // New flow: callback already handled verification+deposit, check for xmr402_done
    const urlParams = new URLSearchParams(window.location.search);
    const xmr402Done = urlParams.get('xmr402_done');
    if (xmr402Done === 'true') {
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('xmr402_done');
      url.searchParams.delete('xmr402_ref');
      window.history.replaceState({}, '', url.toString());
      toast.success('XMR402 payment verified — wallet topped up!');
      // Refresh wallet balance
      if (walletToken) {
        const apiBase = import.meta.env.VITE_API_URL || 'https://api.kyc.rip';
        fetch(`${apiBase}/v1/tools/sms/wallet?token=${walletToken}`)
          .then(r => r.json())
          .then((w: any) => {
            if (w.balanceUSD !== undefined) setBalanceUSD(w.balanceUSD);
          })
          .catch(() => {});
      }
      return;
    }

    // Legacy flow: proof in URL params (same-browser)
    if (!xmr402ReturnProof) return;
    const { txid, proof, country, service } = xmr402ReturnProof;

    setXmr402Verifying(true);
    const apiBase = import.meta.env.VITE_API_URL || 'https://api.kyc.rip';
    fetch(`${apiBase}/v1/tools/sms/purchase/xmr402`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `XMR402 txid="${txid}", proof="${proof}"`,
      },
      body: JSON.stringify({ country, service }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'VERIFICATION_FAILED' })) as { error?: string };
          toast.error(errData.error || 'XMR402 payment verification failed');
          return;
        }
        const data = await res.json() as PurchaseResult;
        if (data.orderId && data.phoneNumber) {
          setXmr402PurchaseResult(data);
          setPurchase(data);
          setPolling(true);
          setStep('WAITING');
          toast.success('XMR402 payment verified — number purchased!');
          fireNotification('XMR402 Payment Verified', `Phone: ${data.phoneNumber}`);
        } else {
          toast.error('Unexpected response from XMR402 verification');
        }
      })
      .catch((e: Error) => {
        console.error('[XMR402 SMS Return]', e);
        toast.error(e.message || 'XMR402 verification failed');
      })
      .finally(() => setXmr402Verifying(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check wallet balance + stats
  useEffect(() => {
    if (!walletToken) return;
    apiClient<{ balanceUSD: number; totalDeposited?: number; totalSpent?: number; expiresAt?: number }>(`/v1/tools/sms/balance?token=${walletToken}`)
      .then(data => {
        setBalanceUSD(data.balanceUSD);
        setWalletStats({ totalDeposited: data.totalDeposited || 0, totalSpent: data.totalSpent || 0 });
        setWalletExpiresAt(data.expiresAt ?? null);
      })
      .catch(() => { localStorage.removeItem(WALLET_KEY); setWalletToken(null); setBalanceUSD(0); setWalletExpiresAt(null); });
  }, [walletToken]);

  // ─── Restore order from ?order= URL param ───
  useEffect(() => {
    if (!smsInitial.order) return;
    const token = walletToken || localStorage.getItem(WALLET_KEY);
    if (!token) return;
    const orderId = smsInitial.order;

    // Restore into WAITING state and start polling
    setPurchase({ orderId, phoneNumber: '', country: '', service: '', costPrice: 0, engine: orderId.split(':')[0] || '', createdAt: 0, balanceUSD: 0, charged: 0 });
    setStep('WAITING'); setPolling(true); setLoading(false);

    // Check immediately
    apiClient<SMSCheckResult>(`/v1/tools/sms/check?order_id=${encodeURIComponent(orderId)}&token=${token}`)
      .then(result => {
        if (result.status === 'RECEIVED' && result.sms) {
          setSmsResult(result); setPolling(false); setStep('RECEIVED');
        }
      })
      .catch(() => {});
  }, []);

  // Fetch compare results (all engines) + SMSPool pools when country+service selected
  useEffect(() => {
    if (!selectedCountry || !selectedService) {
      setPriceInfo(null); setStockInfo(null); setPoolOptions([]); setCompareResults([]);
      setSelectedPool(''); setSelectedProvider(''); return;
    }
    setLoadingPrice(true);
    apiClient<{ results: CompareResult[] }>(`/v1/tools/sms/compare?country=${selectedCountry}&service=${selectedService}`)
      .then(async ({ results }) => {
        setCompareResults(results || []);
        if (!results || results.length === 0) {
          setPriceInfo(null); setStockInfo(null); setPoolOptions([]); setSelectedProvider('');
          return;
        }
        // Default to the top-ranked result (cheapest/highest success)
        const top = results[0];
        setSelectedProvider(top.engine);
        setPriceInfo({
          price: top.price.toFixed(2),
          cost_price: top.costPrice.toFixed(2),
          success_rate: top.successRate,
          engine: top.engine,
        });
        setStockInfo({ available: top.available, count: top.stock });

        // Fetch pool/operator variants — leave selectedPool empty (Auto/cheapest tier)
        try {
          const pools = await apiClient<PoolOption[]>(
            `/v1/tools/sms/pools?country=${top.countryId}&service=${top.serviceId}&engine=${top.engine}`
          );
          setPoolOptions(pools || []);
          setSelectedPool('');
        } catch {
          setPoolOptions([]);
          setSelectedPool('');
        }
      })
      .catch(() => {
        setPriceInfo(null); setStockInfo(null); setPoolOptions([]); setCompareResults([]);
        toast.error('Service not available');
      })
      .finally(() => setLoadingPrice(false));
  }, [selectedCountry, selectedService]);

  // Fetch suggested countries when service changes — map to ISO codes
  useEffect(() => {
    if (!selectedService) { setSuggestedCountryIds(new Set()); return; }
    apiClient<CountryRaw[]>(`/v1/tools/sms/suggested?service=${selectedService}`)
      .then(data => setSuggestedCountryIds(new Set(data.map(c => (c.shortName || '').toUpperCase()))))
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

  const executePurchase = async (
    countryId: string, serviceId: string, token: string,
    engine: string, pool?: string
  ) => {
    try {
      const data = await apiClient<PurchaseResult>('/v1/tools/sms/purchase', {
        method: 'POST',
        body: { country: countryId, service: serviceId, token, pool, engine },
      });
      if (data.orderId) {
        setPurchase(data); setBalanceUSD(data.balanceUSD); setPolling(true); setStep('WAITING');
        const rawId = data.orderId.includes(':') ? data.orderId.split(':').slice(1).join(':') : data.orderId;
        window.history.replaceState(null, '', `${window.location.pathname}?id=${rawId}`);
      } else {
        toast.error('Failed to get number');
      }
    } catch { toast.error('Purchase failed'); }
  };

  const handleGetNumber = async () => {
    if (!priceInfo || !selectedCountry || !selectedService || purchasing) return;
    const provider = compareResults.find(r => r.engine === selectedProvider) || compareResults[0];
    if (!provider) return;
    // Use the currently displayed price (reflects pool selection: auto or specific operator)
    const price = parseFloat(priceInfo.price);

    if (walletToken && balanceUSD >= price) {
      // Enough balance — purchase directly using engine-specific IDs
      setPurchasing(true);
      try {
        await executePurchase(
          provider.countryId, provider.serviceId, walletToken,
          provider.engine,
          // selectedPool='' means auto/any — send undefined so backend uses cheapest tier
          selectedPool || undefined
        );
      } finally {
        setPurchasing(false);
      }
      return;
    } else {
      // Need deposit first — open PaymentGate modal
      const needed = walletToken ? price - balanceUSD : price;
      const depositAmt = Math.max(needed, 0.50);
      setDepositAmount(parseFloat(depositAmt.toFixed(2)));
      setShowPaymentModal(true);
    }
  };


  const handleCancel = async () => {
    if (!purchase || !walletToken) return;
    try {
      const data = await apiClient<{ balanceUSD: number }>(`/v1/tools/sms/cancel?order_id=${purchase.orderId}&token=${walletToken}`);
      setBalanceUSD(data.balanceUSD); setPurchase(null); setPolling(false); setStep('SELECT');
      window.history.replaceState(null, '', window.location.pathname);
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
    window.history.replaceState(null, '', window.location.pathname);
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
      setShowPaymentModal(true);
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
    .filter(c => {
      const q = countrySearch.toLowerCase().trim();
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.shortName.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aS = suggestedCountryIds.has(a.id) ? 0 : 1;
      const bS = suggestedCountryIds.has(b.id) ? 0 : 1;
      return aS - bS;
    });

  const selectedCountryName = countries.find(c => c.id === selectedCountry)?.name || '';
  const selectedServiceName = services.find(s => s.id === selectedService)?.name || '';

  if (loading || xmr402Verifying) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 animate-pulse text-wr-dim">
          <RefreshCw size={32} className="animate-spin mb-4" />
          <p className="text-xs tracking-widest uppercase">
            {xmr402Verifying ? t('sms.xmr402_verifying', 'VERIFYING XMR402 PAYMENT PROOF...') : t('sms.loading_services')}
          </p>
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
            <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-dim hover:text-wr-accent hover:underline text-[10px] transition-colors">
              Need help? @kyc_rip_bot
            </a>
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
            description: 'Get temporary phone numbers for anonymous SMS verification. 150+ countries, 1700+ services. Pay with XMR, Lightning, USDT, or XMR402.',
            offers: { '@type': 'Offer', price: '0.10', priceCurrency: 'USD', description: 'Starting price for SMS verification' },
            featureList: '150+ countries, 1700+ services, Auto-refund, XMR/Lightning/USDT/XMR402 payments',
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
                onClick={() => { setShowPaymentModal(true); }}
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
                  <div className="flex items-center gap-4 text-[10px] font-mono text-wr-dim flex-wrap">
                    <span>{t('sms.deposited')}: <span className="text-green-400">${walletStats.totalDeposited.toFixed(2)}</span></span>
                    <span className="text-wr-border">|</span>
                    <span>{t('sms.spent')}: <span className="text-wr-accent">${walletStats.totalSpent.toFixed(2)}</span></span>
                    <span className="text-wr-border">|</span>
                    <span>{t('sms.balance')}: <span className="text-green-400 font-bold">${balanceUSD.toFixed(2)}</span></span>
                    {walletExpiresAt && (() => {
                      const daysLeft = Math.max(0, Math.floor((walletExpiresAt - Date.now()) / 86400000));
                      const color = daysLeft <= 7 ? 'text-red-400' : daysLeft <= 14 ? 'text-yellow-400' : 'text-wr-dim';
                      return (
                        <>
                          <span className="text-wr-border">|</span>
                          <span className={color} title="Wallet auto-renews each visit. Resets to 90 days whenever you open this page.">
                            wallet expires in {daysLeft}d
                          </span>
                        </>
                      );
                    })()}
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

            {/* ═══ PROVIDER SELECTION (top-level: engine comparison) ═══ */}
            {compareResults.length > 1 && priceInfo && (
              <div className="pt-6 border-t border-wr-border/30">
                <div className="text-[10px] text-wr-dim font-mono uppercase tracking-widest mb-2">{t('sms.select_route', 'Select Route')}</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {compareResults.map((r, idx) => {
                    const isSelected = selectedProvider === r.engine;
                    return (
                      <button
                        key={r.engine}
                        onClick={async () => {
                          setSelectedProvider(r.engine);
                          setPriceInfo({
                            price: r.price.toFixed(2),
                            cost_price: r.costPrice.toFixed(2),
                            success_rate: r.successRate,
                            engine: r.engine,
                            pool: r.pool,
                          });
                          setStockInfo({ available: r.available, count: r.stock });
                          // Refetch pools/operators for the newly selected engine.
                          // Do NOT auto-select a specific pool — leave empty so "any" (cheapest) is the default.
                          // User can optionally upgrade by clicking a specific pool card.
                          try {
                            const pools = await apiClient<PoolOption[]>(
                              `/v1/tools/sms/pools?country=${r.countryId}&service=${r.serviceId}&engine=${r.engine}`
                            );
                            setPoolOptions(pools || []);
                            setSelectedPool('');
                          } catch {
                            setPoolOptions([]);
                            setSelectedPool('');
                          }
                        }}
                        className={`py-3 px-3 rounded-sm border text-xs font-mono transition-all text-left ${
                          isSelected
                            ? 'border-wr-green bg-wr-green/10 text-wr-green'
                            : 'border-wr-border text-wr-dim hover:border-wr-dim'
                        }`}
                      >
                        <div className="font-bold text-sm">${r.price.toFixed(2)}</div>
                        <div className="text-[10px] opacity-60 mt-0.5">
                          {t('sms.route', 'Route')} {String.fromCharCode(65 + idx)}
                          {r.stock > 0 ? ` · ${r.stock.toLocaleString()}` : ''}
                          {r.successRate > 0 ? ` · ${r.successRate}%` : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ═══ Sub-route variants (pools for smspool, operators for 5sim) ═══ */}
            {poolOptions.length > 0 && priceInfo && (
              <div className={compareResults.length > 1 ? 'mt-3' : 'pt-6 border-t border-wr-border/30'}>
                <div className="text-[10px] text-wr-dim font-mono uppercase tracking-widest mb-2">{t('sms.select_pool', 'Sub-Route')}</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {/* "Auto" card — shows when the route's default tier is cheaper than any specific pool */}
                  {(() => {
                    const route = compareResults.find(r => r.engine === selectedProvider);
                    if (!route) return null;
                    const cheapestPoolPrice = Math.min(...poolOptions.map(p => p.price));
                    // Only show Auto if it's meaningfully cheaper (avoids showing a duplicate of Pool A)
                    if (route.price >= cheapestPoolPrice - 0.01) return null;
                    const isAutoSelected = selectedPool === '';
                    return (
                      <button
                        key="__auto__"
                        onClick={() => {
                          setSelectedPool('');
                          setPriceInfo({
                            price: route.price.toFixed(2),
                            cost_price: route.costPrice.toFixed(2),
                            success_rate: route.successRate,
                            engine: route.engine,
                          });
                        }}
                        className={`py-3 px-3 rounded-sm border text-xs font-mono transition-all text-left ${
                          isAutoSelected
                            ? 'border-wr-green bg-wr-green/10 text-wr-green'
                            : 'border-wr-border text-wr-dim hover:border-wr-dim'
                        }`}
                      >
                        <div className="font-bold text-sm">${route.price.toFixed(2)}</div>
                        <div className="text-[10px] opacity-60 mt-0.5">
                          {t('sms.auto', 'Auto')}
                          {route.stock > 0 ? ` · ${route.stock.toLocaleString()}` : ''}
                        </div>
                      </button>
                    );
                  })()}
                  {poolOptions.map((p, idx) => {
                    const isSelected = selectedPool === p.pool;
                    return (
                      <button
                        key={p.pool}
                        onClick={() => {
                          setSelectedPool(p.pool);
                          setPriceInfo({ ...priceInfo, price: p.price.toFixed(2), cost_price: p.costPrice.toFixed(2), pool: p.pool, success_rate: p.successRate });
                        }}
                        className={`py-3 px-3 rounded-sm border text-xs font-mono transition-all text-left ${
                          isSelected
                            ? 'border-wr-green bg-wr-green/10 text-wr-green'
                            : 'border-wr-border text-wr-dim hover:border-wr-dim'
                        }`}
                      >
                        <div className="font-bold text-sm">${p.price.toFixed(2)}</div>
                        <div className="text-[10px] opacity-60 mt-0.5">
                          {t('sms.pool', 'Pool')} {String.fromCharCode(65 + idx)}
                          {p.successRate > 0 ? ` · ${p.successRate}%` : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!selectedPool && (
                  <p className="text-[10px] text-wr-dim/60 mt-2">{t('sms.auto_price_note', 'Auto selects the cheapest available number. Actual price may vary from estimate.')}</p>
                )}
              </div>
            )}

            {/* ═══ ACTION BAR ═══ */}
            <div className="pt-6 border-t border-wr-border/30 flex flex-col md:flex-row justify-between items-center gap-6 md:gap-4">
              <div className="text-xs text-wr-dim font-mono uppercase tracking-widest">
                {priceInfo ? (
                  <span>
                    <span className="text-wr-green animate-pulse">●</span>{' '}
                    {selectedServiceName} / {selectedCountryName}{priceInfo.success_rate > 0 && (<> — <span
                      key={`rate-${selectedPool}-${priceInfo.success_rate}`}
                      className="inline-block animate-[flash_0.6s_ease-out]"
                      style={{ color: priceInfo.success_rate >= 70 ? '#00ff41' : priceInfo.success_rate >= 40 ? '#f59e0b' : '#ef4444' }}
                    >{priceInfo.success_rate}%</span> {t('sms.success_rate')}</>)}
                    {stockInfo && stockInfo.count !== undefined && (
                      <span className={stockInfo.available ? 'text-wr-green' : 'text-red-400'}> — {stockInfo.count.toLocaleString()} {t('sms.in_stock').toLowerCase()}</span>
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
                  onClick={handleGetNumber}
                  disabled={!selectedService || purchasing || (stockInfo !== null && !stockInfo.available)}
                  className="w-full md:w-auto group relative px-8 py-4 text-sm font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 overflow-hidden rounded-sm bg-wr-green text-black shadow-[0_0_20px_rgba(0,255,65,0.4)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:animate-[scan_1s_ease-in-out_infinite] skew-x-12" />
                  {purchasing ? (
                    <><RefreshCw size={16} className="animate-spin" /> <span>{t('sms.purchasing', 'PURCHASING...')}</span></>
                  ) : (
                    <><span>{t('sms.get_number')}</span><span className="opacity-40">|</span><span>${priceInfo.price}</span><ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" /></>
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
            {priceInfo && priceInfo.success_rate > 0 && priceInfo.success_rate < 50 && (
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

          {/* ═══ WHY CHOOSE SMS WALL ═══ */}
          <div className="mx-2 md:mx-0 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-mono text-sm md:text-base font-bold uppercase tracking-widest text-current">
                {t('sms.why_title')}
              </h2>
              <div className="mx-auto w-12 h-px bg-wr-accent" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {([
                { icon: <Shield size={18} />, title: t('sms.why_anonymous_title'), desc: t('sms.why_anonymous_desc') },
                { icon: <Globe size={18} />, title: t('sms.why_global_title'), desc: t('sms.why_global_desc') },
                { icon: <Zap size={18} />, title: t('sms.why_instant_title'), desc: t('sms.why_instant_desc') },
                { icon: <Wallet size={18} />, title: t('sms.why_crypto_title'), desc: t('sms.why_crypto_desc') },
                { icon: <RefreshCw size={18} />, title: t('sms.why_refund_title'), desc: t('sms.why_refund_desc') },
                { icon: <Layers size={18} />, title: t('sms.why_providers_title'), desc: t('sms.why_providers_desc') },
              ]).map((card) => (
                <div key={card.title} className="p-4 rounded-sm border border-wr-border bg-wr-surface space-y-2 hover:border-wr-accent/30 transition-colors">
                  <div className="text-wr-accent">{card.icon}</div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-current">{card.title}</h3>
                  <p className="text-xs text-wr-dim leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ HOW IT WORKS ═══ */}
          <div className="mx-2 md:mx-0 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-mono text-sm md:text-base font-bold uppercase tracking-widest text-current">
                {t('sms.how_title')}
              </h2>
              <div className="mx-auto w-12 h-px bg-wr-accent" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-0 relative">
              {/* Connector lines (desktop only) */}
              <div className="hidden md:block absolute top-8 left-[calc(33.33%+0.5rem)] right-[calc(33.33%+0.5rem)] h-px bg-wr-accent/30" />
              {([
                { num: '01', icon: <Search size={20} />, title: t('sms.how_step1_title'), desc: t('sms.how_step1_desc') },
                { num: '02', icon: <Wallet size={20} />, title: t('sms.how_step2_title'), desc: t('sms.how_step2_desc') },
                { num: '03', icon: <MessageSquare size={20} />, title: t('sms.how_step3_title'), desc: t('sms.how_step3_desc') },
              ]).map((step, i) => (
                <div key={step.num} className="flex flex-col items-center text-center space-y-3 relative px-4">
                  <div className="relative z-10 w-16 h-16 rounded-full bg-wr-accent/10 border border-wr-accent/30 flex items-center justify-center text-wr-accent">
                    {step.icon}
                  </div>
                  <div className="text-xs text-wr-accent font-mono font-bold tracking-widest">{step.num}</div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-current">{step.title}</h3>
                  <p className="text-xs text-wr-dim leading-relaxed max-w-xs">{step.desc}</p>
                  {/* Vertical connector for mobile */}
                  {i < 2 && <div className="md:hidden w-px h-6 bg-wr-accent/30" />}
                </div>
              ))}
            </div>
          </div>

          {/* ═══ FAQ ACCORDION ═══ */}
          <div className="mx-2 md:mx-0 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-mono text-sm md:text-base font-bold uppercase tracking-widest text-current">
                {t('sms.faq_title')}
              </h2>
              <div className="mx-auto w-12 h-px bg-wr-accent" />
            </div>
            <div className="space-y-2">
              {([1, 2, 3, 4, 5, 6] as const).map((n) => {
                const isOpen = faqOpen === n;
                return (
                  <div key={n} className="border border-wr-border rounded-sm bg-wr-surface overflow-hidden">
                    <button
                      onClick={() => setFaqOpen(isOpen ? null : n)}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-wr-base/50 transition-colors"
                    >
                      <span className="text-xs font-bold text-current pr-4">{t(`sms.faq_q${n}`)}</span>
                      <ChevronDown
                        size={16}
                        className={`text-wr-accent shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-60' : 'max-h-0'}`}
                    >
                      <div className="px-4 pb-4 text-xs text-wr-dim leading-relaxed border-t border-wr-border/30 pt-3">
                        {t(`sms.faq_a${n}`)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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

      {/* ═══ PAYMENT GATE ═══ */}
      <PaymentGate
        amount={depositAmount}
        methods={['XMR', 'LN', 'XMR402', 'USDT']}
        walletToken={walletToken || undefined}
        serviceName="sms"
        showPresets={true}
        presets={[3, 5, 10, 20]}
        isOpen={showPaymentModal}
        onClose={() => { setShowPaymentModal(false); }}
        onWalletCreated={(token) => {
          if (!walletToken) {
            setWalletToken(token);
            localStorage.setItem(WALLET_KEY, token);
          }
        }}
        onDeposit={(usd, _method, newWalletToken) => {
          setBalanceUSD(prev => prev + usd);
          setShowPaymentModal(false);
          toast.success(`$${usd.toFixed(2)} deposited`);
          // Save wallet token if returned (new wallet created during deposit)
          let activeToken = walletToken;
          if (newWalletToken) {
            setWalletToken(newWalletToken);
            localStorage.setItem(WALLET_KEY, newWalletToken);
            activeToken = newWalletToken;
          } else if (!walletToken) {
            const stored = localStorage.getItem(WALLET_KEY);
            if (stored) { setWalletToken(stored); activeToken = stored; }
          }
          // Refresh wallet balance from API
          if (activeToken) {
            const token = activeToken;
            apiClient<{ balanceUSD: number; totalDeposited?: number; totalSpent?: number }>(`/v1/tools/sms/balance?token=${token}`)
              .then(data => {
                setBalanceUSD(data.balanceUSD);
                setWalletStats({ totalDeposited: data.totalDeposited || 0, totalSpent: data.totalSpent || 0 });
              })
              .catch(() => {});
          }
        }}
      />
    </div>
  );
}
