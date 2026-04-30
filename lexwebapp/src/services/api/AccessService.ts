/**
 * Access Service
 *
 * Reads the beta-restriction status for the current user.
 */

import { BaseService } from '../base/BaseService';
import type { AccessReason } from '../../stores/accessGateStore';

export interface AccessStatus {
  allowed: boolean;
  reason: AccessReason;
  is_beta_tester: boolean;
  is_administrator: boolean;
  has_monobank_topup: boolean;
}

export class AccessService extends BaseService {
  async getStatus(): Promise<AccessStatus> {
    return this.request(() => this.client.get<AccessStatus>('/api/access/status'));
  }
}

const accessService = new AccessService();
export default accessService;
