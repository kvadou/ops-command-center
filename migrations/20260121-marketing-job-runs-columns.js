/**
 * Migration: Add columns to marketing_ai_job_runs table
 * Creates the table if it doesn't exist, then adds
 * budget_optimization_result and learning_loop_result columns
 * to support the new marketing AI job steps
 */

async function up(pool) {
  console.log('Creating marketing_ai_job_runs table if not exists and adding new columns...');

  // First, create the table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_ai_job_runs (
      id SERIAL PRIMARY KEY,
      environment VARCHAR(50) NOT NULL,
      run_at TIMESTAMP DEFAULT NOW(),
      klaviyo_sync_result JSONB,
      ai_analysis_result JSONB,
      results_tracking_result JSONB,
      alerts_result JSONB,
      budget_optimization_result JSONB,
      learning_loop_result JSONB,
      errors JSONB,
      status VARCHAR(50) DEFAULT 'pending'
    );
  `);
  console.log('  ✓ marketing_ai_job_runs table created or already exists');

  // Then add the columns if they don't exist (for existing tables)
  await pool.query(`
    ALTER TABLE marketing_ai_job_runs
    ADD COLUMN IF NOT EXISTS budget_optimization_result JSONB,
    ADD COLUMN IF NOT EXISTS learning_loop_result JSONB;
  `);
  console.log('  ✓ budget_optimization_result and learning_loop_result columns added');
}

async function down(pool) {
  console.log('Removing budget_optimization_result and learning_loop_result columns from marketing_ai_job_runs...');

  await pool.query(`
    ALTER TABLE marketing_ai_job_runs
    DROP COLUMN IF EXISTS budget_optimization_result,
    DROP COLUMN IF EXISTS learning_loop_result;
  `);

  console.log('Columns removed successfully');
}

module.exports = { up, down };
