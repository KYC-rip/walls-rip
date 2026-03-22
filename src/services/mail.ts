/* eslint-disable @typescript-eslint/no-explicit-any */
// src/services/mail.ts

import { mailApiClient } from "./client";

// --- Type Definitions ---

export type TierType = 'BASIC' | 'PREMIUM' | 'PRIVATE';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'ERROR';

export interface DurationConfig {
  label: string;
  value: number; // seconds
  addonPrice: number; // addon amount (USD)
}

export interface StoredEmail {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  text: string;     // Plain text content
  html?: string;    // HTML content, if available
  receivedAt: string;
  isEncrypted?: boolean;
}

// Inbox response (GET /api/inbox)
export interface InboxResponse {
  address: string;
  tier: TierType;
  emails: StoredEmail[];
  expiresAt: number; // timestamp (ms)
  serverTime: number; // server current timestamp (for countdown calibration)
  publicKey?: string;
  pgpEnabled?: boolean;
}

/**
 * Setup PGP configuration
 */
export async function setupPgp(email: string, token: string, publicKey: string, enabled: boolean): Promise<boolean> {
  const res = await mailApiClient<any>('/api/inbox/setup-pgp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token, publicKey, enabled })
  });
  return res.success;
}

// Payment creation response (POST /api/payment/create)
export interface PaymentInitResponse {
  method: 'XMR' | 'LN';
  address: string;    // XMR integrated address or LN Bolt11 Invoice
  paymentId: string;  // ID for polling
  amount: number;     // amount to pay (XMR or Sats)
  tier: TierType;
}

// Payment status response (GET /api/payment/check)
export interface PaymentCheckResponse {
  status: PaymentStatus;
  account?: {
    email: string;
    token: string;
    tier: TierType;
    expiresAt: number;
  };
}

// Global config response (GET /api/config)
export interface ConfigResponse {
  tiers: Record<TierType, {
    label: string;
    priceUSD: number;
    baseSeconds: number;
    desc: string;
    domains: string[];
  }>;
  durations: DurationConfig[];
}

// --- API Methods ---

/**
 * Fetch global configuration (tiers, prices, domains)
 */
export async function fetchConfig(): Promise<ConfigResponse> {
  return await mailApiClient('/api/config');
}

/**
 * Create a payment session
 */
export async function createPaymentSession(tier: TierType, duration: DurationConfig, customEmail?: string, method: 'XMR' | 'LN' = 'XMR'): Promise<PaymentInitResponse> {
  try {
    return await mailApiClient('/api/payment/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, duration, customEmail, method })
    });
  } catch (error: any) {
    throw new Error(error.error || 'FAILED_TO_INIT_PAYMENT');
  }
}

/**
 * Create an extension (renewal) session
 */
export async function createExtensionSession(email: string, token: string, duration: DurationConfig, method: 'XMR' | 'LN' = 'XMR'): Promise<PaymentInitResponse> {
  try {
    return await mailApiClient('/api/payment/extend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, duration, method })
    });
  } catch (error: any) {
    throw new Error(error.error || 'FAILED_TO_INIT_EXTENSION');
  }
}

/**
 * Check payment status (for polling)
 */
export async function checkPaymentStatus(paymentId: string): Promise<PaymentCheckResponse> {
  return await mailApiClient(`/api/payment/check?paymentId=${paymentId}`);
}

/**
 * Fetch inbox contents (core feature)
 */
export async function fetchInbox(email: string, token: string): Promise<InboxResponse> {
  const ts = Date.now();
  const res = await mailApiClient<InboxResponse>(`/api/inbox?email=${email}&token=${token}&_t=${ts}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  return res;
}

/**
 * Permanently destroy inbox
 */
export async function burnInbox(email: string, token: string): Promise<boolean> {
  const res = await mailApiClient<boolean>('/api/inbox/burn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token })
  });
  return res;
}

/**
 * Delete a single email
 */
export async function deleteEmail(email: string, token: string, emailId: string): Promise<boolean> {
  const res = await mailApiClient<boolean>('/api/email/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token, emailId })
  });
  return res;
}

// --- Utils ---

/**
 * Format countdown timer (HH:MM:SS)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function formatTimeLeft(expiresAt: number, _serverTime: number = Date.now()): string {
  const now = Date.now();
  const diff = expiresAt - now;

  if (diff <= 0) return "00:00:00";

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
