import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO, buildFAQSchema } from '../components/SEO';

const FAQS = [
  {
    question: 'What is walls.rip?',
    answer: 'walls.rip is an anonymous communication toolkit. It provides burner email (Ghost Mail), encrypted self-destructing messages (Dead Drop), and anonymous SMS verification (SMS Wall) — all without requiring any identity or account.',
  },
  {
    question: 'Do I need to create an account?',
    answer: 'No. All tools work without accounts, email addresses, or any form of identity. Premium Ghost Mail features are paid with Monero (XMR) — no credit card needed.',
  },
  {
    question: 'How does Dead Drop encryption work?',
    answer: 'Dead Drop uses AES-256-GCM encryption entirely in your browser. The encryption key is generated client-side and included in the URL fragment (after #), which is never sent to the server. The server only stores the encrypted ciphertext and cannot decrypt your message.',
  },
  {
    question: 'What is Ghost Mail?',
    answer: 'Ghost Mail is a burner email service. You get a temporary email inbox that auto-destructs after a set time. Available in free (BASIC) and premium tiers. Premium adds custom names, premium domains, and PGP encryption for incoming emails.',
  },
  {
    question: 'How does SMS Wall work?',
    answer: 'SMS Wall provides temporary phone numbers for receiving SMS verification codes. Choose a country and service, get a number, use it for verification, and receive the code. Numbers are one-time use and not linked to your identity.',
  },
  {
    question: 'Do you log IPs or user data?',
    answer: 'No. We do not log IP addresses, user agents, or any identifying information. Dead Drop messages are encrypted client-side — we cannot read them even if compelled to.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'Premium features are paid with Monero (XMR). This ensures payment privacy — we cannot trace who paid for what. Some services also accept Bitcoin via Lightning Network.',
  },
  {
    question: 'Is this legal?',
    answer: 'Yes. Privacy tools are legal. Using temporary email addresses and phone numbers for legitimate purposes (protecting your real identity from data brokers, avoiding spam, testing services) is perfectly legal. We do not condone using these tools for illegal activities.',
  },
  {
    question: 'What happens if my Dead Drop link stops working?',
    answer: 'Dead Drops are designed to self-destruct. Once read, the message is permanently deleted from the server. If the TTL (time-to-live) expires before reading, it is also deleted. This is by design — no backups, no recovery.',
  },
  {
    question: 'How is walls.rip related to kyc.rip?',
    answer: 'walls.rip is part of the rip.family ecosystem, which includes kyc.rip (no-KYC exchange aggregator), stables.rip (stablecoin freeze tracker), xmrprice.live (Monero price tracker), ripley.run (Monero toolkit), and xmr402.org (payment protocol). All projects share a commitment to financial privacy.',
  },
  {
    question: 'Why "walls.rip"?',
    answer: 'The name represents breaking walls (barriers) to free communication. RIP the walls that stand between you and private, uncensored communication.',
  },
  {
    question: 'Can I self-host these tools?',
    answer: 'Dead Drop can run fully client-side with any compatible backend storage. Ghost Mail requires the mail-api backend. The codebases are open for inspection. Contact us if you\'re interested in self-hosting.',
  },
];

function FAQItem({ faq }: { faq: { question: string; answer: string } }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-wr-border/50 rounded-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-wr-accent/5 transition-colors"
      >
        <span className="text-sm font-bold pr-4">{faq.question}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-wr-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 text-[12px] text-wr-dim leading-relaxed border-t border-wr-border/30 pt-3">
          {faq.answer}
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title="FAQ — walls.rip"
        description="Frequently asked questions about walls.rip anonymous communication tools — Ghost Mail, Dead Drop, SMS Wall."
        path="/faq"
        schema={buildFAQSchema(FAQS)}
      />

      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />

      <Header />

      <main className="w-full max-w-3xl px-4 relative z-10 mb-20">
        <div className="text-center py-8 mb-6">
          <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight mb-2">
            Frequently Asked <span className="text-wr-accent">Questions</span>
          </h1>
          <p className="text-wr-dim text-xs">{FAQS.length} questions about privacy, encryption, and anonymous communication.</p>
        </div>

        <div className="space-y-2">
          {FAQS.map((faq) => (
            <FAQItem key={faq.question} faq={faq} />
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
