import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Smartphone, Globe, Search, Copy, Check, RefreshCw, Clock, AlertTriangle, ChevronRight, ChevronDown, Wallet, Zap, X, Plus, Wifi, Signal, SlidersHorizontal, Shield, MapPin, Database, DollarSign, ArrowUpDown, Key } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';
import { PaymentGate } from '../components/PaymentGate';

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


// ─── Data filter buckets ───
const DATA_FILTERS = [
  { label: 'All', min: 0, max: Infinity },
  { label: '1GB', min: 0.5, max: 1.5 },
  { label: '3GB', min: 2, max: 4 },
  { label: '5GB', min: 4, max: 6 },
  { label: '10GB+', min: 10, max: Infinity },
] as const;

const DURATION_FILTERS = [
  { label: 'All', min: 0, max: Infinity },
  { label: '1d', min: 1, max: 1 },
  { label: '7d', min: 2, max: 7 },
  { label: '14d', min: 8, max: 14 },
  { label: '30d', min: 15, max: 30 },
  { label: '30d+', min: 31, max: Infinity },
] as const;

type SortKey = 'price' | 'data' | 'duration';
type BrowseTab = 'country' | 'regional' | 'global';

const POPULAR_COUNTRIES = ['US', 'GB', 'DE', 'JP', 'TH', 'SG', 'TR', 'AE', 'FR', 'KR', 'IT', 'ES'];

// Country → continent mapping for regional fallback
const COUNTRY_TO_CONTINENT: Record<string, string> = {
  // Asia
  AF:'AS',BD:'AS',BH:'AS',BN:'AS',BT:'AS',CN:'AS',CY:'AS',GE:'AS',HK:'AS',ID:'AS',IN:'AS',IQ:'AS',IR:'AS',IL:'AS',JP:'AS',JO:'AS',KZ:'AS',KW:'AS',KG:'AS',LA:'AS',LB:'AS',MO:'AS',MY:'AS',MV:'AS',MN:'AS',MM:'AS',NP:'AS',OM:'AS',PK:'AS',PH:'AS',QA:'AS',SA:'AS',SG:'AS',KR:'AS',LK:'AS',SY:'AS',TW:'AS',TJ:'AS',TH:'AS',TL:'AS',TR:'AS',TM:'AS',AE:'AS',UZ:'AS',VN:'AS',YE:'AS',KH:'AS',
  // Europe
  AL:'EU',AD:'EU',AT:'EU',BY:'EU',BE:'EU',BA:'EU',BG:'EU',HR:'EU',CZ:'EU',DK:'EU',EE:'EU',FI:'EU',FR:'EU',DE:'EU',GR:'EU',HU:'EU',IS:'EU',IE:'EU',IT:'EU',XK:'EU',LV:'EU',LI:'EU',LT:'EU',LU:'EU',MT:'EU',MD:'EU',MC:'EU',ME:'EU',NL:'EU',MK:'EU',NO:'EU',PL:'EU',PT:'EU',RO:'EU',RU:'EU',SM:'EU',RS:'EU',SK:'EU',SI:'EU',ES:'EU',SE:'EU',CH:'EU',UA:'EU',GB:'EU',
  // Africa
  DZ:'AF',AO:'AF',BJ:'AF',BW:'AF',BF:'AF',BI:'AF',CM:'AF',CV:'AF',CF:'AF',TD:'AF',KM:'AF',CD:'AF',CG:'AF',CI:'AF',DJ:'AF',EG:'AF',GQ:'AF',ER:'AF',SZ:'AF',ET:'AF',GA:'AF',GM:'AF',GH:'AF',GN:'AF',GW:'AF',KE:'AF',LS:'AF',LR:'AF',LY:'AF',MG:'AF',MW:'AF',ML:'AF',MR:'AF',MU:'AF',MA:'AF',MZ:'AF',NA:'AF',NE:'AF',NG:'AF',RW:'AF',SN:'AF',SC:'AF',SL:'AF',SO:'AF',ZA:'AF',SS:'AF',SD:'AF',TZ:'AF',TG:'AF',TN:'AF',UG:'AF',ZM:'AF',ZW:'AF',
  // North America
  AG:'NA',BS:'NA',BB:'NA',BZ:'NA',CA:'NA',CR:'NA',CU:'NA',DM:'NA',DO:'NA',SV:'NA',GD:'NA',GT:'NA',HT:'NA',HN:'NA',JM:'NA',MX:'NA',NI:'NA',PA:'NA',KN:'NA',LC:'NA',VC:'NA',TT:'NA',US:'NA',
  // South America
  AR:'SA',BO:'SA',BR:'SA',CL:'SA',CO:'SA',EC:'SA',GY:'SA',PY:'SA',PE:'SA',SR:'SA',UY:'SA',VE:'SA',
  // Oceania
  AU:'OC',FJ:'OC',NZ:'OC',PG:'OC',WS:'OC',TO:'OC',VU:'OC',
};

// ─── Region mapping for categorizing plans ───
const REGIONS: Record<string, string[]> = {
  'Asia': ['CN', 'JP', 'KR', 'TH', 'VN', 'MY', 'SG', 'ID', 'PH', 'IN', 'TW', 'HK', 'MO'],
  'Europe': ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'PT', 'IE', 'PL', 'CZ', 'GR', 'RO', 'HU', 'HR', 'BG', 'SK', 'SI', 'LT', 'LV', 'EE'],
  'North America': ['US', 'CA', 'MX'],
  'South America': ['BR', 'AR', 'CL', 'CO', 'PE', 'EC', 'UY', 'PY', 'BO', 'VE'],
  'Africa': ['ZA', 'NG', 'KE', 'EG', 'MA', 'GH', 'TZ', 'ET'],
  'Middle East': ['AE', 'SA', 'QA', 'BH', 'KW', 'OM', 'JO', 'IL', 'TR'],
  'Oceania': ['AU', 'NZ', 'FJ'],
};

const REGION_I18N_KEYS: Record<string, string> = {
  'Asia': 'esim.region_asia',
  'Europe': 'esim.region_europe',
  'North America': 'esim.region_north_america',
  'South America': 'esim.region_south_america',
  'Africa': 'esim.region_africa',
  'Middle East': 'esim.region_middle_east',
  'Oceania': 'esim.region_oceania',
};

/** Known regional codes that look like ISO but represent regions */
const REGIONAL_CODES = new Set(['AS', 'EU', 'AF', 'NA', 'SA', 'OC', 'ME']);

/** Check if a plan's country field indicates a single-country plan (2-letter ISO code) */
function isSingleCountryPlan(country: string): boolean {
  if (REGIONAL_CODES.has(country)) return false;
  return /^[A-Z]{2}$/.test(country);
}

/** Check if a plan is a global plan */
function isGlobalPlan(plan: { country: string; name: string }): boolean {
  return plan.country === 'GLOBAL' || plan.country.toLowerCase() === 'global' || plan.name.toLowerCase().includes('global');
}

/** Check if a plan is multi-country (regional or global — not single ISO code) */
function isMultiCountryPlan(plan: { country: string; name: string }): boolean {
  return !isSingleCountryPlan(plan.country);
}

/** Check if a plan is a regional plan (multi-country, not global) */
function isRegionalPlan(plan: { country: string; name: string }): boolean {
  if (isGlobalPlan(plan)) return false;
  if (isSingleCountryPlan(plan.country)) return false;
  return true;
}

/** Check if a regional plan belongs to a given region */
function planMatchesRegion(plan: { country: string; name: string }, region: string): boolean {
  const countryField = plan.country;
  const regionCountries = REGIONS[region] || [];

  // Check if plan.country matches region name
  if (countryField.toLowerCase() === region.toLowerCase()) return true;
  // Check for partial region name match in country or name
  if (plan.name.toLowerCase().includes(region.toLowerCase())) return true;
  // Common API region variants
  const regionVariants: Record<string, string[]> = {
    'Asia': ['asia', 'asia pacific', 'apac', 'southeast asia', 'east asia', 'central asia', 'as'],
    'Europe': ['europe', 'eu', 'european union', 'western europe', 'eastern europe'],
    'North America': ['north america', 'americas', 'na'],
    'South America': ['south america', 'latin america', 'latam', 'sa'],
    'Africa': ['africa', 'sub-saharan africa', 'af'],
    'Middle East': ['middle east', 'mena', 'gulf', 'me'],
    'Oceania': ['oceania', 'australia and new zealand', 'pacific', 'oc'],
  };
  const variants = regionVariants[region] || [];
  if (variants.some(v => countryField.toLowerCase() === v || countryField.toLowerCase().includes(v) || plan.name.toLowerCase().includes(v))) return true;

  // Check if plan covers multiple country codes that fall within this region
  const codes = countryField.split(/[,\s]+/).filter(c => /^[A-Z]{2}$/.test(c));
  if (codes.length > 1) {
    const matchCount = codes.filter(c => regionCountries.includes(c)).length;
    return matchCount > 0 && matchCount / codes.length >= 0.5;
  }

  return false;
}

// Read initial state from URL params
function getInitialParams(): { tab: BrowseTab; country: string; region: string; order: string } {
  const params = new URLSearchParams(window.location.search);
  const tab = (['country', 'regional', 'global'] as BrowseTab[]).includes(params.get('t') as BrowseTab)
    ? (params.get('t') as BrowseTab) : 'country';
  return { tab, country: params.get('c') || '', region: params.get('r') || '', order: params.get('id') || '' };
}

function updateUrlParams(tab: BrowseTab, country: string, region: string) {
  // Don't overwrite order URL
  if (new URLSearchParams(window.location.search).has('id')) return;
  const params = new URLSearchParams();
  if (tab !== 'country') params.set('t', tab);
  if (tab === 'country' && country) params.set('c', country);
  if (tab === 'regional' && region) params.set('r', region);
  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? '?' + qs : ''}`;
  window.history.replaceState(null, '', url);
}

export function ESIMWall() {
  const { t } = useTranslation();
  const initial = useMemo(getInitialParams, []);
  const [countries, setCountries] = useState<MergedCountry[]>([]);
  const [comparePlans, setComparePlans] = useState<ComparePlan[]>([]);
  const [, setActiveEngines] = useState<string[]>([]);
  const [, setCheapestId] = useState<string | null>(null);
  const [selectedCountry, _setSelectedCountry] = useState<string>(initial.country);
  const [countrySearch, setCountrySearch] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Tabs
  const [activeTab, _setActiveTab] = useState<BrowseTab>(initial.tab);
  const [selectedRegion, _setSelectedRegion] = useState<string>(initial.region);

  // Wrap setters to sync URL
  const setSelectedCountry = useCallback((c: string) => {
    _setSelectedCountry(c);
    updateUrlParams('country', c, '');
  }, []);
  const setSelectedRegion = useCallback((r: string) => {
    _setSelectedRegion(r);
    updateUrlParams(activeTab, '', r);
  }, [activeTab]);
  const setActiveTab = useCallback((t: BrowseTab) => {
    _setActiveTab(t);
    updateUrlParams(t, t === 'country' ? selectedCountry : '', '');
  }, [selectedCountry]);
  const [allPlans, setAllPlans] = useState<ComparePlan[]>([]);
  const [loadingAllPlans, setLoadingAllPlans] = useState(false);
  const PLANS_PER_PAGE = 12;
  const [visiblePlans, setVisiblePlans] = useState(PLANS_PER_PAGE);
  const plansRef = useRef<HTMLDivElement>(null);

  const scrollToPlans = useCallback(() => {
    if (window.innerWidth < 768 && plansRef.current) {
      setTimeout(() => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, []);
  const [allPlansLoaded, setAllPlansLoaded] = useState(false);

  // Filters
  const [dataFilter, setDataFilter] = useState(0); // index into DATA_FILTERS
  const [durationFilter, setDurationFilter] = useState(0); // index into DURATION_FILTERS
  const [engineFilter, setEngineFilter] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('price');
  const [sortAsc, setSortAsc] = useState(true);

  // Wallet (shared with SMS)
  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState<number>(0);
  const [showRestoreInput, setShowRestoreInput] = useState(false);
  const [restoreToken, setRestoreToken] = useState('');
  const [restoringWallet, setRestoringWallet] = useState(false);

  // Payment
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Modal step state machine for unified purchase flow
  const [modalStep, setModalStep] = useState<'details' | 'purchasing' | 'success' | 'error'>('details');
  const [modalError, setModalError] = useState<string>('');

  // Purchase flow
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [profileData, setProfileData] = useState<ProfileResult | null>(null);
  const [step, setStep] = useState<'SELECT' | 'PURCHASED'>('SELECT');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);

  // Plan detail modal
  const [selectedPlanDetail, setSelectedPlanDetailRaw] = useState<ComparePlan | null>(null);
  const setSelectedPlanDetail = (plan: ComparePlan | null) => {
    setSelectedPlanDetailRaw(plan);
    if (plan) {
      setModalStep('details');
      setModalError('');
    }
  };

  // FAQ accordion
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  // ─── Load countries (merged from all engines) ───
  useEffect(() => {
    apiClient<MergedCountry[]>('/v1/tools/esim/countries/all')
      .then(c => {
        setCountries(c);
        // Auto-select user's territory from CF geo header (skip if URL already has selection)
        const geo = (window as any).__GEO_COUNTRY as string | undefined;
        if (geo && !selectedCountry && !initial.country && !initial.region) {
          if (c.some(cc => cc.code === geo)) {
            // Exact match — select the user's territory
            setSelectedCountry(geo);
          } else {
            // Fallback: try regional tab with user's continent
            const continent = COUNTRY_TO_CONTINENT[geo];
            if (continent) {
              // Will auto-load regional plans; region selection happens after allPlans load
              setActiveTab('regional');
              setSelectedRegion(continent);
            } else {
              // Ultimate fallback: US
              if (c.some(cc => cc.code === 'US')) setSelectedCountry('US');
            }
          }
        }
      })
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

  // ─── Restore order from ?order= URL param ───
  useEffect(() => {
    if (!initial.order) return;
    const token = walletToken || localStorage.getItem(WALLET_KEY);
    if (!token) return;
    const orderId = initial.order;

    // Show purchased state immediately, fetch profile in background
    setPurchase({ orderId, planId: '', status: 'PENDING', engine: orderId.split(':')[0] || '', createdAt: 0, balanceUSD: 0, charged: 0 });
    setStep('PURCHASED');
    setLoading(false);

    // Fetch profile
    apiClient<ProfileResult>(`/v1/tools/esim/profile?order_id=${encodeURIComponent(orderId)}&token=${token}`)
      .then(profile => {
        if (profile.qrCode || profile.activationUrl) setProfileData(profile);
        else pollProfile(orderId, token);
      })
      .catch(() => pollProfile(orderId, token));
  }, []);

  const handleRestoreWallet = async () => {
    if (!restoreToken.trim()) return;
    setRestoringWallet(true);
    try {
      const data = await apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${restoreToken.trim()}`);
      setWalletToken(restoreToken.trim());
      setBalanceUSD(data.balanceUSD);
      localStorage.setItem(WALLET_KEY, restoreToken.trim());
      setShowRestoreInput(false);
      setRestoreToken('');
      toast.success('Wallet restored!');
    } catch {
      toast.error('Invalid wallet token');
    } finally { setRestoringWallet(false); }
  };

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

  // ─── Fetch all plans for Regional/Global tabs ───
  useEffect(() => {
    if ((activeTab === 'regional' || activeTab === 'global') && !allPlansLoaded && !loadingAllPlans) {
      setLoadingAllPlans(true);
      apiClient<ComparePlan[]>('/v1/tools/esim/plans')
        .then(plans => {
          setAllPlans(plans);
          setAllPlansLoaded(true);
        })
        .catch(() => { setAllPlans([]); toast.error('Failed to load plans'); })
        .finally(() => setLoadingAllPlans(false));
    }
  }, [activeTab, allPlansLoaded, loadingAllPlans]);

  // ─── Actions ───

  const executePurchase = async (planId: string, token: string, engine?: string, country?: string) => {
    const data = await apiClient<PurchaseResult>('/v1/tools/esim/purchase', {
      method: 'POST',
      body: { planId, token, engine, country: country || selectedCountry || undefined },
    });
    if (data.orderId) {
      setPurchase(data);
      setBalanceUSD(data.balanceUSD);
      setStep('PURCHASED');
      // Persist order ID in URL (raw ID without engine prefix)
      const rawId = data.orderId.includes(':') ? data.orderId.split(':').slice(1).join(':') : data.orderId;
      window.history.replaceState(null, '', `${window.location.pathname}?id=${rawId}`);
      if (data.qrCode || data.activationUrl) {
        setProfileData({ qrCode: data.qrCode, activationUrl: data.activationUrl });
      } else {
        pollProfile(data.orderId, token);
      }
    } else {
      throw new Error('Purchase failed — no order ID returned');
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

  /** In-modal purchase: called when user has sufficient balance */
  const handleModalPurchase = async (plan: ComparePlan) => {
    if (walletToken && balanceUSD >= plan.price) {
      setModalStep('purchasing');
      try {
        await executePurchase(plan.id, walletToken, plan.engine, plan.country);
        setModalStep('success');
      } catch (e: any) {
        setModalStep('error');
        setModalError(e?.message || 'Purchase failed');
      }
    }
  };

  /** Called by PaymentGate when a deposit is confirmed — with optional auto-purchase */
  const handlePaymentDeposit = useCallback(async (usd: number, autoPurchase?: { planId: string; engine: string; country?: string }) => {
    setBalanceUSD(prev => prev + usd);
    toast.success(`$${usd.toFixed(2)} deposited`);

    // Re-fetch wallet to get the actual balance and token
    const token = walletToken || localStorage.getItem(WALLET_KEY);
    if (token) {
      try {
        const data = await apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${token}`);
        setBalanceUSD(data.balanceUSD);
      } catch { /* use optimistic balance */ }
    }

    // Auto-purchase if we have a plan to buy
    if (autoPurchase && token) {
      setModalStep('purchasing');
      try {
        await executePurchase(autoPurchase.planId, token, autoPurchase.engine, autoPurchase.country);
        setModalStep('success');
      } catch {
        setModalStep('error');
        setModalError('Purchase failed after payment');
      }
    }
  }, [walletToken]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text); setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setPurchase(null); setProfileData(null);
    setStep('SELECT');
    window.history.replaceState(null, '', window.location.pathname);
  };

  // ─── Derived ───

  const filteredCountries = useMemo(() => {
    return countries
      .filter(c => isSingleCountryPlan(c.code)) // Only show single-country entries in Country tab
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

    // Duration filter
    const durf = DURATION_FILTERS[durationFilter];
    if (durf.min > 0 || durf.max < Infinity) {
      plans = plans.filter(p => p.durationDays >= durf.min && p.durationDays <= durf.max);
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
  }, [comparePlans, dataFilter, durationFilter, engineFilter, sortKey, sortAsc]);

  // Recompute cheapest from filtered results (not initial API response)
  const filteredCheapestId = useMemo(() => {
    if (filteredPlans.length === 0) return null;
    return filteredPlans.reduce((c, p) => p.price < c.price ? p : c, filteredPlans[0]).id;
  }, [filteredPlans]);

  // Reset lazy load when filters/country change
  useEffect(() => { setVisiblePlans(PLANS_PER_PAGE); }, [selectedCountry, dataFilter, durationFilter, engineFilter, sortKey, sortAsc]);

  // ─── Fetch regional plans when a region is selected ───
  const [regionalPlans, setRegionalPlans] = useState<ComparePlan[]>([]);
  const [, setRegionalLoading] = useState(false);

  useEffect(() => {
    if (!selectedRegion || activeTab !== 'regional') {
      setRegionalPlans([]);
      return;
    }

    // Map regions to API country codes for direct fetching
    const REGION_API_CODES: Record<string, string[]> = {
      'Asia': ['AS'],
      'Europe': ['EU'],
      'North America': ['NA'],
      'South America': ['SA'],
      'Africa': ['AF'],
      'Middle East': ['ME'],
      'Oceania': ['OC'],
    };

    const codes = REGION_API_CODES[selectedRegion] || [];

    (async () => {
      setRegionalLoading(true);
      try {
        // Fetch from API with regional codes + filter allPlans
        const fetched: ComparePlan[] = [];
        for (const code of codes) {
          try {
            const plans = await apiClient<ComparePlan[]>(`/v1/tools/esim/plans?country=${code}`);
            fetched.push(...plans);
          } catch { /* skip */ }
        }
        // Also include matching plans from allPlans (PikaSim multi-country)
        const fromAll = allPlans.filter(p => isRegionalPlan(p) && planMatchesRegion(p, selectedRegion));
        // Deduplicate by id
        const seen = new Set(fetched.map(p => p.id));
        for (const p of fromAll) {
          if (!seen.has(p.id)) fetched.push(p);
        }
        setRegionalPlans(fetched);
      } catch {
        setRegionalPlans([]);
      } finally {
        setRegionalLoading(false);
      }
    })();
  }, [selectedRegion, activeTab, allPlans]);

  // ─── Region counts — use countries list to detect available regions ───
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const REGION_CODES: Record<string, string> = { 'Asia': 'AS', 'Europe': 'EU' };
    for (const region of Object.keys(REGIONS)) {
      // Count from allPlans (multi-country plans)
      const fromAll = allPlans.filter(p => isRegionalPlan(p) && planMatchesRegion(p, region)).length;
      // Check if regional code exists in countries list (SMSPool AS/EU)
      const code = REGION_CODES[region];
      const hasRegionalCode = code ? countries.some(c => c.code === code) : false;
      counts[region] = hasRegionalCode ? fromAll + 1 : fromAll; // +1 as indicator that plans exist via API
    }
    return counts;
  }, [allPlans, countries]);

  // ─── Global plans ───
  const globalPlans = useMemo(() => {
    return allPlans.filter(p => isMultiCountryPlan(p));
  }, [allPlans]);

  // ─── Active tab plans for filter/sort (regional or global) ───
  const tabPlans = useMemo(() => {
    const source = activeTab === 'regional' ? regionalPlans : activeTab === 'global' ? globalPlans : [];
    let plans = [...source];

    // Data filter
    const df = DATA_FILTERS[dataFilter];
    if (df.min > 0 || df.max < Infinity) {
      plans = plans.filter(p => p.dataGB >= df.min && p.dataGB <= df.max);
    }

    // Duration filter
    const durf = DURATION_FILTERS[durationFilter];
    if (durf.min > 0 || durf.max < Infinity) {
      plans = plans.filter(p => p.durationDays >= durf.min && p.durationDays <= durf.max);
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
  }, [activeTab, regionalPlans, globalPlans, dataFilter, durationFilter, engineFilter, sortKey, sortAsc]);


  const tabCheapestId = useMemo(() => {
    if (tabPlans.length === 0) return null;
    return tabPlans.reduce((cheapest, p) => p.price < cheapest.price ? p : cheapest, tabPlans[0]).id;
  }, [tabPlans]);

  const handleTabChange = (tab: BrowseTab) => {
    setActiveTab(tab);
    // Reset filters and pagination when switching tabs
    setDataFilter(0);
    setEngineFilter(new Set());
    setVisiblePlans(PLANS_PER_PAGE);
    setSortKey('price');
    setSortAsc(true);
    if (tab === 'regional' && !selectedRegion) {
      // Auto-select user's continent
      const geo = (window as any).__GEO_COUNTRY as string | undefined;
      if (geo) {
        const continent = COUNTRY_TO_CONTINENT[geo];
        if (continent) setSelectedRegion(continent);
      }
    }
    if (tab !== 'regional') setSelectedRegion('');
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
                {profileData.activationUrl && (
                <button onClick={() => copyText(profileData.activationUrl!)}
                  className="w-full p-3 rounded bg-wr-base border border-wr-border text-xs font-mono text-wr-green break-all text-left hover:border-wr-green/50 transition-colors cursor-pointer flex items-center justify-between gap-2">
                  <span className="truncate">{profileData.activationUrl}</span>
                  {copied ? <Check size={14} className="text-green-500 shrink-0" /> : <Copy size={14} className="text-wr-dim shrink-0" />}
                </button>
                )}
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
                <p className="text-xs text-wr-dim">{t('esim.provisioning')}</p>
                <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-accent hover:underline text-[10px] block text-center">
                  Need help? @kyc_rip_bot
                </a>
              </div>
            )}

            <div className="border-t border-wr-border/30 pt-4 space-y-2">
              <div className="text-xs text-wr-dim">Order: {purchase.orderId.includes(':') ? purchase.orderId.split(':').slice(1).join(':') : purchase.orderId}</div>
              {purchase.charged > 0 && <div className="text-xs text-wr-dim">Charged: ${purchase.charged.toFixed(2)} — Wallet: ${balanceUSD.toFixed(2)}</div>}
            </div>

            <div className="bg-wr-base border border-wr-border/50 rounded p-4 text-left space-y-2">
              <h4 className="text-xs font-bold uppercase text-wr-accent tracking-widest">{t('esim.installation_guide')}</h4>
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
            <div className="mx-auto w-16 h-16 rounded-full bg-wr-accent/10 flex items-center justify-center text-wr-accent border border-wr-accent/20 mb-4">
              <Smartphone size={40} />
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mb-2">
              <span className="text-wr-accent">{t('esim.title_e')}</span>{t('esim.title_sim')}
              <span className="text-wr-dim text-lg md:text-2xl ml-3 font-normal">aggregator</span>
            </h1>
            <p className="text-wr-dim text-sm">{t('esim.compare_subtitle')}</p>
            <a href="/esim/topup" className="inline-flex items-center gap-1.5 mt-3 text-xs text-wr-accent/80 hover:text-wr-accent border border-wr-accent/20 hover:border-wr-accent/50 rounded-full px-4 py-1.5 transition-all">
              <Zap size={12} /> {t('esim.topup_link', 'Top up an existing eSIM')}
            </a>
          </div>

          {/* COMING SOON / NOT CONFIGURED */}
          {notConfigured && (
            <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-accent/30 p-6 md:p-8 rounded-sm text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-wr-accent/10 flex items-center justify-center text-wr-accent border border-wr-accent/20">
                <Signal size={24} />
              </div>
              <h2 className="text-wr-accent font-bold tracking-widest text-sm uppercase">{t('esim.coming_soon')}</h2>
              <p className="text-xs text-wr-dim max-w-md mx-auto leading-relaxed">
                {t('esim.coming_soon_desc')}
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {[t('esim.tag_no_kyc'), t('esim.tag_no_reg'), t('esim.tag_global'), t('esim.tag_instant'), t('esim.tag_pay')].map(tag => (
                  <span key={tag} className="text-xs px-3 py-1.5 rounded-full border border-wr-accent/20 text-wr-accent/70">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!notConfigured && (
            <>
              {/* WALLET BANNER — same structure as SMS */}
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
                          ? t('esim.wallet_shared')
                          : t('esim.wallet_shared_new')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="relative z-10 w-full md:w-auto px-6 py-3 bg-green-500 hover:bg-green-400 text-black text-xs font-bold tracking-widest uppercase transition-all rounded-sm flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 hover:-translate-y-0.5"
                  >
                    <Plus size={14} /> {walletToken ? t('sms.top_up') : t('sms.deposit')} <ChevronRight size={14} />
                  </button>
                </div>

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

              {/* TABBED BROWSING + COMPARISON TABLE */}
              <div className="bg-wr-surface border border-wr-border p-4 md:p-10 relative overflow-hidden shadow-2xl mx-2 md:mx-0">
                <div className="relative z-10 space-y-6 md:space-y-8">

                  {/* Tab Buttons */}
                  <div className="flex gap-1 border-b border-wr-border/30 pb-0">
                    {([
                      { key: 'country' as BrowseTab, label: t('esim.tab_country'), icon: <Globe size={12} /> },
                      { key: 'regional' as BrowseTab, label: t('esim.tab_regional'), icon: <MapPin size={12} /> },
                      { key: 'global' as BrowseTab, label: t('esim.tab_global'), icon: <Wifi size={12} /> },
                    ]).map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-all border-b-2 -mb-px ${
                          activeTab === tab.key
                            ? 'border-wr-accent text-wr-accent'
                            : 'border-transparent text-wr-dim hover:text-current hover:border-wr-border'
                        }`}
                      >
                        {tab.icon} {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* ═══ TAB: Country ═══ */}
                  {activeTab === 'country' && (
                    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 md:gap-8">
                      {/* LEFT: Country Selection */}
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                          <Globe size={12} className="text-wr-accent" /> {t('esim.select_country')}
                        </label>
                        <div className="relative">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                          <input type="text" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} placeholder={t('esim.search_countries')}
                            className="w-full pl-10 pr-3 py-3 bg-wr-base border-2 border-wr-border outline-none font-mono text-sm transition-all rounded-sm focus:border-wr-accent text-current placeholder-wr-dim/30" />
                        </div>
                        {/* Popular countries */}
                        <div className="flex flex-wrap gap-1.5">
                          {POPULAR_COUNTRIES.map(code => {
                            const country = countries.find((c: MergedCountry) => c.code === code);
                            if (!country) return null;
                            return (
                              <button key={code} onClick={() => { setSelectedCountry(code); scrollToPlans(); }} title={country.name}
                                className={`text-xs px-2.5 py-1.5 rounded-full border font-bold transition-all flex items-center gap-1.5 ${selectedCountry === code ? 'border-wr-accent text-wr-accent bg-wr-accent/10' : 'border-wr-border text-wr-dim hover:border-wr-accent/30 hover:text-wr-accent'}`}>
                                <img src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`} alt={code} className="w-4 h-3 object-cover rounded-xs" />
                                {code}
                              </button>
                            );
                          })}
                        </div>
                        <div className="border-t border-wr-border/30" />
                        {/* All countries */}
                        <div className="flex flex-col gap-0.5 max-h-[400px] overflow-y-auto pr-1">
                          {filteredCountries.map(c => (
                            <button key={c.code} onClick={() => { setSelectedCountry(c.code); scrollToPlans(); }}
                              className={`text-xs px-3 py-2 rounded transition-all flex items-center gap-2 text-left ${selectedCountry === c.code ? 'bg-wr-accent/15 text-wr-accent font-bold' : 'text-current hover:bg-wr-surface hover:text-wr-accent'}`}>
                              <img src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`} alt={c.code} className="w-4 h-3 object-cover rounded-xs opacity-70" />
                              <span className="truncate">{c.name}</span>
                            </button>
                          ))}
                          {filteredCountries.length === 0 && !loading && (
                            <div className="text-xs text-wr-dim py-4 w-full text-center">{t('esim.no_countries')}</div>
                          )}
                        </div>
                      </div>

                      {/* RIGHT: Plans */}
                      {selectedCountry ? (
                        <div ref={plansRef} className="space-y-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                              <Wifi size={12} className="text-wr-accent" />
                              {selectedCountryName && (
                                <span className="text-wr-accent normal-case">{selectedCountryName} —</span>
                              )}
                              {t('esim.compare_title')}
                            </label>
                          </div>

                          {loadingPlans ? (
                            <div className="flex flex-col items-center gap-3 text-wr-dim text-xs py-12 justify-center">
                              <RefreshCw size={20} className="animate-spin text-wr-accent" />
                              <span className="tracking-widest uppercase">{t('esim.loading_compare')}</span>
                            </div>
                          ) : comparePlans.length > 0 ? (
                            <>
                              {/* Filter toolbar */}
                              <div className="flex flex-col gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <SlidersHorizontal size={10} className="text-wr-dim shrink-0" />
                                  <div className="flex gap-1 flex-wrap">
                                    {DATA_FILTERS.map((df, i) => (
                                      <button key={df.label} onClick={() => setDataFilter(i)}
                                        className={`text-xs px-2.5 py-1 rounded border font-mono transition-all ${dataFilter === i ? 'border-wr-accent text-wr-accent bg-wr-accent/15' : 'border-wr-border/50 text-wr-dim hover:border-wr-dim'}`}>
                                        {df.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Clock size={10} className="text-wr-dim shrink-0" />
                                  <div className="flex gap-1 flex-wrap">
                                    {DURATION_FILTERS.map((durf, i) => (
                                      <button key={durf.label} onClick={() => setDurationFilter(i)}
                                        className={`text-xs px-2.5 py-1 rounded border font-mono transition-all ${durationFilter === i ? 'border-wr-accent text-wr-accent bg-wr-accent/15' : 'border-wr-border/50 text-wr-dim hover:border-wr-dim'}`}>
                                        {durf.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Sort controls */}
                              <div className="flex items-center gap-1.5">
                                <ArrowUpDown size={10} className="text-wr-dim shrink-0" />
                                {(['price', 'data', 'duration'] as SortKey[]).map(key => (
                                  <button key={key} onClick={() => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(true); } }}
                                    className={`text-xs px-2.5 py-1 rounded border font-mono transition-all ${sortKey === key ? 'border-wr-accent text-wr-accent bg-wr-accent/15' : 'border-wr-border/50 text-wr-dim hover:border-wr-dim'}`}>
                                    {key === 'price' ? 'Price' : key === 'data' ? 'Data' : 'Duration'} {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}
                                  </button>
                                ))}
                              </div>

                              {/* Plan cards grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
                                {filteredPlans.slice(0, visiblePlans).map((plan) => {
                                  const isCheapest = plan.id === filteredCheapestId;
                                  const pricePerGB = plan.dataGB > 0 ? +(plan.price / plan.dataGB).toFixed(2) : plan.price;

                                  return (
                                    <div
                                      key={plan.id}
                                      className={`group relative flex flex-col p-4 rounded-sm border transition-all hover:shadow-lg ${
                                        isCheapest
                                          ? 'border-wr-green/60 bg-wr-green/5 shadow-[0_0_20px_rgba(0,255,65,0.08)]'
                                          : 'border-wr-border/50 bg-wr-base hover:border-wr-accent/30'
                                      }`}
                                    >
                                      {isCheapest && (
                                        <div className="absolute -top-2 left-3 px-2 py-0.5 bg-wr-green text-black text-xs font-black tracking-widest uppercase rounded-xs shadow-lg shadow-wr-green/30">
                                          {t('esim.best_price')}
                                        </div>
                                      )}

                                      {/* Flag */}
                                      <div className="flex items-center justify-end mt-1">
                                        {plan.country && plan.country.length === 2 && /^[A-Z]{2}$/.test(plan.country) ? (
                                          <img src={`https://flagcdn.com/w40/${plan.country.toLowerCase()}.png`} alt={plan.country} className="w-5 h-3.5 object-cover rounded-xs opacity-70" />
                                        ) : (
                                          <span className="text-sm opacity-50">🌍</span>
                                        )}
                                      </div>

                                      {/* Data + Duration */}
                                      <div className="flex items-baseline justify-between gap-2 mt-2">
                                        <span className={`text-lg font-black font-mono ${isCheapest ? 'text-wr-green' : 'text-current'}`}>
                                          {plan.dataGB}GB
                                        </span>
                                        <span className="flex items-center gap-1 text-xs text-wr-dim">
                                          <Clock size={10} /> {plan.durationDays}d
                                        </span>
                                      </div>

                                      <span className="text-[11px] text-wr-dim/60 mt-0.5">{(plan as any).speed || '3G/4G/5G'}</span>

                                      <div className="mt-3">
                                        <div className={`text-xl font-black font-mono ${isCheapest ? 'text-wr-green' : 'text-current'}`}>
                                          ${plan.price.toFixed(2)}
                                        </div>
                                        <div className="text-[11px] text-wr-dim/50 font-mono">${pricePerGB}{t('esim.per_gb')}</div>
                                      </div>

                                      <button
                                        onClick={() => setSelectedPlanDetail(plan)}
                                        className={`w-full mt-3 py-2 text-xs font-bold tracking-widest uppercase rounded-sm border transition-all flex items-center justify-center ${
                                            isCheapest
                                              ? 'border-wr-green text-wr-green hover:bg-wr-green hover:text-black shadow-[0_0_10px_rgba(0,255,65,0.15)]'
                                              : 'border-wr-accent/40 text-wr-accent hover:bg-wr-accent hover:text-black'
                                        }`}
                                      >
                                        {t('esim.buy')}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>

                              {visiblePlans < filteredPlans.length && (
                                <div className="text-center pt-2">
                                  <button
                                    onClick={() => setVisiblePlans(v => v + PLANS_PER_PAGE)}
                                    className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest border border-wr-accent/40 text-wr-accent rounded-sm hover:bg-wr-accent hover:text-black transition-all"
                                  >
                                    {t('esim.show_more', 'Show More')} ({filteredPlans.length - visiblePlans} {t('esim.remaining', 'remaining')})
                                  </button>
                                </div>
                              )}

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
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <Globe size={40} className="text-wr-dim/30 mb-4" />
                          <p className="text-sm text-wr-dim">{t('esim.select_country_prompt', 'Select a territory to browse available plans')}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ TAB: Regional ═══ */}
                  {activeTab === 'regional' && (
                    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 md:gap-8">
                      {/* LEFT: Region Selection */}
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                          <MapPin size={12} className="text-wr-accent" /> {t('esim.select_region')}
                        </label>
                        {loadingAllPlans ? (
                          <div className="flex flex-col items-center gap-3 text-wr-dim text-xs py-12 justify-center">
                            <RefreshCw size={20} className="animate-spin text-wr-accent" />
                            <span className="tracking-widest uppercase">{t('esim.loading_all_plans')}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {Object.keys(REGIONS).map(region => {
                              const count = regionCounts[region] || 0;
                              const isSelected = selectedRegion === region;
                              return (
                                <button
                                  key={region}
                                  onClick={() => { setSelectedRegion(isSelected ? '' : region); if (window.innerWidth < 768) setTimeout(() => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }}
                                  className={`p-3 rounded-sm border text-left transition-all ${
                                    isSelected
                                      ? 'border-wr-accent bg-wr-accent/10'
                                      : 'border-wr-border hover:border-wr-accent/40 bg-wr-base'
                                  }`}
                                >
                                  <div className={`text-xs font-bold tracking-wider uppercase ${isSelected ? 'text-wr-accent' : 'text-current'}`}>
                                    {t(REGION_I18N_KEYS[region] || region)}
                                  </div>
                                  {count > 0 && (
                                    <div className="text-[10px] text-wr-dim mt-0.5">{count} {t('esim.plans_available', 'plans')}</div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* RIGHT: Regional Plans */}
                      {selectedRegion ? (
                        <div ref={plansRef} className="space-y-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                              <Wifi size={12} className="text-wr-accent" /> {t('esim.regional_plans')} — {t(REGION_I18N_KEYS[selectedRegion] || selectedRegion)}
                            </label>
                          </div>

                          {tabPlans.length > 0 ? (
                            <>
                              {/* Filter toolbar */}
                              <div className="flex flex-col gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <SlidersHorizontal size={10} className="text-wr-dim shrink-0" />
                                  <div className="flex gap-1 flex-wrap">
                                    {DATA_FILTERS.map((df, i) => (
                                      <button key={df.label} onClick={() => setDataFilter(i)}
                                        className={`text-xs px-2.5 py-1 rounded border font-mono transition-all ${dataFilter === i ? 'border-wr-accent text-wr-accent bg-wr-accent/15' : 'border-wr-border/50 text-wr-dim hover:border-wr-dim'}`}>
                                        {df.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Clock size={10} className="text-wr-dim shrink-0" />
                                  <div className="flex gap-1 flex-wrap">
                                    {DURATION_FILTERS.map((durf, i) => (
                                      <button key={durf.label} onClick={() => setDurationFilter(i)}
                                        className={`text-xs px-2.5 py-1 rounded border font-mono transition-all ${durationFilter === i ? 'border-wr-accent text-wr-accent bg-wr-accent/15' : 'border-wr-border/50 text-wr-dim hover:border-wr-dim'}`}>
                                        {durf.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Sort controls */}
                              <div className="flex items-center gap-1.5">
                                <ArrowUpDown size={10} className="text-wr-dim shrink-0" />
                                {(['price', 'data', 'duration'] as SortKey[]).map(key => (
                                  <button key={key} onClick={() => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(true); } }}
                                    className={`text-xs px-2.5 py-1 rounded border font-mono transition-all ${sortKey === key ? 'border-wr-accent text-wr-accent bg-wr-accent/15' : 'border-wr-border/50 text-wr-dim hover:border-wr-dim'}`}>
                                    {key === 'price' ? 'Price' : key === 'data' ? 'Data' : 'Duration'} {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}
                                  </button>
                                ))}
                              </div>

                              {/* Plan cards grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
                                {tabPlans.slice(0, visiblePlans).map((plan) => {
                                  const isCheapest = plan.id === tabCheapestId;
                                  const pricePerGB = plan.dataGB > 0 ? +(plan.price / plan.dataGB).toFixed(2) : plan.price;

                                  return (
                                    <div
                                      key={plan.id}
                                      className={`group relative flex flex-col p-4 rounded-sm border transition-all hover:shadow-lg ${
                                        isCheapest
                                          ? 'border-wr-green/60 bg-wr-green/5 shadow-[0_0_20px_rgba(0,255,65,0.08)]'
                                          : 'border-wr-border/50 bg-wr-base hover:border-wr-accent/30'
                                      }`}
                                    >
                                      {isCheapest && (
                                        <div className="absolute -top-2 left-3 px-2 py-0.5 bg-wr-green text-black text-xs font-black tracking-widest uppercase rounded-xs shadow-lg shadow-wr-green/30">
                                          {t('esim.best_price')}
                                        </div>
                                      )}

                                      {/* Flag */}
                                      <div className="flex items-center justify-end mt-1">
                                        {plan.country && plan.country.length === 2 && /^[A-Z]{2}$/.test(plan.country) ? (
                                          <img src={`https://flagcdn.com/w40/${plan.country.toLowerCase()}.png`} alt={plan.country} className="w-5 h-3.5 object-cover rounded-xs opacity-70" />
                                        ) : (
                                          <span className="text-sm opacity-50">🌍</span>
                                        )}
                                      </div>

                                      {/* Data + Duration */}
                                      <div className="flex items-baseline justify-between gap-2 mt-2">
                                        <span className={`text-lg font-black font-mono ${isCheapest ? 'text-wr-green' : 'text-current'}`}>
                                          {plan.dataGB}GB
                                        </span>
                                        <span className="flex items-center gap-1 text-xs text-wr-dim">
                                          <Clock size={10} /> {plan.durationDays}d
                                        </span>
                                      </div>

                                      <span className="text-[11px] text-wr-dim/60 mt-0.5">{(plan as any).speed || '3G/4G/5G'}</span>

                                      <div className="mt-3">
                                        <div className={`text-xl font-black font-mono ${isCheapest ? 'text-wr-green' : 'text-current'}`}>
                                          ${plan.price.toFixed(2)}
                                        </div>
                                        <div className="text-[11px] text-wr-dim/50 font-mono">${pricePerGB}{t('esim.per_gb')}</div>
                                      </div>

                                      <button
                                        onClick={() => setSelectedPlanDetail(plan)}
                                        className={`w-full mt-3 py-2 text-xs font-bold tracking-widest uppercase rounded-sm border transition-all flex items-center justify-center ${
                                            isCheapest
                                              ? 'border-wr-green text-wr-green hover:bg-wr-green hover:text-black shadow-[0_0_10px_rgba(0,255,65,0.15)]'
                                              : 'border-wr-accent/40 text-wr-accent hover:bg-wr-accent hover:text-black'
                                        }`}
                                      >
                                        {t('esim.buy')}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                              {visiblePlans < tabPlans.length && (
                                <div className="text-center pt-2">
                                  <button onClick={() => setVisiblePlans(v => v + PLANS_PER_PAGE)}
                                    className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest border border-wr-accent/40 text-wr-accent rounded-sm hover:bg-wr-accent hover:text-black transition-all">
                                    {t('esim.show_more', 'Show More')} ({tabPlans.length - visiblePlans} {t('esim.remaining', 'remaining')})
                                  </button>
                                </div>
                              )}
                            </>
                          ) : regionalPlans.length === 0 ? (
                            <div className="flex items-start gap-2 text-xs text-wr-dim p-4 rounded bg-wr-base border border-wr-border/50 justify-center">
                              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-wr-warning" />
                              <span>{t('esim.no_regional_plans')}</span>
                            </div>
                          ) : (
                            <div className="text-center py-6 text-xs text-wr-dim">
                              No plans match the current filters. Try adjusting the data size or provider filters.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <MapPin size={40} className="text-wr-dim/30 mb-4" />
                          <p className="text-sm text-wr-dim">{t('esim.select_region_prompt', 'Select a region to browse available plans')}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ TAB: Global ═══ */}
                  {activeTab === 'global' && (
                    <div className="space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                          <Wifi size={12} className="text-wr-accent" /> {t('esim.global_plans')}
                        </label>
                      </div>

                      {loadingAllPlans ? (
                        <div className="flex flex-col items-center gap-3 text-wr-dim text-xs py-12 justify-center">
                          <RefreshCw size={20} className="animate-spin text-wr-accent" />
                          <span className="tracking-widest uppercase">{t('esim.loading_all_plans')}</span>
                        </div>
                      ) : tabPlans.length > 0 ? (
                        <>
                          {/* Filter toolbar */}
                          <div className="flex flex-col md:flex-row gap-3 md:items-center">
                            <div className="flex items-center gap-1.5">
                              <SlidersHorizontal size={10} className="text-wr-dim shrink-0" />
                              <div className="flex gap-1">
                                {DATA_FILTERS.map((df, i) => (
                                  <button key={df.label} onClick={() => setDataFilter(i)}
                                    className={`text-xs px-2.5 py-1 rounded border font-mono transition-all ${dataFilter === i ? 'border-wr-accent text-wr-accent bg-wr-accent/15' : 'border-wr-border/50 text-wr-dim hover:border-wr-dim'}`}>
                                    {df.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Plan cards grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
                            {tabPlans.map((plan) => {
                              const isCheapest = plan.id === tabCheapestId;
                              const pricePerGB = plan.dataGB > 0 ? +(plan.price / plan.dataGB).toFixed(2) : plan.price;

                              return (
                                <div
                                  key={plan.id}
                                  className={`group relative flex flex-col p-4 rounded-sm border transition-all hover:shadow-lg ${
                                    isCheapest
                                      ? 'border-wr-green/60 bg-wr-green/5 shadow-[0_0_20px_rgba(0,255,65,0.08)]'
                                      : 'border-wr-border/50 bg-wr-base hover:border-wr-accent/30'
                                  }`}
                                >
                                  {isCheapest && (
                                    <div className="absolute -top-2 left-3 px-2 py-0.5 bg-wr-green text-black text-xs font-black tracking-widest uppercase rounded-xs shadow-lg shadow-wr-green/30">
                                      {t('esim.best_price')}
                                    </div>
                                  )}

                                  <div className="flex items-baseline justify-between gap-2 mt-1">
                                    <span className={`text-lg font-black font-mono ${isCheapest ? 'text-wr-green' : 'text-current'}`}>
                                      {plan.dataGB}GB
                                    </span>
                                    <span className="flex items-center gap-1 text-xs text-wr-dim">
                                      <Clock size={10} /> {plan.durationDays}d
                                    </span>
                                  </div>

                                  <span className="text-[11px] text-wr-dim/60 mt-0.5">3G/4G/5G</span>

                                  <div className="mt-3">
                                    <div className={`text-xl font-black font-mono ${isCheapest ? 'text-wr-green' : 'text-current'}`}>
                                      ${plan.price.toFixed(2)}
                                    </div>
                                    <div className="text-[11px] text-wr-dim/50 font-mono">${pricePerGB}{t('esim.per_gb')}</div>
                                  </div>

                                  <button
                                    onClick={() => setSelectedPlanDetail(plan)}
                                    className={`w-full mt-3 py-2 text-xs font-bold tracking-widest uppercase rounded-sm border transition-all flex items-center justify-center ${
                                        isCheapest
                                          ? 'border-wr-green text-wr-green hover:bg-wr-green hover:text-black shadow-[0_0_10px_rgba(0,255,65,0.15)]'
                                          : 'border-wr-accent/40 text-wr-accent hover:bg-wr-accent hover:text-black'
                                    }`}
                                  >
                                    {t('esim.buy')}
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          {visiblePlans < tabPlans.length && (
                            <div className="text-center pt-2">
                              <button onClick={() => setVisiblePlans(v => v + PLANS_PER_PAGE)}
                                className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest border border-wr-accent/40 text-wr-accent rounded-sm hover:bg-wr-accent hover:text-black transition-all">
                                {t('esim.show_more', 'Show More')} ({tabPlans.length - visiblePlans} {t('esim.remaining', 'remaining')})
                              </button>
                            </div>
                          )}

                          {tabPlans.length === 0 && globalPlans.length > 0 && (
                            <div className="text-center py-6 text-xs text-wr-dim">
                              No plans match the current filters. Try adjusting the data size or provider filters.
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-start gap-2 text-xs text-wr-dim p-4 rounded bg-wr-base border border-wr-border/50 justify-center">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-wr-warning" />
                          <span>{t('esim.no_global_plans')}</span>
                        </div>
                      )}
                    </div>
                  )}

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
                    <h4 className="text-xs font-bold uppercase text-wr-accent mb-1">{item.title}</h4>
                    <p className="text-xs text-wr-dim">{item.desc}</p>
                  </div>
                ))}
              </div>

              {/* ═══ WHY CHOOSE WALLS.RIP FOR ESIM ═══ */}
              <div className="mx-2 md:mx-0 space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="font-mono text-sm md:text-base font-bold uppercase tracking-widest text-current">
                    {t('esim.why_title')}
                  </h2>
                  <div className="mx-auto w-12 h-px bg-wr-accent" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {([
                    { icon: <Zap size={18} />, title: t('esim.why_instant_title'), desc: t('esim.why_instant_desc') },
                    { icon: <Globe size={18} />, title: t('esim.why_global_title'), desc: t('esim.why_global_desc') },
                    { icon: <Shield size={18} />, title: t('esim.why_anonymous_title'), desc: t('esim.why_anonymous_desc') },
                    { icon: <DollarSign size={18} />, title: t('esim.why_compare_title'), desc: t('esim.why_compare_desc') },
                    { icon: <RefreshCw size={18} />, title: t('esim.why_topup_title'), desc: t('esim.why_topup_desc') },
                    { icon: <MapPin size={18} />, title: t('esim.why_local_title'), desc: t('esim.why_local_desc') },
                    { icon: <Wifi size={18} />, title: t('esim.why_speed_title'), desc: t('esim.why_speed_desc') },
                  ]).map((card) => (
                    <div key={card.title} className="p-4 rounded-sm border border-wr-border bg-wr-surface space-y-2 hover:border-wr-accent/30 transition-colors">
                      <div className="text-wr-accent">{card.icon}</div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-current">{card.title}</h3>
                      <p className="text-xs text-wr-dim leading-relaxed">{card.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ═══ HOW TO USE ESIM ═══ */}
              <div className="mx-2 md:mx-0 space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="font-mono text-sm md:text-base font-bold uppercase tracking-widest text-current">
                    {t('esim.how_title')}
                  </h2>
                  <div className="mx-auto w-12 h-px bg-wr-accent" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-0 relative">
                  {/* Connector lines (desktop only) */}
                  <div className="hidden md:block absolute top-8 left-[calc(33.33%+0.5rem)] right-[calc(33.33%+0.5rem)] h-px bg-wr-accent/30" />
                  {([
                    { num: '01', icon: <Search size={20} />, title: t('esim.how_step1_title'), desc: t('esim.how_step1_desc') },
                    { num: '02', icon: <Shield size={20} />, title: t('esim.how_step2_title'), desc: t('esim.how_step2_desc') },
                    { num: '03', icon: <Smartphone size={20} />, title: t('esim.how_step3_title'), desc: t('esim.how_step3_desc') },
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
                    {t('esim.faq_title')}
                  </h2>
                  <div className="mx-auto w-12 h-px bg-wr-accent" />
                </div>
                <div className="space-y-2">
                  {([1, 2, 3, 4, 5, 6, 7, 8] as const).map((n) => {
                    const isOpen = faqOpen === n;
                    return (
                      <div key={n} className="border border-wr-border rounded-sm bg-wr-surface overflow-hidden">
                        <button
                          onClick={() => setFaqOpen(isOpen ? null : n)}
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-wr-base/50 transition-colors"
                        >
                          <span className="text-xs font-bold text-current pr-4">{t(`esim.faq_q${n}`)}</span>
                          <ChevronDown
                            size={16}
                            className={`text-wr-accent shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                        <div
                          className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-60' : 'max-h-0'}`}
                        >
                          <div className="px-4 pb-4 text-xs text-wr-dim leading-relaxed border-t border-wr-border/30 pt-3">
                            {t(`esim.faq_a${n}`)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />

      {/* ═══ UNIFIED PLAN DETAIL + PAYMENT MODAL ═══ */}
      {selectedPlanDetail && (() => {
        const plan = selectedPlanDetail;
        const countryName = countries.find(c => c.code === plan.country)?.name || plan.country;
        const isGlobal = isGlobalPlan(plan);
        const isRegional = isRegionalPlan(plan);
        const locationLabel = isGlobal ? 'Global (120+ areas)' : isRegional ? plan.country : countryName;
        const hasSufficientBalance = walletToken !== null && balanceUSD >= plan.price;
        const modalMaxW = modalStep === 'details' ? 'max-w-lg' : 'max-w-xl';

        return (
          <div className="fixed inset-0 bg-wr-base/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300" onClick={() => { if (modalStep === 'details') setSelectedPlanDetail(null); }}>
            <div className={`border border-wr-border bg-wr-base ${modalMaxW} w-full relative shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden rounded-sm max-h-[90vh] overflow-y-auto transition-all duration-300`} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="p-4 md:p-6 border-b border-wr-border/30 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm md:text-base font-bold text-current tracking-wide leading-tight">{plan.name}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs px-2.5 py-1 rounded border border-wr-accent/30 text-wr-accent bg-wr-accent/10 font-mono uppercase tracking-wider">
                    {isGlobal ? 'Global' : plan.country}
                  </span>
                  <button onClick={() => setSelectedPlanDetail(null)} className="text-wr-dim hover:text-current transition-colors"><X size={18} /></button>
                </div>
              </div>

              <div className="p-4 md:p-6 space-y-5">

                {/* ═══ STEP: DETAILS ═══ */}
                {modalStep === 'details' && (
                  <>
                    {/* Plan Details Grid (2x2) */}
                    <div>
                      <h4 className="text-xs font-bold uppercase text-wr-dim tracking-widest mb-3">{t('esim.detail_plan_details')}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 rounded-sm border border-wr-border/50 bg-wr-surface/30 flex items-center gap-3">
                          <div className="p-2 bg-wr-accent/10 text-wr-accent rounded-sm border border-wr-accent/20"><Database size={14} /></div>
                          <div>
                            <div className="text-[11px] text-wr-dim uppercase tracking-widest">{t('esim.detail_data')}</div>
                            <div className="text-sm font-black font-mono text-current">{plan.dataGB} GB</div>
                          </div>
                        </div>
                        <div className="p-3 rounded-sm border border-wr-border/50 bg-wr-surface/30 flex items-center gap-3">
                          <div className="p-2 bg-wr-accent/10 text-wr-accent rounded-sm border border-wr-accent/20"><Clock size={14} /></div>
                          <div>
                            <div className="text-[11px] text-wr-dim uppercase tracking-widest">{t('esim.detail_duration')}</div>
                            <div className="text-sm font-black font-mono text-current">{plan.durationDays} {t('esim.detail_days')}</div>
                          </div>
                        </div>
                        <div className="p-3 rounded-sm border border-wr-border/50 bg-wr-surface/30 flex items-center gap-3">
                          <div className="p-2 bg-wr-accent/10 text-wr-accent rounded-sm border border-wr-accent/20"><Zap size={14} /></div>
                          <div>
                            <div className="text-[11px] text-wr-dim uppercase tracking-widest">{t('esim.detail_speed')}</div>
                            <div className="text-sm font-black font-mono text-current">3G/4G/5G</div>
                          </div>
                        </div>
                        <div className="p-3 rounded-sm border border-wr-green/30 bg-wr-green/5 flex items-center gap-3">
                          <div className="p-2 bg-wr-green/10 text-wr-green rounded-sm border border-wr-green/20"><DollarSign size={14} /></div>
                          <div>
                            <div className="text-[11px] text-wr-dim uppercase tracking-widest">{t('esim.detail_price')}</div>
                            <div className="text-sm font-black font-mono text-wr-green">${plan.price.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Additional Info (2-column layout) */}
                    <div>
                      <h4 className="text-xs font-bold uppercase text-wr-dim tracking-widest mb-3">{t('esim.detail_additional_info')}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0 text-xs">
                        <div className="flex items-center justify-between py-2 border-b border-wr-border/20">
                          <span className="text-wr-dim flex items-center gap-1.5 shrink-0"><MapPin size={10} /> {t('esim.detail_location')}</span>
                          <span className="font-mono text-current text-right truncate ml-2">{locationLabel}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-wr-border/20">
                          <span className="text-wr-dim shrink-0">{t('esim.detail_topup')}</span>
                          <span className="font-mono text-wr-dim">--</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-wr-border/20">
                          <span className="text-wr-dim shrink-0">{t('esim.detail_activation')}</span>
                          <span className="font-mono text-current text-right">{t('esim.detail_first_install')}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-wr-border/20">
                          <span className="text-wr-dim flex items-center gap-1.5 shrink-0"><Shield size={10} /> {t('esim.detail_ip_location')}</span>
                          <span className="flex items-center gap-1 ml-2">
                            <span className="font-mono text-wr-accent text-right truncate">{plan.country}</span>
                            <span className="text-[11px] px-1.5 py-0.5 bg-wr-accent/10 border border-wr-accent/20 rounded-full whitespace-nowrap">{t('esim.detail_standard_privacy')}</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-wr-border/20">
                          <span className="text-wr-dim flex items-center gap-1.5 shrink-0"><Wifi size={10} /> {t('esim.detail_hotspot')}</span>
                          <span className="font-mono text-current">{t('common.yes')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Coverage */}
                    <div className="flex items-center gap-2 p-3 rounded-sm bg-wr-surface/30 border border-wr-border/30">
                      <Globe size={14} className="text-wr-accent shrink-0" />
                      <div>
                        <div className="text-[11px] text-wr-dim uppercase tracking-widest">{t('esim.detail_coverage')}</div>
                        <div className="text-xs font-mono text-current">{locationLabel}</div>
                      </div>
                    </div>

                    {/* Network Coverage List */}
                    {(plan as any).coverage && (plan as any).coverage.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase text-wr-dim tracking-widest">
                          {t('esim.detail_coverage')} ({(plan as any).coverage.length} {t('esim.detail_countries')})
                        </h4>
                        <div className="max-h-40 overflow-y-auto rounded-sm border border-wr-border/30 bg-wr-base/50 p-2 space-y-1">
                          {(plan as any).coverage.map((c: { country: string; operators: { name: string; networkType: string }[] }, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs py-0.5 border-b border-wr-border/10 last:border-0">
                              <span className="text-current font-medium">{c.country}</span>
                              <span className="text-wr-dim">
                                {c.operators.length > 0
                                  ? c.operators.map(o => `${o.name} (${o.networkType})`).join(', ')
                                  : '--'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Important Notices */}
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold uppercase text-wr-dim tracking-widest">{t('esim.detail_important_notices')}</h4>
                      <ul className="space-y-1">
                        <li className="text-xs text-wr-dim/70 flex items-start gap-1.5">
                          <AlertTriangle size={10} className="shrink-0 mt-0.5 text-wr-warning/50" />
                          {t('esim.detail_notice_data_only')}
                        </li>
                        <li className="text-xs text-wr-dim/70 flex items-start gap-1.5">
                          <AlertTriangle size={10} className="shrink-0 mt-0.5 text-wr-warning/50" />
                          {t('esim.detail_notice_no_refund')}
                        </li>
                        <li className="text-xs text-wr-dim/70 flex items-start gap-1.5">
                          <AlertTriangle size={10} className="shrink-0 mt-0.5 text-wr-warning/50" />
                          {t('esim.detail_notice_compatibility')}
                        </li>
                      </ul>
                    </div>

                    {/* Wallet balance indicator */}
                    {walletToken && (
                      <div className="flex items-center gap-2 text-xs border-t border-wr-border/30 pt-4">
                        <Wallet size={12} className="text-wr-accent" />
                        <span className="text-wr-dim">{t('sms.wallet_balance')}:</span>
                        <span className={`font-mono font-bold ${hasSufficientBalance ? 'text-wr-green' : 'text-wr-warning'}`}>
                          ${balanceUSD.toFixed(2)}
                        </span>
                        {hasSufficientBalance && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-wr-green/10 border border-wr-green/20 rounded-full text-wr-green">
                            {t('esim.sufficient_balance', 'Sufficient')}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Purchase or deposit via PaymentGate */}
                    {hasSufficientBalance ? (
                      <div className="flex items-center gap-3 pt-2 border-t border-wr-border/30">
                        <button
                          onClick={() => setSelectedPlanDetail(null)}
                          className="px-4 py-2.5 text-xs text-wr-dim hover:text-current transition-colors uppercase tracking-widest"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={() => handleModalPurchase(plan)}
                          className="flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-sm shadow-lg transition-all flex items-center justify-center gap-2 bg-wr-green text-black hover:bg-wr-green/90 shadow-wr-green/20"
                        >
                          <Check size={14} /> {t('esim.detail_confirm_purchase')}
                        </button>
                      </div>
                    ) : (
                      <div className="border-t border-wr-border/30 pt-4">
                        <PaymentGate
                          amount={plan.price}
                          methods={['XMR', 'LN', 'XMR402', 'USDT']}
                          walletToken={walletToken || undefined}
                          serviceName="esim"
                          createEndpoint="/v1/tools/esim/payment/create"
                          checkEndpoint="/v1/tools/sms/payment/check"
                          inline={true}
                          onWalletCreated={(token) => {
                            if (!walletToken) {
                              setWalletToken(token);
                              localStorage.setItem(WALLET_KEY, token);
                            }
                          }}
                          onDeposit={(usd) => {
                            handlePaymentDeposit(usd, { planId: plan.id, engine: plan.engine, country: plan.country });
                          }}
                        />
                        <div className="text-xs text-wr-accent/60 text-center mt-3">
                          {t('esim.auto_purchase_esim', 'eSIM will be purchased automatically after payment')}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ═══ STEP: PURCHASING (after payment confirmed, buying eSIM) ═══ */}
                {modalStep === 'purchasing' && (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-wr-green/10 flex items-center justify-center border border-wr-green/30">
                        <Smartphone size={28} className="text-wr-green animate-pulse" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-wr-accent/20 flex items-center justify-center border border-wr-accent/30">
                        <RefreshCw size={12} className="animate-spin text-wr-accent" />
                      </div>
                    </div>
                    <p className="text-sm font-bold text-wr-green tracking-wider uppercase">Payment confirmed!</p>
                    <p className="text-xs text-wr-dim">Purchasing your eSIM plan...</p>
                  </div>
                )}

                {/* ═══ STEP: SUCCESS ═══ */}
                {modalStep === 'success' && (
                  <div className="flex flex-col items-center justify-center py-8 space-y-5">
                    <div className="w-16 h-16 rounded-full bg-wr-green/10 flex items-center justify-center border border-wr-green/30">
                      <Check size={32} className="text-wr-green" />
                    </div>
                    <p className="text-sm font-bold text-wr-green tracking-wider uppercase">{t('esim.esim_purchased', 'eSIM Purchased!')}</p>
                    <p className="text-xs text-wr-dim text-center max-w-sm">
                      {t('esim.wallet_shared', 'Your wallet has been credited and the eSIM has been purchased.')}
                    </p>
                    {walletToken && (
                      <div className="flex items-center gap-2 text-xs">
                        <Wallet size={12} className="text-wr-accent" />
                        <span className="text-wr-dim">{t('sms.wallet_balance')}:</span>
                        <span className="font-mono font-bold text-wr-green">${balanceUSD.toFixed(2)}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setSelectedPlanDetail(null)}
                      className="px-8 py-3 text-xs font-black uppercase tracking-widest rounded-sm bg-wr-green text-black hover:bg-wr-green/90 shadow-lg shadow-wr-green/20 transition-all"
                    >
                      {t('common.close', 'Close')}
                    </button>
                  </div>
                )}

                {/* ═══ STEP: ERROR ═══ */}
                {modalStep === 'error' && (
                  <div className="flex flex-col items-center justify-center py-8 space-y-5">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-400/30">
                      <AlertTriangle size={28} className="text-red-400" />
                    </div>
                    <p className="text-sm font-bold text-red-400 tracking-wider uppercase">Error</p>
                    <p className="text-xs text-wr-dim text-center max-w-sm">{modalError || 'Something went wrong. Please try again.'}</p>
                    <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-accent hover:underline text-xs">
                      Need help? @kyc_rip_bot
                    </a>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedPlanDetail(null)}
                        className="px-4 py-2.5 text-xs text-wr-dim hover:text-current transition-colors uppercase tracking-widest"
                      >
                        {t('common.close', 'Close')}
                      </button>
                      <button
                        onClick={() => setModalStep('details')}
                        className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-sm bg-wr-accent text-black hover:bg-wr-accent/90 shadow-lg shadow-wr-accent/20 transition-all"
                      >
                        {t('common.retry', 'Try Again')}
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        );
      })()}

      {/* STANDALONE DEPOSIT MODAL (for top-up without buying a plan) */}
      <PaymentGate
        amount={5}
        methods={['XMR', 'LN', 'XMR402', 'USDT']}
        walletToken={walletToken || undefined}
        serviceName="esim"
        createEndpoint="/v1/tools/esim/payment/create"
        checkEndpoint="/v1/tools/sms/payment/check"
        showPresets={true}
        presets={[3, 5, 10, 20]}
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onWalletCreated={(token) => {
          if (!walletToken) {
            setWalletToken(token);
            localStorage.setItem(WALLET_KEY, token);
          }
        }}
        onDeposit={(usd) => {
          setBalanceUSD(prev => prev + usd);
          toast.success(`$${usd.toFixed(2)} deposited`);
          setShowPaymentModal(false);
          // Re-fetch wallet balance
          const token = walletToken || localStorage.getItem(WALLET_KEY);
          if (token) {
            apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${token}`)
              .then(data => setBalanceUSD(data.balanceUSD))
              .catch(() => {});
          }
        }}
      />
    </div>
  );
}
