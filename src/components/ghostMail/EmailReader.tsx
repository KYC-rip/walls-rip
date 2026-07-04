/* Shared email reader — used by both disposable Ghost Mail (InboxLayout) and Ghost Mail Pro.
   Pure presentational: subject header, FROM/DATE grid, TXT/HTML toggle, sandboxed iframe. */
import { useState, useEffect } from 'react';
import { Trash2, FileText, FileCode, Unlock } from 'lucide-react';

export interface ReaderEmail {
  id: string;
  from: string;
  fromName?: string;
  subject: string;
  text: string;
  html?: string;
  receivedAt: string;
  isEncrypted?: boolean;
}

interface EmailReaderProps {
  email: ReaderEmail;
  /** resolved (decrypted or plain) text — falls back to email.text */
  text?: string;
  /** resolved (decrypted or plain) html — falls back to email.html */
  html?: string;
  onDelete?: () => void;
  /** show the DECRYPTED badge (email was PGP and is now unlocked) */
  decrypted?: boolean;
}

function getProcessedHtml(html: string) {
  const responsiveStyles = `<meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body { margin: 0; padding: 15px; font-family: sans-serif; overflow-x: hidden !important; width: 100vw !important; box-sizing: border-box; background: white; color: #1a1a1a; } img, table, div, p { max-width: 100% !important; height: auto !important; overflow-wrap: break-word !important; } table { display: block !important; overflow-x: auto !important; }</style>`;
  const heightScript = `<script>function sendHeight() { window.parent.postMessage({ type: 'iframeHeight', height: document.documentElement.scrollHeight || document.body.scrollHeight }, '*'); } window.onload = sendHeight; setTimeout(sendHeight, 1000); new ResizeObserver(sendHeight).observe(document.body);</script>`;
  return responsiveStyles + html + heightScript;
}

export function EmailReader({ email, text, html, onDelete, decrypted }: EmailReaderProps) {
  const currentText = text ?? email.text;
  const currentHtml = html ?? email.html;
  const hasHtml = !!currentHtml;
  const [viewMode, setViewMode] = useState<'text' | 'html'>(hasHtml ? 'html' : 'text');
  const [isMobile, setIsMobile] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(600);

  useEffect(() => { setViewMode(hasHtml ? 'html' : 'text'); }, [email.id, hasHtml]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data && e.data.type === 'iframeHeight') setIframeHeight(e.data.height);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 md:p-6 border-b border-wr-border bg-wr-surface backdrop-blur-sm shrink-0 z-20">
        <div className="flex items-start justify-between mb-4 gap-4">
          <h2 className="text-lg md:text-xl font-bold text-wr-green tracking-wide leading-tight font-mono break-words flex-1 min-w-0">{email.subject}</h2>
          <div className="flex items-center gap-2 shrink-0">
            {onDelete && (
              <button onClick={onDelete} className="p-2 text-wr-dim hover:text-wr-error transition-colors rounded-sm hover:bg-wr-error/10" title="Delete Message"><Trash2 size={16} /></button>
            )}
            {hasHtml && (
              <div className="flex bg-wr-base border border-wr-border rounded-sm overflow-hidden">
                <button onClick={() => setViewMode('text')} className={`px-2 md:px-3 py-1 text-[9px] md:text-[10px] uppercase font-bold flex items-center gap-1 ${viewMode === 'text' ? 'bg-wr-green text-wr-base' : 'text-wr-dim hover:bg-wr-green/5'}`}><FileText size={10} /> TXT</button>
                <button onClick={() => setViewMode('html')} className={`px-2 md:px-3 py-1 text-[9px] md:text-[10px] uppercase font-bold flex items-center gap-1 ${viewMode === 'html' ? 'bg-wr-green text-wr-base' : 'text-wr-dim hover:bg-wr-green/5'}`}><FileCode size={10} /> HTML</button>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[10px] md:text-xs font-mono">
          <span className="text-wr-dim uppercase">FROM</span><span className="text-wr-green font-bold truncate">{email.from}</span>
          <span className="text-wr-dim uppercase">DATE</span><span className="text-wr-dim">{new Date(email.receivedAt).toLocaleString()}</span>
          {email.isEncrypted && decrypted && <><span className="text-wr-accent uppercase">SECURITY</span><span className="text-wr-accent flex items-center gap-1"><Unlock size={10} /> DECRYPTED</span></>}
        </div>
      </div>
      <div className="flex-1 min-h-0 bg-wr-surface/30 relative overflow-y-auto custom-scrollbar">
        {viewMode === 'text' || !currentHtml ? (
          <div className="p-4 md:p-8 font-mono text-xs md:text-sm leading-relaxed text-wr-dim/90 whitespace-pre-wrap break-words">{currentText}</div>
        ) : (
          <div className="w-full relative bg-white/95 rounded-xs p-1" style={{ height: isMobile ? `${iframeHeight}px` : '100%' }}>
            <iframe srcDoc={getProcessedHtml(currentHtml)} className="w-full h-full border-none" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" title="Email Content" />
          </div>
        )}
      </div>
    </div>
  );
}
