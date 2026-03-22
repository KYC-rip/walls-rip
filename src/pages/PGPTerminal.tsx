import { GhostLayout } from '../components/ghostChat/GhostLayout';
import { SEO } from '../components/SEO';

export const PGPTerminal = () => {
  return (
    <div className="w-full h-full">
      <SEO
        title="Ghost Chat — PGP-encrypted comms over Nostr"
        description="End-to-end encrypted messaging over Nostr relays. Ephemeral identities, no server trust. PGP-encrypted communications."
        path="/comms"
        image="/og-ghostchat.jpg"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Ghost Chat',
          url: 'https://walls.rip/comms',
          applicationCategory: 'CommunicationApplication',
          operatingSystem: 'Web',
          description: 'End-to-end encrypted messaging via decentralized Nostr relays. Ephemeral identities, no server trust.',
          featureList: 'PGP encryption, Nostr relays, Ephemeral identities, No server trust, Decentralized',
          provider: { '@type': 'Organization', name: 'walls.rip', url: 'https://walls.rip' },
        }}
      />
      <GhostLayout />
    </div>
  );
};
