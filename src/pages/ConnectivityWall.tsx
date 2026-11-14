import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Phone, RefreshCw, Shield, ChevronRight, Check } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'react-hot-toast';
import { Header } from '../components/Header';
import { WalletBanner } from '../components/WalletBanner';
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
const panel = 'border border-wr-border bg-wr-surface/40 rounded-sm p-5';
const button = 'min-h-11 px-4 py-2 border border-wr-border rounded-sm text-xs font-bold uppercase tracking-[0.16em] transition-colors hover:border-wr-accent hover:text-wr-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-wr-accent disabled:opacity-40 disabled:cursor-not-allowed';

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
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] font-bold text-wr-accent">
            <span className="w-1.5 h-1.5 rounded-full bg-wr-accent" />
            {isVPN ? 'Connectivity / 01' : isTopup ? 'Connectivity / Renew' : 'Connectivity / 02'}
          </p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.05]">{isVPN ? <>Private access.<br /><span className="text-wr-accent">On your terms.</span></> : isTopup ? <>Keep your number.<br /><span className="text-wr-accent">Add more time.</span></> : <>A number that<br /><span className="text-wr-accent">stays yours.</span></>}</h1>
          <p className="max-w-xl text-sm md:text-base leading-7 text-current">{isVPN
            ? t('connectivity.vpn_subtitle', 'Prepaid VPN access with WireGuard, OpenVPN or VLESS, configured for your device.')
            : isTopup ? t('connectivity.topup_subtitle', 'Extend the UK number you already own. The same eSIM stays in place.')
            : t('connectivity.phone_subtitle', 'A long-term UK eSIM for receiving SMS on your own phone.')}</p>
          <p className="max-w-xl text-xs leading-6 text-wr-dim">{isVPN
            ? 'Choose prepaid VPN access, then generate a configuration for your device and preferred protocol. Renewals are always in your control.'
            : isTopup ? 'Open the UK line you bought with this wallet, enter its +44 number, and extend it by 6, 12 or 24 months. Renew before its end date.'
            : 'Choose a prepaid term, install the profile and receive SMS directly on the line. No account or ID required.'}</p>
          {isTopup && <p className="text-xs text-wr-dim">The same eSIM and QR stay in place. This works for UK lines bought through walls.rip with this wallet. <Link className="text-wr-secondary underline underline-offset-4" to={`${lang}/uk-sim`}>Buy a new line</Link>.</p>}
          {!isVPN && <p className="text-xs text-wr-dim">Need a temporary inbox number? <Link className="text-wr-secondary underline underline-offset-4" to={`${lang}/sms`}>SMS rentals</Link>. Need travel data? <Link className="text-wr-info underline underline-offset-4" to={`${lang}/esim`}>Browse data eSIMs</Link>.</p>}
          {isVPN && <div className="flex flex-wrap gap-2 pt-1">{(catalog?.protocols || ['wireguard', 'openvpn', 'vless']).map(p => <span key={p} className="px-2.5 py-1.5 border border-wr-info/30 bg-wr-info/5 text-[11px] uppercase tracking-[0.16em] text-wr-info rounded-sm">{p}</span>)}</div>}
        </div>
        <div className="relative min-h-52 lg:min-h-64 border border-wr-border/50 bg-wr-surface/30 rounded-sm overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(var(--border-color) 1px, transparent 1px),linear-gradient(90deg,var(--border-color) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />
          <div className="absolute top-4 left-4 text-[11px] uppercase tracking-[0.18em] text-wr-dim">{isVPN ? 'Encrypted connection' : 'Mobile network'}</div>
          {isVPN ? <div className="relative flex flex-col items-center gap-4"><div className="w-24 h-24 border border-wr-accent/50 bg-wr-accent/5 rounded-sm flex items-center justify-center shadow-lg shadow-wr-accent/10"><Shield size={42} strokeWidth={1.2} className="text-wr-accent" /></div><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-wr-info"><span className="w-1.5 h-1.5 rounded-full bg-wr-info animate-pulse" /> Private by design</div></div>
            : <div className="relative border border-wr-border bg-wr-base p-4 w-40 shadow-2xl"><div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-wr-dim"><span>eSIM</span><span className="text-wr-info">GB</span></div><div className="border-t border-wr-border my-3" /><Phone size={30} strokeWidth={1.2} className="text-wr-secondary mx-auto my-4" /><div className="text-center text-[11px] uppercase tracking-[0.16em] text-wr-dim">Personal line</div></div>}
        </div>
      </section>
      <WalletBanner
        token={token}
        balance={balance}
        helper={t('wallet.shared_helper', 'One prepaid balance covers eSIMs, SMS, phone numbers and VPN.')}
        onDeposit={() => setPayment(10)}
        restoreOpen={showRestoreInput}
        setRestoreOpen={setShowRestoreInput}
        restoreToken={restore}
        setRestoreToken={setRestore}
        onRestore={() => { void handleRestoreWallet(); }}
        restoring={restoringWallet}
      />
      {error && <div role="alert" className="border border-wr-error/40 bg-wr-error/5 text-wr-error p-4 text-sm rounded-sm">{error}</div>}
      {!isTopup && !catalog && !error && (
        <div role="status" aria-live="polite" className="mx-2 md:mx-0 border border-wr-border bg-wr-surface rounded-sm p-6 md:p-8">
          <div className="flex flex-col items-center justify-center gap-3 text-wr-dim">
            <RefreshCw size={20} className="animate-spin text-wr-accent" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-[0.18em]">
              {t('connectivity.loading_plans', 'Loading plans…')}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-32 rounded-sm border border-wr-border/60 bg-wr-base/50 animate-pulse" />
            ))}
          </div>
        </div>
      )}
      {!isTopup && catalog && !catalog.available && <div className={panel}>{catalog.reason || 'Plans are currently unavailable.'}</div>}
      {!isVPN && catalog?.plans.some(p => p.country) && <label className="flex flex-wrap items-center gap-3 text-[11px] font-mono uppercase tracking-[0.16em] text-wr-dim">Country <select className={`${button} min-h-11 text-base md:text-xs bg-wr-base`} value={country} onChange={e => setCountry(e.target.value)}>
        {[...new Set(catalog.plans.map(p => p.country || 'GB'))].sort().map(code => <option key={code} value={code}>{code}</option>)}
      </select></label>}
      {!isTopup && <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Available plans">
        {catalog?.available && catalog.plans.filter(p => isVPN || (p.country || 'GB') === country).map((plan, index) => <article key={plan.id} className="group relative flex flex-col p-5 border border-wr-border bg-wr-surface/40 rounded-sm transition-colors hover:border-wr-accent/60">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-wr-dim">Plan {String(index + 1).padStart(2, '0')}</span>
            <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-wr-secondary">{isVPN ? 'VPN' : 'UK eSIM'}</span>
          </div>
          <div className="mt-3"><h2 className="text-lg font-bold leading-snug">{plan.name}</h2>
            <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.14em] text-wr-info">{plan.months ? `${plan.months} months prepaid` : `${plan.days || plan.durationDays || 0} days prepaid`}{plan.country ? ` · ${plan.country}` : ''}</p></div>
          <div className="mt-4 space-y-1.5 border-t border-wr-border/60 pt-3 text-[11px] font-mono">
            {(isVPN ? ['WireGuard · OpenVPN · VLESS', 'Config download for your device', 'Prepaid term, no auto-renew'] : ['Receive SMS on your own phone', 'eSIM install QR after payment', 'Same line stays through renewals']).map(row => (
              <div key={row} className="flex items-start gap-2 text-wr-dim"><Check size={11} className="mt-0.5 shrink-0 text-wr-accent" /><span>{row}</span></div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-wr-dim leading-relaxed">{isVPN
            ? 'If no server connects after support troubleshooting, contact us for a refund review.'
            : 'No routine refund after the UK line QR is delivered. Check that your device supports eSIM before buying.'}</p>
          <div className="mt-auto border-t border-wr-border/60 pt-4"><p className="text-2xl font-black tabular-nums">${plan.price.toFixed(2)} <span className="text-[11px] font-mono font-normal uppercase text-wr-dim">USD</span></p>
            <button className={`min-h-11 w-full mt-4 px-4 py-2.5 border rounded-sm text-xs font-bold uppercase tracking-[0.16em] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${token && balance >= plan.price ? 'border-wr-accent text-wr-accent bg-wr-accent/5 hover:bg-wr-accent/15' : 'border-wr-border text-wr-dim hover:border-wr-accent hover:text-wr-accent'}`} disabled={busy} onClick={() => void purchase(plan)}>{busy ? 'Processing…' : token && balance >= plan.price ? 'Continue' : 'Add funds to continue'}</button></div>
        </article>)}
      </section>}
      {!isTopup && catalog?.available && catalog.plans.filter(p => isVPN || (p.country || 'GB') === country).length === 0 && <div className={`${panel} text-sm text-wr-dim`}>No plans are available for this selection right now. Try another country or check back later.</div>}
      {!isVPN && !isTopup && <section className="space-y-5" aria-label="UK number details">
        <div className="space-y-2">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] font-bold text-wr-info">UK eSIM / Details</p>
          <h2 className="text-xl font-bold">What you get</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className={panel}><h3 className="font-bold mb-2 text-wr-accent">A real UK +44 mobile line</h3><p className="text-sm text-wr-dim leading-relaxed">A carrier eSIM on your own compatible phone, not a VoIP inbox. Verification acceptance is decided by each service.</p></div>
          <div className={panel}><h3 className="font-bold mb-2 text-wr-secondary">SMS and incoming calls</h3><p className="text-sm text-wr-dim leading-relaxed">Receive messages directly on the line. SMS reception is free where UK carrier roaming is supported; incoming call charges vary by country.</p></div>
          <div className={panel}><h3 className="font-bold mb-2 text-wr-info">Installation details in your order</h3><p className="text-sm text-wr-dim leading-relaxed">Once provisioned, open the order with your wallet to view the QR and manual activation details. Install the eSIM on the device you plan to keep.</p></div>
        </div>
        <div className="border border-wr-border rounded-sm overflow-hidden text-sm">
          <h3 className="font-bold p-4 bg-wr-surface/50 text-[11px] font-mono uppercase tracking-[0.18em]">Terms and renewal</h3>
          <div className="grid sm:grid-cols-[11rem_1fr] gap-2 sm:gap-4 p-4 border-t border-wr-border"><strong className="text-[11px] font-mono uppercase tracking-[0.14em] text-wr-secondary">Prepaid terms</strong><span className="text-wr-dim">{[6, 12, 24].map(months => {
            const plan = catalog?.plans.find(p => p.months === months);
            return plan ? `${months} months $${plan.price.toFixed(2)}` : null;
          }).filter(Boolean).join(' · ') || 'Choose a live-priced plan above.'}</span></div>
          <div className="grid sm:grid-cols-[11rem_1fr] gap-2 sm:gap-4 p-4 border-t border-wr-border"><strong className="text-[11px] font-mono uppercase tracking-[0.14em] text-wr-secondary">Keep your number</strong><span className="text-wr-dim">There is no subscription. Renew before expiry in 6, 12 or 24 month blocks through <Link className="text-wr-secondary underline underline-offset-4" to={`${lang}/topup`}>your walls.rip order</Link>. The same eSIM stays in place. {renewalOffers.length ? `Current renewal prices: ${renewalOffers.map(offer => `${Number(offer.id) * 6} months $${offer.price.toFixed(2)}`).join(' · ')}.` : 'Your order shows the live renewal price.'}</span></div>
          <div className="grid sm:grid-cols-[11rem_1fr] gap-2 sm:gap-4 p-4 border-t border-wr-border"><strong className="text-[11px] font-mono uppercase tracking-[0.14em] text-wr-info">Data abroad</strong><span className="text-wr-dim">Mobile data is not included when this line is activated outside the UK. For data abroad, choose a separate <Link className="text-wr-info underline underline-offset-4" to={`${lang}/esim`}>travel eSIM</Link>.</span></div>
          <div className="grid sm:grid-cols-[11rem_1fr] gap-2 sm:gap-4 p-4 border-t border-wr-border"><strong className="text-[11px] font-mono uppercase tracking-[0.14em] text-wr-dim">Wallet and refunds</strong><span className="text-wr-dim">No account or ID is needed on walls.rip. Keep your wallet recovery token to reopen the order. There is no routine refund after the QR is delivered; delivery or payment errors are reviewed individually.</span></div>
        </div>
      </section>}
      {!isVPN && !isTopup && <Link to={`${lang}/topup`} className={`${panel} flex items-center justify-between gap-3 text-sm hover:border-wr-secondary/60 min-h-11`}><span className="text-wr-dim">Already have a walls.rip UK number? <span className="text-current">Renew it before it expires.</span></span><ChevronRight size={16} className="text-wr-secondary shrink-0" /></Link>}
      {isTopup && !token && <div className={`${panel} text-sm text-wr-dim`}>Restore the wallet used to buy your UK line, then select the order below. Your number and renewal options appear after you open it.</div>}
      {token && <section className="border border-wr-border rounded-sm overflow-hidden"><div className="flex items-center justify-between p-4 bg-wr-surface/50"><h2 className="text-[11px] font-mono uppercase tracking-[0.18em] font-bold">Your orders</h2><button className={button} disabled={busy} onClick={() => void loadOrders()} aria-label="Refresh orders"><RefreshCw size={14} /></button></div>
        {!orders.length && <p className="text-sm text-wr-dim p-4">{isTopup ? 'No UK lines found in this wallet. Restore the wallet used for the original purchase.' : 'Your purchased orders will appear here.'}</p>}
        {orders.map(saved => <button key={saved.orderId} disabled={busy} onClick={() => void openOrder(saved.orderId)} className="block w-full text-left border-t border-wr-border px-4 py-3 min-h-11 text-sm hover:text-wr-accent hover:bg-wr-surface/40 disabled:opacity-40 transition-colors">
          {saved.name} · <span className="tabular-nums">${saved.charged.toFixed(2)}</span><span className="block text-[11px] font-mono text-wr-dim mt-0.5">{displayOrderId(saved.orderId)} · {new Date(saved.createdAt).toLocaleDateString()}</span>
        </button>)}
        {cursor && <div className="p-3 border-t border-wr-border"><button className={button} disabled={busy} onClick={() => void loadOrders(cursor)}>Load more</button></div>}
      </section>}
      {order && <section className={`${panel} space-y-4`}>
        <div className="flex items-center justify-between flex-wrap gap-2"><h2 className="font-bold">{order.name}</h2><button className={button} disabled={busy} onClick={() => void openOrder(order.orderId)}>Refresh status</button></div>
        <p className="text-[11px] font-mono text-wr-dim break-all">{displayOrderId(order.orderId)} · <span className={order.status === 'ACTIVE' ? 'text-wr-accent' : 'text-wr-info'}>{order.status === 'ACTIVE' && !isVPN ? 'Ready to install' : order.status}</span></p>
        {order.status === 'PENDING' && <p className="text-sm text-wr-info">Payment received. Waiting for provisioning. Your order is saved; you can return to it here.</p>}
        {order.deliveryUnavailable && <p className="text-sm text-wr-warning">Installation details are temporarily unavailable. Your order is saved; refresh to try again.</p>}
        {order.expiresAt && <p className="text-sm text-wr-dim">Expires {new Date(order.expiresAt).toLocaleString()}</p>}
        {isVPN && order.status === 'ACTIVE' && <>
          <div className="flex gap-2 flex-wrap">{order.username && <button className={button} onClick={() => copy(order.username!)}>Copy username</button>}{order.password && <button className={button} onClick={() => copy(order.password!)}>Copy password</button>}</div>
          <div className="space-y-3 border-t border-wr-border pt-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-wr-dim">Protocol</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="VPN protocol">
              {(catalog?.protocols || []).map(p => (
                <button key={p} type="button" disabled={busy} aria-pressed={protocol === p}
                  onClick={() => { setProtocol(p); setServerId(''); setConfig(null); }}
                  className={`min-h-11 px-4 py-2 rounded-sm border text-[11px] font-mono uppercase tracking-[0.16em] transition-colors disabled:opacity-40 ${protocol === p ? 'border-wr-secondary text-wr-secondary bg-wr-secondary/10' : 'border-wr-border text-wr-dim hover:border-wr-secondary/50 hover:text-wr-secondary'}`}>
                  {p === 'wireguard' ? 'WireGuard' : p === 'openvpn' ? 'OpenVPN' : p === 'vless' ? 'VLESS' : p}
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center">
              <select aria-label="VPN server" value={serverId} disabled={busy} onChange={e => { setServerId(e.target.value); setConfig(null); }} className={`${button} text-base md:text-xs bg-wr-base sm:max-w-xs`}><option value="">Choose a server</option>
                {compatibleServers.map(s => <option key={s.id} value={s.id}>{s.country_code} · {s.city}</option>)}</select>
              <button className={`${button} border-wr-accent text-wr-accent bg-wr-accent/5 hover:bg-wr-accent/15 sm:ml-auto`} disabled={busy || !serverId} onClick={() => void getConfig()}>Get configuration</button>
            </div>
          </div>
          {config && <div className="space-y-3 border-t border-wr-border pt-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <button className="min-h-11 px-4 py-2 rounded-sm border border-wr-accent bg-wr-accent text-black text-xs font-bold uppercase tracking-[0.16em] hover:opacity-90 flex items-center justify-center gap-2" onClick={download}><Download size={14} />Download configuration</button>
              <button className={`${button} w-full sm:w-auto`} onClick={() => copy(config.content)}>Copy configuration</button>
            </div>
            {config.qrPayload && config.qrPayload.length <= 1800 && <div className="bg-white p-3 w-fit max-w-full"><QRCodeCanvas value={config.qrPayload} size={220} level="L" /></div>}
            <p className="text-xs text-wr-info font-mono">Import this file or QR into a compatible VPN app. Configuration files contain private credentials; keep them private.</p>
          </div>}
        </>}
        {!isVPN && order.status === 'ACTIVE' && <>
          {order.qrCode && <img src={order.qrCode} alt="UK eSIM installation QR" referrerPolicy="no-referrer" className="w-56 h-56 object-contain bg-white p-3 max-w-full" />}
          {[['LPA activation string', order.activationUrl], ['SM-DP+ address', order.smdpAddress], ['Activation code', order.activationCode], ['PUK code', order.pukCode]].map(([label, value]) => value && <div key={label} className="space-y-1"><p className="text-[11px] font-mono uppercase tracking-[0.14em] text-wr-dim">{label}</p><button className={`${button} break-all text-left max-w-full`} onClick={() => copy(value)}>{value}</button></div>)}
          <p className="text-sm text-wr-dim">{(order.provider || order.engine) === 'buyukesim'
            ? 'Install the QR once on the phone you intend to keep. After activation, dial *132# on this line to find its +44 number. SMS arrives on your device.'
            : 'Install the profile using your phone’s eSIM settings and follow the carrier instructions. Your phone number is assigned according to the plan after activation; SMS arrives on your device.'}</p>
        </>}
        {!isVPN && renewals.length > 0 && <div className="border-t border-wr-border pt-4 space-y-3">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.18em] font-bold text-wr-secondary">Renew this number</h3>
          <input aria-label="UK mobile number to renew" type="tel" placeholder="+447… assigned to this eSIM" value={phone} onChange={e => setPhone(e.target.value)} className="min-h-11 bg-wr-base border border-wr-border focus:border-wr-secondary outline-none px-3 py-2 w-full text-base md:text-sm rounded-sm" />
          <p className="text-xs text-wr-dim">Enter the number belonging to this order. Each renewal block is 180 days.</p>
          <p className="text-xs text-wr-dim">Renew before the line expires. A completed renewal extends the existing line and is not routinely refundable.</p>
          <div className="sticky bottom-0 -mx-5 px-5 pb-1 pt-3 bg-wr-surface/95 backdrop-blur border-t border-wr-border flex gap-2 flex-wrap">{renewals.map(plan => <button className={`${button} border-wr-secondary/50 text-wr-secondary hover:border-wr-secondary hover:text-wr-secondary`} key={plan.periods} disabled={busy} onClick={() => void renew(plan)}>Renew {plan.days} days · <span className="tabular-nums">${plan.price.toFixed(2)}</span></button>)}</div>
        </div>}
      </section>}
    </main><Footer />
    <PaymentGate amount={payment || 10} isOpen={payment !== null} walletToken={token || undefined} showPresets
      onClose={() => setPayment(null)} onWalletCreated={rememberWallet}
      onDeposit={(_usd, _method, wallet) => { if (wallet) rememberWallet(wallet); setPayment(null); void refreshBalance(); toast.success(t('connectivity.funded', { defaultValue: 'Wallet funded. Choose your plan to complete the purchase.' })); }} />
  </div>;
}
