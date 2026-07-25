/**
 * Time Entry Service
 * Handles time tracking and timer operations via /api/time
 */

import { BaseService } from '../base/BaseService';
import {
  TimeEntry,
  ActiveTimer,
  UserBillingRate,
  CreateTimeEntryParams,
  UpdateTimeEntryParams,
  TimeEntryFilters,
} from '../../types/models';

export interface TimeEntriesListResponse {
  entries: TimeEntry[];
  total: number;
}

export interface ActiveTimersResponse {
  timers: ActiveTimer[];
}

export interface StopTimerResponse {
  timer: ActiveTimer;
  timeEntry?: TimeEntry;
}

export interface UserRateResponse {
  hourly_rate_usd: number;
}

export interface UserRatesHistoryResponse {
  rates: UserBillingRate[];
}

export class TimeEntryService extends BaseService {
  /**
   * List time entries with optional filters
   */
  async getTimeEntries(filters?: TimeEntryFilters): Promise<TimeEntriesListResponse> {
    return this.request(() => this.client.get<TimeEntriesListResponse>('/api/time/entries', {
      params: filters,
    }));
  }

  /**
   * Create new time entry
   */
  async createTimeEntry(data: CreateTimeEntryParams): Promise<TimeEntry> {
    return this.request(() => this.client.post<TimeEntry>('/api/time/entries', data));
  }

  /**
   * Update time entry
   */
  async updateTimeEntry(id: string, data: UpdateTimeEntryParams): Promise<TimeEntry> {
    return this.request(() => this.client.put<TimeEntry>(`/api/time/entries/${id}`, data));
  }

  /**
   * Delete time entry
   */
  async deleteTimeEntry(id: string): Promise<void> {
    return this.requestVoid(() => this.client.delete(`/api/time/entries/${id}`));
  }

  /**
   * Submit time entry for approval
   */
  async submitTimeEntry(id: string): Promise<TimeEntry> {
    return this.request(() => this.client.post<TimeEntry>(`/api/time/entries/${id}/submit`));
  }

  /**
   * Approve time entry
   */
  async approveTimeEntry(id: string): Promise<TimeEntry> {
    return this.request(() => this.client.post<TimeEntry>(`/api/time/entries/${id}/approve`));
  }

  /**
   * Reject time entry
   */
  async rejectTimeEntry(id: string, notes?: string): Promise<TimeEntry> {
    return this.request(() => this.client.post<TimeEntry>(`/api/time/entries/${id}/reject`, { notes }));
  }

  // ============================================================================
  // Timer Methods
  // ============================================================================

  /**
   * Start timer for a matter
   */
  async startTimer(matter_id: string, description?: string): Promise<ActiveTimer> {
    return this.request(() => this.client.post<ActiveTimer>('/api/time/timers/start', {
      matter_id,
      description,
    }));
  }

  /**
   * Stop timer and optionally create time entry
   */
  async stopTimer(matter_id: string, create_entry: boolean = true): Promise<StopTimerResponse> {
    return this.request(() => this.client.post<StopTimerResponse>('/api/time/timers/stop', {
      matter_id,
      create_entry,
    }));
  }

  /**
   * Get active timers for current user
   */
  async getActiveTimers(): Promise<ActiveTimer[]> {
    return this.request(
      () => this.client.get<ActiveTimersResponse>('/api/time/timers/active'),
      (data) => data.timers
    );
  }

  /**
   * Ping timer to keep it alive
   */
  async pingTimer(matter_id: string): Promise<void> {
    return this.requestVoid(() => this.client.post('/api/time/timers/ping', { matter_id }));
  }

  // ============================================================================
  // Billing Rate Methods
  // ============================================================================

  /**
   * Get user's current billing rate
   */
  async getUserRate(userId: string, date?: string): Promise<number> {
    return this.request(
      () => this.client.get<UserRateResponse>(`/api/time/rates/${userId}`, { params: { date } }),
      (data) => data.hourly_rate_usd
    );
  }

  /**
   * Set user billing rate
   */
  async setUserRate(
    user_id: string,
    hourly_rate_usd: number,
    effective_from?: string,
    effective_to?: string,
    is_default?: boolean
  ): Promise<UserBillingRate> {
    return this.request(() => this.client.post<UserBillingRate>('/api/time/rates', {
      user_id,
      hourly_rate_usd,
      effective_from,
      effective_to,
      is_default,
    }));
  }

  /**
   * Get user's billing rate history
   */
  async getUserRateHistory(userId: string): Promise<UserBillingRate[]> {
    return this.request(
      () => this.client.get<UserRatesHistoryResponse>(`/api/time/rates/${userId}/history`),
      (data) => data.rates
    );
  }
}

// Export singleton instance
export const timeEntryService = new TimeEntryService();
