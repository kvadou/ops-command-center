/**
 * TC Photo Import Service
 * Downloads tutor photos from TutorCruncher's pre-signed S3 URLs,
 * re-hosts them on Cloudinary, and syncs to STT.
 */
const axios = require('axios');
const sharp = require('sharp');
const { logger } = require('../utils/logger');
const cache = require('../utils/cache');

const MAX_UPLOAD_BYTES = 9 * 1024 * 1024; // 9MB — Cloudinary limit is 10MB, leave headroom

class TcPhotoImportService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Import a single contractor's photo from TC → Cloudinary → DB → STT
   * @param {number} contractorId
   * @param {string|null} tcPhotoUrl - Pre-signed S3 URL (fetched from TC if null)
   * @param {object} opts - { firstName, lastName, dryRun }
   */
  async importPhoto(contractorId, tcPhotoUrl, opts = {}) {
    const { dryRun = false } = opts;

    // 1. If no photo URL provided, fetch from TC API
    if (!tcPhotoUrl) {
      const tcData = await global.limitedGet(`/contractors/${contractorId}/`);
      tcPhotoUrl = tcData?.data?.photo;
      if (!tcPhotoUrl) {
        logger.info({ contractorId }, 'TC photo import: no photo on TC profile, skipping');
        return { status: 'skipped', reason: 'no_tc_photo' };
      }
    }

    // 2. Get contractor name from DB if not provided
    let { firstName, lastName } = opts;
    if (!firstName || !lastName) {
      const { rows } = await this.pool.query(
        `SELECT first_name, last_name FROM contractors WHERE contractor_id = $1`,
        [contractorId]
      );
      if (!rows.length) {
        logger.warn({ contractorId }, 'TC photo import: contractor not found in DB');
        return { status: 'skipped', reason: 'not_found' };
      }
      firstName = firstName || rows[0].first_name;
      lastName = lastName || rows[0].last_name;
    }

    if (dryRun) {
      logger.info({ contractorId, firstName, lastName }, 'TC photo import: dry run, would import');
      return { status: 'dry_run', contractorId, firstName, lastName };
    }

    // 3. Download image from TC's pre-signed S3 URL
    let imageBuffer;
    try {
      const response = await axios.get(tcPhotoUrl, { responseType: 'arraybuffer', timeout: 30000 });
      imageBuffer = Buffer.from(response.data);

      // Resize if over upload limit (Cloudinary rejects files > 10MB)
      if (imageBuffer.length > MAX_UPLOAD_BYTES) {
        logger.info({ contractorId, originalSize: imageBuffer.length }, 'TC photo import: resizing oversized image');
        imageBuffer = await sharp(imageBuffer)
          .resize(800, 800, { fit: 'cover' })
          .jpeg({ quality: 85 })
          .toBuffer();
        logger.info({ contractorId, newSize: imageBuffer.length }, 'TC photo import: resized successfully');
      }
    } catch (err) {
      logger.error({ contractorId, err: err.message }, 'TC photo import: failed to download from TC');
      return { status: 'failed', reason: 'download_error', error: err.message };
    }

    // 4. Upload to Cloudinary
    const publicId = this._createPublicId(contractorId, firstName, lastName);
    let cloudinaryUrl;
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = global.cloudinary.uploader.upload_stream(
          {
            folder: 'acme-ops/tutor-photos',
            public_id: publicId,
            overwrite: true,
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' },
              { quality: 'auto' }
            ]
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        stream.end(imageBuffer);
      });
      cloudinaryUrl = result.secure_url;
    } catch (err) {
      logger.error({ contractorId, err: err.message }, 'TC photo import: Cloudinary upload failed');
      return { status: 'failed', reason: 'cloudinary_error', error: err.message };
    }

    // 5. Update contractors.local_image_url in DB
    await this.pool.query(
      `UPDATE contractors SET local_image_url = $1, updated_at = NOW() WHERE contractor_id = $2`,
      [cloudinaryUrl, contractorId]
    );
    await cache.clearCacheByPrefix('contractors');

    // 6. Sync to STT (fire-and-forget)
    this._syncToStt(contractorId, cloudinaryUrl);

    logger.info({ contractorId, cloudinaryUrl }, 'TC photo import: success');
    return { status: 'imported', contractorId, cloudinaryUrl };
  }

  /**
   * Batch import photos for all approved contractors missing local_image_url
   * @param {object} opts - { limit, dryRun }
   */
  async batchImport(opts = {}) {
    const { limit = 50, dryRun = false } = opts;

    const { rows: contractors } = await this.pool.query(`
      SELECT contractor_id, first_name, last_name
      FROM contractors
      WHERE photo IS NOT NULL
        AND (local_image_url IS NULL OR local_image_url = '')
        AND status = 'approved'
      ORDER BY contractor_id
      LIMIT $1
    `, [limit]);

    logger.info({ count: contractors.length, dryRun }, 'TC photo import: batch starting');

    const results = { imported: 0, skipped: 0, failed: 0, errors: [] };

    for (const c of contractors) {
      try {
        // Fetch fresh URL from TC (pre-signed URLs expire)
        const result = await this.importPhoto(c.contractor_id, null, {
          firstName: c.first_name,
          lastName: c.last_name,
          dryRun
        });

        if (result.status === 'imported' || result.status === 'dry_run') {
          results.imported++;
        } else if (result.status === 'skipped') {
          results.skipped++;
        } else {
          results.failed++;
          results.errors.push({ contractorId: c.contractor_id, error: result.error || result.reason });
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ contractorId: c.contractor_id, error: err.message });
        logger.error({ contractorId: c.contractor_id, err: err.message }, 'TC photo import: batch item error');
      }

      // Rate limit: 1 second between imports
      if (!dryRun) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(results, 'TC photo import: batch complete');
    return results;
  }

  // ─── Private Helpers ────────────────────────────────────────

  /**
   * Create standardized Cloudinary public_id (matches api-tutor-photo.js pattern)
   */
  _createPublicId(contractorId, firstName, lastName) {
    const sanitize = (str) => {
      if (!str) return '';
      return str
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    };

    const sanitizedFirst = sanitize(firstName);
    const sanitizedLast = sanitize(lastName);
    const namePart = [sanitizedFirst, sanitizedLast].filter(Boolean).join('-');
    return `tutor-${contractorId}${namePart ? '-' + namePart : ''}`;
  }

  /**
   * Sync photo URL to STT via internal API
   */
  async _syncToStt(contractorId, cloudinaryUrl) {
    const baseUrl = process.env.STT_INTERNAL_API_URL;
    const secret = process.env.STT_INTERNAL_API_SECRET || process.env.INTERNAL_API_SECRET;

    if (!baseUrl || !secret) {
      logger.warn({ contractorId }, 'TC photo import: STT sync skipped — missing env vars');
      return;
    }

    try {
      await axios.put(
        `${baseUrl}/tutors/${contractorId}/photo`,
        { headshotUrl: cloudinaryUrl },
        {
          headers: { Authorization: `Bearer ${secret}` },
          timeout: 10000
        }
      );
      logger.info({ contractorId }, 'TC photo import: synced to STT');
    } catch (err) {
      // Non-fatal — photo is already in Cloudinary and DB
      logger.warn({ contractorId, err: err.message }, 'TC photo import: STT sync failed (non-fatal)');
    }
  }
}

module.exports = TcPhotoImportService;
