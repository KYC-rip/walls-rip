import { useState, useEffect, useCallback } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STORAGE_KEY = 'pwa-install-dismissed';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed or already installed
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShow(false);
    setDeferredPrompt(null);
    localStorage.setItem(STORAGE_KEY, '1');
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 p-3 bg-wr-surface border border-wr-border rounded-[var(--radius-md)] shadow-lg backdrop-blur-sm">
        <div className="flex-shrink-0 w-10 h-10 rounded-[var(--radius-sm)] bg-wr-accent/10 border border-wr-accent/20 flex items-center justify-center">
          <Download className="w-5 h-5 text-wr-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[var(--text-primary)] font-[var(--font-display)]">
            Install walls.rip
          </p>
          <p className="text-[10px] text-wr-dim mt-0.5">
            Quick access from your home screen
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 bg-wr-accent text-black text-[10px] font-bold uppercase tracking-wider rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-wr-dim hover:text-[var(--text-primary)] transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
