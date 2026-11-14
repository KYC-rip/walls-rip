/* Shared email reader — used by both disposable Ghost Mail (InboxLayout) and Ghost Mail Pro.
   Pure presentational: subject header, FROM/RECEIVED grid, TXT/HTML toggle, sandboxed iframe. */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

/** file-type badge colour + short label.
    PGP = emerald, IMG/CFG = sky, PDF/ZIP = amber, anything else = dim. */
function extBadge(filename: string, mime: string): { label: string; className: string } {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (['gpg', 'asc', 'pgp', 'key'].includes(ext)) return { label: 'PGP', className: 'bg-wr-green/15 text-wr-green border border-wr-green/30' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) || mime.startsWith('image/')) return { label: 'IMG', className: 'bg-wr-info/15 text-wr-info border border-wr-info/30' };
  if (ext === 'pdf') return { label: 'PDF', className: 'bg-wr-warning/15 text-wr-warning border border-wr-warning/30' };
  if (['zip', 'gz', 'tar', '7z', 'rar'].includes(ext)) return { label: 'ZIP', className: 'bg-wr-warning/15 text-wr-warning border border-wr-warning/30' };
  if (['ovpn', 'conf', 'cfg'].includes(ext)) return { label: 'CFG', className: 'bg-wr-info/15 text-wr-info border border-wr-info/30' };
  return { label: (ext || 'FILE').slice(0, 3).toUpperCase(), className: 'bg-wr-dim/15 text-wr-dim border border-wr-border' };
}

function getProcessedHtml(html: string) {
  const responsiveStyles = `<meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body { margin: 0; padding: 15px; font-family: sans-serif; overflow-x: hidden !important; width: 100vw !important; box-sizing: border-box; background: white; color: #1a1a1a; } img, table, div, p { max-width: 100% !important; height: auto !important; overflow-wrap: break-word !important; } table { display: block !important; overflow-x: auto !important; }</style>`;
  const heightScript = `<script>function sendHeight() { window.parent.postMessage({ type: 'iframeHeight', height: document.documentElement.scrollHeight || document.body.scrollHeight }, '*'); } window.onload = sendHeight; setTimeout(sendHeight, 1000); new ResizeObserver(sendHeight).observe(document.body);<\/script>`;
  return responsiveStyles + html + heightScript;
}

export function EmailReader({ email, text, html, onDelete, onReply, decrypted, attachmentHref }: EmailReaderProps) {
  const { t } = useTranslation();
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

  const canDownload = !!attachmentHref && attachments.length > 0;
  const hasMobileActions = !!(onReply || canDownload || onDelete);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-wr-base/20">
      {/* ── Reader header ── */}
      <div className="px-4 md:px-6 py-4 md:py-5 border-b border-wr-border bg-wr-surface shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3 md:mb-4">
          <h2 className="text-base md:text-xl font-bold text-current tracking-tight leading-snug break-words flex-1 min-w-0 font-mono">{email.subject}</h2>

          <div className="flex items-center gap-2 shrink-0">
            {/* Desktop-only: the mobile action bar at the bottom carries these */}
            {onReply && (
              <button
                onClick={onReply}
                className="hidden md:flex items-center gap-1.5 h-9 px-3 border border-wr-border rounded-sm text-[11px] font-bold uppercase tracking-[0.14em] text-wr-dim hover:text-wr-accent hover:border-wr-accent/50 transition-colors"
              >
                <CornerUpLeft size={13} /> {t('mail.reader_reply', 'Reply')}
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="hidden md:flex items-center gap-1.5 h-9 px-3 border border-wr-border rounded-sm text-[11px] font-bold uppercase tracking-[0.14em] text-wr-dim hover:text-wr-error hover:border-wr-error/50 transition-colors"
                title={t('mail.reader_delete', 'Delete message')}
              >
                <Trash2 size={13} /> {t('mail.reader_delete_short', 'Delete')}
              </button>
            )}
            {hasHtml && (
              <div className="flex border border-wr-border rounded-sm overflow-hidden shrink-0">
                <button
                  onClick={() => setViewMode('text')}
                  className={`flex items-center gap-1 px-2.5 md:px-3 min-h-[44px] md:min-h-[32px] text-[11px] uppercase font-bold tracking-[0.12em] transition-colors ${viewMode === 'text' ? 'bg-wr-accent text-black' : 'text-wr-dim hover:text-wr-accent'}`}
                >
                  <FileText size={11} /> TXT
                </button>
                <button
                  onClick={() => setViewMode('html')}
                  className={`flex items-center gap-1 px-2.5 md:px-3 min-h-[44px] md:min-h-[32px] text-[11px] uppercase font-bold tracking-[0.12em] border-l border-wr-border transition-colors ${viewMode === 'html' ? 'bg-wr-accent text-black' : 'text-wr-dim hover:text-wr-accent'}`}
                >
                  <FileCode size={11} /> HTML
                </button>
              </div>
            )}
          </div>
        </div>

        {/* FROM / RECEIVED mono grid */}
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[11px] md:text-xs font-mono">
          <span className="text-wr-dim uppercase tracking-[0.14em]">{t('mail.reader_from', 'From')}</span>
          <span className="text-current font-bold truncate">{email.from}</span>
          <span className="text-wr-dim uppercase tracking-[0.14em]">{t('mail.reader_received', 'Received')}</span>
          <span className="text-wr-dim">{new Date(email.receivedAt).toLocaleString()}</span>
          {email.isEncrypted && decrypted && (
            <>
              <span className="text-wr-dim uppercase tracking-[0.14em]">{t('mail.reader_security', 'Security')}</span>
              <span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs border border-wr-secondary/40 bg-wr-secondary/10 text-wr-secondary text-[11px] font-bold uppercase tracking-[0.14em]">
                  <Unlock size={10} /> {t('mail.reader_pgp_unlocked', 'PGP unlocked')}
                </span>
              </span>
            </>
          )}
        </div>

        {canDownload && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-wr-dim mr-0.5">
              <Paperclip size={11} /> {attachments.length === 1
                ? t('mail.reader_one_attachment', '1 attachment')
                : `${attachments.length} ${t('mail.reader_attachments', 'attachments')}`}
            </span>
            {attachments.length > 1 && (
              <button
                onClick={downloadAll}
                className="flex items-center gap-1.5 border border-wr-border hover:border-wr-accent/60 text-wr-accent rounded-sm px-2.5 min-h-8 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors"
              >
                <Download size={12} /> {t('mail.reader_download_all', 'Download all')} · {fmtBytes(totalBytes)}
              </button>
            )}
            {attachments.map((att) => {
              const badge = extBadge(att.filename, att.mimeType);
              return (
                <a
                  key={att.id}
                  href={attachmentHref!(att)}
                  download={att.filename}
                  className="flex items-center gap-2 max-w-full bg-wr-base border border-wr-border hover:border-wr-accent/60 rounded-sm pl-2 pr-3 py-2 transition-colors group"
                  title={`${att.filename} · ${fmtBytes(att.size)}`}
                >
                  <span className={`w-8 h-8 rounded-xs shrink-0 flex items-center justify-center font-mono text-[9px] font-bold ${badge.className}`}>{badge.label}</span>
                  <span className="flex flex-col leading-tight min-w-0">
                    <span className="truncate font-mono text-[11px] text-current">{att.filename}</span>
                    <span className="text-wr-dim/70 text-[10px]">{fmtBytes(att.size)}</span>
                  </span>
                  <Download size={12} className="shrink-0 text-wr-dim group-hover:text-wr-accent transition-colors" />
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 relative overflow-y-auto custom-scrollbar">
        {viewMode === 'text' || !currentHtml ? (
          <div className="p-4 md:p-8 font-mono text-xs md:text-sm leading-relaxed text-current/90 whitespace-pre-wrap break-words">{currentText}</div>
        ) : (
          <div className="w-full relative bg-white/95 rounded-xs p-1" style={{ height: isMobile ? `${iframeHeight}px` : '100%' }}>
            <iframe srcDoc={getProcessedHtml(currentHtml)} className="w-full h-full border-none" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" title="Email Content" />
          </div>
        )}
      </div>

      {/* ── Mobile action bar (Reply / Download / Delete) ── */}
      {hasMobileActions && <div className="md:hidden shrink-0 grid auto-cols-fr grid-flow-col border-t border-wr-border bg-wr-surface">
        {onReply && (
          <button onClick={onReply} className="min-h-[44px] flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-wr-dim active:text-wr-accent border-r border-wr-border/60">
            <CornerUpLeft size={14} /> {t('mail.reader_reply', 'Reply')}
          </button>
        )}
        {canDownload && (
          <button onClick={downloadAll} className="min-h-[44px] flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-wr-dim active:text-wr-accent border-r border-wr-border/60">
            <Download size={14} /> {t('mail.reader_download', 'Download')}
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className="min-h-[44px] flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-wr-error/90 active:text-wr-error">
            <Trash2 size={14} /> {t('mail.reader_delete_short', 'Delete')}
          </button>
        )}
      </div>}
    </div>
  );
}
