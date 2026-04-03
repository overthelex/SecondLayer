import { getConfig } from './config.js';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  cost_usd?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

class ApiClient {
  private getHeaders(): Record<string, string> {
    const { apiKey } = getConfig();
    if (!apiKey) {
      throw new Error(
        'API ключ не налаштовано. Виконайте: legal config set apiKey <ваш-ключ>'
      );
    }
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'legalua-cli/0.1.0',
    };
  }

  private getBaseUrl(): string {
    return getConfig().endpoint;
  }

  async callTool(toolName: string, args: Record<string, unknown> = {}): Promise<ApiResponse> {
    const url = `${this.getBaseUrl()}/api/tools/${toolName}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const text = await response.text();
      let errorMsg: string;
      try {
        const json = JSON.parse(text);
        errorMsg = json.error || json.message || text;
      } catch {
        errorMsg = text;
      }
      return { success: false, error: `${response.status}: ${errorMsg}` };
    }

    const data = await response.json() as Record<string, unknown>;
    return { success: true, data, cost_usd: data.cost_usd as number | undefined };
  }

  async listTools(): Promise<ApiResponse<ToolDefinition[]>> {
    const url = `${this.getBaseUrl()}/api/tools/`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      return { success: false, error: `${response.status}: ${await response.text()}` };
    }

    const data = await response.json() as ToolDefinition[];
    return { success: true, data };
  }

  async healthCheck(): Promise<ApiResponse<{ status: string }>> {
    const url = `${this.getBaseUrl()}/health`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'legalua-cli/0.1.0' },
      });
      const data = await response.json() as { status: string };
      return { success: response.ok, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async uploadFile(filePath: string, metadata?: Record<string, string>): Promise<ApiResponse> {
    const { apiKey } = getConfig();
    if (!apiKey) {
      throw new Error('API ключ не налаштовано.');
    }

    const stat = statSync(filePath);
    const fileName = basename(filePath);
    const fileStream = createReadStream(filePath);
    const fileBuffer = await streamToBuffer(fileStream);

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    const url = `${this.getBaseUrl()}/api/tools/store_document`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'legalua-cli/0.1.0',
      },
      body: formData,
    });

    if (!response.ok) {
      return { success: false, error: `${response.status}: ${await response.text()}` };
    }

    const data = await response.json();
    return { success: true, data };
  }
}

async function streamToBuffer(stream: ReturnType<typeof createReadStream>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export const apiClient = new ApiClient();
