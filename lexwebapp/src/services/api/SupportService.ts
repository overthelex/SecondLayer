/**
 * Support Service
 * Submits feedback and questions from the in-app SupportWidget (FAB).
 */

import { BaseService } from '../base/BaseService';

export type SupportContactType = 'feedback' | 'question';

export class SupportService extends BaseService {
  async sendContact(type: SupportContactType, message: string): Promise<void> {
    return this.request(() =>
      this.client.post('/api/support/contact', {
        type,
        message,
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      })
    );
  }
}

export const supportService = new SupportService();
