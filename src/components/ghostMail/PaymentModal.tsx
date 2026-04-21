/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { Terminal, CheckCircle, RefreshCw, X, Zap, ExternalLink, Shield, Copy, CheckCircle2, Clock } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { DepositAddress } from '../DepositAddress';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import type { PaymentState, GhostMailSession } from '../../hooks/useGhostMail';

type PaymentTab = 'XMR' | 'LN' | 'XMR402' | 'USDT';

interface XMR402Challenge {
  address: string;
  amount: string; // piconero
  message: string; // nonce
  timestamp: string;
}

interface PaymentModalProps {
  paymentState: PaymentState;
  cancelPayment: () => void;
  customName: string;
  selectedDomain: string;
  login: (s: GhostMailSession) => void;
  selectedTier?: 'BASIC' | 'PREMIUM' | 'PRIVATE';
  selectedDuration?: { label: string; value: number; addonPrice: number };
  verifyXmr402Proof?: (txid: string, proof: string, customEmail: string, tier: 'BASIC' | 'PREMIUM' | 'PRIVATE', duration?: { label: string; value: number; addonPrice: number }) => Promise<boolean>;
}

declare global {
  interface Window {
    webln?: any;
  }
}

function parseWwwAuthenticate(header: string): XMR402Challenge | null {
  const match = header.match(
    /XMR402\s+address="([^"]+)",\s*amount="([^"]+)",\s*message="([^"]+)",\s*timestamp="([^"]+)"/
  );
  if (!match) return null;
  return { address: match[1], amount: match[2], message: match[3], timestamp: match[4] };
}

function piconeroToXMR(piconero: string): string {
  const val = BigInt(piconero);
  const whole = val / BigInt(1e12);
  const frac = val % BigInt(1e12);
  return `${whole}.${frac.toString().padStart(12, '0').replace(/0+$/, '') || '0'}`;
}

export function PaymentModal({
  paymentState,
  cancelPayment,
  customName,
  selectedDomain,
  login: _,
  selectedTier,
  selectedDuration,
  verifyXmr402Proof,
}: PaymentModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PaymentTab>('XMR');

  // XMR402 state
  const [xmr402Loading, setXmr402Loading] = useState(false);

  // Handle XMR402 return from Ripley Terminal (txid + proof in URL)
  const [xmr402Proof] = useState<{ txid: string; proof: string } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const txid = params.get('xmr402_txid');
    const proof = params.get('xmr402_proof');
    if (txid && proof) {
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('xmr402_txid');
      url.searchParams.delete('xmr402_proof');
      window.history.replaceState({}, '', url.toString());
      return { txid, proof };
    }
    return null;
  });
  const [xmr402Challenge, setXmr402Challenge] = useState<XMR402Challenge | null>(null);
  const [xmr402Copied, setXmr402Copied] = useState(false);
  const [xmr402Verifying, setXmr402Verifying] = useState(false);
  const xmr402VerifyAttempted = useRef(false);

  // Auto-verify XMR402 proof when returned from Ripley Terminal
  // Wait for customName and selectedDomain to be populated (avoids race condition on page reload)
  useEffect(() => {
    if (!xmr402Proof || xmr402VerifyAttempted.current || !verifyXmr402Proof) return;
    if (!customName || !selectedDomain) return; // Wait for config to load
    xmr402VerifyAttempted.current = true;
    setXmr402Verifying(true);

    const customEmail = `${customName}@${selectedDomain}`;
    verifyXmr402Proof(
      xmr402Proof.txid,
      xmr402Proof.proof,
      customEmail,
      selectedTier || 'BASIC',
      selectedDuration,
    ).finally(() => setXmr402Verifying(false));
  }, [xmr402Proof, verifyXmr402Proof, customName, selectedDomain, selectedTier, selectedDuration]);

  // XMR402 countdown (5-minute window)
  const [xmr402Remaining, setXmr402Remaining] = useState<number | null>(null);
  useEffect(() => {
    if (!xmr402Challenge?.timestamp) { setXmr402Remaining(null); return; }
    const challengeTime = parseInt(xmr402Challenge.timestamp, 10);
    const expiresAt = challengeTime + 300000; // 5 minutes
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setXmr402Remaining(left);
      if (left <= 0) setXmr402Challenge(null); // expired — clear challenge
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [xmr402Challenge?.timestamp]);

  // Poll for XMR402 callback completion (original browser detects when other browser completes)
  useEffect(() => {
    if (!xmr402Challenge || !customName || !selectedDomain) return;
    const email = `${customName}@${selectedDomain}`;
    const mailApiBase = import.meta.env.VITE_MAIL_API_URL || 'https://mail-api.kyc.rip';

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${mailApiBase}/api/payment/xmr402/poll?email=${encodeURIComponent(email)}`);
        if (!res.ok) return;
        const data = await res.json() as { status: string; account?: { email: string; token: string } };
        if (data.status === 'COMPLETED' && data.account) {
          clearInterval(poll);
          toast.success('UPLINK ESTABLISHED VIA XMR402');
          localStorage.setItem('ghost_mail_session', JSON.stringify({ email: data.account.email, token: data.account.token }));
          window.location.href = `${window.location.pathname}?email=${encodeURIComponent(data.account.email)}&token=${encodeURIComponent(data.account.token)}`;
        }
      } catch {}
    }, 3000);

    return () => clearInterval(poll);
  }, [xmr402Challenge, customName, selectedDomain]);

  if (paymentState.status === 'IDLE' && !xmr402Proof) return null;
  const data = paymentState.status === 'WAITING_PAYMENT' ? paymentState.data : null;
  const isCompleted = paymentState.status === 'COMPLETED';
  const isLN = data?.method === 'LN';
  const isUSDT = data?.method === 'USDT';
  const isXMR402 = activeTab === 'XMR402' && !isUSDT;

  const handleWebLN = async () => {
    if (typeof window.webln === 'undefined') {
      toast.error(t('ghostMail.payment.weblnNotDetected', 'WebLN not detected'));
      return;
    }
    try {
      await window.webln.enable();
      await window.webln.sendPayment(data?.address);
      toast.success(t('ghostMail.payment.weblnSuccess', 'Payment sent via WebLN'));
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || t('ghostMail.payment.weblnFailed', 'WebLN payment failed'));
    }
  };

  const handleRequestXMR402 = async () => {
    setXmr402Loading(true);
    try {
      // Call the mail API to get a 402 challenge
      // For Ghost Mail, we'd call the payment/create endpoint without auth
      // For now, we show how to do an XMR402 flow
      const apiBase = import.meta.env.VITE_MAIL_API_URL || 'https://mail-api.kyc.rip';
      const res = await fetch(`${apiBase}/api/payment/xmr402`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customEmail: `${customName}@${selectedDomain}`,
          tier: selectedTier || 'BASIC',
          duration: selectedDuration,
        }),
      });

      if (res.status === 402) {
        const wwwAuth = res.headers.get('WWW-Authenticate');
        const body402 = await res.json().catch(() => ({})) as { callback_sig?: string };
        if (wwwAuth) {
          const challenge = parseWwwAuthenticate(wwwAuth);
          if (challenge) {
            (challenge as any).callbackSig = body402.callback_sig || '';
            setXmr402Challenge(challenge);
          } else {
            toast.error('Failed to parse XMR402 challenge');
          }
        } else {
          toast.error('No WWW-Authenticate header in 402 response');
        }
      } else {
        toast.error(`Unexpected response: ${res.status}`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'XMR402 request failed');
    } finally {
      setXmr402Loading(false);
    }
  };

  // Build return URL pointing to the API callback (stateless, works across browsers)
  const apiBase = import.meta.env.VITE_MAIL_API_URL || 'https://mail-api.kyc.rip';
  const xmr402CallbackUrl = xmr402Challenge ? (() => {
    const params = new URLSearchParams({
      email: `${customName}@${selectedDomain}`,
      tier: selectedTier || 'BASIC',
      duration: String(selectedDuration?.value || 0),
      addon: String(selectedDuration?.addonPrice || 0),
      nonce: xmr402Challenge.message,
      amount: xmr402Challenge.amount,
      sig: (xmr402Challenge as any).callbackSig || '',
    });
    return `${apiBase}/api/payment/xmr402/callback?${params}`;
  })() : '';
  const xmr402Uri = xmr402Challenge
    ? `xmr402://${xmr402Challenge.address}?amount=${xmr402Challenge.amount}&message=${xmr402Challenge.message}&return_url=${encodeURIComponent(xmr402CallbackUrl)}`
    : '';

  const handleCopyXmr402 = (text: string) => {
    navigator.clipboard.writeText(text);
    setXmr402Copied(true);
    setTimeout(() => setXmr402Copied(false), 2000);
  };

  const borderClass = isUSDT ? 'border-[#26a17b]' : isXMR402 ? 'border-wr-error' : isLN ? 'border-wr-accent' : 'border-wr-green';
  const headerBgClass = isUSDT ? 'bg-[#26a17b]/10 border-[#26a17b]/30 text-[#26a17b]' : isXMR402 ? 'bg-wr-error/10 border-wr-error/30 text-wr-error' : isLN ? 'bg-wr-accent/10 border-wr-accent/30 text-wr-accent' : 'bg-wr-green/10 border-wr-green/30 text-wr-green';
  const textAccentClass = isUSDT ? 'text-[#26a17b]' : isXMR402 ? 'text-wr-error' : isLN ? 'text-wr-accent' : 'text-wr-green';

  return (
    <div className="fixed inset-0 bg-wr-base/90 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className={`border bg-wr-base p-0 max-w-lg w-full relative shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden rounded-sm ${borderClass}`}>

        {/* Header */}
        <div className={`p-3 md:p-4 border-b flex items-center gap-2 ${isCompleted || data ? 'animate-pulse' : ''} ${headerBgClass}`}>
          {isXMR402 ? <Shield size={14} /> : <Terminal size={14} />}
          <span className="text-[10px] md:text-xs font-bold tracking-widest uppercase">
            {isCompleted
              ? t('ghostMail.payment.uplinkEstablished', 'UPLINK ESTABLISHED')
              : isUSDT
                ? t('mail.payment_usdt_pending', 'USDT PAYMENT PENDING')
                : isXMR402
                  ? t('ghostMail.payment.xmr402Pending', 'XMR402 PAYMENT REQUIRED')
                  : isLN
                    ? t('ghostMail.payment.lnPending', 'LIGHTNING PAYMENT PENDING')
                    : t('ghostMail.payment.xmrPending', 'XMR PAYMENT PENDING')}
          </span>
        </div>

        <div className="p-4 md:p-8 text-center">
          {isCompleted ? (
            <div className="py-6 md:py-10 animate-in zoom-in duration-300">
              <CheckCircle className="w-16 h-16 md:w-20 md:h-20 text-wr-green mx-auto mb-6" />
              <h3 className="text-xl md:text-2xl text-wr-green font-bold tracking-widest mb-2">
                {t('ghostMail.payment.accessGranted', 'ACCESS GRANTED')}
              </h3>
              <p className="text-wr-dim text-sm">{t('ghostMail.payment.redirecting', 'Redirecting to your inbox...')}</p>
            </div>
          ) : !data && !isXMR402 ? (
            <div className="py-10 space-y-4">
              <RefreshCw className="w-10 h-10 text-wr-green animate-spin mx-auto opacity-50" />
              <p className="text-wr-dim text-[10px] uppercase tracking-widest">
                {t('ghostMail.payment.generating', 'GENERATING PAYMENT ADDRESS...')}
              </p>
            </div>
          ) : (
            <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              {/* Target Endpoint */}
              <div>
                <div className="text-wr-dim text-[10px] uppercase tracking-widest mb-1">
                  {t('ghostMail.payment.targetEndpoint', 'TARGET ENDPOINT')}
                </div>
                <div className={`text-lg md:text-xl font-mono border-b border-wr-border inline-block pb-1 ${textAccentClass}`}>
                  {customName}@{selectedDomain}
                </div>
              </div>

              {/* XMR402 toggle — separate flow from XMR/LN (hidden for USDT) */}
              {!isCompleted && !isUSDT && (
                <div className="flex border border-wr-border rounded-sm overflow-hidden">
                  <button
                    onClick={() => setActiveTab(isLN ? 'LN' : 'XMR')}
                    className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      !isXMR402
                        ? isLN ? 'bg-wr-accent/20 text-wr-accent border-b-2 border-wr-accent' : 'bg-wr-green/20 text-wr-green border-b-2 border-wr-green'
                        : 'text-wr-dim hover:text-white/80'
                    }`}
                  >
                    {isLN ? 'Lightning' : 'Monero'}
                  </button>
                  <button
                    onClick={() => setActiveTab('XMR402')}
                    className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      isXMR402
                        ? 'bg-wr-error/20 text-wr-error border-b-2 border-wr-error'
                        : 'text-wr-dim hover:text-white/80'
                    }`}
                  >
                    XMR402 (Ripley)
                  </button>
                </div>
              )}

              {/* USDT Payment Content — just link to uPay payment page */}
              {isUSDT && data && (
                <>
                  <div className="text-center space-y-2">
                    <div className="text-lg font-bold font-mono text-[#26a17b]">{data.amount} USDT</div>
                    {data.chain && (
                      <div className="text-[10px] text-wr-dim">{t('mail.payment_usdt_network', { network: data.chain === 'tron' ? t('mail.payment_usdt_network_tron', 'TRON (TRC20)') : t('mail.payment_usdt_network_eth', 'Ethereum (ERC20)') })}</div>
                    )}
                  </div>

                  {data.paymentUrl && (
                    <a
                      href={data.paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-4 bg-[#26a17b] hover:bg-[#26a17b]/90 text-white rounded-sm text-sm font-bold uppercase tracking-widest transition-all shadow-lg shadow-[#26a17b]/30"
                    >
                      <ExternalLink size={16} /> {t('mail.payment_usdt_open_page', 'OPEN PAYMENT PAGE')}
                    </a>
                  )}

                  <div className="text-[10px] text-wr-dim flex items-center justify-center gap-2 uppercase tracking-tighter">
                    <RefreshCw size={10} className="animate-spin" />
                    {t('mail.payment_usdt_awaiting', 'AWAITING USDT PAYMENT CONFIRMATION...')}
                  </div>
                  <p className="text-[9px] text-wr-dim/50 text-center">
                    {t('mail.payment_usdt_auto_detect', 'Payment will be detected automatically. Do not close this window.')}
                  </p>
                  <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-dim hover:text-[#26a17b] hover:underline text-[9px] transition-colors block text-center mt-1">
                    Need help? @kyc_rip_bot
                  </a>
                </>
              )}

              {/* XMR / LN Payment Content */}
              {!isXMR402 && !isUSDT && data && (
                <>
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
                      label={isLN
                        ? t('ghostMail.payment.scanBolt11', 'Scan or paste BOLT11 invoice')
                        : t('ghostMail.payment.sendExact', 'Send exact amount')}
                      actualNetwork={isLN ? "Bitcoin Lightning" : "Monero"}
                    />
                  </div>

                  {isLN && (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={handleWebLN}
                        className="flex items-center justify-center gap-2 bg-wr-accent/20 hover:bg-wr-accent/30 text-wr-accent py-3 px-4 rounded-xs border border-wr-accent/30 text-[10px] font-bold uppercase transition-all"
                      >
                        <Zap size={12} className="fill-current" /> {t('ghostMail.payment.payAlby', 'PAY WITH ALBY')}
                      </button>
                      <a
                        href={`lightning:${data.address}`}
                        className="flex items-center justify-center gap-2 bg-wr-surface hover:bg-wr-surface/80 text-wr-dim py-3 px-4 rounded-xs border border-wr-border text-[10px] font-bold uppercase transition-all"
                      >
                        <ExternalLink size={12} /> {t('ghostMail.payment.externalWallet', 'EXTERNAL WALLET')}
                      </a>
                    </div>
                  )}

                  <div className="text-[10px] text-wr-dim flex flex-col items-center gap-2 uppercase tracking-tighter">
                    <div className="flex items-center gap-2">
                      <RefreshCw size={10} className="animate-spin" />
                      {t('ghostMail.payment.awaiting', 'AWAITING PAYMENT CONFIRMATION...')}
                    </div>
                    {isLN && (
                      <p className="text-[8px] opacity-50 max-w-[280px] leading-tight">
                        * {t('ghostMail.payment.routingNote', 'Lightning payments may take a few moments to route')}
                      </p>
                    )}
                    <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-dim hover:text-wr-accent hover:underline text-[9px] transition-colors block text-center mt-1">
                      Need help? @kyc_rip_bot
                    </a>
                  </div>
                </>
              )}

              {/* XMR402 Content */}
              {isXMR402 && (
                <div className="space-y-4">
                  {!xmr402Challenge ? (
                    <div className="space-y-4">
                      <p className="text-wr-dim text-xs leading-relaxed">
                        {t('ghostMail.payment.xmr402Desc', 'Pay directly from your Monero wallet using the XMR402 protocol. No intermediary, no wallet account needed. Stateless payment verification via tx proof.')}
                      </p>
                      <button
                        onClick={handleRequestXMR402}
                        disabled={xmr402Loading}
                        className="w-full py-3 bg-wr-error/20 hover:bg-wr-error/30 text-wr-error border border-wr-error/30 rounded-sm text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {xmr402Loading ? (
                          <><RefreshCw size={12} className="animate-spin" /> {t('ghostMail.payment.requesting', 'REQUESTING CHALLENGE...')}</>
                        ) : (
                          <><Shield size={12} /> {t('ghostMail.payment.getChallenge', 'REQUEST PAYMENT CHALLENGE')}</>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                      {/* QR Code with xmr402:// URI */}
                      <div className="flex justify-center">
                        <div className="bg-white p-3 rounded-sm shadow-sm border border-wr-border">
                          <QRCodeCanvas
                            value={xmr402Uri}
                            size={160}
                            level="M"
                            bgColor="#ffffff"
                            fgColor="#000000"
                            includeMargin={false}
                            imageSettings={{
                              src: '/monero-xmr-logo.png',
                              x: undefined,
                              y: undefined,
                              height: 34,
                              width: 34,
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
                      </div>

                      {/* Address */}
                      <div
                        onClick={() => handleCopyXmr402(xmr402Challenge.address)}
                        className="group relative p-3 bg-wr-base/50 rounded border border-wr-border cursor-pointer hover:border-wr-error/50 transition-all active:scale-[0.98]"
                      >
                        <div className="text-[9px] text-wr-dim uppercase tracking-widest mb-1">
                          {t('ghostMail.payment.xmr402Address', 'DESTINATION ADDRESS')}
                        </div>
                        <div className="font-mono text-[10px] text-wr-green break-all leading-tight flex items-center gap-2">
                          <span className="flex-1">{xmr402Challenge.address}</span>
                          <span className="shrink-0 text-wr-dim group-hover:text-wr-green">
                            {xmr402Copied ? <CheckCircle2 size={14} className="text-wr-green" /> : <Copy size={14} />}
                          </span>
                        </div>
                      </div>

                      {/* Nonce / Message */}
                      <div className="p-3 bg-wr-surface border border-wr-border rounded">
                        <div className="text-[9px] text-wr-dim uppercase tracking-widest mb-1">
                          {t('ghostMail.payment.xmr402Nonce', 'CHALLENGE NONCE (tx_description)')}
                        </div>
                        <div className="font-mono text-xs text-wr-error flex items-center gap-2">
                          <span>{xmr402Challenge.message}</span>
                          <Copy size={12} className="cursor-pointer text-wr-dim hover:text-wr-error shrink-0"
                            onClick={(e) => { e.stopPropagation(); handleCopyXmr402(xmr402Challenge.message); }} />
                        </div>
                      </div>

                      {/* Open in wallet */}
                      <a
                        href={xmr402Uri}
                        className="flex items-center justify-center gap-2 py-2.5 bg-wr-error/20 hover:bg-wr-error/30 text-wr-error border border-wr-error/30 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all"
                      >
                        <ExternalLink size={12} />
                        {t('ghostMail.payment.openRipley', 'OPEN IN RIPLEY TERMINAL')}
                      </a>

                      {/* Countdown timer */}
                      {xmr402Remaining !== null && (
                        <div className={`flex items-center justify-center gap-2 text-xs font-mono font-bold ${xmr402Remaining <= 60 ? 'text-red-400 animate-pulse' : 'text-wr-dim'}`}>
                          <Clock size={12} />
                          {xmr402Remaining > 0
                            ? `${Math.floor(xmr402Remaining / 60)}:${(xmr402Remaining % 60).toString().padStart(2, '0')} remaining`
                            : 'EXPIRED — request a new challenge'}
                        </div>
                      )}

                      <div className="text-[9px] text-wr-dim/60 leading-relaxed space-y-1">
                        <p>{t('ghostMail.payment.xmr402Instructions', 'Scan the QR code with Ripley Terminal or click "Open in Ripley Terminal". After payment, Ripley will redirect back with the proof automatically.')}</p>
                      </div>
                      <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-dim hover:text-wr-accent hover:underline text-[9px] transition-colors block text-center mt-2">
                        Need help? @kyc_rip_bot
                      </a>
                    </div>
                  )}

                  {/* XMR402 proof received from Ripley Terminal return */}
                  {xmr402Proof && (
                    <div className="space-y-3 p-4 border border-wr-green/30 bg-wr-green/5 rounded-sm animate-in slide-in-from-bottom-4">
                      <div className="flex items-center gap-2 text-wr-green text-xs font-bold uppercase tracking-widest">
                        {xmr402Verifying ? (
                          <><RefreshCw size={14} className="animate-spin" /> {t('ghostMail.payment.verifyingProof', 'VERIFYING PAYMENT PROOF...')}</>
                        ) : (
                          <><CheckCircle size={14} /> {t('ghostMail.payment.proofReceived', 'Payment Proof Received')}</>
                        )}
                      </div>
                      <div className="text-[9px] text-wr-dim font-mono break-all">
                        <div><span className="text-wr-green">txid:</span> {xmr402Proof.txid}</div>
                        <div><span className="text-wr-green">proof:</span> {xmr402Proof.proof.slice(0, 32)}...</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
