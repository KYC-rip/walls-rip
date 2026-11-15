import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { PwaCashGate } from '../components/PwaCashGate';
import { apiClient } from '../services/client';

const WALLET_KEY = 'walls_sms_wallet';

/**
 * Local/QA page for the pwa.cash deposit flow. Not linked from navigation.
 * With `PWACASH_FAKE=1` on the API, the invoice confirms after 5 seconds.
 */
export default function PwaPayTest() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(WALLET_KEY));
  const [balance, setBalance] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const load = (t: string | null) => {
    if (!t) { setBalance(null); return; }
    apiClient<{ balanceUSD: number }>(`/v1/tools/sms/balance?token=${encodeURIComponent(t)}`)
      .then(d => setBalance(d.balanceUSD))
      .catch(() => { localStorage.removeItem(WALLET_KEY); setToken(null); setBalance(null); });
  };

  useEffect(() => { load(token); }, [token]);

  return (
    <div className="flex min-h-screen flex-col items-center font-mono">
      <Header />
      <main className="w-full max-w-2xl px-4 py-12 space-y-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-wr-dim">QA / payments</div>
          <h1 className="mt-2 font-display text-3xl md:text-4xl font-black tracking-tight">pwa.cash deposit test</h1>
          <p className="mt-3 text-sm text-wr-dim leading-relaxed">
            Creates a pwa.cash invoice through the Walls API, then credits this wallet on confirmation.
            Set <code className="text-wr-info">PWACASH_FAKE=1</code> in <code>api/.dev.vars</code> to test locally without money.
          </p>
        </div>

        <div className="rounded-sm border border-wr-border bg-wr-surface p-5 space-y-3">
          <div className="flex justify-between text-[11px] font-mono uppercase tracking-[0.16em]">
            <span className="text-wr-dim">Wallet token</span>
            <span className="truncate max-w-[60%]">{token ? `${token.slice(0, 12)}…` : '—'}</span>
          </div>
          <div className="flex justify-between text-[11px] font-mono uppercase tracking-[0.16em]">
            <span className="text-wr-dim">Balance</span>
            <span className="text-wr-accent font-bold">{balance == null ? '—' : `$${balance.toFixed(2)}`}</span>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="min-h-12 w-full rounded-sm bg-wr-accent px-5 text-[11px] font-mono font-bold uppercase tracking-[0.16em] text-black"
          >
            Deposit with pwa.cash
          </button>
        </div>

        <PwaCashGate
          isOpen={open}
          onClose={() => { setOpen(false); load(token); }}
          initialAmount={5}
          walletToken={token}
          onWalletCreated={(t) => {
            localStorage.setItem(WALLET_KEY, t);
            setToken(t);
          }}
          onDeposit={() => { setTimeout(() => load(localStorage.getItem(WALLET_KEY)), 300); }}
        />
      </main>
      <Footer />
    </div>
  );
}
