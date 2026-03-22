/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, WifiOff } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

import { PGP, type GhostHandshake } from '../../utils/pgp';
import type { KeyPair, Contact, Message } from './types';

import { MessageBubble } from './MessageBubble';
import { IdentityModal } from './IdentityModal';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';
import { processSlashCommands, HELP_MESSAGE } from '../../utils/chatUtils';

interface WireState {
  messages: Message[];
  isConnecting: boolean;
  relayStatus: 'connecting' | 'connected' | 'disconnected';
  sendMessage: (text: string) => Promise<void>;
  sendHandshake: (silent?: boolean) => Promise<void>;
  manualDecrypt: (text: string) => Promise<void>;
  clearMessages: () => void;
  addSystemMessage: (text: string) => void;
  getEncryptedPayload: (text: string) => Promise<string | null>;
}

interface ChatWindowProps {
  identity: KeyPair;
  partner: Contact | null;
  wire: WireState;
  onRelayStatusChange: (status: 'connecting' | 'connected' | 'disconnected') => void;
  onUpdatePartnerName: (fp: string, newName: string) => void;
  onAddContact: (key: string, name?: string, topic?: string) => void;
  onBack: () => void;
  onNewContactRequest?: (contact: Contact) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  identity,
  partner,
  wire,
  onRelayStatusChange,
  onUpdatePartnerName,
  onAddContact,
  onBack,
  onNewContactRequest: _onNewContactRequest
}) => {
  const { t } = useTranslation();
  const [showIdentity, setShowIdentity] = React.useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isConnecting, relayStatus, sendMessage, sendHandshake, manualDecrypt, clearMessages, addSystemMessage, getEncryptedPayload } = wire;

  useEffect(() => {
    onRelayStatusChange(relayStatus);
  }, [relayStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // === Input Handling ===

  const handlePasteInput = async (text: string) => {
    if (!text.trim()) return;

    try {
      if (text.trim().startsWith('{')) {
        const data: GhostHandshake = JSON.parse(text);
        if (PGP.isValidPublicKey(data.pubKey)) {
          onAddContact(data.pubKey, data.name, data.topic);
          toast.success(t('system.keyAddedManually'));
          return;
        }
      }
    } catch (e) { }

    if (PGP.isPGPMessage(text)) {
      if (!identity || !partner) return;
      manualDecrypt(text);
      return;
    }
  };

  const handleInputSubmit = async (text: string) => {
    if (!partner) return;

    if (text.trim() === '/handshake') {
      sendHandshake();
      return;
    }

    if (text.startsWith('/enc ')) {
      const plainText = text.replace('/enc ', '').trim();
      if (!plainText) return;
      try {
        const encrypted = await PGP.encrypt(plainText, partner.publicKey);
        await navigator.clipboard.writeText(encrypted);
        toast.success(t('system.encryptedAndCopied'));
        return;
      } catch (e) {
        toast.error(t('errors.generic')); return;
      }
    }

    if (text.trim() === '/copy') {
      addSystemMessage('Usage: /copy <message> — encrypt and copy to clipboard without sending via relay');
      return;
    }

    if (text.startsWith('/copy ')) {
      const plainText = text.replace('/copy ', '').trim();
      if (!plainText) return;
      try {
        const encrypted = await getEncryptedPayload(plainText);
        if (encrypted) {
          await navigator.clipboard.writeText(encrypted);
          toast.success('PAYLOAD COPIED — share via any channel');
        }
      } catch (e) {
        toast.error(t('errors.generic'));
      }
      return;
    }

    if (text.trim() === '/clear') { clearMessages(); return; }

    if (text.trim() === '/?' || text.trim() === '/help') {
      addSystemMessage(HELP_MESSAGE + '\n/copy <msg>  : Encrypt & copy (relay-less)');
      return;
    }

    let finalContent = text;
    try {
      const result = await processSlashCommands(text);
      if (!result) return;
      finalContent = result;
    } catch (e: any) {
      toast.error(e.message); return;
    }

    if (relayStatus !== 'connected') {
      const encrypted = await getEncryptedPayload(finalContent);
      if (encrypted) {
        await navigator.clipboard.writeText(encrypted);
        toast.error('OFFLINE — encrypted payload copied to clipboard');
      }
      return;
    }

    sendMessage(finalContent);
  };

  // === Renders ===

  if (!partner) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-xmr-base text-xmr-dim p-8 text-center h-full">
        <Radio className="text-xmr-green mb-4 animate-pulse" size={32} />
        <h3 className="text-lg font-mono text-xmr-green mb-2">{t('system.channelWaiting')}</h3>
        <p className="text-xs max-w-xs font-mono mb-6">Listening on {identity.fingerprint.slice(0, 8)}...</p>
        <div className="text-[10px] font-mono text-xmr-dim/50 space-y-1">
          <p>Share your invite link to establish a channel</p>
          <p>or paste a PGP message to decrypt it</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-xmr-base relative overflow-hidden">
      {relayStatus !== 'connected' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-900/20 border-b border-red-900/30 text-red-500 text-[10px] font-mono shrink-0">
          <WifiOff size={12} />
          <span>RELAY OFFLINE — use <span className="font-bold">/copy &lt;message&gt;</span> to encrypt and share manually</span>
        </div>
      )}

      <IdentityModal
        identity={partner}
        onAddContact={onAddContact}
        show={showIdentity}
        onHide={setShowIdentity}
        initialMode='show'
      />

      <ChatHeader
        partner={partner}
        identity={identity}
        isConnecting={isConnecting}
        onBack={onBack}
        onUpdatePartnerName={onUpdatePartnerName}
        onShowIdentity={() => setShowIdentity(true)}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-xmr-base relative scrollbar-thin scrollbar-thumb-xmr-border">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(var(--color-xmr-dim) 1px, transparent 1px), linear-gradient(90deg, var(--color-xmr-dim) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

        <AnimatePresence>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSend={handleInputSubmit}
        onManualDecrypt={manualDecrypt} // Pass in the manual decryption method of the Hook
        onPasteInput={handlePasteInput}
      />
    </div>
  );
};
