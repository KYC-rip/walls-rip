import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Phone, RefreshCw, Shield, Wallet, Plus, ChevronRight, Key, X } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'react-hot-toast';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';
import { PaymentGate } from '../components/PaymentGate';
import { apiClient, APIError } from '../services/client';
import { SUPPORTED_LANGS } from '../i18n/config';

type Kind = 'vpn' | 'phone';
type Protocol = 'wireguard' | 'openvpn' | 'vless';
const displayOrderId = (id: string): string => (id.includes(':') ? id.split(':').slice(1).join(':') : id);

interface Plan { id: string; name: string; price: number; days?: number; durationDays?: number; months?: number; country?: string; provider?: string }
interface Server { id: number; country_code: string; city: string; protocol: Protocol }
interface Catalog { available: boolean; plans: Plan[]; reason?: string; protocols?: Protocol[]; servers?: Server[] }
interface Order {
  orderId: string; planId: string; name: string; createdAt: number; charged: number;
  status?: string; expiresAt?: number; username?: string; password?: string;
  provider?: string; engine?: string; deliveryUnavailable?: boolean;
  qrCode?: string; activationUrl?: string; smdpAddress?: string; activationCode?: string; pukCode?: string;
}
interface Renewal { periods: number; days: number; price: number }
interface RenewalOffer { id: string; price: number; available: boolean }
const WALLET_KEY = 'walls_sms_wallet';
const panel = 'border border-wr-border/50 bg-wr-surface/50 rounded-sm p-5';
const button = 'px-4 py-2 border border-wr-border rounded-sm text-xs font-bold uppercase tracking-wider transition-colors hover:border-wr-accent hover:text-wr-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-wr-accent disabled:opacity-40 disabled:cursor-not-allowed';

export function ConnectivityWall({ kind, mode = 'buy' }: { kind: Kind; mode?: 'buy' | 'topup' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language !== 'en' && (SUPPORTED_LANGS as readonly string[]).includes(i18n.language) ? `/${i18n.language}` : '';
  const isVPN = kind === 'vpn';
  const isTopup = kind === 'phone' && mode === 'topup';
  const base = isVPN ? '/v1/tools/vpn' : '/v1/tools/phone/rentals';
  const title = isVPN ? 'Private VPN' : 'Phone eSIMs';
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem(WALLET_KEY) || '');
  const [restore, setRestore] = useState('');
  const [showRestoreInput, setShowRestoreInput] = useState(false);
  const [restoringWallet, setRestoringWallet] = useState(false);
  const [balance, setBalance] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<number | null>(null);
  const [protocol, setProtocol] = useState<Protocol>('wireguard');
  const [serverId, setServerId] = useState('');
  const [config, setConfig] = useState<{ content: string; qrPayload?: string } | null>(null);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [renewalOffers, setRenewalOffers] = useState<RenewalOffer[]>([]);
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('GB');
  const auth = { Authorization: `Bearer ${token}` };
  // Keep the same purchase reference after an uncertain response. A timeout
  // must never turn the next click into a second funded order.
  const attempt = useRef<{ item: string; ref: string } | null>(null);
  const session = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setCatalog(null); setError('');
    if (isTopup) return () => { cancelled = true; };
    apiClient<Catalog>(`${base}/plans`).then(data => { if (!cancelled) setCatalog(data); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [base, isTopup]);

  useEffect(() => {
    if (isVPN || isTopup) return;
    let cancelled = false;
    apiClient<{ offers: RenewalOffer[] }>('/v1/tools/walls/catalog', {
      body: { product: 'renewal', inputs: { provider: 'buyukesim' } },
    }).then(result => { if (!cancelled) setRenewalOffers(result.offers.filter(offer => offer.available)); })
      .catch(() => { /* The owned-order renewal screen still fetches live prices. */ });
    return () => { cancelled = true; };
  }, [isVPN, isTopup]);

  useEffect(() => {
    if (catalog?.protocols?.length) setProtocol(current => catalog.protocols!.includes(current) ? current : catalog.protocols![0]);
  }, [catalog]);

  const loadOrders = useCallback(async (nextCursor?: string) => {
    if (!token) return;
    const version = session.current;
    try {
      const result = await apiClient<{ orders: Order[]; cursor: string | null }>(
        `${base}/orders${nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (version !== session.current) return;
      setOrders(previous => nextCursor ? [...previous, ...result.orders] : result.orders);
      setCursor(result.cursor);
    } catch (e) { if (version === session.current) toast.error((e as Error).message); }
  }, [base, token]);

  const refreshBalance = useCallback(async () => {
    if (!token) return;
    const version = session.current;
    try {
      const result = await apiClient<{ balanceUSD: number }>(`/v1/tools/sms/balance?token=${encodeURIComponent(token)}`);
      if (version === session.current) setBalance(result.balanceUSD);
    } catch { /* A dormant wallet can still open its old orders. Deposit to reopen it. */ }
  }, [token]);

  useEffect(() => {
    session.current++;
    setOrder(null); setConfig(null); setOrders([]); setCursor(null); setBalance(0); setRenewals([]); setPhone(''); setBusy(false);
    attempt.current = null;
    void loadOrders(); void refreshBalance();
  }, [loadOrders, refreshBalance]);

  const openOrder = async (id: string) => {
    setBusy(true); setConfig(null); setRenewals([]); setError('');
    const version = session.current;
    try {
      const current = await apiClient<Order>(`${base}/status?order_id=${encodeURIComponent(id)}`, { headers: auth });
      if (version !== session.current) return;
      setOrder(current);
      if (!isVPN && (current.provider || current.engine) === 'buyukesim') {
        const result = await apiClient<{ plans: Renewal[] }>(`${base}/renewal-plans?order_id=${encodeURIComponent(id)}`, { headers: auth });
        if (version === session.current) setRenewals(result.plans);
      }
    } catch (e) { if (version === session.current) setError((e as Error).message); }
    finally { if (version === session.current) setBusy(false); }
  };

  useEffect(() => {
    if (order?.status !== 'PENDING' || !token) return;
    let cancelled = false;
    let inFlight = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > 180_000) { clearInterval(timer); return; }
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await apiClient<Order>(`${base}/status?order_id=${encodeURIComponent(order.orderId)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!cancelled) setOrder(result);
      } catch { /* Manual refresh remains available if provisioning is slow. */ }
      finally { inFlight = false; }
    }, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [order?.orderId, order?.status, base, token]);

  const rememberWallet = (value: string) => {
    localStorage.setItem(WALLET_KEY, value);
    setToken(value);
  };
  const handleRestoreWallet = async () => {
    const value = restore.trim();
    if (!/^[a-f0-9]{64}$/i.test(value)) { toast.error('Enter a valid wallet token.'); return; }
    setRestoringWallet(true);
    try {
      const result = await apiClient<{ balanceUSD: number }>(`/v1/tools/sms/balance?token=${encodeURIComponent(value)}`);
      rememberWallet(value); setBalance(result.balanceUSD); setRestore(''); setShowRestoreInput(false);
      toast.success('Wallet restored!');
    } catch { toast.error('Invalid wallet token'); }
    finally { setRestoringWallet(false); }
  };
  const purchase = async (plan: Plan) => {
    if (!token || balance < plan.price) { setPayment(Math.max(1, plan.price - balance)); return; }
    setBusy(true); setError(''); setConfig(null);
    const version = session.current;
    const item = `${kind}:${plan.id}`;
    if (attempt.current?.item !== item) attempt.current = { item, ref: crypto.randomUUID() };
    try {
      const result = await apiClient<Order & { balanceUSD: number }>(`${base}/purchase`, {
        body: { planId: plan.id, engine: plan.provider || 'buyukesim', clientRef: attempt.current.ref }, headers: auth, timeout: 25000,
      });
      if (version !== session.current) return;
      attempt.current = null;
      setOrder(result); setBalance(result.balanceUSD); void loadOrders();
      if (!isVPN) void openOrder(result.orderId);
      toast.success(isVPN ? 'VPN order created' : 'UK-number order created');
    } catch (e) { if (version === session.current) {
      if (e instanceof APIError && (e.data as { code?: string })?.code === 'PROVIDER_REFUSED') attempt.current = null;
      setError((e as Error).message); void refreshBalance();
    } }
    finally { if (version === session.current) setBusy(false); }
  };

  const getConfig = async () => {
    if (!order || !serverId) return;
    setBusy(true); setConfig(null); setError('');
    const version = session.current;
    try {
      const result = await apiClient<{ content: string; qrPayload?: string }>(
        `${base}/config?order_id=${encodeURIComponent(order.orderId)}&protocol=${protocol}&server_id=${serverId}`, { headers: auth });
      if (version === session.current) setConfig(result);
    } catch (e) { if (version === session.current) setError((e as Error).message); }
    finally { if (version === session.current) setBusy(false); }
  };
  const download = () => {
    if (!config) return;
    const url = URL.createObjectURL(new Blob([config.content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `walls-vpn.${protocol === 'wireguard' ? 'conf' : protocol === 'openvpn' ? 'ovpn' : 'txt'}`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const renew = async (plan: Renewal) => {
    if (!order || !/^\+447\d{9}$/.test(phone)) { toast.error('Enter the +44 mobile number assigned to this eSIM.'); return; }
    if (balance < plan.price) { setPayment(Math.max(1, plan.price - balance)); return; }
    setBusy(true); setError('');
    const version = session.current;
    const item = `renew:${order.orderId}:${plan.periods}`;
    if (attempt.current?.item !== item) attempt.current = { item, ref: crypto.randomUUID() };
    try {
      const result = await apiClient<{ balanceUSD: number }>(`${base}/renew`, {
        body: { orderId: order.orderId, phone, periods: plan.periods, clientRef: attempt.current.ref }, headers: auth, timeout: 25000,
      });
      if (version !== session.current) return;
      attempt.current = null; setBalance(result.balanceUSD);
      toast.success('Renewal paid. Refresh the order to check delivery.');
    } catch (e) { if (version === session.current) {
      if (e instanceof APIError && (e.data as { code?: string })?.code === 'PROVIDER_REFUSED') attempt.current = null;
      setError((e as Error).message); void refreshBalance();
    } }
    finally { if (version === session.current) setBusy(false); }
  };
  const copy = (value: string) => { void navigator.clipboard.writeText(value).then(() => toast.success('Copied')).catch(() => toast.error('Could not copy')); };
  const compatibleServers = (catalog?.servers || []).filter(s => protocol === 'vless' ? s.protocol === 'vless' : s.protocol === 'wireguard' || s.protocol === protocol);
  return <div className="min-h-screen bg-wr-base flex flex-col items-center font-mono">
    <SEO title={`${isTopup ? 'Renew your UK number' : title} — walls.rip`} path={isVPN ? '/vpn' : isTopup ? '/topup' : '/uk-sim'} description={isVPN ? 'Prepaid VPN access with WireGuard, OpenVPN and VLESS configuration downloads.' : 'A long-term UK phone eSIM for receiving SMS on your own phone, with prepaid renewals.'} />
    <Header />
    <main className="w-full max-w-6xl px-4 md:px-6 py-8 md:py-12 space-y-8 font-display">
      <section className="grid lg:grid-cols-[1.25fr_0.75fr] gap-6 lg:gap-10 items-stretch">
        <div className="py-2 md:py-6 space-y-5">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-wr-accent">{isVPN ? 'Connectivity / 01' : isTopup ? 'Connectivity / Renew' : 'Connectivity / 02'}</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.05]">{isVPN ? <>Private access.<br /><span className="text-wr-accent">On your terms.</span></> : isTopup ? <>Keep your number.<br /><span className="text-wr-accent">Add more time.</span></> : <>A number that<br /><span className="text-wr-accent">stays yours.</span></>}</h1>
          <p className="max-w-xl text-sm md:text-base leading-7 text-wr-dim">{isVPN
            ? 'Choose prepaid VPN access, then generate a configuration for your device and preferred protocol. Renewals are always in your control.'
            : isTopup ? 'Open the UK line you bought with this wallet, enter its +44 number, and extend it by 6, 12 or 24 months. Renew before its end date.'
            : 'A long-term UK phone eSIM for your own device. Choose a prepaid term, install the profile and receive SMS directly on the line.'}</p>
          {isTopup && <p className="text-xs text-wr-dim">The same eSIM and QR stay in place. This works for UK lines bought through walls.rip with this wallet. <Link className="text-wr-accent underline underline-offset-4" to={`${lang}/uk-sim`}>Buy a new line</Link>.</p>}
          {!isVPN && <p className="text-xs text-wr-dim">Need a temporary inbox number? <Link className="text-wr-accent underline underline-offset-4" to={`${lang}/sms`}>SMS rentals</Link>. Need travel data? <Link className="text-wr-accent underline underline-offset-4" to={`${lang}/esim`}>Browse data eSIMs</Link>.</p>}
          {isVPN && <div className="flex flex-wrap gap-2 pt-1">{(catalog?.protocols || ['wireguard', 'openvpn', 'vless']).map(p => <span key={p} className="px-2.5 py-1 border border-wr-border/70 text-[10px] uppercase tracking-widest text-wr-dim">{p}</span>)}</div>}
        </div>
        <div className="relative min-h-52 lg:min-h-64 border border-wr-border/50 bg-wr-surface/30 rounded-sm overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(var(--border-color) 1px, transparent 1px),linear-gradient(90deg,var(--border-color) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />
          <div className="absolute top-4 left-4 text-[9px] uppercase tracking-[0.2em] text-wr-dim">{isVPN ? 'Encrypted connection' : 'Mobile network'}</div>
          {isVPN ? <div className="relative flex flex-col items-center gap-4"><div className="w-24 h-24 border border-wr-accent/50 bg-wr-accent/5 rounded-sm flex items-center justify-center shadow-[0_0_45px_rgba(52,211,153,0.12)]"><Shield size={42} strokeWidth={1.2} className="text-wr-accent" /></div><div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-wr-green"><span className="w-1.5 h-1.5 rounded-full bg-wr-green animate-pulse" /> Private by design</div></div>
            : <div className="relative border border-wr-border bg-wr-base p-4 w-40 shadow-2xl"><div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-wr-dim"><span>eSIM</span><span>GB</span></div><div className="border-t border-wr-border my-3" /><Phone size={30} strokeWidth={1.2} className="text-wr-accent mx-auto my-4" /><div className="text-center text-[9px] uppercase tracking-widest text-wr-dim">Personal line</div></div>}
        </div>
      </section>
      <section className="mx-2 md:mx-0 bg-wr-surface border border-wr-border rounded-sm relative overflow-hidden group">
        <div className="absolute inset-0 bg-green-500/5 group-hover:bg-green-500/10 transition-colors pointer-events-none" />
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />
        <div className="p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-4 relative z-10">
            <div className="p-3 bg-green-500/10 text-green-400 rounded-full shrink-0 border border-green-400/20"><Wallet size={24} /></div>
            <div>
              <h2 className="text-green-400 font-bold tracking-widest text-sm mb-1 uppercase flex items-center gap-2">
                {token ? <>{t('sms.wallet_balance')} <span className="text-[9px] bg-green-500 text-black px-1.5 py-0.5 rounded-xs">${balance.toFixed(2)}</span></> : <>{t('sms.anonymous_wallet')} <span className="text-[9px] bg-wr-accent text-black px-1.5 py-0.5 rounded-xs">{t('sms.new')}</span></>}
              </h2>
              <p className="text-xs text-wr-dim font-mono leading-relaxed max-w-lg text-left">{token ? t('esim.wallet_shared') : t('esim.wallet_shared_new')}</p>
            </div>
          </div>
          <button onClick={() => setPayment(10)} className="relative z-10 w-full md:w-auto px-6 py-3 bg-green-500 hover:bg-green-400 text-black text-xs font-bold tracking-widest uppercase transition-all rounded-sm flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 hover:-translate-y-0.5">
            <Plus size={14} /> {token ? t('sms.top_up') : t('sms.deposit')} <ChevronRight size={14} />
          </button>
        </div>
        {!token && <div className="border-t border-wr-border/30 px-4 md:px-6 py-3 relative z-10">
          {showRestoreInput ? <div className="flex items-center gap-2">
            <input type="password" autoComplete="off" value={restore} onChange={e => setRestore(e.target.value)} placeholder={t('sms.paste_token')} aria-label={t('sms.restore_wallet')} className="flex-1 bg-wr-base border border-wr-border px-3 py-2 text-xs font-mono outline-none focus:border-green-400 rounded-sm text-current placeholder-wr-dim/30" onKeyDown={e => e.key === 'Enter' && void handleRestoreWallet()} />
            <button onClick={() => void handleRestoreWallet()} disabled={restoringWallet || !restore.trim()} className="px-4 py-2 bg-green-500/20 border border-green-400/30 text-green-400 text-xs font-bold uppercase tracking-widest hover:bg-green-500/30 transition-colors rounded-sm disabled:opacity-30">{restoringWallet ? <RefreshCw size={12} className="animate-spin" /> : t('sms.restore')}</button>
            <button onClick={() => { setShowRestoreInput(false); setRestore(''); }} className="p-2 text-wr-dim hover:text-wr-accent" aria-label="Cancel"><X size={14} /></button>
          </div> : <button onClick={() => setShowRestoreInput(true)} className="text-[10px] text-wr-dim hover:text-green-400 font-mono uppercase tracking-widest transition-colors flex items-center gap-2"><Key size={10} /> {t('sms.restore_wallet')}</button>}
        </div>}
      </section>
      {error && <div role="alert" className="border border-red-400/40 text-red-400 p-4 text-sm">{error}</div>}
      {!isTopup && !catalog && !error && <p role="status">Loading plans…</p>}
      {!isTopup && catalog && !catalog.available && <div className={panel}>{catalog.reason || 'Plans are currently unavailable.'}</div>}
      {!isVPN && catalog?.plans.some(p => p.country) && <label className="block text-sm">Country <select className={`${button} ml-3`} value={country} onChange={e => setCountry(e.target.value)}>
        {[...new Set(catalog.plans.map(p => p.country || 'GB'))].sort().map(code => <option key={code} value={code}>{code}</option>)}
      </select></label>}
      {!isTopup && <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Available plans">
        {catalog?.available && catalog.plans.filter(p => isVPN || (p.country || 'GB') === country).map((plan, index) => <article key={plan.id} className="group relative flex flex-col gap-5 p-5 border border-wr-border/50 bg-wr-surface/30 rounded-sm transition-colors hover:border-wr-accent/40">
          <div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-[0.18em] text-wr-dim">Plan {String(index + 1).padStart(2, '0')}</span><span className="text-[10px] uppercase tracking-widest text-wr-accent">{isVPN ? 'VPN' : 'UK eSIM'}</span></div>
          <div><h2 className="text-lg font-bold leading-snug">{plan.name}</h2><p className="mt-2 text-xs text-wr-dim">{plan.months ? `${plan.months} months prepaid` : `${plan.days || plan.durationDays || 0} days prepaid`}{plan.country ? ` · ${plan.country}` : ''}</p></div>
          <p className="text-xs text-wr-dim leading-relaxed">{isVPN
            ? 'If no server connects after support troubleshooting, contact us for a refund review.'
            : 'No routine refund after the UK line QR is delivered. Check that your device supports eSIM before buying.'}</p>
          <div className="mt-auto border-t border-wr-border/50 pt-4"><p className="text-2xl font-black tabular-nums">${plan.price.toFixed(2)} <span className="text-[10px] font-normal uppercase text-wr-dim">USD</span></p>
            <button className={`${button} w-full mt-4 ${token && balance >= plan.price ? 'bg-wr-accent text-black border-wr-accent hover:text-black' : ''}`} disabled={busy} onClick={() => void purchase(plan)}>{busy ? 'Processing…' : token && balance >= plan.price ? 'Continue' : 'Add funds to continue'}</button></div>
        </article>)}
      </section>}
      {!isTopup && catalog?.available && catalog.plans.filter(p => isVPN || (p.country || 'GB') === country).length === 0 && <div className={`${panel} text-sm text-wr-dim`}>No plans are available for this selection right now. Try another country or check back later.</div>}
      {!isVPN && !isTopup && <section className="space-y-5" aria-label="UK number details">
        <h2 className="text-xl font-bold">What you get</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className={panel}><h3 className="font-bold mb-2">A real UK +44 mobile line</h3><p className="text-sm text-wr-dim leading-relaxed">A carrier eSIM on your own compatible phone, not a VoIP inbox. Verification acceptance is decided by each service.</p></div>
          <div className={panel}><h3 className="font-bold mb-2">SMS and incoming calls</h3><p className="text-sm text-wr-dim leading-relaxed">Receive messages directly on the line. SMS reception is free where UK carrier roaming is supported; incoming call charges vary by country.</p></div>
          <div className={panel}><h3 className="font-bold mb-2">Installation details in your order</h3><p className="text-sm text-wr-dim leading-relaxed">Once provisioned, open the order with your wallet to view the QR and manual activation details. Install the eSIM on the device you plan to keep.</p></div>
        </div>
        <div className="border border-wr-border/50 rounded-sm overflow-hidden text-sm">
          <h3 className="font-bold p-4 bg-wr-surface/50">Terms and renewal</h3>
          <div className="grid sm:grid-cols-[11rem_1fr] gap-2 sm:gap-4 p-4 border-t border-wr-border/50"><strong>Prepaid terms</strong><span className="text-wr-dim">{[6, 12, 24].map(months => {
            const plan = catalog?.plans.find(p => p.months === months);
            return plan ? `${months} months $${plan.price.toFixed(2)}` : null;
          }).filter(Boolean).join(' · ') || 'Choose a live-priced plan above.'}</span></div>
          <div className="grid sm:grid-cols-[11rem_1fr] gap-2 sm:gap-4 p-4 border-t border-wr-border/50"><strong>Keep your number</strong><span className="text-wr-dim">There is no subscription. Renew before expiry in 6, 12 or 24 month blocks through <Link className="text-wr-accent underline underline-offset-4" to={`${lang}/topup`}>your walls.rip order</Link>. The same eSIM stays in place. {renewalOffers.length ? `Current renewal prices: ${renewalOffers.map(offer => `${Number(offer.id) * 6} months $${offer.price.toFixed(2)}`).join(' · ')}.` : 'Your order shows the live renewal price.'}</span></div>
          <div className="grid sm:grid-cols-[11rem_1fr] gap-2 sm:gap-4 p-4 border-t border-wr-border/50"><strong>Data abroad</strong><span className="text-wr-dim">Mobile data is not included when this line is activated outside the UK. For data abroad, choose a separate <Link className="text-wr-accent underline underline-offset-4" to={`${lang}/esim`}>travel eSIM</Link>.</span></div>
          <div className="grid sm:grid-cols-[11rem_1fr] gap-2 sm:gap-4 p-4 border-t border-wr-border/50"><strong>Wallet and refunds</strong><span className="text-wr-dim">No account or ID is needed on walls.rip. Keep your wallet recovery token to reopen the order. There is no routine refund after the QR is delivered; delivery or payment errors are reviewed individually.</span></div>
        </div>
      </section>}
      {!isVPN && !isTopup && <Link to={`${lang}/topup`} className={`${panel} flex items-center justify-between text-sm hover:border-wr-accent/50`}><span>Already have a walls.rip UK number? Renew it before it expires.</span><ChevronRight size={16} className="text-wr-accent" /></Link>}
      {isTopup && !token && <div className={`${panel} text-sm text-wr-dim`}>Restore the wallet used to buy your UK line, then select the order below. Your number and renewal options appear after you open it.</div>}
      {token && <section className="border border-wr-border/50 rounded-sm overflow-hidden"><div className="flex items-center justify-between p-4 bg-wr-surface/50"><h2 className="text-xs uppercase tracking-widest font-bold">Your orders</h2><button className={button} disabled={busy} onClick={() => void loadOrders()} aria-label="Refresh orders"><RefreshCw size={14} /></button></div>
        {!orders.length && <p className="text-sm text-wr-dim p-4">{isTopup ? 'No UK lines found in this wallet. Restore the wallet used for the original purchase.' : 'Your purchased orders will appear here.'}</p>}
        {orders.map(saved => <button key={saved.orderId} disabled={busy} onClick={() => void openOrder(saved.orderId)} className="block w-full text-left border-t border-wr-border py-3 text-sm hover:text-wr-accent disabled:opacity-40">
          {saved.name} · ${saved.charged.toFixed(2)}<span className="block text-xs text-wr-dim">{displayOrderId(saved.orderId)} · {new Date(saved.createdAt).toLocaleDateString()}</span>
        </button>)}
        {cursor && <button className={button} disabled={busy} onClick={() => void loadOrders(cursor)}>Load more</button>}
      </section>}
      {order && <section className={`${panel} space-y-4`}>
        <div className="flex items-center justify-between flex-wrap gap-2"><h2 className="font-bold">{order.name}</h2><button className={button} disabled={busy} onClick={() => void openOrder(order.orderId)}>Refresh status</button></div>
        <p className="text-sm">{displayOrderId(order.orderId)} · {order.status === 'ACTIVE' && !isVPN ? 'Ready to install' : order.status}</p>
        {order.status === 'PENDING' && <p className="text-sm text-wr-dim">Payment received. Waiting for provisioning. Your order is saved; you can return to it here.</p>}
        {order.deliveryUnavailable && <p className="text-sm text-wr-dim">Installation details are temporarily unavailable. Your order is saved; refresh to try again.</p>}
        {order.expiresAt && <p className="text-sm">Expires {new Date(order.expiresAt).toLocaleString()}</p>}
        {isVPN && order.status === 'ACTIVE' && <>
          <div className="flex gap-2 flex-wrap">{order.username && <button className={button} onClick={() => copy(order.username!)}>Copy username</button>}{order.password && <button className={button} onClick={() => copy(order.password!)}>Copy password</button>}</div>
          <div className="flex flex-wrap gap-3"><select aria-label="VPN protocol" value={protocol} disabled={busy} onChange={e => { setProtocol(e.target.value as Protocol); setServerId(''); setConfig(null); }} className={button}>
            {(catalog?.protocols || []).map(p => <option key={p} value={p}>{p}</option>)}</select>
            <select aria-label="VPN server" value={serverId} disabled={busy} onChange={e => { setServerId(e.target.value); setConfig(null); }} className={button}><option value="">Choose a server</option>
              {compatibleServers.map(s => <option key={s.id} value={s.id}>{s.country_code} · {s.city}</option>)}</select>
            <button className={button} disabled={busy || !serverId} onClick={() => void getConfig()}>Get configuration</button></div>
          {config && <div className="space-y-3"><button className={button} onClick={download}><Download size={14} className="inline mr-2" />Download configuration</button><button className={`${button} ml-2`} onClick={() => copy(config.content)}>Copy configuration</button>
            {config.qrPayload && config.qrPayload.length <= 1800 && <div className="bg-white p-3 w-fit"><QRCodeCanvas value={config.qrPayload} size={220} level="L" /></div>}
            <p className="text-xs text-wr-dim">Import this file or QR into a compatible VPN app. Configuration files contain private credentials; keep them private.</p></div>}
        </>}
        {!isVPN && order.status === 'ACTIVE' && <>
          {order.qrCode && <img src={order.qrCode} alt="UK eSIM installation QR" referrerPolicy="no-referrer" className="w-56 h-56 object-contain bg-white p-3" />}
          {[['LPA activation string', order.activationUrl], ['SM-DP+ address', order.smdpAddress], ['Activation code', order.activationCode], ['PUK code', order.pukCode]].map(([label, value]) => value && <div key={label} className="space-y-1"><p className="text-xs text-wr-dim">{label}</p><button className={`${button} break-all text-left max-w-full`} onClick={() => copy(value)}>{value}</button></div>)}
          <p className="text-sm text-wr-dim">{(order.provider || order.engine) === 'buyukesim'
            ? 'Install the QR once on the phone you intend to keep. After activation, dial *132# on this line to find its +44 number. SMS arrives on your device.'
            : 'Install the profile using your phone’s eSIM settings and follow the carrier instructions. Your phone number is assigned according to the plan after activation; SMS arrives on your device.'}</p>
        </>}
        {!isVPN && renewals.length > 0 && <div className="border-t border-wr-border pt-4 space-y-3"><h3 className="font-bold">Renew this number</h3>
          <input aria-label="UK mobile number to renew" type="tel" placeholder="+447… assigned to this eSIM" value={phone} onChange={e => setPhone(e.target.value)} className="bg-wr-base border border-wr-border px-3 py-2 w-full" />
          <p className="text-xs text-wr-dim">Enter the number belonging to this order. Each renewal block is 180 days.</p>
          <p className="text-xs text-wr-dim">Renew before the line expires. A completed renewal extends the existing line and is not routinely refundable.</p>
          <div className="flex gap-2 flex-wrap">{renewals.map(plan => <button className={button} key={plan.periods} disabled={busy} onClick={() => void renew(plan)}>Renew {plan.days} days · ${plan.price.toFixed(2)}</button>)}</div>
        </div>}
      </section>}
    </main><Footer />
    <PaymentGate amount={payment || 10} isOpen={payment !== null} walletToken={token || undefined} showPresets
      onClose={() => setPayment(null)} onWalletCreated={rememberWallet}
      onDeposit={(_usd, _method, wallet) => { if (wallet) rememberWallet(wallet); setPayment(null); void refreshBalance(); toast.success(t('connectivity.funded', { defaultValue: 'Wallet funded. Choose your plan to complete the purchase.' })); }} />
  </div>;
}
