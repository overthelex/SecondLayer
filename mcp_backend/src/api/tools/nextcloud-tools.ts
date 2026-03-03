/**
 * Nextcloud Tools — MCP tool handler for Nextcloud file upload & sharing
 *
 * 2 tools:
 * - nextcloud_upload   — завантаження файлу в Nextcloud через WebDAV
 * - nextcloud_share    — створення посилання для спільного доступу через OCS API
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { NextcloudService } from '../../services/nextcloud-service.js';
import { logger } from '../../utils/logger.js';
import fs from 'fs';

export class NextcloudTools extends BaseToolHandler {
  constructor(private nextcloudService: NextcloudService) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'nextcloud_upload',
        description: `Завантаження файлу в хмарне сховище Nextcloud

Завантажує файл у Nextcloud через WebDAV. Підтримує завантаження з base64-кодованого вмісту або з локального файлу.`,
        inputSchema: {
          type: 'object',
          properties: {
            remote_path: {
              type: 'string',
              description: 'Шлях у Nextcloud (напр. "Documents/contracts/file.pdf")',
            },
            content_base64: {
              type: 'string',
              description: 'Вміст файлу в base64 (альтернатива local_file_path)',
            },
            local_file_path: {
              type: 'string',
              description: 'Локальний шлях до файлу (альтернатива content_base64)',
            },
            content_type: {
              type: 'string',
              default: 'application/octet-stream',
              description: 'MIME тип файлу (напр. "application/pdf", "text/plain")',
            },
          },
          required: ['remote_path'],
        },
      },
      {
        name: 'nextcloud_share',
        description: `Створення посилання для спільного доступу до файлу в Nextcloud

Створює публічне посилання або надає доступ конкретному користувачу через OCS Share API.`,
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Шлях до файлу або папки у Nextcloud',
            },
            share_type: {
              type: 'string',
              enum: ['public_link', 'user'],
              default: 'public_link',
              description: 'Тип спільного доступу: public_link (публічне посилання) або user (конкретний користувач)',
            },
            share_with: {
              type: 'string',
              description: 'Ім\'я користувача для share_type=user',
            },
            password: {
              type: 'string',
              description: 'Пароль для захисту посилання (необов\'язково)',
            },
            expire_date: {
              type: 'string',
              description: 'Дата закінчення дії (YYYY-MM-DD)',
            },
            permissions: {
              type: 'number',
              default: 1,
              description: 'Права доступу: 1=читання, 2=оновлення, 4=створення, 8=видалення, 16=поширення, 31=усі',
            },
          },
          required: ['path'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    switch (name) {
      case 'nextcloud_upload':
        return this.handleUpload(args);
      case 'nextcloud_share':
        return this.handleShare(args);
      default:
        return null;
    }
  }

  private async handleUpload(args: any): Promise<ToolResult> {
    const remotePath = String(args.remote_path || '').trim();
    if (!remotePath) {
      return this.wrapError('remote_path є обов\'язковим параметром');
    }

    const contentType = args.content_type || 'application/octet-stream';

    try {
      let result;

      if (args.content_base64) {
        const buffer = Buffer.from(args.content_base64, 'base64');
        result = await this.nextcloudService.upload(remotePath, buffer, contentType);
      } else if (args.local_file_path) {
        if (!fs.existsSync(args.local_file_path)) {
          return this.wrapError(`Файл не знайдено: ${args.local_file_path}`);
        }
        result = await this.nextcloudService.uploadFromFile(remotePath, args.local_file_path, contentType);
      } else {
        return this.wrapError('Необхідно вказати content_base64 або local_file_path');
      }

      return this.wrapResponse({
        success: true,
        message: `Файл завантажено в Nextcloud: ${remotePath}`,
        path: result.path,
        size: result.size,
        content_type: result.contentType,
      });
    } catch (error: any) {
      logger.error('[NextcloudTools] Upload failed', { remotePath, error: error.message });
      return this.wrapError(`Помилка завантаження: ${error.message}`);
    }
  }

  private async handleShare(args: any): Promise<ToolResult> {
    const path = String(args.path || '').trim();
    if (!path) {
      return this.wrapError('path є обов\'язковим параметром');
    }

    const shareTypeStr = args.share_type || 'public_link';
    const shareType = shareTypeStr === 'user' ? 0 : 3;

    if (shareType === 0 && !args.share_with) {
      return this.wrapError('share_with є обов\'язковим для share_type=user');
    }

    try {
      const result = await this.nextcloudService.createShare({
        path,
        shareType,
        shareWith: args.share_with,
        password: args.password,
        expireDate: args.expire_date,
        permissions: args.permissions ?? 1,
      });

      return this.wrapResponse({
        success: true,
        message: shareType === 3
          ? `Створено публічне посилання для: ${path}`
          : `Надано доступ користувачу ${args.share_with} до: ${path}`,
        share_id: result.id,
        url: result.url,
        token: result.token,
        path: result.path,
        share_type: shareTypeStr,
        permissions: result.permissions,
        expiration: result.expiration,
      });
    } catch (error: any) {
      logger.error('[NextcloudTools] Share failed', { path, error: error.message });
      return this.wrapError(`Помилка створення спільного доступу: ${error.message}`);
    }
  }
}
