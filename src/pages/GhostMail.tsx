import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Zap, Shield, Wallet, Bell, Globe, Code, Clock, ChevronDown, Mail, Crown, ArrowRight } from 'lucide-react';
import { useGhostMail } from '../hooks/useGhostMail';
import { SEO } from '../components/SEO';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { ConfigPanel } from '../components/ghostMail/ConfigPanel';
import { InboxLayout } from '../components/ghostMail/InboxLayout';
import { PaymentModal } from '../components/ghostMail/PaymentModal';
import { ToSModal } from '../components/ghostMail/ToSModal';
import { ExtensionModal } from '../components/ghostMail/ExtensionModal';
import { PgpManagement } from '../components/ghostMail/PgpManagement';
import type { TierType } from '../hooks/useGhostMail';

export function GhostMail() {
  const {
    session, inbox, loading, error, timeLeft, paymentState,
    startPurchase, startExtension, cancelPayment,
    burnSession, removeEmail,
    enablePgp,
    verifyXmr402Proof,
    login,
    selectedDuration, setSelectedDuration, getFinalPrice,
    tiers, durations, domainOptions, configLoading,
    selectedTier, setSelectedTier
  } = useGhostMail();

  const [customName, setCustomName] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [isRandom, setIsRandom] = useState(true);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [showToS, setShowToS] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPgpModal, setShowPgpModal] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const { t } = useTranslation();

  // Restore read status
  useEffect(() => {
    const saved = localStorage.getItem(`read_mails_${session?.email}`);
    if (saved) {
      try {
        setReadIds(new Set(JSON.parse(saved)));
      } catch { /* ignore */ }
    }
  }, [session?.email]);

  // Auto-select first email
  useEffect(() => {
    if (inbox?.emails.length && !selectedEmailId) {
      const firstUnread = inbox.emails.find(e => !readIds.has(e.id));
      if (firstUnread) {
        setSelectedEmailId(firstUnread.id);
      } else {
        setSelectedEmailId(inbox.emails[0].id);
      }
    }
  }, [inbox?.emails, selectedEmailId, readIds]);

  // Track read emails
  const handleSelectEmail = (id: string | null) => {
    setSelectedEmailId(id);
    if (id && !readIds.has(id)) {
      const newReadIds = new Set(readIds).add(id);
      setReadIds(newReadIds);
      localStorage.setItem(`read_mails_${session?.email}`, JSON.stringify(Array.from(newReadIds)));
    }
  };

  const generateRandomName = useCallback(() => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'ghost-';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    setCustomName(result);
    setIsRandom(true);
  }, []);

  useEffect(() => {
    generateRandomName();
  }, [generateRandomName]);

  useEffect(() => {
    if (domainOptions.length > 0 && !selectedDomain) {
      const basicDomains = domainOptions.filter(d => d.tier === 'BASIC');
      if (basicDomains.length > 0) setSelectedDomain(basicDomains[0].domain);
    }
  }, [domainOptions, selectedDomain]);

  useEffect(() => {
    if (!domainOptions.length) return;
    if (selectedTier === 'BASIC' && !isRandom) {
      generateRandomName();
    }
    const available = domainOptions.filter(d => d.tier === selectedTier);
    if (available.length > 0) {
      const currentIsValid = available.find(d => d.domain === selectedDomain);
      if (!currentIsValid) setSelectedDomain(available[0].domain);
    }
  }, [selectedTier, domainOptions, isRandom, generateRandomName, selectedDomain]);

  const handleNameChange = (val: string) => {
    setCustomName(val.toLowerCase().replace(/[^a-z0-9-.]/g, ''));
    setIsRandom(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('COPIED');
  };

  // Small shared section header: mono kicker + display heading.
  const SectionHead = ({ kicker, title }: { kicker: string; title: string }) => (
    <div className="border-b border-wr-border/70 pb-4">
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-accent mb-2">{kicker}</div>
      <h2 className="font-display text-xl md:text-2xl font-black tracking-tight text-current">{title}</h2>
    </div>
  );

  return (
    <div className={`flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased bg-wr-base text-current transition-colors duration-300 ${isFullscreen ? 'p-0' : ''}`}>
      <SEO
        title="Ghost Mail — Burner email that burns"
        description="Disposable encrypted email inboxes. No signup, no identity. PGP encryption, custom domains, auto-destruct timers. Pay with XMR."
        path="/mail"
        image="/og-ghostmail.jpg"
        schemas={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Ghost Mail',
            url: 'https://walls.rip/mail',
            applicationCategory: 'CommunicationApplication',
            operatingSystem: 'Web',
            description: 'Disposable encrypted email inboxes with PGP support, custom domains, and auto-destruct timers.',
            featureList: 'PGP encryption, Custom domains, Auto-destruct timers, No signup required, XMR/Lightning/USDT payments',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Ghost Mail',
            url: 'https://walls.rip/mail',
            applicationCategory: 'CommunicationApplication',
            operatingSystem: 'Web',
            applicationSubCategory: 'Burner Email',
            description: 'Anonymous disposable email with PGP encryption. No identity required.',
            featureList: 'PGP encryption, Multiple domains, Auto-destruct, XMR/Lightning/USDT/XMR402 payments',
          },
        ]}
      />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />

      {!isFullscreen && <Header />}

      <main className={`w-full flex-grow relative z-10 transition-all duration-300 ${isFullscreen ? 'max-w-none h-screen p-0' : 'max-w-6xl px-4 md:px-6 pb-12'}`}>
        {!session ? (
          <ConfigPanel
            configLoading={configLoading}
            error={error}
            tiers={tiers}
            durations={durations}
            domainOptions={domainOptions}
            selectedTier={selectedTier}
            setSelectedTier={setSelectedTier as (t: TierType) => void}
            selectedDuration={selectedDuration}
            setSelectedDuration={setSelectedDuration}
            selectedDomain={selectedDomain}
            setSelectedDomain={setSelectedDomain}
            customName={customName}
            handleNameChange={handleNameChange}
            generateRandomName={generateRandomName}
            isRandom={isRandom}
            paymentState={paymentState}
            startPurchase={(tier: TierType, method: 'XMR' | 'LN' | 'USDT', chain?: string) => startPurchase(tier, `${customName}@${selectedDomain}`, method, chain)}
            getFinalPrice={getFinalPrice}
            openToS={() => setShowToS(true)}
            onImportSession={login}
          />
        ) : (
          <InboxLayout
            session={session}
            inbox={inbox}
            loading={loading}
            timeLeft={timeLeft}
            selectedEmailId={selectedEmailId}
            setSelectedEmailId={handleSelectEmail}
            readIds={readIds}
            copyToClipboard={copyToClipboard}
            burnSession={burnSession}
            onDeleteEmail={removeEmail}
            onExtendClick={() => setShowExtensionModal(true)}
            isFullscreen={isFullscreen}
            toggleFullscreen={() => setIsFullscreen(!isFullscreen)}
            pgpEnabled={inbox?.pgpEnabled || false}
            onPgpClick={() => setShowPgpModal(true)}
          />
        )}

        {/* ═══ INFO SECTIONS (below main content, hidden in inbox view) ═══ */}
        {!session && !isFullscreen && (
          <div className="space-y-12 md:space-y-16 mt-12 md:mt-16">

            {/* ═══ GHOST MAIL PRO UPSELL — violet secondary band ═══ */}
            <a
              href="/mail/pro"
              className="mx-2 md:mx-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-wr-secondary/30 bg-wr-secondary/[0.06] hover:border-wr-secondary/60 hover:bg-wr-secondary/10 rounded-sm p-4 md:p-5 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <span className="text-wr-secondary shrink-0 mt-0.5"><Crown size={16} /></span>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-wr-secondary">{t('mail.pro_cta_title', 'Ghost Mail Pro')}</div>
                  <div className="text-xs text-wr-dim mt-1 leading-relaxed max-w-lg">{t('mail.pro_cta_desc', 'Persistent inbox you can send from — aliases, compose & reply. Prepaid monthly in crypto.')}</div>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-wr-secondary group-hover:brightness-125 transition-all shrink-0 self-start sm:self-auto">
                {t('mail.pro_cta_go', 'Go Pro')} <ArrowRight size={13} />
              </span>
            </a>

            {/* ═══ BURNER VS PRO ═══ */}
            <div className="mx-2 md:mx-0 space-y-4">
              <SectionHead kicker={t('mail.compare_kicker', '// Compare')} title={t('mail.compare_title', 'Burner inbox or Pro address?')} />
              <p className="text-xs text-wr-dim leading-relaxed max-w-2xl">
                {t('mail.compare_intro', 'Both are Ghost Mail. A burner inbox is a one-off address that expires on its own; Pro is a persistent address you can send from, with aliases and your own domain.')}
              </p>
              <div className="overflow-x-auto border border-wr-border">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.14em] text-wr-dim">
                      <th className="p-3 font-bold w-1/4">&nbsp;</th>
                      <th className="p-3 font-bold text-wr-accent">{t('mail.compare_burner', 'Burner inbox')}</th>
                      <th className="p-3 font-bold text-wr-secondary">{t('mail.compare_pro', 'Ghost Mail Pro')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [t('mail.compare_lifetime', 'Lifetime'), t('mail.compare_burner_lifetime', 'Expires automatically (hours to days)'), t('mail.compare_pro_lifetime', 'Stays until cancelled; monthly renewal')],
                      [t('mail.compare_receiving', 'Receiving'), t('mail.compare_burner_receiving', 'Yes, on shared domains'), t('mail.compare_pro_receiving', 'Yes, on shared domains or yours')],
                      [t('mail.compare_sending', 'Sending'), t('mail.compare_burner_sending', 'No — receive only'), t('mail.compare_pro_sending', 'Compose, reply and send')],
                      [t('mail.compare_aliases', 'Aliases'), t('mail.compare_burner_aliases', 'One address'), t('mail.compare_pro_aliases', 'Multiple aliases (plan limit)')],
                      [t('mail.compare_domain', 'Custom domain'), t('mail.compare_burner_domain', '—'), t('mail.compare_pro_domain', 'Available')],
                      [t('mail.compare_billing', 'Billing'), t('mail.compare_burner_billing', 'Pay per inbox'), t('mail.compare_pro_billing', 'Prepaid monthly in crypto')],
                      [t('mail.compare_fit', 'Best for'), t('mail.compare_burner_fit', 'One-off signups and verification'), t('mail.compare_pro_fit', 'A long-term address and identity')],
                    ].map(row => (
                      <tr key={row[0]} className="border-t border-wr-border/40 align-top">
                        <th scope="row" className="p-3 text-[10px] uppercase tracking-[0.12em] text-wr-dim font-bold">{row[0]}</th>
                        <td className="p-3 text-current">{row[1]}</td>
                        <td className="p-3 text-current">{row[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {[
                  { q: t('mail.compare_q_send', 'Can I send email from a burner address?'), a: t('mail.compare_a_send', 'No. Burner inboxes are receive-only. Sending, replying and composing are Pro features.') },
                  { q: t('mail.compare_q_expire', 'Does a Ghost Mail address expire?'), a: t('mail.compare_a_expire', 'A burner inbox expires automatically after its window. A Pro address stays until you cancel, renewing monthly in crypto.') },
                  { q: t('mail.compare_q_domain', 'Can I use my own domain?'), a: t('mail.compare_a_domain', 'Yes — Ghost Mail Pro supports aliases and custom domains on paid plans.') },
                ].map(item => (
                  <details key={item.q} className="group border border-wr-border bg-wr-surface">
                    <summary className="list-none cursor-pointer p-3 text-[11px] font-bold flex items-start justify-between gap-2">
                      {item.q}
                      <ChevronDown size={14} className="text-wr-dim shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="px-3 pb-3 text-[11px] text-wr-dim leading-relaxed">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>

            {/* ═══ WHY CHOOSE GHOST MAIL ═══ */}
            <div className="mx-2 md:mx-0 space-y-6">
              <SectionHead kicker={t('mail.v2_capabilities', '#01 // Capabilities')} title={t('mail.why_title')} />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {([
                  { icon: <Zap size={15} />, title: t('mail.why_instant_title'), desc: t('mail.why_instant_desc') },
                  { icon: <Shield size={15} />, title: t('mail.why_zero_logs_title'), desc: t('mail.why_zero_logs_desc') },
                  { icon: <Wallet size={15} />, title: t('mail.why_crypto_title'), desc: t('mail.why_crypto_desc') },
                  { icon: <Bell size={15} />, title: t('mail.why_telegram_title'), desc: t('mail.why_telegram_desc') },
                  { icon: <Globe size={15} />, title: t('mail.why_domains_title'), desc: t('mail.why_domains_desc') },
                  { icon: <Code size={15} />, title: t('mail.why_api_title'), desc: t('mail.why_api_desc') },
                ]).map((card) => (
                  <div key={card.title} className="p-4 border border-wr-border bg-wr-surface space-y-2.5 hover:border-wr-accent/40 transition-colors">
                    <div className="text-wr-accent">{card.icon}</div>
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-current">{card.title}</h3>
                    <p className="text-[11px] text-wr-dim leading-relaxed">{card.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ HOW IT WORKS ═══ */}
            <div className="mx-2 md:mx-0 space-y-6">
              <SectionHead kicker={t('mail.v2_process', '#02 // Process')} title={t('mail.how_title')} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {([
                  { num: '01', icon: <Clock size={16} />, title: t('mail.how_step1_title'), desc: t('mail.how_step1_desc') },
                  { num: '02', icon: <Shield size={16} />, title: t('mail.how_step2_title'), desc: t('mail.how_step2_desc') },
                  { num: '03', icon: <Mail size={16} />, title: t('mail.how_step3_title'), desc: t('mail.how_step3_desc') },
                ]).map((step) => (
                  <div key={step.num} className="flex flex-col gap-3 p-5 border border-wr-border bg-wr-surface">
                    <div className="flex items-center justify-between">
                      <span className="text-wr-accent">{step.icon}</span>
                      <span className="text-[11px] font-bold font-mono tracking-[0.18em] text-wr-dim">{step.num}</span>
                    </div>
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-current">{step.title}</h3>
                    <p className="text-[11px] text-wr-dim leading-relaxed">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ FAQ ACCORDION ═══ */}
            <div className="mx-2 md:mx-0 space-y-6">
              <SectionHead kicker={t('mail.v2_faq_kicker', '#03 // FAQ')} title={t('mail.faq_title')} />
              <div className="space-y-2">
                {([1, 2, 3, 4, 5, 6] as const).map((n) => {
                  const isOpen = faqOpen === n;
                  return (
                    <div key={n} className="border border-wr-border bg-wr-surface overflow-hidden">
                      <button
                        onClick={() => setFaqOpen(isOpen ? null : n)}
                        className="w-full min-h-[44px] flex items-center justify-between gap-4 p-4 text-left hover:bg-wr-accent/[0.04] transition-colors"
                      >
                        <span className="text-xs font-bold text-current">{t(`mail.faq_q${n}`)}</span>
                        <ChevronDown
                          size={16}
                          className={`text-wr-accent shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <div
                        className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-60' : 'max-h-0'}`}
                      >
                        <div className="px-4 pb-4 pt-3 text-[11px] text-wr-dim leading-relaxed border-t border-wr-border/60">
                          {t(`mail.faq_a${n}`)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </main>

      {session && showPgpModal && (
        <PgpManagement
          email={session.email}
          pgpEnabled={inbox?.pgpEnabled || false}
          onEnable={async (pub, en) => {
            const ok = await enablePgp(pub, en);
            if (ok) setShowPgpModal(false);
            return ok;
          }}
          onClose={() => setShowPgpModal(false)}
        />
      )}

      {!isFullscreen && <Footer />}

      <ExtensionModal
        isOpen={showExtensionModal}
        onClose={() => setShowExtensionModal(false)}
        durations={durations}
        currentTierPrice={inbox && tiers[inbox.tier] ? (tiers[inbox.tier] as { priceUSD: number }).priceUSD : 0}
        onExtend={(d) => {
          startExtension(d);
          setShowExtensionModal(false);
        }}
      />

      <PaymentModal
        paymentState={paymentState}
        cancelPayment={cancelPayment}
        customName={session ? session.email.split('@')[0] : customName}
        selectedDomain={session ? session.email.split('@')[1] : selectedDomain}
        login={login}
        selectedTier={selectedTier}
        selectedDuration={selectedDuration}
        verifyXmr402Proof={verifyXmr402Proof}
      />

      <ToSModal
        isOpen={showToS}
        onClose={() => setShowToS(false)}
      />
    </div>
  );
}
