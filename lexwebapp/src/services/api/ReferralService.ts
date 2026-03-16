/**
 * Referral Service
 * API client for referral system
 */

import { BaseService } from '../base/BaseService';

export interface ReferralStats {
  totalReferrals: number;
  totalEarnedUsd: number;
  totalEarnedUah: number;
  referralCode: string;
}

export interface ReferralEntry {
  referredId: string;
  referredName: string | null;
  referredEmail: string;
  registeredAt: string;
  hasToppedUp: boolean;
  rewardAmountUsd: number;
  rewardAmountUah: number;
  totalPaidUsd: number;
}

export type ReferrerType = 'fop' | 'tov' | 'attorney';

export interface ReferrerStatus {
  isVerified: boolean;
  referrerType: ReferrerType | null;
  businessCode: string | null;
  verifiedAt: string | null;
}

export class ReferralService extends BaseService {
  async getCode(): Promise<string> {
    return this.request(
      () => this.client.get<{ code: string }>('/api/referral/code'),
      (data) => data.code
    );
  }

  async getStats(): Promise<ReferralStats> {
    return this.request(() => this.client.get<ReferralStats>('/api/referral/stats'));
  }

  async getReferrals(): Promise<ReferralEntry[]> {
    return this.request(
      () => this.client.get<{ referrals: ReferralEntry[] }>('/api/referral/list'),
      (data) => data.referrals
    );
  }

  async resolveCode(code: string): Promise<boolean> {
    return this.request(
      () => this.client.get<{ valid: boolean }>(`/api/referral/resolve/${code}`),
      (data) => data.valid
    );
  }

  async getVerificationStatus(): Promise<ReferrerStatus> {
    return this.request(
      () => this.client.get<ReferrerStatus>('/api/referral/verification')
    );
  }

  async submitVerification(referrerType: ReferrerType, businessCode: string): Promise<void> {
    return this.request(
      () => this.client.post('/api/referral/verification', { referrerType, businessCode })
    );
  }
}
