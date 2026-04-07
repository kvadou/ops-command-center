require('dotenv').config();
const { Pool } = require('pg');
const axios = require('axios');
const Bottleneck = require('bottleneck');
const { getPool } = require('../database-connections');
const cache = require('../utils/cache');
const { columnsExist } = require('../utils/schema-cache');
const { logger } = require('../utils/logger');

// Determine environment from Heroku app name or DATABASE_URL
function getEnvironment() {
  // Check DATABASE_URL for AWS RDS hostname (most reliable for Heroku)
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('c5cqb8h0eop3g3')) return 'eastside';
  if (dbUrl.includes('c2hbg00ac72j9d')) return 'westside';
  if (dbUrl.includes('c38vi3s2tbags3')) return 'production';
  if (dbUrl.includes('c5cnr847jq0fj3')) return 'staging';
  
  // Check Heroku app name as fallback
  const herokuApp = process.env.HEROKU_APP_NAME || process.env.DYNO?.split('.')[0];
  if (herokuApp?.includes('eastside')) return 'eastside';
  if (herokuApp?.includes('westside')) return 'westside';
  if (herokuApp?.includes('main')) return 'production';
  if (herokuApp?.includes('staging')) return 'staging';
  
  // Default to production if on Heroku (has DATABASE_URL), local otherwise
  return process.env.DATABASE_URL && !dbUrl.includes('localhost') ? 'production' : 'local';
}

// Database connection - use environment-specific pool
// This ensures correct database (production, westside, eastside) and SSL configuration
const pool = getPool(getEnvironment());

// TutorCruncher API setup
const TUTORCRUNCHER_API_BASE = process.env.TUTORCRUNCHER_API_BASE || 'https://account.acmeops.com/api/';
const tutorCruncherAPI = axios.create({
  baseURL: TUTORCRUNCHER_API_BASE,
  headers: {
    Authorization: `token ${process.env.TUTORCRUNCHER_API_TOKEN}`,
  },
  timeout: 60000,
});

// Rate limiting - max 3600 requests per hour
const limiter = new Bottleneck({
  reservoir: 3600,
  reservoirRefreshAmount: 3600,
  reservoirRefreshInterval: 60 * 60 * 1000,
  maxConcurrent: 5,
  minTime: 1000,
});

// Wrap API calls with rate limiter
const limitedGet = (url, config) => limiter.schedule(() => tutorCruncherAPI.get(url, config));

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limit retry helper
const rateLimitRetry = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429 && i < maxRetries - 1) {
        const waitTime = Math.pow(2, i) * 1000;
        logger.info(`Rate limited, waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
        continue;
      }
      throw err;
    }
  }
};

const resyncAllAppointments = async () => {
  try {
    const { rows: appointments } = await pool.query(
      `SELECT appointment_id
       FROM appointments
       WHERE updated_at IS NULL
          OR updated_at < NOW() - INTERVAL '24 hours'
       ORDER BY appointment_id DESC`
    );

    logger.info(`Found ${appointments.length} appointments to resync.`);

    for (const appointment of appointments) {
      const id = appointment.appointment_id;
      try {
        const response = await tutorCruncherAPI.get(`appointments/${id}/`);
        const appointmentData = response.data;

        const event = {
          action: "EDITED_AN_APPOINTMENT",
          subject: appointmentData,
        };

        logger.info(`Resyncing appointment ${id}...`);
        await handleAppointmentWebhook(event);
        
        // If appointment exists, ensure it's not marked as deleted
        await pool.query(
          `UPDATE appointments SET is_deleted = FALSE, updated_at = NOW() WHERE appointment_id = $1 AND is_deleted = TRUE`,
          [id]
        );
      } catch (err) {
        // If appointment returns 404, it's been deleted in TutorCruncher
        if (err.response?.status === 404) {
          logger.info(`Appointment ${id} not found in TutorCruncher - marking as deleted`);
          await pool.query(
            `UPDATE appointments SET is_deleted = TRUE, updated_at = NOW() WHERE appointment_id = $1`,
            [id]
          );
        } else {
          logger.error({ error: err.message }, `Error resyncing appointment ${id}:`);
        }
      }

      await delay(1000);
    }
    logger.info("Resync complete.");
  } catch (err) {
    logger.error({ error: err.message }, "Error fetching appointments from DB:");
  }
};

async function fetchAllPages(path, params = {}, concurrency = 5) {
  const first = await limitedGet(path, {
    params: { ...params, page_size: 100, page: 1 },
  });
  const total = first.data.count;
  const perPage = 100;
  const pages = Math.ceil(total / perPage);

  const { default: pLimit } = await import("p-limit");
  const limit = pLimit(concurrency);

  const all = Array.from({ length: pages }, (_, i) => {
    const pageNum = i + 1;
    return limit(async () => {
      logger.info(`⏳ [fetchAllPages] ${path} → page ${pageNum}/${pages}`);
      const resp = await limitedGet(path, {
        params: { ...params, page_size: perPage, page: pageNum },
      });
      return resp.data.results;
    });
  });

  const results = await Promise.all(all);
  return results.flat();
}

async function syncInvoices() {
  console.time("syncInvoices");
  const client = await pool.connect();
  let nextUrl = "/invoices/";
  let page = 1;
  const { syncInvoiceDetails } = require('../scripts/sync-invoice-details');

  try {
    while (nextUrl) {
      logger.info(`[syncInvoices] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await limitedGet(nextUrl);

      const ids = data.results.map((inv) => inv.id);
      const { rows: locals } = await client.query(
        `SELECT id AS invoice_id, remote_last_updated
           FROM invoices
          WHERE id = ANY($1)`,
        [ids]
      );
      const localMap = new Map(
        locals.map((r) => [r.invoice_id, r.remote_last_updated])
      );

      for (const inv of data.results) {
        const localUpdated = localMap.get(inv.id);
        const needsUpdate = !localUpdated || new Date(inv.last_updated) > localUpdated;
        
        if (needsUpdate) {
          // Sync full invoice details including charges
          const result = await syncInvoiceDetails(inv.id, client);
          if (result.success) {
            logger.info(`[syncInvoices]   ↳ detail ${inv.id} (${result.chargesCount} charges)`);
          } else {
            logger.error(`[syncInvoices]   ✗ error syncing ${inv.id}: ${result.error}`);
          }
        }
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }
    logger.info("[syncInvoices]  Done");
  } finally {
    client.release();
    console.timeEnd("syncInvoices");
  }
}

async function syncServices() {
  console.time("syncServices");
  const client = await pool.connect();
  let nextUrl = "/services/?page_size=100";
  let page = 1;

  try {
    while (nextUrl) {
      logger.info(`[syncServices] ⏳ Page ${page}: ${nextUrl}`);
      const { data: listPage } = await limitedGet(nextUrl);

      const serviceIds = listPage.results.map((svc) => svc.id);
      const { rows: locals } = await client.query(
        `SELECT service_id, remote_last_updated
         FROM services
         WHERE service_id = ANY($1)`,
        [serviceIds]
      );
      const localMap = new Map(
        locals.map((r) => [r.service_id, r.remote_last_updated])
      );

      for (const svc of listPage.results) {
        await client.query(
          `INSERT INTO services
             (service_id, name, dft_charge_type, dft_charge_rate,
              dft_contractor_rate, status, remote_last_updated,
              created_at, updated_at)
           VALUES
             ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
           ON CONFLICT (service_id) DO UPDATE SET
             name                = EXCLUDED.name,
             dft_charge_type     = EXCLUDED.dft_charge_type,
             dft_charge_rate     = EXCLUDED.dft_charge_rate,
             dft_contractor_rate = EXCLUDED.dft_contractor_rate,
             status              = EXCLUDED.status,
             remote_last_updated = EXCLUDED.remote_last_updated,
             updated_at          = NOW();`,
          [
            svc.id,
            svc.name,
            svc.dft_charge_type,
            parseFloat(svc.dft_charge_rate),
            parseFloat(svc.dft_contractor_rate),
            svc.status,
            svc.last_updated,
          ]
        );

        const localUpdated = localMap.get(svc.id);
        if (!localUpdated || new Date(svc.last_updated) > localUpdated) {
          logger.info(`[syncServices]   ↳ detail ${svc.id}`);
          const { data: detail } = await limitedGet(`/services/${svc.id}/`);
          const labels = (detail.labels || []).map((l) => l.name);
          const srPremium = detail.sr_premium ? parseFloat(detail.sr_premium) : null;

          await client.query(
            `UPDATE services
             SET labels     = $2,
                 sr_premium = $3,
                 updated_at = NOW()
             WHERE service_id = $1;`,
            [svc.id, JSON.stringify(labels), srPremium]
          );
        }
      }

      nextUrl = listPage.next
        ? listPage.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    logger.info(`[syncServices]  All services synced`);
  } finally {
    client.release();
    console.timeEnd("syncServices");
  }
}

async function syncAppointments() {
  console.time("syncAppointments");
  const client = await pool.connect();
  let page = 1;
  let nextUrl = "/appointments/?page_size=100";

  try {
    // Get all valid service IDs once at the start to avoid foreign key violations
    const { rows: validServices } = await client.query(
      `SELECT service_id FROM services`
    );
    const validServiceIds = new Set(validServices.map(s => s.service_id));
    logger.info(`[syncAppointments] Found ${validServiceIds.size} valid services`);

    while (nextUrl) {
      logger.info(`[syncAppointments] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await rateLimitRetry(() => limitedGet(nextUrl));

      const ids = data.results.map((a) => a.id);
      const { rows: locals } = await client.query(
        `SELECT appointment_id, remote_last_updated
           FROM appointments
          WHERE appointment_id = ANY($1)`,
        [ids]
      );
      const localMap = new Map(
        locals.map((r) => [r.appointment_id, r.remote_last_updated])
      );

      // Process appointments in smaller batches to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < data.results.length; i += batchSize) {
        const batch = data.results.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (apt) => {
          // Skip appointments without a service or with invalid service_id
          if (!apt.service || !apt.service.id) {
            return;
          }

          if (!validServiceIds.has(apt.service.id)) {
            return;
          }

          try {
            // ALWAYS fetch full details for every appointment (complete sync)
            const { data: full } = await rateLimitRetry(() => limitedGet(`/appointments/${apt.id}/`));

            // Skip if service is missing or invalid
            if (!full.service || !full.service.id || !validServiceIds.has(full.service.id)) {
              return;
            }

            const units = full.units
              ? parseFloat(full.units)
              : (new Date(full.finish) - new Date(full.start)) / 3600000;

            // Update appointment with full details
            await client.query(
              `INSERT INTO appointments
                 (appointment_id, start, finish, units, topic, location,
                  status, charge_type, service_id,
                  created_at, updated_at,
                  remote_last_updated)
               VALUES
                 ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),$10)
               ON CONFLICT (appointment_id) DO UPDATE SET
                 start                = EXCLUDED.start,
                 finish               = EXCLUDED.finish,
                 units                = EXCLUDED.units,
                 topic                = EXCLUDED.topic,
                 location             = EXCLUDED.location,
                 status               = EXCLUDED.status,
                 charge_type          = EXCLUDED.charge_type,
                 service_id           = EXCLUDED.service_id,
                 updated_at           = NOW(),
                 remote_last_updated  = EXCLUDED.remote_last_updated`,
              [
                full.id,
                full.start,
                full.finish,
                units,
                full.topic,
                JSON.stringify(full.location),
                full.status,
                full.service.dft_charge_type,
                full.service.id,
                full.last_updated,
              ]
            );

            // ALWAYS re-sync recipients (needed for revenue calculations)
            await client.query(
              `DELETE FROM appointment_recipients WHERE appointment_id = $1`,
              [full.id]
            );
            for (const r of full.rcras || []) {
              // Store the base charge rate from TutorCruncher - let revenue calculation handle units
              const baseChargeRate = parseFloat(r.charge_rate);
              
              await client.query(
                `INSERT INTO appointment_recipients
                   (appointment_id, recipient_id, recipient_name,
                    paying_client_id, paying_client_name,
                    charge_rate, status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (appointment_id, recipient_id) DO UPDATE SET
                   recipient_name = EXCLUDED.recipient_name,
                   paying_client_id = EXCLUDED.paying_client_id,
                   paying_client_name = EXCLUDED.paying_client_name,
                   charge_rate = EXCLUDED.charge_rate,
                   status = EXCLUDED.status`,
                [
                  full.id,
                  r.recipient,
                  r.recipient_name,
                  r.paying_client,
                  r.paying_client_name,
                  baseChargeRate,
                  r.status,
                ]
              );
            }

            // ALWAYS re-sync contractors (needed for tutor pay calculations)
            await client.query(
              `DELETE FROM appointment_contractors WHERE appointment_id = $1`,
              [full.id]
            );
            for (const c of full.cjas || []) {
              // Store the base pay rate from TutorCruncher - let pay calculation handle units
              const basePayRate = parseFloat(c.pay_rate);
              
              await client.query(
                `INSERT INTO appointment_contractors
                   (appointment_id, contractor_id, contractor_name, pay_rate)
                 VALUES ($1,$2,$3,$4)
                 ON CONFLICT (appointment_id, contractor_id) DO UPDATE SET
                   contractor_name = EXCLUDED.contractor_name,
                   pay_rate = EXCLUDED.pay_rate`,
                [full.id, c.contractor, c.name, basePayRate]
              );
            }

            if (page % 10 === 0 || i === 0) {
              logger.info(`[syncAppointments]   ↳ synced ${full.id}`);
            }
          } catch (err) {
            logger.error({ data: err.message || err }, `[syncAppointments] Failed for ${apt.id}:`);
          }
        }));
        
        // Small delay between batches
        await delay(100);
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    logger.info(`[syncAppointments]  All appointments synced`);
    
    // Mark appointments as deleted if they no longer exist in TutorCruncher
    // We check recent appointments (updated in the last 30 days) to avoid marking old ones
    logger.info(`[syncAppointments] Checking for deleted appointments...`);
    const { rows: recentAppointments } = await client.query(
      `SELECT appointment_id 
       FROM appointments 
       WHERE updated_at > NOW() - INTERVAL '30 days'
         AND is_deleted = FALSE
         AND status IN ('complete', 'cancelled-chargeable')`
    );
    
    let deletedCount = 0;
    for (const apt of recentAppointments) {
      try {
        await rateLimitRetry(() => limitedGet(`/appointments/${apt.appointment_id}/`));
        // If we get here, appointment still exists - ensure it's not marked as deleted
        await client.query(
          `UPDATE appointments 
           SET is_deleted = FALSE, updated_at = NOW() 
           WHERE appointment_id = $1 AND is_deleted = TRUE`,
          [apt.appointment_id]
        );
      } catch (err) {
        if (err.response?.status === 404) {
          logger.info(`[syncAppointments]   ↳ ${apt.appointment_id} deleted in TutorCruncher`);
          await client.query(
            `UPDATE appointments 
             SET is_deleted = TRUE, updated_at = NOW() 
             WHERE appointment_id = $1`,
            [apt.appointment_id]
          );
          deletedCount++;
        }
      }
    }
    
    if (deletedCount > 0) {
      logger.info(`[syncAppointments] Marked ${deletedCount} appointments as deleted`);
    }
  } finally {
    client.release();
    console.timeEnd("syncAppointments");
  }
}

async function syncPaymentOrders() {
  console.time("syncPaymentOrders");
  const client = await pool.connect();
  let page = 1;
  let nextUrl = "/payment-orders/?page_size=100";

  try {
    while (nextUrl) {
      logger.info(`[syncPaymentOrders] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await limitedGet(nextUrl);

      const ids = data.results.map((po) => po.id);
      const { rows: locals } = await client.query(
        `SELECT id, remote_last_updated
           FROM payment_orders
          WHERE id = ANY($1)`,
        [ids]
      );
      const localMap = new Map(
        locals.map((r) => [r.id, r.remote_last_updated])
      );

      for (const po of data.results) {
        await client.query(
          `INSERT INTO payment_orders
             (id, display_id, date_sent, date_paid, date_void, amount,
              payee_id, payee_first, payee_last, payee_email, payee_role_type,
              status, still_to_pay, url, fetched_at, remote_last_updated)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$15)
           ON CONFLICT (id) DO UPDATE SET
             display_id         = EXCLUDED.display_id,
             date_sent          = EXCLUDED.date_sent,
             date_paid          = EXCLUDED.date_paid,
             date_void          = EXCLUDED.date_void,
             amount             = EXCLUDED.amount,
             payee_id           = EXCLUDED.payee_id,
             payee_first        = EXCLUDED.payee_first,
             payee_last         = EXCLUDED.payee_last,
             payee_email        = EXCLUDED.payee_email,
             payee_role_type    = EXCLUDED.payee_role_type,
             status             = EXCLUDED.status,
             still_to_pay       = EXCLUDED.still_to_pay,
             url                = EXCLUDED.url,
             fetched_at         = NOW(),
             remote_last_updated= EXCLUDED.remote_last_updated;`,
          [
            po.id,
            po.display_id,
            po.date_sent,
            po.date_paid || null,
            po.date_void || null,
            parseFloat(po.amount),
            po.payee?.id || null,
            po.payee?.first_name || '',
            po.payee?.last_name || '',
            po.payee?.email || '',
            po.payee?.role_type || null,
            po.status,
            parseFloat(po.still_to_pay || 0),
            po.url,
            po.last_updated,
          ]
        );

        const localUpdated = localMap.get(po.id);
        if (!localUpdated || new Date(po.last_updated) > localUpdated) {
          logger.info(`[syncPaymentOrders]   ↳ detail ${po.id}`);
          const { data: full } = await limitedGet(`/payment-orders/${po.id}/`);

          // Update payment order with full charges JSONB
          await client.query(
            `UPDATE payment_orders 
             SET charges = $1::jsonb
             WHERE id = $2`,
            [JSON.stringify(full.charges || []), po.id]
          );

          await client.query(
            `DELETE FROM payment_order_charges WHERE payment_order_id = $1`,
            [po.id]
          );
          
          for (let i = 0; i < full.charges.length; i++) {
            const c = full.charges[i];
            
            // Extract appointment details
            const appointment = c.appointment || null;
            const appointmentTopic = appointment?.topic || null;
            const appointmentStart = appointment?.start || null;
            const appointmentFinish = appointment?.finish || null;
            const appointmentStatus = appointment?.status || null;
            const serviceId = appointment?.service?.id || null;
            const serviceName = appointment?.service?.name || null;
            
            // Extract adhoc charge details
            const adhocCharge = c.adhoc_charge || null;
            const adhocChargeDescription = adhocCharge?.description || null;
            const adhocChargeDateOccurred = adhocCharge?.date_occurred || null;
            const adhocChargeCategoryId = adhocCharge?.category_id || null;
            const adhocChargeCategoryName = adhocCharge?.category_name || null;
            const adhocChargePayContractor = adhocCharge?.pay_contractor ? parseFloat(adhocCharge.pay_contractor) : null;
            const adhocChargeClientCost = adhocCharge?.client_cost ? parseFloat(adhocCharge.client_cost) : null;
            
            // Extract payee details
            const payee = c.payee || null;
            const payeeFirstName = payee?.first_name || null;
            const payeeLastName = payee?.last_name || null;
            const payeeEmail = payee?.email || null;
            const payeeRoleType = payee?.role_type || null;
            
            await client.query(
              `INSERT INTO payment_order_charges
                 (payment_order_id, charge_index, adhoc_charge_id,
                  appointment_id, date, amount, rate, sales_code,
                  tax_amount, units, payer, payee_id,
                  appointment_topic, appointment_start, appointment_finish, appointment_status,
                  service_id, service_name,
                  adhoc_charge_description, adhoc_charge_date_occurred,
                  adhoc_charge_category_id, adhoc_charge_category_name,
                  adhoc_charge_pay_contractor, adhoc_charge_client_cost,
                  payee_first_name, payee_last_name, payee_email, payee_role_type,
                  charge_details)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29::jsonb)`,
              [
                po.id,
                i,
                adhocCharge?.id || null,
                appointment?.id || null,
                c.date,
                parseFloat(c.amount),
                parseFloat(c.rate),
                c.sales_code,
                parseFloat(c.tax_amount),
                parseFloat(c.units),
                c.payer,
                payee?.id || null,
                appointmentTopic,
                appointmentStart,
                appointmentFinish,
                appointmentStatus,
                serviceId,
                serviceName,
                adhocChargeDescription,
                adhocChargeDateOccurred,
                adhocChargeCategoryId,
                adhocChargeCategoryName,
                adhocChargePayContractor,
                adhocChargeClientCost,
                payeeFirstName,
                payeeLastName,
                payeeEmail,
                payeeRoleType,
                JSON.stringify(c), // Store full charge object as JSONB
              ]
            );
          }
        }
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    logger.info(`[syncPaymentOrders]  All payment‑orders synced`);
  } finally {
    client.release();
    console.timeEnd("syncPaymentOrders");
  }
}

async function syncClients() {
  console.time("syncClients");
  const client = await pool.connect();
  let page = 1;
  let nextUrl = "/clients/?page_size=100";

  try {
    // Check for missing columns and add them if needed (cached)
    const allExpectedCols = ['remote_last_updated', 'pipeline_stage_name', 'paid_recipients', 'labels', 'photo', 'timezone', 'received_notifications', 'extra_attrs', 'associated_agent_id', 'associated_agent_name', 'state', 'pipeline_stage_colour', 'pipeline_stage_sort_index'];
    const foundCols = await columnsExist(client, 'clients', allExpectedCols);
    const existingColumns = new Set(foundCols);

    // Add all missing columns
    const columnsToAdd = [
      { name: 'remote_last_updated', type: 'TIMESTAMPTZ' },
      { name: 'pipeline_stage_name', type: 'VARCHAR(255)' },
      { name: 'pipeline_stage_colour', type: 'VARCHAR(50)' },
      { name: 'pipeline_stage_sort_index', type: 'INTEGER' },
      { name: 'paid_recipients', type: 'JSONB' },
      { name: 'labels', type: 'JSONB' },
      { name: 'photo', type: 'TEXT' },
      { name: 'timezone', type: 'TEXT' },
      { name: 'received_notifications', type: 'JSONB' },
      { name: 'extra_attrs', type: 'JSONB' },
      { name: 'associated_agent_id', type: 'INTEGER' },
      { name: 'associated_agent_name', type: 'TEXT' },
      { name: 'state', type: 'VARCHAR(50)' },
    ];

    for (const col of columnsToAdd) {
      if (!existingColumns.has(col.name)) {
        logger.info(`[syncClients] ⚙️ Adding ${col.name} column to clients table`);
        await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      }
    }

    while (nextUrl) {
      logger.info(`[syncClients] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await limitedGet(nextUrl);

      const ids = data.results.map((c) => c.id);
      const { rows: locals } = await client.query(
        `SELECT client_id, remote_last_updated
           FROM clients
          WHERE client_id = ANY($1)`,
        [ids]
      );
      // Convert client_id strings to integers for consistent comparison with TC API ids (which are integers)
      const localMap = new Map(
        locals.map((r) => [parseInt(r.client_id, 10), r.remote_last_updated])
      );

      for (let cli of data.results) {
        // Check if this is a NEW client (not in our local database)
        const isNewClient = !localMap.has(cli.id);

        // For NEW clients, fetch full details to get labels and other missing fields
        // The list endpoint doesn't include: labels, phone, mobile, received_notifications, etc.
        if (isNewClient) {
          try {
            logger.info(`[syncClients]   🆕 New client ${cli.id} (${cli.first_name} ${cli.last_name}) - fetching full details`);
            const { data: fullClient } = await rateLimitRetry(() => limitedGet(`/clients/${cli.id}/`));
            cli = fullClient; // Replace list data with full details
          } catch (fetchErr) {
            logger.error({ error: fetchErr.message }, `[syncClients]   ⚠️ Failed to fetch details for new client ${cli.id}:`);
            // Continue with list data if fetch fails
          }
        }

        // Check which fields are actually present in the API response
        // The list endpoint doesn't include: labels, phone, mobile, received_notifications,
        // paid_recipients, extra_attrs, photo, timezone, and sometimes address fields
        // Use 'in' operator to check if field exists in the response (distinguishes undefined from null)
        const hasLabels = 'labels' in cli;
        const hasPhone = 'phone' in cli;
        const hasMobile = 'mobile' in cli;
        const hasStreet = 'street' in cli;
        const hasTown = 'town' in cli;
        const hasCountry = 'country' in cli;
        const hasPostcode = 'postcode' in cli;
        const hasPhoto = 'photo' in cli;
        const hasTimezone = 'timezone' in cli;
        const hasReceivedNotifications = 'received_notifications' in cli;
        const hasPaidRecipients = 'paid_recipients' in cli;
        const hasExtraAttrs = 'extra_attrs' in cli;
        // Check if pipeline_stage exists and has an id (pipeline stage data is in the response)
        const hasPipelineStage = cli.pipeline_stage !== undefined && 
                                  cli.pipeline_stage !== null && 
                                  cli.pipeline_stage.id !== undefined && 
                                  cli.pipeline_stage.id !== null;
        // Check if status exists in the API response and is a valid value
        // Only update status if it's present in the API response AND is valid
        const hasStatus = 'status' in cli && 
                          cli.status !== null && 
                          cli.status !== undefined && 
                          ['prospect', 'live', 'dormant'].includes(cli.status);
        
        await client.query(
          `INSERT INTO clients
             (client_id, title, first_name, last_name, email, mobile, phone,
              street, town, country, postcode, latitude, longitude, status,
              is_taxable, charge_via_branch, invoices_count, payment_pending,
              auto_charge, associated_admin_id, calendar_colour, invoice_balance,
              available_balance, pipeline_stage_id, pipeline_stage_name, labels, photo, timezone,
              received_notifications, paid_recipients, extra_attrs,
              associated_agent_id, associated_agent_name, state, created_at, updated_at,
              tc_created_at, remote_last_updated)
           VALUES
             ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38)
           ON CONFLICT (client_id) DO UPDATE SET
             title                = EXCLUDED.title,
             first_name           = EXCLUDED.first_name,
             last_name            = EXCLUDED.last_name,
             email                = EXCLUDED.email,
             mobile               = CASE WHEN $39 THEN EXCLUDED.mobile ELSE clients.mobile END,
             phone                = CASE WHEN $40 THEN EXCLUDED.phone ELSE clients.phone END,
             street               = CASE WHEN $41 THEN EXCLUDED.street ELSE clients.street END,
             town                 = CASE WHEN $42 THEN EXCLUDED.town ELSE clients.town END,
             country              = CASE WHEN $43 THEN EXCLUDED.country ELSE clients.country END,
             postcode             = CASE WHEN $44 THEN EXCLUDED.postcode ELSE clients.postcode END,
             latitude             = EXCLUDED.latitude,
             longitude            = EXCLUDED.longitude,
             status               = CASE 
                                       WHEN $52 THEN EXCLUDED.status
                                       ELSE clients.status
                                     END,
             is_taxable           = EXCLUDED.is_taxable,
             charge_via_branch    = EXCLUDED.charge_via_branch,
             invoices_count       = EXCLUDED.invoices_count,
             payment_pending      = EXCLUDED.payment_pending,
             auto_charge          = EXCLUDED.auto_charge,
             associated_admin_id  = EXCLUDED.associated_admin_id,
             calendar_colour      = EXCLUDED.calendar_colour,
             invoice_balance      = EXCLUDED.invoice_balance,
             available_balance    = EXCLUDED.available_balance,
             pipeline_stage_id    = CASE WHEN $51 THEN EXCLUDED.pipeline_stage_id ELSE clients.pipeline_stage_id END,
             pipeline_stage_name  = CASE WHEN $51 THEN EXCLUDED.pipeline_stage_name ELSE clients.pipeline_stage_name END,
             labels               = CASE WHEN $45 THEN EXCLUDED.labels ELSE clients.labels END,
             photo                = CASE WHEN $46 THEN EXCLUDED.photo ELSE clients.photo END,
             timezone             = CASE WHEN $47 THEN EXCLUDED.timezone ELSE clients.timezone END,
             received_notifications = CASE WHEN $48 THEN EXCLUDED.received_notifications ELSE clients.received_notifications END,
             paid_recipients      = CASE WHEN $49 THEN EXCLUDED.paid_recipients ELSE clients.paid_recipients END,
             extra_attrs          = CASE WHEN $50 THEN EXCLUDED.extra_attrs ELSE clients.extra_attrs END,
             associated_agent_id  = EXCLUDED.associated_agent_id,
             associated_agent_name = EXCLUDED.associated_agent_name,
             state                 = EXCLUDED.state,
             updated_at           = NOW(),
             tc_created_at        = COALESCE(EXCLUDED.tc_created_at, clients.tc_created_at),
             remote_last_updated  = EXCLUDED.remote_last_updated;`,
          [
            cli.id,
            cli.title || null,
            cli.first_name,
            cli.last_name,
            cli.email,
            cli.mobile || null,
            cli.phone || null,
            cli.street || null,
            cli.town || null,
            cli.country || null,
            cli.postcode || null,
            cli.latitude ? parseFloat(cli.latitude) : null,
            cli.longitude ? parseFloat(cli.longitude) : null,
            // For new records, default to 'prospect' if status is not provided
            // For existing records, the UPDATE clause will preserve existing status if hasStatus is false
            hasStatus ? cli.status : 'prospect',
            cli.is_taxable || false,
            cli.charge_via_branch || false,
            cli.invoices_count || 0,
            cli.payment_pending ? parseFloat(cli.payment_pending) : null,
            cli.auto_charge || false,
            cli.associated_admin?.id || null,
            cli.calendar_colour || null,
            cli.invoice_balance ? parseFloat(cli.invoice_balance) : null,
            cli.available_balance ? parseFloat(cli.available_balance) : null,
            cli.pipeline_stage?.id || null,
            cli.pipeline_stage?.name || null,
            cli.labels ? JSON.stringify(cli.labels) : null,
            cli.photo || null,
            cli.timezone || null,
            cli.received_notifications ? JSON.stringify(cli.received_notifications) : null,
            cli.paid_recipients ? JSON.stringify(cli.paid_recipients) : null,
            cli.extra_attrs ? JSON.stringify(cli.extra_attrs) : null,
            cli.associated_agent?.id || null,
            cli.associated_agent ? `${cli.associated_agent.first_name} ${cli.associated_agent.last_name}` : null,
            cli.state || null,
            new Date(), // created_at
            new Date(), // updated_at
            cli.date_created,
            cli.last_updated,
            // Flags for preserving existing data
            hasMobile,
            hasPhone,
            hasStreet,
            hasTown,
            hasCountry,
            hasPostcode,
            hasLabels,
            hasPhoto,
            hasTimezone,
            hasReceivedNotifications,
            hasPaidRecipients,
            hasExtraAttrs,
            hasPipelineStage,
            hasStatus, // Flag for conditionally updating status
          ]
        );

        const localUpdated = localMap.get(cli.id);
        if (!localUpdated || new Date(cli.last_updated) > localUpdated) {
          logger.info(`[syncClients]   ↳ detail ${cli.id}`);
        }
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    logger.info(`[syncClients]  All clients synced`);
  } finally {
    client.release();
    console.timeEnd("syncClients");
  }
}

/**
 * Complete client sync that fetches FULL DETAILS for every client from TutorCruncher.
 * This is slower but captures ALL data including:
 * - status (live, prospect, dormant)
 * - pipeline_stage (id, name, colour, sort_index)
 * - labels, extra_attrs, paid_recipients
 * - All contact and address info
 * 
 * Use this sync for the Client Conversion Tracker to ensure accurate pipeline data.
 */
async function syncClientsComplete() {
  console.time("syncClientsComplete");
  const client = await pool.connect();
  let page = 1;
  let nextUrl = "/clients/?page_size=100";
  let totalSynced = 0;
  let totalClients = 0;
  
  const stats = {
    total: 0,
    synced: 0,
    prospects: 0,
    live: 0,
    dormant: 0,
    errors: 0,
    pipelineStages: {}
  };

  try {
    // Check for missing columns and add them if needed (cached)
    const allExpectedCols2 = ['remote_last_updated', 'pipeline_stage_name', 'pipeline_stage_colour', 'pipeline_stage_sort_index', 'paid_recipients', 'labels', 'photo', 'timezone', 'received_notifications', 'extra_attrs', 'associated_agent_id', 'associated_agent_name', 'state'];
    const foundCols2 = await columnsExist(client, 'clients', allExpectedCols2);
    const existingColumns = new Set(foundCols2);

    // Add all missing columns
    const columnsToAdd = [
      { name: 'remote_last_updated', type: 'TIMESTAMPTZ' },
      { name: 'pipeline_stage_name', type: 'VARCHAR(255)' },
      { name: 'pipeline_stage_colour', type: 'VARCHAR(50)' },
      { name: 'pipeline_stage_sort_index', type: 'INTEGER' },
      { name: 'paid_recipients', type: 'JSONB' },
      { name: 'labels', type: 'JSONB' },
      { name: 'photo', type: 'TEXT' },
      { name: 'timezone', type: 'TEXT' },
      { name: 'received_notifications', type: 'JSONB' },
      { name: 'extra_attrs', type: 'JSONB' },
      { name: 'associated_agent_id', type: 'INTEGER' },
      { name: 'associated_agent_name', type: 'TEXT' },
      { name: 'state', type: 'VARCHAR(50)' },
    ];

    for (const col of columnsToAdd) {
      if (!existingColumns.has(col.name)) {
        logger.info(`[syncClientsComplete] ⚙️ Adding ${col.name} column to clients table`);
        await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      }
    }

    // First, count total clients
    logger.info(`[syncClientsComplete] 📊 Counting total clients...`);
    const { data: firstPage } = await limitedGet("/clients/?page_size=1");
    totalClients = firstPage.count;
    stats.total = totalClients;
    logger.info(`[syncClientsComplete] 📊 Total clients in TutorCruncher: ${totalClients}`);

    while (nextUrl) {
      logger.info(`[syncClientsComplete] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await limitedGet(nextUrl);

      // Process each client - fetch full details
      const batchSize = 5; // Process 5 clients at a time
      for (let i = 0; i < data.results.length; i += batchSize) {
        const batch = data.results.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (listClient) => {
          try {
            // Fetch full client details from the detail endpoint
            const { data: cli } = await rateLimitRetry(() => 
              limitedGet(`/clients/${listClient.id}/`)
            );
            
            // Track statistics
            stats.synced++;
            if (cli.status === 'prospect') stats.prospects++;
            else if (cli.status === 'live') stats.live++;
            else if (cli.status === 'dormant') stats.dormant++;
            
            // Track pipeline stage distribution
            const stageName = cli.pipeline_stage?.name || 'No Stage';
            stats.pipelineStages[stageName] = (stats.pipelineStages[stageName] || 0) + 1;

            // Now we have FULL details - all fields are available
            await client.query(
              `INSERT INTO clients
                 (client_id, title, first_name, last_name, email, mobile, phone,
                  street, town, country, postcode, latitude, longitude, status,
                  is_taxable, charge_via_branch, invoices_count, payment_pending,
                  auto_charge, associated_admin_id, calendar_colour, invoice_balance,
                  available_balance, pipeline_stage_id, pipeline_stage_name, 
                  pipeline_stage_colour, pipeline_stage_sort_index,
                  labels, photo, timezone,
                  received_notifications, paid_recipients, extra_attrs,
                  associated_agent_id, associated_agent_name, state, created_at, updated_at,
                  tc_created_at, remote_last_updated)
               VALUES
                 ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40)
               ON CONFLICT (client_id) DO UPDATE SET
                 title                = EXCLUDED.title,
                 first_name           = EXCLUDED.first_name,
                 last_name            = EXCLUDED.last_name,
                 email                = EXCLUDED.email,
                 mobile               = EXCLUDED.mobile,
                 phone                = EXCLUDED.phone,
                 street               = EXCLUDED.street,
                 town                 = EXCLUDED.town,
                 country              = EXCLUDED.country,
                 postcode             = EXCLUDED.postcode,
                 latitude             = EXCLUDED.latitude,
                 longitude            = EXCLUDED.longitude,
                 status               = EXCLUDED.status,
                 is_taxable           = EXCLUDED.is_taxable,
                 charge_via_branch    = EXCLUDED.charge_via_branch,
                 invoices_count       = EXCLUDED.invoices_count,
                 payment_pending      = EXCLUDED.payment_pending,
                 auto_charge          = EXCLUDED.auto_charge,
                 associated_admin_id  = EXCLUDED.associated_admin_id,
                 calendar_colour      = EXCLUDED.calendar_colour,
                 invoice_balance      = EXCLUDED.invoice_balance,
                 available_balance    = EXCLUDED.available_balance,
                 pipeline_stage_id    = EXCLUDED.pipeline_stage_id,
                 pipeline_stage_name  = EXCLUDED.pipeline_stage_name,
                 pipeline_stage_colour = EXCLUDED.pipeline_stage_colour,
                 pipeline_stage_sort_index = EXCLUDED.pipeline_stage_sort_index,
                 labels               = EXCLUDED.labels,
                 photo                = EXCLUDED.photo,
                 timezone             = EXCLUDED.timezone,
                 received_notifications = EXCLUDED.received_notifications,
                 paid_recipients      = EXCLUDED.paid_recipients,
                 extra_attrs          = EXCLUDED.extra_attrs,
                 associated_agent_id  = EXCLUDED.associated_agent_id,
                 associated_agent_name = EXCLUDED.associated_agent_name,
                 state                = EXCLUDED.state,
                 updated_at           = NOW(),
                 tc_created_at        = COALESCE(EXCLUDED.tc_created_at, clients.tc_created_at),
                 remote_last_updated  = EXCLUDED.remote_last_updated;`,
              [
                cli.id,
                cli.title || null,
                cli.first_name,
                cli.last_name,
                cli.email,
                cli.mobile || null,
                cli.phone || null,
                cli.street || null,
                cli.town || null,
                cli.country || null,
                cli.postcode || null,
                cli.latitude ? parseFloat(cli.latitude) : null,
                cli.longitude ? parseFloat(cli.longitude) : null,
                cli.status || 'prospect',
                cli.is_taxable || false,
                cli.charge_via_branch || false,
                cli.invoices_count || 0,
                cli.payment_pending ? parseFloat(cli.payment_pending) : null,
                cli.auto_charge || false,
                cli.associated_admin?.id || null,
                cli.calendar_colour || null,
                cli.invoice_balance ? parseFloat(cli.invoice_balance) : null,
                cli.available_balance ? parseFloat(cli.available_balance) : null,
                cli.pipeline_stage?.id || null,
                cli.pipeline_stage?.name || null,
                cli.pipeline_stage?.colour || null,
                cli.pipeline_stage?.sort_index || null,
                cli.labels ? JSON.stringify(cli.labels) : null,
                cli.photo || null,
                cli.timezone || null,
                cli.received_notifications ? JSON.stringify(cli.received_notifications) : null,
                cli.paid_recipients ? JSON.stringify(cli.paid_recipients) : null,
                cli.extra_attrs ? JSON.stringify(cli.extra_attrs) : null,
                cli.associated_agent?.id || null,
                cli.associated_agent ? `${cli.associated_agent.first_name} ${cli.associated_agent.last_name}` : null,
                cli.state || null,
                new Date(), // created_at
                new Date(), // updated_at
                cli.date_created,
                cli.last_updated,
              ]
            );

            totalSynced++;
            
            // Log progress for every 50 clients
            if (totalSynced % 50 === 0) {
              logger.info(`[syncClientsComplete] 📊 Progress: ${totalSynced}/${totalClients} (${Math.round(totalSynced/totalClients*100)}%)`);
            }
          } catch (err) {
            stats.errors++;
            logger.error({ error: err.message }, `[syncClientsComplete] ❌ Error syncing client ${listClient.id}:`);
          }
        }));
        
        // Small delay between batches to avoid rate limiting
        await delay(100);
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    // Print final statistics
    logger.info('\n' + '='.repeat(60));
    logger.info('[syncClientsComplete] 📊 COMPLETE CLIENT SYNC FINISHED');
    logger.info('='.repeat(60));
    logger.info(`Total Clients:     ${stats.total}`);
    logger.info(`Successfully Synced: ${stats.synced}`);
    logger.info(`Errors:            ${stats.errors}`);
    logger.info('\n📈 Status Distribution:');
    logger.info(`  Prospects: ${stats.prospects}`);
    logger.info(`  Live: ${stats.live}`);
    logger.info(`  Dormant: ${stats.dormant}`);
    logger.info('\n📊 Pipeline Stage Distribution:');
    Object.entries(stats.pipelineStages)
      .sort((a, b) => b[1] - a[1])
      .forEach(([stageName, count]) => {
        logger.info(`  ${stageName}: ${count}`);
      });
    logger.info('='.repeat(60) + '\n');

  } finally {
    client.release();
    console.timeEnd("syncClientsComplete");
  }
  
  return stats;
}

// Helper function to infer service category from service labels
function inferServiceCategory(labels) {
  if (!labels || !Array.isArray(labels)) return 'other';

  for (const label of labels) {
    const labelLower = label.toLowerCase();
    if (labelLower.includes('home')) return 'home';
    if (labelLower.includes('online')) return 'online';
    if (labelLower.includes('school')) return 'schools';
    if (labelLower.includes('club') || labelLower.includes('park slope') || labelLower.includes('ues')) return 'retail';
  }
  return 'other';
}

// Sync adhoc charges
async function syncAdhocCharges() {
  console.time("syncAdhocCharges");
  const client = await pool.connect();
  let nextUrl = "/adhoccharges/?page_size=100";
  let page = 1;

  try {
    while (nextUrl) {
      logger.info(`[syncAdhocCharges] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await limitedGet(nextUrl);

      for (const charge of data.results) {
        const appointmentId = charge.appointment?.id || charge.appointment || null;
        const serviceId = charge.service?.id || charge.service || null;

        // Infer service_category for new charges
        let serviceCategory = 'other';

        // If there's an appointment_id, try to get service labels to infer category
        if (appointmentId) {
          try {
            const serviceResult = await client.query(`
              SELECT s.labels
              FROM appointments a
              JOIN services s ON a.service_id = s.service_id
              WHERE a.appointment_id = $1
            `, [appointmentId]);

            if (serviceResult.rows.length > 0 && serviceResult.rows[0].labels) {
              serviceCategory = inferServiceCategory(serviceResult.rows[0].labels);
            }
          } catch (err) {
            // If lookup fails, default to 'other'
            logger.warn(`[syncAdhocCharges] Could not infer category for charge ${charge.id}: ${err.message}`);
          }
        }

        await client.query(
          `INSERT INTO adhoc_charges (
            id, agent_id, appointment_id, category_id, category_name,
            client_id, contractor_id, contractor_first_name, contractor_last_name, contractor_email,
            creator_id, creator_first_name, creator_last_name, creator_email,
            currency, date_occurred, description, net_gross, pay_contractor,
            service_id, tax_amount, service_category, last_updated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
          ON CONFLICT (id) DO UPDATE SET
            agent_id = EXCLUDED.agent_id,
            appointment_id = EXCLUDED.appointment_id,
            category_id = EXCLUDED.category_id,
            category_name = EXCLUDED.category_name,
            client_id = EXCLUDED.client_id,
            contractor_id = EXCLUDED.contractor_id,
            contractor_first_name = EXCLUDED.contractor_first_name,
            contractor_last_name = EXCLUDED.contractor_last_name,
            contractor_email = EXCLUDED.contractor_email,
            creator_id = EXCLUDED.creator_id,
            creator_first_name = EXCLUDED.creator_first_name,
            creator_last_name = EXCLUDED.creator_last_name,
            creator_email = EXCLUDED.creator_email,
            currency = EXCLUDED.currency,
            date_occurred = EXCLUDED.date_occurred,
            description = EXCLUDED.description,
            net_gross = EXCLUDED.net_gross,
            pay_contractor = EXCLUDED.pay_contractor,
            service_id = EXCLUDED.service_id,
            tax_amount = EXCLUDED.tax_amount,
            service_category = COALESCE(adhoc_charges.service_category, EXCLUDED.service_category),
            last_updated = EXCLUDED.last_updated`,
          [
            charge.id,
            charge.agent || null,
            appointmentId,
            charge.category_id || null,
            charge.category_name || null,
            charge.client || null,
            charge.contractor?.id || null,
            charge.contractor?.first_name || null,
            charge.contractor?.last_name || null,
            charge.contractor?.email || null,
            charge.creator?.id || null,
            charge.creator?.first_name || null,
            charge.creator?.last_name || null,
            charge.creator?.email || null,
            charge.currency || 'USD',
            charge.date_occurred || null,
            charge.description || null,
            charge.net_gross || null,
            charge.pay_contractor || null,
            serviceId,
            charge.tax_amount ? parseFloat(charge.tax_amount) : null,
            serviceCategory
          ]
        );
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    logger.info(`[syncAdhocCharges] All adhoc charges synced`);
  } finally {
    client.release();
    console.timeEnd("syncAdhocCharges");
  }
}

// Sync adhoc charge categories
async function syncAdhocChargeCategories() {
  console.time("syncAdhocChargeCategories");
  const client = await pool.connect();
  let nextUrl = "/ahc-categories/?page_size=100";
  let page = 1;
  
  try {
    while (nextUrl) {
      logger.info(`[syncAdhocChargeCategories] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await limitedGet(nextUrl);

      for (const category of data.results) {
        await client.query(
          `INSERT INTO adhoc_charge_categories (
            id, name, branch_tax_setup, contractor_tax_setup,
            contractor_usable, default_description, default_pay_amount,
            default_charge_amount, dft_net_gross, last_updated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            branch_tax_setup = EXCLUDED.branch_tax_setup,
            contractor_tax_setup = EXCLUDED.contractor_tax_setup,
            contractor_usable = EXCLUDED.contractor_usable,
            default_description = EXCLUDED.default_description,
            default_pay_amount = EXCLUDED.default_pay_amount,
            default_charge_amount = EXCLUDED.default_charge_amount,
            dft_net_gross = EXCLUDED.dft_net_gross,
            last_updated = EXCLUDED.last_updated
          `,
          [
            category.id,
            category.name,
            category.branch_tax_setup || null,
            category.contractor_tax_setup || null,
            category.contractor_usable || false,
            category.default_description || null,
            category.default_pay_amount ? parseFloat(category.default_pay_amount) : null,
            category.default_charge_amount ? parseFloat(category.default_charge_amount) : null,
            category.dft_net_gross || null
          ]
        );
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    logger.info(`[syncAdhocChargeCategories] All adhoc charge categories synced`);
  } finally {
    client.release();
    console.timeEnd("syncAdhocChargeCategories");
  }
}

// Sync contractors
async function syncContractors() {
  console.time("syncContractors");
  const client = await pool.connect();
  let nextUrl = "/contractors/?page_size=100";
  let page = 1;
  
  try {
    while (nextUrl) {
      logger.info(`[syncContractors] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await limitedGet(nextUrl);

      for (const contractor of data.results) {
        // TC list endpoint does NOT include status — fetch detail for new contractors
        // Check if contractor already exists
        const existing = await client.query(
          'SELECT contractor_id, status FROM contractors WHERE contractor_id = $1',
          [contractor.id]
        );

        if (existing.rows.length > 0) {
          // Existing contractor — update basic fields from list data
          await client.query(
            `UPDATE contractors SET
               first_name = $2, last_name = $3, email = $4,
               updated_at = NOW()
             WHERE contractor_id = $1`,
            [contractor.id, contractor.first_name, contractor.last_name, contractor.email]
          );
          // For pending contractors, fetch detail to check if status changed
          if (existing.rows[0].status === 'pending') {
            try {
              const { data: full } = await limitedGet(`/contractors/${contractor.id}/`);
              if (full.status && full.status !== 'pending') {
                await client.query(
                  'UPDATE contractors SET status = $2, updated_at = NOW() WHERE contractor_id = $1',
                  [contractor.id, full.status]
                );
                logger.info(`[syncContractors] Status updated: ${contractor.id} -> ${full.status}`);
              }
            } catch (statusErr) {
              logger.error({ error: statusErr.message }, `[syncContractors] Failed to check status for ${contractor.id}:`);
            }
          }
        } else {
          // New contractor — fetch detail endpoint for full data including status
          try {
            const { data: full } = await limitedGet(`/contractors/${contractor.id}/`);
            await client.query(
              `INSERT INTO contractors (
                contractor_id, first_name, last_name, email, mobile, phone,
                street, state, town, country, postcode, timezone, title, photo,
                status, default_rate, latitude, longitude, date_created,
                qualifications, skills, institutions, labels, extra_attrs,
                review_rating, calendar_colour, work_done_details,
                created_at, updated_at
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,NOW(),NOW())
              ON CONFLICT (contractor_id) DO NOTHING`,
              [
                full.id, full.first_name, full.last_name, full.email,
                full.mobile || null, full.phone || null,
                full.street || null, full.state || null, full.town || null,
                full.country || null, full.postcode || null, full.timezone || null,
                full.title || null, full.photo || null,
                full.status || 'pending',
                full.default_rate ? parseFloat(full.default_rate) : null,
                full.latitude ? parseFloat(full.latitude) : null,
                full.longitude ? parseFloat(full.longitude) : null,
                full.date_created ? new Date(full.date_created) : null,
                JSON.stringify(full.qualifications || []),
                JSON.stringify(full.skills || []),
                JSON.stringify(full.institutions || []),
                JSON.stringify(full.labels || []),
                JSON.stringify(full.extra_attrs || []),
                full.review_rating ? parseFloat(full.review_rating) : null,
                full.calendar_colour || null,
                JSON.stringify(full.work_done_details || {})
              ]
            );
          } catch (detailErr) {
            logger.error({ error: detailErr.message }, `[syncContractors] Failed to fetch detail for ${contractor.id}:`);
            // Fallback: insert with list data only
            await client.query(
              `INSERT INTO contractors (contractor_id, first_name, last_name, email, status, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
               ON CONFLICT (contractor_id) DO NOTHING`,
              [contractor.id, contractor.first_name, contractor.last_name, contractor.email]
            );
          }
        }
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    logger.info(`[syncContractors] All contractors synced`);

    // Invalidate contractor caches
    await cache.clearCacheByPrefix('contractors');
  } finally {
    client.release();
    console.timeEnd("syncContractors");
  }
}

// Sync proforma invoices
async function syncProformaInvoices() {
  console.time("syncProformaInvoices");
  const client = await pool.connect();
  let nextUrl = '/proforma-invoices/';
  let page = 1;
  
  try {
    while (nextUrl) {
      logger.info(`[syncProformaInvoices] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await limitedGet(nextUrl);

      for (const pfi of data.results) {
        await client.query(
          `INSERT INTO proforma_invoices (
            id, display_id, description, amount, date_sent, date_paid,
            client_id, client_first_name, client_last_name, client_email,
            status, still_to_pay, url, fetched_at, remote_last_updated, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            display_id = EXCLUDED.display_id,
            description = EXCLUDED.description,
            amount = EXCLUDED.amount,
            date_sent = EXCLUDED.date_sent,
            date_paid = EXCLUDED.date_paid,
            client_id = EXCLUDED.client_id,
            client_first_name = EXCLUDED.client_first_name,
            client_last_name = EXCLUDED.client_last_name,
            client_email = EXCLUDED.client_email,
            status = EXCLUDED.status,
            still_to_pay = EXCLUDED.still_to_pay,
            url = EXCLUDED.url,
            fetched_at = NOW(),
            remote_last_updated = EXCLUDED.remote_last_updated,
            updated_at = NOW()`,
          [
            pfi.id,
            pfi.display_id || `PFI-${pfi.id}`,
            pfi.description || null,
            pfi.amount ? parseFloat(pfi.amount) : null,
            pfi.date_sent || null,
            pfi.date_paid || null,
            pfi.client?.id || null,
            pfi.client?.first_name || null,
            pfi.client?.last_name || null,
            pfi.client?.email || null,
            pfi.status || null,
            pfi.still_to_pay ? parseFloat(pfi.still_to_pay) : 0,
            pfi.url || null,
            pfi.last_updated || new Date()
          ]
        );
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    logger.info(`[syncProformaInvoices] All proforma invoices synced`);
  } finally {
    client.release();
    console.timeEnd("syncProformaInvoices");
  }
}

// Sync recipients (students)
async function syncRecipients() {
  console.time("syncRecipients");
  const client = await pool.connect();
  let nextUrl = "/recipients/?page_size=100";
  let page = 1;
  
  try {
    while (nextUrl) {
      logger.info(`[syncRecipients] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await limitedGet(nextUrl);

      for (const recipient of data.results) {
        await client.query(
          `INSERT INTO recipients (
            recipient_id, first_name, last_name, email, mobile, phone,
            street, town, country, postcode, latitude, longitude,
            academic_year, calendar_colour, last_updated, created_at, updated_at, client_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), $17)
          ON CONFLICT (recipient_id) DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            email = EXCLUDED.email,
            mobile = EXCLUDED.mobile,
            phone = EXCLUDED.phone,
            street = EXCLUDED.street,
            town = EXCLUDED.town,
            country = EXCLUDED.country,
            postcode = EXCLUDED.postcode,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            academic_year = EXCLUDED.academic_year,
            calendar_colour = EXCLUDED.calendar_colour,
            last_updated = EXCLUDED.last_updated,
            updated_at = NOW(),
            client_id = EXCLUDED.client_id`,
          [
            recipient.id,
            recipient.first_name || null,
            recipient.last_name || null,
            recipient.email || null,
            recipient.mobile || null,
            recipient.phone || null,
            recipient.street || null,
            recipient.town || null,
            recipient.country || null,
            recipient.postcode || null,
            recipient.latitude || null,
            recipient.longitude || null,
            recipient.academic_year || null,
            recipient.calendar_colour || null,
            recipient.last_updated || null,
            recipient.date_created || null,
            recipient.client || null
          ]
        );
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    logger.info(`[syncRecipients] All recipients synced`);
  } finally {
    client.release();
    console.timeEnd("syncRecipients");
  }
}

// Sync reviews
async function syncReviews() {
  console.time("syncReviews");
  const client = await pool.connect();
  let nextUrl = "/reviews/?page_size=100";
  let page = 1;
  
  try {
    while (nextUrl) {
      logger.info(`[syncReviews] ⏳ Page ${page}: ${nextUrl}`);
      const { data } = await limitedGet(nextUrl);

      for (const review of data.results) {
        await client.query(
          `INSERT INTO reviews (
            review_id, client_id, client_name, contractor_id, contractor_name,
            extra_attrs_value, star_rating_value, date_created
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (review_id) DO UPDATE SET
            client_id = EXCLUDED.client_id,
            client_name = EXCLUDED.client_name,
            contractor_id = EXCLUDED.contractor_id,
            contractor_name = EXCLUDED.contractor_name,
            extra_attrs_value = EXCLUDED.extra_attrs_value,
            star_rating_value = EXCLUDED.star_rating_value,
            date_created = EXCLUDED.date_created`,
          [
            review.id,
            review.client?.id || null,
            review.client ? `${review.client.first_name || ''} ${review.client.last_name || ''}`.trim() : null,
            review.contractor?.id || null,
            review.contractor ? `${review.contractor.first_name || ''} ${review.contractor.last_name || ''}`.trim() : null,
            review.extra_attrs ? JSON.stringify(review.extra_attrs) : null,
            review.star_rating || null,
            review.date_created || null
          ]
        );
      }

      nextUrl = data.next
        ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
        : null;
      page++;
    }

    logger.info(`[syncReviews] All reviews synced`);
  } finally {
    client.release();
    console.timeEnd("syncReviews");
  }
}

/**
 * Sync a single client from TutorCruncher to local database with full details
 * This is used immediately after creating a TC client to ensure the local record
 * exists with all fields (labels, pipeline_stage, etc.) before pipeline tracking runs
 *
 * @param {number} tcClientId - TutorCruncher client ID
 * @param {Object} optionalPool - Optional database pool (for use from routes)
 * @returns {Object} - { success: boolean, localId: number|null, error: string|null }
 */
async function syncSingleClient(tcClientId, optionalPool = null) {
  const dbPool = optionalPool || pool;
  const client = await dbPool.connect();

  try {
    logger.info(`[syncSingleClient] 🔄 Syncing client ${tcClientId} from TutorCruncher...`);

    // Fetch full client details from TutorCruncher
    const { data: cli } = await rateLimitRetry(() =>
      limitedGet(`/clients/${tcClientId}/`)
    );

    if (!cli || !cli.id) {
      throw new Error(`Client ${tcClientId} not found in TutorCruncher`);
    }

    logger.info(`[syncSingleClient] 📋 Got client: ${cli.first_name} ${cli.last_name} (${cli.email})`);
    logger.info(`[syncSingleClient] 📋 Labels: ${cli.labels ? JSON.stringify(cli.labels) : 'none'}`);
    logger.info(`[syncSingleClient] 📋 Pipeline stage: ${cli.pipeline_stage?.name || 'none'}`);

    // Upsert into local clients table with full details
    const result = await client.query(
      `INSERT INTO clients
         (client_id, title, first_name, last_name, email, mobile, phone,
          street, town, country, postcode, latitude, longitude, status,
          is_taxable, charge_via_branch, invoices_count, payment_pending,
          auto_charge, associated_admin_id, calendar_colour, invoice_balance,
          available_balance, pipeline_stage_id, pipeline_stage_name,
          pipeline_stage_colour, pipeline_stage_sort_index,
          labels, photo, timezone,
          received_notifications, paid_recipients, extra_attrs,
          associated_agent_id, associated_agent_name, state, created_at, updated_at,
          tc_created_at, remote_last_updated)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40)
       ON CONFLICT (client_id) DO UPDATE SET
         title                = EXCLUDED.title,
         first_name           = EXCLUDED.first_name,
         last_name            = EXCLUDED.last_name,
         email                = EXCLUDED.email,
         mobile               = EXCLUDED.mobile,
         phone                = EXCLUDED.phone,
         street               = EXCLUDED.street,
         town                 = EXCLUDED.town,
         country              = EXCLUDED.country,
         postcode             = EXCLUDED.postcode,
         latitude             = EXCLUDED.latitude,
         longitude            = EXCLUDED.longitude,
         status               = EXCLUDED.status,
         is_taxable           = EXCLUDED.is_taxable,
         charge_via_branch    = EXCLUDED.charge_via_branch,
         invoices_count       = EXCLUDED.invoices_count,
         payment_pending      = EXCLUDED.payment_pending,
         auto_charge          = EXCLUDED.auto_charge,
         associated_admin_id  = EXCLUDED.associated_admin_id,
         calendar_colour      = EXCLUDED.calendar_colour,
         invoice_balance      = EXCLUDED.invoice_balance,
         available_balance    = EXCLUDED.available_balance,
         pipeline_stage_id    = EXCLUDED.pipeline_stage_id,
         pipeline_stage_name  = EXCLUDED.pipeline_stage_name,
         pipeline_stage_colour = EXCLUDED.pipeline_stage_colour,
         pipeline_stage_sort_index = EXCLUDED.pipeline_stage_sort_index,
         labels               = EXCLUDED.labels,
         photo                = EXCLUDED.photo,
         timezone             = EXCLUDED.timezone,
         received_notifications = EXCLUDED.received_notifications,
         paid_recipients      = EXCLUDED.paid_recipients,
         extra_attrs          = EXCLUDED.extra_attrs,
         associated_agent_id  = EXCLUDED.associated_agent_id,
         associated_agent_name = EXCLUDED.associated_agent_name,
         state                = EXCLUDED.state,
         updated_at           = NOW(),
         tc_created_at        = COALESCE(EXCLUDED.tc_created_at, clients.tc_created_at),
         remote_last_updated  = EXCLUDED.remote_last_updated
       RETURNING id`,
      [
        cli.id,
        cli.title || null,
        cli.first_name,
        cli.last_name,
        cli.email,
        cli.mobile || null,
        cli.phone || null,
        cli.street || null,
        cli.town || null,
        cli.country || null,
        cli.postcode || null,
        cli.latitude ? parseFloat(cli.latitude) : null,
        cli.longitude ? parseFloat(cli.longitude) : null,
        cli.status || 'prospect',
        cli.is_taxable || false,
        cli.charge_via_branch || false,
        cli.invoices_count || 0,
        cli.payment_pending ? parseFloat(cli.payment_pending) : null,
        cli.auto_charge || false,
        cli.associated_admin?.id || null,
        cli.calendar_colour || null,
        cli.invoice_balance ? parseFloat(cli.invoice_balance) : null,
        cli.available_balance ? parseFloat(cli.available_balance) : null,
        cli.pipeline_stage?.id || null,
        cli.pipeline_stage?.name || null,
        cli.pipeline_stage?.colour || null,
        cli.pipeline_stage?.sort_index || null,
        cli.labels ? JSON.stringify(cli.labels) : null,
        cli.photo || null,
        cli.timezone || null,
        cli.received_notifications ? JSON.stringify(cli.received_notifications) : null,
        cli.paid_recipients ? JSON.stringify(cli.paid_recipients) : null,
        cli.extra_attrs ? JSON.stringify(cli.extra_attrs) : null,
        cli.associated_agent?.id || null,
        cli.associated_agent ? `${cli.associated_agent.first_name} ${cli.associated_agent.last_name}` : null,
        cli.state || null,
        new Date(), // created_at
        new Date(), // updated_at
        cli.date_created,
        cli.last_updated,
      ]
    );

    const localId = result.rows[0]?.id;
    logger.info(`[syncSingleClient] ✅ Client ${tcClientId} synced to local ID ${localId}`);

    return { success: true, localId, error: null };

  } catch (err) {
    logger.error({ error: err.message }, `[syncSingleClient] ❌ Error syncing client ${tcClientId}:`);
    return { success: false, localId: null, error: err.message };
  } finally {
    client.release();
  }
}

module.exports = {
  resyncAllAppointments: resyncAllAppointments,
  fetchAllPages: fetchAllPages,
  syncInvoices: syncInvoices,
  syncServices: syncServices,
  syncAppointments: syncAppointments,
  syncPaymentOrders: syncPaymentOrders,
  syncClients: syncClients,
  syncClientsComplete: syncClientsComplete, // Full client sync with individual detail fetches
  syncSingleClient: syncSingleClient, // Sync a single client with full details (used after TC client creation)
  syncAdhocCharges: syncAdhocCharges,
  syncContractors: syncContractors,
  syncProformaInvoices: syncProformaInvoices,
  syncAdhocChargeCategories: syncAdhocChargeCategories,
  syncRecipients: syncRecipients,
  syncReviews: syncReviews
};

// If running directly (not imported), execute the sync
if (require.main === module) {
  (async () => {
    try {
      logger.info('\n🚀 Starting full sync process...\n');
      
      await syncServices();
      await syncAppointments();
      await syncInvoices();
      await syncPaymentOrders();
      
      logger.info('\n✅ All syncs completed successfully!');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, '\n❌ Sync failed:');
      process.exit(1);
    }
  })();
}
