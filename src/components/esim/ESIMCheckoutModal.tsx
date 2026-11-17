import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock, Copy, Database, DollarSign, Globe, MapPin, RefreshCw, Shield, Smartphone, Wallet, Wifi, X, Zap } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { PaymentGate } from '../PaymentGate';
import { formatDataGB } from '../../utils/format';

/** Shared with ESIMWall / DestinationPage — the prepaid wallet token key. */
export const ESIM_WALLET_KEY = 'walls_sms_wallet';

export interface ESIMCoverageEntry {
  country: string;
  operators: { name: string; networkType: string }[];
}

export interface ESIMCheckoutPlan {
  id: string;
  name: string;
  country: string;
  dataGB: number;
  durationDays: number;
  price: number;
  currency?: string;
  engine: string;
  coverage?: ESIMCoverageEntry[];
}

export interface ESIMCheckoutResult {
  orderId: string;
  qrCode?: string;
  activationUrl?: string;
  charged?: number;
  balanceUSD?: number;
}

interface ESIMCheckoutModalProps {
  plan: ESIMCheckoutPlan;
  /** Human-readable destination (country name, 'Global', or a region label). */
  locationLabel: string;
  /** Short badge in the header; defaults to the plan's 2-letter country code. */
  badgeLabel?: string;
  walletToken: string | null;
  balanceUSD: number;
  onClose: () => void;
  onWalletCreated: (token: string) => void;
  /** Deposit confirmed; the caller refreshes the wallet balance. */
  onDeposit: (usd: number) => Promise<void> | void;
  /** Authoritative purchase call. Must resolve only after the provider accepted.
   *  `clientRef` is stable for this checkout (retries reuse it) so a held or
   *  double-submitted purchase cannot become a second provider order. */
  purchase: (token: string, clientRef: string) => Promise<ESIMCheckoutResult>;
  /**
   * `modal` (default) is the overlay used by /esim. `inline` renders the same
   * panel without the overlay so a destination page can pin it in its sticky
   * rail — one purchase path, two placements.
   */
  variant?: 'modal' | 'inline';
}

/**
 * The plan-detail + wallet + payment modal, shared by /esim and the public
 * destination pages so there is exactly one purchase path.
 *
 * White-label note: the destination page receives no plan ids; it resolves the
 * clicked plan through `/esim/compare` immediately before opening this modal.
 */
export function ESIMCheckoutModal({
  plan,
  locationLabel,
  badgeLabel,
  walletToken,
  balanceUSD,
  onClose,
  onWalletCreated,
  onDeposit,
  purchase,
  variant = 'modal',
}: ESIMCheckoutModalProps) {
  const inline = variant === 'inline';
  const { t } = useTranslation();
  const [step, setStep] = useState<'details' | 'purchasing' | 'success' | 'error'>('details');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ESIMCheckoutResult | null>(null);
  const [copied, setCopied] = useState(false);
  // Inline (rail) checkouts ask the buyer to confirm eSIM readiness first, the
  // way the reference storefront does. The modal keeps its single-click flow.
  const [deviceReady, setDeviceReady] = useState(false);
  useEffect(() => { setDeviceReady(false); }, [plan.id]);
  // One purchase at a time. PaymentGate polls every 3s (a slow check can
  // overlap) and a double-click can land before the re-render; both used to
  // reach the purchase endpoint twice on a balance that covers two plans.
  const busyRef = useRef(false);
  // One capability per checkout. A retry of the same plan reuses it; picking a
  // different plan starts a new one. The ref lives in this modal on purpose:
  // the modal unmounts per checkout, so close/reopen is a fresh capability.
  const clientRef = useRef<string>(crypto.randomUUID());
  useEffect(() => { clientRef.current = crypto.randomUUID(); }, [plan.id]);

  const hasSufficientBalance = walletToken !== null && balanceUSD >= plan.price;
  const modalMaxW = step === 'details' ? 'max-w-lg' : 'max-w-xl';

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** Caller must hold busyRef; releases it in `finally`. */
  const purchaseOnce = useCallback(async (token: string) => {
    setStep('purchasing');
    try {
      const next = await purchase(token, clientRef.current);
      setResult(next);
      setStep('success');
    } catch (e: unknown) {
      setStep('error');
      setError((e as Error)?.message || t('esim.purchase_failed', 'Purchase failed'));
    }
  }, [purchase, t]);

  const runPurchase = async (token: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await purchaseOnce(token);
    } finally {
      busyRef.current = false;
    }
  };

  const buyWithBalance = (token: string) => { void runPurchase(token); };

  const handleDeposit = useCallback(async (usd: number) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await onDeposit(usd);
      const token = walletToken || localStorage.getItem(ESIM_WALLET_KEY);
      if (!token) {
        setStep('error');
        setError(t('esim.wallet_missing', 'Payment confirmed but no wallet was found. Contact support with your payment id.'));
        return;
      }
      await purchaseOnce(token);
    } catch (e: unknown) {
      setStep('error');
      setError((e as Error)?.message || t('esim.purchase_failed', 'Purchase failed'));
    } finally {
      busyRef.current = false;
    }
  }, [onDeposit, purchaseOnce, walletToken, t]);

  const card = (
      <div className={`border border-wr-border bg-wr-base ${inline ? 'w-full' : `${modalMaxW} shadow-[0_0_50px_rgba(0,0,0,0.3)] max-h-[90vh] overflow-y-auto`} relative overflow-hidden rounded-sm transition-all duration-300`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`border-b border-wr-border/30 flex items-start justify-between gap-3 ${inline ? 'p-4' : 'p-4 md:p-6'}`}>
          <div className="min-w-0">
            {/* Provider names for multi-country plans are long country-code
                lists; show the buyable summary and keep the raw name as a
                tooltip. */}
            <h3
              title={plan.name}
              className="truncate text-sm md:text-base font-bold text-current tracking-wide leading-tight"
            >
              {`${locationLabel} · ${formatDataGB(plan.dataGB)} / ${plan.durationDays}d`}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="shrink-0 text-xs px-2.5 py-1 rounded border border-wr-accent/30 text-wr-accent bg-wr-accent/10 font-mono uppercase tracking-wider">
              {badgeLabel ?? (/^[A-Z]{2}$/.test(plan.country) ? plan.country : plan.country === 'GLOBAL' ? 'Global' : 'Regional')}
            </span>
            <button onClick={onClose} aria-label={t('common.close', 'Close')} className="shrink-0 text-wr-dim hover:text-current transition-colors"><X size={18} /></button>
          </div>
        </div>

        <div className={inline ? 'flex flex-col gap-4 p-4' : 'p-4 md:p-6 space-y-5'}>

          {/* ═══ STEP: DETAILS ═══ */}
          {step === 'details' && (
            <>
              <div>
                <h4 className="text-xs font-bold uppercase text-wr-dim tracking-widest mb-3">{t('esim.detail_plan_details')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-sm border border-wr-border/50 bg-wr-surface/30 flex items-center gap-3">
                    <div className="p-2 bg-wr-accent/10 text-wr-accent rounded-sm border border-wr-accent/20"><Database size={14} /></div>
                    <div>
                      <div className="text-[11px] text-wr-dim uppercase tracking-widest">{t('esim.detail_data')}</div>
                      <div className="text-sm font-black font-mono text-current">{formatDataGB(plan.dataGB)}</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-sm border border-wr-border/50 bg-wr-surface/30 flex items-center gap-3">
                    <div className="p-2 bg-wr-accent/10 text-wr-accent rounded-sm border border-wr-accent/20"><Clock size={14} /></div>
                    <div>
                      <div className="text-[11px] text-wr-dim uppercase tracking-widest">{t('esim.detail_duration')}</div>
                      <div className="text-sm font-black font-mono text-current">{plan.durationDays} {t('esim.detail_days')}</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-sm border border-wr-border/50 bg-wr-surface/30 flex items-center gap-3">
                    <div className="p-2 bg-wr-accent/10 text-wr-accent rounded-sm border border-wr-accent/20"><Zap size={14} /></div>
                    <div>
                      <div className="text-[11px] text-wr-dim uppercase tracking-widest">{t('esim.detail_speed')}</div>
                      <div className="text-sm font-black font-mono text-current">3G/4G/5G</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-sm border border-wr-accent/30 bg-wr-accent/5 p-3">
                    <div className="rounded-sm border border-wr-accent/20 bg-wr-accent/10 p-2 text-wr-accent"><DollarSign size={14} /></div>
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-wr-dim">{t('esim.detail_price')}</div>
                      <div className="font-mono text-sm font-black tabular-nums text-wr-accent">${plan.price.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-wr-dim tracking-widest mb-3">{t('esim.detail_additional_info')}</h4>
                <div className="grid grid-cols-1 gap-x-6 gap-y-0 text-xs sm:grid-cols-2">
                  <div className="flex items-center justify-between py-2 border-b border-wr-border/20">
                    <span className="text-wr-dim flex items-center gap-1.5 shrink-0"><MapPin size={10} /> {t('esim.detail_location')}</span>
                    <span className="font-mono text-current text-right truncate ml-2">{locationLabel}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-wr-border/20">
                    <span className="text-wr-dim shrink-0">{t('esim.detail_topup')}</span>
                    <span className="font-mono text-wr-dim">--</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-wr-border/20">
                    <span className="text-wr-dim shrink-0">{t('esim.detail_activation')}</span>
                    <span className="font-mono text-current text-right">{t('esim.detail_first_install')}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-wr-border/20">
                    <span className="text-wr-dim flex items-center gap-1.5 shrink-0"><Shield size={10} /> {t('esim.detail_ip_location')}</span>
                    <span className="flex items-center gap-1 ml-2">
                      <span className="font-mono text-wr-accent text-right truncate">{plan.country}</span>
                      <span className="whitespace-nowrap rounded-full border border-wr-info/30 bg-wr-info/10 px-1.5 py-0.5 text-[11px] text-wr-info">{t('esim.detail_standard_privacy')}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-wr-border/20">
                    <span className="text-wr-dim flex items-center gap-1.5 shrink-0"><Wifi size={10} /> {t('esim.detail_hotspot')}</span>
                    <span className="font-mono text-current">{t('common.yes')}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-sm bg-wr-surface/30 border border-wr-border/30">
                <Globe size={14} className="text-wr-accent shrink-0" />
                <div>
                  <div className="text-[11px] text-wr-dim uppercase tracking-widest">{t('esim.detail_coverage')}</div>
                  <div className="text-xs font-mono text-current">{locationLabel}</div>
                </div>
              </div>

              {plan.coverage && plan.coverage.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase text-wr-dim tracking-widest">
                    {t('esim.detail_coverage')} ({plan.coverage.length} {t('esim.detail_countries')})
                  </h4>
                  {/* Inline panels grow with the page (no second scrollbar); the
                      modal keeps its capped list. Long operator strings wrap
                      instead of running past the panel edge. */}
                  <div className={`space-y-1 rounded-sm border border-wr-border/30 bg-wr-base/50 p-2 ${inline ? '' : 'max-h-40 overflow-y-auto'}`}>
                    {plan.coverage.map((c, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 border-b border-wr-border/10 py-0.5 text-xs last:border-0">
                        <span className="shrink-0 font-medium text-current">{c.country}</span>
                        <span className="min-w-0 break-words text-right text-wr-dim">
                          {c.operators.length > 0 ? c.operators.map(o => `${o.name} (${o.networkType})`).join(', ') : '--'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase text-wr-dim tracking-widest">{t('esim.detail_important_notices')}</h4>
                <ul className="space-y-1">
                  <li className="text-xs text-wr-dim/70 flex items-start gap-1.5">
                    <AlertTriangle size={10} className="mt-0.5 shrink-0 text-wr-warning" />
                    {t('esim.detail_notice_data_only')}
                  </li>
                  <li className="text-xs text-wr-dim/70 flex items-start gap-1.5">
                    <AlertTriangle size={10} className="mt-0.5 shrink-0 text-wr-warning" />
                    {t('esim.detail_notice_no_refund')}
                  </li>
                  {plan.engine === 'buyukesim' && <li className="text-xs text-wr-dim/70 flex items-start gap-1.5">
                    <AlertTriangle size={10} className="mt-0.5 shrink-0 text-wr-warning" />
                    {t('esim.detail_notice_buyuk_refund')}
                  </li>}
                  <li className="text-xs text-wr-dim/70 flex items-start gap-1.5">
                    <AlertTriangle size={10} className="mt-0.5 shrink-0 text-wr-warning" />
                    {t('esim.detail_notice_compatibility')}
                  </li>
                </ul>
              </div>

              {/* Balance + confirm stay pinned at the bottom of the panel so the
                  primary action is always visible while the details scroll. */}
              <div className={inline ? 'sticky bottom-0 z-10 -mx-4 md:-mx-6 border-t border-wr-border bg-wr-base px-4 pb-3 pt-3 md:px-6' : ''}>
                {walletToken && (
                  <div className={`flex items-center gap-2 text-xs ${inline ? '' : 'border-t border-wr-border/30 pt-4'}`}>
                    <Wallet size={12} className="text-wr-accent" />
                    <span className="text-wr-dim">{t('sms.wallet_balance')}:</span>
                    <span className={`font-mono font-bold tabular-nums ${hasSufficientBalance ? 'text-wr-accent' : 'text-wr-warning'}`}>
                      ${balanceUSD.toFixed(2)}
                    </span>
                    {hasSufficientBalance && (
                      <span className="rounded-full border border-wr-accent/20 bg-wr-accent/10 px-1.5 py-0.5 text-[10px] text-wr-accent">
                        {t('esim.sufficient_balance', 'Sufficient')}
                      </span>
                    )}
                  </div>
                )}

                {hasSufficientBalance && (
                  <>
                    {inline && (
                      <div className="pt-2">
                        <label className="flex items-start gap-2 text-xs text-wr-dim">
                          <input
                            type="checkbox"
                            checked={deviceReady}
                            onChange={e => setDeviceReady(e.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-[color:var(--accent)]"
                          />
                          <span>{t('esim.device_ready_check', 'I have checked that my phone supports eSIM and is carrier-unlocked.')}</span>
                        </label>
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-[11px] font-mono uppercase tracking-widest text-wr-accent">
                            {t('esim.check_compatibility', 'Check device compatibility')}
                          </summary>
                          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-wr-dim">
                            <li>{t('esim.compat_1', 'The phone must have eSIM support (iPhone XS or newer, most recent Android flagships).')}</li>
                            <li>{t('esim.compat_2', 'It must be carrier-unlocked and not tied to another eSIM profile.')}</li>
                            <li>{t('esim.compat_3', 'An eSIM profile can only be installed on one device, once.')}</li>
                          </ul>
                        </details>
                      </div>
                    )}
                    <div className={`flex items-center gap-3 pt-2 ${inline ? '' : 'border-t border-wr-border/30'}`}>
                      <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-xs text-wr-dim hover:text-current transition-colors uppercase tracking-widest"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={() => buyWithBalance(walletToken)}
                        disabled={inline && !deviceReady}
                        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm bg-wr-accent py-3 text-xs font-black uppercase tracking-widest text-black transition-colors hover:bg-wr-accent/90 disabled:cursor-not-allowed disabled:bg-wr-accent/40 disabled:text-black/60"
                      >
                        <Check size={14} /> {t('esim.detail_confirm_purchase')}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {!hasSufficientBalance && (
                <div className="border-t border-wr-border/30 pt-4">
                  <PaymentGate
                    amount={plan.price}
                    methods={['XMR', 'LN', 'XMR402', 'USDT']}
                    walletToken={walletToken || undefined}
                    serviceName="esim"
                    createEndpoint="/v1/tools/esim/payment/create"
                    checkEndpoint="/v1/tools/sms/payment/check"
                    inline={true}
                    onWalletCreated={onWalletCreated}
                    onDeposit={handleDeposit}
                  />
                  <div className="text-xs text-wr-accent/60 text-center mt-3">
                    {t('esim.auto_purchase_esim', 'eSIM will be purchased automatically after payment')}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ STEP: PURCHASING ═══ */}
          {step === 'purchasing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-sm border border-wr-accent/30 bg-wr-accent/10">
                  <Smartphone size={28} className="animate-pulse text-wr-accent" />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-wr-info/30 bg-wr-info/20">
                  <RefreshCw size={12} className="animate-spin text-wr-info" />
                </div>
              </div>
              <p className="text-sm font-bold uppercase tracking-wider text-wr-accent">{t('esim.payment_confirmed', 'Payment confirmed!')}</p>
              <p className="text-xs text-wr-dim">{t('esim.purchasing_plan', 'Purchasing your eSIM plan...')}</p>
            </div>
          )}

          {/* ═══ STEP: SUCCESS ═══ */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-sm border border-wr-accent/30 bg-wr-accent/10">
                <Check size={32} className="text-wr-accent" />
              </div>
              <p className="text-sm font-bold uppercase tracking-wider text-wr-accent">{t('esim.esim_purchased', 'eSIM Purchased!')}</p>

              {result?.qrCode ? (
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-sm">
                    <QRCodeCanvas value={result.qrCode} size={200} level="M" bgColor="#ffffff" fgColor="#000000" />
                  </div>
                </div>
              ) : null}

              {result?.activationUrl && (
                <button
                  onClick={() => copyText(result.activationUrl!)}
                  className="flex w-full max-w-sm cursor-pointer items-center justify-between gap-2 rounded-sm border border-wr-border bg-wr-base p-3 text-left font-mono text-xs break-all text-wr-accent transition-colors hover:border-wr-accent/50"
                >
                  <span className="truncate">{result.activationUrl}</span>
                  {copied ? <Check size={14} className="shrink-0 text-wr-accent" /> : <Copy size={14} className="shrink-0 text-wr-dim" />}
                </button>
              )}

              {!result?.qrCode && !result?.activationUrl && (
                <p className="text-xs text-wr-dim text-center max-w-sm">
                  {t('esim.wallet_shared', 'Your wallet has been credited and the eSIM has been purchased.')}
                </p>
              )}

              {result?.balanceUSD != null && (
                <div className="flex items-center gap-2 text-xs">
                  <Wallet size={12} className="text-wr-accent" />
                  <span className="text-wr-dim">{t('sms.wallet_balance')}:</span>
                  <span className="font-mono font-bold tabular-nums text-wr-accent">${result.balanceUSD.toFixed(2)}</span>
                </div>
              )}

              <button
                onClick={onClose}
                className="min-h-11 rounded-sm bg-wr-accent px-8 py-3 text-xs font-black uppercase tracking-widest text-black transition-colors hover:bg-wr-accent/90"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          )}

          {/* ═══ STEP: ERROR ═══ */}
          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-sm border border-wr-error/30 bg-wr-error/10">
                <AlertTriangle size={28} className="text-wr-error" />
              </div>
              <p className="text-sm font-bold uppercase tracking-wider text-wr-error">{t('common.error', 'Error')}</p>
              <p className="text-xs text-wr-dim text-center max-w-sm">{error || t('esim.purchase_failed', 'Something went wrong. Please try again.')}</p>
              <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-accent hover:underline text-xs">
                Need help? @kyc_rip_bot
              </a>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs text-wr-dim hover:text-current transition-colors uppercase tracking-widest"
                >
                  {t('common.close', 'Close')}
                </button>
                <button
                  onClick={() => setStep('details')}
                  className="px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-sm bg-wr-accent text-black hover:bg-wr-accent/90 shadow-lg shadow-wr-accent/20 transition-all"
                >
                  {t('common.retry', 'Try Again')}
                </button>
              </div>
            </div>
          )}

        </div>
            </div>
  );

  if (inline) return card;

  return (
    <div
      className="fixed inset-0 bg-wr-base/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300"
      onClick={() => { if (step === 'details') onClose(); }}
    >
      {card}
    </div>
  );
}