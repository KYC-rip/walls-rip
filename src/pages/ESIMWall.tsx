import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Smartphone, Globe, Search, Copy, Check, RefreshCw, AlertTriangle, ChevronDown, Zap, Wifi, Signal, Shield, MapPin, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { REGION_I18N_KEYS } from '../config/regions';
import { WalletBanner } from '../components/WalletBanner';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';
import { PaymentGate } from '../components/PaymentGate';
import { DestinationsGrid, type Destination } from '../components/esim/DestinationsGrid';
import { formatDataGB } from '../utils/format';
import { ESIMCheckoutModal, ESIM_WALLET_KEY } from '../components/esim/ESIMCheckoutModal';

// ─── Types ───

interface MergedCountry { code: string; name: string; regions: string[]; engines: string[] }
interface ComparePlan {
  id: string; name: string; country: string; dataGB: number;
  durationDays: number; price: number;
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

const WALLET_KEY = ESIM_WALLET_KEY; // Shared with SMS wallet


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

/** Continent codes returned by COUNTRY_TO_CONTINENT, mapped to region card names. */
const CONTINENT_REGION: Record<string, string> = {
  AS: 'Asia', EU: 'Europe', NA: 'North America', SA: 'South America',
  AF: 'Africa', ME: 'Middle East', OC: 'Oceania',
};

/** Multi-country catalog codes used to fetch a region's plans directly. */
const REGION_API_CODES: Record<string, string[]> = {
  'Asia': ['AS'],
  'Europe': ['EU'],
  'North America': ['NA'],
  'South America': ['SA'],
  'Africa': ['AF'],
  'Middle East': ['ME'],
  'Oceania': ['OC'],
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

// ─── Shared filter/sort controls (used by all three browse tabs) ───

function chipClass(active: boolean): string {
  return `inline-flex min-h-11 md:min-h-0 items-center justify-center rounded-sm border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors ${
    active
      ? 'border-wr-accent bg-wr-accent/10 text-wr-accent'
      : 'border-wr-border bg-wr-base/40 text-wr-dim hover:border-wr-dim hover:text-current'
  }`;
}

function PlanFilterBar({
  dataFilter,
  durationFilter,
  sortKey,
  sortAsc,
  onDataFilter,
  onDurationFilter,
  onSort,
}: {
  dataFilter: number;
  durationFilter: number;
  sortKey: SortKey;
  sortAsc: boolean;
  onDataFilter: (i: number) => void;
  onDurationFilter: (i: number) => void;
  onSort: (key: SortKey) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-30 -mx-4 border-y border-wr-border bg-wr-base/90 px-4 py-2 backdrop-blur-md md:static md:mx-0 md:rounded-sm md:border md:bg-wr-surface/40 md:p-3 md:backdrop-blur-none">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono uppercase tracking-widest text-wr-dim">{t('esim.filter_data', 'Data')}</span>
            {DATA_FILTERS.map((df, i) => (
              <button key={df.label} onClick={() => onDataFilter(i)} className={chipClass(dataFilter === i)}>
                {df.label === 'All' ? t('esim.filter_all') : df.label}
              </button>
            ))}
          </div>
          <span aria-hidden className="hidden h-4 w-px bg-wr-border md:inline-block" />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono uppercase tracking-widest text-wr-dim">{t('esim.filter_duration', 'Duration')}</span>
            {DURATION_FILTERS.map((durf, i) => (
              <button key={durf.label} onClick={() => onDurationFilter(i)} className={chipClass(durationFilter === i)}>
                {durf.label === 'All' ? t('esim.filter_all') : durf.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono uppercase tracking-widest text-wr-dim">{t('esim.filter_sort', 'Sort')}</span>
          {(['price', 'data', 'duration'] as SortKey[]).map(key => (
            <button key={key} onClick={() => onSort(key)} className={chipClass(sortKey === key)}>
              {t(`esim.sort_${key}`)} {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shared plan card ───

function PlanCard({ plan, isCheapest, onSelect }: { plan: ComparePlan; isCheapest: boolean; onSelect: (plan: ComparePlan) => void }) {
  const { t } = useTranslation();
  const pricePerGB = plan.dataGB > 0 ? +(plan.price / plan.dataGB).toFixed(2) : plan.price;
  const hasFlag = !!plan.country && plan.country.length === 2 && /^[A-Z]{2}$/.test(plan.country);
  const planLabel = isGlobalPlan(plan) ? 'GLOBAL' : isRegionalPlan(plan) ? 'REGIONAL' : (plan.country || 'PLAN');

  return (
    <div className="group relative flex flex-col rounded-sm border border-wr-border bg-wr-base p-4 transition-colors hover:border-wr-accent/40">
      {isCheapest && (
        <div className="absolute -top-2 left-3 rounded-xs border border-wr-accent/40 bg-wr-base px-2 py-0.5 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-accent">
          {t('esim.best_price')}
        </div>
      )}

      {/* Plan / term micro-label row */}
      <div className="flex items-center justify-between gap-2 border-b border-wr-border/60 pb-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-wr-dim">
          {hasFlag ? (
            <img src={`https://flagcdn.com/w20/${plan.country.toLowerCase()}.png`} alt={plan.country} loading="lazy" className="h-3 w-4 shrink-0 rounded-xs object-cover opacity-70" />
          ) : (
            <Globe size={12} className="shrink-0 text-wr-info" />
          )}
          <span className="truncate">{planLabel}</span>
        </span>
        <span className="shrink-0 text-[11px] font-mono uppercase tracking-widest text-wr-dim">
          {plan.durationDays}D
        </span>
      </div>

      {/* Capacity + price hierarchy */}
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="font-mono text-2xl font-black tabular-nums text-current">{formatDataGB(plan.dataGB)}</span>
        <span className="font-mono text-xl font-black tabular-nums text-wr-accent">${plan.price.toFixed(2)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-mono text-wr-dim">
        <span className="truncate">{(plan as any).speed || '3G/4G/5G'}</span>
        <span className="shrink-0 text-wr-dim/70">${pricePerGB}{t('esim.per_gb')}</span>
      </div>

      <button
        onClick={() => onSelect(plan)}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-sm border border-wr-border py-2 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-dim transition-colors hover:border-wr-accent hover:text-wr-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base md:min-h-0"
      >
        {t('esim.select_plan', 'Select')}
      </button>
    </div>
  );
}

export function ESIMWall() {
  const { t } = useTranslation();
  const initial = useMemo(getInitialParams, []);
  const [countries, setCountries] = useState<MergedCountry[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationsLoading, setDestinationsLoading] = useState(true);
  const [comparePlans, setComparePlans] = useState<ComparePlan[]>([]);
  const [, setActiveEngines] = useState<string[]>([]);
  const [, setCheapestId] = useState<string | null>(null);
  const [selectedCountry, _setSelectedCountry] = useState<string>(initial.country);
  const [countrySearch, setCountrySearch] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Tabs
  const [activeTab, _setActiveTab] = useState<BrowseTab>(initial.tab);
  // Region cards are keyed by name; tolerate a continent code in an old URL.
  const [selectedRegion, _setSelectedRegion] = useState<string>(
    CONTINENT_REGION[initial.region] || initial.region,
  );

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
  };

  // FAQ accordion
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  // ─── Load countries (merged from all engines) ───
  useEffect(() => {
    apiClient<MergedCountry[]>('/v1/tools/esim/countries/all')
      .then(c => {
        setCountries(c);
      })
      .catch((e) => {
        if (e?.data?.code === 'ESIM_NOT_CONFIGURED' || e?.message?.includes('ESIM_NOT_CONFIGURED')) {
          setNotConfigured(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // ─── Destination index (compact country → from-price) ───
  useEffect(() => {
    let cancelled = false;
    apiClient<{ destinations?: Destination[] }>('/v1/tools/esim/destinations')
      .then(r => { if (!cancelled && Array.isArray(r.destinations)) setDestinations(r.destinations); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDestinationsLoading(false); });
    return () => { cancelled = true; };
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
      // Keep the provider prefix: numeric IDs overlap across eSIM engines.
      window.history.replaceState(null, '', `${window.location.pathname}?id=${encodeURIComponent(data.orderId)}`);
      if (data.qrCode || data.activationUrl) {
        setProfileData({ qrCode: data.qrCode, activationUrl: data.activationUrl });
      } else {
        pollProfile(data.orderId, token);
      }
    } else {
      throw new Error('Purchase failed — no order ID returned');
    }
    return data;
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

  /** Called by PaymentGate when a deposit is confirmed; the modal then purchases. */
  const handlePaymentDeposit = useCallback(async (usd: number) => {
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

  const destinationName = (code: string, fallback: string) =>
    destinations.find(d => d.code === code)?.name || fallback;
  const selectedCountryName = destinationName(selectedCountry, countries.find(c => c.code === selectedCountry)?.name || '');

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

  // ─── Regional plans ───
  // The bulk `/esim/plans` list is not the full catalog for every engine
  // (SimJuno cannot list all packages; PikaSim's unfiltered listing is a
  // subset), so regional cards and the regional grid both use per-region
  // fetches merged with the multi-country plans we already hold.
  const [regionFetchedPlans, setRegionFetchedPlans] = useState<Record<string, ComparePlan[]>>({});

  useEffect(() => {
    if (activeTab !== 'regional') return;
    let cancelled = false;
    // Publish each region as soon as its own fetch settles, so one slow region
    // never blocks the grid for the region the user already picked.
    for (const region of Object.keys(REGIONS)) {
      (async () => {
        const fetched: ComparePlan[] = [];
        for (const code of REGION_API_CODES[region] || []) {
          try {
            fetched.push(...await apiClient<ComparePlan[]>(`/v1/tools/esim/plans?country=${code}`));
          } catch { /* skip */ }
        }
        if (!cancelled) setRegionFetchedPlans(prev => ({ ...prev, [region]: fetched }));
      })();
    }
    return () => { cancelled = true; };
  }, [activeTab]);

  const regionPlanSets = useMemo(() => {
    const out: Record<string, ComparePlan[]> = {};
    for (const region of Object.keys(REGIONS)) {
      const byId = new Map<string, ComparePlan>();
      for (const plan of regionFetchedPlans[region] || []) byId.set(plan.id, plan);
      for (const plan of allPlans) {
        if (isRegionalPlan(plan) && planMatchesRegion(plan, region)) byId.set(plan.id, plan);
      }
      out[region] = [...byId.values()];
    }
    return out;
  }, [regionFetchedPlans, allPlans]);

  const regionalPlans = useMemo(
    () => (selectedRegion && activeTab === 'regional' ? regionPlanSets[selectedRegion] || [] : []),
    [selectedRegion, activeTab, regionPlanSets],
  );

  // Counts and from-prices come from the same set the grid renders, so a card
  // can never advertise a price the plan list does not show.
  const regionCounts = useMemo(
    () => Object.fromEntries(Object.entries(regionPlanSets).map(([region, plans]) => [region, plans.length])),
    [regionPlanSets],
  );

  const regionFromPrices = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [region, plans] of Object.entries(regionPlanSets)) {
      const prices = plans.map(p => p.price).filter(Number.isFinite);
      if (prices.length > 0) map[region] = Math.min(...prices);
    }
    return map;
  }, [regionPlanSets]);

  // ─── Global plans ───
  const globalPlans = useMemo(() => {
    // GLOBAL tab = true global plans only (isGlobalPlan). Was isMultiCountryPlan,
    // which also swept in every REGIONAL plan (~285) — that's the "too many".
    return allPlans.filter(p => isGlobalPlan(p));
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
        // COUNTRY_TO_CONTINENT yields a continent code (e.g. "AS"); the region
        // cards and plan sets are keyed by name ("Asia").
        const region = CONTINENT_REGION[COUNTRY_TO_CONTINENT[geo]];
        if (region) setSelectedRegion(region);
      }
    }
    if (tab !== 'regional') setSelectedRegion('');
  };

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
        <Header />
        <div className="flex flex-col items-center justify-center py-20 text-wr-dim">
          <RefreshCw size={28} className="mb-4 animate-spin text-wr-accent" />
          <p className="text-[11px] font-mono uppercase tracking-widest">{t('esim.loading')}</p>
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
              description: 'Anonymous eSIM data plans for supported countries. No KYC, no registration. 3G/4G/5G.',
              provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'Service',
              name: 'eSIM — Anonymous Data Plans',
              serviceType: 'eSIM Data Plans',
              areaServed: 'Worldwide',
              description: 'Buy anonymous eSIM data plans for supported countries. Install via QR code, pay with Monero or Lightning.',
              provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
            },
          ]}
        />
        <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
        <div className="fixed inset-0 z-40 pointer-events-none vignette" />
        <Header />
        <main className="w-full max-w-2xl px-4 relative z-10 flex flex-col gap-8 mb-20 mt-8">
          <div className="space-y-6 rounded-sm border border-wr-accent/40 bg-wr-surface p-6 text-center md:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-sm border border-wr-accent/30 bg-wr-accent/10 text-wr-accent">
              <Check size={28} />
            </div>
            <h2 className="text-lg font-bold uppercase tracking-wider text-wr-accent">{t('esim.esim_purchased')}</h2>
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
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm border border-wr-border bg-wr-base p-3 text-left font-mono text-xs break-all text-wr-accent transition-colors hover:border-wr-accent/50">
                  <span className="truncate">{profileData.activationUrl}</span>
                  {copied ? <Check size={14} className="shrink-0 text-wr-accent" /> : <Copy size={14} className="shrink-0 text-wr-dim" />}
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
                  className="block w-full rounded-sm border border-wr-accent/40 bg-wr-base p-3 text-center font-mono text-xs break-all text-wr-accent transition-colors hover:bg-wr-accent/5">
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
        description="Compare eSIM data plans from multiple providers. Find the cheapest anonymous data. No KYC, pay with Monero or Lightning."
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
            description: 'Compare anonymous eSIM data plans from multiple providers. 3G/4G/5G. No KYC.',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: 'eSIM — Anonymous Data Plan Comparison',
            serviceType: 'eSIM Data Plans',
            areaServed: 'Worldwide',
            description: 'Compare and buy anonymous eSIM data plans from multiple providers. Best prices, delivered after provider provisioning.',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
        ]}
      />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />

      <main className="w-full max-w-6xl px-4 md:px-6 relative z-10 pb-12">
        <div className="max-w-6xl mx-auto space-y-6 md:space-y-10 pb-8 md:pb-12">

          {/* HERO — left aligned */}
          <div className="border-b border-wr-border pb-5 pt-6 md:pt-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-sm border border-wr-border bg-wr-surface px-2 py-1 text-[11px] font-mono uppercase tracking-widest text-wr-dim">
                    <Smartphone size={12} className="text-wr-accent" />
                    {t('esim.hero_kicker', 'Travel eSIM')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-sm border border-wr-info/30 bg-wr-info/10 px-2 py-1 text-[11px] font-mono uppercase tracking-widest text-wr-info">
                    <Signal size={10} /> {t('esim.tag_no_kyc')}
                  </span>
                </div>
                <h1 className="font-display text-3xl font-black tracking-tight md:text-5xl">
                  {t('esim.hero_title', 'Global data eSIMs')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-wr-dim">
                  {t('esim.what', 'A prepaid data plan for one country, delivered as a QR code. No account, no ID — compare every provider in one list.')}
                </p>
                {!notConfigured && (
                  <div className="relative mt-4 max-w-md">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                    <input
                      type="search"
                      value={countrySearch}
                      onChange={e => {
                        const value = e.target.value;
                        setCountrySearch(value);
                        if (activeTab !== 'country') setActiveTab('country');
                        // Keep the open plan list unless the query no longer
                        // matches the selected destination.
                        if (selectedCountry) {
                          const q = value.trim().toLowerCase();
                          const name = selectedCountryName.toLowerCase();
                          if (q && selectedCountry.toLowerCase() !== q && !name.includes(q)) {
                            setSelectedCountry('');
                          }
                        }
                      }}
                      placeholder={t('esim.destination_search', 'Where are you traveling?')}
                      aria-label={t('esim.destination_search', 'Where are you traveling?')}
                      className="min-h-12 w-full rounded-sm border border-wr-border bg-wr-base py-3 pl-10 pr-3 font-mono text-base text-current outline-none transition-colors placeholder-wr-dim/50 focus:border-wr-accent focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base md:text-sm"
                    />
                  </div>
                )}
              </div>
              <a href="/esim/topup" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-wr-secondary transition-colors hover:text-wr-secondary/80 md:min-h-0 md:pb-1">
                <Zap size={12} /> {t('esim.topup_link', 'Top up an existing eSIM')} <span aria-hidden>→</span>
              </a>
            </div>
          </div>

          {/* COMING SOON / NOT CONFIGURED */}
          {notConfigured && (
            <div className="mx-2 rounded-sm border border-wr-border bg-wr-surface p-6 text-center md:mx-0 md:p-8">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-sm border border-wr-info/30 bg-wr-info/10 text-wr-info">
                <Signal size={20} />
              </div>
              <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-wr-info">{t('esim.coming_soon')}</h2>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-wr-dim">
                {t('esim.coming_soon_desc')}
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-4">
                {[t('esim.tag_no_kyc'), t('esim.tag_no_reg'), t('esim.tag_global'), t('esim.tag_instant'), t('esim.tag_pay')].map(tag => (
                  <span key={tag} className="rounded-sm border border-wr-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-wr-dim">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!notConfigured && (
            <>
              <WalletBanner
                token={walletToken}
                balance={balanceUSD}
                helper={t('wallet.shared_helper', 'One prepaid balance covers eSIMs, SMS, phone numbers and VPN.')}
                onDeposit={() => setShowPaymentModal(true)}
                restoreOpen={showRestoreInput}
                setRestoreOpen={setShowRestoreInput}
                restoreToken={restoreToken}
                setRestoreToken={setRestoreToken}
                onRestore={handleRestoreWallet}
                restoring={restoringWallet}
              />

              {/* TABBED BROWSING + COMPARISON TABLE */}
              <div className="mx-2 rounded-sm border border-wr-border bg-wr-surface p-4 md:mx-0 md:p-8">
                <div className="relative z-10 space-y-6 md:space-y-8">

                  {/* Tab Buttons */}
                  <div className="flex w-full border border-wr-border bg-wr-base/50 p-0.5 sm:w-auto sm:self-start">
                    {([
                      { key: 'country' as BrowseTab, label: t('esim.tab_country'), icon: <Globe size={12} /> },
                      { key: 'regional' as BrowseTab, label: t('esim.tab_regional'), icon: <MapPin size={12} /> },
                      { key: 'global' as BrowseTab, label: t('esim.tab_global'), icon: <Wifi size={12} /> },
                    ]).map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 px-4 py-2 text-[11px] font-mono font-bold uppercase tracking-widest transition-colors sm:flex-none md:min-h-0 ${
                          activeTab === tab.key
                            ? 'bg-wr-accent text-black'
                            : 'text-wr-dim hover:text-current'
                        }`}
                      >
                        {tab.icon} {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* ═══ TAB: Country ═══ */}
                  {activeTab === 'country' && (
                    <div className={`grid grid-cols-1 gap-6 md:gap-8 ${selectedCountry ? 'md:grid-cols-[280px_1fr]' : ''}`}>
                      {/* LEFT: Country Selection (only while browsing plans) */}
                      {selectedCountry && (
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-xs text-wr-dim uppercase tracking-widest font-bold">
                          <Globe size={12} className="text-wr-accent" /> {t('esim.select_country')}
                        </label>
                        <div className="relative">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wr-dim" />
                          <input type="text" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} placeholder={t('esim.search_countries')}
                            className="min-h-11 w-full rounded-sm border border-wr-border bg-wr-base py-3 pl-10 pr-3 font-mono text-base text-current outline-none transition-colors placeholder-wr-dim/50 focus:border-wr-accent md:text-sm" />
                        </div>
                        {/* Popular countries */}
                        <div className="flex flex-wrap gap-1.5">
                          {POPULAR_COUNTRIES.map(code => {
                            const country = countries.find((c: MergedCountry) => c.code === code);
                            if (!country) return null;
                            return (
                              <button key={code} onClick={() => { setSelectedCountry(code); scrollToPlans(); }} title={country.name}
                                className={`flex min-h-11 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider transition-colors md:min-h-0 ${selectedCountry === code ? 'border-wr-accent bg-wr-accent/10 text-wr-accent' : 'border-wr-border text-wr-dim hover:border-wr-dim hover:text-current'}`}>
                                <img src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`} alt={code} loading="lazy" className="h-3 w-4 rounded-xs object-cover" />
                                {code}
                              </button>
                            );
                          })}
                        </div>
                        <div className="border-t border-wr-border/60" />
                        {/* All countries */}
                        <div className="flex max-h-[400px] flex-col gap-0.5 overflow-y-auto pr-1">
                          {filteredCountries.map(c => (
                            <button key={c.code} onClick={() => { setSelectedCountry(c.code); scrollToPlans(); }}
                              className={`flex min-h-11 items-center gap-2 rounded-sm px-3 py-2 text-left text-xs transition-colors md:min-h-0 ${selectedCountry === c.code ? 'bg-wr-accent/10 font-bold text-wr-accent' : 'text-current hover:bg-wr-surface hover:text-wr-accent'}`}>
                              <img src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`} alt={c.code} loading="lazy" className="h-3 w-4 rounded-xs object-cover opacity-70" />
                              <span className="truncate">{destinationName(c.code, c.name)}</span>
                            </button>
                          ))}
                          {filteredCountries.length === 0 && !loading && (
                            <div className="w-full rounded-sm border border-wr-border bg-wr-base/50 px-3 py-4 text-center text-xs text-wr-dim">
                              {t('esim.no_countries')}
                            </div>
                          )}
                        </div>
                      </div>
                      )}

                      {/* RIGHT: Plans */}
                      {selectedCountry ? (
                        <div ref={plansRef} className="space-y-4">
                          <button
                            onClick={() => { setSelectedCountry(''); setCountrySearch(''); }}
                            className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-wr-dim transition-colors hover:text-wr-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base"
                          >
                            <span aria-hidden>←</span> {t('esim.all_destinations', 'All destinations')}
                          </button>
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
                              <PlanFilterBar
                                dataFilter={dataFilter}
                                durationFilter={durationFilter}
                                sortKey={sortKey}
                                sortAsc={sortAsc}
                                onDataFilter={setDataFilter}
                                onDurationFilter={setDurationFilter}
                                onSort={(key) => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(true); } }}
                              />

                              {/* Plan cards grid */}
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                                {filteredPlans.slice(0, visiblePlans).map((plan) => (
                                  <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    isCheapest={plan.id === filteredCheapestId}
                                    onSelect={setSelectedPlanDetail}
                                  />
                                ))}
                              </div>

                              {visiblePlans < filteredPlans.length && (
                                <div className="pt-2 text-center">
                                  <button
                                    onClick={() => setVisiblePlans(v => v + PLANS_PER_PAGE)}
                                    className="min-h-11 rounded-sm border border-wr-border px-6 py-2.5 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-dim transition-colors hover:border-wr-accent hover:text-wr-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base md:min-h-0"
                                  >
                                    {t('esim.show_more', 'Show More')} ({filteredPlans.length - visiblePlans} {t('esim.remaining', 'remaining')})
                                  </button>
                                </div>
                              )}

                              {filteredPlans.length === 0 && comparePlans.length > 0 && (
                                <div className="rounded-sm border border-wr-border bg-wr-base/50 px-4 py-6 text-center text-xs text-wr-dim">
                                  {t('esim.no_filter_match', 'No plans match the current filters. Try adjusting the data size or provider filters.')}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="flex items-start justify-center gap-2 rounded-sm border border-wr-warning/30 bg-wr-warning/5 p-4 text-xs text-wr-dim">
                              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-wr-warning" />
                              <span>{t('esim.no_compare_plans')}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <DestinationsGrid
                          destinations={destinations}
                          fallbackCountries={countries}
                          loading={destinationsLoading}
                          search={countrySearch}
                          onSearch={setCountrySearch}
                          onSelect={(code) => { setSelectedCountry(code); scrollToPlans(); }}
                        />
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
                                  className={`min-h-11 rounded-sm border p-3 text-left transition-colors md:min-h-0 ${
                                    isSelected
                                      ? 'border-wr-accent bg-wr-accent/10'
                                      : 'border-wr-border bg-wr-base hover:border-wr-dim'
                                  }`}
                                >
                                  <div className={`text-[11px] font-mono font-bold uppercase tracking-widest ${isSelected ? 'text-wr-accent' : 'text-current'}`}>
                                    {t(REGION_I18N_KEYS[region] || region)}
                                  </div>
                                  {count > 0 && (
                                    <div className="mt-0.5 text-[11px] font-mono text-wr-dim">
                                      {regionFromPrices[region] != null && (
                                        <span className="text-wr-accent">{t('esim.from_price', 'from')} ${regionFromPrices[region].toFixed(2)} · </span>
                                      )}
                                      {count} {t('esim.plans_available', 'plans')}
                                    </div>
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
                              <PlanFilterBar
                                dataFilter={dataFilter}
                                durationFilter={durationFilter}
                                sortKey={sortKey}
                                sortAsc={sortAsc}
                                onDataFilter={setDataFilter}
                                onDurationFilter={setDurationFilter}
                                onSort={(key) => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(true); } }}
                              />

                              {/* Plan cards grid */}
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                                {tabPlans.slice(0, visiblePlans).map((plan) => (
                                  <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    isCheapest={plan.id === tabCheapestId}
                                    onSelect={setSelectedPlanDetail}
                                  />
                                ))}
                              </div>
                              {visiblePlans < tabPlans.length && (
                                <div className="pt-2 text-center">
                                  <button onClick={() => setVisiblePlans(v => v + PLANS_PER_PAGE)}
                                    className="min-h-11 rounded-sm border border-wr-border px-6 py-2.5 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-dim transition-colors hover:border-wr-accent hover:text-wr-accent md:min-h-0">
                                    {t('esim.show_more', 'Show More')} ({tabPlans.length - visiblePlans} {t('esim.remaining', 'remaining')})
                                  </button>
                                </div>
                              )}
                            </>
                          ) : regionalPlans.length === 0 ? (
                            <div className="flex items-start justify-center gap-2 rounded-sm border border-wr-warning/30 bg-wr-warning/5 p-4 text-xs text-wr-dim">
                              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-wr-warning" />
                              <span>{t('esim.no_regional_plans')}</span>
                            </div>
                          ) : (
                            <div className="rounded-sm border border-wr-border bg-wr-base/50 px-4 py-6 text-center text-xs text-wr-dim">
                              {t('esim.no_filter_match', 'No plans match the current filters. Try adjusting the data size or provider filters.')}
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
                          <PlanFilterBar
                            dataFilter={dataFilter}
                            durationFilter={durationFilter}
                            sortKey={sortKey}
                            sortAsc={sortAsc}
                            onDataFilter={setDataFilter}
                            onDurationFilter={setDurationFilter}
                            onSort={(key) => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(true); } }}
                          />

                          {/* Plan cards grid */}
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                            {tabPlans.slice(0, visiblePlans).map((plan) => (
                              <PlanCard
                                key={plan.id}
                                plan={plan}
                                isCheapest={plan.id === tabCheapestId}
                                onSelect={setSelectedPlanDetail}
                              />
                            ))}
                          </div>

                          {visiblePlans < tabPlans.length && (
                            <div className="pt-2 text-center">
                              <button onClick={() => setVisiblePlans(v => v + PLANS_PER_PAGE)}
                                className="min-h-11 rounded-sm border border-wr-border px-6 py-2.5 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-dim transition-colors hover:border-wr-accent hover:text-wr-accent md:min-h-0">
                                {t('esim.show_more', 'Show More')} ({tabPlans.length - visiblePlans} {t('esim.remaining', 'remaining')})
                              </button>
                            </div>
                          )}

                          {tabPlans.length === 0 && globalPlans.length > 0 && (
                            <div className="rounded-sm border border-wr-border bg-wr-base/50 px-4 py-6 text-center text-xs text-wr-dim">
                              {t('esim.no_filter_match', 'No plans match the current filters. Try adjusting the data size or provider filters.')}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-start justify-center gap-2 rounded-sm border border-wr-warning/30 bg-wr-warning/5 p-4 text-xs text-wr-dim">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-wr-warning" />
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
                  <div key={item.title} className="rounded-sm border border-wr-border bg-wr-surface p-4">
                    <h4 className="mb-1 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-info">{item.title}</h4>
                    <p className="text-xs leading-relaxed text-wr-dim">{item.desc}</p>
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

      {/* ═══ SHARED PLAN DETAIL + PAYMENT MODAL ═══ */}
      {selectedPlanDetail && (
        <ESIMCheckoutModal
          plan={selectedPlanDetail}
          locationLabel={isGlobalPlan(selectedPlanDetail) ? 'Global' : isRegionalPlan(selectedPlanDetail) ? selectedPlanDetail.country : (countries.find(c => c.code === selectedPlanDetail.country)?.name || selectedPlanDetail.country)}
          badgeLabel={/^[A-Z]{2}$/.test(selectedPlanDetail.country) ? selectedPlanDetail.country : isGlobalPlan(selectedPlanDetail) ? 'Global' : 'Regional'}
          walletToken={walletToken}
          balanceUSD={balanceUSD}
          onClose={() => setSelectedPlanDetail(null)}
          onWalletCreated={(token) => {
            setWalletToken(token);
            localStorage.setItem(WALLET_KEY, token);
          }}
          onDeposit={handlePaymentDeposit}
          purchase={(token) => executePurchase(selectedPlanDetail.id, token, selectedPlanDetail.engine, selectedPlanDetail.country)}
        />
      )}

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
