import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Shield, Wifi, Globe, Lock, ArrowRight, Check, AlertTriangle, ChevronDown, Server,
} from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { apiClient } from '../services/client';
import { SUPPORTED_LANGS } from '../i18n/config';

interface VpnPlan { id: string; name: string; days: number; price: number }
interface VpnCatalog { available: boolean; plans: VpnPlan[] }
interface ProxyPlan { id: string; name: string; bandwidthGB: number; durationDays: number; price: number; engine: string }
interface ProxyLocation { id: string; country: string; countryCode: string; engine: string }

const COMPARISON: Array<{
  label: string;
  labelKey: string;
  vpn: string;
  vpnKey: string;
  proxy: string;
  proxyKey: string;
}> = [
  { label: 'What it hides', labelKey: 'network.cmp_what', vpn: 'All device traffic and your real IP', vpnKey: 'network.cmp_vpn_what', proxy: 'The IP of the app, browser profile or script that uses it', proxyKey: 'network.cmp_proxy_what' },
  { label: 'Scope', labelKey: 'network.cmp_scope', vpn: 'System-wide — one tunnel per device', vpnKey: 'network.cmp_vpn_scope', proxy: 'Per app or session', proxyKey: 'network.cmp_proxy_scope' },
  { label: 'IP type', labelKey: 'network.cmp_ip', vpn: 'Datacenter, plus 5 CDN-fronted VLESS servers', vpnKey: 'network.cmp_vpn_ip', proxy: 'Residential, HTTP', proxyKey: 'network.cmp_proxy_ip' },
  { label: 'Best for', labelKey: 'network.cmp_best', vpn: 'Private browsing, region-locked content, one stable identity', vpnKey: 'network.cmp_vpn_best', proxy: 'Scraping, ad verification, per-country sessions', proxyKey: 'network.cmp_proxy_best' },
  { label: 'Billing', labelKey: 'network.cmp_bill', vpn: 'Fixed term, 7–365 days, crypto checkout', vpnKey: 'network.cmp_vpn_bill', proxy: 'Prepaid 31-day package metered in GB (0.5–100 GB)', proxyKey: 'network.cmp_proxy_bill' },
];

export default function NetworkHub() {
  const { t, i18n } = useTranslation();
  const lang = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language) && i18n.language !== 'en'
    ? `/${i18n.language}`
    : '';
  const lp = (path: string) => `${lang}${path}`;

  const [vpnMin, setVpnMin] = useState<VpnPlan | null>(null);
  const [proxyMin, setProxyMin] = useState<ProxyPlan | null>(null);
  const [proxyCountries, setProxyCountries] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      apiClient<VpnCatalog>('/v1/tools/vpn/plans'),
      apiClient<ProxyPlan[]>('/v1/tools/proxy/plans'),
      apiClient<ProxyLocation[]>('/v1/tools/proxy/locations'),
    ]).then(([vpn, proxy, locations]) => {
      if (cancelled) return;
      if (vpn.status === 'fulfilled' && Array.isArray(vpn.value?.plans) && vpn.value.plans.length > 0) {
        setVpnMin(vpn.value.plans.reduce((best, plan) => (plan.price < best.price ? plan : best)));
      }
      if (proxy.status === 'fulfilled' && Array.isArray(proxy.value) && proxy.value.length > 0) {
        setProxyMin(proxy.value.reduce((best, plan) => (plan.price < best.price ? plan : best)));
      }
      if (locations.status === 'fulfilled' && Array.isArray(locations.value)) {
        setProxyCountries(locations.value.length);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const vpnPrice = vpnMin
    ? t('network.vpn_from', { price: vpnMin.price.toFixed(2), days: vpnMin.days, defaultValue: 'From ${{price}} / {{days}} days' })
    : t('network.live_pricing', 'Live pricing on the VPN page');
  const proxyPrice = proxyMin
    ? t('network.proxy_from', { price: proxyMin.price.toFixed(2), gb: proxyMin.bandwidthGB, defaultValue: 'From ${{price}} / {{gb}} GB' })
    : t('network.live_pricing_proxy', 'Live pricing on the proxy page');

  const specs = [
    { value: '150+', label: t('network.spec_countries', 'countries (provider coverage)') },
    { value: '5-min', label: t('network.spec_sticky', 'sticky proxy sessions') },
    { value: 'HTTP', label: t('network.spec_http', 'proxy protocol') },
    { value: '0.5–100 GB', label: t('network.spec_gb', 'proxy packages') },
    { value: 'WireGuard · OpenVPN · VLESS', label: t('network.spec_vpn', 'VPN protocols') },
    { value: '5', label: t('network.spec_vless', 'CDN-fronted VLESS servers') },
  ];

  const steps = [
    { title: t('network.step1_title', 'Pay in crypto'), body: t('network.step1_body', 'Monero or Lightning for the walls wallet, or the coins the VPN checkout lists on its page.') },
    { title: t('network.step2_title', 'Choose a tool'), body: t('network.step2_body', 'A fixed-term VPN plan, or a residential proxy package measured in GB.') },
    { title: t('network.step3_title', 'Connect'), body: t('network.step3_body', 'Scan the VPN config QR, download a profile, or copy the proxy credentials.') },
  ];

  const useCases = [
    { title: t('network.uc_scrape_title', 'Scraping at scale'), body: t('network.uc_scrape_body', 'Rotate residential IPs so blocks and CAPTCHAs do not stop a crawl.') },
    { title: t('network.uc_geo_title', 'Region-locked content'), body: t('network.uc_geo_body', 'Appear from the country the content expects, on one session or every app.') },
    { title: t('network.uc_protect_title', 'Protect every app'), body: t('network.uc_protect_body', 'Route the whole device through one encrypted tunnel with a VPN profile.') },
    { title: t('network.uc_ads_title', 'Ad verification'), body: t('network.uc_ads_body', 'Check landing pages and ads from clean consumer ISP addresses.') },
  ];

  const faq = [
    {
      q: t('network.faq1_q', 'Is a proxy enough instead of a VPN?'),
      a: t('network.faq1_a', 'A proxy only changes the egress IP for the app or session configured to use it. A VPN encrypts all device traffic and sends it through one tunnel. Use a proxy for scraping, ad verification or per-country sessions; use the VPN when the whole device should leave through one encrypted exit.'),
    },
    {
      q: t('network.faq2_q', 'Can I pay with Monero?'),
      a: t('network.faq2_a', 'Yes. Monero and Lightning work with the walls.rip wallet used by proxy, SMS, eSIM and phone products. The VPN checkout lists its accepted coins on the VPN page. Both are crypto-only.'),
    },
    {
      q: t('network.faq3_q', 'Do you keep logs?'),
      a: t('network.faq3_a', 'The VPN runs on RAM-only servers under a published policy that does not retain source IP addresses or connection timestamps. Residential proxy traffic is handled by the provider under its own policy. Read the applicable policy before relying on either tool for a specific threat model.'),
    },
    {
      q: t('network.faq4_q', 'Residential vs datacenter proxies?'),
      a: t('network.faq4_a', 'Residential proxies use real consumer ISP addresses, so sites see ordinary traffic; they are metered in GB. Datacenter proxies are faster and cheaper but easier to block. walls.rip sells residential proxies only.'),
    },
    {
      q: t('network.faq5_q', 'How do sticky sessions work?'),
      a: t('network.faq5_a', 'A proxy connection keeps the same IP for about five minutes, then rotates. Country targeting is applied when the session starts, so a new session can use a different country.'),
    },
  ];

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://walls.rip/' },
      { '@type': 'ListItem', position: 2, name: t('network.breadcrumb', 'Network'), item: 'https://walls.rip/network' },
    ],
  };

  const panel = 'bg-wr-surface border border-wr-border rounded-sm';
  const mono = 'font-mono text-[10px] uppercase tracking-[0.18em] text-wr-dim';

  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title="Anonymous VPN & Residential Proxy — walls.rip"
        description="Compare an anonymous VPN and residential proxies: whole-device encryption versus per-session residential IPs. Crypto-only checkout, no account. WireGuard, OpenVPN, VLESS and HTTP residential proxy packages."
        path="/network"
        image="/og-image.jpg"
        schemas={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Network hub — VPN & residential proxy',
            url: 'https://walls.rip/network',
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Web',
            description: 'Compare and buy an anonymous VPN or residential proxy with crypto. No account.',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: 'Anonymous VPN and residential proxy',
            serviceType: 'Network privacy',
            areaServed: 'Worldwide',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
          faqSchema,
          breadcrumbSchema,
        ]}
      />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />

      <main className="w-full max-w-5xl px-4 md:px-6 relative z-10 pb-12">
        <nav aria-label="Breadcrumb" className="text-[10px] uppercase tracking-[0.18em] text-wr-dim mb-6">
          <Link to={lp('/')} className="hover:text-wr-accent">{t('network.home', 'Home')}</Link>
          <span className="mx-2">/</span>
          <span className="text-current">{t('network.breadcrumb', 'Network')}</span>
        </nav>

        {/* Hero */}
        <section className="mb-10">
          <div className={mono}>{t('network.eyebrow', 'VPN & proxy')}</div>
          <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight leading-[1.05] mt-3 mb-4">
            {t('network.h1', 'Anonymous VPN and residential proxy')}
          </h1>
          <p className="max-w-2xl text-sm md:text-base leading-7 text-current">
            {t('network.what', 'A VPN encrypts all your traffic; a proxy changes the IP for one app or session. Both are prepaid and account-free.')}
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link to={lp('/vpn')} className="inline-flex items-center gap-2 px-5 py-3 bg-wr-green text-black text-xs font-bold uppercase tracking-widest rounded-sm hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base">
              {t('network.cta_vpn', 'Browse VPN plans')} <ArrowRight size={14} />
            </Link>
            <Link to={lp('/proxy')} className="inline-flex items-center gap-2 px-5 py-3 border border-wr-accent text-wr-accent text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-wr-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base">
              {t('network.cta_proxy', 'Browse residential proxies')} <ArrowRight size={14} />
            </Link>
            <a href="#compare" className="inline-flex items-center gap-2 px-3 py-3 text-xs font-bold uppercase tracking-widest text-wr-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base">
              {t('network.cta_compare', 'Compare VPN vs proxy')} <ChevronDown size={14} />
            </a>
          </div>
        </section>

        {/* Comparison */}
        <section id="compare" className={`${panel} p-5 md:p-7 mb-6`}>
          <div className={mono}>{t('network.spec_matrix', 'Compare at a glance')}</div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mt-2 mb-5">
            {t('network.compare_h2', 'VPN vs proxy: pick the right tool')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.16em] text-wr-dim">
                  <th className="py-2 pr-3 font-bold w-1/4">&nbsp;</th>
                  <th className="py-2 px-3 font-bold text-wr-green">VPN</th>
                  <th className="py-2 px-3 font-bold text-wr-accent">Residential proxy</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.labelKey} className="border-t border-wr-border/40 align-top">
                    <th scope="row" className="py-3 pr-3 text-[10px] uppercase tracking-[0.14em] text-wr-dim font-bold">{t(row.labelKey, row.label)}</th>
                    <td className="py-3 px-3 text-current">{t(row.vpnKey, row.vpn)}</td>
                    <td className="py-3 px-3 text-current">{t(row.proxyKey, row.proxy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 pt-4 border-t border-wr-border/40 text-xs leading-6 text-wr-dim">
            <span className="text-wr-secondary font-bold uppercase tracking-widest text-[10px] mr-2">Verdict</span>
            {t('network.verdict', 'Choose the VPN for whole-device encryption. Choose the proxy for granular, programmatic routing through clean residential IPs.')}
          </p>
        </section>

        {/* Specs */}
        <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {specs.map(spec => (
            <div key={spec.label} className={`${panel} p-4`}>
              <div className="text-sm md:text-base font-bold text-wr-accent break-words">{spec.value}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-wr-dim mt-1">{spec.label}</div>
            </div>
          ))}
        </section>

        {/* Product cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <article className={`${panel} p-5 md:p-6 flex flex-col`}>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={16} className="text-wr-green" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-wr-dim">{t('network.card_vpn_label', 'How it connects')}</span>
            </div>
            <h3 className="text-lg font-black tracking-tight mb-2">{t('network.card_vpn_title', 'Encrypted VPN tunnel')}</h3>
            <ul className="space-y-2 text-xs text-current">
              {[
                t('network.card_vpn_f1', 'WireGuard, OpenVPN and VLESS configs'),
                t('network.card_vpn_f2', 'QR or config-file download per device'),
                t('network.card_vpn_f3', 'Prepaid term, no auto-renew'),
                t('network.card_vpn_f4', 'RAM-only servers, no source-IP retention'),
              ].map(item => (
                <li key={item} className="flex items-start gap-2"><Check size={13} className="text-wr-green shrink-0 mt-0.5" />{item}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5 mt-4">
              {[
                t('network.chip_wg', 'WireGuard · fastest, default'),
                t('network.chip_ovpn', 'OpenVPN · routers and legacy'),
                t('network.chip_vless', 'VLESS · CDN-fronted'),
              ].map(chip => (
                <span key={chip} className="text-[10px] px-2 py-1 border border-wr-green/30 bg-wr-green/5 text-wr-green rounded-sm">{chip}</span>
              ))}
            </div>
            <Link to={lp('/vpn')} className="text-[10px] uppercase tracking-[0.16em] text-wr-secondary hover:underline mt-3">
              {t('network.protocol_guide', 'Full protocol guide')} →
            </Link>
            <div className="mt-auto pt-5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-wr-dim">{t('network.live_catalog', 'Live catalog')}</div>
              <div className="text-lg font-bold text-wr-green mt-1">{vpnPrice}</div>
              <Link to={lp('/vpn')} className="mt-3 inline-flex items-center justify-center gap-2 w-full px-4 py-3 bg-wr-green text-black text-xs font-bold uppercase tracking-widest rounded-sm hover:opacity-90">
                {t('network.see_vpn', 'See VPN plans')} <ArrowRight size={14} />
              </Link>
            </div>
          </article>

          <article className={`${panel} p-5 md:p-6 flex flex-col`}>
            <div className="flex items-center gap-2 mb-3">
              <Wifi size={16} className="text-wr-accent" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-wr-dim">{t('network.card_proxy_label', 'How it connects')}</span>
            </div>
            <h3 className="text-lg font-black tracking-tight mb-2">{t('network.card_proxy_title', 'Residential proxy network')}</h3>
            <ul className="space-y-2 text-xs text-current">
              {[
                t('network.card_proxy_f1', 'HTTP only — no SOCKS5'),
                proxyCountries != null && proxyCountries > 0
                  ? t('network.card_proxy_f2_count', { count: proxyCountries, defaultValue: '150+ countries (provider coverage); {{count}} live now' })
                  : t('network.card_proxy_f2', '150+ countries, country targeting'),
                t('network.card_proxy_f3', '5-minute sticky sessions, then rotation'),
                t('network.card_proxy_f4', '0.5–100 GB packages on a 31-day term'),
                t('network.card_proxy_f5', 'Metered bandwidth on a shared gateway'),
              ].map(item => (
                <li key={item} className="flex items-start gap-2"><Check size={13} className="text-wr-accent shrink-0 mt-0.5" />{item}</li>
              ))}
            </ul>
            <div className="mt-auto pt-5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-wr-dim">{t('network.live_catalog', 'Live catalog')}</div>
              <div className="text-lg font-bold text-wr-accent mt-1">{proxyPrice}</div>
              <Link to={lp('/proxy')} className="mt-3 inline-flex items-center justify-center gap-2 w-full px-4 py-3 border border-wr-accent text-wr-accent text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-wr-accent/10">
                {t('network.see_proxy', 'See proxy plans')} <ArrowRight size={14} />
              </Link>
            </div>
          </article>
        </section>

        {/* How it works */}
        <section className="mb-6">
          <div className={mono}>{t('network.how_label', 'How to start')}</div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mt-2 mb-4">{t('network.how_h2', 'How it works')}</h2>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {steps.map((step, index) => (
              <li key={step.title} className={`${panel} p-4`}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-wr-dim mb-2">{t('network.step', 'Step')} {String(index + 1).padStart(2, '0')}</div>
                <div className="text-sm font-bold mb-1">{step.title}</div>
                <p className="text-xs leading-5 text-wr-dim">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-wr-dim mt-3">
            {t('network.payment_line', 'Each product page lists the coins its checkout accepts.')}
          </p>
        </section>

        {/* Use cases */}
        <section className="mb-6">
          <div className={mono}>{t('network.uc_label', 'When to use which')}</div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mt-2 mb-4">{t('network.uc_h2', 'Where each tool fits')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {useCases.map(uc => (
              <div key={uc.title} className={`${panel} p-4`}>
                <div className="flex items-center gap-2 text-sm font-bold mb-1">
                  {uc.title.includes('Protect') ? <Lock size={14} className="text-wr-green" /> : uc.title.includes('Region') || uc.title.includes('Scraping') ? <Globe size={14} className="text-wr-accent" /> : <Server size={14} className="text-wr-secondary" />}
                  {uc.title}
                </div>
                <p className="text-xs leading-5 text-wr-dim">{uc.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Who this is for */}
        <section className={`${panel} p-5 md:p-7 mb-6`}>
          <div className={mono}>{t('network.fit_label', 'Who this is for')}</div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mt-2 mb-4">{t('network.fit_h2', 'Choosing your protocol')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-wr-green/30 bg-wr-green/5 rounded-sm p-4">
              <div className="text-xs font-bold text-wr-green uppercase tracking-widest mb-2">{t('network.fit_vpn_title', 'Choose the VPN if…')}</div>
              <ul className="space-y-2 text-xs text-current">
                {[
                  t('network.fit_vpn_1', 'You want system-wide encryption covering every application'),
                  t('network.fit_vpn_2', 'WireGuard, OpenVPN or VLESS fits your devices'),
                  t('network.fit_vpn_3', 'A fixed 7, 15, 30, 90, 180 or 365-day term is acceptable'),
                ].map(item => <li key={item} className="flex items-start gap-2"><Check size={12} className="text-wr-green shrink-0 mt-0.5" />{item}</li>)}
              </ul>
            </div>
            <div className="border border-wr-accent/30 bg-wr-accent/5 rounded-sm p-4">
              <div className="text-xs font-bold text-wr-accent uppercase tracking-widest mb-2">{t('network.fit_proxy_title', 'Choose the proxy if…')}</div>
              <ul className="space-y-2 text-xs text-current">
                {[
                  t('network.fit_proxy_1', 'Residential IPs need to be isolated to one script or browser profile'),
                  t('network.fit_proxy_2', 'Country targeting matters more than encrypting the whole device'),
                  t('network.fit_proxy_3', 'A GB-metered 31-day package fits your workload'),
                ].map(item => <li key={item} className="flex items-start gap-2"><Check size={12} className="text-wr-accent shrink-0 mt-0.5" />{item}</li>)}
              </ul>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 border border-wr-warning/30 bg-wr-warning/5 rounded-sm p-3">
            <AlertTriangle size={14} className="text-wr-warning shrink-0 mt-0.5" />
            <p className="text-[11px] leading-5 text-wr-dim">
              {t('network.fit_neither', 'Neither tool is a shield for high-risk anonymity claims or criminal activity. Provider policies vary, and upstream transit providers enforce their own rules.')}
            </p>
          </div>
        </section>

        {/* Trust strip */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            t('network.trust_account', 'No account'),
            t('network.trust_kyc', 'No KYC'),
            t('network.trust_crypto', 'Crypto-only'),
            t('network.trust_policy', 'Provider policies vary'),
          ].map(item => (
            <div key={item} className={`${panel} px-3 py-3 text-center text-[10px] uppercase tracking-[0.14em] text-wr-dim`}>{item}</div>
          ))}
        </section>
        <p className="text-[10px] leading-5 text-wr-dim mb-8">
          {t('network.shared_note', 'Residential bandwidth is metered, and each package shares a gateway with per-package credentials — the standard model for residential pools.')}
        </p>

        {/* FAQ */}
        <section className="mb-10">
          <div className={mono}>{t('network.faq_label', 'Common questions')}</div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight mt-2 mb-4">{t('network.faq_h2', 'Frequently answered questions')}</h2>
          <div className="space-y-2">
            {faq.map(item => (
              <details key={item.q} className={`${panel} group`}>
                <summary className="list-none cursor-pointer px-4 py-3 text-sm font-bold flex items-center justify-between gap-3">
                  {item.q}
                  <ChevronDown size={14} className="text-wr-dim shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-4 pb-4 text-xs leading-6 text-wr-dim">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
