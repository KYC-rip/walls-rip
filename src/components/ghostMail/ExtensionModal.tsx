/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { Clock, Zap } from 'lucide-react';
import type { DurationConfig } from '../../hooks/useGhostMail';

interface ExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  durations: DurationConfig[];
  currentTierPrice: number;
  onExtend: (d: DurationConfig, method: 'XMR' | 'LN') => void;
}

export function ExtensionModal({
  isOpen,
  onClose,
  durations,
  currentTierPrice,
  onExtend
}: ExtensionModalProps) {
  const [selectedDurationLabel, setSelectedDurationLabel] = useState(durations[0]?.label || '');
  const [paymentMethod, setPaymentMethod] = useState<'XMR' | 'LN'>('XMR');

  if (!durations.length) return null;

  const selected = durations.find(d => d.label === selectedDurationLabel) || durations[0];
  const finalPrice = currentTierPrice + (selected.addonPrice || 0);

  const handleExtend = () => {
    onExtend(selected, paymentMethod);
  };

  return (
    <div className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}>
      <div className="absolute inset-0 bg-wr-base/80 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-md bg-wr-surface border border-wr-border p-6 shadow-2xl animate-in zoom-in-95 duration-200 rounded-sm">
        <div className="flex items-center gap-2 text-wr-green mb-6 border-b border-wr-border/30 pb-4">
          <Clock size={20} />
          <h2 className="text-sm font-black tracking-widest uppercase">TIME DILATION</h2>
        </div>

        <div className="space-y-6 mb-8">
          {/* Duration Selection */}
          <div className="space-y-3">
            <label className="text-[9px] font-black text-wr-dim uppercase tracking-widest">Select extension period</label>
            <div className="grid grid-cols-1 gap-2">
              {durations.filter(d => d.value > 0).map((dur) => (
                <button
                  key={dur.label}
                  onClick={() => setSelectedDurationLabel(dur.label)}
                  className={`p-4 border text-left transition-all relative overflow-hidden rounded-xs
                    ${selectedDurationLabel === dur.label
                      ? 'border-wr-green bg-wr-green/5 text-wr-green'
                      : 'border-wr-border hover:border-wr-dim text-wr-dim'
                    }
                  `}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs tracking-widest uppercase">{dur.label}</span>
                    <span className="text-sm font-bold font-mono">+${dur.addonPrice.toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-3">
            <label className="text-[9px] font-black text-wr-dim uppercase tracking-widest">Payment network</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod('XMR')}
                className={`flex items-center justify-center gap-2 py-3 border rounded-xs text-[10px] font-black uppercase transition-all
                  ${paymentMethod === 'XMR' ? 'bg-wr-green text-wr-base border-wr-green' : 'border-wr-border text-wr-dim hover:border-wr-dim'}
                `}
              >
                MONERO (XMR)
              </button>
              <button
                onClick={() => setPaymentMethod('LN')}
                className={`flex items-center justify-center gap-2 py-3 border rounded-xs text-[10px] font-black uppercase transition-all
                  ${paymentMethod === 'LN' ? 'bg-[#0088cc] text-white border-[#0088cc]' : 'border-wr-border text-wr-dim hover:border-wr-dim'}
                `}
              >
                <Zap size={12} className={paymentMethod === 'LN' ? 'fill-current' : ''} />
                LIGHTNING
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-wr-border pt-6 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] text-wr-dim uppercase tracking-widest font-bold">Total surcharge</span>
            <span className="text-2xl text-wr-green font-bold font-mono">${finalPrice.toFixed(2)}</span>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-[10px] font-black text-wr-dim hover:text-wr-green transition-colors uppercase tracking-widest">
              Cancel
            </button>
            <button
              onClick={handleExtend}
              className="bg-wr-green text-wr-base px-8 py-3 text-xs font-black hover:opacity-90 shadow-lg shadow-wr-green/20 uppercase tracking-widest rounded-sm"
            >
              Extend
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
