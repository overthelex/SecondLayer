/**
 * Auth Service
 * Handles authentication and user profile operations
 */

import { BaseService } from '../base/BaseService';
import { User } from '../../types/models';
import {
  UpdateProfileRequest,
  GetMeResponse,
  RefreshTokenResponse,
} from '../../types/api';

export class AuthService extends BaseService {
  /**
   * Get current user profile
   */
  async getMe(): Promise<User> {
    return this.request(
      () => this.client.get<GetMeResponse>('/auth/me'),
      (data) => data.user
    );
  }

  /**
   * Update user profile
   */
  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    return this.request(
      () => this.client.put<{ user: User }>('/auth/profile', data),
      (data) => data.user
    );
  }

  /**
   * Upload avatar image file
   */
  async uploadAvatar(file: File): Promise<User> {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.request(
      () => this.client.post<{ user: User }>('/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
      (data) => data.user
    );
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<string> {
    return this.request(
      () => this.client.post<RefreshTokenResponse>('/auth/refresh'),
      (data) => data.token
    );
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } catch (error) {
      // Log error but don't throw - logout should always succeed client-side
      console.error('Logout API call failed:', error);
    }
  }

  /**
   * Verify token validity
   */
  async verifyToken(): Promise<boolean> {
    try {
      await this.getMe();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Register new user with email and password
   */
  async register(email: string, password: string, name?: string): Promise<any> {
    return this.request(() => this.client.post('/auth/register', { email, password, name }));
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<any> {
    return this.request(() => this.client.post('/auth/verify-email', { token }));
  }

  /**
   * Request password reset email
   */
  async forgotPassword(email: string): Promise<any> {
    return this.request(() => this.client.post('/auth/forgot-password', { email }));
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, password: string): Promise<any> {
    return this.request(() => this.client.post('/auth/reset-password', { token, password }));
  }

  // ========================================================================
  // WebAuthn (Passkeys)
  // ========================================================================

  /**
   * Generate WebAuthn registration options
   */
  async webauthnRegisterOptions(attachment?: 'cross-platform' | 'platform'): Promise<any> {
    return this.request(() => this.client.post('/auth/webauthn/register/options', { attachment }));
  }

  /**
   * Verify WebAuthn registration
   */
  async webauthnRegisterVerify(response: any, friendlyName?: string, attachment?: string): Promise<any> {
    return this.request(() => this.client.post('/auth/webauthn/register/verify', {
      response,
      friendlyName,
      attachment,
    }));
  }

  /**
   * Generate WebAuthn authentication options (login)
   */
  async webauthnAuthOptions(attachment?: 'cross-platform'): Promise<any> {
    return this.request(() => this.client.post('/auth/webauthn/auth/options', { attachment }));
  }

  /**
   * Verify WebAuthn authentication (login)
   */
  async webauthnAuthVerify(response: any, challenge: string): Promise<any> {
    return this.request(() => this.client.post('/auth/webauthn/auth/verify', { response, challenge }));
  }

  /**
   * List user's WebAuthn credentials
   */
  async webauthnListCredentials(): Promise<any> {
    return this.request(() => this.client.get('/auth/webauthn/credentials'));
  }

  /**
   * Delete a WebAuthn credential
   */
  async webauthnDeleteCredential(credentialId: string): Promise<any> {
    return this.request(() => this.client.delete(`/auth/webauthn/credentials/${credentialId}`));
  }
}

// Export singleton instance
export const authService = new AuthService();
