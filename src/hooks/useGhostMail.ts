/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import {
  fetchInbox,
  fetchConfig,
  createPaymentSession,
  createExtensionSession,
  burnInbox as apiBurnInbox,
  deleteEmail as apiDeleteEmail,
  checkPaymentStatus,
  setupPgp as apiSetupPgp,
  formatTimeLeft,
  type InboxResponse,
  type PaymentInitResponse,
  type TierType,
  type DurationConfig,
  type ConfigResponse
} from '../services/mail';
import { TIER_UI_CONFIG } from '../components/ghostMail/constants';

const STORAGE_KEY = 'ghost_mail_session';

// Export types
export type { InboxResponse, PaymentInitResponse, TierType, DurationConfig, ConfigResponse };

export interface GhostMailSession {
  email: string;
  token: string;
}

export type PaymentState =
  | { status: 'IDLE' }
  | { status: 'CREATING' }
  | { status: 'WAITING_PAYMENT'; data: PaymentInitResponse }
  | { status: 'COMPLETED' };

export interface DomainConfig {
  domain: string;
  tier: TierType;
}

export function useGhostMail() {
  // --- Core State ---
  const [session, setSession] = useState<GhostMailSession | null>(null);
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState("00:00:00");

  // --- Config State (from API) ---
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // --- User Selection State ---
  const [selectedTier, setSelectedTier] = useState<TierType>('BASIC');
  const [selectedDuration, setSelectedDuration] = useState<DurationConfig>({ label: '...', value: 0, addonPrice: 0 });

  // --- Payment State ---
  const [paymentState, setPaymentState] = useState<PaymentState>({ status: 'IDLE' });
  const paymentPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousEmailCount = useRef<number>(0);

  // 1. Initialize: load config & restore session & handle URL auto-login
  useEffect(() => {
    // 0. Check URL params (Auto-Login via Bot Link)
    const params = new URLSearchParams(window.location.search);
    const urlEmail = params.get('email');
    const urlToken = params.get('token');

    if (urlEmail && urlToken) {
      const newSession = { email: urlEmail, token: urlToken };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      setSession(newSession);

      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      toast.success("SESSION RESTORED");
    } else {
       // 1. Restore local session
       const saved = localStorage.getItem(STORAGE_KEY);
       if (saved) {
         try {
           setSession(JSON.parse(saved));
         } catch (e) {
           localStorage.removeItem(STORAGE_KEY);
         }
       }
    }

    // 2. Request notification permission - Safety Check for Mobile/WebViews
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
       Notification.requestPermission();
    }

    // 3. Load config
    const loadConfig = async () => {
      try {
        const data = await fetchConfig();
        setConfig(data);
        // Set default duration
        if (data.durations && data.durations.length > 0) {
          setSelectedDuration(data.durations[0]);
        }
      } catch (e) {
        console.error("Failed to load config", e);
        toast.error("CONFIG_SYNC_FAILED");
      } finally {
        setConfigLoading(false);
      }
    };
    loadConfig();
  }, []);

  // --- Derived State ---

  // Merge API data with local UI config
  const tiers = useMemo(() => {
    if (!config) return {};
    const result: any = {};
    (Object.keys(config.tiers) as TierType[]).forEach(key => {
      result[key] = {
        ...config.tiers[key], // label, priceUSD, desc
        ...TIER_UI_CONFIG[key], // icon, cssColor, borderColor
        price: config.tiers[key].priceUSD // backward compat field
      };
    });
    return result;
  }, [config]);

  // Generate domain options list
  const domainOptions = useMemo(() => {
    if (!config) return [];
    const options: DomainConfig[] = [];
    (Object.keys(config.tiers) as TierType[]).forEach(tier => {
      config.tiers[tier].domains.forEach(domain => {
        options.push({ domain, tier });
      });
    });
    return options;
  }, [config]);

  const durations = config?.durations || [];

  // Calculate final price
  const getFinalPrice = useCallback(() => {
    if (!config) return 0;
    const basePrice = config.tiers[selectedTier].priceUSD;
    const addonPrice = selectedDuration.addonPrice || 0;
    return basePrice + addonPrice;
  }, [config, selectedTier, selectedDuration]);


  // 2. Core: inbox polling & countdown
  useEffect(() => {
    if (!session) {
      setInbox(null);
      setTimeLeft("00:00:00");
      return;
    }

    let isMounted = true;

    const loadData = async (silent = false) => {
      if (!silent) setLoading(true);

      // --- DEV MODE BYPASS ---
      if (session.token.startsWith('dev-token-')) {
        setInbox({
          address: session.email,
          tier: 'BASIC',
          emails: [], // Mock empty inbox
          expiresAt: Date.now() + 3600000, // Valid for 1 hour
          serverTime: Date.now()
        });
        setLoading(false);
        return;
      }
      // -----------------------

      try {
        const data = await fetchInbox(session.email, session.token);
        if (isMounted) {
          // Detect new emails
          if (data.emails.length > previousEmailCount.current) {
            if (silent && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
               new Notification('GHOST MAIL // NEW PACKET', {
                 body: `Received ${data.emails.length - previousEmailCount.current} new message(s)`,
                 icon: '/favicon.svg'
               });
            }
          }
          previousEmailCount.current = data.emails.length;

          setInbox(data);
          setError(null);
        }
      } catch (err: any) {
        if (err.message === 'INBOX_EXPIRED') {
          setError('SESSION_TERMINATED: TTL EXPIRED');
          logout();
        } else if (err.message === 'INVALID_TOKEN') {
          setError('ACCESS_DENIED: INVALID TOKEN');
          logout();
        } else {
          console.error("Inbox poll failed", err);
        }
      } finally {
        if (!silent && isMounted) setLoading(false);
      }
    };

    loadData();
    const pollInterval = setInterval(() => loadData(true), 5000);
    const timerInterval = setInterval(() => {
      if (inbox?.expiresAt) {
        setTimeLeft(formatTimeLeft(inbox.expiresAt, Date.now()));
      }
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      clearInterval(timerInterval);
    };
  }, [session, inbox?.expiresAt]);

  // 3. Action: start purchase
  const startPurchase = useCallback(async (tier: TierType, customEmail?: string, method: 'XMR' | 'LN' = 'XMR') => {
    setPaymentState({ status: 'CREATING' });
    try {
      const data = await createPaymentSession(tier, selectedDuration, customEmail, method);
      setPaymentState({ status: 'WAITING_PAYMENT', data });
      startPaymentPolling(data.paymentId);
    } catch (e: any) {
      toast.error(e.message || "UPLINK FAILED");
      setPaymentState({ status: 'IDLE' });
    }
  }, [selectedDuration]);

  // 3.5 Action: start extension
  const startExtension = useCallback(async (duration: DurationConfig, method: 'XMR' | 'LN' = 'XMR') => {
    if (!session) return;
    setPaymentState({ status: 'CREATING' });
    try {
      const data = await createExtensionSession(session.email, session.token, duration, method);
      setPaymentState({ status: 'WAITING_PAYMENT', data });
      startPaymentPolling(data.paymentId);
    } catch (e: any) {
      toast.error(e.message || "EXTENSION FAILED");
      setPaymentState({ status: 'IDLE' });
    }
  }, [session]);

  // Internal: payment polling logic
  const startPaymentPolling = (paymentId: string) => {
    if (paymentPollRef.current) clearInterval(paymentPollRef.current);
    paymentPollRef.current = setInterval(async () => {
      try {
        const res = await checkPaymentStatus(paymentId);
        if (res.status === 'COMPLETED' && res.account) {
          clearInterval(paymentPollRef.current!);
          paymentPollRef.current = null;
          setPaymentState({ status: 'COMPLETED' });

          if ((res.account as any).extended) {
             toast.success("EXTENSION SUCCESSFUL");
             setTimeout(() => setPaymentState({ status: 'IDLE' }), 2000);
          } else {
             toast.success("UPLINK ESTABLISHED");
             const newSession = { email: res.account.email, token: res.account.token };
             login(newSession);
          }
        }
      } catch (e) { /* empty */ }
    }, 3000);
  };

  const cancelPayment = useCallback(() => {
    if (paymentPollRef.current) {
      clearInterval(paymentPollRef.current);
      paymentPollRef.current = null;
    }
    setPaymentState({ status: 'IDLE' });
  }, []);

  const login = useCallback((newSession: GhostMailSession) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
    setSession(newSession);
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setTimeout(() => {
      setPaymentState({ status: 'IDLE' });
    }, 1500);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setInbox(null);
    cancelPayment();
    toast("SESSION PURGED", { icon: '🗑️' });
  }, [cancelPayment]);

  const burnSession = useCallback(async () => {
    if (!session) return;
    const ok = await apiBurnInbox(session.email, session.token);
    if (ok) {
      toast.success("INBOX PERMANENTLY DESTROYED");
    } else {
      toast.error("REMOTE PURGE FAILED - CLEARING LOCAL ONLY");
    }
    logout();
  }, [session, logout]);

  const removeEmail = useCallback(async (emailId: string) => {
    if (!session) return;
    const ok = await apiDeleteEmail(session.email, session.token, emailId);
    if (ok) {
      setInbox(prev => {
        if (!prev) return null;
        return {
          ...prev,
          emails: prev.emails.filter(e => e.id !== emailId)
        };
      });
      toast.success("MESSAGE DELETED");
    } else {
      toast.error("DELETE FAILED");
    }
  }, [session]);

  // XMR402: Verify proof from Ripley Terminal return and create session
  const verifyXmr402Proof = useCallback(async (
    txid: string,
    proof: string,
    customEmail: string,
    tier: TierType,
    duration?: { label: string; value: number; addonPrice: number }
  ): Promise<boolean> => {
    try {
      const apiBase = import.meta.env.VITE_MAIL_API_URL || 'https://mail-api.kyc.rip';
      const res = await fetch(`${apiBase}/api/payment/xmr402`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `XMR402 txid="${txid}", proof="${proof}"`,
        },
        body: JSON.stringify({ customEmail, tier, duration }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'VERIFICATION_FAILED' })) as { error?: string };
        toast.error(errData.error || 'XMR402 verification failed');
        return false;
      }

      const data = await res.json() as {
        status: string;
        account?: { email: string; token: string; expiresAt: number; tier: TierType };
      };

      if (data.status === 'COMPLETED' && data.account) {
        setPaymentState({ status: 'COMPLETED' });
        toast.success('UPLINK ESTABLISHED VIA XMR402');
        const newSession = { email: data.account.email, token: data.account.token };
        login(newSession);
        return true;
      }

      toast.error('Unexpected response from XMR402 verification');
      return false;
    } catch (e: any) {
      console.error('[XMR402 Verify]', e);
      toast.error(e.message || 'XMR402 verification failed');
      return false;
    }
  }, [login, setPaymentState]);

  const enablePgp = useCallback(async (publicKey: string, enabled: boolean): Promise<boolean> => {
    if (!session) return false;
    try {
      const ok = await apiSetupPgp(session.email, session.token, publicKey, enabled);
      if (ok) {
        setInbox(prev => prev ? ({ ...prev, publicKey, pgpEnabled: enabled }) : null);
        toast.success(enabled ? "PGP ENCRYPTION ENABLED" : "PGP DISABLED");
        return true;
      }
    } catch (e: any) {
      toast.error(e.message || "PGP SETUP FAILED");
    }
    return false;
  }, [session]);

  return {
    // Data
    session,
    inbox,
    loading,
    error,
    timeLeft,
    paymentState,
    selectedTier,
    selectedDuration,

    // Config Data (Dynamic)
    tiers,
    durations,
    domainOptions,
    configLoading,

    // Actions
    startPurchase,
    startExtension,
    cancelPayment,
    logout,
    burnSession,
    removeEmail,
    enablePgp,
    verifyXmr402Proof,
    login,
    setSelectedTier,
    setSelectedDuration,
    getFinalPrice
  };
}
