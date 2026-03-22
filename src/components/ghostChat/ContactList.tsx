/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Key, Shield, LogOut, Copy, QrCode, Scan, Edit2, Check, Search, X } from 'lucide-react';
import type { Contact, KeyPair } from './types';
import { PGP } from '../../utils/pgp';
import toast from 'react-hot-toast';
import { IdentityModal } from './IdentityModal';

interface ContactListProps {
  identity: KeyPair;
  contacts: Contact[];
  activeFingerprint: string | null;
  searchQuery: string;
  onSelect: (contact: Contact) => void;
  onAddContact: (key: string, name?: string, topic?: string) => void;
  onNuke: () => void;
  onDeleteContact: (fp: string) => void;
  onRenameIdentity: (newName: string) => void;
  onSearch: (q: string) => void;
}

export const ContactList: React.FC<ContactListProps> = ({
  identity,
  contacts,
  activeFingerprint,
  searchQuery,
  onSelect,
  onAddContact,
  onNuke,
  onDeleteContact,
  onRenameIdentity,
  onSearch
}) => {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [qrMode, setQrMode] = useState<'show' | 'scan' | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.fingerprint.toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  // === Handlers ===
  const handleCopyMyKey = () => {
    const topic = `ghost-${identity.fingerprint}`;
    const payload = JSON.stringify({
      ver: 1,
      name: identity.name,
      pubKey: identity.publicKey,
      fp: identity.fingerprint,
      topic: topic
    });
    navigator.clipboard.writeText(payload);
    toast.success(t('system.invitePacketCopied'));
  };

  const handleAddSubmit = () => {
    if (!newKeyInput.trim()) return;
    try {
      const data = JSON.parse(newKeyInput);
      if (data.pubKey && data.topic) {
        onAddContact(data.pubKey, data.name, data.topic);
        setNewKeyInput('');
        setIsAdding(false);
        toast.success('INVITE ACCEPTED');
        return;
      }
    } catch (e) { /* empty */ }

    if (PGP.isValidPublicKey(newKeyInput)) {
      onAddContact(newKeyInput);
      setNewKeyInput('');
      setIsAdding(false);
      toast('LEGACY KEY ADDED', { icon: '⚠️' });
    } else {
      toast.error('INVALID DATA');
    }
  };

  const startEditing = () => {
    setTempName(identity.name);
    setIsEditingName(true);
  };

  const saveName = () => {
    if (tempName.trim()) {
      onRenameIdentity(tempName);
    }
    setIsEditingName(false);
  };

  return (
    <>
      <div className="w-full md:w-80 flex flex-col border-r border-xmr-border bg-xmr-surface/80 backdrop-blur-sm h-full relative z-20">

        {/* 1. Header */}
        <div className="p-3 border-b border-xmr-border shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xmr-green font-bold tracking-widest font-mono select-none">
              <div className="w-2 h-2 bg-xmr-green rounded-full animate-pulse shadow-[0_0_8px_#00ff41]" />
              {t('system.comms')}
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => setQrMode('scan')}
                className="p-1.5 text-xmr-dim hover:text-xmr-green hover:bg-xmr-green/10 rounded transition-colors"
                title={t('actions.scanQr')}
              >
                <Scan size={16} />
              </button>
              <button
                onClick={() => setIsAdding(!isAdding)}
                className={`p-1.5 rounded transition-colors ${isAdding ? 'text-xmr-green bg-xmr-green/10' : 'text-xmr-dim hover:text-xmr-green hover:bg-xmr-green/10'}`}
                title={t('actions.addContact')}
              >
                <Plus size={16} className={`transition-transform ${isAdding ? 'rotate-45' : ''}`} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-xmr-dim" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full bg-xmr-dim/10 border border-xmr-border text-xs px-2 py-1 pl-7 text-xmr-green font-mono focus:border-xmr-green focus:outline-none rounded-sm"
            />
            {searchQuery && (
              <button
                onClick={() => onSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xmr-dim hover:text-xmr-green"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* 2. Add Area */}
        {isAdding && (
          <div className="p-3 bg-xmr-base/50 border-b border-xmr-border animate-in slide-in-from-top-2">
            <textarea
              autoFocus
              value={newKeyInput}
              onChange={(e) => setNewKeyInput(e.target.value)}
              placeholder={t('ghostChat.pasteInvitePacket')}
              className="w-full h-16 bg-xmr-green/10 border border-xmr-border text-xs p-2 text-xmr-green font-mono resize-none focus:border-xmr-green focus:outline-none mb-2 rounded-sm"
            />
            <button onClick={handleAddSubmit} className="w-full bg-xmr-green text-black text-xs font-bold py-1.5 hover:brightness-110 rounded-sm">
              ADD CONTACT
            </button>
          </div>
        )}

        {/* 3. List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-xmr-border p-2 space-y-1">
          {contacts.length === 0 && !isAdding && (
            <div className="flex flex-col items-center justify-center h-40 text-xmr-dim/30">
              <Key size={32} className="mb-2 opacity-50" />
              <p className="text-[10px] font-mono">{t('system.noUplinks')}</p>
            </div>
          )}

          {searchQuery && filteredContacts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-20 text-xmr-dim/30">
              <p className="text-[10px] font-mono">No matches</p>
            </div>
          )}

          {filteredContacts.map(contact => (
            <button
              key={contact.fingerprint}
              onClick={() => onSelect(contact)}
              className={`w-full flex items-center justify-between p-3 rounded-sm border transition-all group relative overflow-hidden cursor-pointer text-left ${activeFingerprint === contact.fingerprint
                  ? 'bg-xmr-green/10 border-xmr-green/30 text-xmr-green'
                  : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/10 text-xmr-dim hover:text-xmr-green'
                }`}
            >
              {activeFingerprint === contact.fingerprint && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-xmr-green shadow-[0_0_10px_#00ff41]" />
              )}
              <div className="flex items-center gap-3 overflow-hidden min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${activeFingerprint === contact.fingerprint ? 'bg-xmr-green text-black' : 'bg-xmr-dim/10 text-xmr-dim group-hover:text-xmr-green group-hover:border-xmr-green'
                  }`}>
                  {contact.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col overflow-hidden min-w-0">
                  <span className="text-sm font-mono font-bold truncate">{contact.name}</span>
                  <span className="text-[9px] opacity-50 font-mono truncate">{contact.fingerprint}</span>
                </div>
              </div>
              <div
                onClick={(e) => { e.stopPropagation(); onDeleteContact(contact.fingerprint); }}
                className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/10 text-red-500 rounded transition-all"
              >
                <Trash2 size={14} />
              </div>
            </button>
          ))}
        </div>

        {/* 4. Footer: User Profile */}
        <div className="mt-auto p-3 border-t border-xmr-border bg-xmr-dim/10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {/* Avatar (Click to Show QR) */}
            <div
              className="w-10 h-10 rounded-full bg-gradient-to-br from-xmr-green/20 to-transparent border border-xmr-green/50 flex items-center justify-center text-xmr-green font-bold shrink-0 cursor-pointer hover:scale-105 transition-transform"
              onClick={() => setQrMode('show')}
            >
              {identity.name?.substring(0, 2).toUpperCase() || "NO NAME"}
            </div>

            {/* Info & Edit */}
            <div className="flex-1 overflow-hidden min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-1 animate-in fade-in">
                  <input
                    autoFocus
                    className="w-full bg-xmr-green/10 border-b border-xmr-green text-sm text-xmr-green font-mono focus:outline-none py-0.5"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                    onBlur={saveName}
                  />
                  <button onClick={saveName} className="text-xmr-green"><Check size={14} /></button>
                </div>
              ) : (
                <div className="group cursor-pointer" onClick={startEditing}>
                  <p className="text-sm font-bold text-xmr-green truncate flex items-center gap-2">
                    {identity.name} <Edit2 size={10} className="opacity-0 group-hover:opacity-100 text-xmr-dim" />
                    <button onClick={(e) => { e.stopPropagation(); setQrMode('show'); }} className="p-1.5 text-xmr-dim hover:text-xmr-green hover:bg-xmr-green/10 rounded" title={t('actions.showMyQr')}>
                      <QrCode size={14} />
                    </button>
                  </p>
                  <p
                    className="text-[9px] text-xmr-dim font-mono truncate hover:text-xmr-green transition-colors mt-0.5 flex items-center gap-1"
                    onClick={(e) => { e.stopPropagation(); handleCopyMyKey(); }}
                    title={t('tooltips.clickToCopyId')}
                  >
                    <Shield size={8} /> {identity.fingerprint}
                  </p>
                </div>
              )}
            </div>

            {/* 🔥 Actions: QR, Copy, Nuke */}
            <div className="flex flex-col gap-1">
              <button onClick={handleCopyMyKey} className="p-1.5 text-xmr-dim hover:text-xmr-green hover:bg-xmr-green/10 rounded" title={t('actions.copyKey')}>
                <Copy size={14} />
              </button>
              <button onClick={onNuke} className="p-1.5 text-xmr-dim hover:text-red-500 hover:bg-red-500/10 rounded" title={t('actions.destroySession')}>
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <IdentityModal
        identity={identity}
        show={qrMode !== null}
        onAddContact={onAddContact}
        onHide={() => setQrMode(null)}
        disableScan={qrMode !== 'scan'}
        initialMode={qrMode === 'scan' ? 'scan' : 'show'}
      />
    </>
  );
};
