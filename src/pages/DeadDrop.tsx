import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flame, Link as LinkIcon, Lock, EyeOff, Copy, ArrowRight, Check, Terminal, Clock, Hourglass } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { createDeadDrop, readDeadDrop } from '../utils/deadDropService';

const TTL_OPTIONS = [
  { label: '10 min', value: 600, desc: 'Self-destructs after 10 minutes, read or not.' },
  { label: '1 hour', value: 3600, desc: 'Accessible for 1 hour, then permanently erased.' },
  { label: '1 day', value: 86400, desc: 'Survives 24 hours. Good for async handoffs.' },
  { label: '3 days', value: 259200, desc: 'Three-day window before auto-destruction.' },
];

export function DeadDrop() {
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
        setErrorMsg(msg || 'Decryption failed');
      }
    }
  };

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentTtlDesc = TTL_OPTIONS.find(t => t.value === ttl)?.desc;
  const currentTtlLabel = TTL_OPTIONS.find(t => t.value === ttl)?.label;

  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title="Dead Drop — Self-destructing encrypted messages"
        description="Create encrypted, self-destructing messages. AES-256-GCM client-side encryption. Server never sees your plaintext."
        path="/drop"
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
            Dead <span className="text-orange-400">Drop</span>
          </h1>
          <p className="text-wr-dim text-xs">Self-destructing encrypted messages. Zero knowledge.</p>
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
                  <h2 className="text-xl font-bold tracking-widest text-wr-green mb-2">DROP CREATED</h2>
                  <div className="flex items-center justify-center gap-2 text-xs text-wr-dim mb-1">
                    {ttl === 0 ? <Flame size={12} className="text-red-500" /> : <Clock size={12} className="text-yellow-500" />}
                    <span className={ttl === 0 ? 'text-red-500/80' : 'text-yellow-500/80'}>
                      Expires: {currentTtlLabel}
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
                  Create Another
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-600 to-red-600 rounded-sm blur opacity-10 group-hover:opacity-30 transition duration-500" />
                  <textarea
                    value={secret}
                    onChange={e => setSecret(e.target.value)}
                    placeholder="Type or paste your secret message here..."
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
                      title={opt.desc}
                    >
                      <span className="font-bold">{opt.label}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-start gap-2 text-[11px] text-wr-dim px-2 pt-1 min-h-[20px]">
                  {ttl === 0 ? <Flame size={12} className="text-red-500 mt-0.5" /> : <Hourglass size={12} className="text-yellow-500 mt-0.5" />}
                  <p className={ttl === 0 ? 'text-red-500/80' : 'text-wr-warning'}>
                    {currentTtlDesc}
                  </p>
                </div>

                {status === 'ERROR' && (
                  <div className="p-3 rounded bg-red-500/10 text-red-500 text-xs border border-red-500/30">
                    {errorMsg}
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
                  {status === 'PROCESSING' ? 'Encrypting...' : 'Generate Link'}
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
                    <span>Decrypted Message</span>
                  </div>
                  <button
                    onClick={() => copyContent(secret)}
                    className="flex items-center gap-2 text-xs border border-wr-border px-3 py-1.5 rounded hover:bg-wr-green hover:text-wr-base transition-colors text-wr-green"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="p-4 rounded bg-wr-base border border-wr-border font-mono text-sm break-words whitespace-pre-wrap text-wr-green select-all">
                  {secret}
                </div>
                <div className="mt-6 p-3 rounded bg-red-500/10 border border-red-500/20 flex gap-3 text-red-500 text-xs text-left">
                  <Flame size={16} className="shrink-0" />
                  <div>
                    <strong>Data incinerated.</strong><br />
                    This message has been permanently destroyed on the server.
                  </div>
                </div>
              </div>
            ) : status === 'BURNED' ? (
              <div className="p-12 rounded-sm border border-wr-border bg-wr-surface text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-wr-base flex items-center justify-center text-wr-dim mb-4 border border-wr-border">
                  <EyeOff size={32} />
                </div>
                <h2 className="text-2xl font-bold text-wr-dim mb-2">NOT FOUND</h2>
                <p className="text-wr-dim text-sm max-w-xs mx-auto">
                  This drop has already been burned or never existed.
                </p>
                <button
                  onClick={() => { setSearchParams({}); setMode('CREATE'); setStatus('IDLE'); setSecret(''); }}
                  className="mt-8 text-xs font-bold uppercase text-wr-green hover:underline"
                >
                  Create New Drop
                </button>
              </div>
            ) : (
              <div className="p-8 rounded-sm border shadow-2xl text-center space-y-8 bg-wr-surface border-wr-border">
                <div>
                  <h2 className="text-xl font-bold tracking-widest text-wr-green">INCOMING DROP</h2>
                  <p className="text-xs text-wr-dim mt-2">
                    This message will be <strong>permanently destroyed</strong> after reading.
                  </p>
                </div>

                {status === 'ERROR' && (
                  <div className="p-3 rounded bg-red-500/10 text-red-500 text-xs border border-red-500/30">
                    Decryption failed: {errorMsg}
                  </div>
                )}

                <button
                  onClick={handleRead}
                  disabled={status === 'PROCESSING'}
                  className="w-full py-5 font-bold uppercase tracking-[0.2em] rounded bg-wr-green text-wr-base hover:brightness-110 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  {status === 'PROCESSING' ? <Terminal className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                  {status === 'PROCESSING' ? 'Decrypting...' : 'Open Message'}
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
