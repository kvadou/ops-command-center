// migrations/20260121-marketing-budget-learning.js
// Marketing Hub: Budget Optimizer and Learning Loop Schema

/**
 * Creates tables for:
 * 1. marketing_budget_recommendations - Budget optimization recommendations
 * 2. marketing_prediction_accuracy - AI prediction accuracy tracking
 * 3. marketing_ai_calibration - AI model confidence calibration
 * 4. marketing_budget_snapshots - Daily platform budget snapshots
 */

async function up(pool) {
  console.log('Running migration: marketing-budget-learning (up)');

  // 1. Budget recommendations table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_budget_recommendations (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMP DEFAULT NOW(),
      recommendation_type VARCHAR(50) NOT NULL, -- 'reallocation', 'increase', 'decrease'
      current_allocation JSONB NOT NULL,
      recommended_allocation JSONB NOT NULL,
      rationale TEXT NOT NULL,
      projected_improvement JSONB,
      confidence_score DECIMAL(3,2), -- 0.00 to 1.00
      status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, executed
      approved_by VARCHAR(255),
      approved_at TIMESTAMP,
      executed_at TIMESTAMP,
      execution_result JSONB,
      actual_cpl_change DECIMAL(8,2),
      actual_roas_change DECIMAL(8,2),
      rejected_by VARCHAR(255),
      rejected_at TIMESTAMP,
      rejection_reason TEXT,
      expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
    );
  `);
  console.log('  Created: marketing_budget_recommendations');

  // 2. Prediction accuracy tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_prediction_accuracy (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMP DEFAULT NOW(),
      draft_id INTEGER REFERENCES marketing_campaign_drafts(id) ON DELETE SET NULL,
      insight_id INTEGER REFERENCES marketing_ai_insights(id) ON DELETE SET NULL,
      prediction_type VARCHAR(50) NOT NULL, -- 'cpl', 'roas', 'ctr', 'conversion_rate'
      predicted_value DECIMAL(12,4),
      actual_value DECIMAL(12,4),
      variance_percent DECIMAL(8,2),
      accuracy_score DECIMAL(3,2), -- 0.00 to 1.00
      measurement_date DATE NOT NULL,
      measurement_period VARCHAR(20), -- 'day_1', 'day_7', 'day_14', 'day_30'
      context JSONB
    );
  `);
  console.log('  Created: marketing_prediction_accuracy');

  // 3. AI model calibration table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_ai_calibration (
      id SERIAL PRIMARY KEY,
      updated_at TIMESTAMP DEFAULT NOW(),
      prediction_type VARCHAR(50) NOT NULL,
      platform VARCHAR(50), -- null means all platforms
      campaign_type VARCHAR(50), -- null means all types
      sample_size INTEGER DEFAULT 0,
      mean_accuracy DECIMAL(3,2),
      confidence_adjustment DECIMAL(4,3), -- multiplier for confidence scores
      last_recalibrated_at TIMESTAMP,
      UNIQUE(prediction_type, platform, campaign_type)
    );
  `);
  console.log('  Created: marketing_ai_calibration');

  // 4. Budget snapshots table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_budget_snapshots (
      id SERIAL PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      platform VARCHAR(50) NOT NULL,
      daily_budget DECIMAL(10,2),
      daily_spend DECIMAL(10,2),
      performance_score DECIMAL(5,2),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(snapshot_date, platform)
    );
  `);
  console.log('  Created: marketing_budget_snapshots');

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_budget_rec_status
    ON marketing_budget_recommendations(status);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pred_accuracy_draft
    ON marketing_prediction_accuracy(draft_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pred_accuracy_date
    ON marketing_prediction_accuracy(measurement_date);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_budget_snapshots_date
    ON marketing_budget_snapshots(snapshot_date);
  `);
  console.log('  Created: indexes');

  console.log('Migration complete: marketing-budget-learning (up)');
}

async function down(pool) {
  console.log('Running migration: marketing-budget-learning (down)');

  // Drop indexes first
  await pool.query('DROP INDEX IF EXISTS idx_budget_snapshots_date;');
  await pool.query('DROP INDEX IF EXISTS idx_pred_accuracy_date;');
  await pool.query('DROP INDEX IF EXISTS idx_pred_accuracy_draft;');
  await pool.query('DROP INDEX IF EXISTS idx_budget_rec_status;');
  console.log('  Dropped: indexes');

  // Drop tables in reverse order (respecting foreign key dependencies)
  await pool.query('DROP TABLE IF EXISTS marketing_budget_snapshots;');
  console.log('  Dropped: marketing_budget_snapshots');

  await pool.query('DROP TABLE IF EXISTS marketing_ai_calibration;');
  console.log('  Dropped: marketing_ai_calibration');

  await pool.query('DROP TABLE IF EXISTS marketing_prediction_accuracy;');
  console.log('  Dropped: marketing_prediction_accuracy');

  await pool.query('DROP TABLE IF EXISTS marketing_budget_recommendations;');
  console.log('  Dropped: marketing_budget_recommendations');

  console.log('Migration complete: marketing-budget-learning (down)');
}

module.exports = { up, down };
