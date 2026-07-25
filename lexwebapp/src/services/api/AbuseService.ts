/**
 * Abuse Report Service
 * Submits abuse/violation reports via the public endpoint.
 */

import { BaseService } from '../base/BaseService';

export type AbuseType = 'forbidden_content' | 'copyright' | 'illegal_use' | 'other';

export interface AbuseReportPayload {
  type: AbuseType;
  email: string;
  description: string;
  contentUrl?: string;
}

export interface AbuseReportResponse {
  success: boolean;
  message: string;
}

export class AbuseService extends BaseService {
  async submitReport(payload: AbuseReportPayload): Promise<AbuseReportResponse> {
    return this.request(() =>
      this.client.post<AbuseReportResponse>('/api/abuse-report', payload)
    );
  }
}

export const abuseService = new AbuseService();
