import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';
import { getConsultationMessageBus } from './consultation-message-bus.js';

export interface ConsultationE2eeKeys {
  id: string;
  consultation_id: string;
  user_id: string;
  wrapped_root_key: string;
  key_version: number;
  counter_checkpoint: number;
  created_at: Date;
  updated_at: Date;
}

export interface E2eeSetupPayload {
  wrappedForClient: string;
  wrappedForAttorney: string;
}

export interface E2eeRotatePayload {
  wrappedForClient: string;
  wrappedForAttorney: string;
  counterCheckpoint: number;
}

export class ConsultationE2eeService {
  constructor(private db: IDatabase) {}

  /**
   * Set up E2EE for a consultation. Stores wrapped root keys for both participants.
   * Called by whichever party first opens the consultation with encryption unlocked.
   */
  async setupKeys(
    consultationId: string,
    initiatorUserId: string,
    payload: E2eeSetupPayload
  ): Promise<void> {
    // Verify the initiator is a party to the consultation
    const consultation = await this.db.query(
      `SELECT client_user_id, attorney_user_id, e2ee_established
       FROM consultations WHERE id = $1`,
      [consultationId]
    );

    if (consultation.rows.length === 0) {
      throw new Error('Консультацію не знайдено');
    }

    const { client_user_id, attorney_user_id, e2ee_established } = consultation.rows[0];

    if (initiatorUserId !== client_user_id && initiatorUserId !== attorney_user_id) {
      throw new Error('Немає доступу до цієї консультації');
    }

    if (e2ee_established) {
      throw new Error('E2EE вже встановлено для цієї консультації');
    }

    // Verify both users have encryption keys set up
    const keysResult = await this.db.query(
      `SELECT user_id FROM user_encryption_keys WHERE user_id = ANY($1)`,
      [[client_user_id, attorney_user_id]]
    );

    if (keysResult.rows.length < 2) {
      throw new Error('Обидва учасники повинні мати налаштоване шифрування');
    }

    // Store wrapped keys for both parties
    await this.db.query('BEGIN');
    try {
      await this.db.query(
        `INSERT INTO consultation_e2ee_keys (consultation_id, user_id, wrapped_root_key, key_version)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (consultation_id, user_id, key_version) DO UPDATE SET
           wrapped_root_key = EXCLUDED.wrapped_root_key, updated_at = NOW()`,
        [consultationId, client_user_id, payload.wrappedForClient]
      );

      await this.db.query(
        `INSERT INTO consultation_e2ee_keys (consultation_id, user_id, wrapped_root_key, key_version)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (consultation_id, user_id, key_version) DO UPDATE SET
           wrapped_root_key = EXCLUDED.wrapped_root_key, updated_at = NOW()`,
        [consultationId, attorney_user_id, payload.wrappedForAttorney]
      );

      await this.db.query(
        `UPDATE consultations SET e2ee_established = TRUE, e2ee_established_at = NOW(), e2ee_established_by = $2
         WHERE id = $1`,
        [consultationId, initiatorUserId]
      );

      await this.db.query('COMMIT');
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }

    // Notify the other party via SSE
    const otherUserId = initiatorUserId === client_user_id ? attorney_user_id : client_user_id;
    getConsultationMessageBus().publishUserEvent(otherUserId, {
      type: 'e2ee_keys_ready',
      consultationId,
    });

    logger.info('[E2EE] Keys established for consultation', { consultationId, initiatorUserId });
  }

  /**
   * Get the wrapped root key for a user in a consultation.
   */
  async getKeys(
    consultationId: string,
    userId: string,
    keyVersion?: number
  ): Promise<ConsultationE2eeKeys | null> {
    const version = keyVersion ?? await this.getLatestKeyVersion(consultationId);

    const result = await this.db.query(
      `SELECT * FROM consultation_e2ee_keys
       WHERE consultation_id = $1 AND user_id = $2 AND key_version = $3`,
      [consultationId, userId, version]
    );

    return result.rows[0] || null;
  }

  /**
   * Get the latest key version for a consultation.
   */
  async getLatestKeyVersion(consultationId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT MAX(key_version) as max_version FROM consultation_e2ee_keys
       WHERE consultation_id = $1`,
      [consultationId]
    );
    return result.rows[0]?.max_version || 1;
  }

  /**
   * Rotate the root key. Both wrapped keys must be provided.
   * Used after every 1000 messages for forward secrecy.
   */
  async rotateKeys(
    consultationId: string,
    userId: string,
    payload: E2eeRotatePayload
  ): Promise<number> {
    const consultation = await this.db.query(
      `SELECT client_user_id, attorney_user_id FROM consultations WHERE id = $1`,
      [consultationId]
    );

    if (consultation.rows.length === 0) {
      throw new Error('Консультацію не знайдено');
    }

    const { client_user_id, attorney_user_id } = consultation.rows[0];

    if (userId !== client_user_id && userId !== attorney_user_id) {
      throw new Error('Немає доступу до цієї консультації');
    }

    const currentVersion = await this.getLatestKeyVersion(consultationId);
    const newVersion = currentVersion + 1;

    await this.db.query('BEGIN');
    try {
      await this.db.query(
        `INSERT INTO consultation_e2ee_keys (consultation_id, user_id, wrapped_root_key, key_version, counter_checkpoint)
         VALUES ($1, $2, $3, $4, $5)`,
        [consultationId, client_user_id, payload.wrappedForClient, newVersion, payload.counterCheckpoint]
      );

      await this.db.query(
        `INSERT INTO consultation_e2ee_keys (consultation_id, user_id, wrapped_root_key, key_version, counter_checkpoint)
         VALUES ($1, $2, $3, $4, $5)`,
        [consultationId, attorney_user_id, payload.wrappedForAttorney, newVersion, payload.counterCheckpoint]
      );

      await this.db.query('COMMIT');
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }

    // Notify both parties about key rotation
    const otherUserId = userId === client_user_id ? attorney_user_id : client_user_id;
    getConsultationMessageBus().publishUserEvent(otherUserId, {
      type: 'e2ee_key_rotated',
      consultationId,
      keyVersion: newVersion,
    });

    logger.info('[E2EE] Root key rotated', { consultationId, newVersion });
    return newVersion;
  }

  /**
   * Check if E2EE is established for a consultation.
   */
  async isEstablished(consultationId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT e2ee_established FROM consultations WHERE id = $1`,
      [consultationId]
    );
    return result.rows[0]?.e2ee_established ?? false;
  }

  /**
   * Get E2EE status for a consultation including both parties' key states.
   */
  async getStatus(consultationId: string, userId: string): Promise<{
    established: boolean;
    establishedAt: Date | null;
    establishedBy: string | null;
    currentKeyVersion: number;
    myKeysPresent: boolean;
    peerKeysPresent: boolean;
    peerHasEncryption: boolean;
  }> {
    const consultation = await this.db.query(
      `SELECT client_user_id, attorney_user_id, e2ee_established, e2ee_established_at, e2ee_established_by
       FROM consultations WHERE id = $1`,
      [consultationId]
    );

    if (consultation.rows.length === 0) {
      throw new Error('Консультацію не знайдено');
    }

    const { client_user_id, attorney_user_id, e2ee_established, e2ee_established_at, e2ee_established_by } = consultation.rows[0];
    const peerId = userId === client_user_id ? attorney_user_id : client_user_id;

    const version = await this.getLatestKeyVersion(consultationId);

    const myKeys = await this.getKeys(consultationId, userId, version);
    const peerKeys = await this.getKeys(consultationId, peerId, version);

    // Check if the peer has encryption set up at all (identity keys)
    const peerEncryption = await this.db.query(
      `SELECT user_id FROM user_encryption_keys WHERE user_id = $1`,
      [peerId]
    );

    return {
      established: e2ee_established ?? false,
      establishedAt: e2ee_established_at || null,
      establishedBy: e2ee_established_by || null,
      currentKeyVersion: version,
      myKeysPresent: !!myKeys,
      peerKeysPresent: !!peerKeys,
      peerHasEncryption: peerEncryption.rows.length > 0,
    };
  }
}
