import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
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
            startPurchase={(tier: TierType, method: 'XMR' | 'LN') => startPurchase(tier, `${customName}@${selectedDomain}`, method)}
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
      />

      <ToSModal
        isOpen={showToS}
        onClose={() => setShowToS(false)}
      />
    </div>
  );
}
