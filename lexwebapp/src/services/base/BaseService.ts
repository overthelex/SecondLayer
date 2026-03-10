/**
 * Base Service
 * Abstract base class for all services with common error handling
 */

import { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import apiClient from '../../utils/api-client';

export interface ServiceError {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}

export abstract class BaseService {
  protected client: AxiosInstance;

  constructor(client?: AxiosInstance) {
    this.client = client || apiClient;
  }

  /**
   * Handle API errors uniformly across all services
   */
  protected handleError(error: unknown): never {
    if (error instanceof AxiosError) {
      const serviceError: ServiceError = {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.response?.data?.message || error.message,
        status: error.response?.status,
        details: error.response?.data,
      };

      throw serviceError;
    }

    if (error instanceof Error) {
      throw {
        code: 'INTERNAL_ERROR',
        message: error.message,
      } as ServiceError;
    }

    throw {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
    } as ServiceError;
  }

  /**
   * Execute an API request with uniform error handling.
   * Eliminates repetitive try/catch + handleError boilerplate.
   *
   * @param fn - Function that performs the axios call
   * @param transform - Optional transform applied to response.data before returning
   */
  protected async request<T, R = T>(
    fn: () => Promise<AxiosResponse<T>>,
    transform?: (data: T) => R
  ): Promise<R> {
    try {
      const response = await fn();
      return transform ? transform(response.data) : (response.data as unknown as R);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Execute an API request that returns void (e.g. DELETE, PUT with no response body).
   */
  protected async requestVoid(fn: () => Promise<AxiosResponse<unknown>>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Parse JSON safely
   */
  protected safeJsonParse<T>(json: string, fallback: T): T {
    try {
      return JSON.parse(json);
    } catch {
      return fallback;
    }
  }
}
