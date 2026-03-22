/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Copy, Clock, RefreshCw, Mail, FileCode, FileText, Trash2, AlertOctagon, Minimize2, Menu, Lock, Unlock, Shield, Maximize2 } from 'lucide-react';
import type { GhostMailSession, InboxResponse } from '../../hooks/useGhostMail';
import * as openpgp from 'openpgp';
import { toast } from 'react-hot-toast';

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
  const [viewMode, setViewMode] = useState<'text' | 'html'>('text');
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileList, setShowMobileList] = useState(false);
  const [showDesktopList, setShowDesktopList] = useState(true);
  const [iframeHeight, setIframeHeight] = useState(600);

  // Persistence
  const lastProcessedId = useRef<string | null>(null);
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

  // Listen for iframe height messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'iframeHeight') {
        setIframeHeight(event.data.height);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Set default view mode when switching emails
  useEffect(() => {
    if (selectedEmailId && inbox) {
      if (selectedEmailId !== lastProcessedId.current) {
        const email = inbox.emails.find(e => e.id === selectedEmailId);
        if (email) {
          const decrypted = decryptedEmails[email.id];
          if (decrypted?.html || email.html) {
             setViewMode('html');
          } else {
             setViewMode('text');
          }
          lastProcessedId.current = selectedEmailId;
        }
      }
      if (isMobile) setShowMobileList(false);
    }
  }, [selectedEmailId, inbox, isMobile, decryptedEmails]);

  const getProcessedHtml = (html: string) => {
    const responsiveStyles = `<meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body { margin: 0; padding: 15px; font-family: sans-serif; overflow-x: hidden !important; width: 100vw !important; box-sizing: border-box; background: white; color: #1a1a1a; } img, table, div, p { max-width: 100% !important; height: auto !important; overflow-wrap: break-word !important; } table { display: block !important; overflow-x: auto !important; }</style>`;
    const heightScript = `<script>function sendHeight() { window.parent.postMessage({ type: 'iframeHeight', height: document.documentElement.scrollHeight || document.body.scrollHeight }, '*'); } window.onload = sendHeight; setTimeout(sendHeight, 1000); new ResizeObserver(sendHeight).observe(document.body);</script>`;
    return responsiveStyles + html + heightScript;
  };

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
    <div className={`border border-wr-border bg-wr-surface flex flex-col animate-in fade-in duration-500 shadow-2xl backdrop-blur-sm transition-all
      ${isFullscreen ? 'fixed inset-0 z-[60] border-none rounded-none' : 'min-h-[500px] h-[calc(100dvh-140px)] md:h-[75vh] rounded-sm overflow-hidden'}
      ${isMobile && !isFullscreen ? 'h-auto overflow-y-visible' : ''}
    `}>

      {/* --- Top Bar --- */}
      <div className={`border-b border-wr-border p-2 md:p-3 flex justify-between items-center bg-wr-base/90 backdrop-blur-md shrink-0 z-30 ${isMobile ? 'sticky top-0 shadow-lg' : ''}`}>
        <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
          {isMobile ? (
            <button onClick={() => setShowMobileList(!showMobileList)} className="p-2 text-wr-green hover:bg-wr-green/10 rounded-sm transition-colors"><Menu size={18} /></button>
          ) : (
            <button onClick={() => setShowDesktopList(!showDesktopList)} className={`p-2 hover:bg-wr-green/10 rounded-sm transition-colors ${showDesktopList ? 'text-wr-green' : 'text-wr-dim'}`}><Menu size={18} /></button>
          )}

          <div className="hidden sm:block border-l border-wr-border/30 h-6 mx-1"></div>

          <button
            onClick={onPgpClick}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border transition-all text-[9px] md:text-[10px] font-black uppercase tracking-widest
              ${pgpEnabled ? 'border-wr-green text-wr-green bg-wr-green/5' : 'border-wr-border text-wr-dim hover:border-wr-green hover:text-wr-green'}
            `}
          >
            <Shield size={12} />
            {pgpEnabled ? 'PGP ACTIVE' : 'ENCRYPT INBOX'}
          </button>

          <div className="hidden lg:flex flex-col text-left overflow-hidden ml-2">
            <div className="flex items-center gap-1 md:gap-2 group cursor-pointer" onClick={() => copyToClipboard(session?.email || '')}>
              <span className="text-wr-green text-[10px] md:text-xs font-mono tracking-wider truncate group-hover:underline">{session?.email}</span>
              <Copy size={10} className="text-wr-dim group-hover:text-wr-green transition-colors shrink-0" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <div className="flex items-center gap-1.5 md:gap-3 bg-wr-surface/50 border border-wr-border px-1.5 md:px-3 py-1 md:py-1.5 rounded-sm">
            <span className="text-wr-error font-mono font-bold text-[10px] md:text-sm leading-none">{timeLeft}</span>
            <Clock className="w-2.5 h-2.5 md:w-4 md:h-4 text-wr-error animate-pulse" />
          </div>
          <div className="h-6 md:h-8 w-px bg-wr-border/30"></div>
          {!isMobile && (
            <>
              <button onClick={onExtendClick} className="text-[10px] font-bold bg-wr-green/10 hover:bg-wr-green/20 text-wr-green px-3 py-1.5 rounded-sm border border-wr-green/30 transition-all uppercase tracking-wider">EXTEND</button>
              <button onClick={handleBurn} className="text-[10px] font-bold text-wr-dim hover:text-wr-error px-2 transition-colors uppercase tracking-wider flex items-center gap-1"><AlertOctagon size={10} />DESTROY</button>
            </>
          )}
          {toggleFullscreen && (
             <button onClick={toggleFullscreen} className="p-2 text-wr-dim hover:text-wr-green transition-colors ml-1" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
             </button>
          )}
        </div>
      </div>

      <div className={`flex-1 flex ${isMobile ? 'overflow-visible' : 'overflow-hidden'} relative`}>
        {/* --- Sidebar --- */}
        <div className={`${isMobile ? `fixed inset-y-0 left-0 z-40 w-[280px] transform transition-transform duration-300 shadow-2xl ${showMobileList ? 'translate-x-0' : '-translate-x-full'}` : `relative transition-all duration-300 ease-in-out border-r border-wr-border ${showDesktopList ? 'w-1/4 min-w-[240px] opacity-100' : 'w-0 opacity-0 border-none overflow-hidden'}`} bg-wr-base flex flex-col`}>
          <div className="p-3 border-b border-wr-border/50 bg-wr-surface flex justify-between items-center text-xs text-wr-dim font-mono tracking-wider shrink-0 sticky top-0 z-10">
            <span>INBOX [{inbox?.emails.length || 0}]</span>
            {loading && <RefreshCw size={12} className="animate-spin text-wr-green" />}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
            {!inbox?.emails.length && !loading && <div className="h-full flex flex-col items-center justify-center text-wr-dim opacity-40 py-20 text-center uppercase tracking-widest text-[10px]">MONITORING FOR INCOMING TRANSMISSIONS...</div>}
            {inbox?.emails.map(email => {
              const isSelected = selectedEmailId === email.id;
              const isUnread = readIds && !readIds.has(email.id);
              const isEncrypted = email.isEncrypted;
              const isDecrypted = !!decryptedEmails[email.id];
              return (
                <div key={email.id} onClick={() => setSelectedEmailId(email.id)} className={`group p-4 md:p-3 cursor-pointer transition-all duration-200 border-l-2 relative overflow-hidden rounded-xs ${isSelected ? 'bg-wr-green/10 border-l-wr-green' : 'bg-wr-surface border-l-transparent hover:bg-wr-green/5'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2 truncate max-w-[70%]">
                      {isUnread && <div className="w-1.5 h-1.5 rounded-full bg-wr-green animate-pulse shrink-0"></div>}
                      <span className={`text-sm md:text-xs font-bold truncate ${isSelected ? 'text-wr-green' : isUnread ? 'text-wr-green brightness-125' : 'text-wr-dim'}`}>{email.fromName || email.from.split('@')[0]}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-wr-dim/60 font-mono">{isEncrypted && (isDecrypted ? <Unlock size={8} className="text-wr-green" /> : <Lock size={8} />)}{timeAgo(email.receivedAt)}</div>
                  </div>
                  <div className={`text-xs truncate font-mono ${isSelected ? 'text-wr-green font-bold' : isUnread ? 'text-wr-green/80' : 'text-wr-dim opacity-80'}`}>{email.subject}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* --- Main Content --- */}
        <div className={`flex-1 bg-wr-base/20 relative flex flex-col text-left min-w-0 ${isMobile ? 'min-h-screen' : 'h-full'}`}>
          {selectedEmailId ? (
            (() => {
              const email = inbox?.emails.find(e => e.id === selectedEmailId);
              if (!email) return null;
              const decrypted = decryptedEmails[email.id];
              const currentText = decrypted?.text || email.text;
              const currentHtml = decrypted?.html || email.html;
              const hasHtml = !!currentHtml;
              const needsDecryption = email.isEncrypted && !decrypted;
              return (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="p-4 md:p-6 border-b border-wr-border bg-wr-surface backdrop-blur-sm shrink-0 z-20">
                    <div className="flex items-start justify-between mb-4 gap-4">
                      <h2 className="text-lg md:text-xl font-bold text-wr-green tracking-wide leading-tight font-mono break-words flex-1 min-w-0">{email.subject}</h2>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleDeleteMail(email.id)} className="p-2 text-wr-dim hover:text-wr-error transition-colors rounded-sm hover:bg-wr-error/10" title="Delete Message"><Trash2 size={16} /></button>
                        {hasHtml && !needsDecryption && (
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
                      {email.isEncrypted && <><span className="text-wr-accent uppercase">SECURITY</span><span className="text-wr-accent flex items-center gap-1">{decrypted ? <Unlock size={10} /> : <Lock size={10} />} {decrypted ? 'DECRYPTED' : 'PGP ENCRYPTED'}</span></>}
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 bg-wr-surface/30 relative overflow-y-auto custom-scrollbar">
                    {needsDecryption ? (
                      <div className="p-6 md:p-12 flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center space-y-6">
                        {isDecrypting ? <RefreshCw size={40} className="text-wr-green animate-spin" /> : <Lock size={40} className="text-wr-accent animate-pulse" />}
                        <div className="space-y-2">
                           <h3 className="text-sm font-black uppercase text-wr-accent tracking-widest">{isDecrypting ? 'DECRYPTING TRANSMISSION...' : 'ENCRYPTED CONTENT'}</h3>
                           <p className="text-[10px] text-wr-dim uppercase leading-relaxed">Enter your PGP private key to decrypt this message</p>
                        </div>
                        {!isDecrypting && (
                          <div className="w-full space-y-3">
                            <textarea value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="Paste PGP private key here..." className="w-full h-32 bg-wr-surface border border-wr-border rounded-sm p-3 text-[10px] font-mono text-wr-green focus:border-wr-green outline-none resize-none shadow-inner" />
                            <button onClick={() => handleDecrypt(email.id, email.text, email.html)} disabled={isDecrypting || !privateKey} className="w-full py-4 bg-wr-green text-wr-base font-black uppercase text-xs rounded-sm hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-wr-green/20">DECRYPT MESSAGE</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      viewMode === 'text' || !currentHtml ? (
                        <div className="p-4 md:p-8 font-mono text-xs md:text-sm leading-relaxed text-wr-dim/90 whitespace-pre-wrap break-words">{currentText}</div>
                      ) : (
                        <div className="w-full relative bg-white/95 rounded-xs p-1" style={{ height: isMobile ? `${iframeHeight}px` : '100%' }}>
                           <iframe srcDoc={getProcessedHtml(currentHtml || '')} className="w-full h-full border-none" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" title="Email Content" />
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-wr-dim/20 space-y-4 text-center p-6 min-h-[400px]"><Mail size={48} /><div className="text-xs font-mono tracking-widest uppercase">SELECT A TRANSMISSION TO DECRYPT</div></div>
          )}
        </div>
      </div>
    </div>
  );
}
