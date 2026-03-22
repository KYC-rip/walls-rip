/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowRightLeft, QrCode, Share2, ExternalLink, FileWarning, EyeOff, Flame } from 'lucide-react';

const CardBase = ({ children, onClick, colorClass, bgClass }: any) => (
  <div 
    onClick={onClick}
    className={`
      my-3 p-0 rounded-sm bg-zinc-900/90 border-l-4 ${colorClass} ${bgClass}
      cursor-pointer group hover:translate-x-1 transition-all duration-200
      flex items-stretch max-w-sm select-none relative overflow-hidden shadow-lg
    `}
  >
    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 0, transparent 50%)', backgroundSize: '10px 10px' }}></div>
    {children}
  </div>
);

export const InvoiceCard = ({ params }: { params: URLSearchParams }) => {
  const amount = params.get('amount') || '---';
  const currency = params.get('currency') || 'XMR';

  return (
    <CardBase colorClass="border-orange-500" bgClass="hover:bg-orange-950/20">
      <div className="w-12 bg-orange-500/10 flex items-center justify-center text-orange-500">
        <QrCode size={20} strokeWidth={1.5} />
      </div>
      <div className="flex-1 p-3 min-w-0 flex flex-col justify-center">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-orange-500/80 font-bold tracking-widest">PAYMENT REQUEST</span>
          <ExternalLink size={12} className="text-zinc-600 group-hover:text-orange-400" />
        </div>
        <div className="text-lg font-mono font-bold text-white mt-0.5 truncate">
          {amount} <span className="text-sm text-zinc-500">{currency}</span>
        </div>
      </div>
    </CardBase>
  );
};

export const SwapCard = ({ params }: { params: URLSearchParams }) => {
  const from = params.get('from') || 'BTC';
  const to = params.get('to') || 'XMR';

  return (
    <CardBase colorClass="border-xmr-green" bgClass="hover:bg-green-950/20">
      <div className="w-12 bg-xmr-green/10 flex items-center justify-center text-xmr-green">
        <ArrowRightLeft size={20} strokeWidth={1.5} />
      </div>
      <div className="flex-1 p-3 min-w-0 flex flex-col justify-center">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-xmr-green/80 font-bold tracking-widest">SWAP ORDER</span>
          <ExternalLink size={12} className="text-zinc-600 group-hover:text-xmr-green" />
        </div>
        <div className="text-sm font-mono text-white mt-1 truncate">
          <span className="font-bold">{from}</span>
          <span className="mx-2 text-zinc-600">→</span>
          <span className="font-bold">{to}</span>
        </div>
      </div>
    </CardBase>
  );
};

export const DispenserCard = () => {
  return (
    <CardBase colorClass="border-cyan-500" bgClass="hover:bg-cyan-950/20">
      <div className="w-12 bg-cyan-500/10 flex items-center justify-center text-cyan-400">
        <Share2 size={20} strokeWidth={1.5} />
      </div>
      <div className="flex-1 p-3 min-w-0 flex flex-col justify-center">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-cyan-500/80 font-bold tracking-widest">BATCH DISPENSER</span>
          <ExternalLink size={12} className="text-zinc-600 group-hover:text-cyan-400" />
        </div>
        <div className="text-xs text-zinc-400 mt-1 truncate group-hover:text-zinc-300">
          View Batch Details &rarr;
        </div>
      </div>
    </CardBase>
  );
};

export const DeadDropCard = ({ params }: { params: URLSearchParams }) => {
  const secret = params.get('secret');
  const hasContent = secret && secret.length > 0;

  return (
    <CardBase colorClass="border-rose-600" bgClass="hover:bg-rose-950/20">
      <div className={`w-12 flex items-center justify-center ${hasContent ? 'text-rose-500 bg-rose-500/10' : 'text-zinc-500 bg-zinc-800'}`}>
        {hasContent ? <Flame size={20} className="animate-pulse" /> : <EyeOff size={20} />}
      </div>
      <div className="flex-1 p-3 min-w-0 flex flex-col justify-center">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-rose-500 font-bold tracking-[0.2em]">
            {hasContent ? 'CLASSIFIED // BURN' : 'DEAD DROP TOOL'}
          </span>
          {hasContent && <FileWarning size={12} className="text-rose-600" />}
        </div>
        
        <div className="text-xs font-mono text-white mt-1 truncate opacity-90">
          {hasContent 
            ? 'Encrypted payload attached.' 
            : 'Create a self-destructing note.'}
        </div>
        
        {hasContent && (
           <div className="text-[9px] text-rose-400/70 mt-1">
             ⚠️ Viewing this will destroy it.
           </div>
        )}
      </div>
    </CardBase>
  );
};
