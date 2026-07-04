import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Eye, EyeOff, ALargeSmall, Palette, Menu, X, Globe } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { SUPPORTED_LANGS, type SupportedLang } from '../i18n/config';

const LANG_LABELS: Record<SupportedLang, string> = {
  en: 'EN',
  'zh-TW': '中文',
  zh: '中文',
  ru: 'RU',
  es: 'ES',
  pt: 'PT',
  ja: 'JA',
};

const NAV_KEYS = [
  { path: '/', key: 'header.home' },
  { path: '/mail', key: 'header.ghost_mail' },
  { path: '/mail/pro', key: 'header.ghost_mail_pro' },
  { path: '/sms', key: 'header.sms_wall' },
  { path: '/esim', key: 'header.esim' },
  { path: '/phone', key: 'header.phone' },
  { path: '/proxy', key: 'header.proxy' },
  { path: '/drop', key: 'header.dead_drop' },
  { path: '/comms', key: 'header.comms' },
  { path: '/faq', key: 'header.faq' },
  { path: '/api', key: 'header.api' },
];

function stripLangPrefix(path: string): string {
  const segments = path.split('/');
  if (segments[1] && (SUPPORTED_LANGS as readonly string[]).includes(segments[1])) {
    return '/' + segments.slice(2).join('/') || '/';
  }
  return path;
}

function buildLangPath(lang: string, currentPath: string): string {
  const stripped = stripLangPrefix(currentPath);
  if (lang === 'en') return stripped;
  return `/${lang}${stripped === '/' ? '' : stripped}`;
}

function navLinkPath(basePath: string, currentLang: string): string {
  if (currentLang === 'en') return basePath;
  return `/${currentLang}${basePath === '/' ? '' : basePath}`;
}

export function Header() {
  const { t, i18n } = useTranslation();
  const {
    mode, cycleTheme,
    contrast, toggleContrast,
    fontScale, cycleFontScale,
    skin, skinLabel, cycleSkin,
  } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const currentLang = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language)
    ? i18n.language
    : 'en';

  const strippedPath = stripLangPrefix(pathname);

  // Close lang dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLangChange = (lang: SupportedLang) => {
    i18n.changeLanguage(lang);
    const newPath = buildLangPath(lang, pathname);
    navigate(newPath);
    setLangOpen(false);
  };

  return (
    <header className="w-full max-w-6xl mx-auto px-4 md:px-6 py-5 flex items-center justify-between relative z-20">
      {/* Logo + Nav */}
      <div className="flex items-center gap-6">
        <Link to={navLinkPath('/', currentLang)} className="flex items-center gap-0.5 group shrink-0">
          <span className="relative flex h-2 w-2 mr-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wr-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-wr-accent" />
          </span>
          <span className="text-sm font-extrabold tracking-tight">WALLS</span>
          <span className="text-sm font-extrabold tracking-tight text-wr-dim">.RIP</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_KEYS.map((item) => (
            <Link
              key={item.path}
              to={navLinkPath(item.path, currentLang)}
              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-sm transition-colors ${
                strippedPath === item.path
                  ? 'text-wr-accent bg-wr-accent/10'
                  : 'text-wr-dim hover:text-current hover:bg-wr-accent/5'
              }`}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        {/* Language selector */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="p-2 hover:bg-wr-accent/10 rounded transition-colors text-wr-dim hover:text-current flex items-center gap-1"
            title="Language"
          >
            <Globe size={15} />
            <span className="text-[9px] font-bold uppercase">{LANG_LABELS[currentLang as SupportedLang] || 'EN'}</span>
          </button>

          {langOpen && (
            <div className="absolute right-0 top-full mt-1 bg-wr-surface border border-wr-border rounded-sm shadow-xl z-50 min-w-[100px] py-1">
              {SUPPORTED_LANGS.filter(l => l !== 'zh').map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleLangChange(lang)}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    currentLang === lang
                      ? 'text-wr-accent bg-wr-accent/10'
                      : 'text-wr-dim hover:text-current hover:bg-wr-accent/5'
                  }`}
                >
                  {LANG_LABELS[lang]}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={toggleContrast}
          className="p-2 hover:bg-wr-accent/10 rounded transition-colors text-wr-dim hover:text-current"
          title={`Contrast: ${contrast}`}
        >
          {contrast === 'high' ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>

        <button
          onClick={cycleFontScale}
          className={`p-2 hover:bg-wr-accent/10 rounded transition-colors relative ${fontScale !== 'default' ? 'text-wr-accent' : 'text-wr-dim hover:text-current'}`}
          title={`Font size: ${fontScale === 'default' ? '100%' : fontScale === 'large' ? '115%' : '130%'}`}
        >
          <ALargeSmall size={15} />
          {fontScale !== 'default' && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-wr-accent rounded-full" />
          )}
        </button>

        <button
          onClick={cycleSkin}
          className={`p-2 hover:bg-wr-accent/10 rounded transition-colors relative ${skin !== 'terminal' ? 'text-wr-accent' : 'text-wr-dim hover:text-current'}`}
          title={`Skin: ${skinLabel}`}
        >
          <Palette size={15} />
          {skin !== 'terminal' && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-wr-accent rounded-full" />
          )}
        </button>

        <button
          onClick={cycleTheme}
          className="p-2 hover:bg-wr-accent/10 rounded transition-colors text-wr-dim hover:text-current"
          title={`Theme: ${mode}`}
        >
          {mode === 'light' && <Sun size={15} />}
          {mode === 'dark' && <Moon size={15} />}
          {mode === 'system' && <Monitor size={15} />}
        </button>

        {/* Mobile menu */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 hover:bg-wr-accent/10 rounded transition-colors text-wr-dim hover:text-current"
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile nav overlay */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 bg-wr-surface border-b border-wr-border p-4 md:hidden z-50">
          <nav className="flex flex-col gap-1">
            {NAV_KEYS.map((item) => (
              <Link
                key={item.path}
                to={navLinkPath(item.path, currentLang)}
                onClick={() => setMenuOpen(false)}
                className={`text-sm font-bold px-3 py-2 rounded-sm transition-colors ${
                  strippedPath === item.path
                    ? 'text-wr-accent bg-wr-accent/10'
                    : 'text-wr-dim hover:text-current hover:bg-wr-accent/5'
                }`}
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
