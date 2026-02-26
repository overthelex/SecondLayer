import { Router, Response } from 'express';
import { Pool } from 'pg';

interface AuthenticatedRequest {
  user?: { id: string; name?: string; picture?: string };
  body: any;
  params: any;
  query: any;
}

export function createBlogCommentsRouter(pool: Pool): Router {
  const router = Router();

  // GET /api/blog/comments/:articleId — public, no auth required
  router.get('/comments/:articleId', (async (req: any, res: Response): Promise<any> => {
    try {
      const { articleId } = req.params;
      const result = await pool.query(
        `SELECT id, article_id, user_id, user_name, user_picture, content, created_at
         FROM blog_comments
         WHERE article_id = $1
         ORDER BY created_at DESC`,
        [articleId]
      );
      res.json({ comments: result.rows });
    } catch (error: any) {
      console.error('Failed to fetch comments:', error.message);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  }) as any);

  // POST /api/blog/comments/:articleId — requires JWT
  router.post('/comments/:articleId', (async (req: AuthenticatedRequest & any, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { articleId } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'Comment content is required' });
      }

      if (content.length > 2000) {
        return res.status(400).json({ error: 'Comment too long (max 2000 characters)' });
      }

      const result = await pool.query(
        `INSERT INTO blog_comments (article_id, user_id, user_name, user_picture, content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, article_id, user_id, user_name, user_picture, content, created_at`,
        [articleId, userId, req.user?.name || null, req.user?.picture || null, content.trim()]
      );

      res.status(201).json({ comment: result.rows[0] });
    } catch (error: any) {
      console.error('Failed to create comment:', error.message);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  }) as any);

  // DELETE /api/blog/comments/:commentId — owner or admin only
  router.delete('/comments/:commentId', (async (req: AuthenticatedRequest & any, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { commentId } = req.params;

      const result = await pool.query(
        `DELETE FROM blog_comments WHERE id = $1 AND user_id = $2 RETURNING id`,
        [commentId, userId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Comment not found or not owned by you' });
      }

      res.json({ deleted: true });
    } catch (error: any) {
      console.error('Failed to delete comment:', error.message);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  }) as any);

  return router;
}
