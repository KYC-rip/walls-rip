/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ContactList } from './ContactList';
import { ChatWindow } from './ChatWindow';
import { PGP } from '../../utils/pgp';
import { useGhostWire } from '../../hooks/useGhostWire';
import type { KeyPair, Contact } from './types';

import { RefreshCw, Key, Shield, ArrowLeft, Wifi, WifiOff, Lock, FileDown, AlertTriangle, LogOut, Trash2 } from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

export const GhostLayout = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Global State
  const [identity, setIdentity] = useState<KeyPair | null>(() => {
    const savedId = sessionStorage.getItem('ghost_identity');
    return savedId ? JSON.parse(savedId) : null;
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<'generate' | 'import'>('generate');
  const [importKey, setImportKey] = useState('');
  const [importPass, setImportPass] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [showNukeModal, setShowNukeModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const savedId = sessionStorage.getItem('ghost_identity');
    if (savedId) setIdentity(JSON.parse(savedId));
    const savedContacts = localStorage.getItem('ghost_contacts');
    if (savedContacts) setContacts(JSON.parse(savedContacts));
  }, []);

  const handleRenameIdentity = (newName: string) => {
    if (!newName.trim()) return;
    
    const updatedIdentity = { ...identity!, name: newName.trim() };
    setIdentity(updatedIdentity);
    localStorage.setItem('ghost_identity', JSON.stringify(updatedIdentity));
    
    toast.success(t('system.identityUpdated'));
  };

  const executeNuke = (wipeContacts: boolean) => {
    sessionStorage.removeItem('ghost_identity');

    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('ghost_msgs_')) {
        sessionStorage.removeItem(key);
      }
    });

    if (wipeContacts) {
      localStorage.removeItem('ghost_contacts');
      setContacts([]);
    }

    setIdentity(null);
    setActivePartnerId(null);
    setShowNukeModal(false);
  };

  const handleNewContactRequest = (contact: Contact) => {
    const exists = contacts.find(c => c.fingerprint === contact.fingerprint);

    if (!exists) {
      const newContacts = [...contacts, contact];
      setContacts(newContacts);
      localStorage.setItem('ghost_contacts', JSON.stringify(newContacts));
    } else {
      exists.name = contact.name || exists.name;
      exists.nostrTopic = contact.nostrTopic || exists.nostrTopic;
      setContacts(contacts);
      localStorage.setItem('ghost_contacts', JSON.stringify(contacts));
    }
  };

  const handleImport = async () => {
    if (!importKey.trim()) return;
    setIsGenerating(true);
    setImportError(null);

    try {
      await new Promise(r => setTimeout(r, 500));
      const keyPair = await PGP.importIdentity(importKey, importPass);
      const defaultName = `USER-${keyPair.fingerprint.substring(0, 4)}`;
      
      setIdentity({ ...keyPair, name: defaultName });
      sessionStorage.setItem('ghost_identity', JSON.stringify({ ...keyPair, name: defaultName }));  
      setImportKey('');
      setImportPass('');
    } catch (e: any) {
      if (e.message === 'PASSPHRASE_REQUIRED') {
        setImportError('Key is encrypted. Please enter passphrase.');
      } else if (e.message === 'WRONG_PASSPHRASE') {
        setImportError('Incorrect passphrase.');
      } else {
        setImportError('Invalid Private Key block.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 800));
    const keyPair = await PGP.generateIdentity();
    const defaultName = `USER-${keyPair.fingerprint.substring(0, 4)}`;
    setIdentity({ ...keyPair, name: defaultName });
    sessionStorage.setItem('ghost_identity', JSON.stringify({ ...keyPair, name: defaultName }));
    setIsGenerating(false);
  };

  const addContact = async (publicKey: string, name?: string, topic?: string) => {
    try {
      const fingerprint = await PGP.getFingerprintFromKey(publicKey);
      const defaultName = `USER-${fingerprint.substring(0, 4)}`;

      // Check if it already exists
      const existingIndex = contacts.findIndex(c => c.fingerprint === fingerprint);

      if (existingIndex === -1) {
        // === Scenario A: Create a new contact ===
        const newContact: Contact = {
          fingerprint,
          name: name || defaultName,
          publicKey,
          addedAt: Date.now(),
          nostrTopic: topic
        };

        const updated = [...contacts, newContact];
        setContacts(updated);
        localStorage.setItem('ghost_contacts', JSON.stringify(updated));

        // Automatically select and notify
        setActivePartnerId(newContact.fingerprint);
        toast.success(t('system.secureUplinkEstablished'));

      } else {
        // === Scenario B: Update an existing contact (e.g., re-scan QR code to sync channel) ===
        const existing = contacts[existingIndex];

        // If a new topic is provided and it is different from the old one, update it
        if (topic && topic !== existing.nostrTopic) {
          const updated = [...contacts];
          updated[existingIndex] = {
            ...existing,
            nostrTopic: topic
          };
          setContacts(updated);
          localStorage.setItem('ghost_contacts', JSON.stringify(updated));
          toast.success(t('system.frequencySynced'));
        } else {
          toast(t('system.contactAlreadyExists'));
        }

        setActivePartnerId(existing.fingerprint);
      }
    } catch (e) {
      console.error(e);
      toast.error(t('system.invalidPgpBlock'));
    }
  };

  const deleteContact = (fp: string) => {
    if (!confirm(t('alerts.deleteConfirm'))) return;
    const updated = contacts.filter(c => c.fingerprint !== fp);
    setContacts(updated);
    localStorage.setItem('ghost_contacts', JSON.stringify(updated));
    if (activePartnerId === fp) setActivePartnerId(null);
  };

  const updateContactName = (fp: string, newName: string) => {
    const updated = contacts.map(c => c.fingerprint === fp ? { ...c, name: newName } : c);
    setContacts(updated);
    localStorage.setItem('ghost_contacts', JSON.stringify(updated));
  };

  const activePartner = contacts.find(c => c.fingerprint === activePartnerId) || null;

  const [relayStatus, setRelayStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  const wire = useGhostWire({
    identity: identity!,
    partner: activePartner,
    onNewContactRequest: handleNewContactRequest,
    onUpdatePartnerName: updateContactName
  });

  if (!identity) {
    return (
      <div className="flex flex-col h-[100dvh] bg-xmr-base">
        <header className="h-12 border-b border-xmr-border bg-xmr-surface/50 flex items-center justify-between px-4 shrink-0">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-xmr-dim hover:text-xmr-green transition-colors text-xs font-mono group cursor-pointer">
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
            WALLS.RIP <span className="text-xmr-border">//</span> {t('system.comms')}
          </button>
          <div className="flex items-center gap-2 text-[10px] font-mono text-xmr-dim">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            OFFLINE
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="max-w-md w-full border border-xmr-border bg-xmr-surface p-6 rounded-sm relative overflow-hidden shadow-2xl flex flex-col">

            <div className="absolute top-0 left-0 w-full h-1 bg-xmr-green animate-pulse" />

            {/* Logo & Title */}
            <div className="text-center mb-6">
              <Shield className="w-16 h-16 text-xmr-green mx-auto mb-4" />
              <h2 className="text-2xl font-mono text-xmr-green mb-2 tracking-tighter">{t('system.comms')}</h2>
              <p className="text-xmr-dim text-xs font-mono">
                Zero Knowledge PGP Messaging
              </p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-xmr-border mb-6">
              <button
                onClick={() => setMode('generate')}
                className={`flex-1 pb-2 text-xs font-mono transition-all border-b-2 cursor-pointer ${mode === 'generate' ? 'text-xmr-green border-xmr-green' : 'text-xmr-dim border-transparent hover:text-xmr-green'}`}
              >
                NEW SESSION
              </button>
              <button
                onClick={() => setMode('import')}
                className={`flex-1 pb-2 text-xs font-mono transition-all border-b-2 cursor-pointer ${mode === 'import' ? 'text-xmr-green border-xmr-green' : 'text-xmr-dim border-transparent hover:text-xmr-green'}`}
              >
                IMPORT KEY
              </button>
            </div>

            {/* Content Area */}
            <div className="min-h-[180px] flex flex-col justify-center">
              {mode === 'generate' ? (
                <div className="animate-in fade-in zoom-in duration-300 text-center">
                  <p className="text-xmr-dim text-xs mb-6 font-mono leading-relaxed px-4">
                    Generate a temporary ECC identity.<br />
                    Keys exist in memory only.<br />
                    Logout to destroy.
                  </p>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="w-full py-4 bg-xmr-green text-xmr-base font-bold font-mono text-lg flex items-center justify-center gap-3 hover:brightness-110 transition-all rounded-sm cursor-pointer"
                  >
                    {isGenerating ? <RefreshCw className="animate-spin" /> : <Key />}
                    {isGenerating ? 'GENERATING...' : 'INITIALIZE'}
                  </button>
                </div>
              ) : (
                <div className="animate-in fade-in zoom-in duration-300 flex flex-col gap-3">
                  {/* Key Input */}
                  <textarea
                    value={importKey}
                    onChange={(e) => setImportKey(e.target.value)}
                    placeholder={t('ghostChat.pastePrivateKey')}
                    className="w-full h-24 bg-xmr-dim/20 border border-xmr-border text-[10px] p-2 text-xmr-green font-mono resize-none focus:border-xmr-green focus:outline-none scrollbar-hide rounded-sm"
                  />

                  {/* Password Input (Optional) */}
                  <input
                    type="password"
                    value={importPass}
                    onChange={(e) => setImportPass(e.target.value)}
                    placeholder={t('ghostChat.passphrase')}
                    className="w-full bg-xmr-dim/20 border border-xmr-border text-xs p-2 text-xmr-green font-mono focus:border-xmr-green focus:outline-none rounded-sm"
                  />

                  {/* Error Message */}
                  {importError && (
                    <p className="text-red-500 text-[10px] font-mono text-center animate-pulse">
                      ⚠ {importError}
                    </p>
                  )}

                  <button
                    onClick={handleImport}
                    disabled={isGenerating || !importKey}
                    className="w-full py-3 bg-xmr-base border border-xmr-green text-xmr-green font-bold font-mono text-sm flex items-center justify-center gap-2 hover:bg-xmr-green hover:text-black transition-all rounded-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? <RefreshCw className="animate-spin" /> : <FileDown size={16} />}
                    LOAD IDENTITY
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-xmr-base overflow-hidden">
      <Toaster
        position="top-center"
        toastOptions={{
          className: '',
          style: {
            background: '#000',
            border: '1px solid #00ff41',
            color: '#00ff41',
            fontFamily: 'monospace',
            fontSize: '12px',
            boxShadow: '0 0 10px rgba(0, 255, 65, 0.2)',
          },
          success: {
            iconTheme: {
              primary: '#00ff41',
              secondary: '#000',
            },
          },
          error: {
            style: {
              border: '1px solid #ef4444',
              color: '#ef4444',
              boxShadow: '0 0 10px rgba(239, 68, 68, 0.2)',
            },
            iconTheme: {
              primary: '#ef4444',
              secondary: '#000',
            },
          },
        }}
      />

      {showNukeModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-black border border-red-600 shadow-[0_0_50px_rgba(220,38,38,0.3)] rounded-sm p-6 relative overflow-hidden">
            {/* Red scanline background effect */}
            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#ef4444_10px,#ef4444_11px)]" />

            <div className="relative z-10 text-center">
              <AlertTriangle className="w-16 h-16 text-red-600 mx-auto mb-4 animate-pulse" />
              <h2 className="text-2xl font-mono font-bold text-red-500 mb-2 tracking-widest">{t('system.systemPurge')}</h2>
              <p className="text-xmr-dim font-mono text-sm mb-8">
                Initiating self-destruct sequence.<br />
                Select wiping protocol level:
              </p>

              <div className="flex flex-col gap-3">
                {/* Option 1: Destroy identity only */}
                <button
                  onClick={() => executeNuke(false)}
                  className="w-full py-4 border border-red-900/50 bg-red-900/10 hover:bg-red-900/30 text-red-400 font-mono text-xs flex items-center justify-between px-4 rounded-sm group transition-all"
                >
                  <span className="flex items-center gap-2">
                    <LogOut size={16} />
                    <span className="text-left">
                      <strong className="block text-sm text-red-200">SOFT WIPE (LOGOUT)</strong>
                      <span className="opacity-70">{t('system.deleteIdentityOnly')}</span>
                    </span>
                  </span>
                  <span className="text-[10px] bg-red-900/50 px-2 py-1 rounded text-red-200 group-hover:bg-red-500 group-hover:text-black transition-colors">{t('system.keepContacts')}</span>
                </button>

                {/* Option 2: Destroy all */}
                <button
                  onClick={() => executeNuke(true)}
                  className="w-full py-4 border border-red-600 bg-red-600 hover:bg-red-500 text-black font-bold font-mono text-xs flex items-center justify-between px-4 rounded-sm transition-all shadow-lg hover:shadow-red-500/50"
                >
                  <span className="flex items-center gap-2">
                    <Trash2 size={16} />
                    <span className="text-left">
                      <strong className="block text-sm">HARD WIPE (FACTORY RESET)</strong>
                      <span className="opacity-70 font-normal">Delete Identity + Contacts + History</span>
                    </span>
                  </span>
                  <AlertTriangle size={16} />
                </button>
              </div>

              <button
                onClick={() => setShowNukeModal(false)}
                className="mt-6 text-xmr-dim hover:text-white text-xs font-mono underline decoration-xmr-dim cursor-pointer"
              >
                ABORT SEQUENCE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥🔥🔥 System Status Bar (Header) */}
      <header className="h-10 border-b border-xmr-border flex items-center justify-between px-3 md:px-4 shrink-0 z-50">
        {/* Left: Branding & Exit */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-xmr-dim hover:text-red-500 transition-colors text-xs font-mono cursor-pointer"
            title={t('actions.exitTerminal')}
          >
            <ArrowLeft size={14} />
            <span className="hidden md:inline">{t('system.exit')}</span>
          </button>
          <div className="h-4 w-[1px] bg-xmr-border/50"></div>
          <span className="text-xmr-green font-mono text-xs tracking-widest font-bold">
            WALLS.RIP <span className="text-xmr-dim font-normal opacity-50">//</span> {t('system.comms')}
          </span>
        </div>

        {/* Right: Status Indicators */}
        <div className="flex items-center gap-3 md:gap-6">
          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-xmr-dim">
            <Shield size={10} />
            <span>PGP-ECC-25519</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-xmr-green">
            <Lock size={10} />
            <span className="hidden md:inline">{t('system.encrypted')}</span>
          </div>
          <div className={`flex items-center gap-2 text-[10px] font-mono ${relayStatus === 'connected' ? 'text-xmr-green' : relayStatus === 'connecting' ? 'text-yellow-500' : 'text-red-500'}`}>
            {relayStatus === 'disconnected' ? <WifiOff size={10} /> : <Wifi size={10} />}
            <span className="relative flex h-2 w-2">
              {relayStatus === 'connected' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-xmr-green opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${relayStatus === 'connected' ? 'bg-xmr-green' : relayStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
            </span>
            <span className="hidden md:inline">
              {relayStatus === 'connected' ? 'ONLINE' : relayStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </header>

      {/* 🔥 Main Content Area (height automatically fills the remaining space) */}
      <div className="flex-1 flex overflow-hidden p-0 md:p-4">
        <div className="w-full h-full flex border-x border-b md:border-t border-xmr-border bg-xmr-base md:rounded-sm overflow-hidden shadow-2xl">

          {/* Sidebar */}
          <div className={`${activePartner ? 'hidden md:flex' : 'flex'} w-full md:w-auto md:flex h-full flex-col`}>
            <ContactList
              identity={identity}
              contacts={contacts}
              activeFingerprint={activePartnerId}
              searchQuery={searchQuery}
              onSelect={(c) => setActivePartnerId(c.fingerprint)}
              onAddContact={addContact}
              onNuke={() => setShowNukeModal(true)}
              onDeleteContact={deleteContact}
              onRenameIdentity={handleRenameIdentity}
              onSearch={setSearchQuery}
            />
          </div>

          {/* ChatWindow */}
          <div className={`${!activePartner ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
            <ChatWindow
              identity={identity}
              partner={activePartner}
              wire={wire}
              onRelayStatusChange={setRelayStatus}
              onUpdatePartnerName={updateContactName}
              onAddContact={addContact}
              onBack={() => setActivePartnerId(null)}
              onNewContactRequest={handleNewContactRequest}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
