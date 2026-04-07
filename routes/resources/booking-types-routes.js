const express = require('express');
const { pool } = global;
const { columnExists } = require('../../utils/schema-cache');

const router = express.Router();

/**
 * Label-to-colour mapping for calendar colours
 * Used to ensure consistent colours based on labels, not arbitrary colourGroup values
 */
const LABEL_COLOURS = {
  'Club - Park Slope': '#1e90ff',
  'Club - Park Slope Support': '#ff1493',
  'Club - UES': '#1e90ff',
  'Club - UES Support': '#ff1493',
  'Home - NYC': 'MediumOrchid',
  'Home - LA': 'gold',
  'Home - SF': '#40e0d0',
  'Home - Hamptons': '#ffebcd',
  'Home - Westchester': 'BlanchedAlmond',
  'Online': 'lightgreen',
  'School - NYC': '#ffa500',
  'School - LA': '#ffa500',
  'School - SF': '#ffa500',
  'School - Hamptons': '#ffa500',
  'School - Eastside': '#ffa500',
};

/**
 * Get colour based on label name, with fallback to colourGroup or default
 */
function getColourFromLabel(labelName, colourGroup) {
  if (labelName && LABEL_COLOURS[labelName]) {
    return LABEL_COLOURS[labelName];
  }
  return colourGroup || 'dodgerblue';
}

async function hasAllowInternationalAddressesColumn() {
  return columnExists(pool, 'booking_types', 'allow_international_addresses');
}

// GET /api/booking-types - Get all booking types
router.get('/', async (req, res) => {
  try {
    const supportsInternationalAddresses = await hasAllowInternationalAddressesColumn();
    const { rows } = await pool.query(`
      SELECT
        bt.id,
        bt.name,
        bt.description,
        bt.public_internal   AS "publicInternal",
        bt.lesson_type       AS "lessonType",
        bt.lesson_dates      AS "lessonDates",
        bt.dft_charge_type   AS "dftChargeType",
        bt.dft_charge_rate   AS "dftChargeRate",
        bt.colour,
        bt.job_description   AS "jobDescription",
        bt.original_price    AS "originalPrice",
        bt.actual_price      AS "actualPrice",
        bt.image_url,
        bt.is_trial          AS "is_trial",
        bt.category,
        bt.label_id          AS "labelId",
        bt.label_name        AS "labelName",
        bt.service_id        AS "serviceId",
        bt.hide_day_time_options AS "hideDayTimeOptions",
        bt.hide_original_price AS "hideOriginalPrice",
        bt.hide_all_pricing AS "hideAllPricing",
        ${supportsInternationalAddresses
          ? 'bt.allow_international_addresses'
          : 'false'} AS "allowInternationalAddresses",
        bt.is_event_lead_capture AS "isEventLeadCapture",
        bt.event_name AS "eventName",
        CASE
          WHEN s.labels::text ILIKE '%Job Finished%' THEN false
          ELSE true
        END AS "isActive"
      FROM booking_types bt
      LEFT JOIN services s ON bt.service_id = s.service_id::text
      ORDER BY bt.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch booking types' });
  }
});

// GET /api/booking-types/service-status/:serviceId - Check if a service is still active
router.get('/service-status/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { rows } = await pool.query(
      `SELECT service_id, labels, status FROM services WHERE service_id = $1`,
      [parseInt(serviceId, 10)]
    );
    if (!rows.length) {
      return res.json({ isActive: true }); // Unknown service, don't block
    }
    const svc = rows[0];
    const isFinished = (svc.labels || '').toString().toLowerCase().includes('job finished')
      || svc.status === 'finished';
    res.json({ isActive: !isFinished });
  } catch (err) {
    console.error('Error checking service status:', err);
    res.json({ isActive: true }); // Fail open
  }
});

// POST /api/booking-types - Create new booking type
router.post('/', async (req, res) => {
  const {
    name,
    description,
    originalPrice,
    actualPrice,
    image_url,
    is_trial = false,
    category,
    publicInternal,
    lessonType,
    lessonDates,
    dftChargeType,
    dftChargeRate,
    colour,
    jobDescription,
    labelId,
    labelName,
    hideDayTimeOptions = false,
    hideOriginalPrice = false,
    hideAllPricing = false,
    allowInternationalAddresses = false,
    isEventLeadCapture = false,
    eventName = ''
  } = req.body;

  try {
    const supportsInternationalAddresses = await hasAllowInternationalAddressesColumn();
    const columns = [
      'name',
      'description',
      'original_price',
      'actual_price',
      'image_url',
      'is_trial',
      'category',
      'public_internal',
      'lesson_type',
      'lesson_dates',
      'dft_charge_type',
      'dft_charge_rate',
      'colour',
      'job_description',
      'label_id',
      'label_name',
      'hide_day_time_options',
      'hide_original_price',
      'hide_all_pricing',
      'is_event_lead_capture',
      'event_name',
    ];
    const values = [
      name,
      description,
      originalPrice,
      actualPrice,
      image_url,
      is_trial,
      category,
      publicInternal,
      lessonType,
      lessonDates,
      dftChargeType,
      dftChargeRate,
      colour,
      jobDescription,
      labelId,
      labelName,
      hideDayTimeOptions,
      hideOriginalPrice,
      hideAllPricing,
      isEventLeadCapture,
      eventName,
    ];

    if (supportsInternationalAddresses) {
      columns.splice(19, 0, 'allow_international_addresses');
      values.splice(19, 0, allowInternationalAddresses);
    }

    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');
    const { rows } = await pool.query(
      `INSERT INTO booking_types (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING *`,
      values
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/booking-types failed:', err);
    res.status(500).json({ error: 'Could not create booking type' });
  }
});

// PUT /api/booking-types/:id - Update booking type
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    originalPrice,
    actualPrice,
    image_url,
    is_trial,
    category,
    publicInternal,
    lessonType,
    lessonDates,
    dftChargeType,
    dftChargeRate,
    colour,
    jobDescription,
    labelId,
    labelName,
    hideDayTimeOptions,
    hideOriginalPrice,
    hideAllPricing,
    allowInternationalAddresses,
    isEventLeadCapture,
    eventName
  } = req.body;

  try {
    const supportsInternationalAddresses = await hasAllowInternationalAddressesColumn();
    const updates = [
      ['name', name],
      ['description', description],
      ['original_price', originalPrice],
      ['actual_price', actualPrice],
      ['image_url', image_url],
      ['is_trial', is_trial],
      ['category', category],
      ['public_internal', publicInternal],
      ['lesson_type', lessonType],
      ['lesson_dates', lessonDates],
      ['dft_charge_type', dftChargeType],
      ['dft_charge_rate', dftChargeRate],
      ['colour', colour],
      ['job_description', jobDescription],
      ['label_id', labelId],
      ['label_name', labelName],
      ['hide_day_time_options', hideDayTimeOptions],
      ['hide_original_price', hideOriginalPrice],
      ['hide_all_pricing', hideAllPricing],
      ['is_event_lead_capture', isEventLeadCapture],
      ['event_name', eventName],
    ];

    if (supportsInternationalAddresses) {
      updates.splice(19, 0, ['allow_international_addresses', allowInternationalAddresses]);
    }

    const setClause = updates
      .map(([column], index) => `${column} = $${index + 2}`)
      .join(',\n             ');
    const params = [id, ...updates.map(([, value]) => value)];

    const { rows } = await pool.query(
      `UPDATE booking_types
         SET ${setClause}
       WHERE id = $1
       RETURNING *`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Booking type not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/booking-types/:id failed:', err);
    res.status(500).json({ error: 'Could not update booking type' });
  }
});

// DELETE /api/booking-types/:id - Delete booking type
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `DELETE FROM booking_types WHERE id=$1 RETURNING *`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Booking type not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('DELETE /api/booking-types/:id failed:', err);
    res.status(500).json({ error: 'Could not delete booking type' });
  }
});

// POST /api/booking-types/sync-from-service - Sync single booking type from service
router.post('/sync-from-service', async (req, res) => {
  const { serviceId } = req.body;

  if (!serviceId) {
    return res.status(400).json({ error: 'Missing serviceId' });
  }

  try {
    const { rows: serviceRows } = await pool.query(
      `SELECT
         "serviceId",
         name,
         description,
         location,
         price,
         image,
         type,
         "colourGroup",
         "dft_max_srs" AS "dftMaxSrs",
         rcrs,
         "labelId",
         "labelName"
       FROM "Services"
       WHERE "serviceId" = $1`,
      [serviceId]
    );

    if (!serviceRows.length) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const service = serviceRows[0];
    const { rows: bookingRows } = await pool.query(
      `SELECT * FROM booking_types WHERE name = $1`,
      [service.name]
    );

    const labelName = service.labelName || '';
    const payload = {
      name: service.name,
      description: service.description || '',
      original_price: Number(service.price) || 0,
      actual_price: Number(service.price) || 0,
      dft_charge_rate: Number(service.price) || 0,
      image_url: service.image || '',
      colour: getColourFromLabel(labelName, service.colourGroup),
      job_description: '',
      is_trial: false,
      category: service.location || '',
      public_internal: 'public',
      lesson_type: 'Club',
      lesson_dates: service.type || 'Per Session',
      dft_charge_type: 'Hourly',
      label_id: service.labelId || null,
      label_name: labelName,
      service_id: service.serviceId
    };

    if (bookingRows.length) {
      const existing = bookingRows[0];
      const { rows: updatedRows } = await pool.query(
        `UPDATE booking_types
         SET description     = $2,
             original_price  = $3,
             actual_price    = $4,
             image_url       = $5,
             is_trial        = $6,
             category        = $7,
             public_internal = $8,
             lesson_type     = $9,
             lesson_dates    = $10,
             dft_charge_type = $11,
             dft_charge_rate = $12,
             colour          = $13,
             job_description = $14,
             label_id        = $15,
             label_name      = $16,
             service_id      = $17
         WHERE id = $1
         RETURNING *`,
        [
          existing.id,
          payload.description,
          payload.original_price,
          payload.actual_price,
          payload.image_url,
          payload.is_trial,
          payload.category,
          payload.public_internal,
          payload.lesson_type,
          payload.lesson_dates,
          payload.dft_charge_type,
          payload.dft_charge_rate,
          payload.colour,
          payload.job_description,
          payload.label_id,
          payload.label_name,
          payload.service_id
        ]
      );

      return res.status(200).json({
        action: 'updated',
        bookingType: updatedRows[0]
      });
    } else {
      const { rows: createdRows } = await pool.query(
        `INSERT INTO booking_types
           (name, description, original_price, actual_price, image_url,
            is_trial, category, public_internal, lesson_type,
            lesson_dates, dft_charge_type, dft_charge_rate,
            colour, job_description, label_id, label_name, service_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [
          payload.name,
          payload.description,
          payload.original_price,
          payload.actual_price,
          payload.image_url,
          payload.is_trial,
          payload.category,
          payload.public_internal,
          payload.lesson_type,
          payload.lesson_dates,
          payload.dft_charge_type,
          payload.dft_charge_rate,
          payload.colour,
          payload.job_description,
          payload.label_id,
          payload.label_name,
          payload.service_id
        ]
      );

      return res.status(201).json({
        action: 'created',
        bookingType: createdRows[0]
      });
    }
  } catch (err) {
    console.error('Error in /api/booking-types/sync-from-service:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/booking-types/sync-all-from-services - Sync all booking types from services
router.post('/sync-all-from-services', async (req, res) => {
  try {
    const { rows: allServices } = await pool.query(`
      SELECT
        "serviceId",
        name,
        description,
        location,
        price,
        image,
        type,
        "colourGroup",
        "dft_max_srs" AS "dftMaxSrs",
        rcrs,
        "labelId",
        "labelName"
      FROM "Services"
    `);

    const { rows: allBookingTypes } = await pool.query(
      `SELECT id, name, service_id FROM booking_types WHERE lesson_type = 'Club'`
    );

    const results = {
      created: [],
      updated: [],
      removed: [],
      unchanged: []
    };

    const bookingTypesByServiceId = new Map();
    for (const bt of allBookingTypes) {
      if (bt.service_id) bookingTypesByServiceId.set(bt.service_id, bt);
      if (bt.name) bookingTypesByServiceId.set(bt.name, bt);
    }

    const serviceIdsInDB = new Set(allServices.map(s => s.serviceId));

    for (const service of allServices) {
      let existing = bookingTypesByServiceId.get(service.serviceId);
      if (!existing) {
        existing = allBookingTypes.find(bt => bt.name === service.name);
      }

      const labelName = service.labelName || '';
      const payload = {
        name: service.name,
        description: service.description || '',
        original_price: Number(service.price) || 0,
        actual_price: Number(service.price) || 0,
        dft_charge_rate: Number(service.price) || 0,
        image_url: service.image || '',
        colour: getColourFromLabel(labelName, service.colourGroup),
        job_description: '',
        is_trial: false,
        category: service.location || '',
        public_internal: 'public',
        lesson_type: 'Club',
        lesson_dates: service.type || 'Per Session',
        dft_charge_type: 'Hourly',
        label_id: service.labelId || null,
        label_name: labelName,
        service_id: service.serviceId
      };

      if (existing) {
        const hasChanged = Object.entries(payload).some(([key, value]) => {
          return existing[key] !== value;
        });

        if (hasChanged) {
          const { rows: updatedRows } = await pool.query(
            `UPDATE booking_types
       SET description     = $2,
           original_price  = $3,
           actual_price    = $4,
           image_url       = $5,
           is_trial        = $6,
           category        = $7,
           public_internal = $8,
           lesson_type     = $9,
           lesson_dates    = $10,
           dft_charge_type = $11,
           dft_charge_rate = $12,
           colour          = $13,
           job_description = $14,
           label_id        = $15,
           label_name      = $16,
           service_id      = $17
       WHERE id = $1
       RETURNING *`,
            [
              existing.id,
              payload.description,
              payload.original_price,
              payload.actual_price,
              payload.image_url,
              payload.is_trial,
              payload.category,
              payload.public_internal,
              payload.lesson_type,
              payload.lesson_dates,
              payload.dft_charge_type,
              payload.dft_charge_rate,
              payload.colour,
              payload.job_description,
              payload.label_id,
              payload.label_name,
              payload.service_id
            ]
          );
          results.updated.push(updatedRows[0]);
        } else {
          results.unchanged.push(existing);
        }
      } else {
        const duplicate = allBookingTypes.find(bt => bt.name === payload.name);
        if (duplicate) {
          results.unchanged.push({ ...duplicate, reason: 'duplicate name' });
          continue;
        }

        const { rows: createdRows } = await pool.query(
          `INSERT INTO booking_types
    (name, description, original_price, actual_price, image_url,
     is_trial, category, public_internal, lesson_type,
     lesson_dates, dft_charge_type, dft_charge_rate,
     colour, job_description, label_id, label_name, service_id)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
   ON CONFLICT (name)
   DO UPDATE
   SET description     = EXCLUDED.description,
       original_price  = EXCLUDED.original_price,
       actual_price    = EXCLUDED.actual_price,
       image_url       = EXCLUDED.image_url,
       is_trial        = EXCLUDED.is_trial,
       category        = EXCLUDED.category,
       public_internal = EXCLUDED.public_internal,
       lesson_type     = EXCLUDED.lesson_type,
       lesson_dates    = EXCLUDED.lesson_dates,
       dft_charge_type = EXCLUDED.dft_charge_type,
       dft_charge_rate = EXCLUDED.dft_charge_rate,
       colour          = EXCLUDED.colour,
       job_description = EXCLUDED.job_description,
       label_id        = EXCLUDED.label_id,
       label_name      = EXCLUDED.label_name,
       service_id      = EXCLUDED.service_id
   RETURNING *`,
          [
            payload.name,
            payload.description,
            payload.original_price,
            payload.actual_price,
            payload.image_url,
            payload.is_trial,
            payload.category,
            payload.public_internal,
            payload.lesson_type,
            payload.lesson_dates,
            payload.dft_charge_type,
            payload.dft_charge_rate,
            payload.colour,
            payload.job_description,
            payload.label_id,
            payload.label_name,
            payload.service_id
          ]
        );
        results.created.push(createdRows[0]);
      }
    }

    const orphaned = allBookingTypes.filter(
      bt => !serviceIdsInDB.has(bt.service_id)
    );
    for (const orphan of orphaned) {
      await pool.query(`DELETE FROM booking_types WHERE id = $1`, [orphan.id]);
      results.removed.push(orphan);
    }

    res.json({
      success: true,
      summary: {
        created: results.created.length,
        updated: results.updated.length,
        removed: results.removed.length
      },
      details: results
    });
  } catch (err) {
    console.error('Error in /api/booking-types/sync-all-from-services:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/booking-types/:id/qr-code - Get QR code for a booking type (event lead form)
router.get('/:id/qr-code', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT
        q.*,
        COALESCE(COUNT(s.id), 0)::int as total_scans,
        COALESCE(COUNT(DISTINCT s.session_id), 0)::int as unique_scans,
        MAX(s.scanned_at) as last_scanned_at
      FROM qr_codes q
      LEFT JOIN qr_code_scans s ON s.qr_code_id = q.id
      WHERE q.linked_entity_type = 'booking_type'
        AND q.linked_entity_id = $1
        AND q.deleted_at IS NULL
      GROUP BY q.id
      ORDER BY q.created_at DESC
      LIMIT 1
    `, [id]);

    if (result.rows.length === 0) {
      return res.json({ exists: false, booking_type_id: id });
    }

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching booking type QR code:', err);
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
});

// POST /api/booking-types/:id/qr-code - Generate QR code for a booking type (event lead form)
router.post('/:id/qr-code', async (req, res) => {
  const { id } = req.params;
  const {
    name,
    foreground_color = '#6A469D',
    background_color = '#FFFFFF',
  } = req.body;

  try {
    // Check if already exists
    const existing = await pool.query(`
      SELECT * FROM qr_codes
      WHERE linked_entity_type = 'booking_type'
        AND linked_entity_id = $1
        AND deleted_at IS NULL
    `, [id]);

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    // Get booking type details
    const btResult = await pool.query(
      'SELECT id, name, event_name, is_event_lead_capture FROM booking_types WHERE id = $1',
      [id]
    );
    if (btResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking type not found' });
    }
    const bt = btResult.rows[0];

    const baseUrl = process.env.BOOKING_FORM_BASE_URL || process.env.FRONTEND_URL || 'https://join.acmeops.com';

    // Build destination URL
    let destinationUrl;
    if (bt.is_event_lead_capture) {
      destinationUrl = new URL(`${baseUrl}/booking-forms/event-lead`);
      destinationUrl.searchParams.set('eventId', id);
      if (bt.event_name) destinationUrl.searchParams.set('eventName', bt.event_name);
    } else {
      destinationUrl = new URL(`${baseUrl}/booking-forms/frontend`);
      destinationUrl.searchParams.set('bookingTypeId', id);
    }
    destinationUrl.searchParams.set('utm_source', 'qr_code');
    destinationUrl.searchParams.set('utm_medium', 'scan');
    destinationUrl.searchParams.set('utm_campaign', (bt.name || 'event-form').toLowerCase().replace(/[^a-z0-9]+/g, '-'));

    const qrName = name || bt.name;

    // Ensure Booking Forms folder exists
    const bookingFormQRService = require('../../services/booking-form-qr-service');
    const folderId = await bookingFormQRService.ensureBookingFormsFolder(pool);

    // Generate QR code
    const qrGeneratorService = require('../../services/qr-code-generator-service');

    let shortCode;
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      shortCode = qrGeneratorService.generateShortCode(8);
      const dup = await pool.query('SELECT id FROM qr_codes WHERE short_code = $1', [shortCode]);
      if (dup.rows.length === 0) isUnique = true;
      attempts++;
    }
    if (!isUnique) {
      return res.status(500).json({ error: 'Failed to generate unique short code' });
    }

    const trackingUrl = qrGeneratorService.buildTrackingUrl(shortCode, baseUrl);

    const qrResult = await qrGeneratorService.generateQRCode({
      content: trackingUrl,
      foregroundColor: foreground_color,
      backgroundColor: background_color,
      width: 500,
      format: 'png'
    });

    // Upload to Cloudinary
    const { cloudinary } = global;
    let qr_code_image_url = null;
    try {
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'acme-ops/qr-codes',
            public_id: `qr-booking-type-${id}-${Date.now()}`,
            resource_type: 'image',
            format: 'png'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(qrResult.data);
      });
      qr_code_image_url = uploadResult.secure_url;
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
    }

    // Generate SVG
    let qr_code_svg = null;
    try {
      const svgResult = await qrGeneratorService.generateQRCode({
        content: trackingUrl,
        foregroundColor: foreground_color,
        backgroundColor: background_color,
        format: 'svg'
      });
      qr_code_svg = svgResult.data;
    } catch (svgError) {
      console.error('SVG generation error:', svgError);
    }

    // Save to database
    const insertResult = await pool.query(`
      INSERT INTO qr_codes (
        name, description, destination_url, qr_code_image_url, qr_code_svg,
        short_code, tracking_url, source,
        linked_entity_type, linked_entity_id, auto_generated,
        foreground_color, background_color,
        category, folder_id
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, 'internal',
        'booking_type', $8, true,
        $9, $10,
        'Booking Forms', $11
      )
      RETURNING *
    `, [
      qrName,
      `QR code for event lead form: ${bt.name}`,
      destinationUrl.toString(),
      qr_code_image_url,
      qr_code_svg,
      shortCode,
      trackingUrl,
      id,
      foreground_color,
      background_color,
      folderId
    ]);

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    console.error('Error generating booking type QR code:', err);
    res.status(500).json({ error: err.message || 'Failed to generate QR code' });
  }
});

module.exports = router;
