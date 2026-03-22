import React, { useState } from 'react';
import { Copy, QrCode, Check, ChevronLeft, Edit2, Bell } from 'lucide-react';
import type { Contact, KeyPair } from './types';
import toast from 'react-hot-toast';

interface ChatHeaderProps {
  partner: Contact;
  identity: KeyPair;
  isConnecting: boolean;
  onBack: () => void;
  onUpdatePartnerName: (fp: string, newName: string) => void;
  onShowIdentity: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  partner,
  identity,
  isConnecting,
  onBack,
  onUpdatePartnerName,
  onShowIdentity
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  const handleCopyPartnerKey = () => {
    const topic = `ghost-${identity.fingerprint}`;
    const payload = JSON.stringify({
      ver: 1,
      name: `USER-${identity.fingerprint.slice(0, 4)}`,
      pubKey: identity.publicKey,
      fp: identity.fingerprint,
      topic: topic
    });
    navigator.clipboard.writeText(payload);
    toast.success('INVITE PACKET COPIED');
  };

  const requestNotifyPermission = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      toast.success('NOTIFICATIONS: ON');
      new Notification('COMMAS', { body: 'Secure Channel Active', icon: '/favicon.ico' });
    } else {
      toast.error('DENIED');
    }
  };

  return (
    <div className="bg-xmr-surface border-b border-xmr-border p-3 flex justify-between items-center shadow-sm z-10 shrink-0">
      <div className="flex items-center gap-2 md:gap-3">
        {/* Mobile Back Button */}
        <button onClick={onBack} className="md:hidden p-1 text-xmr-dim hover:text-xmr-green cursor-pointer">
          <ChevronLeft size={24} />
        </button>

        {/* Connection Status Light */}
        <div className="relative text-xs">
          <div className={`w-2 h-2 rounded-full animate-ping absolute inset-0 opacity-50 ${isConnecting ? "bg-yellow-500" : "bg-xmr-green"}`} />
          <div className={`w-2 h-2 rounded-full relative ${isConnecting ? "bg-yellow-500" : "bg-xmr-green"}`} />
        </div>

        {/* Partner Info */}
        <div className="overflow-hidden">
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <div className="flex items-center">
                <input
                  autoFocus
                  className="bg-black/20 border-b border-xmr-green text-xmr-green text-sm font-mono w-24 focus:outline-none"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (onUpdatePartnerName(partner.fingerprint, tempName), setIsEditingName(false))}
                />
                <button onClick={() => { onUpdatePartnerName(partner.fingerprint, tempName); setIsEditingName(false); }} className="ml-1 text-xmr-green cursor-pointer">
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <h3
                className="text-sm font-bold font-mono text-xmr-green tracking-wider cursor-pointer truncate max-w-[120px] md:max-w-none flex items-center gap-2"
                onClick={() => { setTempName(partner.name); setIsEditingName(true); }}
              >
                {partner.name} <Edit2 size={10} className="opacity-50" />
              </h3>
            )}
          </div>
          <p className="text-[10px] text-xmr-dim font-mono truncate w-24 md:w-auto">{partner.fingerprint}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 md:gap-2">
        {('Notification' in window) && Notification.permission === 'default' && (
          <button onClick={requestNotifyPermission} className="p-2 text-xmr-dim hover:text-xmr-green hover:bg-xmr-green/10 rounded animate-pulse" title="Enable Notifications">
            <Bell size={18} />
          </button>
        )}
        <button onClick={onShowIdentity} className="p-2 text-xmr-green hover:bg-xmr-green/10 rounded cursor-pointer" title="QR">
          <QrCode size={18} />
        </button>
        <button onClick={handleCopyPartnerKey} className="p-2 text-xmr-green hover:bg-xmr-green/10 rounded cursor-pointer" title="Copy Invite">
          <Copy size={18} />
        </button>
      </div>
    </div>
  );
};
