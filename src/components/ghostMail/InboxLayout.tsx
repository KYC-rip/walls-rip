/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { Copy, Clock, RefreshCw, Mail, Trash2, AlertOctagon, Minimize2, Menu, Lock, Unlock, Shield, Maximize2, Download, CalendarClock } from 'lucide-react';
import type { GhostMailSession, InboxResponse } from '../../hooks/useGhostMail';
import * as openpgp from 'openpgp';
import { toast } from 'react-hot-toast';
import { SessionTransferModal } from './SessionTransfer';
import { EmailReader } from './EmailReader';

interface InboxLayoutProps {
  session: GhostMailSession;
  inbox: InboxResponse | null;
  loading: boolean;
  timeLeft: string;
  selectedEmailId: string | null;
  setSelectedEmailId: (id: string | null) => void;
  readIds?: Set<string>;
  copyToClipboard: (text: string) => void;
  burnSession: () => void;
  onDeleteEmail: (id: string) => void;
  onExtendClick: () => void;
  isFullscreen?: boolean;
  toggleFullscreen?: () => void;
  pgpEnabled?: boolean;
  onPgpClick?: () => void;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return '1d ago';
}

export function InboxLayout({
  session,
  inbox,
  loading,
  timeLeft,
  selectedEmailId,
  setSelectedEmailId,
  readIds,
  copyToClipboard,
  burnSession,
  onDeleteEmail,
  onExtendClick,
  isFullscreen,
  toggleFullscreen,
  pgpEnabled,
  onPgpClick
}: InboxLayoutProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileList, setShowMobileList] = useState(false);
  const [showDesktopList, setShowDesktopList] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);

  // Persistence
  const [privateKey, setPrivateKey] = useState(() => sessionStorage.getItem(`pgp_key_${session.email}`) || '');
  const [decryptedEmails, setDecryptedEmails] = useState<Record<string, { text: string, html?: string }>>({});
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Check for mobile screen size
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close the mobile list when an email is opened
  useEffect(() => {
    if (selectedEmailId && isMobile) setShowMobileList(false);
  }, [selectedEmailId, isMobile]);

  const handleBurn = () => {
    if (window.confirm('PERMANENTLY DESTROY THIS INBOX? This cannot be undone.')) {
      burnSession();
    }
  };

  const handleDeleteMail = (id: string) => {
    if (window.confirm('Delete this message?')) {
      onDeleteEmail(id);
      setSelectedEmailId(null);
    }
  };

  const handleDecrypt = useCallback(async (emailId: string, encryptedText: string, encryptedHtml?: string, silent = false) => {
    if (!privateKey) return;
    if (!silent) setIsDecrypting(true);
    try {
      const privKeyObj = await openpgp.readPrivateKey({ armoredKey: privateKey });
      const decrypt = async (armored: string) => {
        const message = await openpgp.readMessage({ armoredMessage: armored });
        const { data: decrypted } = await openpgp.decrypt({ message, decryptionKeys: privKeyObj });
        return decrypted as string;
      };
      const [text, html] = await Promise.all([
        decrypt(encryptedText),
        encryptedHtml ? decrypt(encryptedHtml) : Promise.resolve(undefined)
      ]);

      setDecryptedEmails(prev => ({ ...prev, [emailId]: { text, html } }));
      sessionStorage.setItem(`pgp_key_${session.email}`, privateKey);
      if (!silent) toast.success('Message decrypted');
    } catch (e: any) {
      console.error(e);
      if (!silent) toast.error('Decryption failed');
    } finally {
      if (!silent) setIsDecrypting(false);
    }
  }, [privateKey, session.email]);

  // Auto-decryption logic
  useEffect(() => {
    if (selectedEmailId && privateKey && !decryptedEmails[selectedEmailId]) {
      const email = inbox?.emails.find(e => e.id === selectedEmailId);
      if (email?.isEncrypted) {
        handleDecrypt(email.id, email.text, email.html, true);
      }
    }
  }, [selectedEmailId, inbox, privateKey, decryptedEmails, handleDecrypt]);

  return (
    <div className={`border border-wr-border bg-wr-surface flex flex-col animate-in fade-in duration-300 transition-all
      ${isFullscreen ? 'fixed inset-0 z-[60] border-none rounded-none' : 'min-h-[500px] h-[calc(100dvh-140px)] md:h-[75vh] rounded-sm overflow-hidden'}
      ${isMobile && !isFullscreen ? 'h-auto overflow-y-visible' : ''}
    `}>

      {/* --- Top Bar --- */}
      <div className={`border-b border-wr-border bg-wr-base/90 backdrop-blur-md shrink-0 z-30 ${isMobile ? 'sticky top-0' : ''}`}>
        <div className="px-2 md:px-3 py-2 flex justify-between items-center gap-2">
          <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
            {isMobile ? (
              <button onClick={() => setShowMobileList(!showMobileList)} className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:p-2 flex items-center justify-center text-wr-dim hover:text-wr-accent rounded-sm transition-colors"><Menu size={18} /></button>
            ) : (
              <button onClick={() => setShowDesktopList(!showDesktopList)} className={`p-2 hover:bg-wr-accent/10 rounded-sm transition-colors ${showDesktopList ? 'text-wr-accent' : 'text-wr-dim'}`} title="Toggle inbox list"><Menu size={18} /></button>
            )}

            <div className="hidden md:block border-l border-wr-border h-6 mx-1" />

            {onPgpClick && (
              <button
                onClick={onPgpClick}
                className={`hidden md:flex items-center gap-2 px-3 h-8 rounded-sm border transition-all text-[11px] font-bold uppercase tracking-[0.14em] shrink-0
                  ${pgpEnabled ? 'border-wr-secondary/50 text-wr-secondary bg-wr-secondary/10' : 'border-wr-border text-wr-dim hover:border-wr-secondary/50 hover:text-wr-secondary'}
                `}
                title={pgpEnabled ? 'PGP Active' : 'Encrypt Inbox'}
              >
                <Shield size={12} />
                <span>{pgpEnabled ? 'PGP ACTIVE' : 'ENCRYPT INBOX'}</span>
              </button>
            )}

            <button
              onClick={() => copyToClipboard(session?.email || '')}
              className="flex items-center gap-1.5 md:gap-2 min-w-0 px-1 group"
              title="Copy address"
            >
              <span className="text-wr-accent text-[11px] md:text-xs font-mono tracking-wider truncate group-hover:underline max-w-[140px] sm:max-w-[220px] md:max-w-none">{session?.email}</span>
              <Copy size={11} className="text-wr-dim group-hover:text-wr-accent transition-colors shrink-0" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
            <div className="flex items-center gap-1.5 border border-wr-warning/30 bg-wr-warning/5 px-2 md:px-3 h-8 rounded-sm" title="Time until this inbox self-destructs">
              <span className="text-wr-warning font-mono font-bold text-[11px] md:text-xs leading-none tabular-nums">{timeLeft}</span>
              <Clock className="w-3 h-3 md:w-3.5 md:h-3.5 text-wr-warning" />
            </div>
            <div className="hidden md:block h-6 w-px bg-wr-border" />
            <button onClick={onExtendClick} className="hidden md:flex items-center h-8 px-3 text-[11px] font-bold text-wr-accent border border-wr-accent/40 hover:bg-wr-accent/10 rounded-sm transition-all uppercase tracking-[0.14em]">EXTEND</button>
            <button onClick={() => setShowExportModal(true)} className="hidden md:flex items-center gap-1.5 h-8 px-2.5 text-[11px] font-bold text-wr-dim hover:text-wr-accent transition-colors uppercase tracking-[0.14em]" title="Export session to use on another device"><Download size={12} />EXPORT</button>
            <button onClick={handleBurn} className="hidden md:flex items-center gap-1.5 h-8 px-2.5 text-[11px] font-bold text-wr-dim hover:text-wr-error transition-colors uppercase tracking-[0.14em]"><AlertOctagon size={12} />DESTROY</button>
            {toggleFullscreen && (
              <button onClick={toggleFullscreen} className="p-2 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center text-wr-dim hover:text-wr-accent transition-colors" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile action row — keeps the top bar free of horizontal scroll */}
        <div className="md:hidden grid grid-cols-4 border-t border-wr-border/60">
          <button onClick={onPgpClick} className={`min-h-[44px] flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] border-r border-wr-border/60 ${pgpEnabled ? 'text-wr-secondary' : 'text-wr-dim'}`}>
            <Shield size={13} /> PGP
          </button>
          <button onClick={onExtendClick} className="min-h-[44px] flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-wr-accent border-r border-wr-border/60">
            <CalendarClock size={13} /> EXTEND
          </button>
          <button onClick={() => setShowExportModal(true)} className="min-h-[44px] flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-wr-dim border-r border-wr-border/60">
            <Download size={13} /> EXPORT
          </button>
          <button onClick={handleBurn} className="min-h-[44px] flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-wr-error/90">
            <AlertOctagon size={13} /> DESTROY
          </button>
        </div>
      </div>

      <div className={`flex-1 flex ${isMobile ? 'overflow-visible' : 'overflow-hidden'} relative min-h-0`}>
        {/* Mobile drawer backdrop */}
        {isMobile && showMobileList && (
          <div onClick={() => setShowMobileList(false)} className="fixed inset-0 z-30 bg-black/60 md:hidden" />
        )}

        {/* --- Sidebar / list pane --- */}
        <div className={`${isMobile ? `fixed inset-y-0 left-0 z-40 w-[300px] transform transition-transform duration-300 shadow-2xl ${showMobileList ? 'translate-x-0' : '-translate-x-full'}` : `relative transition-all duration-300 ease-in-out border-r border-wr-border ${showDesktopList ? 'w-1/4 min-w-[250px] opacity-100' : 'w-0 opacity-0 border-none overflow-hidden'}`} bg-wr-base flex flex-col`}>
          <div className="px-3 py-2.5 border-b border-wr-border flex justify-between items-center shrink-0 bg-wr-surface">
            <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim">INBOX <span className="text-wr-accent">[{inbox?.emails.length || 0}]</span></span>
            <div className="flex items-center gap-2">
              {loading && <RefreshCw size={12} className="animate-spin text-wr-accent" />}
              {isMobile && (
                <button onClick={() => setShowMobileList(false)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-wr-dim hover:text-wr-accent" title="Close list">×</button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
            {!inbox?.emails.length && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 py-16 gap-3">
                <Mail size={26} className="text-wr-dim/40" />
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-wr-dim">NO MESSAGES YET</div>
                <div className="text-[11px] font-mono text-wr-dim/60 leading-relaxed">Incoming mail appears here automatically.</div>
              </div>
            )}
            {inbox?.emails.map(email => {
              const isSelected = selectedEmailId === email.id;
              const isUnread = readIds && !readIds.has(email.id);
              const isEncrypted = email.isEncrypted;
              const isDecrypted = !!decryptedEmails[email.id];
              return (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmailId(email.id)}
                  className={`group px-3 py-3 cursor-pointer transition-colors border-l-2 ${isSelected ? 'bg-wr-accent/10 border-l-wr-accent' : 'border-l-transparent hover:bg-wr-accent/5'}`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-wr-accent shrink-0" />}
                      <span className={`text-xs font-bold truncate ${isSelected ? 'text-wr-accent' : isUnread ? 'text-current' : 'text-wr-dim'}`}>{email.fromName || email.from.split('@')[0]}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-wr-dim/70 font-mono shrink-0">
                      {isEncrypted && (isDecrypted ? <Unlock size={9} className="text-wr-secondary" /> : <Lock size={9} />)}
                      {timeAgo(email.receivedAt)}
                    </div>
                  </div>
                  <div className={`text-[11px] truncate font-mono ${isSelected ? 'text-wr-accent/90' : 'text-wr-dim'}`}>{email.subject}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* --- Reader pane --- */}
        <div className={`flex-1 bg-wr-base/20 relative flex flex-col text-left min-w-0 ${isMobile ? 'min-h-[70vh]' : 'h-full'}`}>
          {selectedEmailId ? (
            (() => {
              const email = inbox?.emails.find(e => e.id === selectedEmailId);
              if (!email) return null;
              const decrypted = decryptedEmails[email.id];
              const needsDecryption = email.isEncrypted && !decrypted;
              if (needsDecryption) {
                return (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 md:px-6 py-4 border-b border-wr-border bg-wr-surface shrink-0 z-20">
                      <div className="flex items-start justify-between mb-3 gap-4">
                        <h2 className="text-base md:text-xl font-bold text-current tracking-tight leading-snug font-mono break-words flex-1 min-w-0">{email.subject}</h2>
                        <button onClick={() => handleDeleteMail(email.id)} className="hidden md:flex items-center gap-1.5 h-9 px-3 border border-wr-border rounded-sm text-[11px] font-bold uppercase tracking-[0.14em] text-wr-dim hover:text-wr-error hover:border-wr-error/50 transition-colors shrink-0" title="Delete Message"><Trash2 size={13} /> DELETE</button>
                      </div>
                      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[11px] font-mono">
                        <span className="text-wr-dim uppercase tracking-[0.14em]">FROM</span><span className="text-current font-bold truncate">{email.from}</span>
                        <span className="text-wr-dim uppercase tracking-[0.14em]">RECEIVED</span><span className="text-wr-dim">{new Date(email.receivedAt).toLocaleString()}</span>
                        <span className="text-wr-dim uppercase tracking-[0.14em]">SECURITY</span>
                        <span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs border border-wr-secondary/40 bg-wr-secondary/10 text-wr-secondary text-[11px] font-bold uppercase tracking-[0.14em]"><Lock size={10} /> PGP LOCKED</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 bg-wr-surface/30 relative overflow-y-auto custom-scrollbar">
                      <div className="p-6 md:p-12 flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center space-y-6">
                        {isDecrypting ? <RefreshCw size={36} className="text-wr-secondary animate-spin" /> : <Lock size={36} className="text-wr-secondary" />}
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-bold uppercase text-wr-secondary tracking-[0.18em]">{isDecrypting ? 'DECRYPTING…' : 'ENCRYPTED CONTENT'}</h3>
                          <p className="text-[11px] text-wr-dim leading-relaxed">Enter your PGP private key to decrypt this message.</p>
                        </div>
                        {!isDecrypting && (
                          <div className="w-full space-y-3">
                            <textarea value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="Paste PGP private key here..." className="w-full h-32 bg-wr-base border border-wr-border rounded-sm p-3 text-[11px] font-mono text-current focus:border-wr-secondary outline-none resize-none" />
                            <button onClick={() => handleDecrypt(email.id, email.text, email.html)} disabled={isDecrypting || !privateKey} className="w-full min-h-[44px] py-3 bg-wr-accent text-black font-bold uppercase text-[11px] tracking-[0.18em] rounded-sm hover:brightness-110 transition-all disabled:opacity-40">DECRYPT MESSAGE</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <EmailReader
                  email={email}
                  text={decrypted?.text || email.text}
                  html={decrypted?.html || email.html}
                  decrypted={!!decrypted}
                  onDelete={() => handleDeleteMail(email.id)}
                />
              );
            })()
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-wr-dim/50 space-y-3 text-center p-6 min-h-[320px]">
              <Mail size={36} className="text-wr-dim/30" />
              <div className="text-[11px] font-bold uppercase tracking-[0.18em]">NO MESSAGE SELECTED</div>
              <div className="text-[11px] font-mono text-wr-dim/60">Pick a transmission from the list.</div>
            </div>
          )}
        </div>
      </div>
      {showExportModal && (
        <SessionTransferModal mode="export" session={session} onClose={() => setShowExportModal(false)} />
      )}
    </div>
  );
}
