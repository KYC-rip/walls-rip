/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, AlertTriangle, ChevronDown, Clock, Dices, ChevronRight, Mail, Zap, Upload } from 'lucide-react';
import { TIER_UI_CONFIG } from './constants';
import { mailApiClient } from '../../services/client';
import { SUPPORTED_LANGS } from '../../i18n/config';
import type { TierType, DurationConfig, PaymentState, DomainConfig, GhostMailSession } from '../../hooks/useGhostMail';
import { SessionTransferModal } from './SessionTransfer';

interface ConfigPanelProps {
  configLoading: boolean;
  error: string | null;
  tiers: Record<TierType, any>;
  durations: DurationConfig[];
  domainOptions: DomainConfig[];
  selectedTier: TierType;
  setSelectedTier: (t: TierType) => void;
  selectedDuration: DurationConfig;
  setSelectedDuration: (d: DurationConfig) => void;
  selectedDomain: string;
  setSelectedDomain: (d: string) => void;
  customName: string;
  handleNameChange: (val: string) => void;
  generateRandomName: () => void;
  isRandom: boolean;
  paymentState: PaymentState;
  startPurchase: (tier: TierType, method: 'XMR' | 'LN' | 'USDT', chain?: string) => void;
  getFinalPrice: () => number;
  openToS: () => void;
  onImportSession?: (session: GhostMailSession) => void;
}

export function ConfigPanel({
  configLoading,
  error,
  tiers,
  durations,
  domainOptions,
  selectedTier,
  setSelectedTier,
  selectedDuration,
  setSelectedDuration,
  selectedDomain,
  setSelectedDomain,
  customName,
  handleNameChange,
  generateRandomName,
  isRandom,
  paymentState,
  startPurchase,
  getFinalPrice,
  openToS,
  onImportSession
}: ConfigPanelProps) {
  const { t, i18n } = useTranslation();
  const [paymentMethod, setPaymentMethod] = useState<'XMR' | 'LN' | 'USDT'>('XMR');
  const [usdtChain, setUsdtChain] = useState<'tron' | 'eth'>('tron');
  const [proMonthly, setProMonthly] = useState<number | null>(null);
  const lang = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language) && i18n.language !== 'en'
    ? `/${i18n.language}`
    : '';

  useEffect(() => {
    let cancelled = false;
    mailApiClient<{ plans?: Record<string, { monthlyUSD?: number }> }>('/v1/mail/pro/plans')
      .then(r => {
        if (cancelled) return;
        const values = Object.values(r.plans || {})
          .map(plan => Number(plan?.monthlyUSD))
          .filter(Number.isFinite);
        if (values.length > 0) setProMonthly(Math.min(...values));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [showImportModal, setShowImportModal] = useState(false);
  const isBasic = selectedTier === 'BASIC';

  const validateHandle = (val: string) => {
    if (!val) return null;
    if (val.length < 4) return 'Handle must be at least 4 characters';
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(val)) return 'Only lowercase letters, numbers, dots, hyphens';
    if (val.includes('--') || val.includes('..')) return 'Cannot contain consecutive dots or hyphens';
    return null;
  };

  const handleError = validateHandle(customName);

  const onNameChange = (val: string) => {
    const sanitized = val.toLowerCase().replace(/[^a-z0-9-.]/g, '');
    handleNameChange(sanitized);
  };

  if (configLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-wr-dim">
        <RefreshCw size={26} className="animate-spin text-wr-accent" />
        <p className="text-[11px] font-bold tracking-[0.18em] uppercase">SYNCING CONFIGURATION…</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 pb-8 md:pb-12 animate-in fade-in duration-300">
      {/* ── Landing hero ── */}
      <div className="px-2 md:px-0 pt-8 md:pt-12 pb-6 md:pb-8 border-b border-wr-border/70">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-bold text-wr-accent mb-4">
          <span className="inline-block w-1.5 h-1.5 bg-wr-accent" />
          {t('mail.v2_kicker', 'Disposable email')}
        </div>
        <h1 className="font-display text-4xl md:text-6xl font-black tracking-tight leading-none mb-4">
          GHOST <span className="text-wr-accent">MAIL</span>
        </h1>
        <p className="text-sm md:text-base text-wr-dim leading-relaxed max-w-xl">
          {t('mail.v2_subtitle', 'A temporary inbox that receives mail and expires on its own — no signup, no identity.')}
        </p>
      </div>

      {error && (
        <div className="mx-2 md:mx-0 border border-wr-error/50 bg-wr-error/10 p-4 text-xs text-wr-error flex flex-col items-center gap-2">
          <span className="flex items-center gap-2 font-bold">
            <AlertTriangle size={14} />
            {error}
          </span>
          <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-[11px] text-wr-error/80 hover:text-wr-error hover:underline">
            Need help? @kyc_rip_bot
          </a>
        </div>
      )}

      {/* Session banner — same geometry as the shared-wallet banner on SMS/eSIM/Phone/VPN */}
      {onImportSession && (
        <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-border rounded-sm relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-wr-secondary" />
          <div className="p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2.5 bg-wr-secondary/10 text-wr-secondary border border-wr-secondary/25 rounded-sm shrink-0">
                <Upload size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.16em] mb-1 flex flex-wrap items-center gap-2">
                  {t('mail.session_banner_title', 'GHOST MAIL SESSION')}
                  <span className="text-[10px] bg-wr-secondary/10 border border-wr-secondary/30 text-wr-secondary px-1.5 py-0.5 rounded-sm">
                    {t('mail.session_banner_badge', 'SESSION KEY')}
                  </span>
                </h3>
                <p className="text-[11px] text-wr-dim font-mono leading-relaxed max-w-lg">
                  {t('mail.session_banner_body', 'Restore your inbox session key to reopen messages. Each inbox is paid per session — it does not use the shared wallet balance.')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowImportModal(true)}
              className="min-h-11 w-full md:w-auto shrink-0 px-5 py-3 bg-wr-accent text-black text-[11px] font-bold uppercase tracking-[0.16em] rounded-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Upload size={13} /> {t('mail.session_banner_action', 'RESTORE SESSION')}
            </button>
          </div>
        </div>
      )}

      {/* Free Tier Promo */}
      <div className="mx-2 md:mx-0 border border-wr-info/30 bg-wr-info/[0.06] p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-wr-info" />
        <div className="flex items-start gap-3 relative z-10">
          <div className="p-2.5 bg-wr-info/10 text-wr-info border border-wr-info/25 shrink-0">
            <Mail size={20} />
          </div>
          <div>
            <h3 className="text-wr-info font-bold tracking-[0.16em] text-[11px] mb-1.5 uppercase flex flex-wrap items-center gap-x-2 gap-y-1">
              {t('mail.v2_telegram_free', 'Free access via Telegram')}
              <span className="text-[9px] bg-wr-info/15 border border-wr-info/30 px-1.5 py-0.5 tracking-[0.14em]">TELEGRAM</span>
            </h3>
            <p className="text-[11px] text-wr-dim font-mono leading-relaxed max-w-lg text-left">
              {t('mail.v2_telegram_body', 'Get a free Ghost Mail inbox through our Telegram bot.')}
              <span className="hidden md:inline"> {t('mail.v2_telegram_body2', 'No payment needed for the basic tier.')}</span>
            </p>
          </div>
        </div>
        <a
          href="https://t.me/kyc_rip_bot?start=mail"
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 w-full md:w-auto min-h-[44px] px-5 py-3 border border-wr-info/50 text-wr-info hover:bg-wr-info/10 text-[11px] font-bold tracking-[0.16em] uppercase transition-all flex items-center justify-center gap-2"
        >
          {t('mail.v2_launch_bot', 'Launch bot')} <ChevronRight size={14} />
        </a>
      </div>

      {/* ── Tier selection ── */}
      <div className="px-2 md:px-0 space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim">#01 // {t('mail.v2_tier_kicker', 'Choose a tier')}</span>
          <span className="hidden sm:block text-[11px] uppercase tracking-[0.14em] font-bold text-wr-dim/70">{t('mail.v2_tier_hint', 'Price per period')}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {(Object.keys(tiers) as TierType[]).map((tierKey) => {
            const tier = tiers[tierKey];
            if (!tier) return null;

            const isSelected = selectedTier === tierKey;
            const Icon = tier.icon || TIER_UI_CONFIG[tierKey].icon;
            const period = tier.baseSeconds >= 86400
              ? `${Math.floor(tier.baseSeconds / 86400)} ${t('mail.v2_days', 'DAYS')}`
              : `${Math.floor(tier.baseSeconds / 3600)} ${t('mail.v2_hours', 'HOURS')}`;

            return (
              <div
                key={tierKey} onClick={() => setSelectedTier(tierKey)}
                className={`relative flex flex-col p-5 border rounded-sm cursor-pointer transition-colors duration-200
                  ${isSelected ? 'border-wr-accent bg-wr-accent/[0.06]' : 'border-wr-border bg-wr-surface hover:border-wr-accent/40'}
                `}
              >
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-wr-dim">{tier.label}</span>
                  {isSelected && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-wr-accent border border-wr-accent/40 bg-wr-accent/10 px-1.5 py-0.5 rounded-xs shrink-0">ACTIVE</span>
                  )}
                </div>

                <Icon size={20} className={isSelected ? 'text-wr-accent' : 'text-wr-dim'} />

                <div className="mt-4 flex items-baseline gap-1 font-mono">
                  <span className={`text-3xl font-black leading-none ${isSelected ? 'text-wr-accent' : 'text-current'}`}>${tier.priceUSD?.toFixed(2)}</span>
                </div>
                <div className="mt-1.5 text-[11px] font-mono tracking-[0.16em] text-wr-dim">/ {period}</div>

                <p className="mt-4 mb-5 text-[11px] text-wr-dim leading-relaxed font-mono whitespace-pre-line flex-1">
                  {tier.desc.split('. ').map((line: string, i: number) => (
                    <span key={i} className={line.includes('Clean Pool') || line.includes('Zero Flags') ? 'text-wr-accent font-bold' : ''}>
                      {line}{i < tier.desc.split('. ').length - 1 ? '. ' : ''}
                    </span>
                  ))}
                </p>

                <div className={`flex items-center justify-between border-t pt-3 text-[11px] font-bold uppercase tracking-[0.14em] ${isSelected ? 'border-wr-accent/30 text-wr-accent' : 'border-wr-border text-wr-dim'}`}>
                  <span>{isSelected ? t('mail.v2_selected', 'Selected') : t('mail.v2_select', 'Select')}</span>
                  <ChevronRight size={13} />
                </div>
              </div>
            );
          })}
          <a
            href={`${lang}/mail/pro`}
            className="relative flex flex-col p-5 border border-wr-secondary/40 bg-wr-secondary/[0.06] rounded-sm transition-colors duration-200 hover:border-wr-secondary/70 hover:bg-wr-secondary/10"
          >
            <div className="flex items-center justify-between gap-2 mb-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-wr-secondary">{t('mail.pro_tier_label', 'Ghost Mail Pro')}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-wr-secondary border border-wr-secondary/40 bg-wr-secondary/10 px-1.5 py-0.5 rounded-xs shrink-0">
                {t('mail.pro_tier_badge', 'PERSISTENT')}
              </span>
            </div>
            <Mail size={20} className="text-wr-secondary" />
            <div className="mt-4 flex items-baseline gap-1 font-mono">
              <span className="text-3xl font-black leading-none text-wr-secondary">
                {proMonthly != null ? `$${proMonthly.toFixed(2)}` : t('mail.pro_tier_monthly', 'Monthly')}
              </span>
            </div>
            <div className="mt-1.5 text-[11px] font-mono tracking-[0.16em] text-wr-dim">/ {t('mail.pro_tier_month', 'MONTH')}</div>
            <p className="mt-4 mb-5 text-[11px] text-wr-dim leading-relaxed font-mono flex-1">
              {t('mail.pro_tier_desc', 'Persistent address with sending, aliases and custom domains. Separate monthly subscription.')}
            </p>
            <div className="flex items-center justify-between border-t border-wr-secondary/30 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-wr-secondary">
              <span>{t('mail.pro_tier_cta', 'Open Pro')}</span>
              <ChevronRight size={13} />
            </div>
          </a>
        </div>
      </div>

      {/* ── Identity console ── */}
      <div className="bg-wr-surface border border-wr-border p-4 md:p-8 relative mx-2 md:mx-0 rounded-sm">
        <div className="flex items-center justify-between mb-6">
          <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim">#02 // {t('mail.v2_config_kicker', 'Configure inbox')}</span>
          <span className="hidden sm:block text-[11px] font-mono uppercase tracking-[0.14em] text-wr-dim/70">
            {t('mail.v2_ttl', 'Expires in')} {selectedDuration.label}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 md:gap-8">
          <div className="min-w-0 space-y-7">
            <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">
          {/* Username */}
          <div className="flex-1 w-full space-y-2 relative">
            <label className="flex justify-between items-center text-[11px] text-wr-dim uppercase tracking-[0.14em] font-bold">
              <span className="flex items-center gap-2">
                {t('mail.v2_identity', 'Identity handle')}
                {!isBasic && (
                  <span className="text-[9px] bg-wr-accent/10 text-wr-accent px-1.5 py-0.5 rounded-xs border border-wr-accent/30 tracking-[0.12em]">
                    CUSTOM
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-mono tracking-[0.1em] normal-case ${isRandom ? 'text-wr-accent' : 'text-wr-secondary'}`}>
                {isRandom ? '● random' : '● user set'}
              </span>
            </label>

            <div className="relative group">
              <input
                type="text" value={customName}
                onChange={(e) => !isBasic && onNameChange(e.target.value)}
                readOnly={isBasic}
                className={`w-full bg-wr-base border p-3 md:p-3.5 pr-12 outline-none font-mono text-base md:text-lg transition-colors rounded-sm
                  ${isBasic ? 'border-wr-border text-wr-dim/50 cursor-not-allowed' :
                    handleError ? 'border-wr-error text-wr-error' :
                    'border-wr-border text-current focus:border-wr-accent'
                  } placeholder-wr-dim/40`}
                placeholder="ghost-xxxx"
              />
              <button
                onClick={generateRandomName}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-wr-dim hover:text-wr-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base ${isBasic ? 'opacity-30 cursor-not-allowed' : ''}`}
                disabled={isBasic}
                aria-label={t('mail.v2_random_handle', 'Generate random handle')}
                title={t('mail.v2_random_handle', 'Generate random handle')}
              >
                <Dices size={18} />
              </button>
            </div>

            <div className="absolute top-full left-0 w-full pt-1">
              {handleError && !isBasic ? (
                <div className="text-[11px] text-wr-error font-mono">
                  {">> "}ERR_INVALID_FORMAT: {handleError}
                </div>
              ) : isBasic ? (
                <div className="text-[11px] text-wr-dim/70 font-mono">
                  {t('mail.v2_basic_random', '* basic tier uses a random identity')}
                </div>
              ) : !isRandom ? (
                <div className="text-[11px] text-wr-accent font-mono">
                  {">> "}{t('mail.v2_handle_ok', 'handle accepted — custom identity active')}
                </div>
              ) : null}
            </div>
          </div>

          <div className="text-wr-dim pt-9 hidden md:block text-xl font-thin opacity-40 select-none">@</div>

          {/* Domain */}
          <div className="w-full md:w-1/3 space-y-2">
            <label className="block text-[11px] text-wr-dim uppercase tracking-[0.14em] font-bold">{t('mail.v2_domain', 'Target domain')}</label>
            <div className="relative">
              <select
                value={selectedDomain} onChange={(e) => setSelectedDomain(e.target.value)}
                className="w-full appearance-none bg-wr-base border border-wr-border text-current p-3 md:p-3.5 pr-10 outline-none focus:border-wr-accent cursor-pointer font-mono text-sm md:text-base hover:border-wr-accent/40 transition-colors rounded-sm"
              >
                {domainOptions.filter(d => d.tier === selectedTier).map(d => (
                  <option key={d.domain} value={d.domain}>{d.domain}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-wr-dim">
                <ChevronDown size={18} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Duration ── */}
        <div className="mb-7">
          <div className="text-[11px] text-wr-dim mb-3 uppercase tracking-[0.18em] font-bold flex items-center gap-2">
            <Clock size={12} className="text-wr-accent" /> {t('mail.v2_duration', 'Duration')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 md:gap-3">
            {durations.map((dur) => {
              const isSelected = selectedDuration.label === dur.label;
              const isBestValue = dur.label.includes('7D');

              let displayLabel = dur.label;
              if (dur.value === 0 && tiers[selectedTier]) {
                const seconds = tiers[selectedTier].baseSeconds;
                displayLabel = seconds >= 86400
                  ? `${Math.floor(seconds / 86400)} DAY PASS`
                  : `${Math.floor(seconds / 3600)} HOUR PASS`;
              }

              return (
                <button
                  key={dur.label}
                  onClick={() => setSelectedDuration(dur)}
                  className={`relative min-h-[44px] py-3 px-4 border text-left rounded-sm transition-colors
                    ${isSelected
                      ? 'border-wr-accent bg-wr-accent/10'
                      : 'border-wr-border bg-wr-surface hover:border-wr-accent/40'
                    }
                  `}
                >
                  {isBestValue && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-[0.12em] text-wr-warning border border-wr-warning/40 bg-wr-warning/10 px-1 py-0.5">
                      {t('mail.v2_best_value', 'Best value')}
                    </span>
                  )}
                  <div className={`font-mono font-bold tracking-[0.12em] text-xs ${isSelected ? 'text-wr-accent' : 'text-current'}`}>{displayLabel}</div>
                  <div className="mt-0.5 text-[11px] font-mono text-wr-dim">
                    {dur.addonPrice === 0 ? t('mail.v2_included', 'Included') : `+$${dur.addonPrice.toFixed(2)}`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Payment method ── */}
        <div className="mb-7">
          <div className="text-[11px] text-wr-dim mb-3 uppercase tracking-[0.18em] font-bold flex items-center gap-2">
            <Zap size={12} className="text-wr-accent" /> {t('mail.v2_payment', 'Payment method')}
          </div>
          <div className="grid grid-cols-3 gap-2.5 md:gap-3">
            <button
              onClick={() => setPaymentMethod('XMR')}
              className={`min-h-[44px] py-3 px-3 border flex items-center justify-center gap-2 transition-colors rounded-sm ${paymentMethod === 'XMR' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent' : 'border-wr-border text-wr-dim hover:border-wr-accent/40'}`}
            >
              <img src="/monero-xmr-logo.png" className="w-4 h-4" alt="XMR" />
              <span className="text-[11px] font-bold tracking-[0.12em] font-mono uppercase">Monero</span>
            </button>
            <button
              onClick={() => setPaymentMethod('LN')}
              className={`min-h-[44px] py-3 px-3 border flex items-center justify-center gap-2 transition-colors rounded-sm ${paymentMethod === 'LN' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent' : 'border-wr-border text-wr-dim hover:border-wr-accent/40'}`}
            >
              <Zap size={15} />
              <span className="text-[11px] font-bold tracking-[0.12em] font-mono uppercase">Lightning</span>
            </button>
            <button
              onClick={() => setPaymentMethod('USDT')}
              className={`min-h-[44px] py-3 px-3 border flex items-center justify-center gap-2 transition-colors rounded-sm ${paymentMethod === 'USDT' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent' : 'border-wr-border text-wr-dim hover:border-wr-accent/40'}`}
            >
              <span className="text-sm font-bold">₮</span>
              <span className="text-[11px] font-bold tracking-[0.12em] font-mono uppercase">USDT</span>
            </button>
          </div>
          {paymentMethod === 'USDT' && (
            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
              <button onClick={() => setUsdtChain('tron')}
                className={`min-h-[44px] py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] border rounded-sm transition-colors ${usdtChain === 'tron' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent' : 'border-wr-border text-wr-dim hover:border-wr-accent/40'}`}>
                TRON (TRC20)
              </button>
              <button onClick={() => setUsdtChain('eth')}
                className={`min-h-[44px] py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] border rounded-sm transition-colors ${usdtChain === 'eth' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent' : 'border-wr-border text-wr-dim hover:border-wr-accent/40'}`}>
                Ethereum (ERC20)
              </button>
            </div>
          )}
        </div>

        </div>

        {/* ── Order summary ── */}
        <aside className="min-w-0 lg:sticky lg:top-6 self-start space-y-3">
          <div className="border border-wr-border rounded-sm bg-wr-base/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-wr-dim">
                {t('mail.v2_summary', 'Order summary')}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-wr-accent">
                {t('mail.v2_checkout', 'Checkout')}
              </span>
            </div>

            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex items-start justify-between gap-3">
                <span className="text-wr-dim uppercase tracking-[0.12em]">{t('mail.v2_address', 'Address')}</span>
                <span className="text-right break-all">{customName || '—'}@{selectedDomain}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-wr-dim uppercase tracking-[0.12em]">{t('mail.v2_tier', 'Tier')}</span>
                <span className="text-right">{tiers[selectedTier]?.label || selectedTier}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-wr-dim uppercase tracking-[0.12em]">{t('mail.v2_duration', 'Duration')}</span>
                <span className="text-right">
                  {(() => {
                    if (selectedDuration.addonPrice === 0 && tiers[selectedTier]) {
                      const s = tiers[selectedTier].baseSeconds;
                      return s >= 86400 ? `${Math.floor(s / 86400)} DAY PASS` : `${Math.floor(s / 3600)} HOUR PASS`;
                    }
                    return selectedDuration.label;
                  })()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-wr-dim uppercase tracking-[0.12em]">{t('mail.v2_extensions', 'Extensions')}</span>
                <span className="text-right">
                  {selectedDuration.addonPrice > 0 ? `+$${selectedDuration.addonPrice.toFixed(2)}` : t('mail.v2_none', 'None')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-wr-dim uppercase tracking-[0.12em]">{t('mail.v2_payment', 'Payment')}</span>
                <span className="text-right uppercase">{paymentMethod === 'XMR' ? 'Monero' : paymentMethod === 'LN' ? 'Lightning' : `USDT ${usdtChain === 'tron' ? 'TRC20' : 'ERC20'}`}</span>
              </div>
              <div className="flex items-end justify-between gap-3 border-t border-wr-border/60 pt-3 mt-1">
                <span className="text-wr-dim uppercase tracking-[0.12em]">{t('mail.v2_total', 'Total')}</span>
                <span className="text-lg font-black tabular-nums text-wr-accent">${getFinalPrice().toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => startPurchase(selectedTier, paymentMethod, paymentMethod === 'USDT' ? usdtChain : undefined)}
              disabled={!customName || !!handleError || paymentState.status === 'CREATING'}
              className={`min-h-[48px] w-full px-6 py-4 text-[11px] font-bold tracking-[0.18em] uppercase transition-all flex items-center justify-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-accent focus-visible:ring-offset-2 focus-visible:ring-offset-wr-base
                ${customName && !handleError
                  ? 'bg-wr-accent text-black hover:brightness-110'
                  : 'bg-wr-surface border border-wr-border text-wr-dim cursor-not-allowed'}
              `}
            >
              <span>{paymentState.status === 'CREATING' ? 'Creating…' : t('mail.v2_create', 'Create inbox')}</span>
              <span className="opacity-40">|</span>
              <span className="font-mono">${getFinalPrice().toFixed(2)}</span>
              <ChevronRight size={16} />
            </button>

            <div className="text-center">
              <button onClick={openToS} className="text-[11px] text-wr-dim hover:text-wr-accent underline transition-colors">
                {t('mail.v2_tos', 'Terms of Service')}
              </button>
            </div>
          </div>

          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-wr-dim/70 flex items-center gap-2 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-wr-accent" />
            {t('mail.v2_ready', 'Ready — awaiting authorization')}
          </div>
        </aside>
      </div>
      </div>


      {showImportModal && onImportSession && (
        <SessionTransferModal
          mode="import"
          onClose={() => setShowImportModal(false)}
          onImport={onImportSession}
        />
      )}
    </div>
  );
}
