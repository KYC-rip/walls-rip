import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Zap, Shield, Wallet, Bell, Globe, Code, Clock, ChevronDown, Mail } from 'lucide-react';
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
            offers: { '@type': 'Offer', price: '0.15', priceCurrency: 'USD', description: 'Starting price for burner email inbox' },
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

      <main className={`w-full flex-grow relative z-10 transition-all duration-300 ${isFullscreen ? 'max-w-none h-screen p-0' : 'max-w-5xl px-4 md:px-6 pb-12'}`}>
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
          <div className="space-y-12 mt-12">

            {/* ═══ WHY CHOOSE GHOST MAIL ═══ */}
            <div className="mx-2 md:mx-0 space-y-6">
              <div className="text-center space-y-2">
                <h2 className="font-mono text-sm md:text-base font-bold uppercase tracking-widest text-current">
                  {t('mail.why_title')}
                </h2>
                <div className="mx-auto w-12 h-px bg-wr-accent" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {([
                  { icon: <Zap size={18} />, title: t('mail.why_instant_title'), desc: t('mail.why_instant_desc') },
                  { icon: <Shield size={18} />, title: t('mail.why_zero_logs_title'), desc: t('mail.why_zero_logs_desc') },
                  { icon: <Wallet size={18} />, title: t('mail.why_crypto_title'), desc: t('mail.why_crypto_desc') },
                  { icon: <Bell size={18} />, title: t('mail.why_telegram_title'), desc: t('mail.why_telegram_desc') },
                  { icon: <Globe size={18} />, title: t('mail.why_domains_title'), desc: t('mail.why_domains_desc') },
                  { icon: <Code size={18} />, title: t('mail.why_api_title'), desc: t('mail.why_api_desc') },
                ]).map((card) => (
                  <div key={card.title} className="p-4 rounded-sm border border-wr-border bg-wr-surface space-y-2 hover:border-wr-accent/30 transition-colors">
                    <div className="text-wr-accent">{card.icon}</div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-current">{card.title}</h3>
                    <p className="text-xs text-wr-dim leading-relaxed">{card.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ HOW IT WORKS ═══ */}
            <div className="mx-2 md:mx-0 space-y-6">
              <div className="text-center space-y-2">
                <h2 className="font-mono text-sm md:text-base font-bold uppercase tracking-widest text-current">
                  {t('mail.how_title')}
                </h2>
                <div className="mx-auto w-12 h-px bg-wr-accent" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-0 relative">
                {/* Connector lines (desktop only) */}
                <div className="hidden md:block absolute top-8 left-[calc(33.33%+0.5rem)] right-[calc(33.33%+0.5rem)] h-px bg-wr-accent/30" />
                {([
                  { num: '01', icon: <Clock size={20} />, title: t('mail.how_step1_title'), desc: t('mail.how_step1_desc') },
                  { num: '02', icon: <Shield size={20} />, title: t('mail.how_step2_title'), desc: t('mail.how_step2_desc') },
                  { num: '03', icon: <Mail size={20} />, title: t('mail.how_step3_title'), desc: t('mail.how_step3_desc') },
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
                  {t('mail.faq_title')}
                </h2>
                <div className="mx-auto w-12 h-px bg-wr-accent" />
              </div>
              <div className="space-y-2">
                {([1, 2, 3, 4, 5, 6] as const).map((n) => {
                  const isOpen = faqOpen === n;
                  return (
                    <div key={n} className="border border-wr-border rounded-sm bg-wr-surface overflow-hidden">
                      <button
                        onClick={() => setFaqOpen(isOpen ? null : n)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-wr-base/50 transition-colors"
                      >
                        <span className="text-xs font-bold text-current pr-4">{t(`mail.faq_q${n}`)}</span>
                        <ChevronDown
                          size={16}
                          className={`text-wr-accent shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <div
                        className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-60' : 'max-h-0'}`}
                      >
                        <div className="px-4 pb-4 text-xs text-wr-dim leading-relaxed border-t border-wr-border/30 pt-3">
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
