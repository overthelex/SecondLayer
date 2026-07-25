import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';

export type ContractType = 'offer' | 'attorney_offer' | 'marketplace_rules';

export interface ContractAcceptance {
  id: string;
  userId: string;
  eulaType: ContractType;
  documentVersion: string;
  contractNumber: string | null;
  contractDate: string | null;
  acceptedAt: string;
  ipAddress: string | null;
  eulaVersion: string | null;
}

export interface ContractVersionStatus {
  eulaType: ContractType;
  currentVersion: string;
  acceptedVersion: string | null;
  needsReAcceptance: boolean;
  contractNumber: string | null;
}

const CONTRACT_PREFIX: Record<ContractType, string> = {
  offer: 'C',
  attorney_offer: 'A',
  marketplace_rules: 'M',
};

const CONTRACT_SEQUENCE: Record<ContractType, string> = {
  offer: 'client_offer_contract_seq',
  attorney_offer: 'attorney_offer_contract_seq',
  marketplace_rules: 'marketplace_rules_contract_seq',
};

export class ContractService {
  constructor(private db: IDatabase) {}

  async acceptContract(
    userId: string,
    eulaType: ContractType,
    documentVersion: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ contractNumber: string; contractDate: string }> {
    // Check if already accepted this exact (user, type, version)
    const existing = await this.db.query(
      `SELECT contract_number, contract_date FROM eula_acceptances
       WHERE user_id = $1 AND eula_type = $2 AND document_version = $3
       LIMIT 1`,
      [userId, eulaType, documentVersion],
    );

    if (existing.rows.length > 0 && existing.rows[0].contract_number) {
      return {
        contractNumber: existing.rows[0].contract_number,
        contractDate: existing.rows[0].contract_date,
      };
    }

    // Generate contract number
    const year = new Date().getFullYear();
    const prefix = CONTRACT_PREFIX[eulaType];
    const sequence = CONTRACT_SEQUENCE[eulaType];
    const seqResult = await this.db.query(`SELECT nextval('${sequence}') AS seq`);
    const seq = String(seqResult.rows[0].seq).padStart(5, '0');
    const contractNumber = `${prefix}-${year}-${seq}`;
    const contractDate = new Date().toISOString().split('T')[0];

    // Build eula_version string for backward compat
    const eulaVersionMap: Record<ContractType, string> = {
      offer: `client-offer-${documentVersion}`,
      attorney_offer: `attorney-offer-${documentVersion}`,
      marketplace_rules: `marketplace-rules-${documentVersion}`,
    };

    await this.db.query(
      `INSERT INTO eula_acceptances (user_id, eula_version, eula_type, document_version, ip_address, user_agent, contract_number, contract_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, eula_type, document_version) DO NOTHING`,
      [userId, eulaVersionMap[eulaType], eulaType, documentVersion, ipAddress, userAgent, contractNumber, contractDate],
    );

    logger.info('Contract accepted', { userId, eulaType, documentVersion, contractNumber });

    return { contractNumber, contractDate };
  }

  async getContracts(userId: string): Promise<ContractAcceptance[]> {
    const result = await this.db.query(
      `SELECT id, user_id, eula_type, document_version, contract_number, contract_date, accepted_at, ip_address, eula_version
       FROM eula_acceptances
       WHERE user_id = $1
       ORDER BY accepted_at DESC`,
      [userId],
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      eulaType: row.eula_type || 'offer',
      documentVersion: row.document_version,
      contractNumber: row.contract_number,
      contractDate: row.contract_date,
      acceptedAt: row.accepted_at,
      ipAddress: row.ip_address,
      eulaVersion: row.eula_version,
    }));
  }

  async checkVersionStatus(
    userId: string,
    checks: { eulaType: ContractType; currentVersion: string }[],
  ): Promise<ContractVersionStatus[]> {
    if (checks.length === 0) return [];

    // Get latest acceptance per type for this user
    const types = checks.map((c) => c.eulaType);
    const result = await this.db.query(
      `SELECT DISTINCT ON (eula_type) eula_type, document_version, contract_number
       FROM eula_acceptances
       WHERE user_id = $1 AND eula_type = ANY($2)
       ORDER BY eula_type, accepted_at DESC`,
      [userId, types],
    );

    const acceptedMap = new Map<string, { version: string; contractNumber: string | null }>();
    for (const row of result.rows) {
      acceptedMap.set(row.eula_type, {
        version: row.document_version,
        contractNumber: row.contract_number,
      });
    }

    return checks.map((check) => {
      const accepted = acceptedMap.get(check.eulaType);
      return {
        eulaType: check.eulaType,
        currentVersion: check.currentVersion,
        acceptedVersion: accepted?.version || null,
        needsReAcceptance: !accepted || accepted.version !== check.currentVersion,
        contractNumber: accepted?.contractNumber || null,
      };
    });
  }
}
