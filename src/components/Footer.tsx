import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '../i18n/config';

function navLinkPath(basePath: string, currentLang: string): string {
  if (currentLang === 'en') return basePath;
  return `/${currentLang}${basePath === '/' ? '' : basePath}`;
}

export function Footer() {
  const { t, i18n } = useTranslation();
  const currentLang = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language)
    ? i18n.language
    : 'en';

  return (
    <footer className="w-full border-t border-wr-border mt-16">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-12">
        {/* CTA */}
        <div className="flex flex-col items-center text-center mb-12 gap-3">
          <p className="text-[11px] text-wr-dim uppercase tracking-[0.2em] font-bold">
            {t('footer.cta')}
          </p>
          <a
            href="https://kyc.rip/swap?from=usdt&from_network=TRC20&to=xmr&to_network=Mainnet&amount=100"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-wr-accent/10 border border-wr-accent/30 text-wr-accent text-xs font-bold uppercase tracking-wider hover:bg-wr-accent hover:text-white dark:hover:text-black transition-all rounded-sm"
          >
            {t('footer.get_xmr')} <ExternalLink size={12} />
          </a>
        </div>

        {/* 4-column grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Tools */}
          <div>
            <h4 className="text-[10px] text-wr-dim uppercase tracking-wider font-bold mb-3">{t('footer.tools')}</h4>
            <ul className="space-y-2 text-[12px]">
              <li><Link to={navLinkPath('/mail', currentLang)} className="hover:text-wr-accent transition-colors">{t('header.ghost_mail')}</Link></li>
              <li><Link to={navLinkPath('/drop', currentLang)} className="hover:text-wr-accent transition-colors">{t('header.dead_drop')}</Link></li>
              <li><Link to={navLinkPath('/sms', currentLang)} className="hover:text-wr-accent transition-colors">{t('header.sms_wall')}</Link></li>
              <li><Link to={navLinkPath('/esim', currentLang)} className="hover:text-wr-accent transition-colors">{t('header.esim')}</Link></li>
            </ul>
          </div>

          {/* Learn */}
          <div>
            <h4 className="text-[10px] text-wr-dim uppercase tracking-wider font-bold mb-3">{t('footer.learn')}</h4>
            <ul className="space-y-2 text-[12px]">
              <li><Link to={navLinkPath('/faq', currentLang)} className="hover:text-wr-accent transition-colors">{t('header.faq')}</Link></li>
              <li><a href="https://stables.rip" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">{t('footer.freeze_tracker')}</a></li>
            </ul>
          </div>

          {/* Ecosystem */}
          <div>
            <h4 className="text-[10px] text-wr-dim uppercase tracking-wider font-bold mb-3">{t('footer.ecosystem')}</h4>
            <ul className="space-y-2 text-[12px]">
              <li>
                <a href="https://kyc.rip" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">
                  kyc.rip <span className="text-wr-dim text-[10px]">— {t('footer.no_kyc_swaps')}</span>
                </a>
              </li>
              <li>
                <a href="https://stables.rip" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">
                  stables.rip <span className="text-wr-dim text-[10px]">— {t('footer.freeze_tracker')}</span>
                </a>
              </li>
              <li>
                <a href="https://xmrprice.live" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">
                  xmrprice.live <span className="text-wr-dim text-[10px]">— {t('footer.xmr_price')}</span>
                </a>
              </li>
              <li>
                <a href="https://ripley.run" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">
                  ripley.run <span className="text-wr-dim text-[10px]">— {t('footer.monero_toolkit')}</span>
                </a>
              </li>
              <li>
                <a href="https://xmr402.org" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors">
                  xmr402.org <span className="text-wr-dim text-[10px]">— {t('footer.xmr_paywall')}</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="text-[10px] text-wr-dim uppercase tracking-wider font-bold mb-3">{t('footer.connect')}</h4>
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
            <span className="opacity-50">—</span>
            <a href="https://kyc.rip" target="_blank" rel="noreferrer" className="hover:text-wr-accent transition-colors font-bold">
              rip.family
            </a>
            <span className="opacity-50">{t('footer.rip_family_project').replace('rip.family', '').replace('A ', '').replace('Un ', '').replace('Um ', '').trim()}</span>
          </div>
          <span className="opacity-50">
            {t('footer.tagline')}
          </span>
        </div>
      </div>
    </footer>
  );
}
