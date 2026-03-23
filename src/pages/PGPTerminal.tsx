import { useState } from 'react';
import { MessageSquare, Download, Globe, Shield, Zap, Lock, Monitor } from 'lucide-react';
import { GhostLayout } from '../components/ghostChat/GhostLayout';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { SEO } from '../components/SEO';

const GITHUB_RELEASES = 'https://github.com/KYC-rip/ghost-chat-desktop/releases/latest';

export const PGPTerminal = () => {
  const [useOnline, setUseOnline] = useState(() => {
    // Skip landing if user already has an identity
    return !!sessionStorage.getItem('ghost_identity');
  });

  if (useOnline) {
    return (
      <div className="w-full h-full">
        <SEO
          title="Ghost Chat — PGP-encrypted comms over Nostr"
          description="End-to-end encrypted messaging over Nostr relays. Ephemeral identities, no server trust."
          path="/comms"
          image="/og-ghostchat.jpg"
          schema={{
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Ghost Chat',
            url: 'https://walls.rip/comms',
            applicationCategory: 'CommunicationApplication',
            operatingSystem: 'Web',
            description: 'End-to-end encrypted messaging via decentralized Nostr relays.',
            featureList: 'PGP encryption, Nostr relays, Ephemeral identities, No server trust',
            provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
          }}
        />
        <GhostLayout />
      </div>
    );
  }

  return (
    <div className="flex overflow-x-hidden relative flex-col items-center min-h-screen font-mono antialiased transition-colors duration-300">
      <SEO
        title="Ghost Chat — PGP-encrypted comms over Nostr"
        description="End-to-end encrypted desktop messenger. PGP over Nostr. No accounts, no servers, no logs."
        path="/comms"
        image="/og-ghostchat.jpg"
      />
      <div className="fixed inset-0 z-50 pointer-events-none scanlines" />
      <div className="fixed inset-0 z-40 pointer-events-none vignette" />
      <Header />

      <main className="w-full max-w-4xl px-4 md:px-6 relative z-10 pb-12">
        <div className="max-w-4xl mx-auto space-y-8 md:space-y-12 py-8 md:py-16">

          {/* Hero */}
          <div className="text-center space-y-4">
            <div className="mx-auto w-20 h-20 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-400/20">
              <MessageSquare size={40} />
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-black tracking-tight">
              GHOST <span className="text-purple-400">CHAT</span>
            </h1>
            <p className="text-wr-dim text-sm md:text-base max-w-lg mx-auto">
              End-to-end encrypted messaging over Nostr relays. PGP-encrypted, no accounts, no servers, no logs.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={GITHUB_RELEASES}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 bg-purple-500 text-white font-bold text-sm uppercase tracking-wider rounded-sm hover:bg-purple-400 transition-all shadow-lg shadow-purple-500/20 hover:-translate-y-0.5"
            >
              <Download size={18} />
              Download Desktop App
            </a>
            <button
              onClick={() => setUseOnline(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 border-2 border-purple-400/40 text-current font-bold text-sm uppercase tracking-wider rounded-sm hover:border-purple-400 hover:text-purple-400 hover:bg-purple-400/5 transition-all"
            >
              <Globe size={18} />
              Use Online
            </button>
          </div>

          {/* Platform badges */}
          <div className="flex items-center justify-center gap-6 text-[10px] text-wr-dim uppercase tracking-widest">
            <span className="flex items-center gap-1"><Monitor size={10} /> macOS</span>
            <span className="flex items-center gap-1"><Monitor size={10} /> Windows</span>
            <span className="flex items-center gap-1"><Monitor size={10} /> Linux</span>
            <span className="opacity-40">~5MB</span>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Lock,
                title: 'PGP Encrypted',
                desc: 'Messages encrypted with OpenPGP. Keys generated in your browser or app. Private key never leaves your device.',
                color: 'text-green-400 border-green-400/20 bg-green-400/5',
              },
              {
                icon: Shield,
                title: 'No Servers',
                desc: 'Decentralized via Nostr relays. No central server stores your messages. No accounts, no phone numbers.',
                color: 'text-purple-400 border-purple-400/20 bg-purple-400/5',
              },
              {
                icon: Zap,
                title: 'Ephemeral',
                desc: 'Create throwaway identities instantly. No signup, no email. Desktop app stores keys in OS keychain.',
                color: 'text-cyan-400 border-cyan-400/20 bg-cyan-400/5',
              },
            ].map(f => (
              <div key={f.title} className={`p-6 rounded-sm border ${f.color}`}>
                <f.icon size={20} className="mb-3" />
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2">{f.title}</h3>
                <p className="text-[11px] text-wr-dim leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Desktop vs Online comparison */}
          <div className="bg-wr-surface border border-wr-border rounded-sm overflow-hidden">
            <div className="p-4 border-b border-wr-border/30">
              <h3 className="text-xs font-bold uppercase tracking-widest text-wr-dim">Desktop vs Online</h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-wr-border/20">
                  <th className="text-left p-3 text-wr-dim font-bold uppercase tracking-wider">Feature</th>
                  <th className="text-center p-3 text-purple-400 font-bold uppercase tracking-wider">Desktop</th>
                  <th className="text-center p-3 text-wr-dim font-bold uppercase tracking-wider">Online</th>
                </tr>
              </thead>
              <tbody className="text-wr-dim">
                {[
                  ['PGP Encryption', true, true],
                  ['Nostr Relays', true, true],
                  ['System Tray', true, false],
                  ['Native Notifications', true, false],
                  ['OS Keychain Storage', true, false],
                  ['Auto-Start', true, false],
                  ['Offline Key Access', true, false],
                  ['No Install', false, true],
                ].map(([feature, desktop, online]) => (
                  <tr key={feature as string} className="border-b border-wr-border/10">
                    <td className="p-3">{feature as string}</td>
                    <td className="p-3 text-center">{desktop ? <span className="text-green-400">✓</span> : <span className="text-wr-dim/30">—</span>}</td>
                    <td className="p-3 text-center">{online ? <span className="text-green-400">✓</span> : <span className="text-wr-dim/30">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  );
};
