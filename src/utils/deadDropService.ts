import { apiClient, APIError } from '../services/client';

async function generateKey() {
  return window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function exportKey(key: CryptoKey) {
  const exported = await window.crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(exported);
}

async function importKey(jwkStr: string) {
  const jwk = JSON.parse(jwkStr);
  return window.crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

async function encryptData(msg: string, key: CryptoKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(msg);
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptData(encryptedBase64: string, key: CryptoKey) {
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

export const createDeadDrop = async (secretMessage: string, ttlSeconds: number = 0): Promise<string> => {
  const key = await generateKey();
  const keyStr = await exportKey(key);
  const encrypted = await encryptData(secretMessage, key);

  const data = await apiClient<{ id: string }>('/v1/tools/drop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encryptedData: encrypted, ttl: ttlSeconds }),
  });

  return `${window.location.origin}/drop?id=${data.id}#${btoa(keyStr)}`;
};

export const readDeadDrop = async (id: string, keyBase64: string): Promise<string> => {
  if (!keyBase64) throw new Error('Missing decryption key');
  const keyStr = atob(keyBase64);
  const key = await importKey(keyStr);

  try {
    const data = await apiClient<{ encryptedData: string }>(`/v1/tools/drop/${id}`);
    return await decryptData(data.encryptedData, key);
  } catch (e: unknown) {
    if (e instanceof APIError && e.status === 404) throw new Error('BURNED');
    throw e;
  }
};
