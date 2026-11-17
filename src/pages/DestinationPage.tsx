import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Globe, MessageSquare, Phone, Shield, Wifi, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO, buildFAQSchema } from '../components/SEO';
import { ESIMCheckoutModal, ESIM_WALLET_KEY, type ESIMCheckoutPlan, type ESIMCheckoutResult } from '../components/esim/ESIMCheckoutModal';
import { apiClient } from '../services/client';
import { localePath, resolveLang } from '../utils/localePath';
import { formatDataGB } from '../utils/format';
import landmarkData from '../data/landmarks.json';

interface DestinationPlan {
  name: string;
  dataGB: number;
  durationDays: number;
  price: number;
}

interface ComparePlan extends ESIMCheckoutPlan {
  currency: string;
}

type ProductKey = 'esim' | 'phone' | 'sms' | 'proxy' | 'uk_number';

interface DestinationProduct {
  key: ProductKey;
  available: boolean;
  fromUsd: number | null;
}

interface DestinationPayload {
  country: { code: string; name: string; slug: string };
  esim: {
    fromUsd: number | null;
    planCount: number;
    networks: string[];
    durations: number[];
    plans: DestinationPlan[];
  };
  proxy: { available: boolean; fromUsd: number | null };
  sms: { available: boolean };
  // Phase 7 — absent on an older API; the page falls back to the legacy fields.
  products?: DestinationProduct[];
  global?: { vpn?: { available: boolean; fromUsd: number | null } };
}

type DataFilter = 'all' | 'lt1' | '1to5' | '5to20' | '20plus';
const DATA_FILTERS: Array<{ key: DataFilter; label: string; fallback: string }> = [
  { key: 'all', label: 'destination.filter_all', fallback: 'All' },
  { key: 'lt1', label: 'destination.filter_lt1', fallback: '< 1GB' },
  { key: '1to5', label: 'destination.filter_1to5', fallback: '1–5GB' },
  { key: '5to20', label: 'destination.filter_5to20', fallback: '5–20GB' },
  { key: '20plus', label: 'destination.filter_20plus', fallback: '20GB+' },
];

type DurationFilter = 'all' | 'le7' | '8to15' | '16to30' | 'gt30';
const DURATION_FILTERS: Array<{ key: DurationFilter; label: string; fallback: string }> = [
  { key: 'all', label: 'destination.filter_all', fallback: 'All' },
  { key: 'le7', label: 'destination.filter_le7', fallback: '≤ 7d' },
  { key: '8to15', label: 'destination.filter_8to15', fallback: '8–15d' },
  { key: '16to30', label: 'destination.filter_16to30', fallback: '16–30d' },
  { key: 'gt30', label: 'destination.filter_gt30', fallback: '30d+' },
];

const PLAN_PAGE_SIZE = 12;

/**
 * The checkout lives in the sticky rail on desktop (one less click, the plan is
 * preselected) and stays a modal on smaller screens where there is no rail.
 */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setDesktop(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

/** One plan row, whether it came from `/esim/compare` (buyable id) or the cached payload. */
interface PlanItem {
  key: string;
  name: string;
  dataGB: number;
  durationDays: number;
  price: number;
  compare: ComparePlan | null;
}

function dataMatches(filter: DataFilter, gb: number): boolean {
  switch (filter) {
    case 'lt1': return gb < 1;
    case '1to5': return gb >= 1 && gb <= 5;
    case '5to20': return gb > 5 && gb <= 20;
    case '20plus': return gb > 20;
    default: return true;
  }
}

function durationMatches(filter: DurationFilter, days: number): boolean {
  switch (filter) {
    case 'le7': return days <= 7;
    case '8to15': return days > 7 && days <= 15;
    case '16to30': return days > 15 && days <= 30;
    case 'gt30': return days > 30;
    default: return true;
  }
}

/** Where each product lives, with the country preselected where it takes one. */
const PRODUCT_META: Record<ProductKey, {
  icon: typeof Wifi;
  label: string;
  fallback: string;
  desc: string;
  fallbackDesc: string;
  link: (code: string) => string;
}> = {
  esim: {
    icon: Wifi, label: 'destination.product_esim', fallback: 'eSIM data',
    desc: 'destination.product_esim_desc', fallbackDesc: 'Prepaid data-only eSIM, no KYC',
    link: code => `/esim?c=${code}`,
  },
  phone: {
    icon: Phone, label: 'destination.product_phone', fallback: 'Phone number plan',
    desc: 'destination.product_phone_desc', fallbackDesc: 'A real number with voice, SMS and data',
    link: code => `/phone?country=${code}`,
  },
  sms: {
    icon: MessageSquare, label: 'destination.product_sms', fallback: 'SMS verification numbers',
    desc: 'destination.product_sms_desc', fallbackDesc: 'Receive one-time verification codes',
    link: code => `/sms?c=${code}`,
  },
  proxy: {
    icon: Shield, label: 'destination.product_proxy', fallback: 'Residential proxies',
    desc: 'destination.product_proxy_desc', fallbackDesc: 'Residential IPs for apps and scripts',
    link: code => `/proxy?country=${code}`,
  },
  uk_number: {
    icon: Phone, label: 'destination.product_uk', fallback: 'UK mobile number',
    desc: 'destination.product_uk_desc', fallbackDesc: 'Long-term +44 number with SMS',
    link: () => '/uk-sim',
  },
};

/** Deterministic hero gradient so a country always looks the same. */
function gradientFor(code: string): string {
  let hue = 0;
  for (const ch of code) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  const second = (hue + 42) % 360;
  return `linear-gradient(135deg, hsl(${hue} 62% 24%), hsl(${second} 68% 10%))`;
}

const SITE_URL = 'https://walls.rip';

/**
 * Hero photography generated by `scripts/landmark-derivatives.py` from the
 * operator's Wikimedia-Commons dataset. Every entry carries its author and
 * license, and the hero renders the credit — most licenses require it.
 */
interface LandmarkCredit {
  landmark: string | null;
  artist: string;
  license: string;
  license_url: string | null;
  source_url: string | null;
}
const LANDMARKS = landmarkData as Record<string, LandmarkCredit>;

function Skeleton({ label }: { label: string }) {
  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased">
      <Header />
      <main className="w-full max-w-6xl px-4 md:px-6 pb-16 pt-8">
        <div className="mb-6 h-4 w-40 animate-pulse rounded-sm bg-wr-surface" />
        <div className="mb-8 h-36 animate-pulse rounded-sm border border-wr-border bg-wr-surface/60" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-sm border border-wr-border bg-wr-base/60" />
          ))}
        </div>
        <p className="mt-6 text-center text-[11px] uppercase tracking-widest text-wr-dim">
          {label}
        </p>
      </main>
    </div>
  );
}

export default function DestinationPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const lang = resolveLang(i18n.language);
  const navigate = useNavigate();
  const [payload, setPayload] = useState<DestinationPayload | null>(null);
  // The slug `payload` belongs to. Navigating between destination pages keeps
  // the old payload for one render; without this the canonical-slug redirect
  // fired on the stale country and bounced the visitor back.
  const [payloadSlug, setPayloadSlug] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(ESIM_WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState(0);
  const [checkoutPlan, setCheckoutPlan] = useState<ComparePlan | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  // Full, buyable plan list for this destination (filters + load more).
  const [comparePlans, setComparePlans] = useState<ComparePlan[] | null>(null);
  const isDesktop = useIsDesktop();
  const autoPicked = useRef(false);
  const [dataFilter, setDataFilter] = useState<DataFilter>('all');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [visiblePlans, setVisiblePlans] = useState(PLAN_PAGE_SIZE);

  // Prerendered head tags (Phase 2) exist for crawlers without JS. Once the app
  // is running, React Helmet is the single source of truth — drop the static
  // copies so titles/canonicals/JSON-LD are never duplicated.
  useEffect(() => {
    document.querySelectorAll('[data-prerender]').forEach(node => node.remove());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setPayloadSlug(null);
    setFailed(false);
    apiClient<DestinationPayload>(`/v1/tools/destinations/${encodeURIComponent(slug)}`)
      .then(data => { if (!cancelled) { setPayload(data); setPayloadSlug(slug); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [slug]);

  // The destination payload only carries the cheapest six plans. Fetch the
  // full public list once so filters and "load more" work without leaving the
  // page; a failure keeps the cached six (with the resolve-on-click fallback).
  const destinationCode = payload?.country.code ?? '';
  useEffect(() => { autoPicked.current = false; }, [destinationCode]);

  useEffect(() => {
    if (!destinationCode) return;
    let cancelled = false;
    setComparePlans(null);
    apiClient<{ plans: ComparePlan[] }>(`/v1/tools/esim/compare?country=${encodeURIComponent(destinationCode)}`)
      .then(res => { if (!cancelled && Array.isArray(res?.plans)) setComparePlans(res.plans); })
      .catch(() => { /* keep the cached six */ });
    return () => { cancelled = true; };
  }, [destinationCode]);

  const allPlanItems: PlanItem[] = useMemo(() => {
    if (comparePlans && comparePlans.length) {
      return comparePlans.map(plan => ({
        key: plan.id, name: plan.name, dataGB: plan.dataGB, durationDays: plan.durationDays,
        price: plan.price, compare: plan,
      }));
    }
    return (payload?.esim.plans ?? []).map(plan => ({
      key: `${plan.name}|${plan.dataGB}|${plan.durationDays}|${plan.price}`,
      name: plan.name, dataGB: plan.dataGB, durationDays: plan.durationDays,
      price: plan.price, compare: null,
    }));
  }, [comparePlans, payload]);

  const planItems = useMemo(
    () => allPlanItems.filter(plan => dataMatches(dataFilter, plan.dataGB) && durationMatches(durationFilter, plan.durationDays)),
    [allPlanItems, dataFilter, durationFilter],
  );

  useEffect(() => { setVisiblePlans(PLAN_PAGE_SIZE); }, [dataFilter, durationFilter, destinationCode]);

  // Desktop: preselect the cheapest plan so the rail is already a checkout.
  useEffect(() => {
    if (!isDesktop || autoPicked.current) return;
    const first = planItems.find(plan => plan.compare);
    if (!first?.compare) return;
    autoPicked.current = true;
    setCheckoutPlan(current => current ?? first.compare);
  }, [isDesktop, planItems]);


  // Same prepaid wallet as /esim and the rest of walls.rip.
  useEffect(() => {
    if (!walletToken) return;
    let cancelled = false;
    apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${walletToken}`)
      .then(data => { if (!cancelled) setBalanceUSD(data.balanceUSD); })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(ESIM_WALLET_KEY);
        setWalletToken(null);
        setBalanceUSD(0);
      });
    return () => { cancelled = true; };
  }, [walletToken]);

  const refreshBalance = useCallback(async () => {
    const token = walletToken || localStorage.getItem(ESIM_WALLET_KEY);
    if (!token) return;
    try {
      const data = await apiClient<{ balanceUSD: number }>(`/v1/tools/esim/balance?token=${token}`);
      setBalanceUSD(data.balanceUSD);
    } catch { /* keep the optimistic balance */ }
  }, [walletToken]);

  const purchasePlan = useCallback(async (plan: ComparePlan, token: string, clientRef: string): Promise<ESIMCheckoutResult> => {
    const result = await apiClient<ESIMCheckoutResult>('/v1/tools/esim/purchase', {
      body: { planId: plan.id, token, engine: plan.engine, country: plan.country, clientRef },
    });
    if (result.balanceUSD != null) setBalanceUSD(result.balanceUSD);
    return result;
  }, []);

  /**
   * The destination payload is white-label (no plan ids), so resolve the exact
   * plan through `/esim/compare` on click — same public response /esim uses —
   * then hand it to the shared checkout. If the plan vanished or changed price
   * basis between the KV cache and now, send the visitor to the full list.
   */
  const openCheckout = async (countryCode: string, plan: DestinationPlan) => {
    const key = `${plan.name}|${plan.dataGB}|${plan.durationDays}|${plan.price}`;
    setSelecting(key);
    try {
      const { plans } = await apiClient<{ plans: ComparePlan[] }>(`/v1/tools/esim/compare?country=${countryCode}`);
      const sameShape = plans.filter(p => p.dataGB === plan.dataGB && p.durationDays === plan.durationDays);
      // Only fall back to the nearest price when the plan is recognisably the
      // same offer. A materially different plan (another provider, other
      // refund terms) must go through the full list instead of a silent swap.
      const nearest = [...sameShape].sort((a, b) => Math.abs(a.price - plan.price) - Math.abs(b.price - plan.price))[0];
      const withinPrice = nearest != null
        && Math.abs(nearest.price - plan.price) <= Math.max(1, plan.price * 0.25);
      const match = sameShape.find(p => p.name === plan.name) ?? (withinPrice ? nearest : undefined);
      if (!match) {
        toast.error(t('destination.plan_changed', 'This plan changed — opening all plans.'));
        navigate(localePath(`/esim?c=${countryCode}`, lang));
        return;
      }
      setCheckoutPlan(match);
    } catch {
      toast.error(t('destination.plan_changed', 'This plan changed — opening all plans.'));
      navigate(localePath(`/esim?c=${countryCode}`, lang));
    } finally {
      setSelecting(null);
    }
  };

  /**
   * A plan fetched from `/esim/compare` is buyable as-is; only the cached
   * six-plan payload needs the resolve-on-click step.
   */
  const selectPlan = (plan: PlanItem) => {
    if (plan.compare) { setCheckoutPlan(plan.compare); return; }
    // openCheckout reads payload; it is non-null wherever this button renders.
    void openCheckout(payload!.country.code, plan);
  };

  // Below the 5-plan threshold (or on any lookup failure) the canonical place
  // for this country is the existing plan browser — never a thin page.
  const closeCheckout = useCallback(() => setCheckoutPlan(null), []);
  const handleWalletCreated = useCallback((token: string) => {
    setWalletToken(token);
    localStorage.setItem(ESIM_WALLET_KEY, token);
  }, []);
  const handleCheckoutDeposit = useCallback(async (usd: number) => {
    setBalanceUSD(prev => prev + usd);
    await refreshBalance();
  }, [refreshBalance]);
  const purchaseCheckout = useCallback((token: string, clientRef: string) => {
    if (!checkoutPlan) return Promise.reject(new Error('No plan selected'));
    return purchasePlan(checkoutPlan, token, clientRef);
  }, [checkoutPlan, purchasePlan]);

  const stalePayload = !!payload && payloadSlug !== slug;

  const redirectToPlans = useMemo(() => {
    if (stalePayload) return null;
    if (failed) return localePath('/esim', lang);
    if (payload && payload.esim.planCount < 5) {
      // Multi-area bundles have no country tab to preselect.
      const target = /^[A-Z0-9-]+-AREAS$/i.test(payload.country.code) ? '/esim?t=regional' : `/esim?c=${payload.country.code}`;
      return localePath(target, lang);
    }
    return null;
  }, [failed, payload, lang, stalePayload]);

  if (redirectToPlans) return <Navigate to={redirectToPlans} replace />;

  if (stalePayload || !payload) {
    return (
      <>
        <SEO
          title="Destination eSIM — walls.rip"
          description="Anonymous eSIM data plans by destination. No KYC, pay with Monero or Lightning."
          path={`/destination/${slug}`}
          noindex
        />
        <Skeleton label={t('destination.loading', 'Loading destination…')} />
        <Footer />
      </>
    );
  }

  // `/destination/TH` resolves through the API, then the URL is replaced with
  // the canonical slug. Keeping one URL per country avoids duplicate pages.
  // (Only for the payload fetched for this slug — see `stalePayload`.)
  if (payload.country.slug && payload.country.slug !== slug.toLowerCase()) {
    return <Navigate to={localePath(`/destination/${payload.country.slug}`, lang)} replace />;
  }

  const country = payload.country.name;
  const price = payload.esim.fromUsd ?? 0;
  const durations = payload.esim.durations.length
    ? payload.esim.durations.join(', ')
    : '';
  const networks = payload.esim.networks.join(', ');
  const intro = networks && durations
    ? t('destination.intro', {
      count: payload.esim.planCount,
      price: price.toFixed(2),
      durations,
      networks,
      defaultValue: '{{count}} plans from ${{price}} · {{durations}} days · {{networks}}',
    })
    : t('destination.intro_plain', {
      count: payload.esim.planCount,
      price: price.toFixed(2),
      defaultValue: '{{count}} plans from ${{price}}.',
    });

  // Phase 7 product rows. An older API (rolling deploy) has no `products`:
  // derive the three products it does know about and skip the rest.
  const products: DestinationProduct[] = payload.products ?? [
    { key: 'esim', available: payload.esim.planCount > 0, fromUsd: payload.esim.fromUsd },
    { key: 'proxy', available: payload.proxy.available, fromUsd: payload.proxy.fromUsd },
    { key: 'sms', available: payload.sms.available, fromUsd: null },
  ];
  const availableProducts = products.filter(product => product.available && PRODUCT_META[product.key]);
  const vpn = payload.global?.vpn ?? null;
  const landmark = LANDMARKS[payload.country.code.toUpperCase()] ?? null;

  // Multi-area bundles cover several countries; list them (with the operators
  // on each) the way the plan detail modal does. Country pages keep the
  // network chips in the hero instead.
  const isBundle = /-AREAS$/i.test(payload.country.code);
  const coverage = (() => {
    if (!isBundle || !comparePlans?.length) return [];
    const byCountry = new Map<string, Set<string>>();
    for (const plan of comparePlans) {
      for (const entry of plan.coverage ?? []) {
        const country = String(entry.country || '').trim();
        if (!country) continue;
        const operators = byCountry.get(country) ?? new Set<string>();
        for (const operator of entry.operators ?? []) {
          const name = String(operator.name || '').trim();
          if (!name) continue;
          operators.add(operator.networkType ? `${name} (${operator.networkType})` : name);
        }
        byCountry.set(country, operators);
      }
    }
    return [...byCountry.entries()]
      .map(([country, operators]) => ({ country, operators: [...operators] }))
      .sort((a, b) => a.country.localeCompare(b.country));
  })();

  const faqs = [
    {
      question: t('destination.faq_q1', { country, defaultValue: `How much does an eSIM for ${country} cost?` }),
      answer: t('destination.faq_a1', {
        country,
        price: price.toFixed(2),
        defaultValue: `${country} eSIM plans on walls.rip start at $${price.toFixed(2)}. Prices are live and shown before you pay; the cheapest plan is always at the top of the list.`,
      }),
    },
    {
      question: t('destination.faq_q2', { country, defaultValue: `How do I install a ${country} eSIM?` }),
      answer: t('destination.faq_a2', {
        country,
        defaultValue: 'After checkout you get a QR code and an activation link. Scan the QR code in your phone settings (Mobile Data → Add eSIM), or open the activation link on the device. Installation takes about two minutes.',
      }),
    },
    {
      question: t('destination.faq_q3', { country, defaultValue: `Do I need an ID or KYC for a ${country} eSIM?` }),
      answer: t('destination.faq_a3', {
        country,
        defaultValue: 'No. No account, name, email or identity document is required. Pay with Monero, Lightning or USDT; the plan is delivered as an installable eSIM profile.',
      }),
    },
    {
      question: t('destination.faq_q4', { country, defaultValue: `Can I top up a ${country} eSIM later?` }),
      answer: t('destination.faq_a4', {
        country,
        defaultValue: 'Yes, where the provider supports top-ups: open the eSIM top-up page with your order id and choose a recharge option. If a plan is not rechargeable, buy a new plan instead.',
      }),
    },
  ];

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${country} eSIM data plans`,
    serviceType: 'eSIM Data Plans',
    areaServed: country,
    description: `${payload.esim.planCount} eSIM data plans for ${country} from $${price.toFixed(2)}. No KYC, instant delivery.`,
    provider: { '@type': 'Organization', name: 'walls.rip', url: SITE_URL },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: price.toFixed(2),
      offerCount: payload.esim.planCount,
      availability: 'https://schema.org/InStock',
      url: `${SITE_URL}/destination/${payload.country.slug}`,
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'eSIM', item: `${SITE_URL}/esim` },
      { '@type': 'ListItem', position: 3, name: country, item: `${SITE_URL}/destination/${payload.country.slug}` },
    ],
  };

  return (
    <div className="flex overflow-x-clip relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title={`${country} eSIM — instant data plans, no KYC | walls.rip`}
        description={`Compare ${payload.esim.planCount} eSIM data plans for ${country} from $${price.toFixed(2)}. No KYC, instant QR delivery, pay with Monero or Lightning.`}
        path={`/destination/${payload.country.slug}`}
        image="/og-esim.jpg"
        schemas={[serviceSchema, breadcrumbSchema, buildFAQSchema(faqs)]}
      />
      <Header />

      <main className="w-full max-w-6xl px-4 md:px-6 relative z-10 pb-16">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 py-5 text-[11px] font-mono uppercase tracking-widest text-wr-dim">
          <Link to={localePath('/', lang)} className="hover:text-wr-accent transition-colors">{t('destination.breadcrumb_home', 'Home')}</Link>
          <ChevronRight size={11} aria-hidden />
          <Link to={localePath('/esim', lang)} className="hover:text-wr-accent transition-colors">{t('destination.breadcrumb_esim', 'eSIM')}</Link>
          <ChevronRight size={11} aria-hidden />
          <span className="text-current">{country}</span>
        </nav>

        {/* Hero: landmark photograph over the deterministic gradient fallback */}
        <section
          className="relative overflow-hidden rounded-sm border border-wr-border"
          style={{ background: gradientFor(payload.country.code) }}
        >
          {landmark && (
            <img
              src={`/landmarks/${payload.country.code}.webp`}
              alt=""
              width={1280}
              height={720}
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/25" aria-hidden />
          <div className="relative flex flex-col gap-5 p-5 pb-8 md:p-7 md:pb-9 sm:flex-row sm:items-center">
            {/^[A-Za-z]{2}$/.test(payload.country.code) && (
              <img
                src={`https://flagcdn.com/w160/${payload.country.code.toLowerCase()}.png`}
                alt=""
                width={96}
                height={64}
                className="h-16 w-24 shrink-0 rounded-sm object-cover shadow-lg ring-1 ring-white/20"
              />
            )}
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-white/70">
                <span className="inline-flex items-center gap-1"><Globe size={11} /> eSIM</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1"><Zap size={11} /> {t('destination.instant', 'Instant delivery')}</span>
              </div>
              <h1 className="font-display text-3xl font-black tracking-tight text-white md:text-4xl">
                {t('destination.hero_title', { country, defaultValue: `${country} eSIM` })}
              </h1>
              <p className="mt-2 max-w-xl text-base leading-relaxed text-white/80">{intro}</p>
            </div>
          </div>
          {landmark && (
            <p className="relative px-5 pb-2 text-[10px] text-white/55 sm:absolute sm:bottom-1.5 sm:right-2 sm:max-w-[85%] sm:truncate sm:px-0 sm:pb-0 sm:text-right">
              <a
                href={landmark.source_url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-sm bg-black/40 px-2 py-1 text-white/75 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 sm:bg-transparent sm:p-0 sm:text-white/55 sm:hover:text-white/85"
              >
                {t('destination.photo_credit', 'Photo')}: {landmark.landmark} · {landmark.artist} · {landmark.license}
              </a>
            </p>
          )}
        </section>

        {/* Sticky rail: product pills + the checkout panel for the chosen plan */}
        <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
          {(availableProducts.length > 0 || vpn?.available || checkoutPlan) && (
            <aside
              aria-label={t('destination.products_title', { country, defaultValue: 'Products for {{country}}' })}
              className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1"
            >
              <h2 className="mb-2 font-display text-sm font-bold tracking-tight text-current">
                {t('destination.products_title', { country, defaultValue: 'Products for {{country}}' })}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {availableProducts.map(product => {
                  const meta = PRODUCT_META[product.key];
                  const Icon = meta.icon;
                  return (
                    <Link
                      key={product.key}
                      to={localePath(meta.link(payload.country.code), lang)}
                      title={t(meta.desc, meta.fallbackDesc)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-wr-border bg-wr-base px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-wr-dim transition-colors hover:border-wr-accent/60 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base"
                    >
                      <Icon size={12} className="text-wr-accent" aria-hidden />
                      {t(meta.label, meta.fallback)}
                      {product.fromUsd != null && (
                        <span className="text-current">${product.fromUsd.toFixed(2)}</span>
                      )}
                    </Link>
                  );
                })}
                {vpn?.available && (
                  <Link
                    to={localePath('/vpn', lang)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-wr-border bg-wr-base px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-wr-dim transition-colors hover:border-wr-accent/60 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base"
                  >
                    <Globe size={12} className="text-wr-accent" aria-hidden />
                    {t('destination.product_vpn', 'VPN')}
                    {vpn.fromUsd != null && <span className="text-current">${vpn.fromUsd.toFixed(2)}</span>}
                  </Link>
                )}
              </div>

              {/* Desktop checkout: the shared panel, pinned in the rail. The
                  cheapest plan is preselected so arriving here already shows
                  what you would buy. */}
              {isDesktop && checkoutPlan && (
                <div className="mt-4">
                  <ESIMCheckoutModal
                    variant="inline"
                    plan={checkoutPlan}
                    locationLabel={country}
                    badgeLabel={payload.country.code}
                    walletToken={walletToken}
                    balanceUSD={balanceUSD}
                    onClose={closeCheckout}
                    onWalletCreated={handleWalletCreated}
                    onDeposit={handleCheckoutDeposit}
                    purchase={purchaseCheckout}
                  />
                </div>
              )}
            </aside>
          )}

          {/* Plans: filters + load more keep the visitor on this page */}
          <section className="mt-8 lg:col-start-1 lg:row-start-1 lg:mt-0">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="font-display text-lg font-bold tracking-tight text-current">
                {t('destination.plans_title', 'Plans')}
              </h2>
              <span className="text-[11px] font-mono uppercase tracking-widest text-wr-dim">
                {t('destination.plan_count', { count: planItems.length, defaultValue: '{{count}} plans' })}
              </span>
            </div>

            {/* Desktop shows the same list inside the pinned checkout panel. */}
            {isBundle && coverage.length > 0 && !isDesktop && (
              <div className="mb-4">
                <h3 className="mb-2 font-display text-sm font-bold tracking-tight text-current">
                  {t('destination.coverage_title', 'Coverage')} ({coverage.length} {t('destination.coverage_countries', 'countries')})
                </h3>
                <div className="rounded-sm border border-wr-border bg-wr-base">
                  {coverage.map(row => (
                    <div key={row.country} className="flex items-start justify-between gap-4 border-b border-wr-border/50 px-4 py-2 text-xs last:border-b-0">
                      <span className="font-mono font-bold text-current">{row.country}</span>
                      <span className="text-right font-mono text-wr-dim">{row.operators.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-mono uppercase tracking-widest text-wr-dim">
                  {t('destination.filter_data', 'Data')}
                </span>
                {DATA_FILTERS.map(filter => (
                  <button
                    key={filter.key}
                    type="button"
                    aria-pressed={dataFilter === filter.key}
                    onClick={() => setDataFilter(filter.key)}
                    className={`inline-flex min-h-11 items-center rounded-sm border px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base md:min-h-0 ${dataFilter === filter.key ? 'border-wr-accent bg-wr-accent text-black' : 'border-wr-border text-wr-dim hover:border-wr-accent/60 hover:text-current'}`}
                  >
                    {t(filter.label, filter.fallback)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-mono uppercase tracking-widest text-wr-dim">
                  {t('destination.filter_duration', 'Duration')}
                </span>
                {DURATION_FILTERS.map(filter => (
                  <button
                    key={filter.key}
                    type="button"
                    aria-pressed={durationFilter === filter.key}
                    onClick={() => setDurationFilter(filter.key)}
                    className={`inline-flex min-h-11 items-center rounded-sm border px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base md:min-h-0 ${durationFilter === filter.key ? 'border-wr-accent bg-wr-accent text-black' : 'border-wr-border text-wr-dim hover:border-wr-accent/60 hover:text-current'}`}
                  >
                    {t(filter.label, filter.fallback)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {planItems.slice(0, visiblePlans).map(plan => {
                const busy = selecting === plan.key;
                return (
                  <div key={plan.key} className="flex flex-col justify-between rounded-sm border border-wr-border bg-wr-base p-4 transition-colors hover:border-wr-accent/40">
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-2xl font-black tabular-nums text-current">
                          {formatDataGB(plan.dataGB)}
                        </span>
                        <span className="font-mono text-xl font-black tabular-nums text-wr-accent">${plan.price.toFixed(2)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-wr-dim">
                        <span>{t('destination.plan_days', { count: plan.durationDays, defaultValue: '{{count}} days' })}</span>
                        <span className="flex items-center gap-1"><Wifi size={10} /> 3G/4G/5G</span>
                      </div>
                    </div>
                    <button
                      onClick={() => selectPlan(plan)}
                      disabled={busy}
                      className="mt-4 flex min-h-11 items-center justify-center rounded-sm border border-wr-border py-2 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-dim transition-colors hover:border-wr-accent hover:text-wr-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base disabled:cursor-wait disabled:opacity-60 md:min-h-0"
                    >
                      {busy ? t('destination.loading_plan', 'Loading…') : t('destination.select', 'Select')}
                    </button>
                  </div>
                );
              })}
            </div>

            {planItems.length === 0 && (
              <p className="rounded-sm border border-wr-border bg-wr-base/50 px-4 py-6 text-center text-xs text-wr-dim">
                {t('destination.no_plan_match', 'No plans match these filters.')}
              </p>
            )}

            {visiblePlans < planItems.length && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisiblePlans(value => value + PLAN_PAGE_SIZE)}
                  className="min-h-11 rounded-sm border border-wr-border px-6 py-2.5 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-dim transition-colors hover:border-wr-accent hover:text-wr-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base md:min-h-0"
                >
                  {t('destination.show_more', 'Show more')} ({planItems.length - visiblePlans})
                </button>
              </div>
            )}

            <Link
              to={localePath(`/esim?c=${payload.country.code}`, lang)}
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-accent transition-colors hover:text-wr-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base md:min-h-0"
            >
              {t('destination.view_all', { count: planItems.length, country, defaultValue: 'View all {{count}} plans for {{country}}' })}
              <span aria-hidden>→</span>
            </Link>

        {/* FAQ */}
        <section className="mt-10">
          <h2 className="mb-3 font-display text-lg font-bold tracking-tight text-current">
            {t('destination.faq_title', { country, defaultValue: `${country} eSIM FAQ` })}
          </h2>
          <div className="space-y-2">
            {faqs.map(faq => (
              <details key={faq.question} className="group rounded-sm border border-wr-border bg-wr-surface">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-bold text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base">
                  <span>{faq.question}</span>
                  <ChevronRight size={14} className="shrink-0 text-wr-accent transition-transform group-open:rotate-90" />
                </summary>
                <p className="border-t border-wr-border/30 px-4 pb-4 pt-3 text-sm leading-relaxed text-wr-dim">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
        </section>
        </div>

      </main>
      <Footer />

      {checkoutPlan && !isDesktop && (
        <ESIMCheckoutModal
          plan={checkoutPlan}
          locationLabel={country}
          badgeLabel={payload.country.code}
          walletToken={walletToken}
          balanceUSD={balanceUSD}
          onClose={closeCheckout}
          onWalletCreated={handleWalletCreated}
          onDeposit={handleCheckoutDeposit}
          purchase={purchaseCheckout}
        />
      )}
    </div>
  );
}
