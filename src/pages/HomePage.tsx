import {
  Mail, Flame, MessageSquare, Phone, Shield, EyeOff, Zap,
  ArrowRight, ExternalLink, Lock, Globe, CreditCard, CheckCircle,
  Server, KeyRound, UserX, Clock, ShieldCheck, Layers
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';

const TOOLS = [
  {
    icon: Mail,
    name: 'Ghost Mail',
    tagline: 'Burner email that burns',
    description: 'Disposable encrypted email inboxes. No signup, no identity. PGP encryption, custom domains, auto-destruct timers.',
    path: '/mail',
    status: 'LIVE' as const,
    color: 'text-cyan-400',
    borderColor: 'border-cyan-400/20 hover:border-cyan-400/50',
    glowColor: 'from-cyan-400/20',
    bgAccent: 'bg-cyan-400',
  },
  {
    icon: Flame,
    name: 'Dead Drop',
    tagline: 'Self-destructing secrets',
    description: 'Create encrypted, self-destructing messages. AES-256-GCM client-side encryption. Server never sees your data.',
    path: '/drop',
    status: 'LIVE' as const,
    color: 'text-orange-400',
    borderColor: 'border-orange-400/20 hover:border-orange-400/50',
    glowColor: 'from-orange-400/20',
    bgAccent: 'bg-orange-400',
  },
  {
    icon: Phone,
    name: 'SMS Wall',
    tagline: 'Anonymous phone verification',
    description: 'Get temporary phone numbers for SMS verification. 150+ countries, 300+ services. Pay with XMR.',
    path: '/sms',
    status: 'LIVE' as const,
    color: 'text-green-400',
    borderColor: 'border-green-400/20 hover:border-green-400/50',
    glowColor: 'from-green-400/20',
    bgAccent: 'bg-green-400',
  },
  {
    icon: MessageSquare,
    name: 'Ghost Chat',
    tagline: 'PGP-encrypted comms over Nostr',
    description: 'End-to-end encrypted messaging via decentralized Nostr relays. Ephemeral identities, no server trust.',
    path: '/comms',
    status: 'LIVE' as const,
    color: 'text-purple-400',
    borderColor: 'border-purple-400/20 hover:border-purple-400/50',
    glowColor: 'from-purple-400/20',
    bgAccent: 'bg-purple-400',
  },
];

const STATS = [
  { value: '150+', label: 'Countries', icon: Globe },
  { value: '1,700+', label: 'SMS Services', icon: Phone },
  { value: 'Zero', label: 'Logs Stored', icon: EyeOff },
  { value: 'AES-256', label: 'Encryption', icon: Lock },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Choose a tool',
    description: 'Pick from Ghost Mail, Dead Drop, SMS Wall, or Ghost Chat — each designed for a specific communication need.',
    icon: Layers,
  },
  {
    step: '02',
    title: 'Pay with crypto (optional)',
    description: 'Premium features are paid with Monero or Lightning. No credit cards, no bank accounts, no identity leak.',
    icon: CreditCard,
  },
  {
    step: '03',
    title: 'Communicate freely',
    description: 'Use your burner inbox, drop a secret, verify anonymously, or chat encrypted. No logs, no trace.',
    icon: ShieldCheck,
  },
];

const FEATURES = [
  {
    icon: UserX,
    title: 'Zero Identity',
    description: 'No accounts, no email verification, no phone numbers. You are nobody — and that\'s the point.',
  },
  {
    icon: Lock,
    title: 'Client-Side Encryption',
    description: 'Dead Drop and Ghost Chat encrypt in your browser. The server stores ciphertext it cannot read.',
  },
  {
    icon: EyeOff,
    title: 'No Logs Policy',
    description: 'No IP addresses logged. No user-agent stored. No analytics. No tracking pixels. Nothing.',
  },
  {
    icon: KeyRound,
    title: 'PGP Support',
    description: 'Ghost Mail supports PGP encryption. Generate keys in-browser or import your own. Private key never leaves your device.',
  },
  {
    icon: Zap,
    title: 'XMR & Lightning',
    description: 'Pay with Monero for maximum privacy or Lightning for speed. Both are untraceable when used correctly.',
  },
  {
    icon: Clock,
    title: 'Auto-Destruct',
    description: 'Everything expires. Emails, messages, phone numbers — all self-destruct on schedule. No digital breadcrumbs.',
  },
  {
    icon: Server,
    title: 'Edge-First',
    description: 'Deployed on Cloudflare\'s global network. Sub-50ms response times worldwide. No single point of failure.',
  },
  {
    icon: Shield,
    title: 'Open Ecosystem',
    description: 'Part of the rip.family — kyc.rip, stables.rip, ripley.run, xmr402.org. Privacy tools that work together.',
  },
];

const COMPARISONS = [
  { feature: 'Account required', walls: 'No', others: 'Yes' },
  { feature: 'Identity verification', walls: 'Never', others: 'Often' },
  { feature: 'Payment method', walls: 'XMR / Lightning', others: 'Credit card' },
  { feature: 'IP logging', walls: 'None', others: 'Standard' },
  { feature: 'Message encryption', walls: 'Client-side AES-256', others: 'Server-side (if any)' },
  { feature: 'Data retention', walls: 'Auto-destruct', others: 'Indefinite' },
  { feature: 'Open source', walls: 'Yes', others: 'Rarely' },
];

export default function HomePage() {
  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO path="/" />

      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />

      <Header />

      <main className="w-full max-w-6xl mx-auto px-4 md:px-6 relative z-10">

        {/* ═══ HERO ═══ */}
        <section className="py-20 md:py-32 text-center relative">
          <div className="absolute inset-0 bg-gradient-to-b from-wr-accent/5 via-transparent to-transparent rounded-3xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-wr-accent/20 bg-wr-accent/5 text-wr-accent text-[10px] font-bold uppercase tracking-wider mb-8">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wr-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wr-accent" />
              </span>
              Anonymous Communication Toolkit
            </div>

            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-black tracking-tight mb-6 leading-[0.9]">
              Break <span className="text-wr-accent">walls</span>
              <br />
              <span className="text-wr-dim text-3xl md:text-5xl lg:text-6xl">for communication</span>
            </h1>

            <p className="text-wr-dim text-sm md:text-base max-w-xl mx-auto mb-12 leading-relaxed">
              Burner email. Encrypted dead drops. Anonymous SMS.
              <br />PGP chat over Nostr. No identity. No logs. No walls.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
              <Link
                to="/mail"
                className="inline-flex items-center gap-2 px-8 py-4 bg-wr-accent text-black font-bold text-xs uppercase tracking-wider rounded-sm hover:brightness-110 transition-all shadow-lg shadow-wr-accent/20"
              >
                <Mail size={14} />
                Get a Ghost Mail
              </Link>
              <Link
                to="/sms"
                className="inline-flex items-center gap-2 px-8 py-4 border border-wr-border text-wr-dim font-bold text-xs uppercase tracking-wider rounded-sm hover:border-wr-accent hover:text-wr-accent transition-all"
              >
                <Phone size={14} />
                Anonymous SMS
              </Link>
            </div>

            <p className="text-[10px] text-wr-dim/50 uppercase tracking-wider">
              No signup required — start using any tool instantly
            </p>
          </div>
        </section>

        {/* ═══ STATS BAR ═══ */}
        <section className="py-8 mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center p-5 rounded-sm border border-wr-border/50 bg-wr-surface/30">
                <stat.icon size={18} className="mx-auto mb-2 text-wr-accent" />
                <div className="text-2xl md:text-3xl font-black font-display text-wr-accent mb-1">{stat.value}</div>
                <div className="text-[10px] text-wr-dim uppercase tracking-wider font-bold">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ TOOL CARDS ═══ */}
        <section className="py-12">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight mb-3">
              Four tools. <span className="text-wr-accent">Zero trace.</span>
            </h2>
            <p className="text-wr-dim text-xs max-w-lg mx-auto">
              Each tool is purpose-built for a specific communication need. Use them standalone or together.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TOOLS.map((tool) => (
              <Link
                key={tool.path}
                to={tool.path}
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
                        <h3 className="font-bold text-sm tracking-wide">{tool.name}</h3>
                        <p className={`text-[10px] font-bold ${tool.color}`}>{tool.tagline}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border text-green-400 border-green-400/30 bg-green-400/10">
                      {tool.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-wr-dim leading-relaxed mb-4">{tool.description}</p>

                  <div className="flex items-center gap-1 text-[10px] font-bold text-wr-dim group-hover:text-wr-accent transition-colors">
                    Launch <ArrowRight size={10} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ═══ HOW IT WORKS ═══ */}
        <section className="py-16">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight mb-3">
              How it <span className="text-wr-accent">works</span>
            </h2>
            <p className="text-wr-dim text-xs">Three steps to private communication.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="relative p-6 rounded-sm border border-wr-border/50 bg-wr-surface/30">
                <div className="absolute top-4 right-4 text-4xl font-black text-wr-accent/10 font-display">{item.step}</div>
                <item.icon size={24} className="text-wr-accent mb-4" />
                <h3 className="text-sm font-bold mb-2">{item.title}</h3>
                <p className="text-[11px] text-wr-dim leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ FEATURES GRID ═══ */}
        <section className="py-16">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight mb-3">
              Privacy by <span className="text-wr-accent">design</span>
            </h2>
            <p className="text-wr-dim text-xs max-w-lg mx-auto">
              Not privacy by policy. Not privacy by promise. Privacy by architecture.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feat) => (
              <div key={feat.title} className="p-5 rounded-sm border border-wr-border/50 bg-wr-surface/30 hover:border-wr-accent/20 transition-colors">
                <feat.icon size={18} className="text-wr-accent mb-3" />
                <h3 className="text-xs font-bold mb-2">{feat.title}</h3>
                <p className="text-[10px] text-wr-dim leading-relaxed">{feat.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ COMPARISON TABLE ═══ */}
        <section className="py-16">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight mb-3">
              Why <span className="text-wr-accent">walls.rip</span>
            </h2>
            <p className="text-wr-dim text-xs">How we compare to typical communication tools.</p>
          </div>

          <div className="max-w-2xl mx-auto border border-wr-border rounded-sm overflow-hidden">
            <div className="grid grid-cols-3 text-[10px] font-bold uppercase tracking-wider bg-wr-surface p-3 border-b border-wr-border">
              <span className="text-wr-dim">Feature</span>
              <span className="text-wr-accent text-center">walls.rip</span>
              <span className="text-wr-dim text-center">Others</span>
            </div>
            {COMPARISONS.map((row, i) => (
              <div key={row.feature} className={`grid grid-cols-3 text-[11px] p-3 ${i % 2 === 0 ? 'bg-wr-surface/30' : ''} ${i < COMPARISONS.length - 1 ? 'border-b border-wr-border/30' : ''}`}>
                <span className="text-wr-dim font-bold">{row.feature}</span>
                <span className="text-wr-green text-center flex items-center justify-center gap-1">
                  <CheckCircle size={10} /> {row.walls}
                </span>
                <span className="text-wr-dim/60 text-center">{row.others}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ PAYMENT SECTION ═══ */}
        <section className="py-16">
          <div className="p-8 md:p-12 rounded-sm border border-wr-border bg-wr-surface/50 text-center">
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight mb-3">
              Pay <span className="text-wr-accent">anonymously</span>
            </h2>
            <p className="text-wr-dim text-xs max-w-md mx-auto mb-8">
              Premium features are paid with cryptocurrency. No credit cards, no bank accounts, no name attached to your purchase.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
              <div className="flex items-center gap-3 px-6 py-3 rounded-sm border border-wr-border bg-wr-base">
                <img src="/monero-xmr-logo.png" className="w-8 h-8" alt="Monero" />
                <div className="text-left">
                  <div className="text-sm font-bold">Monero (XMR)</div>
                  <div className="text-[10px] text-wr-dim">Maximum privacy</div>
                </div>
              </div>
              <div className="flex items-center gap-3 px-6 py-3 rounded-sm border border-wr-border bg-wr-base">
                <Zap size={28} className="text-yellow-400" />
                <div className="text-left">
                  <div className="text-sm font-bold">Lightning Network</div>
                  <div className="text-[10px] text-wr-dim">Instant settlement</div>
                </div>
              </div>
            </div>

            <a
              href="https://kyc.rip/swap?to=xmr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[10px] font-bold text-wr-accent hover:underline"
            >
              Need XMR? Swap without KYC at kyc.rip <ExternalLink size={10} />
            </a>
          </div>
        </section>

        {/* ═══ ECOSYSTEM ═══ */}
        <section className="py-12 mb-8">
          <div className="p-6 rounded-sm border border-wr-border bg-wr-surface/50 text-center">
            <p className="text-[10px] text-wr-dim uppercase tracking-[0.2em] font-bold mb-4">Part of the rip.family ecosystem</p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              {[
                { name: 'kyc.rip', url: 'https://kyc.rip', desc: 'No-KYC swaps' },
                { name: 'stables.rip', url: 'https://stables.rip', desc: 'Freeze tracker' },
                { name: 'xmrprice.live', url: 'https://xmrprice.live', desc: 'XMR price' },
                { name: 'ripley.run', url: 'https://ripley.run', desc: 'Monero toolkit' },
                { name: 'xmr402.org', url: 'https://xmr402.org', desc: 'XMR paywall' },
              ].map((site) => (
                <a
                  key={site.name}
                  href={site.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-sm border border-wr-border hover:border-wr-accent/30 transition-colors"
                >
                  <span className="font-bold group-hover:text-wr-accent transition-colors">{site.name}</span>
                  <span className="text-[9px] text-wr-dim hidden sm:inline">— {site.desc}</span>
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
