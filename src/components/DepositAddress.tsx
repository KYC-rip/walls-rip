import { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, CheckCircle2, Wallet, AlertTriangle } from 'lucide-react';

interface DepositAddressProps {
  currency: { ticker: string; name: string; network: string; image?: string };
  address: string;
  amount: number;
  label?: string;
  actualNetwork?: string;
}

export function DepositAddress({
  currency,
  address,
  amount,
  label = "Deposit Address",
  actualNetwork,
}: DepositAddressProps) {
  const [copied, setCopied] = useState(false);

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
    <div className="bg-wr-surface border border-wr-border rounded-sm p-4 md:p-6 shadow-sm transition-all duration-300">
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
        <div className="flex justify-center">
          <div className="bg-white p-3 rounded-sm">
            <QRCodeCanvas
              value={getQrValue()}
              size={180}
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
        </div>

        {/* Amount */}
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest text-wr-dim mb-1">Send exactly</div>
          <div className="text-lg font-bold font-mono text-wr-accent">
            {isLN ? `${amount} sats` : `${amount} ${ticker.toUpperCase()}`}
          </div>
        </div>

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
              COPIED
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={getWalletUri()}
            className="flex items-center justify-center gap-2 py-2 rounded bg-wr-dim/10 text-wr-dim text-[10px] font-bold hover:bg-wr-dim/20 transition-colors border border-transparent"
          >
            <Wallet size={12} />
            OPEN IN APP
          </a>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 py-2 rounded border border-wr-border text-wr-dim text-[10px] font-bold hover:bg-wr-dim/10 transition-colors"
          >
            <Copy size={12} />
            COPY
          </button>
        </div>
      </div>

      <div className="text-[9px] text-wr-dim/50 mt-4 text-center">
        Send the exact amount for automatic confirmation
      </div>
    </div>
  );
}
