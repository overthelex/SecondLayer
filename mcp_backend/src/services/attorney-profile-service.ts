import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface AttorneyProfile {
  id: string;
  user_id: string;
  organization_id?: string;
  bar_license_number?: string;
  bar_admission_date?: string;
  years_experience?: number;
  education?: string;
  specializations: string[];
  court_types: string[];
  region?: string;
  city?: string;
  serves_remotely: boolean;
  languages: string[];
  consultation_fee_uah?: number;
  hourly_rate_uah?: number;
  representation_fee_uah?: number;
  free_initial_consultation: boolean;
  bio?: string;
  photo_url?: string;
  total_consultations: number;
  average_rating: number;
  rating_count: number;
  is_available: boolean;
  max_active_consultations: number;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  user_name?: string;
  user_email?: string;
  organization_name?: string;
  org_type?: string;
}

export interface AttorneySearchFilters {
  specialization?: string;
  region?: string;
  city?: string;
  courtType?: string;
  language?: string;
  minRating?: number;
  maxFee?: number;
  minFee?: number;
  freeConsultation?: boolean;
  servesRemotely?: boolean;
  sortBy?: 'rating' | 'price_asc' | 'price_desc' | 'experience';
  limit?: number;
  offset?: number;
}

export class AttorneyProfileService {
  constructor(private db: IDatabase) {}

  async createProfile(userId: string, data: Partial<AttorneyProfile>): Promise<AttorneyProfile> {
    const id = uuidv4();
    const result = await this.db.query(
      `INSERT INTO attorney_profiles (
        id, user_id, organization_id,
        bar_license_number, bar_admission_date, years_experience, education,
        specializations, court_types,
        region, city, serves_remotely, languages,
        consultation_fee_uah, hourly_rate_uah, representation_fee_uah, free_initial_consultation,
        bio, photo_url, is_available, max_active_consultations, is_public
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [
        id, userId, data.organization_id || null,
        data.bar_license_number || null, data.bar_admission_date || null,
        data.years_experience || null, data.education || null,
        data.specializations || [], data.court_types || [],
        data.region || null, data.city || null,
        data.serves_remotely ?? true, data.languages || ['ukrainian'],
        data.consultation_fee_uah || null, data.hourly_rate_uah || null,
        data.representation_fee_uah || null, data.free_initial_consultation ?? false,
        data.bio || null, data.photo_url || null,
        data.is_available ?? true, data.max_active_consultations ?? 10,
        data.is_public ?? true,
      ]
    );

    // Set user_type to attorney
    await this.db.query(
      `UPDATE users SET user_type = 'attorney' WHERE id = $1`,
      [userId]
    );

    logger.info('Attorney profile created', { userId, profileId: id });
    return result.rows[0];
  }

  async updateProfile(userId: string, data: Partial<AttorneyProfile>): Promise<AttorneyProfile> {
    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const fields: Array<[string, any]> = [
      ['organization_id', data.organization_id],
      ['bar_license_number', data.bar_license_number],
      ['bar_admission_date', data.bar_admission_date],
      ['years_experience', data.years_experience],
      ['education', data.education],
      ['specializations', data.specializations],
      ['court_types', data.court_types],
      ['region', data.region],
      ['city', data.city],
      ['serves_remotely', data.serves_remotely],
      ['languages', data.languages],
      ['consultation_fee_uah', data.consultation_fee_uah],
      ['hourly_rate_uah', data.hourly_rate_uah],
      ['representation_fee_uah', data.representation_fee_uah],
      ['free_initial_consultation', data.free_initial_consultation],
      ['bio', data.bio],
      ['photo_url', data.photo_url],
      ['is_available', data.is_available],
      ['max_active_consultations', data.max_active_consultations],
      ['is_public', data.is_public],
    ];

    for (const [field, value] of fields) {
      if (value !== undefined) {
        setClauses.push(`${field} = $${idx++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      const existing = await this.getProfile(userId);
      if (!existing) throw new Error('Attorney profile not found');
      return existing;
    }

    params.push(userId);
    const result = await this.db.query(
      `UPDATE attorney_profiles SET ${setClauses.join(', ')} WHERE user_id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Attorney profile not found');
    }

    return result.rows[0];
  }

  async getProfile(userId: string): Promise<AttorneyProfile | null> {
    const result = await this.db.query(
      `SELECT ap.*, u.name as user_name, u.email as user_email,
              o.name as organization_name, o.org_type
       FROM attorney_profiles ap
       JOIN users u ON u.id = ap.user_id
       LEFT JOIN organizations o ON o.id = ap.organization_id
       WHERE ap.user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async getPublicProfile(profileIdOrUserId: string): Promise<AttorneyProfile | null> {
    const result = await this.db.query(
      `SELECT ap.*, u.name as user_name, u.email as user_email,
              o.name as organization_name, o.org_type
       FROM attorney_profiles ap
       JOIN users u ON u.id = ap.user_id
       LEFT JOIN organizations o ON o.id = ap.organization_id
       WHERE (ap.id = $1 OR ap.user_id = $1) AND ap.is_public = TRUE`,
      [profileIdOrUserId]
    );
    return result.rows[0] || null;
  }

  async searchAttorneys(filters: AttorneySearchFilters): Promise<{ attorneys: AttorneyProfile[]; total: number }> {
    const conditions = ['ap.is_public = TRUE', 'ap.is_available = TRUE'];
    const params: any[] = [];
    let idx = 1;

    if (filters.specialization) {
      conditions.push(`$${idx++} = ANY(ap.specializations)`);
      params.push(filters.specialization);
    }

    if (filters.region) {
      conditions.push(`ap.region = $${idx++}`);
      params.push(filters.region);
    }

    if (filters.city) {
      conditions.push(`ap.city = $${idx++}`);
      params.push(filters.city);
    }

    if (filters.courtType) {
      conditions.push(`$${idx++} = ANY(ap.court_types)`);
      params.push(filters.courtType);
    }

    if (filters.language) {
      conditions.push(`$${idx++} = ANY(ap.languages)`);
      params.push(filters.language);
    }

    if (filters.minRating) {
      conditions.push(`ap.average_rating >= $${idx++}`);
      params.push(filters.minRating);
    }

    if (filters.maxFee) {
      conditions.push(`ap.consultation_fee_uah <= $${idx++}`);
      params.push(filters.maxFee);
    }

    if (filters.minFee) {
      conditions.push(`ap.consultation_fee_uah >= $${idx++}`);
      params.push(filters.minFee);
    }

    if (filters.freeConsultation) {
      conditions.push(`ap.free_initial_consultation = TRUE`);
    }

    if (filters.servesRemotely) {
      conditions.push(`ap.serves_remotely = TRUE`);
    }

    const where = conditions.join(' AND ');

    let orderBy = 'ap.average_rating DESC';
    if (filters.sortBy === 'price_asc') orderBy = 'ap.consultation_fee_uah ASC NULLS LAST';
    else if (filters.sortBy === 'price_desc') orderBy = 'ap.consultation_fee_uah DESC NULLS LAST';
    else if (filters.sortBy === 'experience') orderBy = 'ap.years_experience DESC NULLS LAST';

    const limit = Math.min(filters.limit || 20, 100);
    const offset = filters.offset || 0;

    const [result, countResult] = await Promise.all([
      this.db.query(
        `SELECT ap.id, ap.user_id, ap.display_name, ap.bio, ap.specializations,
                ap.region, ap.city, ap.court_types, ap.languages,
                ap.years_experience, ap.education, ap.certifications,
                ap.consultation_fee_uah, ap.free_initial_consultation,
                ap.serves_remotely, ap.average_rating, ap.review_count,
                ap.is_available, ap.avatar_url, ap.website,
                u.name as user_name,
                o.name as organization_name, o.org_type
         FROM attorney_profiles ap
         JOIN users u ON u.id = ap.user_id
         LEFT JOIN organizations o ON o.id = ap.organization_id
         WHERE ${where}
         ORDER BY ${orderBy}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      this.db.query(
        `SELECT COUNT(*) FROM attorney_profiles ap WHERE ${where}`,
        params
      ),
    ]);

    return {
      attorneys: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async getReviews(
    attorneyUserId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ reviews: any[]; total: number }> {
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    const [result, countResult] = await Promise.all([
      this.db.query(
        `SELECT cr.*, u.name as reviewer_name
         FROM consultation_reviews cr
         JOIN users u ON u.id = cr.reviewer_user_id
         WHERE cr.attorney_user_id = $1
         ORDER BY cr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [attorneyUserId, limit, offset]
      ),
      this.db.query(
        `SELECT COUNT(*) FROM consultation_reviews WHERE attorney_user_id = $1`,
        [attorneyUserId]
      ),
    ]);

    return {
      reviews: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async updateStats(attorneyUserId: string): Promise<void> {
    await this.db.query(
      `UPDATE attorney_profiles SET
        average_rating = COALESCE((SELECT AVG(rating)::NUMERIC(3,2) FROM consultation_reviews WHERE attorney_user_id = $1), 0),
        rating_count = (SELECT COUNT(*) FROM consultation_reviews WHERE attorney_user_id = $1),
        total_consultations = (SELECT COUNT(*) FROM consultations WHERE attorney_user_id = $1 AND status = 'completed')
       WHERE user_id = $1`,
      [attorneyUserId]
    );
  }
}
