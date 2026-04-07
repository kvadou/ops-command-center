require('dotenv').config();
const axios = require('axios');
const { getPool } = require('../database-connections');
const FailedCheckoutService = require('../services/failed-checkout-service');

async function run() {
  const pool = getPool('production');
  const service = new FailedCheckoutService(pool);

  const tcToken = String(process.env.TUTORCRUNCHER_API_TOKEN || '').replace(/['"]/g, '').trim();
  const tcClient = axios.create({
    baseURL: process.env.TUTORCRUNCHER_API_BASE || 'https://account.acmeops.com/api/',
    timeout: 30000,
    headers: { Authorization: `token ${tcToken}` },
  });

  const result = await service.cleanupDeletedAppointments(tcClient);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
