import { useState } from 'react';
import {
  Mail, Crown, MessageSquare, Phone, Shield, EyeOff, Zap, Smartphone,
  ArrowRight, ExternalLink, Lock, CreditCard,
  KeyRound, UserX, Clock, Layers, ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { BrickBreaker } from '../components/BrickBreaker';
import { WallSplash } from '../components/WallSplash';
import { SUPPORTED_LANGS } from '../i18n/config';

function useLangPrefix() {
  const { i18n } = useTranslation();
  const lang = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language) ? i18n.language : 'en';
  return (path: string) => lang === 'en' ? path : `/${lang}${path === '/' ? '' : path}`;
}

type Status = 'LIVE' | 'PRO' | 'SOON';

interface Tool {
  icon: typeof Mail;
  label: string;
  nameKey: string;
  nameFallback: string;
  descKey: string;
  descFallback: string;
  path: string;
  status: Status;
  accent: string;
  tile: string;
}

const TOOLS: Tool[] = [
  {
    icon: Mail,
    label: 'COMM-01',
    nameKey: 'home.tool_ghost_mail',
    nameFallback: 'Ghost Mail',
    descKey: 'home.v2_tool_mail_desc',
    descFallback: 'Disposable encrypted inbox with burn timers, custom domains and attachments.',
    path: '/mail',
    status: 'LIVE',
    accent: 'text-wr-accent',
    tile: 'bg-wr-accent/10',
  },
  {
    icon: Crown,
    label: 'COMM-02',
    nameKey: 'home.tool_ghost_mail_pro',
    nameFallback: 'Ghost Mail Pro',
    descKey: 'home.v2_tool_pro_desc',
    descFallback: 'Persistent address, aliases, compose and reply — paid monthly in crypto.',
    path: '/mail/pro',
    status: 'PRO',
    accent: 'text-wr-secondary',
    tile: 'bg-wr-secondary/10',
  },
  {
    icon: MessageSquare,
    label: 'VERIFY-01',
    nameKey: 'home.tool_sms_wall',
    nameFallback: 'SMS verification',
    descKey: 'home.v2_tool_sms_desc',
    descFallback: 'One-time numbers for account activation. Undelivered codes are refunded.',
    path: '/sms',
    status: 'LIVE',
    accent: 'text-wr-info',
    tile: 'bg-wr-info/10',
  },
  {
    icon: Smartphone,
    label: 'CELL-01',
    nameKey: 'home.tool_esim',
    nameFallback: 'Data eSIM',
    descKey: 'home.v2_tool_esim_desc',
    descFallback: 'Prepaid travel data profiles; the QR code is issued after the provider provisions the plan.',
    path: '/esim',
    status: 'LIVE',
    accent: 'text-wr-info',
    tile: 'bg-wr-info/10',
  },
  {
    icon: Phone,
    label: 'NUM-01',
    nameKey: 'home.tool_phone',
    nameFallback: 'UK numbers',
    descKey: 'home.v2_tool_phone_desc',
    descFallback: 'Prepaid +44 eSIM numbers on 6, 12 or 24-month terms, renewable.',
    path: '/uk-sim',
    status: 'LIVE',
    accent: 'text-wr-accent',
    tile: 'bg-wr-accent/10',
  },
  {
    icon: Shield,
    label: 'TUNNEL-01',
    nameKey: 'home.tool_vpn',
    nameFallback: 'VPN',
    descKey: 'home.v2_tool_vpn_desc',
    descFallback: 'Prepaid WireGuard, OpenVPN or VLESS configs; terms and prices are shown in the app.',
    path: '/vpn',
    status: 'LIVE',
    accent: 'text-wr-secondary',
    tile: 'bg-wr-secondary/10',
  },
];

const TRUST = [
  { icon: UserX, key: 'home.v2_trust_account', fallback: 'No account required' },
  { icon: Zap, key: 'home.v2_trust_pay', fallback: 'Pay in XMR or Lightning' },
  { icon: ShieldCheck, key: 'home.v2_trust_kyc', fallback: 'No KYC documents' },
  { icon: KeyRound, key: 'home.v2_trust_wallet', fallback: 'Prepaid wallet, no card' },
];

const FAQ = [
  {
    qKey: 'home.v2_faq_q1', q: 'Do I need an account?',
    aKey: 'home.v2_faq_a1', a: 'No. Every flow runs from a prepaid wallet token; no email, phone number or identity is requested.',
  },
  {
    qKey: 'home.v2_faq_q2', q: 'What if an SMS never arrives?',
    aKey: 'home.v2_faq_a2', a: 'The charge is refunded automatically when the provider does not deliver a code.',
  },
  {
    qKey: 'home.v2_faq_q3', q: 'Can I top up an existing eSIM?',
    aKey: 'home.v2_faq_a3', a: 'Yes — open the eSIM page and use “Top up an existing eSIM”, or renew a number from the number page.',
  },
  {
    qKey: 'home.v2_faq_q4', q: 'How does payment work?',
    aKey: 'home.v2_faq_a4', a: 'Fund one prepaid balance with Monero or Bitcoin Lightning, then spend it across mail, SMS, eSIM, numbers and VPN.',
  },
];

export default function HomePage() {
  const { t } = useTranslation();
  const lp = useLangPrefix();
  const [showSplash, setShowSplash] = useState(() => !localStorage.getItem('walls_smashed'));

  const HOW_IT_WORKS = [
    { step: '01', titleKey: 'home.v2_step1_title', fallback: 'Choose a product', descKey: 'home.v2_step1_desc', descFallback: 'Pick Ghost Mail, SMS, eSIM, a UK number or VPN.', icon: Layers },
    { step: '02', titleKey: 'home.v2_step2_title', fallback: 'Fund the balance', descKey: 'home.v2_step2_desc', descFallback: 'Pay in Monero or Lightning into one prepaid balance.', icon: CreditCard },
    { step: '03', titleKey: 'home.v2_step3_title', fallback: 'Receive delivery', descKey: 'home.v2_step3_desc', descFallback: 'Inbox, QR code or config — issued after payment and provider provisioning. VPN configs are generated after purchase.', icon: ShieldCheck },
  ];

  const WHY = [
    { icon: UserX, titleKey: 'home.v2_why_identity', fallback: 'No identity', descKey: 'home.v2_why_identity_desc', descFallback: 'No account, no email, no KYC documents.' },
    { icon: Lock, titleKey: 'home.v2_why_crypto', fallback: 'Client-side encryption', descKey: 'home.v2_why_crypto_desc', descFallback: 'Mail and drop content is encrypted before it leaves the browser.' },
    { icon: EyeOff, titleKey: 'home.v2_why_session', fallback: 'Ephemeral sessions', descKey: 'home.v2_why_session_desc', descFallback: 'Access is a wallet token in your browser; there is no server-side account.' },
    { icon: Clock, titleKey: 'home.v2_why_burn', fallback: 'Burn timers', descKey: 'home.v2_why_burn_desc', descFallback: 'Inboxes and messages expire on a timer you choose.' },
  ];

  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      {showSplash && (
        <WallSplash onComplete={() => {
          localStorage.setItem('walls_smashed', '1');
          setShowSplash(false);
        }} />
      )}
      <BrickBreaker />
      <SEO
        path="/"
        schemas={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'walls.rip',
            url: 'https://walls.rip',
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Web',
            description: 'Anonymous communication toolkit: burner email, encrypted dead drops, SMS verification, eSIM data, UK numbers and VPN configs. Paid in Monero or Lightning.',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ.map((item) => ({
              '@type': 'Question',
              name: t(item.qKey, item.q),
              acceptedAnswer: { '@type': 'Answer', text: t(item.aKey, item.a) },
            })),
          },
        ]}
      />

      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />

      {!showSplash && <Header />}

      <main className="w-full max-w-6xl mx-auto px-4 md:px-6 relative z-10">

        {/* HERO */}
        <section className="pt-14 md:pt-24 pb-14 md:pb-20">
          <div className="border border-wr-border/70 bg-wr-surface/30 rounded-sm p-7 md:p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-wr-accent/[0.04] to-transparent pointer-events-none" />
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-8">
                <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-bold text-wr-accent">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wr-accent opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wr-accent" />
                  </span>
                  {t('home.v2_kicker', 'Prepaid dispatch // no account')}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim">
                  {t('home.v2_hero_note', 'Pay in XMR or Lightning')}
                </span>
              </div>

              <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[0.95] max-w-3xl">
                {t('home.v2_hero', 'Anonymous communication tools paid with cryptocurrency.')}
              </h1>

              <p className="text-wr-dim text-sm md:text-base max-w-2xl mt-6 leading-relaxed">
                {t('home.v2_sub', 'Disposable email, SMS verification, mobile data eSIMs, UK numbers, temporary lines and encrypted VPN tunnels — without registration.')}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mt-8">
                <Link to={lp('/mail')} className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-wr-accent text-black font-bold text-[11px] uppercase tracking-[0.18em] rounded-sm hover:brightness-110 transition-all shadow-lg shadow-wr-accent/20">
                  <Mail size={14} /> {t('home.v2_cta_mail', 'Open Ghost Mail')}
                </Link>
                <Link to={lp('/esim')} className="inline-flex items-center justify-center gap-2 px-7 py-4 border border-wr-border text-current font-bold text-[11px] uppercase tracking-[0.18em] rounded-sm hover:border-wr-accent hover:text-wr-accent transition-all">
                  <Smartphone size={14} /> {t('home.v2_cta_esim', 'Browse eSIM plans')}
                </Link>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-8">
                {TRUST.map((item) => (
                  <span key={item.key} className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-bold text-wr-dim">
                    <item.icon size={12} className="text-wr-accent" /> {t(item.key, item.fallback)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* PRODUCT MATRIX */}
        <section className="pb-16">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim mb-1">
                {t('home.v2_matrix_kicker', '#01 // Product matrix')}
              </div>
              <h2 className="font-display text-xl md:text-2xl font-black tracking-tight">
                {t('home.v2_matrix_title', 'Six deployable primitives')}
              </h2>
            </div>
            <span className="hidden sm:block text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim">
              {t('home.v2_matrix_note', 'One prepaid balance')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TOOLS.map((tool) => (
              <Link
                key={tool.path}
                to={lp(tool.path)}
                className="group relative border border-wr-border/70 bg-wr-surface/40 rounded-sm p-5 hover:border-wr-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-9 h-9 rounded-sm ${tool.tile} flex items-center justify-center`}>
                    <tool.icon size={17} className={tool.accent} />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-sm border ${
                    tool.status === 'PRO'
                      ? 'text-wr-secondary border-wr-secondary/30 bg-wr-secondary/10'
                      : 'text-wr-accent border-wr-accent/30 bg-wr-accent/10'
                  }`}>
                    {tool.status === 'PRO' ? t('home.status_pro', 'PRO') : t('home.status_live', 'LIVE')}
                  </span>
                </div>

                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-wr-dim mb-1">{tool.label}</div>
                <h3 className="font-display text-base font-bold tracking-tight mb-2">
                  {t(tool.nameKey, tool.nameFallback)}
                </h3>
                <p className="text-[12px] text-wr-dim leading-relaxed mb-4">
                  {t(tool.descKey, tool.descFallback)}
                </p>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-wr-dim group-hover:text-wr-accent transition-colors">
                  {t('home.launch', 'Open')} <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="pb-16">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim mb-1">
                {t('home.v2_how_kicker', '#02 // How it works')}
              </div>
              <h2 className="font-display text-xl md:text-2xl font-black tracking-tight">
                {t('home.how_title_1', 'Three')} <span className="text-wr-accent">{t('home.how_title_2', 'steps')}</span>
              </h2>
            </div>
            <span className="hidden sm:block text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim">
              {t('home.v2_how_note', 'No sign-up')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="border border-wr-border/70 bg-wr-surface/30 rounded-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <item.icon size={18} className="text-wr-accent" />
                  <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-wr-dim">{item.step}</span>
                </div>
                <h3 className="text-sm font-bold mb-1.5">{t(item.titleKey, item.fallback)}</h3>
                <p className="text-[12px] text-wr-dim leading-relaxed">{t(item.descKey, item.descFallback)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* WHY WALLS.RIP */}
        <section className="pb-16">
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim mb-1">
              {t('home.v2_why_kicker', '#03 // Why walls.rip')}
            </div>
            <h2 className="font-display text-xl md:text-2xl font-black tracking-tight">
              {t('home.v2_why_title', 'Privacy that is verifiable, not a slogan')}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {WHY.map((item) => (
              <div key={item.titleKey} className="border border-wr-border/70 bg-wr-surface/30 rounded-sm p-5">
                <item.icon size={17} className="text-wr-secondary mb-3" />
                <h3 className="text-xs font-bold mb-1.5">{t(item.titleKey, item.fallback)}</h3>
                <p className="text-[11px] text-wr-dim leading-relaxed">{t(item.descKey, item.descFallback)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="pb-16">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim mb-1">
                {t('home.v2_faq_kicker', '#04 // Frequently asked')}
              </div>
              <h2 className="font-display text-xl md:text-2xl font-black tracking-tight">
                {t('home.v2_faq_title', 'Questions, answered plainly')}
              </h2>
            </div>
            <Link to={lp('/faq')} className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-wr-secondary hover:text-wr-accent transition-colors">
              {t('header.faq', 'FAQ')} <ArrowRight size={11} />
            </Link>
          </div>

          <div className="border border-wr-border/70 rounded-sm divide-y divide-wr-border/50 bg-wr-surface/20">
            {FAQ.map((item) => (
              <details key={item.qKey} className="group px-5 py-4">
                <summary className="list-none cursor-pointer flex items-center justify-between gap-4 text-sm font-bold">
                  {t(item.qKey, item.q)}
                  <span className="text-wr-dim group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <p className="text-[12px] text-wr-dim leading-relaxed mt-3 max-w-2xl">{t(item.aKey, item.a)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* PAYMENT */}
        <section className="pb-16">
          <div className="border border-wr-border/70 bg-wr-warm rounded-sm p-7 md:p-10">
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-stone mb-1">
              {t('home.v2_pay_kicker', 'Settlement')}
            </div>
            <h2 className="font-display text-xl md:text-2xl font-black tracking-tight mb-2">
              {t('home.pay_title_1', 'One balance,')} <span className="text-wr-accent">{t('home.pay_title_2', 'paid in crypto')}</span>
            </h2>
            <p className="text-[12px] text-wr-dim max-w-xl leading-relaxed mb-6">
              {t('home.v2_pay_desc', 'Top up with Monero or Bitcoin Lightning. No card, no processor, no chargeback trail.')}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="flex items-center gap-3 px-4 py-3 rounded-sm border border-wr-warm-border bg-wr-base">
                <img src="/monero-xmr-logo.png" className="w-7 h-7" alt="Monero" />
                <div>
                  <div className="text-sm font-bold">{t('home.pay_xmr', 'Monero')}</div>
                  <div className="text-[11px] text-wr-dim">{t('home.pay_xmr_desc', 'XMR on Mainnet')}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-sm border border-wr-warm-border bg-wr-base">
                <Zap size={24} className="text-wr-warning" />
                <div>
                  <div className="text-sm font-bold">{t('home.pay_ln', 'Lightning')}</div>
                  <div className="text-[11px] text-wr-dim">{t('home.pay_ln_desc', 'Instant sats')}</div>
                </div>
              </div>
            </div>

            <a
              href="https://kyc.rip/swap?to=xmr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[11px] font-bold text-wr-secondary hover:text-wr-accent transition-colors"
            >
              {t('home.pay_need_xmr', 'Need XMR? Swap for it')} <ExternalLink size={11} />
            </a>
          </div>
        </section>

        {/* ECOSYSTEM */}
        <section className="pb-10">
          <div className="border border-wr-border/70 bg-wr-surface/30 rounded-sm p-5">
            <p className="text-[11px] text-wr-dim uppercase tracking-[0.18em] font-bold mb-4">
              {t('home.ecosystem_title', 'rip.family')}
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { name: 'kyc.rip', url: 'https://kyc.rip' },
                { name: 'stables.rip', url: 'https://stables.rip' },
                { name: 'xmrprice.live', url: 'https://xmrprice.live' },
                { name: 'ripley.run', url: 'https://ripley.run' },
                { name: 'xmr402.org', url: 'https://xmr402.org' },
              ].map((site) => (
                <a
                  key={site.name}
                  href={site.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-sm border border-wr-border hover:border-wr-secondary/50 hover:text-wr-secondary transition-colors"
                >
                  <span className="font-bold">{site.name}</span>
                  <ExternalLink size={10} className="text-wr-dim" />
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Smash the Wall — replay button */}
      {!showSplash && (
        <div className="w-full max-w-6xl mx-auto px-4 md:px-6 mb-8 text-center">
          <button
            onClick={() => setShowSplash(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.2em] font-bold text-wr-dim border border-wr-border rounded-sm hover:border-wr-accent hover:text-wr-accent transition-all"
          >
            🔨 {t('home.smash_wall', 'Smash the Wall Again')}
          </button>
        </div>
      )}

      <Footer />
    </div>
  );
}
