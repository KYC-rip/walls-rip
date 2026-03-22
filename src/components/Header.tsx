import { useState } from 'react';
import { Sun, Moon, Monitor, Eye, EyeOff, ALargeSmall, Palette, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';

const NAV = [
  { path: '/', label: 'Home' },
  { path: '/mail', label: 'Ghost Mail' },
  { path: '/comms', label: 'Comms' },
  { path: '/drop', label: 'Dead Drop' },
  { path: '/sms', label: 'SMS Wall' },
  { path: '/faq', label: 'FAQ' },
];

export function Header() {
  const {
    mode, cycleTheme,
    contrast, toggleContrast,
    fontScale, cycleFontScale,
    skin, skinLabel, cycleSkin,
  } = useTheme();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="w-full max-w-6xl mx-auto px-4 md:px-6 py-5 flex items-center justify-between relative z-20">
      {/* Logo + Nav */}
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-0.5 group shrink-0">
          <span className="relative flex h-2 w-2 mr-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wr-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-wr-accent" />
          </span>
          <span className="text-sm font-extrabold tracking-tight">WALLS</span>
          <span className="text-sm font-extrabold tracking-tight text-wr-dim">.RIP</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-sm transition-colors ${
                pathname === item.path
                  ? 'text-wr-accent bg-wr-accent/10'
                  : 'text-wr-dim hover:text-current hover:bg-wr-accent/5'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
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
            {NAV.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className={`text-sm font-bold px-3 py-2 rounded-sm transition-colors ${
                  pathname === item.path
                    ? 'text-wr-accent bg-wr-accent/10'
                    : 'text-wr-dim hover:text-current hover:bg-wr-accent/5'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
