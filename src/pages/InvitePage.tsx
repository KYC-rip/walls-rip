import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Shield, Check, X, WifiOff, RefreshCw } from 'lucide-react';
import { PGP, type GhostHandshake } from '../utils/pgp';
import type { Contact } from '../components/ghostChat/types';
import toast from 'react-hot-toast';

export const InvitePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [decoded, setDecoded] = useState<GhostHandshake | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [_adding, setAdding] = useState(false);

  useEffect(() => {
    try {
      const key = searchParams.get('key');
      const topic = searchParams.get('topic');
      const name = searchParams.get('name') || 'Unknown';
      const fp = searchParams.get('fp');

      if (!key || !topic) {
        setError('Invalid invite link. Missing key or topic.');
        return;
      }

      if (!PGP.isValidPublicKey(key)) {
        setError('Invalid invite link. Not a valid PGP public key.');
        return;
      }

      setDecoded({
        ver: 1,
        name,
        pubKey: key,
        fp: fp || '',
        topic,
      });
    } catch (e) {
      setError('Could not parse invite link.');
    }
  }, [searchParams]);

  const handleAccept = () => {
    if (!decoded) return;
    setAdding(true);

    const contact: Contact = {
      fingerprint: decoded.fp || 'UNKNOWN',
      name: decoded.name,
      publicKey: decoded.pubKey,
      nostrTopic: decoded.topic,
      addedAt: Date.now(),
    };

    const existing = localStorage.getItem('ghost_contacts');
    const contacts: Contact[] = existing ? JSON.parse(existing) : [];

    const exists = contacts.find(c => c.fingerprint === contact.fingerprint);
    if (exists) {
      Object.assign(exists, contact);
    } else {
      contacts.push(contact);
    }

    localStorage.setItem('ghost_contacts', JSON.stringify(contacts));
    toast.success('Contact added!');
    navigate('/comms');
  };

  const handleDecline = () => {
    navigate('/comms');
  };

  if (error) {
    return (
      <div className="flex flex-col h-[100dvh] bg-xmr-base items-center justify-center p-8">
        <div className="max-w-md w-full border border-red-600 bg-black p-8 rounded-sm">
          <WifiOff className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-mono text-red-500 text-center mb-2">INVALID INVITE</h2>
          <p className="text-xmr-dim text-sm font-mono text-center">{error}</p>
          <button
            onClick={() => navigate('/comms')}
            className="mt-6 w-full py-3 border border-xmr-border text-xmr-dim font-mono text-sm hover:text-xmr-green hover:border-xmr-green transition-colors"
          >
            GO BACK
          </button>
        </div>
      </div>
    );
  }

  if (!decoded) {
    return (
      <div className="flex flex-col h-[100dvh] bg-xmr-base items-center justify-center p-8">
        <div className="max-w-md w-full border border-xmr-border bg-black p-8 rounded-sm text-center">
          <RefreshCw className="w-16 h-16 text-xmr-green mx-auto mb-4 animate-spin" />
          <p className="text-xmr-dim font-mono text-sm">DECODING INVITE...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-xmr-base items-center justify-center p-4">
      <div className="max-w-md w-full border border-xmr-green bg-black p-8 rounded-sm relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-xmr-green animate-pulse" />

        <div className="text-center mb-8">
          <Shield className="w-16 h-16 text-xmr-green mx-auto mb-4" />
          <h2 className="text-2xl font-mono text-xmr-green mb-2 tracking-tighter">INCOMING UPLINK</h2>
          <p className="text-xmr-dim text-xs font-mono">
            Someone is requesting a secure connection
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex justify-between items-center p-3 bg-xmr-dim/10 border border-xmr-border">
            <span className="text-xmr-dim text-xs font-mono">NAME</span>
            <span className="text-xmr-green font-mono text-sm font-bold">{decoded.name}</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-xmr-dim/10 border border-xmr-border">
            <span className="text-xmr-dim text-xs font-mono">FINGERPRINT</span>
            <span className="text-xmr-green font-mono text-xs">{decoded.fp || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-xmr-dim/10 border border-xmr-border">
            <span className="text-xmr-dim text-xs font-mono">CHANNEL</span>
            <span className="text-xmr-green font-mono text-xs truncate max-w-[200px]">{decoded.topic}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDecline}
            className="flex-1 py-4 border border-red-900/50 text-red-500 font-mono text-sm hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2"
          >
            <X size={16} /> DECLINE
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 py-4 bg-xmr-green text-black font-bold font-mono text-sm hover:brightness-110 transition-all flex items-center justify-center gap-2"
          >
            <Check size={16} /> ACCEPT
          </button>
        </div>

        <p className="text-[9px] text-xmr-dim text-center mt-4 opacity-50">
          Connection uses end-to-end encryption.<br />Keys never leave your device.
        </p>
      </div>
    </div>
  );
};
