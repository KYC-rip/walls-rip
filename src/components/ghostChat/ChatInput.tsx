/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Clipboard, Unlock } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChatInputProps {
  onSend: (text: string) => void;
  onManualDecrypt: (text: string) => void;
  onPasteInput: (text: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, onManualDecrypt, onPasteInput }) => {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isCiphertext, setIsCiphertext] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (inputText.trim().startsWith('-----BEGIN PGP MESSAGE-----')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCiphertext(true);
    } else {
      setIsCiphertext(false);
    }
  }, [inputText]);

  useEffect(() => {
    if (inputText.startsWith('/drop')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHint('💡 Tip: Try "/drop 10m secret" for auto-delete');
    } else if (inputText.startsWith('/clear')) {
      setHint("💡 Clear the screen but they will come back when refreshing.");
    } else {
      setHint('');
    }
  }, [inputText]);

  const handleSubmit = () => {
    if (!inputText.trim()) return;

    if (isCiphertext) {
      onManualDecrypt(inputText);
    } else {
      setHistory(prev => [...prev, inputText]);
      setHistoryIndex(-1);
      onSend(inputText);
    }
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInputText(history[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInputText('');
        } else {
          setHistoryIndex(newIndex);
          setInputText(history[newIndex]);
        }
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSmartPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        onPasteInput(text);
      }
    } catch (err) {
      toast.error(t('system.clipboardAccessDenied'));
    }
  };

  return (
    <div className={`p-2 md:p-3 border-t z-10 shrink-0 pb-safe transition-colors ${isCiphertext ? 'bg-yellow-500/10 border-yellow-500/50' : 'bg-xmr-surface border-xmr-border'
      }`}>
      <div className="relative flex items-end gap-2">
        <button
          onClick={handleSmartPaste}
          className={`h-12 md:h-16 w-12 md:w-14 border rounded-sm flex flex-col items-center justify-center transition-all group cursor-pointer ${isCiphertext
            ? 'border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/20'
            : 'bg-xmr-base border-xmr-border text-xmr-dim hover:text-xmr-green hover:border-xmr-green'
            }`}
          title={t('actions.paste')}
        >
          <Clipboard size={18} className="mb-1 group-hover:scale-110 transition-transform" />
          <span className="text-[8px] font-mono hidden md:block">{t('ghostChat.paste')}</span>
        </button>

        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          // Intercept Ctrl+V
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text) onPasteInput(text);
          }}
          placeholder={isCiphertext ? "DETECTED ENCRYPTED BLOCK. PRESS DECRYPT." : "Type a message or /? for help"}
          className={`w-full bg-xmr-base border rounded-sm p-3 text-sm font-mono focus:outline-none resize-none h-12 md:h-16 scrollbar-hide transition-colors ${isCiphertext
            ? 'text-yellow-500 border-yellow-500 placeholder:text-yellow-500/50'
            : 'text-xmr-green border-xmr-border focus:border-xmr-green'
            }`}
        />

        {hint && <div className="text-[9px] text-xmr-green/70 font-mono px-2 -mt-4 absolute top-[-15px]">{hint}</div>}

        <button
          onClick={handleSubmit}
          className={`h-12 md:h-16 w-12 md:w-14 font-bold rounded-sm flex items-center justify-center hover:brightness-110 transition-all cursor-pointer shadow-lg ${isCiphertext
            ? 'bg-yellow-500 text-black shadow-yellow-500/20'
            : 'bg-xmr-green text-xmr-base'
            }`}
          title={isCiphertext ? "Decrypt" : "Send"}
        >
          {isCiphertext ? <Unlock size={18} /> : <Send size={18} />}
        </button>
      </div>

      {isCiphertext && (
        <div className="text-[9px] text-yellow-500 font-mono text-center mt-1 animate-pulse">
          ⚠️ MANUAL DECRYPTION MODE ACTIVE
        </div>
      )}
    </div>
  );
};
