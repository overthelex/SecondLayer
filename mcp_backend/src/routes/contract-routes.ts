import { Router, Response } from 'express';
import { AuthenticatedRequest as JWTRequest } from '../middleware/dual-auth.js';
import { ContractService, ContractType } from '../services/contract-service.js';
import { logger } from '../utils/logger.js';

const VALID_TYPES: ContractType[] = ['offer', 'attorney_offer', 'marketplace_rules'];

export function createContractRoutes(contractService: ContractService): Router {
  const router = Router();

  // POST / — Accept a contract
  router.post('/', (async (req: JWTRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

      const { eulaType, documentVersion } = req.body;

      if (!eulaType || !VALID_TYPES.includes(eulaType)) {
        return res.status(400).json({ error: 'Невірний тип договору. Допустимі: offer, attorney_offer, marketplace_rules' });
      }
      if (!documentVersion || typeof documentVersion !== 'string') {
        return res.status(400).json({ error: 'documentVersion є обов\'язковим' });
      }

      const ipAddress = (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string;
      const userAgent = (req.headers['user-agent'] || 'unknown') as string;

      const result = await contractService.acceptContract(userId, eulaType, documentVersion, ipAddress, userAgent);

      return res.json({ success: true, ...result });
    } catch (error: any) {
      logger.error('[ContractRoutes] Accept contract failed', { error: error.message });
      return res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  }) as any);

  // GET / — List user's contracts
  router.get('/', (async (req: JWTRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

      const contracts = await contractService.getContracts(userId);
      return res.json({ contracts });
    } catch (error: any) {
      logger.error('[ContractRoutes] List contracts failed', { error: error.message });
      return res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  }) as any);

  // GET /status — Check version status
  router.get('/status', (async (req: JWTRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

      const checksParam = req.query.checks as string;
      if (!checksParam) {
        return res.status(400).json({ error: 'Параметр checks є обов\'язковим. Формат: type:version,type:version' });
      }

      const checks = checksParam.split(',').map((item) => {
        const [eulaType, currentVersion] = item.trim().split(':');
        return { eulaType: eulaType as ContractType, currentVersion };
      });

      // Validate
      for (const check of checks) {
        if (!VALID_TYPES.includes(check.eulaType)) {
          return res.status(400).json({ error: `Невірний тип: ${check.eulaType}` });
        }
        if (!check.currentVersion) {
          return res.status(400).json({ error: `Відсутня версія для ${check.eulaType}` });
        }
      }

      const statuses = await contractService.checkVersionStatus(userId, checks);
      return res.json({ statuses });
    } catch (error: any) {
      logger.error('[ContractRoutes] Check version status failed', { error: error.message });
      return res.status(500).json({ error: 'Внутрішня помилка сервера' });
    }
  }) as any);

  return router;
}
