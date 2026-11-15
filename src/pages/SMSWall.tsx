import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Phone, Globe, Search, Copy, Check, RefreshCw, Clock, AlertTriangle, ChevronRight, ChevronDown, Wallet, Zap, X, Bell, BellOff, MessageSquare, Calendar, Timer, Trash2, Expand, Shield, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { WalletBanner } from '../components/WalletBanner';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';
import { PaymentGate } from '../components/PaymentGate';

interface CountryRaw { id: string; name: string; shortName: string; engine: string }
interface UnifiedService { id: string; name: string; category?: string; engines: string[] } // id = canonical slug (from alias map) or lowercase name
interface Country { id: string; name: string; shortName: string; engines: string[] } // id = ISO (shortName), dedupped
interface Service { id: string; name: string; category?: string; engines: string[] }
interface PriceInfo { price: string; success_rate: number; engine: string; pool?: string }
interface PoolOption { pool: string; poolName: string; price: number; successRate: number; stock?: number }
interface CompareResult {
  engine: string; // e.g. "fivesim", "smspool"
  countryId: string; // engine-specific ID
  serviceId: string; // engine-specific ID
  price: number;
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
  // Detected country from the edge, else US. Legacy numeric IDs also fall back.
  const geo = (window as unknown as { __GEO_COUNTRY?: string }).__GEO_COUNTRY;
  const fallback = geo && /^[A-Za-z]{2}$/.test(geo) ? geo.toUpperCase() : 'US';
  const country = /^\d+$/.test(c) ? fallback : (c.toUpperCase() || fallback);
  return { country, service: s.toLowerCase(), order: params.get('id') || '' };
}

function flagOf(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0)));
}

// Service name -> Simple Icons slug (https://cdn.simpleicons.org). Unknown names
// fall back to a generic icon; no request is made for them.
const SERVICE_SLUGS: Record<string, string> = {
  telegram: 'telegram', discord: 'discord', whatsapp: 'whatsapp', facebook: 'facebook',
  steam: 'steam', microsoft: 'microsoft', amazon: 'amazon', google: 'google',
  twitter: 'x', x: 'x', instagram: 'instagram', tiktok: 'tiktok', snapchat: 'snapchat',
  linkedin: 'linkedin', signal: 'signal', tinder: 'tinder', uber: 'uber',
  paypal: 'paypal', apple: 'apple', netflix: 'netflix', spotify: 'spotify',
  reddit: 'reddit', twitch: 'twitch', pinterest: 'pinterest', ebay: 'ebay',
  aliexpress: 'aliexpress', alibaba: 'alibaba', binance: 'binance', coinbase: 'coinbase',
  revolut: 'revolut', wise: 'wise', line: 'line', viber: 'viber', wechat: 'wechat',
  yahoo: 'yahoo', yandex: 'yandex', protonmail: 'protonmail', openai: 'openai',
  chatgpt: 'openai', youtube: 'youtube', gmail: 'gmail', outlook: 'microsoftoutlook',
  hotmail: 'microsoftoutlook', bolt: 'bolt', grab: 'grab', airbnb: 'airbnb',
};
const serviceSlug = (name: string): string | null =>
  SERVICE_SLUGS[name.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;

// Long-tail services that Simple Icons does not carry: resolve by domain via
// logoapi.sh's square icon endpoint. Mapped names only — no runtime search.
const SERVICE_DOMAINS: Record<string, string> = {
  '1688': '1688.com', taobao: 'taobao.com', alipay: 'alipay.com', jd: 'jd.com',
  qq: 'qq.com', baidu: 'baidu.com', douyin: 'douyin.com', meituan: 'meituan.com',
  'cafe nero': 'cafe-nero.com', lazada: 'lazada.com', shopee: 'shopee.com',
  'luckyland slots': 'luckylandslots.com', '10sbets': '10sbet.com',
  '115com': '115.com', '163ash': '163.com', '163boxm': '163.com',
};
const serviceDomain = (name: string): string | null =>
  SERVICE_DOMAINS[name.toLowerCase().trim()] ?? null;
const serviceLogo = (name: string): string | null => {
  const slug = serviceSlug(name);
  if (slug) return `https://cdn.simpleicons.org/${slug}`;
  const domain = serviceDomain(name);
  return domain ? `https://logoapi.sh/icon/${domain}.svg` : null;
};

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
  const { t, i18n } = useTranslation();
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

  const chooseService = useCallback((id: string) => {
    setSelectedService(id);
    setServiceSearch('');
    setServicePickerOpen(false);
  }, [setSelectedService]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [visibleServices, setVisibleServices] = useState(24);
  const countryListRef = useRef<HTMLDivElement>(null);
  const servicePanelRef = useRef<HTMLElement>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const [servicePickerOpen, setServicePickerOpen] = useState(true);
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
      const list = Array.from(countryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      setCountries(list);
      // Keep the detected/US default only if that country exists.
      if (list.length && !list.some(x => x.id === selectedCountry)) {
        const match = list.find(x => x.shortName === selectedCountry) || list.find(x => x.shortName === 'US') || list[0];
        if (match) _setSelectedCountry(match.id);
      }
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
    setPurchase({ orderId, phoneNumber: '', country: '', service: '', engine: orderId.split(':')[0] || '', createdAt: 0, balanceUSD: 0, charged: 0 });
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
    // Reset quote state so a previous service's price never shows on a new card.
    setPriceInfo(null); setStockInfo(null); setPoolOptions([]); setCompareResults([]);
    setSelectedPool(''); setSelectedProvider('');
    if (!selectedCountry || !selectedService) return;
    setLoadingPrice(true);
    apiClient<{ results: CompareResult[] }>(`/v1/tools/sms/compare?country=${selectedCountry}&service=${selectedService}`)
      .then(async ({ results }) => {
        setCompareResults(results || []);
        if (!results || results.length === 0) {
          setPriceInfo(null); setStockInfo(null); setPoolOptions([]); setSelectedProvider('');
          toast.error('No route for this service — try the GENERIC “Other” route at the top of the list.');
          return;
        }
        // Default to the top-ranked result (cheapest/highest success)
        const top = results[0];
        setSelectedProvider(top.engine);
        setStockInfo({ available: top.available, count: top.stock });

        // Fetch pool/operator variants first, then publish one final price. Setting
        // the route price before the pool price let StrictMode's second run flip it
        // back to the cheaper "any" price that the provider refuses.
        let pools: PoolOption[] = [];
        try {
          pools = await apiClient<PoolOption[]>(
            `/v1/tools/sms/pools?country=${top.countryId}&service=${top.serviceId}&engine=${top.engine}`
          ) || [];
        } catch {
          pools = [];
        }
        setPoolOptions(pools);
        if (results.length === 1 && pools.length) {
          const cheapest = [...pools].sort((a, b) => a.price - b.price)[0];
          const stock = cheapest.stock ?? top.stock;
          setSelectedPool(cheapest.pool);
          setPriceInfo({ price: cheapest.price.toFixed(2), success_rate: cheapest.successRate, engine: top.engine, pool: cheapest.pool });
          setStockInfo({ available: stock > 0, count: stock });
        } else {
          setSelectedPool('');
          setPriceInfo({ price: top.price.toFixed(2), success_rate: top.successRate, engine: top.engine });
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

  // Keep the selected territory visible in the left list.
  useEffect(() => {
    const el = countryListRef.current?.querySelector(`[data-country="${selectedCountry}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedCountry, countries]);

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
        window.history.replaceState(null, '', `${window.location.pathname}?id=${encodeURIComponent(data.orderId)}`);
      } else {
        toast.error('Failed to get number');
      }
    } catch (e) {
      const raw = (e as { data?: { error?: string }; message?: string })?.data?.error
        || (e as { message?: string })?.message
        || 'Purchase failed';
      console.error('[sms purchase]', e);
      const msg = /no free phones|no numbers|out of stock|no stock/i.test(raw)
        ? 'No numbers available on this route right now — pick another route, another country, or the GENERIC “Other” service.'
        : /max price/i.test(raw)
          ? 'The provider price moved above the quote — retry or pick another route.'
          : /whitelist/i.test(raw)
            ? 'This service is not available from this provider — pick another route.'
            : /insufficient|balance/i.test(raw)
              ? 'Insufficient wallet balance — deposit and try again.'
              : /duplicate/i.test(raw)
                ? 'This purchase was already submitted — check the open order before retrying.'
                : raw;
      toast.error(msg, { duration: 6000 });
    }
  };

  const handleGetNumber = async () => {
    if (!priceInfo || !selectedCountry || !selectedService || purchasing) return;
    const provider = compareResults.find(r => r.engine === selectedProvider) || compareResults[0];
    if (!provider) {
      toast.error('No provider route available — try another service or country');
      return;
    }
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

  // Default to a sensible rental service so the right-hand packages are never empty.
  useEffect(() => {
    if (!rentalServices.length || selectedRentalService) return;
    const pref = rentalServices.find(s => /united kingdom/i.test(s.name)) || rentalServices[0];
    if (pref) setSelectedRentalService(pref.id);
  }, [rentalServices, selectedRentalService]);

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
        method: 'POST', body: { service: serviceId, days, token: walletToken, engine: rentalServices.find(s => s.id === serviceId)?.engine },
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

  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  };

  const selectedRentalServiceName = rentalServices.find(s => s.id === selectedRentalService)?.name || '';
  const filteredRentalServices = rentalServices.filter(s =>
    s.name.toLowerCase().includes(rentalServiceSearch.toLowerCase())
  );

  const orderedServices = useMemo(() => {
    const rank = new Map(POPULAR_SERVICES.map((n, i) => [n.toLowerCase(), i]));
    const isGeneric = (n: string) => /^(other|any other|not listed\s*\/\s*other\s*\/\s*any)$/i.test(n.trim());
    return [...services].sort((a, b) => {
      // "Other / Not listed" routes are the fallback when an exact service is
      // out of stock — keep them at the top, above the popular brands.
      const ag = isGeneric(a.name) ? -1 : 0;
      const bg = isGeneric(b.name) ? -1 : 0;
      if (ag !== bg) return ag - bg;
      const ar = rank.get(a.name.toLowerCase()) ?? 999;
      const br = rank.get(b.name.toLowerCase()) ?? 999;
      return ar !== br ? ar - br : a.name.localeCompare(b.name);
    });
  }, [services]);
  const filteredServices = orderedServices.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()));
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
  const selectedServiceObj = orderedServices.find(s => s.id === selectedService) || null;

  if (loading || xmr402Verifying) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 animate-pulse text-wr-dim">
          <RefreshCw size={32} className="animate-spin mb-4 text-wr-info" />
          <p className="text-[11px] font-mono tracking-[0.18em] uppercase">
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
          <div className="p-8 rounded-sm border border-wr-border bg-wr-surface space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-sm bg-wr-info/10 flex items-center justify-center text-wr-info border border-wr-info/20 shrink-0">
                <Clock size={24} className="animate-pulse" />
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-wr-info mb-1">{t('sms.waiting_for_sms')}</div>
                <p className="text-wr-dim text-xs">{t('sms.use_number')}</p>
              </div>
            </div>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-wr-info to-wr-secondary rounded-sm blur opacity-20 group-hover:opacity-35 transition duration-300" />
              <button onClick={() => copyText(purchase.phoneNumber)} className="min-h-14 w-full relative p-5 rounded-sm bg-wr-base border border-wr-border flex items-center justify-between gap-4 hover:border-wr-accent transition-colors">
                <span className="font-mono text-2xl font-bold text-current break-all text-left">{purchase.phoneNumber}</span>
                {copied ? <Check size={18} className="text-wr-accent" /> : <Copy size={18} className="text-wr-dim" />}
              </button>
            </div>
            <div className="flex items-center justify-start gap-2 text-xs text-wr-dim font-mono">
              <RefreshCw size={12} className="animate-spin text-wr-info" /> {t('sms.polling')}
            </div>
            <button onClick={notifEnabled ? () => setNotifEnabled(false) : requestNotifPermission}
              className={`min-h-11 inline-flex items-center justify-center gap-2 text-xs font-mono transition-colors ${notifEnabled ? 'text-wr-accent hover:text-wr-dim' : 'text-wr-dim hover:text-wr-secondary'}`}>
              {notifEnabled ? <><Bell size={12} /> {t('sms.push_on')}</> : <><BellOff size={12} /> {t('sms.push_enable')}</>}
            </button>
            <div className="text-[11px] font-mono text-wr-dim">{t('sms.charged')}: <span className="tabular-nums">${purchase.charged.toFixed(2)}</span> — {t('sms.wallet')}: <span className="tabular-nums">${balanceUSD.toFixed(2)}</span></div>
            <button onClick={handleCancel} className="min-h-11 text-xs font-bold uppercase tracking-[0.16em] text-wr-dim hover:text-wr-error transition-colors">
              {t('sms.cancel_refund')}
            </button>
            <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="inline-block text-wr-secondary hover:underline text-[11px] transition-colors">
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
          <div className="p-8 rounded-sm border border-wr-accent/50 bg-wr-surface space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-sm bg-wr-accent/10 flex items-center justify-center text-wr-accent border border-wr-accent/20 shrink-0">
                <Check size={24} />
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-wr-accent mb-1">{t('sms.sms_received')}</div>
                <p className="text-wr-dim text-xs">{t('sms.wallet')}: <span className="tabular-nums">${balanceUSD.toFixed(2)}</span></p>
              </div>
            </div>
            <button onClick={() => copyText(smsResult.sms || '')} className="min-h-14 w-full p-5 rounded-sm bg-wr-base border border-wr-accent/50 flex items-center justify-between gap-4 hover:bg-wr-accent/5 transition-colors text-left">
              <div className="min-w-0">
                <div className="font-mono text-2xl font-bold text-wr-accent mb-1 break-all">{smsResult.sms}</div>
                {smsResult.fullSms && <div className="text-xs text-wr-dim break-all">{smsResult.fullSms}</div>}
              </div>
              {copied ? <Check size={18} className="text-wr-accent shrink-0" /> : <Copy size={18} className="text-wr-dim shrink-0" />}
            </button>
            <button onClick={reset} className="min-h-11 inline-flex items-center text-xs font-bold uppercase tracking-[0.16em] text-wr-secondary hover:underline">{t('sms.get_another')}</button>
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
        description="Get temporary phone numbers for anonymous SMS verification. Undelivered codes are refunded. Pay with XMR."
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
            description: 'Get temporary phone numbers for anonymous SMS verification. Undelivered codes are refunded. Pay with XMR, Lightning, USDT, or XMR402.',
            featureList: 'Supported countries and services, Auto-refund, XMR/Lightning/USDT/XMR402 payments',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: 'SMS Wall — Anonymous SMS Verification',
            serviceType: 'SMS Verification',
            areaServed: 'Worldwide',
            description: 'Temporary phone numbers for anonymous SMS verification across supported countries and services.',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
        ]}
      />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />

      <main className="w-full max-w-6xl px-4 md:px-6 relative z-10 pb-12">
        <div className="max-w-6xl mx-auto space-y-6 md:space-y-10 pb-8 md:pb-12">

          {/* ═══ HERO ═══ */}
          <div className="px-2 md:px-0 pt-8 md:pt-12 pb-2">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] font-bold text-wr-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-wr-accent" />
              {t('sms.kicker', 'Connectivity / SMS')}
            </div>
            <h1 className="mt-3 font-display text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">
              {t('sms.title')} <span className="text-wr-accent">{t('sms.title_accent')}</span>
            </h1>
            <p className="mt-3 text-sm md:text-base text-wr-dim max-w-2xl leading-7">{t('sms.subtitle')}</p>
            <div className="flex flex-wrap gap-2 pt-4">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] px-2.5 py-1.5 rounded-sm border border-wr-info/30 text-wr-info"><Zap size={12} />{t('sms.instant_chip', 'Auto-refund')}</span>
            </div>
          </div>

          <WalletBanner
            token={walletToken}
            balance={balanceUSD}
            helper={walletToken
              ? `${t('esim.wallet_shared')} · ${t('sms.spent')}: $${walletStats.totalSpent.toFixed(2)}${walletExpiresAt ? ` · ${t('sms.wallet_expires', 'expires')} ${Math.max(0, Math.floor((walletExpiresAt - Date.now()) / 86400000))}d` : ''}`
              : t('wallet.shared_helper', 'One prepaid balance covers eSIMs, SMS, phone numbers and VPN.')}
            onDeposit={() => setShowPaymentModal(true)}
            restoreOpen={showRestoreInput}
            setRestoreOpen={setShowRestoreInput}
            restoreToken={restoreToken}
            setRestoreToken={setRestoreToken}
            onRestore={handleRestoreWallet}
            restoring={restoringWallet}
          />

          {/* ═══ TAB SELECTOR ═══ */}
          <div className="mx-2 md:mx-0 flex border-b border-wr-border">
            <button
              onClick={() => setActiveTab('sms')}
              className={`min-h-11 flex-1 py-3 px-4 text-xs font-bold tracking-[0.18em] uppercase transition-colors flex items-center justify-center gap-2 border-b-2 ${
                activeTab === 'sms'
                  ? 'border-wr-accent text-wr-accent bg-wr-accent/5'
                  : 'border-transparent text-wr-dim hover:text-wr-accent/60 hover:bg-wr-surface/50'
              }`}
            >
              <Phone size={14} /> {t('sms.one_time_sms')}
            </button>
            <button
              onClick={() => setActiveTab('rentals')}
              className={`min-h-11 flex-1 py-3 px-4 text-xs font-bold tracking-[0.18em] uppercase transition-colors flex items-center justify-center gap-2 border-b-2 ${
                activeTab === 'rentals'
                  ? 'border-wr-secondary text-wr-secondary bg-wr-secondary/5'
                  : 'border-transparent text-wr-dim hover:text-wr-secondary/60 hover:bg-wr-surface/50'
              }`}
            >
              <Calendar size={14} /> {t('sms.number_rentals_tab')}
            </button>
          </div>

          {/* ═══ ONE-TIME SMS TAB ═══ */}
            {activeTab === 'sms' && (
            <div className="bg-wr-surface border border-wr-border p-4 md:p-8 relative shadow-2xl mx-2 md:mx-0 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 md:gap-8">
                {/* LEFT: territory selection */}
                <aside className="space-y-3 md:sticky md:top-6 self-start">
                  <label className="flex items-center gap-2 text-[11px] font-mono text-wr-dim uppercase tracking-[0.18em] font-bold">
                    <Globe size={12} className="text-wr-info" /> {t('sms.territory', 'Territory')}
                  </label>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                    <input type="text" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} placeholder={t('sms.search_countries')}
                      className="min-h-11 w-full pl-10 pr-3 py-3 bg-wr-base border border-wr-border outline-none font-mono text-base md:text-sm transition-all rounded-sm focus:border-wr-info text-current placeholder-wr-dim/30" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_COUNTRIES.map(code => {
                      const country = countries.find(c => c.shortName === code);
                      if (!country) return null;
                      return (
                        <button key={country.id} onClick={() => setSelectedCountry(country.id)} title={country.name}
                          className={`inline-flex items-center gap-1 min-h-9 text-[11px] px-2 py-1 rounded-sm border font-mono font-bold transition-colors ${selectedCountry === country.id ? 'border-wr-info text-wr-info bg-wr-info/10' : 'border-wr-border text-wr-dim hover:border-wr-info/40 hover:text-wr-info'}`}>
                          {flagOf(country.shortName)} {country.shortName}
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-wr-border/60" />
                  <div ref={countryListRef} className="flex max-h-[400px] flex-col gap-0.5 overflow-y-auto pr-1">
                    {filteredCountries.filter(c => !c.shortName.includes('_')).map(c => (
                      <button key={c.id} data-country={c.id} onClick={() => setSelectedCountry(c.id)} title={`${c.name}${suggestedCountryIds.has(c.id) ? ' (recommended)' : ''}`}
                        className={`flex min-h-9 items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs transition-colors ${selectedCountry === c.id ? 'bg-wr-info/10 font-bold text-wr-info' : 'text-current hover:bg-wr-surface hover:text-wr-info'}`}>
                        <span className="shrink-0">{flagOf(c.shortName)}</span>
                        <span className="truncate">{c.name}{suggestedCountryIds.has(c.id) ? ' ★' : ''}</span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-wr-dim">{c.shortName}</span>
                      </button>
                    ))}
                    {filteredCountries.length === 0 && (
                      <div className="rounded-sm border border-wr-border bg-wr-base/50 px-3 py-4 text-center text-xs text-wr-dim">
                        {t('sms.no_countries_match', 'No territories match this search')}
                      </div>
                    )}
                  </div>
                </aside>

                {/* RIGHT: services */}
                <section ref={servicePanelRef} className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-[11px] font-mono text-wr-dim uppercase tracking-[0.18em] font-bold">
                      <Phone size={12} className="text-wr-accent" /> {t('sms.service')}
                    </label>
                    {selectedCountryName && (
                      <span className="text-[11px] font-mono text-wr-info font-bold truncate">● {selectedCountryName}</span>
                    )}
                  </div>
                  {servicePickerOpen ? (
                  <>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                    <input type="text" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} placeholder={t('sms.search_services')}
                      className="min-h-11 w-full pl-10 pr-3 py-3 bg-wr-base border border-wr-border outline-none font-mono text-base md:text-sm transition-all rounded-sm focus:border-wr-accent text-current placeholder-wr-dim/30" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_SERVICES.map(name => {
                      const svc = services.find(x => x.name.toLowerCase() === name.toLowerCase());
                      if (!svc) return null;
                      return (
                        <button key={svc.id} onClick={() => chooseService(svc.id)}
                          className={`min-h-9 text-[11px] px-2.5 py-1 rounded-sm border font-mono font-bold transition-colors ${selectedService === svc.id ? 'border-wr-accent text-wr-accent bg-wr-accent/10' : 'border-wr-border text-wr-dim hover:border-wr-accent/40 hover:text-wr-accent'}`}>
                          {svc.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {(serviceSearch ? filteredServices : orderedServices).slice(0, visibleServices).map((s, idx) => {
                      const active = selectedService === s.id;
                      const logo = serviceLogo(s.name);
                      const isGeneric = /^(other|any other|not listed\s*\/\s*other\s*\/\s*any)$/i.test(s.name.trim());
                      const shownPrice = active && priceInfo ? `$${priceInfo.price}` : '';
                      return (
                        <button key={s.id} onClick={() => chooseService(s.id)}
                          className={`group text-left p-4 rounded-sm border bg-wr-base transition-colors ${active ? 'border-wr-accent bg-wr-accent/5' : 'border-wr-border hover:border-wr-accent/40'}`}>
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-wr-border bg-white p-1.5">
                              {logo
                                ? <img src={logo} alt="" loading="lazy" referrerPolicy="no-referrer"
                                    className="h-full w-full object-contain"
                                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                                : <Phone size={14} className="text-wr-dim" />}
                            </div>
                            <span className={`text-[10px] font-mono uppercase tracking-[0.18em] ${isGeneric ? 'text-wr-info font-bold' : 'text-wr-dim'}`}>
                              {isGeneric ? t('sms.generic_route', 'GENERIC') : `${t('sms.service_card_label', 'SERVICE')} ${String(idx + 1).padStart(2, '0')}`}
                            </span>
                          </div>
                          <div className="text-sm font-bold truncate">{s.name}</div>
                          <div className="text-[11px] text-wr-dim mt-1">
                            {isGeneric ? t('sms.generic_desc', 'Any unlisted service') : t('sms.service_card_desc', 'One-time verification')}
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-3">
                            <span className={`text-[11px] font-mono tabular-nums ${shownPrice ? 'text-wr-accent font-bold' : 'text-wr-dim'}`}>
                              {shownPrice || t('sms.check_price', 'Check price')}
                            </span>
                            <span className={`text-[10px] font-mono uppercase tracking-[0.14em] ${active ? 'text-wr-accent' : 'text-wr-dim group-hover:text-wr-accent'}`}>
                              {active ? t('sms.selected', 'Selected') : t('sms.select', 'Select')} →
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {!serviceSearch && orderedServices.length > visibleServices && (
                    <button onClick={() => setVisibleServices(v => v + 24)}
                      className="w-full min-h-11 py-2.5 border border-wr-border rounded-sm text-[11px] font-mono font-bold uppercase tracking-[0.16em] text-wr-dim hover:text-wr-accent hover:border-wr-accent/40 transition-colors">
                      {t('sms.show_more_services', 'Show more services')} ({orderedServices.length - visibleServices})
                    </button>
                  )}
                  {serviceSearch && filteredServices.length === 0 && (
                    <div className="text-center text-[11px] font-mono uppercase tracking-[0.16em] text-wr-dim py-6">
                      {t('sms.no_services_match', 'No services match this search')}
                    </div>
                  )}
                  </>
                  ) : selectedService ? (
                    <div className="rounded-sm border border-wr-accent/40 bg-wr-accent/5 p-4">
                      <div className="flex items-center gap-3">
                        <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-wr-border bg-white p-1.5">
                          {selectedServiceObj && serviceLogo(selectedServiceObj.name)
                            ? <img src={serviceLogo(selectedServiceObj.name) as string} alt="" loading="lazy" referrerPolicy="no-referrer"
                                className="h-full w-full object-contain"
                                onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                            : <Phone size={14} className="text-wr-dim" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">{selectedServiceName}</div>
                          <div className="text-[11px] font-mono text-wr-dim">
                            {priceInfo ? `$${priceInfo.price}` : t('sms.fetching_price', 'Fetching price…')}
                          </div>
                        </div>
                        <button onClick={() => { setServicePickerOpen(true); window.setTimeout(() => servicePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }}
                          className="min-h-9 shrink-0 rounded-sm border border-wr-border px-3 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-wr-dim transition-colors hover:border-wr-accent/40 hover:text-wr-accent">
                          {t('sms.change_service', 'Change')}
                        </button>
                      </div>
                      {compareResults.length > 1 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {compareResults.map((r, i) => (
                            <button
                              key={r.engine}
                              onClick={() => {
                                setSelectedProvider(r.engine);
                                setPriceInfo({ price: r.price.toFixed(2), success_rate: r.successRate, engine: r.engine, pool: r.pool });
                                setStockInfo({ available: r.available, count: r.stock });
                                setSelectedPool('');
                              }}
                              className={`min-h-9 rounded-sm border px-2.5 text-[10px] font-mono uppercase tracking-[0.12em] transition-colors ${selectedProvider === r.engine ? 'border-wr-accent text-wr-accent bg-wr-accent/10' : 'border-wr-border text-wr-dim hover:border-wr-accent/40 hover:text-wr-accent'}`}
                            >
                              {t('sms.route', 'Route')} {String.fromCharCode(65 + i)} · ${r.price.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      )}
                      {priceInfo && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-wr-accent/20 pt-3">
                          <div className="text-[11px] font-mono text-wr-dim">
                            {priceInfo.success_rate > 0 && `${priceInfo.success_rate}% ${t('sms.success_rate')}`}
                            {stockInfo && stockInfo.count !== undefined ? ` · ${stockInfo.count.toLocaleString()} ${t('sms.in_stock').toLowerCase()}` : ''}
                          </div>
                          <button
                            onClick={handleGetNumber}
                            disabled={purchasing || (stockInfo !== null && !stockInfo.available)}
                            className="min-h-11 rounded-sm bg-wr-accent px-5 text-[11px] font-mono font-bold uppercase tracking-[0.16em] text-black transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {purchasing
                              ? <RefreshCw size={13} className="animate-spin" />
                              : `${t('sms.get_number')} · $${priceInfo.price}`}
                          </button>
                        </div>
                      )}
                      {loadingPrice && !priceInfo && (
                        <div className="mt-3 flex items-center gap-2 border-t border-wr-accent/20 pt-3 text-[11px] font-mono text-wr-info">
                          <RefreshCw size={13} className="animate-spin" /> {t('sms.checking_price')}
                        </div>
                      )}
                    </div>
                  ) : null}
                </section>
              </div>

            {/* ═══ PROVIDER SELECTION (top-level: engine comparison) ═══ */}
            {compareResults.length > 1 && priceInfo && (
              <div className="pt-6 border-t border-wr-border/30">
                <div className="text-[11px] text-wr-dim font-mono uppercase tracking-[0.18em] mb-2">{t('sms.select_route', 'Select Route')}</div>
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
                        className={`min-h-14 py-3 px-3 rounded-sm border text-xs font-mono transition-colors text-left ${
                          isSelected
                            ? 'border-wr-accent bg-wr-accent/10 text-wr-accent'
                            : 'border-wr-border text-wr-dim hover:border-wr-accent/50 hover:text-current'
                        }`}
                      >
                        <div className="font-bold text-sm tabular-nums">${r.price.toFixed(2)}</div>
                        <div className="text-[11px] opacity-70 mt-0.5 tabular-nums">
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
                <div className="text-[11px] text-wr-dim font-mono uppercase tracking-[0.18em] mb-2">{t('sms.select_pool', 'Sub-Route')}</div>
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
                            success_rate: route.successRate,
                            engine: route.engine,
                          });
                        }}
                        className={`min-h-14 py-3 px-3 rounded-sm border text-xs font-mono transition-colors text-left ${
                          isAutoSelected
                            ? 'border-wr-accent bg-wr-accent/10 text-wr-accent'
                            : 'border-wr-border text-wr-dim hover:border-wr-accent/50 hover:text-current'
                        }`}
                      >
                        <div className="font-bold text-sm tabular-nums">${route.price.toFixed(2)}</div>
                        <div className="text-[11px] opacity-70 mt-0.5 tabular-nums">
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
                          setPriceInfo({ ...priceInfo, price: p.price.toFixed(2), pool: p.pool, success_rate: p.successRate });
                        }}
                        className={`min-h-14 py-3 px-3 rounded-sm border text-xs font-mono transition-colors text-left ${
                          isSelected
                            ? 'border-wr-secondary bg-wr-secondary/10 text-wr-secondary'
                            : 'border-wr-border text-wr-dim hover:border-wr-secondary/50 hover:text-current'
                        }`}
                      >
                        <div className="font-bold text-sm tabular-nums">${p.price.toFixed(2)}</div>
                        <div className="text-[11px] opacity-70 mt-0.5 tabular-nums">
                          {t('sms.pool', 'Pool')} {String.fromCharCode(65 + idx)}
                          {p.successRate > 0 ? ` · ${p.successRate}%` : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!selectedPool && (
                  <p className="text-[11px] text-wr-dim/60 mt-2">{t('sms.auto_price_note', 'Auto selects the cheapest available number. Actual price may vary from estimate.')}</p>
                )}
              </div>
            )}

            {/* ═══ ACTION BAR ═══ */}
            {servicePickerOpen && (
            <div ref={quoteRef} className="sticky bottom-0 z-20 -mx-4 md:-mx-10 mt-6 px-4 md:px-10 py-4 bg-wr-surface/95 backdrop-blur border-t border-wr-border flex flex-col md:flex-row justify-between md:items-center gap-3 md:gap-4">
              <div className="text-[11px] text-wr-dim font-mono uppercase tracking-[0.14em]">
                {priceInfo ? (
                  <span>
                    <span className="text-wr-accent">●</span>{' '}
                    {selectedServiceName} / {selectedCountryName}{priceInfo.success_rate > 0 && (<> — <span
                      key={`rate-${selectedPool}-${priceInfo.success_rate}`}
                      className={`inline-block animate-[flash_0.6s_ease-out] tabular-nums ${priceInfo.success_rate >= 70 ? 'text-wr-accent' : priceInfo.success_rate >= 40 ? 'text-wr-warning' : 'text-wr-error'}`}
                    >{priceInfo.success_rate}%</span> {t('sms.success_rate')}</>)}
                    {stockInfo && stockInfo.count !== undefined && (
                      <span className={stockInfo.available ? 'text-wr-info' : 'text-wr-error'}> — {stockInfo.count.toLocaleString()} {t('sms.in_stock').toLowerCase()}</span>
                    )}
                  </span>
                ) : (
                  <span><span className="text-wr-dim">●</span> {t('sms.select_both')}</span>
                )}
              </div>

              {loadingPrice ? (
                <div className="flex items-center gap-2 text-wr-info text-[11px] font-mono"><RefreshCw size={14} className="animate-spin" /> {t('sms.checking_price')}</div>
              ) : priceInfo ? (
                <button
                  onClick={handleGetNumber}
                  disabled={!selectedService || purchasing || (stockInfo !== null && !stockInfo.available)}
                  className="min-h-12 w-full md:w-auto px-8 py-4 text-sm font-bold tracking-[0.18em] uppercase transition-opacity flex items-center justify-center gap-3 rounded-sm bg-wr-accent text-black shadow-lg shadow-wr-accent/20 hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {purchasing ? (
                    <><RefreshCw size={16} className="animate-spin" /> <span>{t('sms.purchasing', 'PURCHASING...')}</span></>
                  ) : (
                    <><span>{t('sms.get_number')}</span><span className="opacity-40">|</span><span className="tabular-nums">${priceInfo.price}</span><ChevronRight size={16} /></>
                  )}
                </button>
              ) : (
                <div className="w-full md:w-auto px-8 py-4 bg-wr-base border border-wr-border text-wr-dim text-sm rounded-sm cursor-not-allowed text-center">
                  {t('sms.select_service_price')}
                </div>
              )}
            </div>
            )}

            {stockInfo && !stockInfo.available && (
              <div className="mt-4 flex items-start gap-2 text-xs text-wr-error p-3 rounded-sm bg-wr-error/10 border border-wr-error/20">
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

            <div className="p-4 bg-wr-surface border border-wr-border text-sm rounded-sm">
              Want a UK +44 line on your own phone for 6–24 months?{' '}
              <Link className="text-wr-secondary underline underline-offset-4" to={`${i18n.language === 'en' ? '' : `/${i18n.language}`}/uk-sim`}>Browse long-term phone eSIMs</Link>.
            </div>

            {/* ─── Active Rentals ─── */}
            {walletToken && (
            <div className="bg-wr-surface border border-wr-border rounded-sm overflow-hidden shadow-2xl">
              <div className="p-4 md:p-6 border-b border-wr-border/30 flex items-center justify-between">
                <h3 className="text-[11px] font-mono font-bold tracking-[0.18em] uppercase text-wr-secondary flex items-center gap-2">
                  <Timer size={14} /> {t('sms.active_rentals')}
                </h3>
                <button
                  onClick={() => {
                    setLoadingActiveRentals(true);
                    apiClient<RentalStatus[]>(`/v1/tools/sms/rentals/active?token=${walletToken}`)
                      .then(setActiveRentals).catch(() => {}).finally(() => setLoadingActiveRentals(false));
                  }}
                  className="min-h-11 min-w-11 p-1.5 text-wr-dim hover:text-wr-secondary transition-colors"
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
                          <div className="p-2 bg-wr-secondary/10 text-wr-secondary rounded-sm border border-wr-secondary/20">
                            <Phone size={16} />
                          </div>
                          <div>
                            <div className="font-mono text-sm font-bold text-current break-all">{rental.phoneNumber}</div>
                            <div className="text-[11px] font-mono text-wr-dim flex items-center gap-2 mt-0.5">
                              <Clock size={8} /> {getTimeRemaining(rental.expiresAt)} remaining
                              {rental.messages.length > 0 && (
                                <span className="text-wr-info">
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
                            className={`min-h-11 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-[0.14em] border rounded-sm transition-colors ${
                              viewingRentalMessages === rental.orderId
                                ? 'border-wr-secondary text-wr-secondary bg-wr-secondary/10'
                                : 'border-wr-border text-wr-dim hover:border-wr-secondary hover:text-wr-secondary'
                            }`}
                          >
                            <MessageSquare size={10} className="inline mr-1" /> {t('sms.messages')}
                          </button>
                          <button
                            onClick={() => setShowExtendModal(rental.orderId)}
                            className="min-h-11 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-[0.14em] border border-wr-border text-wr-dim hover:border-wr-secondary hover:text-wr-secondary rounded-sm transition-colors"
                          >
                            <Expand size={10} className="inline mr-1" /> {t('sms.extend')}
                          </button>
                          <button
                            onClick={() => handleRentalCancel(rental.orderId)}
                            className="min-h-11 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-[0.14em] border border-wr-border text-wr-dim hover:border-wr-error hover:text-wr-error rounded-sm transition-colors"
                          >
                            <Trash2 size={10} className="inline mr-1" /> {t('sms.cancel_rental')}
                          </button>
                        </div>
                      </div>

                      {/* Messages timeline */}
                      {viewingRentalMessages === rental.orderId && (
                        <div className="mt-4 border-t border-wr-border/20 pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[11px] font-mono text-wr-dim uppercase tracking-[0.14em] font-bold flex items-center gap-2">
                              <RefreshCw size={8} className={pollingRentalMessages ? 'animate-spin text-wr-secondary' : 'text-wr-dim'} />
                              {t('sms.live_messages')}
                            </span>
                          </div>
                          {rentalMessages.length === 0 ? (
                            <div className="p-4 text-center text-wr-dim text-[11px] font-mono bg-wr-base rounded-sm border border-wr-border/30">
                              {t('sms.waiting_incoming')}
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {rentalMessages.map((msg, i) => (
                                <div key={i} className="p-3 bg-wr-base rounded-sm border border-wr-border/30 group hover:border-wr-secondary/40 transition-colors">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[11px] font-mono text-wr-dim mb-1 flex items-center gap-2">
                                        <span className="text-wr-info font-bold">{msg.sender}</span>
                                        <span className="text-wr-border">|</span>
                                        <span>{new Date(msg.timestamp).toLocaleString()}</span>
                                      </div>
                                      <div className="text-xs text-current font-mono break-all">{msg.message}</div>
                                    </div>
                                    <button
                                      onClick={() => copyText(msg.message)}
                                      className="min-h-11 min-w-11 p-1.5 text-wr-dim hover:text-wr-secondary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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
            {/* ─── Browse Rental Services (master–detail, same as one-time SMS) ─── */}
            <div className="bg-wr-surface border border-wr-border p-4 md:p-8 relative shadow-xl rounded-sm">
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 md:gap-8">
                <aside className="space-y-3 md:sticky md:top-6 self-start">
                  <label className="flex items-center gap-2 text-[11px] font-mono text-wr-dim uppercase tracking-[0.18em] font-bold">
                    <Calendar size={12} className="text-wr-secondary" /> {t('sms.browse_rental_services')}
                  </label>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                    <input
                      type="text"
                      value={rentalServiceSearch}
                      onChange={e => setRentalServiceSearch(e.target.value)}
                      placeholder={t('sms.search_rental')}
                      className="min-h-11 w-full pl-10 pr-3 py-3 bg-wr-base border border-wr-border outline-none font-mono text-base md:text-sm transition-all rounded-sm focus:border-wr-secondary text-current placeholder-wr-dim/30"
                    />
                  </div>
                  {loadingRentalServices ? (
                    <div className="py-8 text-center text-wr-dim text-xs animate-pulse">
                      <RefreshCw size={16} className="animate-spin mx-auto mb-2" /> {t('sms.loading_services')}
                    </div>
                  ) : (
                    <div className="flex max-h-[400px] flex-col gap-0.5 overflow-y-auto pr-1 border-t border-wr-border/60 pt-2">
                      {filteredRentalServices.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedRentalService(s.id)}
                          className={`flex min-h-10 items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs transition-colors ${
                            selectedRentalService === s.id
                              ? 'bg-wr-secondary/10 font-bold text-wr-secondary'
                              : 'text-current hover:bg-wr-surface hover:text-wr-secondary'
                          }`}
                        >
                          <Calendar size={12} className="shrink-0 opacity-70" />
                          <span className="truncate">{s.name}</span>
                        </button>
                      ))}
                      {filteredRentalServices.length === 0 && (
                        <div className="w-full text-center text-wr-dim text-xs py-4 font-mono">{t('sms.no_services_found')}</div>
                      )}
                    </div>
                  )}
                </aside>

                <section className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-[11px] font-mono text-wr-dim uppercase tracking-[0.18em] font-bold">
                      <Zap size={12} className="text-wr-secondary" /> {t('sms.select_duration')}
                    </label>
                    {selectedRentalServiceName && (
                      <span className="text-[11px] font-mono text-wr-secondary font-bold truncate">● {selectedRentalServiceName}</span>
                    )}
                  </div>

                  {!selectedRentalService ? (
                    <div className="flex flex-col items-center justify-center rounded-sm border border-wr-border bg-wr-base/50 px-4 py-12 text-center text-xs text-wr-dim">
                      <Calendar size={32} className="mb-3 opacity-30" />
                      {t('sms.select_rental_prompt', 'Select a rental service to see durations and prices')}
                    </div>
                  ) : loadingRentalPrices ? (
                    <div className="py-10 text-center text-wr-dim text-xs animate-pulse">
                      <RefreshCw size={14} className="animate-spin mx-auto mb-2" /> {t('sms.loading_prices')}
                    </div>
                  ) : rentalPrices.length === 0 ? (
                    <div className="rounded-sm border border-wr-border bg-wr-base/50 px-4 py-8 text-center text-xs text-wr-dim font-mono">
                      {t('sms.no_pricing')}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                      {rentalPrices.map((tier, i) => (
                        <button
                          key={i}
                          onClick={() => handleRentalPurchase(selectedRentalService, tier.days)}
                          disabled={purchasingRental}
                          className="relative min-h-24 p-4 border border-wr-border bg-wr-base hover:border-wr-secondary hover:bg-wr-secondary/5 cursor-pointer transition-colors duration-200 rounded-sm disabled:opacity-30 disabled:cursor-wait text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-wr-secondary"
                        >
                          <div className="text-2xl font-bold font-mono text-current tabular-nums mb-1">
                            {tier.days}d
                          </div>
                          <div className="text-[11px] font-mono text-wr-dim uppercase tracking-[0.14em] mb-3">
                            {tier.days === 1 ? '1 Day' : `${tier.days} Days`}
                          </div>
                          <div className="text-sm font-bold font-mono text-wr-secondary tabular-nums">
                            ${tier.price.toFixed(2)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {purchasingRental && (
                    <div className="flex items-center justify-center gap-2 text-xs text-wr-accent">
                      <RefreshCw size={12} className="animate-spin" /> {t('sms.processing_rental')}
                    </div>
                  )}
                </section>
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
                  <h4 className="text-[11px] font-bold uppercase text-wr-accent mb-1">{item.title}</h4>
                  <p className="text-[11px] text-wr-dim">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* ═══ INFO CARDS (One-Time SMS) ═══ */}
          {activeTab === 'sms' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mx-2 md:mx-0">
            {[
              { title: t('sms.info_pay_title'), desc: t('sms.info_pay_desc'), tone: 'text-wr-accent' },
              { title: t('sms.info_refund_title'), desc: t('sms.info_refund_desc'), tone: 'text-wr-info' },
              { title: t('sms.info_services_title'), desc: t('sms.info_services_desc'), tone: 'text-wr-secondary' },
            ].map(item => (
              <div key={item.title} className="p-4 rounded-sm border border-wr-border bg-wr-surface/40">
                <h4 className={`text-[11px] font-mono font-bold uppercase tracking-[0.14em] mb-1 ${item.tone}`}>{item.title}</h4>
                <p className="text-[11px] text-wr-dim leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          )}

          {/* ═══ WHY CHOOSE SMS WALL ═══ */}
          <div className="mx-2 md:mx-0 space-y-6">
            <div className="space-y-2">
              <h2 className="font-mono text-[11px] md:text-xs font-bold uppercase tracking-[0.2em] text-wr-dim">
                {t('sms.why_title')}
              </h2>
              <div className="w-12 h-px bg-wr-accent" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {([
                { icon: <Shield size={18} />, title: t('sms.why_anonymous_title'), desc: t('sms.why_anonymous_desc'), tone: 'text-wr-accent' },
                { icon: <Globe size={18} />, title: t('sms.why_global_title'), desc: t('sms.why_global_desc'), tone: 'text-wr-info' },
                { icon: <Zap size={18} />, title: t('sms.why_instant_title'), desc: t('sms.why_instant_desc'), tone: 'text-wr-secondary' },
                { icon: <Wallet size={18} />, title: t('sms.why_crypto_title'), desc: t('sms.why_crypto_desc'), tone: 'text-wr-secondary' },
                { icon: <RefreshCw size={18} />, title: t('sms.why_refund_title'), desc: t('sms.why_refund_desc'), tone: 'text-wr-accent' },
                { icon: <Layers size={18} />, title: t('sms.why_providers_title'), desc: t('sms.why_providers_desc'), tone: 'text-wr-info' },
              ]).map((card) => (
                <div key={card.title} className="p-4 rounded-sm border border-wr-border bg-wr-surface space-y-2 hover:border-wr-accent/40 transition-colors">
                  <div className={card.tone}>{card.icon}</div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-current">{card.title}</h3>
                  <p className="text-xs text-wr-dim leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ HOW IT WORKS ═══ */}
          <div className="mx-2 md:mx-0 space-y-6">
            <div className="space-y-2">
              <h2 className="font-mono text-[11px] md:text-xs font-bold uppercase tracking-[0.2em] text-wr-dim">
                {t('sms.how_title')}
              </h2>
              <div className="w-12 h-px bg-wr-info" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-0 relative">
              {/* Connector lines (desktop only) */}
              <div className="hidden md:block absolute top-8 left-[calc(33.33%+0.5rem)] right-[calc(33.33%+0.5rem)] h-px bg-wr-border" />
              {([
                { num: '01', icon: <Search size={20} />, title: t('sms.how_step1_title'), desc: t('sms.how_step1_desc'), tone: 'border-wr-info/30 bg-wr-info/10 text-wr-info', label: 'text-wr-info' },
                { num: '02', icon: <Wallet size={20} />, title: t('sms.how_step2_title'), desc: t('sms.how_step2_desc'), tone: 'border-wr-accent/30 bg-wr-accent/10 text-wr-accent', label: 'text-wr-accent' },
                { num: '03', icon: <MessageSquare size={20} />, title: t('sms.how_step3_title'), desc: t('sms.how_step3_desc'), tone: 'border-wr-secondary/30 bg-wr-secondary/10 text-wr-secondary', label: 'text-wr-secondary' },
              ]).map((step, i) => (
                <div key={step.num} className="flex flex-col items-center text-center space-y-3 relative px-4">
                  <div className={`relative z-10 w-16 h-16 rounded-sm border flex items-center justify-center ${step.tone}`}>
                    {step.icon}
                  </div>
                  <div className={`text-[11px] font-mono font-bold tracking-[0.18em] ${step.label}`}>{step.num}</div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-current">{step.title}</h3>
                  <p className="text-xs text-wr-dim leading-relaxed max-w-xs">{step.desc}</p>
                  {/* Vertical connector for mobile */}
                  {i < 2 && <div className="md:hidden w-px h-6 bg-wr-border" />}
                </div>
              ))}
            </div>
          </div>

          {/* ═══ FAQ ACCORDION ═══ */}
          <div className="mx-2 md:mx-0 space-y-6">
            <div className="space-y-2">
              <h2 className="font-mono text-[11px] md:text-xs font-bold uppercase tracking-[0.2em] text-wr-dim">
                {t('sms.faq_title')}
              </h2>
              <div className="w-12 h-px bg-wr-secondary" />
            </div>
            <div className="space-y-2">
              {([1, 2, 3, 4, 5, 6] as const).map((n) => {
                const isOpen = faqOpen === n;
                return (
                  <div key={n} className="border border-wr-border rounded-sm bg-wr-surface overflow-hidden">
                    <button
                      onClick={() => setFaqOpen(isOpen ? null : n)}
                      className="min-h-11 w-full flex items-center justify-between p-4 text-left hover:bg-wr-base/50 transition-colors"
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
          <div className="border border-wr-secondary/60 bg-wr-base p-0 max-w-sm w-full relative shadow-2xl overflow-hidden rounded-sm">
            <button onClick={() => setShowExtendModal(null)} className="absolute top-2.5 right-2.5 min-h-11 min-w-11 p-1.5 text-wr-dim hover:text-wr-secondary z-10"><X size={20} /></button>

            <div className="p-3 md:p-4 border-b bg-wr-secondary/10 border-wr-secondary/30 text-wr-secondary flex items-center gap-2">
              <Calendar size={14} />
              <span className="text-[11px] font-mono font-bold tracking-[0.18em] uppercase">{t('sms.extend_rental')}</span>
            </div>

            <div className="p-4 md:p-6 space-y-4">
              <p className="text-xs text-wr-dim font-mono text-center">{t('sms.add_more_days')}</p>
              <div className="grid grid-cols-3 gap-3">
                {[1, 7, 30].map(days => (
                  <button
                    key={days}
                    onClick={() => handleRentalExtend(showExtendModal, days)}
                    disabled={extendingRental}
                    className="min-h-20 py-4 border border-wr-border hover:border-wr-secondary bg-wr-surface/50 hover:bg-wr-secondary/5 rounded-sm transition-colors text-center disabled:opacity-30 disabled:cursor-wait"
                  >
                    <div className="text-xl font-bold font-mono text-current tabular-nums">{days}d</div>
                    <div className="text-[11px] font-mono text-wr-dim uppercase tracking-[0.14em] mt-1">
                      {days === 1 ? '1 Day' : `${days} Days`}
                    </div>
                  </button>
                ))}
              </div>
              {extendingRental && (
                <div className="flex items-center justify-center gap-2 text-xs text-wr-secondary">
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
