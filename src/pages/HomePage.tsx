import {
  Mail, Flame, MessageSquare, Phone, Shield, EyeOff, Zap, Smartphone,
  ArrowRight, ExternalLink, Lock, Globe, CreditCard, CheckCircle,
  Server, KeyRound, UserX, Clock, ShieldCheck, Layers
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { BrickBreaker } from '../components/BrickBreaker';
import { SUPPORTED_LANGS } from '../i18n/config';

function useLangPrefix() {
  const { i18n } = useTranslation();
  const lang = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language) ? i18n.language : 'en';
  return (path: string) => lang === 'en' ? path : `/${lang}${path === '/' ? '' : path}`;
}

export default function HomePage() {
  const { t } = useTranslation();
  const lp = useLangPrefix();

  const TOOLS = [
    {
      icon: Mail,
      nameKey: 'home.tool_ghost_mail',
      taglineKey: 'home.tool_ghost_mail_tagline',
      descKey: 'home.tool_ghost_mail_desc',
      path: '/mail',
      status: 'LIVE' as const,
      color: 'text-cyan-400',
      borderColor: 'border-cyan-400/20 hover:border-cyan-400/50',
      glowColor: 'from-cyan-400/20',
      bgAccent: 'bg-cyan-400',
    },
    {
      icon: Flame,
      nameKey: 'home.tool_dead_drop',
      taglineKey: 'home.tool_dead_drop_tagline',
      descKey: 'home.tool_dead_drop_desc',
      path: '/drop',
      status: 'LIVE' as const,
      color: 'text-orange-400',
      borderColor: 'border-orange-400/20 hover:border-orange-400/50',
      glowColor: 'from-orange-400/20',
      bgAccent: 'bg-orange-400',
    },
    {
      icon: Phone,
      nameKey: 'home.tool_sms_wall',
      taglineKey: 'home.tool_sms_wall_tagline',
      descKey: 'home.tool_sms_wall_desc',
      path: '/sms',
      status: 'LIVE' as const,
      color: 'text-green-400',
      borderColor: 'border-green-400/20 hover:border-green-400/50',
      glowColor: 'from-green-400/20',
      bgAccent: 'bg-green-400',
    },
    {
      icon: MessageSquare,
      nameKey: 'home.tool_ghost_chat',
      taglineKey: 'home.tool_ghost_chat_tagline',
      descKey: 'home.tool_ghost_chat_desc',
      path: '/comms',
      status: 'LIVE' as const,
      color: 'text-purple-400',
      borderColor: 'border-purple-400/20 hover:border-purple-400/50',
      glowColor: 'from-purple-400/20',
      bgAccent: 'bg-purple-400',
    },
    {
      icon: Smartphone,
      nameKey: 'home.tool_esim',
      taglineKey: 'home.tool_esim_tagline',
      descKey: 'home.tool_esim_desc',
      path: '/esim',
      status: 'SOON' as const,
      color: 'text-yellow-400',
      borderColor: 'border-yellow-400/20 hover:border-yellow-400/50',
      glowColor: 'from-yellow-400/20',
      bgAccent: 'bg-yellow-400',
    },
    {
      icon: Shield,
      nameKey: 'home.tool_proxy',
      taglineKey: 'home.tool_proxy_tagline',
      descKey: 'home.tool_proxy_desc',
      path: '/proxy',
      status: 'SOON' as const,
      color: 'text-teal-400',
      borderColor: 'border-teal-400/20 hover:border-teal-400/50',
      glowColor: 'from-teal-400/20',
      bgAccent: 'bg-teal-400',
    },
  ];

  const STATS: { value?: string; valueKey?: string; labelKey: string; icon: typeof Globe }[] = [
    { value: '150+', labelKey: 'home.stat_countries', icon: Globe },
    { value: '1,700+', labelKey: 'home.stat_services', icon: Phone },
    { valueKey: 'home.stat_logs_value', labelKey: 'home.stat_logs', icon: EyeOff },
    { value: 'AES-256', labelKey: 'home.stat_encryption', icon: Lock },
  ];

  const HOW_IT_WORKS = [
    { step: '01', titleKey: 'home.step1_title', descKey: 'home.step1_desc', icon: Layers },
    { step: '02', titleKey: 'home.step2_title', descKey: 'home.step2_desc', icon: CreditCard },
    { step: '03', titleKey: 'home.step3_title', descKey: 'home.step3_desc', icon: ShieldCheck },
  ];

  const FEATURES = [
    { icon: UserX, titleKey: 'home.feat_zero_identity', descKey: 'home.feat_zero_identity_desc' },
    { icon: Lock, titleKey: 'home.feat_client_encryption', descKey: 'home.feat_client_encryption_desc' },
    { icon: EyeOff, titleKey: 'home.feat_no_logs', descKey: 'home.feat_no_logs_desc' },
    { icon: KeyRound, titleKey: 'home.feat_pgp', descKey: 'home.feat_pgp_desc' },
    { icon: Zap, titleKey: 'home.feat_xmr_ln', descKey: 'home.feat_xmr_ln_desc' },
    { icon: Clock, titleKey: 'home.feat_auto_destruct', descKey: 'home.feat_auto_destruct_desc' },
    { icon: Server, titleKey: 'home.feat_edge', descKey: 'home.feat_edge_desc' },
    { icon: Shield, titleKey: 'home.feat_ecosystem', descKey: 'home.feat_ecosystem_desc' },
  ];

  const COMPARISONS = [
    { featureKey: 'home.cmp_account', wallsKey: 'home.cmp_account_walls', othersKey: 'home.cmp_account_others' },
    { featureKey: 'home.cmp_identity', wallsKey: 'home.cmp_identity_walls', othersKey: 'home.cmp_identity_others' },
    { featureKey: 'home.cmp_payment', wallsKey: 'home.cmp_payment_walls', othersKey: 'home.cmp_payment_others' },
    { featureKey: 'home.cmp_ip', wallsKey: 'home.cmp_ip_walls', othersKey: 'home.cmp_ip_others' },
    { featureKey: 'home.cmp_encryption', wallsKey: 'home.cmp_encryption_walls', othersKey: 'home.cmp_encryption_others' },
    { featureKey: 'home.cmp_retention', wallsKey: 'home.cmp_retention_walls', othersKey: 'home.cmp_retention_others' },
    { featureKey: 'home.cmp_opensource', wallsKey: 'home.cmp_opensource_walls', othersKey: 'home.cmp_opensource_others' },
  ];

  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
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
            description: 'Anonymous communication toolkit. Burner email, encrypted dead drops, anonymous SMS verification, PGP chat over Nostr.',
            offers: { '@type': 'AggregateOffer', lowPrice: '0', highPrice: '5.00', priceCurrency: 'USD' },
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Ghost Mail',
            url: 'https://walls.rip/mail',
            applicationCategory: 'CommunicationApplication',
            operatingSystem: 'Web',
            description: 'Disposable encrypted email inboxes. No signup, no identity. PGP encryption, custom domains, auto-destruct timers.',
          },
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Dead Drop',
            url: 'https://walls.rip/drop',
            applicationCategory: 'SecurityApplication',
            operatingSystem: 'Web',
            description: 'Create encrypted, self-destructing messages. AES-256-GCM client-side encryption.',
          },
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'SMS Wall',
            url: 'https://walls.rip/sms',
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Web',
            description: 'Get temporary phone numbers for SMS verification. 150+ countries, 300+ services.',
          },
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Ghost Chat',
            url: 'https://walls.rip/comms',
            applicationCategory: 'CommunicationApplication',
            operatingSystem: 'Web',
            description: 'End-to-end encrypted messaging via decentralized Nostr relays. Ephemeral identities, no server trust.',
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://walls.rip/' },
              { '@type': 'ListItem', position: 2, name: 'Ghost Mail', item: 'https://walls.rip/mail' },
              { '@type': 'ListItem', position: 3, name: 'Dead Drop', item: 'https://walls.rip/drop' },
              { '@type': 'ListItem', position: 4, name: 'SMS Wall', item: 'https://walls.rip/sms' },
              { '@type': 'ListItem', position: 5, name: 'Ghost Chat', item: 'https://walls.rip/comms' },
              { '@type': 'ListItem', position: 6, name: 'API', item: 'https://walls.rip/api' },
            ],
          },
        ]}
      />

      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />

      <Header />

      <main className="w-full max-w-6xl mx-auto px-4 md:px-6 relative z-10">

        {/* HERO */}
        <section className="py-20 md:py-32 text-center relative">
          <div className="absolute inset-0 bg-gradient-to-b from-wr-accent/5 via-transparent to-transparent rounded-3xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-wr-accent/20 bg-wr-accent/5 text-wr-accent text-[10px] font-bold uppercase tracking-wider mb-8">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wr-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wr-accent" />
              </span>
              {t('home.badge')}
            </div>

            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-black tracking-tight mb-6 leading-[0.9]">
              {t('home.hero_break')} <span className="text-wr-accent">{t('home.hero_walls')}</span>
              <br />
              <span className="text-wr-dim text-3xl md:text-5xl lg:text-6xl">{t('home.hero_for')}</span>
            </h1>

            <p className="text-wr-dim text-sm md:text-base max-w-xl mx-auto mb-12 leading-relaxed">
              {t('home.hero_desc_1')}
              <br />{t('home.hero_desc_2')}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
              <Link
                to={lp('/mail')}
                className="inline-flex items-center gap-2 px-8 py-4 bg-wr-accent text-black font-bold text-xs uppercase tracking-wider rounded-sm hover:brightness-110 transition-all shadow-lg shadow-wr-accent/20"
              >
                <Mail size={14} />
                {t('home.cta_ghost_mail')}
              </Link>
              <Link
                to={lp('/sms')}
                className="inline-flex items-center gap-2 px-8 py-4 border border-wr-border text-wr-dim font-bold text-xs uppercase tracking-wider rounded-sm hover:border-wr-accent hover:text-wr-accent transition-all"
              >
                <Phone size={14} />
                {t('home.cta_sms')}
              </Link>
            </div>

            <p className="text-[10px] text-wr-dim/50 uppercase tracking-wider">
              {t('home.no_signup')}
            </p>
          </div>
        </section>

        {/* STATS BAR */}
        <section className="py-8 mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map((stat) => (
              <div key={stat.labelKey} className="text-center p-5 rounded-sm border border-wr-border/50 bg-wr-surface/30">
                <stat.icon size={18} className="mx-auto mb-2 text-wr-accent" />
                <div className="text-2xl md:text-3xl font-black font-display text-wr-accent mb-1">
                  {stat.valueKey ? t(stat.valueKey) : stat.value}
                </div>
                <div className="text-[10px] text-wr-dim uppercase tracking-wider font-bold">{t(stat.labelKey)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* TOOL CARDS */}
        <section className="py-12">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight mb-3">
              {t('home.tools_title_1')} <span className="text-wr-accent">{t('home.tools_title_2')}</span>
            </h2>
            <p className="text-wr-dim text-xs max-w-lg mx-auto">
              {t('home.tools_desc')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TOOLS.map((tool) => (
              <Link
                key={tool.path}
                to={lp(tool.path)}
                className={`group relative p-6 rounded-sm border bg-wr-surface/50 transition-all duration-300 ${tool.borderColor}`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${tool.glowColor} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-sm`} />

                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-sm ${tool.bgAccent}/10 flex items-center justify-center`}>
                        <tool.icon size={20} className={tool.color} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm tracking-wide">{t(tool.nameKey)}</h3>
                        <p className={`text-[10px] font-bold ${tool.color}`}>{t(tool.taglineKey)}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tool.status === 'SOON' ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10' : 'text-green-400 border-green-400/30 bg-green-400/10'}`}>
                      {tool.status === 'SOON' ? t('home.status_soon') : t('home.status_live')}
                    </span>
                  </div>

                  <p className="text-[11px] text-wr-dim leading-relaxed mb-4">{t(tool.descKey)}</p>

                  <div className="flex items-center gap-1 text-[10px] font-bold text-wr-dim group-hover:text-wr-accent transition-colors">
                    {t('home.launch')} <ArrowRight size={10} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="py-16">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight mb-3">
              {t('home.how_title_1')} <span className="text-wr-accent">{t('home.how_title_2')}</span>
            </h2>
            <p className="text-wr-dim text-xs">{t('home.how_subtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="relative p-6 rounded-sm border border-wr-border/50 bg-wr-surface/30">
                <div className="absolute top-4 right-4 text-4xl font-black text-wr-accent/10 font-display">{item.step}</div>
                <item.icon size={24} className="text-wr-accent mb-4" />
                <h3 className="text-sm font-bold mb-2">{t(item.titleKey)}</h3>
                <p className="text-[11px] text-wr-dim leading-relaxed">{t(item.descKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES GRID */}
        <section className="py-16">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight mb-3">
              {t('home.features_title_1')} <span className="text-wr-accent">{t('home.features_title_2')}</span>
            </h2>
            <p className="text-wr-dim text-xs max-w-lg mx-auto">
              {t('home.features_desc')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feat) => (
              <div key={feat.titleKey} className="p-5 rounded-sm border border-wr-border/50 bg-wr-surface/30 hover:border-wr-accent/20 transition-colors">
                <feat.icon size={18} className="text-wr-accent mb-3" />
                <h3 className="text-xs font-bold mb-2">{t(feat.titleKey)}</h3>
                <p className="text-[10px] text-wr-dim leading-relaxed">{t(feat.descKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* COMPARISON TABLE */}
        <section className="py-16">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight mb-3">
              {t('home.compare_title')} <span className="text-wr-accent">walls.rip</span>
            </h2>
            <p className="text-wr-dim text-xs">{t('home.compare_desc')}</p>
          </div>

          <div className="max-w-2xl mx-auto border border-wr-border rounded-sm overflow-hidden">
            <div className="grid grid-cols-3 text-[10px] font-bold uppercase tracking-wider bg-wr-surface p-3 border-b border-wr-border">
              <span className="text-wr-dim">{t('home.compare_feature')}</span>
              <span className="text-wr-accent text-center">{t('home.compare_walls')}</span>
              <span className="text-wr-dim text-center">{t('home.compare_others')}</span>
            </div>
            {COMPARISONS.map((row, i) => (
              <div key={row.featureKey} className={`grid grid-cols-3 text-[11px] p-3 ${i % 2 === 0 ? 'bg-wr-surface/30' : ''} ${i < COMPARISONS.length - 1 ? 'border-b border-wr-border/30' : ''}`}>
                <span className="text-wr-dim font-bold">{t(row.featureKey)}</span>
                <span className="text-wr-green text-center flex items-center justify-center gap-1">
                  <CheckCircle size={10} /> {t(row.wallsKey)}
                </span>
                <span className="text-wr-dim/60 text-center">{t(row.othersKey)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* PAYMENT SECTION */}
        <section className="py-16">
          <div className="p-8 md:p-12 rounded-sm border border-wr-border bg-wr-surface/50 text-center">
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight mb-3">
              {t('home.pay_title_1')} <span className="text-wr-accent">{t('home.pay_title_2')}</span>
            </h2>
            <p className="text-wr-dim text-xs max-w-md mx-auto mb-8">
              {t('home.pay_desc')}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
              <div className="flex items-center gap-3 px-6 py-3 rounded-sm border border-wr-border bg-wr-base">
                <img src="/monero-xmr-logo.png" className="w-8 h-8" alt="Monero" />
                <div className="text-left">
                  <div className="text-sm font-bold">{t('home.pay_xmr')}</div>
                  <div className="text-[10px] text-wr-dim">{t('home.pay_xmr_desc')}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 px-6 py-3 rounded-sm border border-wr-border bg-wr-base">
                <Zap size={28} className="text-yellow-400" />
                <div className="text-left">
                  <div className="text-sm font-bold">{t('home.pay_ln')}</div>
                  <div className="text-[10px] text-wr-dim">{t('home.pay_ln_desc')}</div>
                </div>
              </div>
            </div>

            <a
              href="https://kyc.rip/swap?to=xmr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[10px] font-bold text-wr-accent hover:underline"
            >
              {t('home.pay_need_xmr')} <ExternalLink size={10} />
            </a>
          </div>
        </section>

        {/* ECOSYSTEM */}
        <section className="py-12 mb-8">
          <div className="p-6 rounded-sm border border-wr-border bg-wr-surface/50 text-center">
            <p className="text-[10px] text-wr-dim uppercase tracking-[0.2em] font-bold mb-4">{t('home.ecosystem_title')}</p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              {[
                { name: 'kyc.rip', url: 'https://kyc.rip', descKey: 'footer.no_kyc_swaps' },
                { name: 'stables.rip', url: 'https://stables.rip', descKey: 'footer.freeze_tracker' },
                { name: 'xmrprice.live', url: 'https://xmrprice.live', descKey: 'footer.xmr_price' },
                { name: 'ripley.run', url: 'https://ripley.run', descKey: 'footer.monero_toolkit' },
                { name: 'xmr402.org', url: 'https://xmr402.org', descKey: 'footer.xmr_paywall' },
              ].map((site) => (
                <a
                  key={site.name}
                  href={site.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-sm border border-wr-border hover:border-wr-accent/30 transition-colors"
                >
                  <span className="font-bold group-hover:text-wr-accent transition-colors">{site.name}</span>
                  <span className="text-[9px] text-wr-dim hidden sm:inline">— {t(site.descKey)}</span>
                  <ExternalLink size={10} className="text-wr-dim" />
                </a>
              ))}
            </div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
