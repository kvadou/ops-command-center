const { logger } = require('../utils/logger');

class TutorProfileService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Generate a URL-friendly slug from first and last name.
   * Handles collisions by appending -2, -3, etc.
   */
  async generateSlug(firstName, lastName) {
    const base = [firstName, lastName]
      .filter(Boolean)
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!base) return null;

    // Check for collision
    let slug = base;
    let suffix = 2;
    while (true) {
      const { rows } = await this.pool.query(
        'SELECT 1 FROM contractors WHERE slug = $1 LIMIT 1',
        [slug]
      );
      if (rows.length === 0) break;
      slug = `${base}-${suffix}`;
      suffix++;
    }

    return slug;
  }

  /**
   * Generate and set slug for a contractor if they don't have one.
   */
  async ensureSlug(contractorId) {
    const { rows } = await this.pool.query(
      'SELECT slug, first_name, last_name FROM contractors WHERE contractor_id = $1',
      [contractorId]
    );

    if (rows.length === 0) return null;
    if (rows[0].slug) return rows[0].slug;

    const slug = await this.generateSlug(rows[0].first_name, rows[0].last_name);
    if (!slug) return null;

    await this.pool.query(
      'UPDATE contractors SET slug = $1 WHERE contractor_id = $2',
      [slug, contractorId]
    );

    return slug;
  }

  /**
   * Backfill slugs for all contractors that don't have one.
   */
  async backfillSlugs() {
    const { rows } = await this.pool.query(
      "SELECT contractor_id, first_name, last_name FROM contractors WHERE slug IS NULL AND status = 'approved' ORDER BY contractor_id"
    );

    let generated = 0;
    let skipped = 0;

    for (const row of rows) {
      const slug = await this.generateSlug(row.first_name, row.last_name);
      if (slug) {
        await this.pool.query(
          'UPDATE contractors SET slug = $1 WHERE contractor_id = $2',
          [slug, row.contractor_id]
        );
        generated++;
      } else {
        skipped++;
        logger.warn({ contractorId: row.contractor_id }, 'Could not generate slug — missing name');
      }
    }

    return { generated, skipped, total: rows.length };
  }

  /**
   * Update profile fields from STT sync.
   */
  async updateProfile(contractorId, profileData) {
    const { bio, headshotUrl, teachingStyle, yearsExperience, title,
      languages, previousExperience, availabilityNotes,
      emergencyContactName, emergencyContactPhone, emergencyContactRelation,
      phone
    } = profileData;

    await this.pool.query(
      `UPDATE contractors SET
        profile_bio = COALESCE($1, profile_bio),
        profile_headshot_url = COALESCE($2, profile_headshot_url),
        profile_teaching_style = COALESCE($3, profile_teaching_style),
        profile_years_experience = COALESCE($4, profile_years_experience),
        profile_title = COALESCE($5, profile_title),
        profile_synced_at = NOW(),
        profile_visible = CASE
          WHEN COALESCE($1, profile_bio) IS NOT NULL
            AND (COALESCE($2, profile_headshot_url, photo) IS NOT NULL)
          THEN true
          ELSE profile_visible
        END,
        profile_languages = COALESCE($6, profile_languages),
        profile_previous_experience = COALESCE($7, profile_previous_experience),
        profile_availability_notes = COALESCE($8, profile_availability_notes),
        emergency_contact_name = COALESCE($9, emergency_contact_name),
        emergency_contact_phone = COALESCE($10, emergency_contact_phone),
        emergency_contact_relation = COALESCE($11, emergency_contact_relation),
        phone = COALESCE($12, phone)
      WHERE contractor_id = $13`,
      [bio, headshotUrl, teachingStyle, yearsExperience, title,
        languages || null, previousExperience || null, availabilityNotes || null,
        emergencyContactName || null, emergencyContactPhone || null, emergencyContactRelation || null,
        phone || null, contractorId]
    );

    // Ensure slug exists
    await this.ensureSlug(contractorId);
  }

  /**
   * Get a single tutor profile by slug (public, no auth).
   */
  async getPublicProfile(slug) {
    const { rows } = await this.pool.query(
      `SELECT
        c.contractor_id, c.first_name, c.last_name, c.slug,
        c.profile_bio, c.profile_headshot_url, c.profile_teaching_style,
        c.profile_years_experience, c.profile_title,
        COALESCE(c.profile_headshot_url, c.photo) AS display_photo,
        c.review_rating, c.town, c.state, c.labels
      FROM contractors c
      WHERE c.slug = $1
        AND c.status = 'approved'
        AND c.profile_visible = true`,
      [slug]
    );

    return rows[0] || null;
  }

  /**
   * List all visible tutor profiles (public, no auth).
   */
  async listPublicProfiles() {
    const { rows } = await this.pool.query(
      `SELECT
        c.contractor_id, c.first_name, c.last_name, c.slug,
        c.profile_bio, c.profile_headshot_url, c.profile_teaching_style,
        c.profile_years_experience, c.profile_title,
        COALESCE(c.profile_headshot_url, c.photo) AS display_photo,
        c.review_rating, c.town, c.state
      FROM contractors c
      WHERE c.status = 'approved'
        AND c.profile_visible = true
      ORDER BY c.first_name, c.last_name`
    );

    return rows;
  }
}

module.exports = TutorProfileService;
