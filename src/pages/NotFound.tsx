import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { ShieldOff } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased bg-wr-base text-current transition-colors duration-300">
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <Header />

      <main className="w-full max-w-5xl px-4 md:px-6 relative z-10 flex-grow flex items-center justify-center">
        <div className="text-center space-y-6 py-20">
          <div className="mx-auto w-20 h-20 rounded-full bg-wr-accent/10 flex items-center justify-center text-wr-accent border border-wr-accent/20">
            <ShieldOff size={40} />
          </div>

          <div>
            <h1 className="text-6xl font-black text-wr-accent tracking-tight mb-2">404</h1>
            <p className="text-sm text-wr-dim uppercase tracking-[0.3em]">SIGNAL NOT FOUND</p>
          </div>

          <p className="text-xs text-wr-dim max-w-sm mx-auto leading-relaxed">
            This endpoint doesn't exist. The wall you're looking for may have been destroyed — or never existed.
          </p>

          <a href="https://t.me/kyc_rip_bot" target="_blank" rel="noreferrer" className="text-wr-accent hover:underline text-xs">
            Need help? @kyc_rip_bot
          </a>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/"
              className="px-6 py-3 bg-wr-accent/10 border border-wr-accent/30 text-wr-accent text-xs font-bold uppercase tracking-wider hover:bg-wr-accent hover:text-black transition-all rounded-sm"
            >
              Return to Base
            </Link>
            <Link
              to="/mail"
              className="px-6 py-3 border border-wr-border text-wr-dim text-xs font-bold uppercase tracking-wider hover:border-wr-accent hover:text-wr-accent transition-all rounded-sm"
            >
              Ghost Mail
            </Link>
            <Link
              to="/sms"
              className="px-6 py-3 border border-wr-border text-wr-dim text-xs font-bold uppercase tracking-wider hover:border-wr-accent hover:text-wr-accent transition-all rounded-sm"
            >
              SMS Wall
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
