import { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Wallet, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiClient } from '../services/client';

interface PwaInvoice {
  method: 'PWACASH';
  address: string;
  paymentId: string;
  amount: number;
  usd: number;
  paymentUrl?: string;
  walletToken?: string;
  fake?: boolean;
  expiresAt?: number;
}

interface PwaCashGateProps {
  isOpen: boolean;
  onClose: () => void;
  initialAmount?: number;
  walletToken?: string | null;
  onWalletCreated?: (token: string) => void;
  onDeposit?: (usd: number, method: string, walletToken?: string) => void;
}

const PRESETS = [3, 5, 10, 20];

/**
 * pwa.cash deposit gate. Creates a merchant invoice, sends the user to the
 * pwa.cash checkout, and polls our deposit status until the wallet is credited.
 * `PWACASH_FAKE=1` on the API lets the flow be tested locally without money.
 */
export function PwaCashGate({
  isOpen, onClose, initialAmount = 5, walletToken, onWalletCreated, onDeposit,
}: PwaCashGateProps) {
  const [amount, setAmount] = useState(initialAmount);
  const [invoice, setInvoice] = useState<PwaInvoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'done' | 'error'>('idle');
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setInvoice(null);
      setStatus('idle');
      setBusy(false);
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [isOpen]);

  const create = async () => {
    if (busy || amount < 0.05) return;
    setBusy(true);
    try {
      const inv = await apiClient<PwaInvoice>('/v1/tools/sms/payment/create', {
        method: 'POST',
        body: {
          amount,
          method: 'PWACASH',
          ...(walletToken ? { walletToken } : {}),
        },
      });
      setInvoice(inv);
      setStatus('waiting');
      if (inv.walletToken && !walletToken) onWalletCreated?.(inv.walletToken);
      if (!inv.fake && inv.paymentUrl) window.open(inv.paymentUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      const msg = (e as { data?: { error?: string }; message?: string })?.data?.error
        || (e as { message?: string })?.message
        || 'Could not create a pwa.cash invoice';
      toast.error(msg);
      setStatus('error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!invoice || status !== 'waiting') return;
    const poll = async () => {
      try {
        const r = await apiClient<{ status: string; walletToken?: string; balanceUSD?: number }>(
          `/v1/tools/sms/payment/check?paymentId=${encodeURIComponent(invoice.paymentId)}`
        );
        if (r.status === 'COMPLETED') {
          setStatus('done');
          onWalletCreated?.(r.walletToken || invoice.walletToken || '');
          onDeposit?.(invoice.usd, 'PWACASH', r.walletToken || invoice.walletToken);
          toast.success('Deposit credited');
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch { /* keep polling */ }
    };
    void poll();
    pollRef.current = window.setInterval(poll, 2000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [invoice, status, onDeposit, onWalletCreated]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md border border-wr-border bg-wr-base rounded-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-wr-border px-5 py-4">
          <div className="flex items-center gap-2 text-[11px] font-mono font-bold uppercase tracking-[0.16em] text-wr-accent">
            <Wallet size={14} /> pwa.cash deposit
          </div>
          <button onClick={onClose} className="p-2 text-wr-dim hover:text-current" aria-label="Close"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="text-[11px] text-wr-dim leading-relaxed">
            Pay with XMR, Lightning, USDT or USDC through pwa.cash. The balance is credited after the payment confirms.
          </div>

          {!invoice ? (
            <>
              <div className="grid grid-cols-4 gap-2">
                {PRESETS.map(p => (
                  <button key={p} onClick={() => setAmount(p)}
                    className={`min-h-11 rounded-sm border text-[11px] font-mono font-bold ${amount === p ? 'border-wr-accent text-wr-accent bg-wr-accent/10' : 'border-wr-border text-wr-dim hover:border-wr-accent/40'}`}>
                    ${p}
                  </button>
                ))}
              </div>
              <label className="block text-[11px] font-mono uppercase tracking-[0.16em] text-wr-dim">
                Amount (USD)
                <input
                  type="number" min={0.05} max={100} step="0.01" value={amount}
                  onChange={e => setAmount(Number(e.target.value))}
                  className="mt-2 min-h-11 w-full rounded-sm border border-wr-border bg-wr-surface px-3 font-mono text-base text-current outline-none focus:border-wr-accent"
                />
              </label>
              <button onClick={create} disabled={busy || amount < 0.05 || amount > 100}
                className="min-h-12 w-full rounded-sm bg-wr-accent px-5 text-[11px] font-mono font-bold uppercase tracking-[0.16em] text-black disabled:opacity-40">
                {busy ? 'CREATING INVOICE…' : `PAY $${amount.toFixed(2)} WITH PWA.CASH`}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-sm border border-wr-border bg-wr-surface p-4 space-y-2 text-[11px] font-mono">
                <div className="flex justify-between"><span className="text-wr-dim">INVOICE</span><span>{invoice.paymentId}</span></div>
                <div className="flex justify-between"><span className="text-wr-dim">AMOUNT</span><span>${invoice.usd.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-wr-dim">STATUS</span>
                  <span className={status === 'done' ? 'text-wr-accent' : 'text-wr-info'}>
                    {status === 'done' ? 'CREDITED' : invoice.fake ? 'SIMULATED PAYMENT' : 'WAITING FOR PAYMENT'}
                  </span>
                </div>
              </div>
              {!invoice.fake && invoice.paymentUrl && (
                <a href={invoice.paymentUrl} target="_blank" rel="noopener noreferrer"
                  className="min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-sm border border-wr-info/40 text-wr-info text-[11px] font-mono font-bold uppercase tracking-[0.16em]">
                  <ExternalLink size={13} /> OPEN PWA.CASH CHECKOUT
                </a>
              )}
              {status === 'waiting' && (
                <div className="flex items-center gap-2 text-[11px] font-mono text-wr-dim">
                  <RefreshCw size={12} className="animate-spin" />
                  {invoice.fake ? 'Simulating confirmation (5s)…' : 'Waiting for the processor…'}
                </div>
              )}
              {status === 'done' && (
                <button onClick={onClose} className="min-h-11 w-full rounded-sm bg-wr-accent text-black text-[11px] font-mono font-bold uppercase tracking-[0.16em]">
                  DONE
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
