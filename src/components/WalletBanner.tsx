import { Wallet, Key, RefreshCw, X, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface WalletBannerProps {
  token: string | null;
  balance: number;
  helper: string;
  onDeposit?: () => void;
  restoreOpen: boolean;
  setRestoreOpen: (open: boolean) => void;
  restoreToken: string;
  setRestoreToken: (value: string) => void;
  onRestore: () => void;
  restoring?: boolean;
}

/**
 * One wallet banner for every page that spends the shared `walls_sms_wallet`
 * balance. The parent owns the wallet state; this component owns only the
 * restore-input UI so the markup and spacing cannot drift between pages.
 */
export function WalletBanner({
  token, balance, helper, onDeposit,
  restoreOpen, setRestoreOpen, restoreToken, setRestoreToken, onRestore, restoring,
}: WalletBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-border rounded-sm relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-wr-accent" />
      <div className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 bg-wr-accent/10 text-wr-accent rounded-sm border border-wr-accent/20 shrink-0">
            <Wallet size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.16em] flex flex-wrap items-center gap-2 mb-1">
              {token ? (
                <>
                  {t('sms.wallet_balance')}
                  <span className="bg-wr-accent px-1.5 py-0.5 text-[10px] text-black rounded-sm tabular-nums">${balance.toFixed(2)}</span>
                </>
              ) : (
                <>
                  {t('sms.anonymous_wallet')}
                  <span className="bg-wr-info/20 border border-wr-info/40 text-wr-info px-1.5 py-0.5 text-[10px] rounded-sm">{t('sms.new')}</span>
                </>
              )}
            </h3>
            <p className="text-[11px] text-wr-dim font-mono leading-relaxed max-w-lg">{helper}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
          {!token && !restoreOpen && (
            <button
              onClick={() => setRestoreOpen(true)}
              className="min-h-11 flex-1 md:flex-none px-4 py-2.5 border border-wr-secondary/40 text-wr-secondary text-[11px] font-mono font-bold uppercase tracking-[0.16em] rounded-sm hover:bg-wr-secondary/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <Key size={12} /> {t('sms.restore_wallet')}
            </button>
          )}
          {onDeposit && (
            <button
              onClick={onDeposit}
              className="min-h-11 flex-1 md:flex-none px-5 py-2.5 bg-wr-accent text-black text-[11px] font-mono font-bold uppercase tracking-[0.16em] rounded-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
            >
              <Plus size={13} /> {t('sms.deposit')}
            </button>
          )}
        </div>
      </div>

      {!token && restoreOpen && (
        <div className="border-t border-wr-border/30 px-4 md:px-6 py-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="password"
              autoComplete="off"
              value={restoreToken}
              onChange={(e) => setRestoreToken(e.target.value)}
              placeholder={t('sms.paste_token')}
              aria-label={t('sms.restore_wallet')}
              className="min-h-11 flex-1 bg-wr-base border border-wr-border px-3 py-2 text-base md:text-xs font-mono outline-none focus:border-wr-accent rounded-sm text-current placeholder-wr-dim/30"
              onKeyDown={(e) => e.key === 'Enter' && onRestore()}
            />
            <button
              onClick={onRestore}
              disabled={restoring || !restoreToken.trim()}
              className="min-h-11 px-4 py-2 bg-wr-accent/15 border border-wr-accent/30 text-wr-accent text-[11px] font-bold uppercase tracking-[0.16em] hover:bg-wr-accent/25 transition-colors rounded-sm disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {restoring ? <RefreshCw size={12} className="animate-spin" /> : t('sms.restore')}
            </button>
            <button
              onClick={() => { setRestoreOpen(false); setRestoreToken(''); }}
              aria-label={t('common.close', 'Close')}
              className="min-h-11 min-w-11 flex items-center justify-center text-wr-dim hover:text-current"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
