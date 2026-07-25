import apiClient from '../utils/api-client';

export interface BlogComment {
  id: number;
  article_id: string;
  user_id: string;
  user_name: string | null;
  user_picture: string | null;
  content: string;
  created_at: string;
}

class BlogService {
  async getComments(articleId: string): Promise<BlogComment[]> {
    const response = await apiClient.get<{ comments: BlogComment[] }>(`/api/blog/comments/${articleId}`);
    return response.data.comments;
  }

  async postComment(articleId: string, content: string): Promise<BlogComment> {
    const response = await apiClient.post<{ comment: BlogComment }>(`/api/blog/comments/${articleId}`, { content });
    return response.data.comment;
  }

  async deleteComment(commentId: number): Promise<void> {
    await apiClient.delete(`/api/blog/comments/${commentId}`);
  }
}

export const blogService = new BlogService();
