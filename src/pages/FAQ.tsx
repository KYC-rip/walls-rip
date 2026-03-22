import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO, buildFAQSchema } from '../components/SEO';

const FAQ_KEYS = [
  { qKey: 'faq.q1', aKey: 'faq.a1' },
  { qKey: 'faq.q2', aKey: 'faq.a2' },
  { qKey: 'faq.q3', aKey: 'faq.a3' },
  { qKey: 'faq.q4', aKey: 'faq.a4' },
  { qKey: 'faq.q5', aKey: 'faq.a5' },
  { qKey: 'faq.q6', aKey: 'faq.a6' },
  { qKey: 'faq.q7', aKey: 'faq.a7' },
  { qKey: 'faq.q8', aKey: 'faq.a8' },
  { qKey: 'faq.q9', aKey: 'faq.a9' },
  { qKey: 'faq.q10', aKey: 'faq.a10' },
  { qKey: 'faq.q11', aKey: 'faq.a11' },
  { qKey: 'faq.q12', aKey: 'faq.a12' },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-wr-border/50 rounded-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-wr-accent/5 transition-colors"
      >
        <span className="text-sm font-bold pr-4">{question}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-wr-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 text-[12px] text-wr-dim leading-relaxed border-t border-wr-border/30 pt-3">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  const { t } = useTranslation();

  const faqs = FAQ_KEYS.map((fk) => ({
    question: t(fk.qKey),
    answer: t(fk.aKey),
  }));

  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title="FAQ — walls.rip"
        description="Frequently asked questions about walls.rip anonymous communication tools — Ghost Mail, Dead Drop, SMS Wall."
        path="/faq"
        schema={buildFAQSchema(faqs)}
      />

      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />

      <Header />

      <main className="w-full max-w-3xl px-4 relative z-10 mb-20">
        <div className="text-center py-8 mb-6">
          <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight mb-2">
            {t('faq.title_1')} <span className="text-wr-accent">{t('faq.title_2')}</span>
          </h1>
          <p className="text-wr-dim text-xs">{t('faq.subtitle', { count: faqs.length })}</p>
        </div>

        <div className="space-y-2">
          {faqs.map((faq) => (
            <FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
