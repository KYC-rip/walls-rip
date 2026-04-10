/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { RefreshCw, AlertTriangle, ChevronDown, Clock, Dices, ChevronRight, Mail, Zap, Upload } from 'lucide-react';
import { TIER_UI_CONFIG } from './constants';
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
  startPurchase: (t: TierType, method: 'XMR' | 'LN' | 'USDT', chain?: string) => void;
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
  const [paymentMethod, setPaymentMethod] = useState<'XMR' | 'LN' | 'USDT'>('XMR');
  const [usdtChain, setUsdtChain] = useState<'tron' | 'eth'>('tron');
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
      <div className="flex flex-col items-center justify-center py-20 animate-pulse text-wr-dim">
        <RefreshCw size={32} className="animate-spin mb-4" />
        <p className="text-xs tracking-widest uppercase">SYNCING CONFIGURATION...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 md:space-y-10 pb-8 md:pb-12 animate-in fade-in duration-500">
      {/* Inline Hero Section */}
      <div className="scale-90 md:scale-100 origin-top text-center py-8 md:py-12">
        <div className="mx-auto w-16 h-16 rounded-full bg-wr-accent/10 flex items-center justify-center text-wr-accent border border-wr-accent/20 mb-6">
          <Mail size={32} />
        </div>
        <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight mb-3">
          GHOST <span className="text-wr-accent">MAIL</span>
        </h1>
        <p className="text-wr-dim text-sm max-w-md mx-auto">
          Disposable encrypted email. No identity. No logs.
        </p>
      </div>

      {error && (
        <div className="border border-wr-error bg-wr-error/10 p-4 text-center text-wr-error animate-pulse text-xs">
          <AlertTriangle className="inline-block w-4 h-4 mr-2" />
          {error}
          <div className="mt-2">
            <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-error/80 hover:text-wr-error hover:underline text-[10px]">
              Need help? @kyc_rip_bot
            </a>
          </div>
        </div>
      )}

      {/* Import Session */}
      {onImportSession && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 text-xs text-wr-dim hover:text-wr-green transition-colors uppercase tracking-wider"
          >
            <Upload size={12} />
            Have a session key from another device? Restore it
          </button>
        </div>
      )}

      {/* Free Tier Promo */}
      <div className="mx-2 md:mx-0 bg-wr-surface border border-wr-border p-4 md:p-6 rounded-sm flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden group">
         <div className="absolute inset-0 bg-[#0088cc]/5 group-hover:bg-[#0088cc]/10 transition-colors pointer-events-none"></div>
         <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#0088cc]"></div>

         <div className="flex items-start gap-4 relative z-10">
             <div className="p-3 bg-[#0088cc]/10 text-[#0088cc] rounded-full shrink-0 border border-[#0088cc]/20">
                 <Mail size={24} />
             </div>
             <div>
                 <h3 className="text-[#0088cc] font-bold tracking-widest text-sm mb-1 uppercase flex items-center gap-2">
                    FREE ACCESS VIA TELEGRAM
                    <span className="text-[9px] bg-[#0088cc] text-white px-1.5 py-0.5 rounded-xs">TELEGRAM</span>
                 </h3>
                 <p className="text-xs text-wr-dim font-mono leading-relaxed max-w-lg text-left">
                     Get a free Ghost Mail inbox through our Telegram bot.
                     <span className="hidden md:inline"> No payment needed for basic tier.</span>
                 </p>
             </div>
         </div>
         <a
            href="https://t.me/kyc_rip_bot?start=mail"
            target="_blank"
            rel="noopener noreferrer"
            className="relative z-10 w-full md:w-auto px-6 py-3 bg-[#0088cc] hover:bg-[#0088cc]/90 text-white text-xs font-bold tracking-widest uppercase transition-all rounded-sm flex items-center justify-center gap-2 shadow-lg shadow-[#0088cc]/20 hover:shadow-[#0088cc]/40 hover:-translate-y-0.5"
         >
             Launch Bot <ChevronRight size={14} />
         </a>
      </div>

      {/* Tier Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 px-2 md:px-0">
        {(Object.keys(tiers) as TierType[]).map((tierKey) => {
          const tier = tiers[tierKey];
          if (!tier) return null;

          const isSelected = selectedTier === tierKey;
          const Icon = tier.icon || TIER_UI_CONFIG[tierKey].icon;

          return (
            <div
              key={tierKey} onClick={() => setSelectedTier(tierKey)}
              className={`
                relative p-4 md:p-6 border-2 cursor-pointer transition-all duration-300 group overflow-hidden rounded-sm
                ${isSelected
                  ? `${tier.borderColor} bg-wr-surface shadow-[0_0_20px_rgba(0,0,0,0.3)]`
                  : 'border-wr-border bg-wr-surface/50 hover:border-wr-dim'
                }
              `}
            >
              {isSelected && (
                <div className={`absolute top-0 right-0 p-1 px-2 text-[10px] font-bold ${tier.cssColor} bg-wr-base border-b border-l border-wr-border rounded-bl-sm`}>ACTIVE</div>
              )}
              <div className="flex justify-between items-start mb-6">
                <Icon className={`w-8 h-8 ${isSelected ? tier.cssColor : 'text-wr-dim group-hover:text-wr-green'}`} />
                <div className="text-right">
                  <div className={`text-2xl font-bold font-mono ${isSelected ? tier.cssColor : 'text-wr-dim'}`}>
                    ${tier.priceUSD?.toFixed(2)}
                  </div>
                  <div className={`text-[10px] font-bold font-mono opacity-60 ${isSelected ? tier.cssColor : 'text-wr-dim'}`}>
                    {tier.baseSeconds >= 86400 ? `${Math.floor(tier.baseSeconds / 86400)} DAYS` : `${Math.floor(tier.baseSeconds / 3600)} HOURS`}
                  </div>
                </div>
              </div>
              <h3 className={`text-sm font-bold tracking-[0.2em] mb-3 ${isSelected ? 'text-wr-base bg-wr-green px-1 inline-block' : 'text-wr-dim'}`}>
                {tier.label}
              </h3>
              <p className="text-xs text-wr-dim leading-relaxed font-mono whitespace-pre-line">
                {tier.desc.split('. ').map((line: string, i: number) => (
                  <span key={i} className={line.includes('Clean Pool') || line.includes('Zero Flags') ? 'text-wr-green font-bold' : ''}>
                    {line}{i < tier.desc.split('. ').length - 1 ? '. ' : ''}
                  </span>
                ))}
              </p>
            </div>
          );
        })}
      </div>

      {/* Identity Console */}
      <div className="bg-wr-surface border border-wr-border p-4 md:p-10 relative overflow-hidden shadow-2xl mx-2 md:mx-0">
        <div className="relative z-10 flex flex-col md:flex-row gap-4 md:gap-8 items-start mb-10 md:mb-14">
          {/* Username Input Container */}
          <div className="flex-1 w-full space-y-2 relative">
            <label className="flex justify-between text-[10px] md:text-xs text-wr-dim uppercase tracking-widest font-bold">
              <span className="flex items-center gap-2">
                IDENTITY HANDLE
                {!isBasic && (
                  <span className="text-[8px] bg-wr-green/20 text-wr-green px-1.5 py-0.5 rounded-full animate-pulse border border-wr-green/30">
                    CUSTOM
                  </span>
                )}
              </span>
              <span className={`text-[9px] md:text-[10px] ${isRandom ? 'text-wr-green' : 'text-wr-accent'} transition-colors duration-500`}>
                {isRandom ? `● ENCRYPTED RANDOM` : `● USER DEFINED`}
              </span>
            </label>

            <div className="relative group">
              <input
                type="text" value={customName}
                onChange={(e) => !isBasic && onNameChange(e.target.value)}
                readOnly={isBasic}
                className={`w-full bg-wr-base border-2 p-3 md:p-4 pr-12 outline-none font-mono text-base md:text-lg transition-all duration-300 rounded-sm
                  ${isBasic ? 'border-wr-border text-wr-dim/50 cursor-not-allowed' :
                    handleError ? 'border-wr-error text-wr-error shadow-[0_0_15px_rgba(255,0,0,0.1)]' :
                    isRandom ? 'border-wr-border text-wr-dim hover:border-wr-dim' :
                    'border-wr-green text-wr-green shadow-[0_0_15px_rgba(0,255,65,0.15)] ring-1 ring-wr-green/20'
                  } focus:border-wr-green focus:text-wr-green placeholder-wr-dim/30`}
                placeholder="ghost-xxxx"
              />
              <button
                onClick={generateRandomName}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 text-wr-dim hover:text-wr-green hover:rotate-180 transition-all duration-500 ${isBasic ? 'opacity-30 cursor-not-allowed' : 'opacity-100'}`}
                disabled={isBasic}
              >
                <Dices size={20} className={isRandom ? '' : 'opacity-50'} />
              </button>
            </div>

            <div className="absolute top-full left-0 w-full pt-1">
              {handleError && !isBasic ? (
                <div className="text-[9px] md:text-[10px] text-wr-error font-bold tracking-widest animate-in fade-in slide-in-from-top-1">
                  {" >> "}ERR_INVALID_FORMAT: {handleError}
                </div>
              ) : isBasic ? (
                <div className="text-[8px] md:text-[9px] text-wr-dim opacity-50 font-mono italic">
                  * BASIC tier uses random identity
                </div>
              ) : !isRandom ? (
                <div className="text-[8px] md:text-[9px] text-wr-green opacity-70 font-mono animate-pulse">
                  {" >> "}HANDLE ACCEPTED — CUSTOM IDENTITY ACTIVE
                </div>
              ) : null}
            </div>
          </div>

          <div className="text-wr-dim pt-10 hidden md:block text-2xl font-thin opacity-30 select-none">@</div>

          {/* Domain Select Container */}
          <div className="w-full md:w-1/3 space-y-2">
            <label className="block text-[10px] md:text-xs text-wr-dim uppercase tracking-widest font-bold">TARGET NODE</label>
            <div className="relative">
              <select
                value={selectedDomain} onChange={(e) => setSelectedDomain(e.target.value)}
                className="w-full appearance-none bg-wr-base border-2 border-wr-border text-wr-green p-3 md:p-4 pr-10 outline-none focus:border-wr-green cursor-pointer font-mono text-base md:text-lg hover:border-wr-dim transition-colors rounded-sm"
              >
                {domainOptions.filter(d => d.tier === selectedTier).map(d => (
                  <option key={d.domain} value={d.domain}>{d.domain}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-wr-dim opacity-50">
                <ChevronDown size={20} />
              </div>
            </div>
          </div>
        </div>

        {/* --- TIME DILATION --- */}
        <div className="mb-6 md:mb-10 animate-in slide-in-from-left duration-500 delay-150">
          <div className="text-[10px] md:text-xs text-wr-dim mb-4 uppercase tracking-widest font-bold flex items-center gap-2">
            <Clock size={12} className="text-wr-green" /> TIME DILATION
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
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
                  className={`
                    py-3 md:py-4 px-4 md:px-6 border text-xs md:text-sm font-mono transition-all relative overflow-hidden group text-left rounded-sm
                    ${isSelected
                      ? 'border-wr-green bg-wr-green/10 text-wr-green shadow-[0_0_15px_rgba(0,255,65,0.15)]'
                      : 'border-wr-border bg-wr-surface/50 text-wr-dim hover:border-wr-dim hover:bg-wr-surface'
                    }
                  `}
                >
                  {isSelected && <div className="absolute top-0 right-0 w-3 h-3 bg-wr-green"></div>}
                  {isBestValue && (
                    <div className="absolute -right-8 top-2 rotate-45 bg-wr-accent text-black text-[7px] md:text-[8px] font-bold py-0.5 px-8 shadow-sm">
                      BEST VALUE
                    </div>
                  )}
                  <div className={`font-bold tracking-widest mb-0.5 md:mb-1 ${isSelected ? 'text-wr-green' : 'text-wr-dim'}`}>{displayLabel}</div>
                  <div className="text-[9px] md:text-[10px] opacity-60">
                    {dur.addonPrice === 0 ? 'Included' : `+$${dur.addonPrice.toFixed(2)}`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="mb-6 animate-in slide-in-from-left duration-500 delay-300">
          <div className="text-[10px] md:text-xs text-wr-dim mb-4 uppercase tracking-widest font-bold flex items-center gap-2">
            <Zap size={12} className="text-wr-accent" /> PAYMENT PROTOCOL
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setPaymentMethod('XMR')}
              className={`py-3 px-3 border flex items-center justify-center gap-2 transition-all rounded-sm ${paymentMethod === 'XMR' ? 'border-wr-green bg-wr-green/10 text-wr-green shadow-[0_0_15px_rgba(0,255,65,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}
            >
              <img src="/monero-xmr-logo.png" className="w-4 h-4" alt="XMR" />
              <span className="text-xs font-bold tracking-widest font-mono uppercase">Monero</span>
            </button>
            <button
              onClick={() => setPaymentMethod('LN')}
              className={`py-3 px-3 border flex items-center justify-center gap-2 transition-all rounded-sm ${paymentMethod === 'LN' ? 'border-wr-accent bg-wr-accent/10 text-wr-accent shadow-[0_0_15px_rgba(255,153,0,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}
            >
              <Zap size={16} className="fill-current" />
              <span className="text-xs font-bold tracking-widest font-mono uppercase">Lightning</span>
            </button>
            <button
              onClick={() => setPaymentMethod('USDT')}
              className={`py-3 px-3 border flex items-center justify-center gap-2 transition-all rounded-sm ${paymentMethod === 'USDT' ? 'border-[#26a17b] bg-[#26a17b]/10 text-[#26a17b] shadow-[0_0_15px_rgba(38,161,123,0.1)]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}
            >
              <span className="text-sm font-bold">₮</span>
              <span className="text-xs font-bold tracking-widest font-mono uppercase">USDT</span>
            </button>
          </div>
          {paymentMethod === 'USDT' && (
            <div className="flex gap-2 mt-2">
              <button onClick={() => setUsdtChain('tron')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest border rounded-sm transition-all ${usdtChain === 'tron' ? 'border-[#26a17b] bg-[#26a17b]/10 text-[#26a17b]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                TRON (TRC20)
              </button>
              <button onClick={() => setUsdtChain('eth')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest border rounded-sm transition-all ${usdtChain === 'eth' ? 'border-[#26a17b] bg-[#26a17b]/10 text-[#26a17b]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}`}>
                Ethereum (ERC20)
              </button>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="mt-6 md:mt-10 pt-6 border-t border-wr-border/30 flex flex-col md:flex-row justify-between items-center gap-6 md:gap-4">
          <div className="text-[10px] md:text-xs text-wr-dim font-mono uppercase tracking-widest">
            <span className="text-wr-green animate-pulse">●</span> SYSTEM READY — AWAITING AUTHORIZATION
          </div>
          <button
            onClick={() => startPurchase(selectedTier, paymentMethod, paymentMethod === 'USDT' ? usdtChain : undefined)}
            disabled={!customName || !!handleError || paymentState.status === 'CREATING'}
            className={`
              w-full md:w-auto group relative px-8 py-4 text-xs md:text-sm font-bold tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 overflow-hidden rounded-sm
              ${customName && !handleError ? (paymentMethod === 'USDT' ? 'bg-[#26a17b] text-white shadow-[0_0_20px_rgba(38,161,123,0.4)]' : paymentMethod === 'XMR' ? 'bg-wr-green text-wr-base shadow-[0_0_20px_rgba(0,255,65,0.4)]' : 'bg-wr-accent text-black shadow-[0_0_20px_rgba(255,153,0,0.4)]') : 'bg-wr-surface border border-wr-border text-wr-dim cursor-not-allowed'}
            `}
          >
            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:animate-[scan_1s_ease-in-out_infinite] skew-x-12"></div>
            <span>{paymentState.status === 'CREATING' ? 'INITIALIZING...' : 'INITIALIZE'}</span>
            <span className="opacity-40">|</span>
            <span>${getFinalPrice().toFixed(2)}</span>
            <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        <div className="mt-4 text-center">
          <button onClick={openToS} className="text-[10px] text-wr-dim hover:text-wr-green underline transition-colors">
            Terms of Service
          </button>
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
