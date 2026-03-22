/* eslint-disable @typescript-eslint/no-explicit-any */
import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent, type Event, type Filter } from 'nostr-tools';

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://relay.nostr.band'
];

export class GhostRelay {
  private pool: SimplePool;
  private relays: string[];
  private secretKey: Uint8Array;
  private publicKey: string;
  private sub: any = null;

  constructor(customRelays: string[] = DEFAULT_RELAYS) {
    this.pool = new SimplePool();
    this.relays = customRelays;
    this.secretKey = generateSecretKey();
    this.publicKey = getPublicKey(this.secretKey);
    console.log(`[GHOST_INIT] My Ephemeral ID: ${this.publicKey}`);
  }

  public async publish(encryptedContent: string, roomTag: string) {
    if (!roomTag) {
      console.error('[GHOST_PUB] Error: No Room Tag provided!');
      return false;
    }

    console.log(`[GHOST_PUB] 📡 Broadcasting to Channel: ${roomTag}`);

    try {
      const eventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['t', roomTag],
          ['client', 'walls.rip/ghost']
        ],
        content: encryptedContent,
      };

      const signedEvent = finalizeEvent(eventTemplate, this.secretKey);
      console.log('[GHOST_PUB] Event Signed:', signedEvent.id);

      await Promise.any(this.pool.publish(this.relays, signedEvent));

      console.log('[GHOST_PUB] ✅ Relay accepted the event!');
      return true;
    } catch (e) {
      console.error('[GHOST_PUB] ❌ Publish failed:', e);
      return false;
    }
  }

  public subscribe(roomTag: string, onEvent: (content: string, author: string, timestamp: number) => void) {
    if (this.sub) this.sub.close();

    if (!roomTag) {
      console.warn('[GHOST_SUB] Missing Room Tag');
      return;
    }

    console.log(`[GHOST_SUB] 👂 Listening on Channel: ${roomTag}`);

    const filter: Filter = {
      kinds: [1],
      '#t': [roomTag],
    };

    console.log('[GHOST_SUB] Filter:', JSON.stringify(filter));

    this.sub = this.pool.subscribeMany(
      this.relays,
      filter,
      {
        onevent: (event: Event) => {
          console.log(`[GHOST_RECV] 📩 Incoming Event from ${event.pubkey.slice(0, 6)}...`);

          if (event.pubkey === this.publicKey) {
            console.log('[GHOST_RECV] ↩️ Ignored my own echo.');
            return;
          }

          console.log('[GHOST_RECV] 🟢 Passing to UI...');
          onEvent(event.content, event.pubkey, event.created_at);
        },
        oneose: () => {
          console.log('[GHOST_SUB] 🏁 End of Stored Events (EOSE)');
        }
      }
    );
  }

  public cleanup() {
    if (this.sub) this.sub.close();
    console.log('[GHOST_TERM] Link Severed.');
  }
}
