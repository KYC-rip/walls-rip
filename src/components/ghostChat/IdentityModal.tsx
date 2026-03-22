/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AnimatePresence, motion } from "framer-motion";
import { X, Copy, Check } from "lucide-react";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { Scanner } from '@yudiel/react-qr-scanner';
import { useTheme } from '../../hooks/useTheme';
import { useEffect, useRef, useState } from 'react';
import { PGP } from "../../utils/pgp";
import toast from "react-hot-toast";

interface IdentityModalProps {
  identity: { publicKey: string, fingerprint: string, name?: string };
  show: boolean;
  onAddContact: (pubKey: string, name?: string, topic?: string) => void;
  onHide: (show: boolean) => void;
  initialMode?: 'show' | 'scan';
  disableScan?: boolean;
}

const INCOMING_SFX = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWoGAABzf4CAg4SFhoeIiYuMjY6PkJGSk5WWl5iZmpycnZ6foKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/AwcLDxMXGx8jJysvMzREWrwvRFi8W8hX/FQYW2BUOFm8V2RQkFFQT5hLBE5ISdRKZEc0QzBAGEDYP4w6zDfgMoAxWC+YK1QoJCgUJ9wjbCHgI/AcQB8AGmAZABhAG4gXNBZsFMgXkBOQEiQSUBEwE5APkA5cDbgNCA+cCzQK0AmoCQAIDAuQBtgGQAWMBOQHqAO4AlQCLAHEAQADq/9D/sf+c/3b/O//0/t3+uv6Q/mf+KP7v/c79qf2L/V/9G/36/M78qvyF/FH8Gfz5+/H7r/uH+1L7Gvv6+sz6pfp+2kLZQtZCy0LGQsBCukK0Qq9CqkKlQqFCnkKZQpRCjkKFQoBCfUJ3QnRCb0JpQmVCYEJcQlRCUEJKQkZCQUJAPz87Pzo/NT8wPyw/KD8kPyA/HD8YPxQ/ED8MPwg/BD8AP/4+/D74Pvg+9D7wPuw+6D7kPtQ+0D7MPsg+xD7APrw+tj6yPq4+qD6kPqA+nD6YPZQ9jj2GPX49ej10PXA9aj1kPWAvWi9UL04vRy9CLz0vOi80LywvJy8hLxsvFy8RLwwvBy8CL/wu+C7zLvAu7C7oLuQu4C7cLtau0i7MLsguwi68LrguNS4wLiwuKC4kLiAuHC4YLiAuKC40LkAuSi5WLmIucC58LokuXC9sL3wvii+WL6Avqi+2L8AvyjDWMOQw8TD+MQsxEzEXMRsxHzEkMSozLzQ3OUA9SkRTS1lTY11tYXVlen2Cg4aJi46PkZWWmZucnqGio6WnqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==';

export const IdentityModal = ({
  identity,
  show,
  onAddContact,
  onHide,
  initialMode = 'show',
  disableScan = false
}: IdentityModalProps) => {
  const { resolvedTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'show' | 'scan'>(initialMode);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const qrBgColor = resolvedTheme === 'dark' ? '#FFFFFF' : '#000000';
  const qrFgColor = resolvedTheme === 'dark' ? '#000000' : '#FFFFFF';

  useEffect(() => {
    audioRef.current = new Audio(INCOMING_SFX);
    audioRef.current.volume = 0.5;
  }, [identity.fingerprint]);

  useEffect(() => {
    if (show) {
      setActiveTab(initialMode);
    }
  }, [show, initialMode]);

  const handleClose = () => {
    onHide(false);
  };

  const handleScan = (result: any[]) => {
    if (result && result.length > 0) {
      const raw = result[0].rawValue;
      try {
        const data = JSON.parse(raw);
        if (data.pubKey && data.topic) {
          onAddContact(data.pubKey, data.name, data.topic);
          handleClose();
          playSound();
          toast.success('UPLINK ESTABLISHED');
          return;
        }
      } catch (e) {
        if (PGP.isValidPublicKey(raw)) {
          onAddContact(raw);
          handleClose();
          playSound();
          toast.success('LEGACY KEY IMPORTED');
        }
      }
    }
  };

  const playSound = () => audioRef.current?.play().catch(() => { });

  const handleCopyInvite = () => {
    const topic = `comms-${identity.fingerprint}`;
    const payload = JSON.stringify({
      ver: 1,
      name: `USER-${identity.fingerprint.slice(0, 4)}`,
      pubKey: identity.publicKey,
      fp: identity.fingerprint,
      topic: topic
    });

    navigator.clipboard.writeText(payload);
    setCopied(true);
    toast.success('INVITE PACKET COPIED');
    setTimeout(() => setCopied(false), 2000);
  };

  const qrData = JSON.stringify({
    ver: 1,
    name: `USER-${identity.fingerprint.slice(0, 4)}`,
    pubKey: identity.publicKey,
    fp: identity.fingerprint,
    topic: `comms-${identity.fingerprint}`
  });

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[60] backdrop-blur-sm flex flex-col items-center justify-center p-6 "
        >
          <div className="w-full max-w-sm bg-xmr-surface border border-xmr-green rounded-sm p-4 relative shadow-[0_0_30px_rgba(0,255,65,0.2)]">

            <button
              onClick={handleClose}
              className="absolute top-2 right-2 text-xmr-dim hover:text-red-500 cursor-pointer transition-colors p-1 z-10"
            >
              <X size={20} />
            </button>

            {!disableScan ? (
              <div className="flex gap-4 mb-6 justify-center">
                <button
                  onClick={() => setActiveTab('show')}
                  className={`pb-1 text-sm font-mono border-b-2 cursor-pointer transition-colors ${activeTab === 'show' ? 'text-xmr-green border-xmr-green' : 'text-xmr-dim border-transparent hover:text-white'}`}
                >
                  {identity.name || " MY CODE"}
                </button>
                <button
                  onClick={() => setActiveTab('scan')}
                  className={`pb-1 text-sm font-mono border-b-2 cursor-pointer transition-colors ${activeTab === 'scan' ? 'text-xmr-green border-xmr-green' : 'text-xmr-dim border-transparent hover:text-white'}`}
                >
                  SCAN
                </button>
              </div>) : (<div className="flex gap-4 mb-6 justify-center"> {identity.name || " MY CODE"}</div>)}

            <div className="min-h-[300px] flex items-center justify-center rounded p-2">

              {activeTab === 'show' ? (
                <div className="h-auto w-full max-w-[320px] flex flex-col items-center animate-in zoom-in duration-300">
                  <div className="p-3 w-full h-full bg-white flex flex-col items-center border border-xmr-border rounded-sm shadow-inner">
                    <QRCode
                      size={320}
                      style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                      value={qrData}
                      viewBox={`0 0 256 256`}
                      fgColor={qrFgColor}
                      bgColor={qrBgColor}
                      level="M"
                    />
                  </div>

                  <p className="text-center text-xmr-green font-mono text-[10px] mt-3 mb-3 truncate w-full tracking-wider opacity-80 select-all">
                    {identity.fingerprint}
                  </p>

                  <button
                    onClick={handleCopyInvite}
                    className="w-full py-2 flex items-center justify-center gap-2 bg-xmr-green/10 border border-xmr-green/50 text-xmr-green text-xs font-mono rounded hover:bg-xmr-green hover:text-black transition-all cursor-pointer group"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'COPIED TO CLIPBOARD' : 'COPY INVITE PACKET'}
                  </button>

                  <p className="text-[9px] text-xmr-dim mt-2 text-center opacity-60">
                    Share this packet to establish<br />secure uplink frequency.
                  </p>
                </div>
              ) : (
                <div className="w-full h-full aspect-square relative overflow-hidden rounded border border-xmr-green/20">
                  <Scanner
                    onScan={handleScan}
                    components={{ finder: false, onOff: false }}
                    styles={{
                      container: { width: '100%', height: '100%' },
                      video: { objectFit: 'cover' }
                    }}
                  />
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-xmr-green/80 shadow-[0_0_10px_#00FF41] animate-[scan_2s_linear_infinite]" />
                    <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-xmr-green" />
                    <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-xmr-green" />
                    <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-xmr-green" />
                    <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-xmr-green" />
                  </div>
                </div>
              )}

            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
