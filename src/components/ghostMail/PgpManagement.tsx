/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { Shield, Key, Copy, Check, Unlock, RefreshCw, Download, AlertTriangle, X, Eye } from 'lucide-react';
import * as openpgp from 'openpgp';
import { toast } from 'react-hot-toast';

interface PgpManagementProps {
  email: string;
  pgpEnabled: boolean;
  onEnable: (publicKey: string, enabled: boolean) => Promise<boolean>;
  onClose: () => void;
}

export function PgpManagement({ email, pgpEnabled, onEnable, onClose }: PgpManagementProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [copiedPriv, setCopiedPriv] = useState(false);
  const [copiedPub, setCopiedPub] = useState(false);
  const [step, setStep] = useState<'choice' | 'manual' | 'generated'>('choice');

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { privateKey, publicKey } = await openpgp.generateKey({
        type: 'ecc',
        userIDs: [{ name: email, email: email }],
      });
      setPublicKey(publicKey);
      setPrivateKey(privateKey);
      setStep('generated');
      toast.success('Keys generated');
    } catch (e) {
      toast.error('Key generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggle = async () => {
    if (!pgpEnabled && !publicKey) {
      toast.error('Public key required');
      return;
    }
    await onEnable(publicKey, !pgpEnabled);
  };

  const downloadPrivateKey = () => {
    const blob = new Blob([privateKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghostmail_${email}_private.key`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Card */}
      <div className="w-full max-w-md bg-wr-base border border-wr-border shadow-2xl rounded-sm relative z-10 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="p-4 border-b border-wr-border flex justify-between items-center bg-wr-surface">
          <div className="flex items-center gap-2">
            <Shield className="text-wr-green" size={18} />
            <span className="text-xs font-black uppercase tracking-widest text-wr-green">INBOX ENCRYPTION</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-wr-green/10 rounded-full transition-colors text-wr-dim hover:text-wr-green">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {pgpEnabled ? (
            <div className="space-y-4">
              <div className="p-4 bg-wr-green/5 border border-wr-green/20 rounded-sm">
                <p className="text-[10px] text-wr-green uppercase font-bold text-center leading-relaxed">
                  PGP encryption is active. All incoming emails are encrypted with your public key.
                </p>
              </div>
              <button
                onClick={handleToggle}
                className="w-full py-3 border border-wr-error/50 text-wr-error hover:bg-wr-error/10 transition-all font-black uppercase text-[10px] tracking-widest rounded-sm"
              >
                DISABLE PGP
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {step === 'choice' && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="p-5 bg-wr-green text-wr-base hover:opacity-90 transition-all rounded-sm flex flex-col items-center gap-2 shadow-lg shadow-wr-green/20"
                  >
                    {isGenerating ? <RefreshCw className="animate-spin" size={20} /> : <Key size={20} />}
                    <span className="font-black uppercase text-xs tracking-widest text-center">GENERATE KEY PAIR</span>
                    <span className="text-[8px] uppercase opacity-70">Local ECC (Curve25519)</span>
                  </button>

                  <div className="relative py-2 text-center">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-wr-border"></div></div>
                    <span className="relative bg-wr-base px-3 text-[8px] text-wr-dim font-bold uppercase">OR</span>
                  </div>

                  <button
                    onClick={() => setStep('manual')}
                    className="p-4 border border-wr-border text-wr-dim hover:border-wr-green hover:text-wr-green transition-all rounded-sm flex items-center justify-center gap-2 bg-wr-surface/30 hover:bg-wr-surface/50"
                  >
                    <Unlock size={16} />
                    <span className="font-black uppercase text-[10px] tracking-widest">IMPORT PUBLIC KEY</span>
                  </button>
                </div>
              )}

              {step === 'manual' && (
                <div className="space-y-4">
                  <label className="text-[9px] font-bold text-wr-dim uppercase tracking-widest">Your PGP Public Key (Armored)</label>
                  <textarea
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
                    className="w-full h-32 bg-wr-surface border border-wr-border rounded-sm p-3 text-[10px] font-mono text-wr-green focus:border-wr-green outline-none resize-none shadow-inner placeholder:opacity-30"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setStep('choice')} className="px-4 py-3 border border-wr-border text-wr-dim text-[10px] uppercase font-bold hover:bg-wr-surface">Back</button>
                    <button onClick={handleToggle} className="flex-1 py-3 bg-wr-green text-wr-base text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg">ACTIVATE PGP</button>
                  </div>
                </div>
              )}

              {step === 'generated' && (
                <div className="space-y-5 animate-in slide-in-from-bottom-2 duration-300">
                  {/* Public Key Display */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[9px] font-bold text-wr-dim uppercase flex items-center gap-1"><Eye size={10} /> PUBLIC KEY (SAFE TO SHARE)</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(publicKey);
                          setCopiedPub(true);
                          setTimeout(() => setCopiedPub(false), 2000);
                        }}
                        className="text-[9px] font-bold text-wr-green hover:underline flex items-center gap-1"
                      >
                        {copiedPub ? <Check size={10} /> : <Copy size={10} />} Copy
                      </button>
                    </div>
                    <div className="p-3 bg-wr-surface border border-wr-border rounded-sm text-[8px] font-mono text-wr-dim break-all h-16 overflow-y-auto custom-scrollbar">
                      {publicKey}
                    </div>
                  </div>

                  {/* Private Key Critical Alert */}
                  <div className="p-4 bg-wr-error/5 border border-wr-error/30 rounded-sm space-y-3">
                    <div className="flex items-center gap-2 text-wr-error text-[10px] font-black uppercase tracking-widest">
                      <AlertTriangle size={16} /> CRITICAL — SAVE PRIVATE KEY
                    </div>
                    <p className="text-[9px] text-wr-dim uppercase leading-relaxed text-left">
                      Download or copy your private key now. It will NOT be stored on our servers. If you lose it, encrypted emails cannot be decrypted.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={downloadPrivateKey}
                        className="flex-1 py-3 bg-wr-error/20 hover:bg-wr-error/30 text-wr-error transition-all text-[10px] font-black rounded-sm flex items-center justify-center gap-2 border border-wr-error/30"
                      >
                        <Download size={14} /> DOWNLOAD .KEY
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(privateKey);
                          setCopiedPriv(true);
                          setTimeout(() => setCopiedPriv(false), 2000);
                        }}
                        className="px-4 py-3 border border-wr-error/30 text-wr-error hover:bg-wr-error/10 rounded-sm text-[10px] font-bold transition-all"
                      >
                        {copiedPriv ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                  <button onClick={handleToggle} className="w-full py-4 bg-wr-green text-wr-base font-black uppercase tracking-[0.2em] text-xs rounded-sm hover:opacity-90 transition-all shadow-xl">
                    ENABLE ENCRYPTION & CLOSE
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3 bg-wr-surface border-t border-wr-border text-center">
          <span className="text-[8px] text-wr-dim uppercase opacity-50 tracking-tighter font-bold">
            Keys generated locally. Private key never leaves your browser.
          </span>
        </div>
      </div>
    </div>
  );
}
