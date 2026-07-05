/* Shared email reader — used by both disposable Ghost Mail (InboxLayout) and Ghost Mail Pro.
   Pure presentational: subject header, FROM/DATE grid, TXT/HTML toggle, sandboxed iframe. */
import { useState, useEffect } from 'react';
import { Trash2, FileText, FileCode, Unlock, Paperclip, Download, CornerUpLeft } from 'lucide-react';

export interface ReaderAttachment { id: string; filename: string; mimeType: string; size: number }

export interface ReaderEmail {
  id: string;
  from: string;
  fromName?: string;
  subject: string;
  text: string;
  html?: string;
  receivedAt: string;
  isEncrypted?: boolean;
  attachments?: ReaderAttachment[];
}

interface EmailReaderProps {
  email: ReaderEmail;
  /** resolved (decrypted or plain) text — falls back to email.text */
  text?: string;
  /** resolved (decrypted or plain) html — falls back to email.html */
  html?: string;
  onDelete?: () => void;
  /** switch to the composer, pre-filled to reply to this message */
  onReply?: () => void;
  /** show the DECRYPTED badge (email was PGP and is now unlocked) */
  decrypted?: boolean;
  /** build a download URL for an attachment (Pro only); omit to hide attachments */
  attachmentHref?: (att: ReaderAttachment) => string;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** file-type badge colour + short label, matched to the redesign's accent-driven palette */
function extBadge(filename: string, mime: string): { label: string; className: string } {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return { label: 'PDF', className: 'bg-wr-error/20 text-wr-error' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) || mime.startsWith('image/')) return { label: 'IMG', className: 'bg-wr-info/20 text-wr-info' };
  if (['zip', 'gz', 'tar', '7z', 'rar'].includes(ext)) return { label: 'ZIP', className: 'bg-wr-warning/20 text-wr-warning' };
  if (['gpg', 'asc', 'pgp', 'key'].includes(ext)) return { label: 'PGP', className: 'bg-wr-green/20 text-wr-green' };
  if (['ovpn', 'conf', 'cfg'].includes(ext)) return { label: 'CFG', className: 'bg-wr-accent/20 text-wr-accent' };
  return { label: (ext || 'FILE').slice(0, 3).toUpperCase(), className: 'bg-wr-dim/20 text-wr-dim' };
}

function getProcessedHtml(html: string) {
  const responsiveStyles = `<meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body { margin: 0; padding: 15px; font-family: sans-serif; overflow-x: hidden !important; width: 100vw !important; box-sizing: border-box; background: white; color: #1a1a1a; } img, table, div, p { max-width: 100% !important; height: auto !important; overflow-wrap: break-word !important; } table { display: block !important; overflow-x: auto !important; }</style>`;
  const heightScript = `<script>function sendHeight() { window.parent.postMessage({ type: 'iframeHeight', height: document.documentElement.scrollHeight || document.body.scrollHeight }, '*'); } window.onload = sendHeight; setTimeout(sendHeight, 1000); new ResizeObserver(sendHeight).observe(document.body);<\/script>`;
  return responsiveStyles + html + heightScript;
}

export function EmailReader({ email, text, html, onDelete, onReply, decrypted, attachmentHref }: EmailReaderProps) {
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

  const attachments = email.attachments || [];
  const totalBytes = attachments.reduce((t, a) => t + (a.size || 0), 0);

  // Client-side "download all" — sequentially triggers each attachment's download URL.
  const downloadAll = () => {
    if (!attachmentHref) return;
    attachments.forEach((att, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = attachmentHref(att);
        a.download = att.filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 350);
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 md:p-6 border-b border-wr-border bg-wr-surface backdrop-blur-sm shrink-0 z-20">
        <div className="flex items-start justify-between mb-4 gap-4">
          <h2 className="text-lg md:text-xl font-bold text-wr-green tracking-wide leading-tight font-mono break-words flex-1 min-w-0">{email.subject}</h2>
          <div className="flex items-center gap-2 shrink-0">
            {onReply && (
              <button onClick={onReply} className="p-2 text-wr-dim hover:text-wr-green transition-colors rounded-sm hover:bg-wr-green/10" title="Reply"><CornerUpLeft size={16} /></button>
            )}
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
        {attachmentHref && attachments.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-wr-dim mr-0.5">
              <Paperclip size={11} /> {attachments.length === 1 ? '1 attachment' : `${attachments.length} attachments`}
            </span>
            {attachments.length > 1 && (
              <button
                onClick={downloadAll}
                className="flex items-center gap-1.5 border border-wr-accent/45 bg-wr-accent/10 hover:bg-wr-accent/20 text-wr-accent rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
              >
                <Download size={12} /> Download all · {fmtBytes(totalBytes)}
              </button>
            )}
            {attachments.map((att) => {
              const badge = extBadge(att.filename, att.mimeType);
              return (
                <a
                  key={att.id}
                  href={attachmentHref(att)}
                  download={att.filename}
                  className="flex items-center gap-2 max-w-full bg-wr-base border border-wr-border hover:border-wr-green rounded-sm pl-1.5 pr-2.5 py-1.5 text-[11px] text-wr-dim hover:text-wr-green transition-colors group"
                  title={`${att.filename} · ${fmtBytes(att.size)}`}
                >
                  <span className={`w-7 h-7 rounded-xs shrink-0 flex items-center justify-center font-mono text-[8px] font-bold ${badge.className}`}>{badge.label}</span>
                  <span className="flex flex-col leading-tight min-w-0">
                    <span className="truncate font-mono text-wr-info">{att.filename}</span>
                    <span className="text-wr-dim/60 text-[10px]">{fmtBytes(att.size)}</span>
                  </span>
                  <Download size={12} className="shrink-0 opacity-60 group-hover:opacity-100" />
                </a>
              );
            })}
          </div>
        )}
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
