import { Router, Response } from 'express';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { MatterService } from '../services/matter-service.js';
import { ConflictCheckService } from '../services/conflict-check-service.js';
import { LegalHoldService } from '../services/legal-hold-service.js';
import { AuditService } from '../services/audit-service.js';
import type { IDatabase, ILLMPort } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';

export function createMatterRoutes(
  matterService: MatterService,
  conflictCheckService: ConflictCheckService,
  legalHoldService: LegalHoldService,
  auditService: AuditService,
  db?: IDatabase,
  llm?: ILLMPort
): Router {
  const router = Router();

  // ─── Clients ─────────────────────────────────────────────

  // POST /clients — create client
  router.post('/clients', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const orgId = await matterService.ensureUserOrg(userId);

      const { clientName, clientType, contactEmail, taxId, metadata } = req.body;
      if (!clientName) return res.status(400).json({ error: 'clientName is required' });

      const client = await matterService.createClient(orgId, {
        clientName, clientType, contactEmail, taxId, metadata,
      }, userId);

      res.status(201).json(client);
    } catch (error: any) {
      logger.error('[MatterRoutes] Create client failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // GET /clients — list clients
  router.get('/clients', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const orgId = await matterService.getUserOrgId(userId);
      if (!orgId) return res.json({ clients: [], total: 0 });

      const result = await matterService.listClients(orgId, {
        status: req.query.status as string,
        search: req.query.search as string,
        limit: parseInt(req.query.limit as string) || undefined,
        offset: parseInt(req.query.offset as string) || undefined,
      });

      res.json(result);
    } catch (error: any) {
      logger.error('[MatterRoutes] List clients failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // GET /clients/:clientId — get client details
  router.get('/clients/:clientId', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const orgId = await matterService.getUserOrgId(userId);
      if (!orgId) return res.status(404).json({ error: 'Client not found' });

      const client = await matterService.getClient(req.params.clientId as string, orgId);
      if (!client) return res.status(404).json({ error: 'Client not found' });

      res.json(client);
    } catch (error: any) {
      logger.error('[MatterRoutes] Get client failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // PUT /clients/:clientId — update client
  router.put('/clients/:clientId', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const updated = await matterService.updateClient(req.params.clientId as string, req.body, userId);
      if (!updated) return res.status(404).json({ error: 'Client not found or no changes' });

      res.json(updated);
    } catch (error: any) {
      logger.error('[MatterRoutes] Update client failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // POST /clients/:clientId/conflict-check — run conflict check
  router.post('/clients/:clientId/conflict-check', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const result = await conflictCheckService.runFullConflictCheck(req.params.clientId as string, userId);
      res.json(result);
    } catch (error: any) {
      logger.error('[MatterRoutes] Conflict check failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // ─── Matters ─────────────────────────────────────────────

  // POST /matters — create matter
  router.post('/matters', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const { clientId, matterName, matterType, responsibleAttorney, opposingParty,
              courtCaseNumber, courtName, relatedParties, retentionPeriodYears, metadata } = req.body;

      if (!clientId || !matterName) {
        return res.status(400).json({ error: 'clientId and matterName are required' });
      }

      const matter = await matterService.createMatter({
        clientId, matterName, matterType, responsibleAttorney, opposingParty,
        courtCaseNumber, courtName, relatedParties, retentionPeriodYears, metadata,
      }, userId);

      res.status(201).json(matter);
    } catch (error: any) {
      logger.error('[MatterRoutes] Create matter failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // GET /matters — list matters (filtered by user access)
  router.get('/matters', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const orgId = await matterService.getUserOrgId(userId);
      if (!orgId) return res.json({ matters: [], total: 0 });

      const result = await matterService.listMatters(orgId, userId, {
        status: req.query.status as string,
        clientId: req.query.clientId as string,
        search: req.query.search as string,
        limit: parseInt(req.query.limit as string) || undefined,
        offset: parseInt(req.query.offset as string) || undefined,
      });

      res.json(result);
    } catch (error: any) {
      logger.error('[MatterRoutes] List matters failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // GET /matters/:matterId — get matter details
  router.get('/matters/:matterId', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const matter = await matterService.getMatter(req.params.matterId as string, userId);
      if (!matter) return res.status(404).json({ error: 'Matter not found or access denied' });

      res.json(matter);
    } catch (error: any) {
      logger.error('[MatterRoutes] Get matter failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // PUT /matters/:matterId — update matter
  router.put('/matters/:matterId', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const updated = await matterService.updateMatter(req.params.matterId as string, req.body, userId);
      if (!updated) return res.status(404).json({ error: 'Matter not found or no changes' });

      res.json(updated);
    } catch (error: any) {
      logger.error('[MatterRoutes] Update matter failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // POST /matters/:matterId/close — close matter
  router.post('/matters/:matterId/close', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const matter = await matterService.closeMatter(req.params.matterId as string, userId);
      if (!matter) return res.status(404).json({ error: 'Matter not found' });

      res.json(matter);
    } catch (error: any) {
      logger.error('[MatterRoutes] Close matter failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // ─── Team ────────────────────────────────────────────────

  // GET /matters/:matterId/team — list team members
  router.get('/matters/:matterId/team', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const members = await matterService.getTeamMembers(req.params.matterId as string);
      res.json({ members });
    } catch (error: any) {
      logger.error('[MatterRoutes] List team failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // POST /matters/:matterId/team — add team member
  router.post('/matters/:matterId/team', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const { memberId, role, accessLevel } = req.body;
      if (!memberId) return res.status(400).json({ error: 'memberId is required' });

      const member = await matterService.addTeamMember(
        req.params.matterId as string, memberId, role || 'associate', accessLevel || 'full', userId
      );

      res.status(201).json(member);
    } catch (error: any) {
      logger.error('[MatterRoutes] Add team member failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // DELETE /matters/:matterId/team/:userId — remove team member
  router.delete('/matters/:matterId/team/:userId', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const currentUserId = req.user?.id;
      if (!currentUserId) return res.status(401).json({ error: 'User not authenticated' });

      const removed = await matterService.removeTeamMember(
        req.params.matterId as string, req.params.userId as string, currentUserId
      );

      if (!removed) return res.status(404).json({ error: 'Team member not found' });
      res.json({ success: true });
    } catch (error: any) {
      logger.error('[MatterRoutes] Remove team member failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // ─── Legal Holds ─────────────────────────────────────────

  // POST /matters/:matterId/holds — create hold
  router.post('/matters/:matterId/holds', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const { holdName, holdType, scopeDescription, custodians } = req.body;
      if (!holdName) return res.status(400).json({ error: 'holdName is required' });

      const hold = await legalHoldService.createHold({
        matterId: req.params.matterId as string,
        holdName, holdType, scopeDescription, custodians,
      }, userId);

      res.status(201).json(hold);
    } catch (error: any) {
      logger.error('[MatterRoutes] Create hold failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // GET /matters/:matterId/holds — list holds
  router.get('/matters/:matterId/holds', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const holds = await legalHoldService.listHolds(req.params.matterId as string);
      res.json({ holds });
    } catch (error: any) {
      logger.error('[MatterRoutes] List holds failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // POST /holds/:holdId/release — release hold
  router.post('/holds/:holdId/release', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const hold = await legalHoldService.releaseHold(req.params.holdId as string, userId);
      if (!hold) return res.status(404).json({ error: 'Hold not found or already released' });

      res.json(hold);
    } catch (error: any) {
      logger.error('[MatterRoutes] Release hold failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // POST /holds/:holdId/documents — add documents to hold
  router.post('/holds/:holdId/documents', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const { documentIds } = req.body;
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ error: 'documentIds array is required' });
      }

      const added = await legalHoldService.addDocumentsToHold(req.params.holdId as string, documentIds, userId);
      res.json({ added });
    } catch (error: any) {
      logger.error('[MatterRoutes] Add docs to hold failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // ─── Audit ───────────────────────────────────────────────

  // GET /audit — view audit log
  router.get('/audit', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const result = await auditService.getAuditLog({
        userId: req.query.userId as string,
        action: req.query.action as string,
        resourceType: req.query.resourceType as string,
        resourceId: req.query.resourceId as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        limit: parseInt(req.query.limit as string) || undefined,
        offset: parseInt(req.query.offset as string) || undefined,
      });

      res.json(result);
    } catch (error: any) {
      logger.error('[MatterRoutes] Get audit log failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // ─── Matter Documents ─────────────────────────────────

  // GET /matters/:matterId/documents — list documents linked to matter
  router.get('/matters/:matterId/documents', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const matterId = req.params.matterId as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await matterService.listMatterDocuments(matterId, userId, { limit, offset });
      res.json(result);
    } catch (error: any) {
      logger.error('[MatterRoutes] List matter documents failed', { error: error.message });
      if (error.message === 'Access denied to this matter') {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // PUT /matters/:matterId/documents/assign — bulk assign documents to matter
  router.put('/matters/:matterId/documents/assign', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const matterId = req.params.matterId as string;
      const { documentIds } = req.body;
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ error: 'documentIds array is required' });
      }

      const result = await matterService.assignDocumentsToMatter(matterId, documentIds, userId);
      res.json(result);
    } catch (error: any) {
      logger.error('[MatterRoutes] Assign documents failed', { error: error.message });
      if (error.message === 'Access denied to this matter') {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // PUT /matters/:matterId/documents/unassign — bulk unassign documents from matter
  router.put('/matters/:matterId/documents/unassign', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const matterId = req.params.matterId as string;
      const { documentIds } = req.body;
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ error: 'documentIds array is required' });
      }

      const result = await matterService.unassignDocumentsFromMatter(matterId, documentIds, userId);
      res.json(result);
    } catch (error: any) {
      logger.error('[MatterRoutes] Unassign documents failed', { error: error.message });
      if (error.message === 'Access denied to this matter') {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // GET /audit/validate — validate chain integrity
  router.get('/audit/validate', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const result = await auditService.validateChain();
      res.json(result);
    } catch (error: any) {
      logger.error('[MatterRoutes] Validate audit chain failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // POST /auto-create-from-upload — Auto-create matter from uploaded documents using LLM
  router.post('/auto-create-from-upload', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const { documentIds } = req.body;
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ error: 'documentIds array is required' });
      }

      if (!db || !llm) {
        return res.status(503).json({ error: 'Auto-create not available — LLM or DB not configured' });
      }

      // 1. Fetch document texts (first 5 docs, first 2000 chars each)
      //    Skip LEFT() on encrypted docs — their full_text contains binary data that breaks UTF-8 functions
      const docResult = await db.query(
        `SELECT id, title,
                CASE WHEN COALESCE(is_encrypted, false) THEN NULL ELSE LEFT(full_text, 2000) END as snippet,
                mime_type,
                metadata->>'folderPath' as folder_path,
                metadata->>'originalFilename' as original_filename
         FROM documents
         WHERE id = ANY($1) AND user_id = $2
         ORDER BY created_at ASC
         LIMIT 5`,
        [documentIds, userId]
      );

      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: 'No documents found for this user' });
      }

      // 2. Build context for LLM
      const docSummaries = docResult.rows.map((d: any) => {
        const name = d.original_filename || d.title;
        const text = d.snippet || '(без тексту)';
        return `Файл: ${name}\n${text.slice(0, 500)}`;
      }).join('\n---\n');

      const totalDocs = documentIds.length;
      const folderName = docResult.rows[0]?.folder_path?.split('/')[0] || '';

      // 3. Call LLM to generate matter details
      const llmResponse = await llm.chatCompletion(
        {
          messages: [
            {
              role: 'system',
              content: `Ти — юридичний асистент. На основі завантажених документів користувача створи дані для юридичної справи.
Відповідай ТІЛЬКИ валідним JSON (без markdown):
{
  "matterName": "коротка назва справи українською (до 100 символів), що відображає суть",
  "matterType": "тип справи (наприклад: цивільна, господарська, адміністративна, кримінальна, сімейна, трудова, нерухомість, корпоративна)",
  "description": "короткий опис справи (2-3 речення) на основі документів",
  "opposingParty": "протилежна сторона якщо визначається з документів, або null",
  "courtName": "суд якщо згадується в документах, або null",
  "courtCaseNumber": "номер справи якщо згадується, або null"
}`,
            },
            {
              role: 'user',
              content: `Завантажено ${totalDocs} документів${folderName ? ` з папки "${folderName}"` : ''}.\n\nПерші документи:\n${docSummaries}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        },
        'quick'
      );

      let matterData: any = {};
      try {
        let raw = llmResponse.content?.trim() || '{}';
        if (raw.startsWith('```')) {
          raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        matterData = JSON.parse(raw);
      } catch {
        matterData = {
          matterName: folderName || `Справа від ${new Date().toLocaleDateString('uk-UA')}`,
          matterType: 'цивільна',
          description: `Автоматично створена справа з ${totalDocs} документів`,
        };
      }

      // 4. Ensure org + client exist
      const orgId = await matterService.ensureUserOrg(userId);

      // Get or create default client for this user
      let clientId: string;
      const existingClients = await matterService.listClients(orgId, {});
      if (existingClients.clients.length > 0) {
        clientId = existingClients.clients[0].id;
      } else {
        const userResult = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
        const userName = userResult.rows[0]?.name || 'Клієнт';
        const client = await matterService.createClient(orgId, {
          clientName: userName,
          clientType: 'individual',
          contactEmail: userResult.rows[0]?.email,
        }, userId);
        clientId = client.id;
      }

      // 5. Create matter
      const matter = await matterService.createMatter({
        clientId,
        matterName: matterData.matterName || `Справа від ${new Date().toLocaleDateString('uk-UA')}`,
        matterType: matterData.matterType || undefined,
        opposingParty: matterData.opposingParty || undefined,
        courtCaseNumber: matterData.courtCaseNumber || undefined,
        courtName: matterData.courtName || undefined,
        metadata: { autoCreated: true, description: matterData.description, documentCount: totalDocs },
      }, userId);

      // 6. Assign all documents to matter
      await matterService.assignDocumentsToMatter(matter.id, documentIds, userId);

      logger.info('[MatterRoutes] Auto-created matter from upload', {
        matterId: matter.id,
        matterName: matter.matter_name,
        documentCount: totalDocs,
        userId,
      });

      res.status(201).json({
        matter,
        description: matterData.description,
        documentsAssigned: totalDocs,
      });
    } catch (error: any) {
      logger.error('[MatterRoutes] Auto-create matter failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  return router;
}
