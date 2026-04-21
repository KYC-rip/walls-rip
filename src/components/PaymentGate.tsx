/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wallet, Zap, Shield, X, RefreshCw, ExternalLink,
  Copy, CheckCircle2, Clock, DollarSign,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

// ── Types ────────────────────────────────────────────────────────────

type PaymentMethod = 'XMR' | 'LN' | 'XMR402' | 'USDT';
type UsdtChain = 'tron' | 'eth';

interface PaymentData {
  method: 'XMR' | 'LN' | 'USDT';
  address: string;
  paymentId: string;
  amount: number;
  usd: number;
  chain?: UsdtChain;
  paymentUrl?: string;
  walletToken?: string;
}

interface XMR402Challenge {
  address: string;
  amount: string;   // piconero
  message: string;  // nonce
  timestamp: string;
  callbackSig?: string;
  wref?: string;
}

export interface PaymentGateProps {
  /** Amount in USD */
  amount: number;
  /** Available payment methods */
  methods?: PaymentMethod[];
  /** Existing wallet token (for SMS/eSIM wallet mode) */
  walletToken?: string;
  /** API base URL */
  apiBase?: string;
  /** Called when payment is confirmed and wallet credited (wallet mode) */
  onDeposit?: (usdAmount: number, method: string, walletToken?: string) => void;
  /** Called immediately when wallet is created upfront (before payment confirms) — save token to localStorage */
  onWalletCreated?: (walletToken: string) => void;
  /** Called when direct payment is confirmed (Ghost Mail mode) */
  onPaymentConfirmed?: (data: {
    method: string;
    paymentId: string;
    address: string;
    amount: number;
    paymentUrl?: string;
    chain?: string;
  }) => void;
  /** Endpoint to create payment (default: /v1/tools/sms/payment/create) */
  createEndpoint?: string;
  /** Endpoint to check payment (default: /v1/tools/sms/payment/check) */
  checkEndpoint?: string;
  /** Whether to show deposit amount presets (wallet mode) */
  showPresets?: boolean;
  /** Custom deposit amounts */
  presets?: number[];
  /** Render as inline section (not modal) */
  inline?: boolean;
  /** Whether the gate is visible */
  isOpen?: boolean;
  /** Close handler (for modal mode) */
  onClose?: () => void;
  /** Service name for XMR402 callback routing ('sms' | 'esim' | 'mail') */
  serviceName?: string;
  /** Additional class */
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function piconeroToXMR(piconero: string): string {
  const val = BigInt(piconero);
  const whole = val / BigInt(1e12);
  const frac = val % BigInt(1e12);
  return `${whole}.${frac.toString().padStart(12, '0').replace(/0+$/, '') || '0'}`;
}

function parseWwwAuthenticate(header: string): Omit<XMR402Challenge, 'callbackSig' | 'wref'> | null {
  const match = header.match(
    /XMR402\s+address="([^"]+)",\s*amount="([^"]+)",\s*message="([^"]+)",\s*timestamp="([^"]+)"/
  );
  if (!match) return null;
  return { address: match[1], amount: match[2], message: match[3], timestamp: match[4] };
}

const METHOD_COLORS: Record<PaymentMethod, { border: string; bg: string; text: string; shadow: string }> = {
  XMR:    { border: 'border-wr-green',  bg: 'bg-wr-green/10',  text: 'text-wr-green',  shadow: 'shadow-[0_0_15px_rgba(0,255,65,0.1)]' },
  LN:     { border: 'border-wr-accent', bg: 'bg-wr-accent/10', text: 'text-wr-accent', shadow: 'shadow-[0_0_15px_rgba(34,211,238,0.1)]' },
  XMR402: { border: 'border-wr-error',  bg: 'bg-wr-error/10',  text: 'text-wr-error',  shadow: 'shadow-[0_0_15px_rgba(248,113,113,0.1)]' },
  USDT:   { border: 'border-[#26a17b]', bg: 'bg-[#26a17b]/10', text: 'text-[#26a17b]', shadow: 'shadow-[0_0_15px_rgba(38,161,123,0.1)]' },
};

const METHOD_BUTTON_COLORS: Record<PaymentMethod, { active: string; bg: string; text: string }> = {
  XMR:    { active: 'bg-wr-green text-black shadow-wr-green/20', bg: 'bg-wr-green', text: 'text-black' },
  LN:     { active: 'bg-wr-accent text-black shadow-wr-accent/20', bg: 'bg-wr-accent', text: 'text-black' },
  XMR402: { active: 'bg-wr-error text-white shadow-wr-error/20', bg: 'bg-wr-error', text: 'text-white' },
  USDT:   { active: 'bg-[#26a17b] text-white shadow-[#26a17b]/20', bg: 'bg-[#26a17b]', text: 'text-white' },
};

const DEFAULT_PRESETS = [3, 5, 10, 20];

// ── Countdown sub-component ─────────────────────────────────────────

function Xmr402Countdown({ timestamp, onExpired }: { timestamp: string; onExpired: () => void }) {
  const [remaining, setRemaining] = useState(300);
  useEffect(() => {
    const expiresAt = parseInt(timestamp, 10) + 300_000;
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) onExpired();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timestamp, onExpired]);

  return (
    <div className={`flex items-center justify-center gap-2 text-xs font-mono font-bold ${remaining <= 60 ? 'text-red-400 animate-pulse' : 'text-wr-dim'}`}>
      <Clock size={12} />
      {remaining > 0
        ? `${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')} remaining`
        : 'EXPIRED'}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function PaymentGate({
  amount,
  methods = ['XMR', 'LN', 'XMR402', 'USDT'],
  walletToken,
  apiBase: apiBaseProp,
  onDeposit,
  onWalletCreated,
  onPaymentConfirmed,
  createEndpoint = '/v1/tools/sms/payment/create',
  checkEndpoint = '/v1/tools/sms/payment/check',
  showPresets = false,
  presets = DEFAULT_PRESETS,
  inline = false,
  isOpen = true,
  onClose,
  serviceName = 'sms',
  className = '',
}: PaymentGateProps) {
  const { t } = useTranslation();
  const apiBase = apiBaseProp || import.meta.env.VITE_API_URL || 'https://api.kyc.rip';

  // ── State ─────────────────────────────────────────────────────────
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(methods[0] || 'XMR');
  const [usdtChain, setUsdtChain] = useState<UsdtChain>('tron');
  const [depositAmount, setDepositAmount] = useState<number>(amount);
  const [customAmount, setCustomAmount] = useState('');

  // Payment flow
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [polling, setPolling] = useState(false);
  const [creating, setCreating] = useState(false);

  // XMR402
  const [xmr402Challenge, setXmr402Challenge] = useState<XMR402Challenge | null>(null);
  const [xmr402Loading, setXmr402Loading] = useState(false);
  const [xmr402Copied, setXmr402Copied] = useState(false);

  // General copy
  const [copied, setCopied] = useState(false);

  // Refs for cleanup
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync depositAmount from parent when modal opens or parent's amount changes.
  // Previously gated on !showPresets, which caused stale $3 on SMS rental 28d/$27:
  // the modal locked internal state on first mount and ignored later prop updates.
  useEffect(() => {
    if (isOpen) setDepositAmount(amount);
  }, [isOpen, amount]);

  // ── Polling ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!polling || !paymentData) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}${checkEndpoint}?paymentId=${paymentData.paymentId}`);
        if (!res.ok) return;
        const result = await res.json() as { status: string; walletToken?: string; balanceUSD?: number };

        if (result.status === 'COMPLETED') {
          setPolling(false);
          clearInterval(interval);

          if (onDeposit) {
            onDeposit(paymentData.usd, paymentData.method, result.walletToken);
          }
          if (onPaymentConfirmed) {
            onPaymentConfirmed({
              method: paymentData.method,
              paymentId: paymentData.paymentId,
              address: paymentData.address,
              amount: paymentData.amount,
              paymentUrl: paymentData.paymentUrl,
              chain: paymentData.chain,
            });
          }

          toast.success(t('payment.confirmed', `$${paymentData.usd.toFixed(2)} payment confirmed!`));
          setPaymentData(null);
        } else if (result.status === 'EXPIRED') {
          setPolling(false);
          clearInterval(interval);
          setPaymentData(null);
          toast.error(t('payment.expired', 'Payment expired'));
        }
      } catch { /* keep polling */ }
    }, 3000);

    pollingRef.current = interval;
    return () => clearInterval(interval);
  }, [polling, paymentData, apiBase, checkEndpoint, onDeposit, onPaymentConfirmed, t]);

  // ── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ── Copy helper ───────────────────────────────────────────────────
  const copyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(t('common.copied', 'Copied!'));
    setTimeout(() => setCopied(false), 2000);
  }, [t]);

  const copyXmr402 = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setXmr402Copied(true);
    toast.success(t('common.copied', 'Copied!'));
    setTimeout(() => setXmr402Copied(false), 2000);
  }, [t]);

  // ── Create payment (XMR / LN / USDT) ─────────────────────────────
  const createPayment = async () => {
    const usdAmount = showPresets ? depositAmount : amount;
    if (usdAmount <= 0) return;

    // XMR402 gets its own flow
    if (selectedMethod === 'XMR402') {
      await handleXmr402();
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        amount: usdAmount,
        method: selectedMethod,
        walletToken,
      };
      if (selectedMethod === 'USDT') body.chain = usdtChain;

      const res = await fetch(`${apiBase}${createEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json() as PaymentData;
      setPaymentData(data);
      setPolling(true);

      // Save wallet token immediately so user doesn't lose it if browser closes
      if (data.walletToken && onWalletCreated) {
        onWalletCreated(data.walletToken);
      }

      // Auto-open USDT payment page
      if (data.method === 'USDT' && data.paymentUrl) {
        window.open(data.paymentUrl, '_blank');
      }
    } catch (e: any) {
      toast.error(e.message || t('payment.createFailed', 'Failed to create payment'));
    } finally {
      setCreating(false);
    }
  };

  // ── XMR402 flow ───────────────────────────────────────────────────
  const handleXmr402 = async () => {
    setXmr402Loading(true);
    try {
      const usdAmount = showPresets ? depositAmount : amount;
      // Request 402 challenge
      const res = await fetch(`${apiBase}/v1/tools/sms/deposit/xmr402`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: usdAmount }),
      });

      if (res.status === 402) {
        const wwwAuth = res.headers.get('WWW-Authenticate');
        const body402 = await res.json().catch(() => ({})) as { callback_sig?: string };

        if (!wwwAuth) {
          toast.error(t('payment.xmr402NoHeader', 'No WWW-Authenticate header'));
          return;
        }

        const parsed = parseWwwAuthenticate(wwwAuth);
        if (!parsed) {
          toast.error(t('payment.xmr402ParseFailed', 'Failed to parse XMR402 challenge'));
          return;
        }

        const challenge: XMR402Challenge = {
          ...parsed,
          callbackSig: body402.callback_sig || '',
        };

        // Get wallet ref for cross-browser callback
        if (walletToken) {
          try {
            const wrefRes = await fetch(`${apiBase}/v1/tools/xmr402/wref`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: walletToken }),
            });
            const wrefData = await wrefRes.json() as { wref: string };
            challenge.wref = wrefData.wref || '';
          } catch { /* no wref */ }
        }

        setXmr402Challenge(challenge);
      } else {
        toast.error(`Unexpected response: ${res.status}`);
      }
    } catch (e: any) {
      toast.error(e.message || t('payment.xmr402Failed', 'XMR402 request failed'));
    } finally {
      setXmr402Loading(false);
    }
  };

  const buildXmr402Uri = (challenge: XMR402Challenge): string => {
    const cbParams = new URLSearchParams({
      nonce: challenge.message,
      amount: challenge.amount,
      sig: challenge.callbackSig || '',
      svc: serviceName,
      wref: challenge.wref || '',
      return: window.location.pathname,
    });
    return `xmr402://${challenge.address}?amount=${challenge.amount}&message=${challenge.message}&return_url=${encodeURIComponent(`${apiBase}/v1/tools/xmr402/callback?${cbParams}`)}`;
  };

  // ── Close / cancel ────────────────────────────────────────────────
  const handleClose = () => {
    setPaymentData(null);
    setPolling(false);
    setXmr402Challenge(null);
    onClose?.();
  };

  // ── WebLN ─────────────────────────────────────────────────────────
  const handleWebLN = async () => {
    if (typeof (window as any).webln === 'undefined') {
      toast.error(t('payment.weblnNotDetected', 'WebLN not detected'));
      return;
    }
    try {
      await (window as any).webln.enable();
      await (window as any).webln.sendPayment(paymentData?.address);
      toast.success(t('payment.weblnSuccess', 'Payment sent via WebLN'));
    } catch (e: any) {
      toast.error(e.message || t('payment.weblnFailed', 'WebLN payment failed'));
    }
  };

  // ── Derived styling ───────────────────────────────────────────────
  const effectiveMethod = paymentData ? paymentData.method as PaymentMethod : selectedMethod;
  const colors = METHOD_COLORS[effectiveMethod === 'XMR402' ? 'XMR' : effectiveMethod] || METHOD_COLORS.XMR;
  const btnColors = METHOD_BUTTON_COLORS[effectiveMethod === 'XMR402' ? 'XMR' : effectiveMethod] || METHOD_BUTTON_COLORS.XMR;

  // ── Visibility ────────────────────────────────────────────────────
  if (!isOpen && !inline) return null;

  // ── Content renderer ──────────────────────────────────────────────
  const renderContent = () => (
    <div className={`space-y-5 ${inline ? '' : 'p-4 md:p-8'}`}>

      {/* ═══ XMR402 Challenge View ═══ */}
      {xmr402Challenge && (
        <div className="space-y-5 text-center animate-in slide-in-from-bottom-4 duration-300">
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="bg-white p-3 rounded-sm shadow-sm border border-wr-border">
              <QRCodeCanvas
                value={buildXmr402Uri(xmr402Challenge)}
                size={160}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
                includeMargin={false}
                imageSettings={{
                  src: '/monero-xmr-logo.png',
                  x: undefined, y: undefined,
                  height: 30, width: 30,
                  excavate: true,
                }}
              />
            </div>
          </div>

          {/* Amount */}
          <div>
            <div className="text-[10px] text-wr-dim uppercase mb-1">
              {t('deposit.sendExactly', 'Send exactly')}
            </div>
            <div className="text-lg font-bold font-mono text-wr-error">
              {piconeroToXMR(xmr402Challenge.amount)} XMR
            </div>
            <div className="text-xs text-wr-dim mt-0.5">~${depositAmount.toFixed(2)} USD</div>
          </div>

          {/* Address */}
          <div
            onClick={() => copyXmr402(xmr402Challenge.address)}
            className="group relative p-3 bg-wr-base/50 rounded border border-wr-border cursor-pointer hover:border-wr-error/50 transition-all active:scale-[0.98]"
          >
            <div className="text-[9px] text-wr-dim uppercase tracking-widest mb-1">
              {t('payment.xmr402Address', 'DESTINATION ADDRESS')}
            </div>
            <div className="font-mono text-[10px] text-wr-green break-all leading-tight flex items-center gap-2">
              <span className="flex-1">{xmr402Challenge.address}</span>
              <span className="shrink-0 text-wr-dim group-hover:text-wr-green">
                {xmr402Copied ? <CheckCircle2 size={14} className="text-wr-green" /> : <Copy size={14} />}
              </span>
            </div>
          </div>

          {/* Nonce */}
          <div className="p-3 bg-wr-surface border border-wr-border rounded">
            <div className="text-[9px] text-wr-dim uppercase tracking-widest mb-1">
              {t('payment.xmr402Nonce', 'CHALLENGE NONCE (tx_description)')}
            </div>
            <div className="font-mono text-xs text-wr-error flex items-center gap-2">
              <span>{xmr402Challenge.message}</span>
              <Copy size={12} className="cursor-pointer text-wr-dim hover:text-wr-error shrink-0"
                onClick={(e) => { e.stopPropagation(); copyXmr402(xmr402Challenge.message); }} />
            </div>
          </div>

          {/* Open in wallet */}
          <a
            href={buildXmr402Uri(xmr402Challenge)}
            className="flex items-center justify-center gap-2 py-2.5 bg-wr-error/20 hover:bg-wr-error/30 text-wr-error border border-wr-error/30 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <ExternalLink size={12} />
            {t('payment.xmr402OpenWallet', 'OPEN IN MONERO WALLET')}
          </a>

          {/* Countdown */}
          <Xmr402Countdown
            timestamp={xmr402Challenge.timestamp}
            onExpired={() => {
              setXmr402Challenge(null);
              toast.error(t('payment.xmr402Expired', 'Challenge expired'));
            }}
          />

          <div className="text-[9px] text-wr-dim/60 leading-relaxed text-center">
            {t('payment.xmr402Instructions', 'Scan the QR with Ripley Terminal or click "Open in Monero Wallet". Challenge expires when timer reaches zero.')}
          </div>
          <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-dim hover:text-wr-accent hover:underline text-[9px] transition-colors block text-center mt-2">
            Need help? @kyc_rip_bot
          </a>
        </div>
      )}

      {/* ═══ Payment Data View (XMR / LN / USDT after creation) ═══ */}
      {paymentData && !xmr402Challenge && (
        <div className="space-y-5 text-center animate-in slide-in-from-bottom-4 duration-500">
          {paymentData.method === 'USDT' ? (
            /* ── USDT: amount + link + polling ── */
            <>
              <div>
                <div className="text-lg font-bold font-mono text-[#26a17b]">{paymentData.amount} USDT</div>
                {paymentData.chain && (
                  <div className="text-[10px] text-[#26a17b]/70 uppercase mt-1 font-mono">
                    {paymentData.chain === 'tron' ? 'TRON (TRC-20)' : 'Ethereum (ERC-20)'}
                  </div>
                )}
              </div>
              {paymentData.paymentUrl && (
                <a
                  href={paymentData.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-4 bg-[#26a17b] hover:bg-[#26a17b]/90 text-white rounded-sm text-sm font-bold uppercase tracking-widest transition-all shadow-lg shadow-[#26a17b]/30"
                >
                  <ExternalLink size={16} /> {t('payment.openPaymentPage', 'OPEN PAYMENT PAGE')}
                </a>
              )}
              <div className="flex items-center justify-center gap-2 text-[10px] text-wr-dim uppercase tracking-widest">
                <RefreshCw size={10} className="animate-spin" />
                {t('payment.awaitingConfirmation', 'AWAITING PAYMENT CONFIRMATION...')}
              </div>
              <p className="text-[9px] text-wr-dim/50">
                {t('payment.autoDetect', 'Payment will be detected automatically. Do not close this window.')}
              </p>
            </>
          ) : (
            /* ── XMR / LN: QR + address + polling ── */
            <>
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-sm">
                  <QRCodeCanvas
                    value={paymentData.method === 'LN'
                      ? paymentData.address
                      : `monero:${paymentData.address}?tx_amount=${paymentData.amount}`}
                    size={160}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#000000"
                    imageSettings={paymentData.method === 'XMR' ? {
                      src: '/monero-xmr-logo.png',
                      x: undefined, y: undefined,
                      height: 30, width: 30,
                      excavate: true,
                    } : undefined}
                  />
                </div>
              </div>

              <div>
                <div className="text-[10px] text-wr-dim uppercase mb-1">
                  {t('deposit.sendExactly', 'Send exactly')}
                </div>
                <div className={`text-lg font-bold font-mono ${paymentData.method === 'LN' ? 'text-wr-accent' : 'text-wr-green'}`}>
                  {paymentData.method === 'LN' ? `${paymentData.amount} sats` : `${paymentData.amount} XMR`}
                </div>
              </div>

              <button
                onClick={() => copyText(paymentData.address)}
                className="w-full p-3 rounded bg-wr-surface border border-wr-border text-[10px] font-mono break-all text-left hover:border-wr-green/50 transition-colors cursor-pointer flex items-center justify-between gap-2 text-wr-green"
              >
                <span className="break-all flex-1">{paymentData.address}</span>
                {copied ? <CheckCircle2 size={14} className="text-wr-green shrink-0" /> : <Copy size={14} className="text-wr-dim shrink-0" />}
              </button>

              {/* WebLN / External wallet buttons for Lightning */}
              {paymentData.method === 'LN' && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleWebLN}
                    className="flex items-center justify-center gap-2 bg-wr-accent/20 hover:bg-wr-accent/30 text-wr-accent py-3 px-4 rounded-xs border border-wr-accent/30 text-[10px] font-bold uppercase transition-all"
                  >
                    <Zap size={12} className="fill-current" /> {t('payment.payAlby', 'PAY WITH ALBY')}
                  </button>
                  <a
                    href={`lightning:${paymentData.address}`}
                    className="flex items-center justify-center gap-2 bg-wr-surface hover:bg-wr-surface/80 text-wr-dim py-3 px-4 rounded-xs border border-wr-border text-[10px] font-bold uppercase transition-all"
                  >
                    <ExternalLink size={12} /> {t('payment.externalWallet', 'EXTERNAL WALLET')}
                  </a>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 text-[10px] text-wr-dim uppercase tracking-widest">
                <RefreshCw size={10} className="animate-spin" />
                {t('payment.awaitingConfirmation', 'AWAITING PAYMENT CONFIRMATION...')}
              </div>
              {paymentData.method === 'LN' && (
                <p className="text-[8px] text-wr-dim/50 max-w-[280px] mx-auto leading-tight">
                  * {t('payment.routingNote', 'Lightning payments may take a few moments to route')}
                </p>
              )}
              <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-dim hover:text-wr-accent hover:underline text-[9px] transition-colors block text-center mt-1">
                Need help? @kyc_rip_bot
              </a>
            </>
          )}
        </div>
      )}

      {/* ═══ Initial View (method selector + presets + action) ═══ */}
      {!paymentData && !xmr402Challenge && (
        <div className="space-y-5 animate-in slide-in-from-bottom-4 duration-300">

          {/* Payment method selector */}
          <div>
            <div className="text-xs text-wr-dim mb-3 uppercase tracking-widest font-bold flex items-center gap-2">
              <Zap size={12} className="text-wr-accent" /> {t('payment.protocol', 'PAYMENT PROTOCOL')}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {methods.includes('XMR') && (
                <button
                  onClick={() => setSelectedMethod('XMR')}
                  className={`py-3 px-2 border flex items-center justify-center gap-1.5 transition-all rounded-sm ${
                    selectedMethod === 'XMR'
                      ? `${METHOD_COLORS.XMR.border} ${METHOD_COLORS.XMR.bg} ${METHOD_COLORS.XMR.text} ${METHOD_COLORS.XMR.shadow}`
                      : 'border-wr-border text-wr-dim hover:border-wr-dim'
                  }`}
                >
                  <img src="/monero-xmr-logo.png" className="w-4 h-4" alt="XMR" />
                  <span className="text-xs font-bold tracking-widest font-mono uppercase">XMR</span>
                </button>
              )}
              {methods.includes('LN') && (
                <button
                  onClick={() => setSelectedMethod('LN')}
                  className={`py-3 px-2 border flex items-center justify-center gap-1.5 transition-all rounded-sm ${
                    selectedMethod === 'LN'
                      ? `${METHOD_COLORS.LN.border} ${METHOD_COLORS.LN.bg} ${METHOD_COLORS.LN.text} ${METHOD_COLORS.LN.shadow}`
                      : 'border-wr-border text-wr-dim hover:border-wr-dim'
                  }`}
                >
                  <Zap size={16} className="fill-current" />
                  <span className="text-xs font-bold tracking-widest font-mono uppercase">LN</span>
                </button>
              )}
              {methods.includes('XMR402') && (
                <button
                  onClick={() => setSelectedMethod('XMR402')}
                  className={`py-3 px-2 border flex items-center justify-center gap-1.5 transition-all rounded-sm ${
                    selectedMethod === 'XMR402'
                      ? `${METHOD_COLORS.XMR402.border} ${METHOD_COLORS.XMR402.bg} ${METHOD_COLORS.XMR402.text} ${METHOD_COLORS.XMR402.shadow}`
                      : 'border-wr-border text-wr-dim hover:border-wr-dim'
                  }`}
                >
                  <Shield size={16} />
                  <span className="text-xs font-bold tracking-widest font-mono uppercase">402</span>
                </button>
              )}
              {methods.includes('USDT') && (
                <button
                  onClick={() => setSelectedMethod('USDT')}
                  className={`py-3 px-2 border flex items-center justify-center gap-1.5 transition-all rounded-sm ${
                    selectedMethod === 'USDT'
                      ? `${METHOD_COLORS.USDT.border} ${METHOD_COLORS.USDT.bg} ${METHOD_COLORS.USDT.text} ${METHOD_COLORS.USDT.shadow}`
                      : 'border-wr-border text-wr-dim hover:border-wr-dim'
                  }`}
                >
                  <DollarSign size={16} />
                  <span className="text-xs font-bold tracking-widest font-mono uppercase">USDT</span>
                </button>
              )}
            </div>

            {/* USDT chain selector */}
            {selectedMethod === 'USDT' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setUsdtChain('tron')}
                  className={`py-2 px-3 border text-xs font-bold font-mono uppercase tracking-widest rounded-sm transition-all ${
                    usdtChain === 'tron'
                      ? 'border-[#26a17b] bg-[#26a17b]/10 text-[#26a17b]'
                      : 'border-wr-border text-wr-dim hover:border-wr-dim'
                  }`}
                >
                  {t('payment.usdtTron', 'TRON (TRC-20)')}
                </button>
                <button
                  onClick={() => setUsdtChain('eth')}
                  className={`py-2 px-3 border text-xs font-bold font-mono uppercase tracking-widest rounded-sm transition-all ${
                    usdtChain === 'eth'
                      ? 'border-[#26a17b] bg-[#26a17b]/10 text-[#26a17b]'
                      : 'border-wr-border text-wr-dim hover:border-wr-dim'
                  }`}
                >
                  {t('payment.usdtEth', 'Ethereum (ERC-20)')}
                </button>
              </div>
            )}

            {/* XMR402 hint */}
            {selectedMethod === 'XMR402' && (
              <div className="mt-2 text-[9px] text-wr-error/70 leading-relaxed">
                {t('payment.xmr402Hint', 'XMR402: Stateless payment -- pay directly from your Monero wallet. No deposit wallet needed.')}
              </div>
            )}
          </div>

          {/* Deposit amount presets */}
          {showPresets && (
            <div className="space-y-2">
              <label className="text-[9px] font-black text-wr-dim uppercase tracking-widest">
                {t('payment.depositAmount', 'Deposit Amount')}
              </label>
              <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${presets.length}, 1fr)` }}>
                {presets.map(amt => (
                  <button
                    key={amt}
                    onClick={() => { setDepositAmount(amt); setCustomAmount(''); }}
                    className={`py-3 rounded-sm border text-sm font-bold font-mono transition-all ${
                      depositAmount === amt && !customAmount
                        ? `${METHOD_COLORS[selectedMethod === 'XMR402' ? 'XMR' : selectedMethod].border} ${METHOD_COLORS[selectedMethod === 'XMR402' ? 'XMR' : selectedMethod].bg} ${METHOD_COLORS[selectedMethod === 'XMR402' ? 'XMR' : selectedMethod].text} shadow-[0_0_15px_rgba(0,255,65,0.15)]`
                        : 'border-wr-border text-wr-dim hover:border-wr-dim'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              {/* Custom amount input */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-wr-dim text-sm font-bold font-mono">$</span>
                <input
                  type="number"
                  min="0.50"
                  step="0.01"
                  placeholder={t('payment.customAmount', 'Custom...')}
                  value={customAmount}
                  onChange={e => {
                    setCustomAmount(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0) setDepositAmount(val);
                  }}
                  className="flex-1 bg-wr-surface border border-wr-border rounded-sm px-3 py-2 text-sm font-mono text-current placeholder:text-wr-dim/50 focus:outline-none focus:border-wr-green/50"
                />
              </div>
            </div>
          )}

          {/* Amount display + action button */}
          <div className="border-t border-wr-border/30 pt-5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] text-wr-dim uppercase tracking-widest font-bold">
                {showPresets ? t('payment.totalDeposit', 'Total Deposit') : t('payment.totalPayment', 'Total Payment')}
              </span>
              <span className={`text-2xl font-bold font-mono ${METHOD_COLORS[effectiveMethod === 'XMR402' ? 'XMR' : effectiveMethod].text}`}>
                ${(showPresets ? depositAmount : amount).toFixed(2)}
              </span>
            </div>
            <button
              onClick={createPayment}
              disabled={creating || xmr402Loading || (showPresets && depositAmount <= 0)}
              className={`px-8 py-3 text-xs font-black hover:opacity-90 shadow-lg uppercase tracking-widest rounded-sm flex items-center gap-2 disabled:opacity-50 transition-all ${
                creating || xmr402Loading
                  ? 'bg-wr-surface border border-wr-border text-wr-dim cursor-wait'
                  : selectedMethod === 'XMR402'
                    ? `${METHOD_BUTTON_COLORS.XMR402.active}`
                    : `${btnColors.active}`
              }`}
            >
              {creating || xmr402Loading ? (
                <><RefreshCw size={12} className="animate-spin" /> {t('payment.generating', 'Generating...')}</>
              ) : selectedMethod === 'XMR402' ? (
                <><Shield size={14} /> {t('payment.payViaXmr402', 'PAY VIA XMR402')}</>
              ) : showPresets ? (
                t('payment.deposit', 'DEPOSIT')
              ) : (
                t('payment.pay', 'PAY')
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Inline rendering ──────────────────────────────────────────────
  if (inline) {
    return (
      <div className={`${className}`}>
        {renderContent()}
      </div>
    );
  }

  // ── Modal rendering ───────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-wr-base/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className={`border bg-wr-base p-0 max-w-lg w-full relative shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden rounded-sm ${
        xmr402Challenge ? 'border-wr-error' : colors.border
      } ${className}`}>
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-wr-dim hover:text-wr-green z-10 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className={`p-3 md:p-4 border-b flex items-center gap-2 ${
          (paymentData || xmr402Challenge) ? 'animate-pulse' : ''
        } ${
          xmr402Challenge
            ? 'bg-wr-error/10 border-wr-error/30 text-wr-error'
            : `${colors.bg} ${colors.border}/30 ${colors.text}`
        }`}>
          {xmr402Challenge ? <Shield size={14} /> : <Wallet size={14} />}
          <span className="text-xs font-bold tracking-widest uppercase">
            {xmr402Challenge
              ? t('payment.xmr402Required', 'XMR402 PAYMENT REQUIRED')
              : paymentData
                ? t('payment.awaitingPayment', 'AWAITING PAYMENT')
                : showPresets
                  ? t('payment.depositToWallet', 'DEPOSIT TO WALLET')
                  : t('payment.paymentRequired', 'PAYMENT REQUIRED')
            }
          </span>
        </div>

        {renderContent()}
      </div>
    </div>
  );
}
