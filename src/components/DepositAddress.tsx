import { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, CheckCircle2, Wallet, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DepositAddressProps {
  currency: { ticker: string; name: string; network: string; image?: string };
  address: string;
  amount?: number | string;
  memo?: string;
  label?: string;
  actualNetwork?: string;
  className?: string;
}

export function DepositAddress({
  currency,
  address,
  amount,
  memo,
  label = "Deposit Address",
  actualNetwork,
  className = "",
}: DepositAddressProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [includeAmount, setIncludeAmount] = useState(true);

  const ticker = currency.ticker;
  const network = actualNetwork || currency.network;
  const iconSrc = typeof currency.image === 'string' ? currency.image : undefined;

  const isL2 = ['arbitrum', 'optimism', 'base', 'polygon', 'avax', 'linea', 'zksync'].some(
    n => network.toLowerCase().includes(n)
  );
  const isLongAddress = address.length > 80;
  const isLN = network.toLowerCase().includes('lightning');

  const getWalletUri = () => {
    const tk = ticker.toLowerCase();
    const n = network.toLowerCase();
    const a = address.trim();

    if (n === 'lightning' || n === 'bitcoin lightning') {
      return `lightning:${a}`;
    }

    if (!includeAmount || !amount) {
      if (tk === 'btc') return `bitcoin:${a}`;
      if (tk === 'xmr') return `monero:${a}`;
      if (tk === 'eth' || n.includes('erc20')) return `ethereum:${a}`;
      return a;
    }

    if (tk === 'btc') return `bitcoin:${a}?amount=${amount}`;
    if (tk === 'xmr') return `monero:${a}?tx_amount=${amount}`;
    if (tk === 'eth' || n.includes('erc20')) return `ethereum:${a}?value=${amount}`;

    return `${tk}:${a}`;
  };

  const getQrValue = () => {
    if (isLN) return address;
    return getWalletUri();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`bg-wr-surface border border-wr-border rounded-sm p-4 md:p-6 shadow-sm transition-all duration-300 ${className}`}>
      <div className="flex flex-col space-y-5">
        {/* Header Info */}
        <div className="text-center space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-wr-dim">
            {label} ({ticker.toUpperCase()})
          </div>
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border
            ${isL2
              ? 'bg-wr-warning/10 text-wr-warning border-wr-warning/30'
              : 'bg-wr-green/5 text-wr-green border-wr-green/20'
            }`}
          >
            {isL2 && <AlertTriangle size={10} />}
            NETWORK: {network.toUpperCase()}
          </div>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white p-3 rounded-sm shadow-sm border border-wr-border">
            <QRCodeCanvas
              value={getQrValue()}
              size={160}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
              includeMargin={false}
              imageSettings={iconSrc ? {
                src: iconSrc,
                x: undefined,
                y: undefined,
                height: 34,
                width: 34,
                excavate: true,
              } : undefined}
            />
          </div>

          {/* Amount Toggle */}
          {amount && !isLN && (
            <div
              onClick={() => setIncludeAmount(!includeAmount)}
              className="flex items-center gap-2 cursor-pointer group select-none"
            >
              <div className={`w-7 h-3.5 rounded-full relative transition-colors duration-300 ${includeAmount ? 'bg-wr-green' : 'bg-wr-dim/20'}`}>
                <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow-sm transition-transform duration-300 ${includeAmount ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider ${includeAmount ? 'text-wr-green' : 'text-wr-dim'}`}>
                {t('deposit.includeAmount', 'Include amount')}
              </span>
            </div>
          )}
        </div>

        {/* Amount */}
        {amount && (
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-wr-dim mb-1">
              {t('deposit.sendExactly', 'Send exactly')}
            </div>
            <div className="text-lg font-bold font-mono text-wr-accent">
              {isLN ? `${amount} sats` : `${amount} ${ticker.toUpperCase()}`}
            </div>
          </div>
        )}

        {/* Address */}
        <div className="space-y-2">
          <div
            onClick={handleCopy}
            className="group relative flex items-center justify-center gap-2 p-3 bg-wr-base/50 rounded border border-wr-border cursor-pointer hover:border-wr-green/50 transition-all active:scale-[0.98]"
          >
            <div className={`font-bold text-wr-green font-mono text-center leading-tight break-all ${isLongAddress ? 'text-[10px] line-clamp-3' : 'text-sm'}`}>
              {address}
            </div>
            <div className="shrink-0 text-wr-dim group-hover:text-wr-green transition-colors">
              {copied ? <CheckCircle2 size={16} className="text-wr-green" /> : <Copy size={16} />}
            </div>

            <div className={`absolute -top-8 left-1/2 -translate-x-1/2 bg-wr-surface border border-wr-border text-wr-green text-[10px] px-2 py-1 rounded transition-opacity pointer-events-none ${copied ? 'opacity-100' : 'opacity-0'}`}>
              {t('common.copied', 'COPIED')}
            </div>
          </div>

          {(memo && memo !== "0") && (
            <div className="mt-2 p-3 bg-wr-warning/10 border border-wr-warning/30 rounded flex flex-col items-center gap-1">
              <span className="text-[9px] font-bold text-wr-warning uppercase tracking-widest">
                MEMO REQUIRED
              </span>
              <div className="flex items-center gap-2 font-mono font-bold text-wr-warning">
                {memo}
                <Copy size={12} className="cursor-pointer hover:text-white" onClick={() => navigator.clipboard.writeText(memo)} />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={getWalletUri()}
            className="flex items-center justify-center gap-2 py-2 rounded bg-wr-dim/10 text-wr-dim text-[10px] font-bold hover:bg-wr-dim/20 transition-colors border border-transparent"
          >
            <Wallet size={12} />
            {t('deposit.openApp', 'OPEN IN APP')}
          </a>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 py-2 rounded border border-wr-border text-wr-dim text-[10px] font-bold hover:bg-wr-dim/10 transition-colors"
          >
            <Copy size={12} />
            {t('deposit.copy', 'COPY')}
          </button>
        </div>
      </div>

      {includeAmount && amount && !isLN && (
        <div className="text-[9px] text-wr-dim/50 mt-4 text-center">
          {t('deposit.tipExactAmount', 'Send the exact amount for automatic confirmation')}
        </div>
      )}
    </div>
  );
}
