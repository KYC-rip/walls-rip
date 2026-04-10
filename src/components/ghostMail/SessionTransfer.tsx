/**
 * SessionTransferModal — Export / Import Ghost Mail session across devices
 *
 * The session is stored in localStorage as JSON: { email, token }
 * This modal lets users copy the JSON out or paste one in.
 */
import { useState } from 'react';
import { X, Copy, Check, Download, Upload, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { GhostMailSession } from '../../hooks/useGhostMail';

interface SessionTransferModalProps {
  mode: 'export' | 'import';
  session?: GhostMailSession | null;
  onClose: () => void;
  onImport?: (session: GhostMailSession) => void;
}

export function SessionTransferModal({ mode, session, onClose, onImport }: SessionTransferModalProps) {
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const exportJson = session ? JSON.stringify(session) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      toast.success('SESSION KEY COPIED');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('COPY FAILED');
    }
  };

  const handleImport = () => {
    setImportError(null);
    const trimmed = importText.trim();
    if (!trimmed) {
      setImportError('Paste your session key to continue');
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed.email || !parsed.token || typeof parsed.email !== 'string' || typeof parsed.token !== 'string') {
        setImportError('Invalid session key format — missing email or token');
        return;
      }
      onImport?.({ email: parsed.email, token: parsed.token });
      toast.success('SESSION RESTORED');
      onClose();
    } catch {
      setImportError('Not valid JSON — make sure you copied the full session key');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-wr-base border border-wr-border rounded-sm max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-wr-border">
          <div className="flex items-center gap-2">
            {mode === 'export' ? (
              <Download size={16} className="text-wr-green" />
            ) : (
              <Upload size={16} className="text-wr-green" />
            )}
            <h3 className="text-sm font-bold text-wr-green uppercase tracking-wider">
              {mode === 'export' ? 'Export Session' : 'Import Session'}
            </h3>
          </div>
          <button onClick={onClose} className="text-wr-dim hover:text-wr-green transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {mode === 'export' ? (
            <>
              <p className="text-xs text-wr-dim leading-relaxed">
                Copy this session key and paste it on another device to access the same inbox.
                Anyone with this key can read your mail — treat it like a password.
              </p>
              <div className="bg-wr-surface border border-wr-border rounded-sm p-3">
                <textarea
                  readOnly
                  value={exportJson}
                  className="w-full bg-transparent text-wr-green text-[10px] font-mono resize-none outline-none break-all"
                  rows={3}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
              </div>
              <button
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 bg-wr-green/10 hover:bg-wr-green/20 border border-wr-green/30 text-wr-green px-4 py-2.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy Session Key'}
              </button>
              <div className="flex items-start gap-2 bg-wr-error/5 border border-wr-error/20 rounded-sm p-3">
                <AlertTriangle size={14} className="text-wr-error shrink-0 mt-0.5" />
                <p className="text-[10px] text-wr-error leading-relaxed">
                  Never share this key publicly. Anyone with it has full access to your inbox until it expires.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-wr-dim leading-relaxed">
                Paste a session key from another device to access its inbox here.
              </p>
              <textarea
                value={importText}
                onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
                placeholder='{"email":"...","token":"..."}'
                className="w-full bg-wr-surface border border-wr-border text-wr-green text-[10px] font-mono p-3 rounded-sm resize-none outline-none focus:border-wr-green/50"
                rows={4}
              />
              {importError && (
                <div className="flex items-start gap-2 text-wr-error text-[10px]">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}
              <button
                onClick={handleImport}
                disabled={!importText.trim()}
                className="w-full flex items-center justify-center gap-2 bg-wr-green/10 hover:bg-wr-green/20 disabled:opacity-40 disabled:cursor-not-allowed border border-wr-green/30 text-wr-green px-4 py-2.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all"
              >
                <Upload size={14} />
                Restore Session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
