import { useState, useEffect, useCallback, useMemo } from 'react';
import { Mail, Crown, Send, Plus, Trash2, Copy, Check, RefreshCw, X, Inbox, LogOut, AtSign, Clock, Loader2, ShieldCheck, Wallet, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { mailApiClient, getMailApiBase } from '../services/client';
import { fetchInbox } from '../services/mail';
import { EmailReader, type ReaderAttachment } from '../components/ghostMail/EmailReader';

// ── Types ──
type ProPlan = 'PRO' | 'PRO_PLUS';
interface PlanDef { label: string; monthlyUSD: number; aliasLimit: number; domains: string[] }
interface PlansResp { plans: Record<ProPlan, PlanDef>; domains: string[] }
interface Session { email: string; token: string; plan: ProPlan }
interface SubCreateResp { method: 'XMR' | 'LN' | 'USDT'; address: string; paymentId: string; amount: number; usd: number; email: string; paymentUrl?: string; chain?: string }
type UsdtChain = 'tron' | 'eth';
const CHAIN_LABEL: Record<UsdtChain, string> = { tron: 'Tron · TRC-20', eth: 'Ethereum · ERC-20' };
interface AliasesResp { primary: string; plan: ProPlan; aliases: string[]; aliasLimit: number; aliasesRemaining: number; domains: string[]; subStatus?: string; sendEnabled?: boolean; nextBillingAt?: number }
interface SentItem { id: string; from: string; to: string; subject: string; text: string; sentAt: string }

const SESSION_KEY = 'ghost_pro_session';
type Tab = 'inbox' | 'compose' | 'aliases' | 'sent';

export default function GhostMailPro() {
  const { t } = useTranslation();
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  });

  const saveSession = (s: Session | null) => {
    setSession(s);
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  };

  return (
    <div className="min-h-screen flex flex-col items-center text-current relative">
      <SEO title="Ghost Mail Pro — persistent private email with send + aliases"
        description="Persistent, send-capable, no-KYC private email. Fixed address + aliases, compose & reply, pay monthly with Monero or Lightning." path="/mail/pro" />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />
      <main className="w-full max-w-4xl px-4 md:px-6 relative z-10 pb-12">
        <div className="max-w-4xl mx-auto space-y-6 pb-8 md:pb-12">
          <div className="text-center py-8 scale-90 md:scale-100 origin-top">
            <div className="mx-auto w-16 h-16 rounded-full bg-wr-accent/10 flex items-center justify-center text-wr-accent border border-wr-accent/20 mb-4"><Crown size={34} /></div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mb-2">
              {t('gmpro.title_a', 'Ghost Mail')} <span className="text-wr-accent">{t('gmpro.title_b', 'Pro')}</span>
            </h1>
            <p className="text-wr-dim text-sm max-w-md mx-auto">{t('gmpro.subtitle', 'A persistent private inbox you can send from — fixed address, aliases, compose & reply. No KYC, pay monthly in Monero or Lightning.')}</p>
          </div>
          {session ? <Dashboard session={session} onSignOut={() => saveSession(null)} /> : <Subscribe onActivated={saveSession} />}
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ── Subscribe / onboarding ──
function Subscribe({ onActivated }: { onActivated: (s: Session) => void }) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<PlansResp | null>(null);
  const [plan, setPlan] = useState<ProPlan>('PRO');
  const [domain, setDomain] = useState('vigilpro.xyz');
  const [username, setUsername] = useState('');
  const [method, setMethod] = useState<'XMR' | 'LN' | 'USDT'>('XMR');
  const [chain, setChain] = useState<UsdtChain>('tron');
  const [pay, setPay] = useState<SubCreateResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => { mailApiClient<PlansResp>('/v1/mail/pro/plans').then(setPlans).catch(() => {}); }, []);

  const restore = () => {
    const email = prompt(t('gmpro.restore_prompt', 'Your Pro address (you@vigilpro.xyz):'))?.trim().toLowerCase();
    const token = email ? prompt(t('gmpro.restore_token', 'Your access token:'))?.trim() : '';
    if (email && token) {
      mailApiClient<AliasesResp>(`/v1/mail/pro/aliases?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`)
        .then((a) => { onActivated({ email, token: token!, plan: a.plan }); toast.success('Restored'); })
        .catch(() => toast.error('Invalid address or token'));
    }
  };

  const start = async () => {
    if (!/^[a-z0-9]([a-z0-9._-]{2,30})[a-z0-9]$/.test(username)) { toast.error(t('gmpro.bad_username', 'Username: 4-32 chars a-z 0-9 . _ - (not at the ends)')); return; }
    setBusy(true);
    try {
      const r = await mailApiClient<SubCreateResp>('/v1/mail/pro/subscribe/create', { method: 'POST', body: { plan, username, domain, method, ...(method === 'USDT' ? { chain } : {}) } });
      setPay(r);
    } catch (e: any) { toast.error(e?.data?.error || e?.message || 'Failed to start subscription'); }
    finally { setBusy(false); }
  };

  // Poll for confirmation
  useEffect(() => {
    if (!pay) return;
    setPolling(true);
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await mailApiClient<{ status: string; account?: { email: string; token: string; plan: ProPlan } }>(`/v1/mail/pro/subscribe/check?paymentId=${encodeURIComponent(pay.paymentId)}`);
        if (r.status === 'COMPLETED' && r.account) { onActivated({ email: r.account.email, token: r.account.token, plan: r.account.plan }); toast.success('Ghost Mail Pro activated!'); return; }
        if (r.status === 'EXPIRED') { toast.error('Payment window expired — start again.'); setPay(null); setPolling(false); return; }
      } catch { /* keep polling */ }
      if (!stop) setTimeout(tick, 5000);
    };
    const id = setTimeout(tick, 4000);
    return () => { stop = true; clearTimeout(id); };
  }, [pay, onActivated]);

  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success('Copied'); };
  const qrValue = pay ? (pay.method === 'XMR' ? `monero:${pay.address}?tx_amount=${pay.amount}` : pay.method === 'LN' ? pay.address.toUpperCase() : pay.address) : '';

  const walletUri = pay ? (pay.method === 'XMR' ? qrValue : pay.method === 'LN' ? `lightning:${pay.address}` : (pay.paymentUrl || '')) : '';
  if (pay) {
    return (
      <div className="max-w-md w-full mx-auto bg-wr-surface border border-wr-border rounded-sm p-6 text-center space-y-4">
        <div className="flex items-center justify-center gap-2 text-sm font-bold text-wr-accent"><Loader2 size={16} className="animate-spin" /> {t('gmpro.awaiting_pay', 'Awaiting payment…')}</div>
        <p className="text-xs text-wr-dim">{pay.email} · {t('gmpro.pay_send', 'Send')} <b className="text-current">{pay.amount} {pay.method === 'XMR' ? 'XMR' : pay.method === 'USDT' ? 'USDT' : 'sats'}</b> (${pay.usd})</p>
        {pay.method === 'USDT' && <p className="text-[11px] text-wr-accent font-bold uppercase tracking-wider">{CHAIN_LABEL[(pay.chain as UsdtChain)] || pay.chain} {t('gmpro.network_only', '— send on this network only')}</p>}
        <div className="bg-white p-4 rounded-sm inline-block"><QRCodeCanvas value={qrValue} size={190} /></div>
        <button onClick={() => copy(pay.address)} className="w-full flex items-center justify-between gap-2 bg-wr-base border border-wr-border rounded-sm px-3 py-2.5 text-[11px] font-mono">
          <span className="truncate text-wr-dim">{pay.address}</span><Copy size={13} className="text-wr-dim shrink-0" />
        </button>
        {walletUri && (
          <a href={walletUri} className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-widest rounded-sm bg-wr-accent text-black hover:bg-wr-accent/90 transition-all">
            <Wallet size={14} /> {pay.method === 'USDT' ? t('gmpro.open_pay', 'Open payment page') : t('gmpro.open_wallet', 'Open in wallet')}
          </a>
        )}
        {polling && <p className="text-[11px] text-wr-dim">{t('gmpro.auto_activate', 'Activates automatically once the payment confirms. Keep this page open.')}</p>}
        <button onClick={() => setPay(null)} className="text-xs text-wr-dim hover:text-current uppercase tracking-widest">{t('common.cancel', 'Cancel')}</button>
      </div>
    );
  }

  return (
    <div className="mx-2 md:mx-0 space-y-5">
      {/* Plans */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {plans && (Object.keys(plans.plans) as ProPlan[]).map((p) => {
          const d = plans.plans[p]; const active = plan === p;
          return (
            <button key={p} onClick={() => setPlan(p)} className={`text-left rounded-sm p-5 border transition-all ${active ? 'border-wr-accent bg-wr-accent/5' : 'border-wr-border bg-wr-surface hover:border-wr-accent/40'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-black tracking-wide">{d.label}</span>
                {active && <Check size={16} className="text-wr-accent" />}
              </div>
              <div className="text-2xl font-black text-wr-accent">${d.monthlyUSD}<span className="text-xs text-wr-dim font-bold">/mo</span></div>
              <div className="text-[11px] text-wr-dim mt-1">{d.aliasLimit} {t('gmpro.aliases', 'aliases')} · {t('gmpro.send_recv', 'send + receive')} · {t('gmpro.persistent', 'persistent')}</div>
            </button>
          );
        })}
      </div>

      {/* Address + method */}
      <div className="bg-wr-surface border border-wr-border rounded-sm p-5 space-y-3">
        <label className="text-xs text-wr-dim uppercase tracking-widest font-bold">{t('gmpro.choose_address', 'Choose your address')}</label>
        <div className="flex gap-2">
          <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="yourname" className="flex-1 px-3 py-2.5 bg-wr-base border border-wr-border rounded-sm font-mono text-sm outline-none focus:border-wr-accent/50" />
          <span className="flex items-center text-wr-dim font-mono text-sm">@</span>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="px-2 py-2.5 bg-wr-base border border-wr-border rounded-sm font-mono text-sm outline-none">
            {(plans?.domains || ['vigilpro.xyz', 'vigilplus.xyz']).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {(['XMR', 'LN', 'USDT'] as const).map((m) => (
            <button key={m} onClick={() => setMethod(m)} className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-sm border transition-all ${method === m ? 'bg-wr-accent text-black border-wr-accent' : 'border-wr-border text-wr-dim hover:text-current'}`}>
              {m === 'XMR' ? 'Monero' : m === 'LN' ? 'Lightning' : 'USDT'}
            </button>
          ))}
        </div>
        {method === 'USDT' && (
          <div className="flex gap-2">
            {(['tron', 'eth'] as const).map((ch) => (
              <button key={ch} onClick={() => setChain(ch)} className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider rounded-sm border transition-all ${chain === ch ? 'border-wr-accent text-wr-accent bg-wr-accent/5' : 'border-wr-border text-wr-dim hover:text-current'}`}>
                {CHAIN_LABEL[ch]}
              </button>
            ))}
          </div>
        )}
        <button onClick={start} disabled={busy || !username} className="w-full py-3 text-xs font-black uppercase tracking-widest rounded-sm bg-wr-accent text-black hover:bg-wr-accent/90 disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Crown size={14} />} {t('gmpro.subscribe', 'Subscribe')} — ${plans?.plans[plan].monthlyUSD}/mo
        </button>
        <button onClick={restore} className="w-full text-[11px] text-wr-dim hover:text-current">{t('gmpro.have_account', 'Already have a Pro account? Restore it →')}</button>
      </div>
    </div>
  );
}

// ── Dashboard (active account) ──
function Dashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('inbox');
  const [acct, setAcct] = useState<AliasesResp | null>(null);
  const [showRenew, setShowRenew] = useState(false);

  const loadAcct = useCallback(() => {
    mailApiClient<AliasesResp>(`/v1/mail/pro/aliases?email=${encodeURIComponent(session.email)}&token=${encodeURIComponent(session.token)}`)
      .then(setAcct).catch(() => {});
  }, [session]);
  useEffect(() => { loadAcct(); }, [loadAcct]);

  const sendDisabled = acct ? (acct.sendEnabled === false || acct.subStatus !== 'active') : false;
  const monthlyUSD = acct?.plan === 'PRO_PLUS' ? 5 : 3;
  const daysLeft = acct?.nextBillingAt ? Math.ceil((acct.nextBillingAt - Date.now()) / 86400000) : null;
  const expiringSoon = daysLeft != null && daysLeft <= 7;

  return (
    <div className="mx-2 md:mx-0 space-y-4">
      {/* Account header */}
      <div className="bg-wr-surface border border-wr-border rounded-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-black"><Crown size={15} className="text-wr-accent" /> {session.email}</div>
          <div className="text-[11px] text-wr-dim mt-0.5">
            {acct ? `${acct.plan === 'PRO_PLUS' ? 'GHOST PRO+' : 'GHOST PRO'} · ${acct.aliasesRemaining}/${acct.aliasLimit} ${t('gmpro.aliases_left', 'aliases free')}` : '…'}
            {acct?.nextBillingAt && ` · ${t('gmpro.renews', 'renews')} ${new Date(acct.nextBillingAt).toLocaleDateString()}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowRenew(true)} className="text-[11px] px-3 py-2 border border-wr-accent/40 text-wr-accent rounded-sm hover:bg-wr-accent/10 flex items-center gap-1"><RefreshCw size={12} /> {t('gmpro.renew', 'Renew')}</button>
          <button onClick={() => { navigator.clipboard.writeText(session.token); toast.success(t('gmpro.token_copied', 'Access token copied — keep it safe to restore your account')); }} className="text-[11px] px-3 py-2 border border-wr-border rounded-sm text-wr-dim hover:text-current">{t('gmpro.copy_token', 'Copy token')}</button>
          <button onClick={onSignOut} className="text-[11px] px-3 py-2 border border-wr-border rounded-sm text-wr-dim hover:text-current flex items-center gap-1"><LogOut size={12} /> {t('gmpro.sign_out', 'Sign out')}</button>
        </div>
      </div>

      {(expiringSoon || sendDisabled) && (
        <div className={`text-[11px] rounded-sm p-3 flex items-center justify-between gap-2 ${sendDisabled ? 'text-red-400 bg-red-500/5 border border-red-500/20' : 'text-wr-accent bg-wr-accent/5 border border-wr-accent/20'}`}>
          <span className="flex items-center gap-2"><Clock size={13} />
            {sendDisabled ? t('gmpro.lapsed', 'Subscription lapsed — renew to re-enable sending.') : `${t('gmpro.expiring', 'Subscription renews in')} ${daysLeft} ${t('gmpro.days', 'days')}.`}
          </span>
          <button onClick={() => setShowRenew(true)} className="shrink-0 font-bold uppercase tracking-widest hover:underline">{t('gmpro.renew_now', 'Renew now')} →</button>
        </div>
      )}

      {showRenew && <RenewModal session={session} monthlyUSD={monthlyUSD} onClose={() => setShowRenew(false)} onRenewed={() => { setShowRenew(false); loadAcct(); }} />}

      {sendDisabled && (
        <div className="text-[11px] text-wr-accent bg-wr-accent/5 border border-wr-accent/20 rounded-sm p-3 flex items-center gap-2">
          <ShieldCheck size={14} /> {t('gmpro.send_gated', 'Sending activates once the send-domain finishes onboarding. Receiving works now.')}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-wr-border">
        {([['inbox', Inbox, 'Inbox'], ['compose', Send, 'Compose'], ['aliases', AtSign, 'Aliases'], ['sent', Mail, 'Sent']] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest border-b-2 -mb-px transition-all ${tab === id ? 'border-wr-accent text-wr-accent' : 'border-transparent text-wr-dim hover:text-current'}`}>
            <Icon size={13} /> {t(`gmpro.tab_${id}`, label)}
          </button>
        ))}
      </div>

      {tab === 'inbox' && <InboxTab session={session} />}
      {tab === 'compose' && <ComposeTab session={session} acct={acct} disabled={sendDisabled} />}
      {tab === 'aliases' && <AliasesTab session={session} acct={acct} reload={loadAcct} />}
      {tab === 'sent' && <SentTab session={session} />}
    </div>
  );
}

function RenewModal({ session, monthlyUSD, onClose, onRenewed }: { session: Session; monthlyUSD: number; onClose: () => void; onRenewed: () => void }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<'XMR' | 'LN' | 'USDT'>('XMR');
  const [chain, setChain] = useState<UsdtChain>('tron');
  const [pay, setPay] = useState<{ address: string; amount: number; method: string; usd: number; paymentId: string; paymentUrl?: string; chain?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const r = await mailApiClient<any>('/v1/mail/pro/renew/create', { method: 'POST', body: { email: session.email, token: session.token, method, ...(method === 'USDT' ? { chain } : {}) } });
      setPay(r);
    } catch (e: any) { toast.error(e?.data?.error || 'Failed to start renewal'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!pay) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await mailApiClient<{ status: string }>(`/v1/mail/pro/renew/check?paymentId=${encodeURIComponent(pay.paymentId)}`);
        if (r.status === 'COMPLETED') { toast.success(t('gmpro.renewed', 'Subscription renewed +1 month!')); onRenewed(); return; }
        if (r.status === 'EXPIRED' || r.status === 'ERROR') { toast.error('Renewal window expired.'); setPay(null); return; }
      } catch { /* keep polling */ }
      if (!stop) setTimeout(tick, 5000);
    };
    const id = setTimeout(tick, 4000);
    return () => { stop = true; clearTimeout(id); };
  }, [pay, onRenewed, t]);

  const qr = pay ? (pay.method === 'XMR' ? `monero:${pay.address}?tx_amount=${pay.amount}` : pay.method === 'LN' ? pay.address.toUpperCase() : pay.address) : '';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-wr-base border border-wr-border rounded-lg w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-wr-border flex justify-between items-center">
          <span className="text-sm font-bold flex items-center gap-2"><RefreshCw size={15} className="text-wr-accent" /> {t('gmpro.renew', 'Renew')} — ${monthlyUSD}/mo</span>
          <button onClick={onClose} className="text-wr-dim"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3 text-center">
          {!pay ? (
            <>
              <p className="text-xs text-wr-dim">{t('gmpro.renew_desc', 'Extend your Pro subscription by one month. Aliases, sending and inbox all continue.')}</p>
              <div className="flex gap-2">
                {(['XMR', 'LN', 'USDT'] as const).map((m) => (
                  <button key={m} onClick={() => setMethod(m)} className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-sm border ${method === m ? 'bg-wr-accent text-black border-wr-accent' : 'border-wr-border text-wr-dim'}`}>{m === 'XMR' ? 'Monero' : m === 'LN' ? 'Lightning' : 'USDT'}</button>
                ))}
              </div>
              {method === 'USDT' && (
                <div className="flex gap-2">
                  {(['tron', 'eth'] as const).map((ch) => (
                    <button key={ch} onClick={() => setChain(ch)} className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider rounded-sm border ${chain === ch ? 'border-wr-accent text-wr-accent bg-wr-accent/5' : 'border-wr-border text-wr-dim'}`}>{CHAIN_LABEL[ch]}</button>
                  ))}
                </div>
              )}
              <button onClick={start} disabled={busy} className="w-full py-3 text-xs font-black uppercase tracking-widest rounded-sm bg-wr-accent text-black disabled:opacity-50 flex items-center justify-center gap-2">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {t('gmpro.renew_now', 'Renew now')}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-wr-accent"><Loader2 size={14} className="animate-spin" /> {t('gmpro.awaiting_pay', 'Awaiting payment…')}</div>
              <p className="text-[11px] text-wr-dim">{t('gmpro.pay_send', 'Send')} <b className="text-current">{pay.amount} {pay.method === 'XMR' ? 'XMR' : pay.method === 'USDT' ? 'USDT' : 'sats'}</b> (${pay.usd})</p>
              {pay.method === 'USDT' && <p className="text-[11px] text-wr-accent font-bold uppercase tracking-wider">{CHAIN_LABEL[(pay.chain as UsdtChain)] || pay.chain} {t('gmpro.network_only', '— send on this network only')}</p>}
              <div className="bg-white p-3 rounded-sm inline-block"><QRCodeCanvas value={qr} size={170} /></div>
              <button onClick={() => { navigator.clipboard.writeText(pay.address); toast.success('Copied'); }} className="w-full flex items-center justify-between gap-2 bg-wr-surface border border-wr-border rounded-sm px-3 py-2 text-[11px] font-mono"><span className="truncate text-wr-dim">{pay.address}</span><Copy size={12} className="shrink-0 text-wr-dim" /></button>
              {(pay.method === 'XMR' ? qr : pay.method === 'LN' ? `lightning:${pay.address}` : pay.paymentUrl) && (
                <a href={pay.method === 'XMR' ? qr : pay.method === 'LN' ? `lightning:${pay.address}` : pay.paymentUrl} className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-widest rounded-sm bg-wr-accent text-black hover:bg-wr-accent/90 transition-all">
                  <Wallet size={13} /> {pay.method === 'USDT' ? t('gmpro.open_pay', 'Open payment page') : t('gmpro.open_wallet', 'Open in wallet')}
                </a>
              )}
              <p className="text-[10px] text-wr-dim">{t('gmpro.auto_renew', 'Extends automatically once the payment confirms.')}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Strip leading Re:/Fwd:/Aw: etc. so replies collapse into one thread.
function threadKey(subject: string): string {
  return (subject || '').replace(/^\s*((re|fwd?|aw|sv|vs)\s*:\s*)+/i, '').trim().toLowerCase() || '(no subject)';
}

function InboxTab({ session }: { session: Session }) {
  const { t } = useTranslation();
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const load = useCallback(() => {
    setLoading(true);
    fetchInbox(session.email, session.token).then((r: any) => setEmails(r.emails || [])).catch(() => {}).finally(() => setLoading(false));
  }, [session]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter((e) =>
      (e.subject || '').toLowerCase().includes(q) ||
      (e.from || '').toLowerCase().includes(q) ||
      (e.fromName || '').toLowerCase().includes(q) ||
      (e.text || '').toLowerCase().includes(q));
  }, [emails, search]);

  // Group into threads; emails arrive newest-first so each group's [0] is newest.
  const threads = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of filtered) {
      const k = threadKey(e.subject);
      const arr = map.get(k);
      if (arr) arr.push(e); else map.set(k, [e]);
    }
    return Array.from(map.entries()).sort((a, b) => new Date(b[1][0].receivedAt).getTime() - new Date(a[1][0].receivedAt).getTime());
  }, [filtered]);

  const toggle = (k: string) => setExpanded((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const Row = ({ e, nested }: { e: any; nested?: boolean }) => (
    <button onClick={() => setOpen(e)} className={`w-full text-left border border-wr-border hover:border-wr-accent/40 rounded-sm p-3 transition-all ${nested ? 'bg-wr-base/40' : 'bg-wr-surface'}`}>
      <div className="flex justify-between gap-2"><span className="text-xs font-bold truncate">{e.fromName || e.from}</span><span className="text-[10px] text-wr-dim shrink-0">{new Date(e.receivedAt).toLocaleString()}</span></div>
      <div className="text-xs text-wr-dim truncate mt-0.5">{e.subject}</div>
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-wr-dim" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('gmpro.search', 'Search mail…')} className="w-full pl-8 pr-3 py-2 bg-wr-base border border-wr-border rounded-sm text-xs outline-none focus:border-wr-accent/50" />
        </div>
        <button onClick={load} className="text-[11px] text-wr-dim hover:text-current flex items-center gap-1 px-2 py-2 shrink-0"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {t('gmpro.refresh', 'Refresh')}</button>
      </div>
      <div className="text-[11px] text-wr-dim uppercase tracking-widest px-0.5">
        {filtered.length} {t('gmpro.messages', 'messages')}{threads.length !== filtered.length ? ` · ${threads.length} ${t('gmpro.threads', 'threads')}` : ''}
      </div>
      {filtered.length === 0 && !loading && <div className="text-center py-10 text-wr-dim text-sm">{search ? t('gmpro.no_match', 'No mail matches your search.') : t('gmpro.empty_inbox', 'No mail yet. Give your address (or an alias) to someone.')}</div>}
      {threads.map(([k, msgs]) => {
        if (msgs.length === 1) return <Row key={msgs[0].id} e={msgs[0]} />;
        const isOpen = expanded.has(k);
        return (
          <div key={k} className="space-y-1">
            <div className="flex items-stretch gap-1">
              <div className="flex-1 min-w-0"><Row e={msgs[0]} /></div>
              <button onClick={() => toggle(k)} className="shrink-0 px-2 rounded-sm border border-wr-border text-[10px] font-bold text-wr-dim hover:text-wr-accent hover:border-wr-accent/40 flex items-center gap-1" title={t('gmpro.thread_toggle', 'Show thread')}>
                {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {msgs.length}
              </button>
            </div>
            {isOpen && <div className="pl-4 space-y-1 border-l border-wr-border/50 ml-1">{msgs.slice(1).map((e) => <Row key={e.id} e={e} nested />)}</div>}
          </div>
        );
      })}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setOpen(null)}>
          <div className="bg-wr-base border border-wr-border rounded-lg w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden" onClick={(ev) => ev.stopPropagation()}>
            <div className="px-4 py-2.5 border-b border-wr-border flex justify-between items-center shrink-0">
              <span className="text-[11px] text-wr-dim uppercase tracking-widest">{t('gmpro.reading', 'Reading')}</span>
              <button onClick={() => setOpen(null)} className="text-wr-dim hover:text-current"><X size={17} /></button>
            </div>
            <EmailReader
              email={open}
              attachmentHref={(att: ReaderAttachment) =>
                `${getMailApiBase()}/v1/mail/pro/attachment?email=${encodeURIComponent(session.email)}&token=${encodeURIComponent(session.token)}&emailId=${encodeURIComponent(open.id)}&attId=${encodeURIComponent(att.id)}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ComposeTab({ session, acct, disabled }: { session: Session; acct: AliasesResp | null; disabled: boolean }) {
  const { t } = useTranslation();
  const froms = useMemo(() => acct ? [acct.primary, ...acct.aliases] : [session.email], [acct, session]);
  const [from, setFrom] = useState(session.email);
  const [to, setTo] = useState(''); const [subject, setSubject] = useState(''); const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFrom(session.email); }, [session]);

  const send = async () => {
    if (!to || !text) { toast.error(t('gmpro.fill_fields', 'Recipient and message required')); return; }
    setBusy(true);
    try {
      const r = await mailApiClient<{ ok: boolean; remaining?: number }>('/v1/mail/pro/send', { method: 'POST', body: { email: session.email, token: session.token, from, to, subject, text } });
      if (r.ok) { toast.success(t('gmpro.sent', 'Sent!') + (r.remaining != null ? ` (${r.remaining} left today)` : '')); setTo(''); setSubject(''); setText(''); }
    } catch (e: any) { toast.error(e?.data?.error || e?.message || 'Send failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-wr-surface border border-wr-border rounded-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-wr-dim uppercase w-12">{t('gmpro.from', 'From')}</span>
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 px-2 py-2 bg-wr-base border border-wr-border rounded-sm font-mono text-xs outline-none">
          {froms.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-wr-dim uppercase w-12">{t('gmpro.to', 'To')}</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="someone@example.com" className="flex-1 px-3 py-2 bg-wr-base border border-wr-border rounded-sm font-mono text-xs outline-none focus:border-wr-accent/50" />
      </div>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('gmpro.subject', 'Subject')} className="w-full px-3 py-2 bg-wr-base border border-wr-border rounded-sm text-sm outline-none focus:border-wr-accent/50" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={t('gmpro.write', 'Write your message…')} className="w-full px-3 py-2 bg-wr-base border border-wr-border rounded-sm text-sm outline-none focus:border-wr-accent/50 resize-y" />
      <button onClick={send} disabled={busy || disabled} className="w-full py-3 text-xs font-black uppercase tracking-widest rounded-sm bg-wr-accent text-black hover:bg-wr-accent/90 disabled:opacity-50 flex items-center justify-center gap-2">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {disabled ? t('gmpro.send_soon', 'Sending activates after onboarding') : t('gmpro.send', 'Send')}
      </button>
    </div>
  );
}

function AliasesTab({ session, acct, reload }: { session: Session; acct: AliasesResp | null; reload: () => void }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(''); const [domain, setDomain] = useState('vigilpro.xyz');
  const [busy, setBusy] = useState(false); const [copied, setCopied] = useState('');

  const create = async (random: boolean) => {
    setBusy(true);
    try {
      await mailApiClient('/v1/mail/pro/alias/create', { method: 'POST', body: { email: session.email, token: session.token, username: random ? undefined : username, domain } });
      toast.success(t('gmpro.alias_created', 'Alias created')); setUsername(''); reload();
    } catch (e: any) { toast.error(e?.data?.error || e?.message || 'Failed'); }
    finally { setBusy(false); }
  };
  const del = async (alias: string) => {
    if (!confirm(t('gmpro.confirm_del', `Delete ${alias}? Mail to it will stop arriving.`))) return;
    try { await mailApiClient('/v1/mail/pro/alias/delete', { method: 'POST', body: { email: session.email, token: session.token, alias } }); reload(); }
    catch (e: any) { toast.error(e?.data?.error || 'Failed'); }
  };
  const copy = (s: string) => { navigator.clipboard.writeText(s); setCopied(s); setTimeout(() => setCopied(''), 1500); };

  return (
    <div className="space-y-3">
      <div className="bg-wr-surface border border-wr-border rounded-sm p-4 space-y-3">
        <div className="text-[11px] text-wr-dim uppercase tracking-widest">{t('gmpro.new_alias', 'New alias')} · {acct ? `${acct.aliasesRemaining}/${acct.aliasLimit} ${t('gmpro.free', 'free')}` : ''}</div>
        <div className="flex gap-2">
          <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="alias" className="flex-1 px-3 py-2 bg-wr-base border border-wr-border rounded-sm font-mono text-xs outline-none focus:border-wr-accent/50" />
          <span className="flex items-center text-wr-dim text-xs">@</span>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="px-2 py-2 bg-wr-base border border-wr-border rounded-sm font-mono text-xs outline-none">
            {(acct?.domains || ['vigilpro.xyz', 'vigilplus.xyz']).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => create(false)} disabled={busy || !username} className="flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-sm bg-wr-accent text-black disabled:opacity-50 flex items-center justify-center gap-1"><Plus size={13} /> {t('gmpro.add', 'Add')}</button>
          <button onClick={() => create(true)} disabled={busy} className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest rounded-sm border border-wr-border text-wr-dim hover:text-current disabled:opacity-50">{t('gmpro.random', 'Random')}</button>
        </div>
      </div>
      <div className="space-y-2">
        {acct?.aliases.map((a) => (
          <div key={a} className="flex items-center justify-between bg-wr-surface border border-wr-border rounded-sm px-3 py-2.5">
            <button onClick={() => copy(a)} className="text-xs font-mono flex items-center gap-1.5 hover:text-wr-accent truncate">{a} {copied === a ? <Check size={12} className="text-green-400" /> : <Copy size={11} className="text-wr-dim" />}</button>
            <button onClick={() => del(a)} className="text-wr-dim hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
          </div>
        ))}
        {acct && acct.aliases.length === 0 && <div className="text-center py-8 text-wr-dim text-sm">{t('gmpro.no_aliases', 'No aliases yet. Create one — all mail lands in this inbox.')}</div>}
      </div>
    </div>
  );
}

function SentTab({ session }: { session: Session }) {
  const { t } = useTranslation();
  const [sent, setSent] = useState<SentItem[]>([]);
  useEffect(() => { mailApiClient<{ sent: SentItem[] }>(`/v1/mail/pro/sent?email=${encodeURIComponent(session.email)}&token=${encodeURIComponent(session.token)}`).then((r) => setSent(r.sent || [])).catch(() => {}); }, [session]);
  return (
    <div className="space-y-2">
      {sent.length === 0 && <div className="text-center py-10 text-wr-dim text-sm">{t('gmpro.no_sent', 'Nothing sent yet.')}</div>}
      {sent.map((s) => (
        <div key={s.id} className="bg-wr-surface border border-wr-border rounded-sm p-3">
          <div className="flex justify-between gap-2"><span className="text-xs font-bold truncate">→ {s.to}</span><span className="text-[10px] text-wr-dim shrink-0 flex items-center gap-1"><Clock size={10} /> {new Date(s.sentAt).toLocaleString()}</span></div>
          <div className="text-xs text-wr-dim truncate mt-0.5">{s.subject}</div>
          <div className="text-[10px] text-wr-dim mt-0.5">{t('gmpro.from', 'From')}: {s.from}</div>
        </div>
      ))}
    </div>
  );
}
