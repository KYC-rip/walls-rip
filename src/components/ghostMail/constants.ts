import { Shield, ShieldCheck, Lock } from 'lucide-react';
import type { TierType } from '../../hooks/useGhostMail';

export const TIER_UI_CONFIG: Record<TierType, { icon: any, cssColor: string, borderColor: string }> = {
  BASIC: { icon: Shield, cssColor: 'text-wr-dim', borderColor: 'border-wr-dim' },
  PREMIUM: { icon: ShieldCheck, cssColor: 'text-wr-green', borderColor: 'border-wr-green' },
  PRIVATE: { icon: Lock, cssColor: 'text-wr-info', borderColor: 'border-wr-info' }
};
