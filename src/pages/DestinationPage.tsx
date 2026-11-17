import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Globe, Shield, Wifi, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO, buildFAQSchema } from '../components/SEO';
import { ESIMCheckoutModal, ESIM_WALLET_KEY, type ESIMCheckoutPlan, type ESIMCheckoutResult } from '../components/esim/ESIMCheckoutModal';
import { apiClient } from '../services/client';
import { localePath, resolveLang } from '../utils/localePath';
import { formatDataGB } from '../utils/format';

interface DestinationPlan {
  name: string;
  dataGB: number;
  durationDays: number;
  price: number;
}

interface ComparePlan extends ESIMCheckoutPlan {
  currency: string;
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
}

/** Deterministic hero gradient so a country always looks the same. */
function gradientFor(code: string): string {
  let hue = 0;
  for (const ch of code) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  const second = (hue + 42) % 360;
  return `linear-gradient(135deg, hsl(${hue} 62% 24%), hsl(${second} 68% 10%))`;
}

const SITE_URL = 'https://walls.rip';

function Skeleton({ label }: { label: string }) {
  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased">
      <Header />
      <main className="w-full max-w-4xl px-4 pb-16 pt-8">
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
  const [failed, setFailed] = useState(false);
  const [walletToken, setWalletToken] = useState<string | null>(() => localStorage.getItem(ESIM_WALLET_KEY));
  const [balanceUSD, setBalanceUSD] = useState(0);
  const [checkoutPlan, setCheckoutPlan] = useState<ComparePlan | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  // Prerendered head tags (Phase 2) exist for crawlers without JS. Once the app
  // is running, React Helmet is the single source of truth — drop the static
  // copies so titles/canonicals/JSON-LD are never duplicated.
  useEffect(() => {
    document.querySelectorAll('[data-prerender]').forEach(node => node.remove());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setFailed(false);
    apiClient<DestinationPayload>(`/v1/tools/destinations/${encodeURIComponent(slug)}`)
      .then(data => { if (!cancelled) setPayload(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [slug]);

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

  const redirectToPlans = useMemo(() => {
    if (failed) return localePath('/esim', lang);
    if (payload && payload.esim.planCount < 5) return localePath(`/esim?c=${payload.country.code}`, lang);
    return null;
  }, [failed, payload, lang]);

  if (redirectToPlans) return <Navigate to={redirectToPlans} replace />;

  if (!payload) {
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
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title={`${country} eSIM — instant data plans, no KYC | walls.rip`}
        description={`Compare ${payload.esim.planCount} eSIM data plans for ${country} from $${price.toFixed(2)}. No KYC, instant QR delivery, pay with Monero or Lightning.`}
        path={`/destination/${payload.country.slug}`}
        image="/og-esim.jpg"
        schemas={[serviceSchema, breadcrumbSchema, buildFAQSchema(faqs)]}
      />
      <Header />

      <main className="w-full max-w-4xl px-4 md:px-6 relative z-10 pb-16">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 py-5 text-[11px] font-mono uppercase tracking-widest text-wr-dim">
          <Link to={localePath('/', lang)} className="hover:text-wr-accent transition-colors">{t('destination.breadcrumb_home', 'Home')}</Link>
          <ChevronRight size={11} aria-hidden />
          <Link to={localePath('/esim', lang)} className="hover:text-wr-accent transition-colors">{t('destination.breadcrumb_esim', 'eSIM')}</Link>
          <ChevronRight size={11} aria-hidden />
          <span className="text-current">{country}</span>
        </nav>

        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-sm border border-wr-border p-5 md:p-7"
          style={{ background: gradientFor(payload.country.code) }}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <img
              src={`https://flagcdn.com/w160/${payload.country.code.toLowerCase()}.png`}
              alt=""
              width={96}
              height={64}
              className="h-16 w-24 shrink-0 rounded-sm object-cover shadow-lg ring-1 ring-white/20"
            />
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
        </section>

        {/* Plans */}
        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="font-display text-lg font-bold tracking-tight text-current">
              {t('destination.best_value', 'Best value plans')}
            </h2>
            <span className="text-[11px] font-mono uppercase tracking-widest text-wr-dim">
              {t('destination.plan_count', { count: payload.esim.planCount, defaultValue: '{{count}} plans' })}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {payload.esim.plans.map(plan => {
              const planKey = `${plan.name}|${plan.dataGB}|${plan.durationDays}|${plan.price}`;
              const busy = selecting === planKey;
              return (
                <div key={planKey} className="flex flex-col justify-between rounded-sm border border-wr-border bg-wr-base p-4 transition-colors hover:border-wr-accent/40">
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
                    onClick={() => openCheckout(payload.country.code, plan)}
                    disabled={busy}
                    className="mt-4 flex min-h-11 items-center justify-center rounded-sm border border-wr-border py-2 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-dim transition-colors hover:border-wr-accent hover:text-wr-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base disabled:cursor-wait disabled:opacity-60 md:min-h-0"
                  >
                    {busy ? t('destination.loading_plan', 'Loading…') : t('destination.select', 'Select')}
                  </button>
                </div>
              );
            })}
          </div>
          <Link
            to={localePath(`/esim?c=${payload.country.code}`, lang)}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-wr-accent transition-colors hover:text-wr-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base md:min-h-0"
          >
            {t('destination.view_all', { count: payload.esim.planCount, country, defaultValue: 'View all {{count}} plans for {{country}}' })}
            <span aria-hidden>→</span>
          </Link>
        </section>

        {/* Proxy / SMS availability (hidden unless available) */}
        {(payload.proxy.available || payload.sms.available) && (
          <section className="mt-6 flex flex-wrap gap-2">
            {payload.proxy.available && (
              <span className="inline-flex items-center gap-2 rounded-sm border border-wr-border bg-wr-surface px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-wr-dim">
                <Shield size={12} className="text-wr-accent" />
                {payload.proxy.fromUsd != null
                  ? t('destination.proxy_from', { price: payload.proxy.fromUsd.toFixed(2), defaultValue: 'Proxies from ${{price}}' })
                  : t('destination.proxy_yes', { country, defaultValue: 'Proxies available in {{country}}' })}
              </span>
            )}
            {payload.sms.available && (
              <span className="inline-flex items-center gap-2 rounded-sm border border-wr-border bg-wr-surface px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-wr-dim">
                <Wifi size={12} className="text-wr-info" />
                {t('destination.sms_yes', { country, defaultValue: 'SMS verification numbers in {{country}}' })}
              </span>
            )}
          </section>
        )}

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
      </main>
      <Footer />

      {checkoutPlan && (
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
