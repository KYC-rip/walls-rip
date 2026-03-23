/* eslint-disable @typescript-eslint/no-explicit-any */
import { Terminal, CheckCircle, RefreshCw, X, Zap, ExternalLink } from 'lucide-react';
import { DepositAddress } from '../DepositAddress';
import { toast } from 'react-hot-toast';
import type { PaymentState, GhostMailSession } from '../../hooks/useGhostMail';

interface PaymentModalProps {
  paymentState: PaymentState;
  cancelPayment: () => void;
  customName: string;
  selectedDomain: string;
  login: (s: GhostMailSession) => void;
}

declare global {
  interface Window {
    webln?: any;
  }
}

export function PaymentModal({
  paymentState,
  cancelPayment,
  customName,
  selectedDomain,
  login: _,
}: PaymentModalProps) {
  if (paymentState.status === 'IDLE') return null;
  const data = paymentState.status === 'WAITING_PAYMENT' ? paymentState.data : null;
  const isCompleted = paymentState.status === 'COMPLETED';
  const isLN = data?.method === 'LN';

  const handleWebLN = async () => {
    if (typeof window.webln === 'undefined') {
      toast.error('WebLN not detected');
      return;
    }
    try {
      await window.webln.enable();
      await window.webln.sendPayment(data?.address);
      toast.success('Payment sent via WebLN');
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'WebLN payment failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-wr-base/90 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className={`border bg-wr-base p-0 max-w-lg w-full relative shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden rounded-sm ${isLN ? 'border-wr-accent' : 'border-wr-green'}`}>

        {/* Header */}
        <div className={`p-3 md:p-4 border-b flex items-center gap-2 animate-pulse ${isLN ? 'bg-wr-accent/10 border-wr-accent/30 text-wr-accent' : 'bg-wr-green/10 border-wr-green/30 text-wr-green'}`}>
          <Terminal size={14} />
          <span className="text-[10px] md:text-xs font-bold tracking-widest uppercase">
            {isCompleted ? 'UPLINK ESTABLISHED' : isLN ? 'LIGHTNING PAYMENT PENDING' : 'XMR PAYMENT PENDING'}
          </span>
        </div>

        <div className="p-4 md:p-8 text-center">
          {isCompleted ? (
            <div className="py-6 md:py-10 animate-in zoom-in duration-300">
              <CheckCircle className="w-16 h-16 md:w-20 md:h-20 text-wr-green mx-auto mb-6" />
              <h3 className="text-xl md:text-2xl text-wr-green font-bold tracking-widest mb-2">ACCESS GRANTED</h3>
              <p className="text-wr-dim text-sm">Redirecting to your inbox...</p>
            </div>
          ) : !data ? (
            <div className="py-10 space-y-4">
              <RefreshCw className="w-10 h-10 text-wr-green animate-spin mx-auto opacity-50" />
              <p className="text-wr-dim text-[10px] uppercase tracking-widest">GENERATING PAYMENT ADDRESS...</p>
            </div>
          ) : (
            <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div>
                <div className="text-wr-dim text-[10px] uppercase tracking-widest mb-1">TARGET ENDPOINT</div>
                <div className={`text-lg md:text-xl font-mono border-b border-wr-border inline-block pb-1 ${isLN ? 'text-wr-accent' : 'text-wr-green'}`}>
                  {customName}@{selectedDomain}
                </div>
              </div>

              <div className="scale-90 md:scale-100 origin-center">
                <DepositAddress
                  currency={isLN ? {
                    ticker: "btc",
                    name: "Bitcoin (Lightning)",
                    network: "Lightning",
                    image: "https://trocador.app/static/img/icons/btc.svg",
                  } : {
                    ticker: 'xmr',
                    name: 'Monero',
                    network: 'monero',
                    image: '/monero-xmr-logo.png',
                  }}
                  address={data.address}
                  amount={data.amount}
                  label={isLN ? 'Scan or paste BOLT11 invoice' : 'Send exact amount'}
                  actualNetwork={isLN ? "Bitcoin Lightning" : "Monero"}
                />
              </div>

              {isLN && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleWebLN}
                    className="flex items-center justify-center gap-2 bg-wr-accent/20 hover:bg-wr-accent/30 text-wr-accent py-3 px-4 rounded-xs border border-wr-accent/30 text-[10px] font-bold uppercase transition-all"
                  >
                    <Zap size={12} className="fill-current" /> PAY WITH ALBY
                  </button>
                  <a
                    href={`lightning:${data.address}`}
                    className="flex items-center justify-center gap-2 bg-wr-surface hover:bg-wr-surface/80 text-wr-dim py-3 px-4 rounded-xs border border-wr-border text-[10px] font-bold uppercase transition-all"
                  >
                    <ExternalLink size={12} /> EXTERNAL WALLET
                  </a>
                </div>
              )}

              <div className="text-[10px] text-wr-dim flex flex-col items-center gap-2 uppercase tracking-tighter">
                <div className="flex items-center gap-2">
                  <RefreshCw size={10} className="animate-spin" />
                  AWAITING PAYMENT CONFIRMATION...
                </div>
                {isLN && (
                  <p className="text-[8px] opacity-50 max-w-[280px] leading-tight">
                    * Lightning payments may take a few moments to route
                  </p>
                )}
              </div>

            </div>
          )}
        </div>

        <button onClick={cancelPayment} className="absolute top-4 right-4 text-wr-dim hover:text-wr-green z-10 transition-colors">
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
