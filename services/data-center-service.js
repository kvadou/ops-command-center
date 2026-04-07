const { getOrSet } = require('../utils/cache');

// ─── Entity Configuration ──────────────────────────────────────────
// Single source of truth for all TC and historical entities in the Data Center.
// Column/table names are HARDCODED here — never from user input.
const ENTITY_CONFIG = {
  clients: {
    table: 'clients',
    label: 'Clients',
    pk: 'client_id',
    dateColumn: 'created_at',
    lastUpdatedColumn: 'updated_at',
    extraWhere: null,
    searchColumns: ['first_name', 'last_name', 'email', 'town', 'status'],
    category: 'tc',
    breakdownQuery: `SELECT status, COUNT(*)::int AS count FROM clients GROUP BY status ORDER BY count DESC LIMIT 5`,
    columns: [
      { key: 'client_id', label: 'Client ID', sortable: true, width: 100 },
      { key: 'first_name', label: 'First Name', sortable: true, width: 130 },
      { key: 'last_name', label: 'Last Name', sortable: true, width: 130 },
      { key: 'email', label: 'Email', sortable: true, width: 200 },
      { key: 'phone', label: 'Phone', sortable: false, width: 130 },
      { key: 'status', label: 'Status', sortable: true, width: 100 },
      { key: 'town', label: 'City', sortable: true, width: 120 },
      { key: 'state', label: 'State', sortable: true, width: 80 },
      { key: 'pipeline_stage_name', label: 'Pipeline Stage', sortable: true, width: 140 },
      { key: 'invoice_balance', label: 'Balance', sortable: true, width: 100 },
      { key: 'created_at', label: 'Created', sortable: true, width: 150, type: 'date' },
      { key: 'updated_at', label: 'Last Updated', sortable: true, width: 150, type: 'date' },
    ],
  },
  contractors: {
    table: 'contractors',
    label: 'Tutors',
    pk: 'contractor_id',
    dateColumn: 'date_created',
    lastUpdatedColumn: 'updated_at',
    extraWhere: null,
    searchColumns: ['first_name', 'last_name', 'email', 'town', 'status'],
    category: 'tc',
    breakdownQuery: `SELECT status, COUNT(*)::int AS count FROM contractors GROUP BY status ORDER BY count DESC LIMIT 5`,
    columns: [
      { key: 'contractor_id', label: 'Tutor ID', sortable: true, width: 100 },
      { key: 'first_name', label: 'First Name', sortable: true, width: 130 },
      { key: 'last_name', label: 'Last Name', sortable: true, width: 130 },
      { key: 'email', label: 'Email', sortable: true, width: 200 },
      { key: 'mobile', label: 'Mobile', sortable: false, width: 130 },
      { key: 'status', label: 'Status', sortable: true, width: 100 },
      { key: 'default_rate', label: 'Rate', sortable: true, width: 80 },
      { key: 'town', label: 'City', sortable: true, width: 120 },
      { key: 'review_rating', label: 'Rating', sortable: true, width: 80 },
      { key: 'date_created', label: 'Created', sortable: true, width: 150, type: 'date' },
      { key: 'updated_at', label: 'Last Updated', sortable: true, width: 150, type: 'date' },
    ],
  },
  services: {
    table: 'services',
    label: 'Jobs',
    pk: 'service_id',
    dateColumn: 'created_at',
    lastUpdatedColumn: 'updated_at',
    extraWhere: null,
    searchColumns: ['name', 'status'],
    category: 'tc',
    breakdownQuery: `SELECT status, COUNT(*)::int AS count FROM services GROUP BY status ORDER BY count DESC LIMIT 5`,
    columns: [
      { key: 'service_id', label: 'Service ID', sortable: true, width: 100 },
      { key: 'name', label: 'Name', sortable: true, width: 250 },
      { key: 'status', label: 'Status', sortable: true, width: 100 },
      { key: 'dft_charge_type', label: 'Charge Type', sortable: true, width: 120 },
      { key: 'dft_charge_rate', label: 'Charge Rate', sortable: true, width: 110 },
      { key: 'dft_contractor_rate', label: 'Tutor Rate', sortable: true, width: 110 },
      { key: 'labels', label: 'Labels', sortable: false, width: 200 },
      { key: 'created_at', label: 'Created', sortable: true, width: 150, type: 'date' },
      { key: 'updated_at', label: 'Last Updated', sortable: true, width: 150, type: 'date' },
    ],
  },
  appointments: {
    table: 'appointments',
    label: 'Lessons',
    pk: 'appointment_id',
    dateColumn: 'start',
    lastUpdatedColumn: 'updated_at',
    extraWhere: 'is_deleted = FALSE',
    searchColumns: ['topic', 'status'],
    category: 'tc',
    breakdownQuery: `SELECT status, COUNT(*)::int AS count FROM appointments WHERE is_deleted = FALSE GROUP BY status ORDER BY count DESC LIMIT 5`,
    linkColumns: { service_id: { entity: 'services', route: '/scheduling/jobs' } },
    columns: [
      { key: 'appointment_id', label: 'Lesson ID', sortable: true, width: 100 },
      { key: 'topic', label: 'Topic', sortable: true, width: 200 },
      { key: 'start', label: 'Start', sortable: true, width: 160, type: 'date' },
      { key: 'finish', label: 'Finish', sortable: true, width: 160, type: 'date' },
      { key: 'units', label: 'Hours', sortable: true, width: 80 },
      { key: 'status', label: 'Status', sortable: true, width: 110 },
      { key: 'charge_type', label: 'Charge Type', sortable: true, width: 120 },
      { key: 'service_id', label: 'Service ID', sortable: true, width: 100 },
      { key: 'updated_at', label: 'Last Updated', sortable: true, width: 150, type: 'date' },
    ],
  },
  invoices: {
    table: 'invoices',
    label: 'Invoices',
    pk: 'id',
    dateColumn: 'date_sent',
    lastUpdatedColumn: 'remote_last_updated',
    extraWhere: null,
    searchColumns: ['display_id', 'status'],
    category: 'tc',
    breakdownQuery: `SELECT status, COUNT(*)::int AS count FROM invoices GROUP BY status ORDER BY count DESC LIMIT 5`,
    linkColumns: { client_id: { entity: 'clients', route: '/people/clients' } },
    columns: [
      { key: 'id', label: 'Invoice ID', sortable: true, width: 100 },
      { key: 'display_id', label: 'Display ID', sortable: true, width: 120 },
      { key: 'client_id', label: 'Client ID', sortable: true, width: 100 },
      { key: 'gross', label: 'Gross', sortable: true, width: 100 },
      { key: 'net', label: 'Net', sortable: true, width: 100 },
      { key: 'tax', label: 'Tax', sortable: true, width: 80 },
      { key: 'status', label: 'Status', sortable: true, width: 110 },
      { key: 'date_sent', label: 'Date Sent', sortable: true, width: 150, type: 'date' },
      { key: 'date_paid', label: 'Date Paid', sortable: true, width: 150, type: 'date' },
      { key: 'remote_last_updated', label: 'Last Updated', sortable: true, width: 150, type: 'date' },
    ],
  },
  payment_orders: {
    table: 'payment_orders',
    label: 'Payments',
    pk: 'id',
    dateColumn: 'date_sent',
    lastUpdatedColumn: 'remote_last_updated',
    extraWhere: null,
    searchColumns: ['display_id', 'payee_first', 'payee_last', 'payee_email', 'status'],
    category: 'tc',
    breakdownQuery: `SELECT status, COUNT(*)::int AS count FROM payment_orders GROUP BY status ORDER BY count DESC LIMIT 5`,
    columns: [
      { key: 'id', label: 'Payment ID', sortable: true, width: 100 },
      { key: 'display_id', label: 'Display ID', sortable: true, width: 120 },
      { key: 'payee_first', label: 'First Name', sortable: true, width: 130 },
      { key: 'payee_last', label: 'Last Name', sortable: true, width: 130 },
      { key: 'payee_email', label: 'Email', sortable: true, width: 200 },
      { key: 'amount', label: 'Amount', sortable: true, width: 100 },
      { key: 'status', label: 'Status', sortable: true, width: 110 },
      { key: 'date_sent', label: 'Date Sent', sortable: true, width: 150, type: 'date' },
      { key: 'date_paid', label: 'Date Paid', sortable: true, width: 150, type: 'date' },
    ],
  },
  adhoc_charges: {
    table: 'adhoc_charges',
    label: 'Ad-Hoc Charges',
    pk: 'id',
    dateColumn: 'date_occurred',
    lastUpdatedColumn: 'last_updated',
    extraWhere: null,
    searchColumns: ['description', 'category_name', 'contractor_first_name'],
    category: 'tc',
    linkColumns: { client_id: { entity: 'clients', route: '/people/clients' } },
    columns: [
      { key: 'id', label: 'Charge ID', sortable: true, width: 100 },
      { key: 'description', label: 'Description', sortable: true, width: 250 },
      { key: 'category_name', label: 'Category', sortable: true, width: 140 },
      { key: 'net_gross', label: 'Amount', sortable: true, width: 100 },
      { key: 'client_id', label: 'Client ID', sortable: true, width: 100 },
      { key: 'contractor_first_name', label: 'Tutor', sortable: true, width: 130 },
      { key: 'date_occurred', label: 'Date', sortable: true, width: 150, type: 'date' },
      { key: 'currency', label: 'Currency', sortable: true, width: 80 },
    ],
  },
  proforma_invoices: {
    table: 'proforma_invoices',
    label: 'Proforma Invoices',
    pk: 'id',
    dateColumn: 'date_sent',
    lastUpdatedColumn: 'remote_last_updated',
    extraWhere: null,
    searchColumns: ['display_id', 'description', 'status'],
    category: 'tc',
    columns: [
      { key: 'id', label: 'ID', sortable: true, width: 80 },
      { key: 'display_id', label: 'Display ID', sortable: true, width: 120 },
      { key: 'description', label: 'Description', sortable: true, width: 250 },
      { key: 'amount', label: 'Amount', sortable: true, width: 100 },
      { key: 'status', label: 'Status', sortable: true, width: 110 },
      { key: 'date_sent', label: 'Date Sent', sortable: true, width: 150, type: 'date' },
      { key: 'date_paid', label: 'Date Paid', sortable: true, width: 150, type: 'date' },
      { key: 'remote_last_updated', label: 'Last Updated', sortable: true, width: 150, type: 'date' },
    ],
  },
  recipients: {
    table: 'recipients',
    label: 'Students',
    pk: 'recipient_id',
    dateColumn: 'created_at',
    lastUpdatedColumn: 'updated_at',
    extraWhere: null,
    searchColumns: ['first_name', 'last_name', 'email', 'town'],
    category: 'tc',
    linkColumns: { client_id: { entity: 'clients', route: '/people/clients' } },
    columns: [
      { key: 'recipient_id', label: 'Student ID', sortable: true, width: 100 },
      { key: 'first_name', label: 'First Name', sortable: true, width: 130 },
      { key: 'last_name', label: 'Last Name', sortable: true, width: 130 },
      { key: 'email', label: 'Email', sortable: true, width: 200 },
      { key: 'town', label: 'City', sortable: true, width: 120 },
      { key: 'academic_year', label: 'Academic Year', sortable: true, width: 120 },
      { key: 'client_id', label: 'Client ID', sortable: true, width: 100 },
      { key: 'created_at', label: 'Created', sortable: true, width: 150, type: 'date' },
      { key: 'updated_at', label: 'Last Updated', sortable: true, width: 150, type: 'date' },
    ],
  },
  reviews: {
    table: 'reviews',
    label: 'Reviews',
    pk: 'review_id',
    dateColumn: 'date_created',
    lastUpdatedColumn: 'date_created',
    extraWhere: null,
    searchColumns: ['client_name', 'contractor_name'],
    category: 'tc',
    linkColumns: { client_id: { entity: 'clients', route: '/people/clients' } },
    columns: [
      { key: 'review_id', label: 'Review ID', sortable: true, width: 100 },
      { key: 'client_name', label: 'Client', sortable: true, width: 160 },
      { key: 'contractor_name', label: 'Tutor', sortable: true, width: 160 },
      { key: 'star_rating_value', label: 'Rating', sortable: true, width: 80 },
      { key: 'date_created', label: 'Date', sortable: true, width: 150, type: 'date' },
    ],
  },
  appointment_recipients: {
    table: 'appointment_recipients',
    label: 'Lesson Students',
    pk: 'appointment_id',
    dateColumn: null,
    lastUpdatedColumn: null,
    extraWhere: null,
    searchColumns: ['recipient_name', 'paying_client_name'],
    category: 'tc',
    linkColumns: {
      appointment_id: { entity: 'appointments' },
      recipient_id: { entity: 'recipients' },
      paying_client_id: { entity: 'clients', route: '/people/clients' },
    },
    columns: [
      { key: 'appointment_id', label: 'Lesson ID', sortable: true, width: 100 },
      { key: 'recipient_id', label: 'Student ID', sortable: true, width: 100 },
      { key: 'recipient_name', label: 'Student', sortable: true, width: 160 },
      { key: 'paying_client_id', label: 'Client ID', sortable: true, width: 100 },
      { key: 'paying_client_name', label: 'Client', sortable: true, width: 160 },
      { key: 'charge_rate', label: 'Charge Rate', sortable: true, width: 110 },
      { key: 'status', label: 'Status', sortable: true, width: 100 },
    ],
  },
  appointment_contractors: {
    table: 'appointment_contractors',
    label: 'Lesson Tutors',
    pk: 'appointment_id',
    dateColumn: null,
    lastUpdatedColumn: null,
    extraWhere: null,
    searchColumns: ['contractor_name'],
    category: 'tc',
    linkColumns: {
      appointment_id: { entity: 'appointments' },
      contractor_id: { entity: 'contractors', route: '/people/tutors' },
    },
    columns: [
      { key: 'appointment_id', label: 'Lesson ID', sortable: true, width: 100 },
      { key: 'contractor_id', label: 'Tutor ID', sortable: true, width: 100 },
      { key: 'contractor_name', label: 'Tutor', sortable: true, width: 200 },
      { key: 'pay_rate', label: 'Pay Rate', sortable: true, width: 100 },
    ],
  },

  // ─── Historical Data Entities ────────────────────────────────────
  historical_appointments: {
    table: 'historical_appointments',
    label: 'Historical Lessons',
    pk: 'id',
    dateColumn: 'appointment_date',
    lastUpdatedColumn: 'created_at',
    extraWhere: null,
    searchColumns: ['lesson_type', 'location', 'status', 'source_system'],
    category: 'historical',
    columns: [
      { key: 'id', label: 'ID', sortable: true, width: 80 },
      { key: 'source_system', label: 'Source', sortable: true, width: 110 },
      { key: 'appointment_date', label: 'Date', sortable: true, width: 120, type: 'date' },
      { key: 'lesson_type', label: 'Type', sortable: true, width: 180 },
      { key: 'division', label: 'Division', sortable: true, width: 120 },
      { key: 'status', label: 'Status', sortable: true, width: 100 },
      { key: 'duration_hours', label: 'Hours', sortable: true, width: 80 },
      { key: 'revenue', label: 'Revenue', sortable: true, width: 100 },
      { key: 'tutor_pay', label: 'Tutor Pay', sortable: true, width: 100 },
      { key: 'location', label: 'Location', sortable: true, width: 150 },
      { key: 'class_size', label: 'Students', sortable: true, width: 80 },
    ],
  },
  e4_data: {
    table: 'e4_data',
    label: 'E4 Lessons',
    pk: 'id',
    dateColumn: 'lesson_date',
    lastUpdatedColumn: 'created_at',
    extraWhere: null,
    searchColumns: ['tutor', 'clients', 'lesson_location', 'division', 'curriculum'],
    category: 'historical',
    columns: [
      { key: 'id', label: 'ID', sortable: true, width: 80 },
      { key: 'lesson_date', label: 'Date', sortable: true, width: 120, type: 'date' },
      { key: 'tutor', label: 'Tutor', sortable: true, width: 160 },
      { key: 'clients', label: 'Client', sortable: true, width: 160 },
      { key: 'curriculum', label: 'Curriculum', sortable: true, width: 120 },
      { key: 'division', label: 'Division', sortable: true, width: 120 },
      { key: 'lesson_location', label: 'Location', sortable: true, width: 150 },
      { key: 'lesson_status', label: 'Status', sortable: true, width: 100 },
      { key: 'lesson_revenue', label: 'Revenue', sortable: true, width: 100 },
      { key: 'students_attended', label: 'Attended', sortable: true, width: 90 },
    ],
  },
  mindbody_data: {
    table: 'mindbody_data',
    label: 'MindBody Lessons',
    pk: 'id',
    dateColumn: 'date',
    lastUpdatedColumn: 'created_at',
    extraWhere: null,
    searchColumns: ['client', 'staff', 'lesson_type', 'location'],
    category: 'historical',
    columns: [
      { key: 'id', label: 'ID', sortable: true, width: 80 },
      { key: 'date', label: 'Date', sortable: true, width: 120, type: 'date' },
      { key: 'client', label: 'Client', sortable: true, width: 160 },
      { key: 'staff', label: 'Staff', sortable: true, width: 160 },
      { key: 'lesson_type', label: 'Type', sortable: true, width: 180 },
      { key: 'location', label: 'Location', sortable: true, width: 150 },
      { key: 'class_size', label: 'Class Size', sortable: true, width: 90 },
      { key: 'rev_per_visit', label: 'Revenue', sortable: true, width: 100 },
      { key: 'dashboard_category', label: 'Category', sortable: true, width: 130 },
    ],
  },
};

// Build a lookup of all valid column keys per entity for whitelist validation
const VALID_COLUMNS = {};
for (const [key, config] of Object.entries(ENTITY_CONFIG)) {
  VALID_COLUMNS[key] = new Set(config.columns.map(c => c.key));
}

// Freshness thresholds (milliseconds)
const FRESH_THRESHOLD = 6 * 60 * 60 * 1000;   // 6 hours → green
const STALE_THRESHOLD = 24 * 60 * 60 * 1000;  // 24 hours → yellow
// Beyond 24 hours or null → red

function getFreshnessStatus(lastUpdated) {
  if (!lastUpdated) return 'error';
  const age = Date.now() - new Date(lastUpdated).getTime();
  if (age < FRESH_THRESHOLD) return 'healthy';
  if (age < STALE_THRESHOLD) return 'stale';
  return 'error';
}

// ─── Service Functions ─────────────────────────────────────────────

async function getHealth(pool) {
  return getOrSet('data-center:health', async () => {
    // Build UNION ALL query for counts and last-updated across all entities
    const unionParts = [];
    for (const [key, config] of Object.entries(ENTITY_CONFIG)) {
      const where = config.extraWhere ? `WHERE ${config.extraWhere}` : '';
      const lastUpdatedExpr = config.lastUpdatedColumn
        ? `MAX(${config.lastUpdatedColumn})`
        : 'NULL::timestamptz';
      unionParts.push(
        `SELECT '${key}' AS entity, COUNT(*)::int AS count, ${lastUpdatedExpr} AS last_updated FROM ${config.table} ${where}`
      );
    }

    const healthQuery = unionParts.join('\n  UNION ALL\n  ');

    // Run health query and breakdown queries in parallel
    const breakdownEntries = Object.entries(ENTITY_CONFIG).filter(([, cfg]) => cfg.breakdownQuery);
    const [{ rows: entityRows }, { rows: syncRows }, ...breakdownResults] = await Promise.all([
      pool.query(healthQuery),
      pool.query(`SELECT sync_type, last_sync FROM sync_status`),
      ...breakdownEntries.map(([, cfg]) => pool.query(cfg.breakdownQuery)),
    ]);

    // Build breakdown map: entityKey -> rows
    const breakdownMap = new Map();
    breakdownEntries.forEach(([key], idx) => {
      breakdownMap.set(key, breakdownResults[idx].rows);
    });

    const syncMap = new Map(syncRows.map(r => [r.sync_type, r.last_sync]));

    let totalCount = 0;
    let oldestSync = null;

    const entities = entityRows.map(row => {
      const config = ENTITY_CONFIG[row.entity];
      const lastSync = syncMap.get(row.entity) || null;
      const lastUpdated = row.last_updated;
      const effectiveTime = lastSync || lastUpdated;

      totalCount += row.count;
      if (effectiveTime && (!oldestSync || new Date(effectiveTime) < new Date(oldestSync))) {
        oldestSync = effectiveTime;
      }

      const result = {
        key: row.entity,
        label: config.label,
        category: config.category,
        count: row.count,
        lastUpdated,
        lastSync,
        status: getFreshnessStatus(effectiveTime),
      };

      // Attach breakdown if available
      const breakdown = breakdownMap.get(row.entity);
      if (breakdown) {
        result.breakdown = breakdown;
      }

      return result;
    });

    // Overall system status — worst of all individual statuses
    const statusPriority = { error: 0, stale: 1, healthy: 2 };
    const worstStatus = entities.reduce((worst, e) => {
      return statusPriority[e.status] < statusPriority[worst] ? e.status : worst;
    }, 'healthy');

    return {
      systemStatus: worstStatus,
      totalRecords: totalCount,
      lastFullSync: oldestSync,
      entities,
    };
  }, 120); // 2-minute cache
}

function getEntityList() {
  return Object.entries(ENTITY_CONFIG).map(([key, config]) => ({
    key,
    label: config.label,
    category: config.category,
    hasDateFilter: !!config.dateColumn,
    linkColumns: config.linkColumns || null,
  }));
}

function getEntityColumns(entityKey) {
  const config = ENTITY_CONFIG[entityKey];
  if (!config) return null;
  return config.columns;
}

async function getEntityData(pool, entityKey, opts = {}) {
  const config = ENTITY_CONFIG[entityKey];
  if (!config) {
    throw new Error(`Unknown entity: ${entityKey}`);
  }

  const {
    page = 1,
    pageSize = 50,
    sortBy = null,
    sortDir = 'ASC',
    search = '',
    dateFrom = '',
    dateTo = '',
  } = opts;

  // Validate sort column against whitelist
  const validSortBy = sortBy && VALID_COLUMNS[entityKey].has(sortBy) ? sortBy : config.pk;
  const validSortDir = sortDir === 'DESC' ? 'DESC' : 'ASC';
  const safePage = Math.max(1, parseInt(page) || 1);
  const safePageSize = Math.min(200, Math.max(1, parseInt(pageSize) || 50));
  const offset = (safePage - 1) * safePageSize;

  // Select only the columns defined in config
  const selectCols = config.columns.map(c => c.key).join(', ');

  // Build WHERE clauses
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  // Base filter (e.g., is_deleted = FALSE for appointments)
  if (config.extraWhere) {
    conditions.push(config.extraWhere);
  }

  // Text search across searchColumns
  if (search && search.trim()) {
    const searchConditions = config.searchColumns.map(col => {
      params.push(`%${search.trim()}%`);
      return `${col}::text ILIKE $${paramIdx++}`;
    });
    conditions.push(`(${searchConditions.join(' OR ')})`);
  }

  // Date range filter
  if (dateFrom && config.dateColumn) {
    params.push(dateFrom);
    conditions.push(`${config.dateColumn} >= $${paramIdx++}`);
  }
  if (dateTo && config.dateColumn) {
    params.push(dateTo);
    conditions.push(`${config.dateColumn} <= $${paramIdx++}::date + INTERVAL '1 day'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count query
  const countQuery = `SELECT COUNT(*)::int AS total FROM ${config.table} ${whereClause}`;
  const { rows: countRows } = await pool.query(countQuery, params);
  const totalCount = countRows[0].total;

  // Data query
  const dataQuery = `
    SELECT ${selectCols}
    FROM ${config.table}
    ${whereClause}
    ORDER BY ${validSortBy} ${validSortDir} NULLS LAST
    LIMIT ${safePageSize} OFFSET ${offset}
  `;
  const { rows } = await pool.query(dataQuery, params);

  return {
    rows,
    totalCount,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.ceil(totalCount / safePageSize),
    columns: config.columns,
    entityLabel: config.label,
    hasDateFilter: !!config.dateColumn,
    linkColumns: config.linkColumns || null,
  };
}

async function exportEntityCsv(pool, entityKey, opts = {}) {
  const config = ENTITY_CONFIG[entityKey];
  if (!config) {
    throw new Error(`Unknown entity: ${entityKey}`);
  }

  // Same as getEntityData but cap at 10k rows, no pagination
  const result = await getEntityData(pool, entityKey, {
    ...opts,
    page: 1,
    pageSize: 10000,
  });

  // Build CSV
  const headers = config.columns.map(c => c.label);
  const csvRows = [headers.join(',')];

  for (const row of result.rows) {
    const values = config.columns.map(c => {
      const val = row[c.key];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Escape CSV values with commas, quotes, or newlines
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

// ─── Data Quality ──────────────────────────────────────────────────

async function getDataQuality(pool) {
  return getOrSet('data-center:quality', async () => {
    const checks = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM clients WHERE email IS NULL OR email = ''`).then(r => ({
        entity: 'clients', field: 'email', issue: 'Missing email', count: r.rows[0].count, severity: 'warning',
      })),
      pool.query(`SELECT COUNT(*)::int AS count FROM clients WHERE phone IS NULL AND mobile IS NULL`).then(r => ({
        entity: 'clients', field: 'phone', issue: 'Missing phone & mobile', count: r.rows[0].count, severity: 'info',
      })),
      pool.query(`SELECT COUNT(*)::int AS count FROM clients WHERE status IS NULL OR status = ''`).then(r => ({
        entity: 'clients', field: 'status', issue: 'Missing status', count: r.rows[0].count, severity: 'error',
      })),
      pool.query(`SELECT COUNT(*)::int AS count FROM contractors WHERE email IS NULL OR email = ''`).then(r => ({
        entity: 'contractors', field: 'email', issue: 'Missing email', count: r.rows[0].count, severity: 'warning',
      })),
      pool.query(`SELECT COUNT(*)::int AS count FROM appointments WHERE units IS NULL AND is_deleted = FALSE`).then(r => ({
        entity: 'appointments', field: 'units', issue: 'Missing lesson hours', count: r.rows[0].count, severity: 'warning',
      })),
      pool.query(`SELECT COUNT(*)::int AS count FROM appointments WHERE service_id IS NULL AND is_deleted = FALSE`).then(r => ({
        entity: 'appointments', field: 'service_id', issue: 'No linked job', count: r.rows[0].count, severity: 'warning',
      })),
      pool.query(`SELECT COUNT(*)::int AS count FROM invoices WHERE client_id IS NULL`).then(r => ({
        entity: 'invoices', field: 'client_id', issue: 'No linked client', count: r.rows[0].count, severity: 'error',
      })),
      pool.query(`SELECT COUNT(*)::int AS count FROM recipients WHERE client_id IS NULL`).then(r => ({
        entity: 'recipients', field: 'client_id', issue: 'Orphaned student (no client)', count: r.rows[0].count, severity: 'warning',
      })),
    ]);

    // Only return issues where count > 0
    const issues = checks.filter(c => c.count > 0);
    const totalIssues = issues.reduce((sum, c) => sum + c.count, 0);
    const hasErrors = issues.some(c => c.severity === 'error' && c.count > 0);
    const hasWarnings = issues.some(c => c.severity === 'warning' && c.count > 0);

    return {
      overallQuality: hasErrors ? 'poor' : hasWarnings ? 'fair' : 'good',
      totalIssues,
      issues,
    };
  }, 300); // 5-minute cache
}

// ─── Global Search ─────────────────────────────────────────────────

async function globalSearch(pool, searchTerm, limit = 20) {
  if (!searchTerm || searchTerm.trim().length < 2) return [];

  const term = `%${searchTerm.trim()}%`;

  // Search the main entities that people care about (not junction tables or historical)
  const searchableEntities = ['clients', 'contractors', 'services', 'appointments', 'invoices', 'payment_orders', 'recipients', 'reviews'];

  const queries = searchableEntities.map(async (entityKey) => {
    const config = ENTITY_CONFIG[entityKey];
    if (!config || config.searchColumns.length === 0) return [];

    const searchConditions = config.searchColumns.map((col, i) => `${col}::text ILIKE $${i + 1}`);
    const params = config.searchColumns.map(() => term);
    const where = config.extraWhere
      ? `WHERE (${searchConditions.join(' OR ')}) AND ${config.extraWhere}`
      : `WHERE ${searchConditions.join(' OR ')}`;

    // Get a display label for each result
    let displayExpr;
    if (['clients', 'contractors', 'recipients'].includes(entityKey)) {
      displayExpr = `COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')`;
    } else if (entityKey === 'services') {
      displayExpr = `name`;
    } else if (entityKey === 'reviews') {
      displayExpr = `COALESCE(client_name, '') || ' → ' || COALESCE(contractor_name, '')`;
    } else if (entityKey === 'appointments') {
      displayExpr = `COALESCE(topic, 'Lesson ' || appointment_id)`;
    } else {
      displayExpr = `COALESCE(display_id::text, ${config.pk}::text)`;
    }

    const query = `
      SELECT ${config.pk} AS id, ${displayExpr} AS display_name
      FROM ${config.table}
      ${where}
      LIMIT 5
    `;

    try {
      const { rows } = await pool.query(query, params);
      return rows.map(r => ({
        entity: entityKey,
        entityLabel: config.label,
        id: r.id,
        displayName: r.display_name?.trim() || String(r.id),
      }));
    } catch {
      return [];
    }
  });

  const allResults = await Promise.all(queries);
  return allResults.flat().slice(0, limit);
}

module.exports = {
  getHealth,
  getEntityList,
  getEntityColumns,
  getEntityData,
  exportEntityCsv,
  getDataQuality,
  globalSearch,
  ENTITY_CONFIG,
  VALID_COLUMNS,
};
