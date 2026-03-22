/* eslint-disable @typescript-eslint/no-explicit-any */
import { motion } from 'framer-motion';
import { parseSmartMessage } from '../../utils/messageParser';
import { Volume2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

export const MessageBubble = ({ msg }: { msg: any }) => {
  const isMe = msg.sender === 'me';
  
  const handleCopyPayload = async () => {
    if (!msg.payload) {
      toast.error('No payload to copy');
      return;
    }
    await navigator.clipboard.writeText(msg.payload);
    toast.success('PAYLOAD COPIED');
  };

  return (
    <motion.div 
      key={msg.id} 
      initial={{ opacity: 0, x: isMe ? 20 : -20 }} 
      animate={{ opacity: 1, x: 0 }} 
      className={`
        mb-4
        flex ${isMe ? 'justify-end' : 'justify-start'} 
        relative z-10 w-full my-1
      `}
    >
      <div 
        className={`
          max-w-[85%] md:max-w-[75%] lg:max-w-[60%] 
          rounded-sm p-3 text-sm font-mono relative shadow-md
          min-w-0 break-all overflow-hidden
          ${msg.isSystem 
            ? 'w-full text-center border-none bg-transparent text-xmr-dim text-xs shadow-none' 
            : isMe 
              ? 'bg-xmr-green/10 border-r-2 border-xmr-green/40 text-xmr-green' 
              : 'bg-xmr-border/40 border-l-2 border-zinc-700 text-xmr-dim'
          }
        `}
      >
        {msg.sender === 'partner' && !msg.isSystem && (
          <div className="text-[9px] text-xmr-accent mb-1 flex items-center gap-1 opacity-70">
            <Volume2 size={8} /> INCOMING
          </div>
        )}

        <div className="whitespace-pre-wrap leading-relaxed text-left text-xmr-green">
          {parseSmartMessage(msg.text)} 
        </div>
      </div>

      {isMe && msg.payload && (
        <button
          onClick={handleCopyPayload}
          className="ml-2 p-1.5 text-xmr-dim hover:text-xmr-green transition-colors shrink-0"
          title="Copy encrypted payload"
        >
          <Copy size={14} />
        </button>
      )}
    </motion.div>
  );
};
