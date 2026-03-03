/**
 * Nextcloud Service — WebDAV upload + OCS Share API wrapper
 *
 * Reads config from env vars: NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASSWORD
 */

import { logger } from '../utils/logger.js';

export interface NextcloudUploadResult {
  path: string;
  size: number;
  contentType: string;
  url: string;
}

export interface NextcloudShareResult {
  id: number;
  url: string;
  token: string;
  path: string;
  shareType: number;
  permissions: number;
  expiration: string | null;
}

export class NextcloudService {
  private baseUrl: string;
  private user: string;
  private password: string;

  constructor() {
    this.baseUrl = (process.env.NEXTCLOUD_URL || 'http://localhost:8888').replace(/\/$/, '');
    this.user = process.env.NEXTCLOUD_USER || 'admin';
    this.password = process.env.NEXTCLOUD_PASSWORD || 'admin';

    logger.info('[Nextcloud] Service initialized', {
      baseUrl: this.baseUrl,
      user: this.user,
    });
  }

  private get authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.user}:${this.password}`).toString('base64');
  }

  private get davBaseUrl(): string {
    return `${this.baseUrl}/remote.php/dav/files/${this.user}`;
  }

  /**
   * Health check — GET /status.php
   */
  async healthCheck(): Promise<{ installed: boolean; version: string }> {
    const res = await fetch(`${this.baseUrl}/status.php`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Nextcloud health check failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<{ installed: boolean; version: string }>;
  }

  /**
   * Create directory via WebDAV MKCOL (recursive)
   */
  async mkdirp(remotePath: string): Promise<void> {
    const parts = remotePath.replace(/^\/+/, '').split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      const url = `${this.davBaseUrl}${current}`;
      const res = await fetch(url, {
        method: 'MKCOL',
        headers: { Authorization: this.authHeader },
      });
      // 201 = created, 405 = already exists — both OK
      if (!res.ok && res.status !== 405) {
        const body = await res.text();
        throw new Error(`MKCOL ${current} failed: ${res.status} ${body}`);
      }
    }
  }

  /**
   * Upload file content via WebDAV PUT
   */
  async upload(remotePath: string, content: Buffer, contentType: string): Promise<NextcloudUploadResult> {
    // Ensure parent directory exists
    const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
    if (dir) {
      await this.mkdirp(dir);
    }

    const url = `${this.davBaseUrl}/${remotePath.replace(/^\/+/, '')}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': contentType || 'application/octet-stream',
      },
      body: content,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WebDAV PUT failed: ${res.status} ${body}`);
    }

    logger.info('[Nextcloud] File uploaded', { path: remotePath, size: content.length });

    return {
      path: remotePath,
      size: content.length,
      contentType,
      url: `${this.baseUrl}/remote.php/dav/files/${this.user}/${remotePath.replace(/^\/+/, '')}`,
    };
  }

  /**
   * Upload from local file path
   */
  async uploadFromFile(remotePath: string, localFilePath: string, contentType: string): Promise<NextcloudUploadResult> {
    const fs = await import('fs');
    const content = fs.readFileSync(localFilePath);
    return this.upload(remotePath, content, contentType);
  }

  /**
   * Create share link or user share via OCS API
   *
   * shareType: 0 = user, 3 = public_link
   * permissions: 1 = read, 2 = update, 4 = create, 8 = delete, 16 = share, 31 = all
   */
  async createShare(options: {
    path: string;
    shareType: number;
    shareWith?: string;
    password?: string;
    expireDate?: string;
    permissions?: number;
  }): Promise<NextcloudShareResult> {
    const url = `${this.baseUrl}/ocs/v2.php/apps/files_sharing/api/v1/shares`;

    const body = new URLSearchParams();
    body.append('path', options.path);
    body.append('shareType', String(options.shareType));
    if (options.shareWith) body.append('shareWith', options.shareWith);
    if (options.password) body.append('password', options.password);
    if (options.expireDate) body.append('expireDate', options.expireDate);
    if (options.permissions !== undefined) body.append('permissions', String(options.permissions));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OCS share creation failed: ${res.status} ${text}`);
    }

    const json = await res.json() as any;
    const data = json.ocs?.data;
    if (!data) {
      throw new Error('Unexpected OCS response: missing ocs.data');
    }

    logger.info('[Nextcloud] Share created', { path: options.path, shareType: options.shareType, id: data.id });

    return {
      id: data.id,
      url: data.url,
      token: data.token,
      path: data.path,
      shareType: data.share_type,
      permissions: data.permissions,
      expiration: data.expiration || null,
    };
  }
}
