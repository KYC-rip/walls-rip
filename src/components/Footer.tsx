import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="w-full border-t border-wr-border mt-16">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-12">
        {/* CTA */}
        <div className="flex flex-col items-center text-center mb-12 gap-3">
          <p className="text-[11px] text-wr-dim uppercase tracking-[0.2em] font-bold">
            Communication is a right, not a privilege.
          </p>
          <a
            href="https://kyc.rip/swap?from=usdt&from_network=TRC20&to=xmr&to_network=Mainnet&amount=100"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-wr-accent/10 border border-wr-accent/30 text-wr-accent text-xs font-bold uppercase tracking-wider hover:bg-wr-accent hover:text-white dark:hover:text-black transition-all rounded-sm"
          >
            Get XMR privately <ExternalLink size={12} />
          </a>
        </div>

        {/* 4-column grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Tools */}
          <div>
            <h4 className="text-[10px] text-wr-dim uppercase tracking-wider font-bold mb-3">Tools</h4>
            <ul className="space-y-2 text-[12px]">
              <li><Link to="/mail" className="hover:text-wr-accent transition-colors">Ghost Mail</Link></li>
              <li><Link to="/drop" className="hover:text-wr-accent transition-colors">Dead Drop</Link></li>
              <li><Link to="/sms" className="hover:text-wr-accent transition-colors">SMS Wall</Link></li>
            </ul>
          </div>

          {/* Learn */}
          <div>
            <h4 className="text-[10px] text-wr-dim uppercase tracking-wider font-bold mb-3">Learn</h4>
            <ul className="space-y-2 text-[12px]">
              <li><Link to="/faq" className="hover:text-wr-accent transition-colors">FAQ</Link></li>
              <li><a href="https://stables.rip" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">Freeze Tracker</a></li>
            </ul>
          </div>

          {/* Ecosystem */}
          <div>
            <h4 className="text-[10px] text-wr-dim uppercase tracking-wider font-bold mb-3">Ecosystem</h4>
            <ul className="space-y-2 text-[12px]">
              <li>
                <a href="https://kyc.rip" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">
                  kyc.rip <span className="text-wr-dim text-[10px]">— No-KYC swaps</span>
                </a>
              </li>
              <li>
                <a href="https://stables.rip" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">
                  stables.rip <span className="text-wr-dim text-[10px]">— Freeze tracker</span>
                </a>
              </li>
              <li>
                <a href="https://xmrprice.live" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">
                  xmrprice.live <span className="text-wr-dim text-[10px]">— XMR price</span>
                </a>
              </li>
              <li>
                <a href="https://ripley.run" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">
                  ripley.run <span className="text-wr-dim text-[10px]">— Monero toolkit</span>
                </a>
              </li>
              <li>
                <a href="https://xmr402.org" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">
                  xmr402.org <span className="text-wr-dim text-[10px]">— XMR paywall</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="text-[10px] text-wr-dim uppercase tracking-wider font-bold mb-3">Connect</h4>
            <ul className="space-y-2 text-[12px]">
              <li><a href="https://x.com/XBToshi" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">@XBToshi</a></li>
              <li><a href="https://x.com/kyc_rip" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">@kyc_rip</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-6 border-t border-wr-border/30 text-[10px] text-wr-dim">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wr-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wr-accent" />
            </span>
            <span className="font-bold">walls.rip</span>
            <span className="opacity-50">— A</span>
            <a href="https://kyc.rip" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors font-bold">
              rip.family
            </a>
            <span className="opacity-50">project</span>
          </div>
          <span className="opacity-50">
            No logs. No identity. No walls.
          </span>
        </div>
      </div>
    </footer>
  );
}
