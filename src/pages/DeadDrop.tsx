import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flame, Link as LinkIcon, Lock, EyeOff, Copy, ArrowRight, Check, Terminal, Clock, Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { createDeadDrop, readDeadDrop } from '../utils/deadDropService';

const TTL_OPTIONS = [
  { labelKey: 'drop.ttl_10m', descKey: 'drop.ttl_10m_desc', value: 600 },
  { labelKey: 'drop.ttl_1h', descKey: 'drop.ttl_1h_desc', value: 3600 },
  { labelKey: 'drop.ttl_1d', descKey: 'drop.ttl_1d_desc', value: 86400 },
  { labelKey: 'drop.ttl_3d', descKey: 'drop.ttl_3d_desc', value: 259200 },
];

export function DeadDrop() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const readId = searchParams.get('id');

  const [mode, setMode] = useState<'CREATE' | 'READ'>(readId ? 'READ' : 'CREATE');
  const [secret, setSecret] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'ERROR' | 'BURNED'>('IDLE');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [ttl, setTtl] = useState<number>(86400);

  useEffect(() => {
    if (mode === 'CREATE' && !secret) {
      const rawSecret = searchParams.get('secret');
      if (rawSecret) {
        try {
          setSecret(decodeURIComponent(atob(rawSecret)));
        } catch { /* ignore */ }
      }
    }
  }, [mode, searchParams, secret]);

  const handleBurn = async () => {
    if (!secret) return;
    setStatus('PROCESSING');
    try {
      const fullLink = await createDeadDrop(secret, ttl);
      setGeneratedLink(fullLink);
      setStatus('SUCCESS');
      setSecret('');
    } catch (e: unknown) {
      setStatus('ERROR');
      setErrorMsg((e as Error).message);
    }
  };

  const handleRead = async () => {
    if (!readId) return;
    setStatus('PROCESSING');
    try {
      const hash = window.location.hash.substring(1);
      const decryptedText = await readDeadDrop(readId, hash);
      setSecret(decryptedText);
      setStatus('SUCCESS');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (msg === 'BURNED' || msg.includes('404')) {
        setStatus('BURNED');
      } else {
        setStatus('ERROR');
        setErrorMsg(msg || t('drop.decryption_failed'));
      }
    }
  };

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentTtlDesc = TTL_OPTIONS.find(o => o.value === ttl)?.descKey;
  const currentTtlLabel = TTL_OPTIONS.find(o => o.value === ttl)?.labelKey;

  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title="Dead Drop — Self-destructing encrypted messages"
        description="Create encrypted, self-destructing messages. AES-256-GCM client-side encryption. Server never sees your plaintext."
        path="/drop"
        image="/og-deaddrop.jpg"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Dead Drop',
          url: 'https://walls.rip/drop',
          applicationCategory: 'SecurityApplication',
          operatingSystem: 'Web',
          description: 'Self-destructing encrypted messages. AES-256-GCM client-side encryption. Server never sees your plaintext.',
          featureList: 'AES-256-GCM encryption, Self-destructing messages, Client-side encryption, Zero knowledge server',
          provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
        }}
      />

      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />

      <Header />

      <main className="w-full max-w-2xl px-4 relative z-10 flex flex-col gap-8 mb-20">
        {/* Hero */}
        <div className="text-center py-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 border border-orange-400/20 mb-4">
            <Flame size={32} />
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight mb-2">
            {t('drop.title_1')} <span className="text-orange-400">{t('drop.title_2')}</span>
          </h1>
          <p className="text-wr-dim text-xs">{t('drop.subtitle')}</p>
        </div>

        {/* CREATE MODE */}
        {mode === 'CREATE' && (
          <div>
            {status === 'SUCCESS' ? (
              <div className="p-8 rounded-sm border shadow-2xl text-center space-y-6 bg-wr-surface border-wr-border">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                  <LinkIcon size={32} />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-widest text-wr-green mb-2">{t('drop.drop_created')}</h2>
                  <div className="flex items-center justify-center gap-2 text-xs text-wr-dim mb-1">
                    {ttl === 0 ? <Flame size={12} className="text-red-500" /> : <Clock size={12} className="text-yellow-500" />}
                    <span className={ttl === 0 ? 'text-red-500/80' : 'text-yellow-500/80'}>
                      {t('drop.expires')}: {currentTtlLabel ? t(currentTtlLabel) : ''}
                    </span>
                  </div>
                </div>

                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-green-400 to-blue-500 rounded-sm blur opacity-30 group-hover:opacity-50 transition duration-300" />
                  <button
                    onClick={() => copyContent(generatedLink)}
                    className="w-full relative p-4 rounded bg-wr-base border border-wr-border cursor-pointer flex items-center justify-between gap-4 hover:border-wr-green transition-colors text-left"
                  >
                    <div className="font-mono text-xs break-all text-wr-green opacity-90 truncate">
                      {generatedLink}
                    </div>
                    {copied ? <Check size={16} className="shrink-0 text-green-500" /> : <Copy size={16} className="shrink-0 text-wr-dim group-hover:text-wr-green" />}
                  </button>
                </div>

                <button
                  onClick={() => { setStatus('IDLE'); setGeneratedLink(''); setCopied(false); setTtl(86400); }}
                  className="text-xs font-bold uppercase text-wr-dim hover:text-wr-green transition-colors"
                >
                  {t('drop.create_another')}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-600 to-red-600 rounded-sm blur opacity-10 group-hover:opacity-30 transition duration-500" />
                  <textarea
                    value={secret}
                    onChange={e => setSecret(e.target.value)}
                    placeholder={t('drop.placeholder')}
                    className="relative w-full h-48 p-6 rounded-sm outline-none font-mono text-sm resize-none shadow-xl transition-colors bg-wr-surface border border-wr-border text-wr-green placeholder-wr-dim focus:border-orange-400"
                    spellCheck={false}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {TTL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTtl(opt.value)}
                      className={`flex flex-col items-center justify-center p-2 rounded border text-[10px] font-mono transition-all ${
                        ttl === opt.value
                          ? 'bg-orange-400/10 border-orange-400 text-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.2)]'
                          : 'bg-wr-base border-wr-border text-wr-dim hover:border-wr-dim hover:text-orange-400/70'
                      }`}
                      title={t(opt.descKey)}
                    >
                      <span className="font-bold">{t(opt.labelKey)}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-start gap-2 text-[11px] text-wr-dim px-2 pt-1 min-h-[20px]">
                  {ttl === 0 ? <Flame size={12} className="text-red-500 mt-0.5" /> : <Hourglass size={12} className="text-yellow-500 mt-0.5" />}
                  <p className={ttl === 0 ? 'text-red-500/80' : 'text-wr-warning'}>
                    {currentTtlDesc ? t(currentTtlDesc) : ''}
                  </p>
                </div>

                {status === 'ERROR' && (
                  <div className="p-3 rounded bg-red-500/10 text-red-500 text-xs border border-red-500/30">
                    {errorMsg}
                    <div className="mt-1">
                      <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-red-400 hover:underline text-[10px]">
                        Need help? @kyc_rip_bot
                      </a>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleBurn}
                  disabled={!secret || status === 'PROCESSING'}
                  className={`w-full py-5 font-bold uppercase tracking-[0.3em] rounded transition-all duration-300 shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    status === 'PROCESSING'
                      ? 'bg-wr-surface text-wr-dim cursor-wait border border-wr-border'
                      : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-500/20 border border-orange-500/50'
                  }`}
                >
                  {status === 'PROCESSING' ? <Terminal className="animate-spin" size={18} /> : <Flame className="animate-bounce" size={18} />}
                  {status === 'PROCESSING' ? t('drop.encrypting') : t('drop.generate_link')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* READ MODE */}
        {mode === 'READ' && (
          <div>
            {status === 'SUCCESS' ? (
              <div className="p-8 rounded-sm border bg-wr-surface border-wr-green shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2 text-wr-green font-bold">
                    <Lock size={18} />
                    <span>{t('drop.decrypted_message')}</span>
                  </div>
                  <button
                    onClick={() => copyContent(secret)}
                    className="flex items-center gap-2 text-xs border border-wr-border px-3 py-1.5 rounded hover:bg-wr-green hover:text-wr-base transition-colors text-wr-green"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? t('drop.copied') : t('drop.copy')}
                  </button>
                </div>
                <div className="p-4 rounded bg-wr-base border border-wr-border font-mono text-sm break-words whitespace-pre-wrap text-wr-green select-all">
                  {secret}
                </div>
                <div className="mt-6 p-3 rounded bg-red-500/10 border border-red-500/20 flex gap-3 text-red-500 text-xs text-left">
                  <Flame size={16} className="shrink-0" />
                  <div>
                    <strong>{t('drop.data_incinerated')}</strong><br />
                    {t('drop.data_incinerated_desc')}
                  </div>
                </div>
              </div>
            ) : status === 'BURNED' ? (
              <div className="p-12 rounded-sm border border-wr-border bg-wr-surface text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-wr-base flex items-center justify-center text-wr-dim mb-4 border border-wr-border">
                  <EyeOff size={32} />
                </div>
                <h2 className="text-2xl font-bold text-wr-dim mb-2">{t('drop.not_found')}</h2>
                <p className="text-wr-dim text-sm max-w-xs mx-auto">
                  {t('drop.not_found_desc')}
                </p>
                <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-dim hover:text-orange-400 hover:underline text-xs transition-colors mt-4 inline-block">
                  Need help? @kyc_rip_bot
                </a>
                <button
                  onClick={() => { setSearchParams({}); setMode('CREATE'); setStatus('IDLE'); setSecret(''); }}
                  className="mt-8 text-xs font-bold uppercase text-wr-green hover:underline"
                >
                  {t('drop.create_new')}
                </button>
              </div>
            ) : (
              <div className="p-8 rounded-sm border shadow-2xl text-center space-y-8 bg-wr-surface border-wr-border">
                <div>
                  <h2 className="text-xl font-bold tracking-widest text-wr-green">{t('drop.incoming_drop')}</h2>
                  <p className="text-xs text-wr-dim mt-2" dangerouslySetInnerHTML={{ __html: t('drop.incoming_desc') }} />
                </div>

                {status === 'ERROR' && (
                  <div className="p-3 rounded bg-red-500/10 text-red-500 text-xs border border-red-500/30">
                    {t('drop.decryption_failed')}: {errorMsg}
                    <div className="mt-1">
                      <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-red-400 hover:underline text-[10px]">
                        Need help? @kyc_rip_bot
                      </a>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleRead}
                  disabled={status === 'PROCESSING'}
                  className="w-full py-5 font-bold uppercase tracking-[0.2em] rounded bg-wr-green text-wr-base hover:brightness-110 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  {status === 'PROCESSING' ? <Terminal className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                  {status === 'PROCESSING' ? t('drop.decrypting') : t('drop.open_message')}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
