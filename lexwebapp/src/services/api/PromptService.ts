/**
 * Prompt Service - HTTP client for saved user prompts
 */

import { BaseService } from '../base/BaseService';

export interface SavedPrompt {
  id: string;
  name: string;
  content: string;
  is_favorite: boolean;
  created_at: string;
}

export class PromptService extends BaseService {
  async list(): Promise<SavedPrompt[]> {
    return this.request(
      () => this.client.get<{ prompts: SavedPrompt[] }>('/api/prompts'),
      (data) => data.prompts
    );
  }

  async save(name: string, content: string): Promise<SavedPrompt> {
    return this.request(
      () => this.client.post<{ prompt: SavedPrompt }>('/api/prompts', { name, content }),
      (data) => data.prompt
    );
  }

  async toggleFavorite(id: string): Promise<{ id: string; is_favorite: boolean }> {
    return this.request(
      () => this.client.patch<{ prompt: { id: string; is_favorite: boolean } }>(`/api/prompts/${id}/favorite`),
      (data) => data.prompt
    );
  }

  async delete(id: string): Promise<void> {
    return this.requestVoid(() => this.client.delete(`/api/prompts/${id}`));
  }
}

export const promptService = new PromptService();
