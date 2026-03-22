export interface KeyPair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
  name: string;
}

export interface Contact {
  fingerprint: string;
  name: string;
  publicKey: string;
  addedAt: number;
  nostrTopic?: string;
}

export interface Message {
  id: string;
  text: string;
  sender: 'me' | 'partner' | 'system';
  timestamp: number;
  isSystem?: boolean;
  payload?: string;
}
