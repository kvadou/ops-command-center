-- DevOps Metrics Tables
-- Stores API latency, performance metrics, and enables anomaly detection

-- API Latency Metrics Table
CREATE TABLE IF NOT EXISTS devops_metrics_api_latency (
  id SERIAL PRIMARY KEY,
  environment VARCHAR(50) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  method VARCHAR(10) NOT NULL,
  duration_ms INTEGER NOT NULL,
  status_code INTEGER,
  percentiles JSONB, -- Store p50, p90, p99 for this time bucket
  time_bucket TIMESTAMP NOT NULL,
  request_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(environment, endpoint, method, time_bucket)
);

CREATE INDEX IF NOT EXISTS idx_api_latency_env_time ON devops_metrics_api_latency(environment, time_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_api_latency_endpoint ON devops_metrics_api_latency(endpoint, time_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_api_latency_created ON devops_metrics_api_latency(created_at DESC);

-- Node.js Performance Metrics Table
CREATE TABLE IF NOT EXISTS devops_metrics_node_performance (
  id SERIAL PRIMARY KEY,
  environment VARCHAR(50) NOT NULL,
  event_loop_lag_ms NUMERIC(10, 2),
  memory_heap_used BIGINT,
  memory_heap_total BIGINT,
  memory_rss BIGINT,
  cpu_usage_percent NUMERIC(5, 2),
  time_bucket TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(environment, time_bucket)
);

CREATE INDEX IF NOT EXISTS idx_node_perf_env_time ON devops_metrics_node_performance(environment, time_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_node_perf_created ON devops_metrics_node_performance(created_at DESC);

-- Database Performance Metrics Table
CREATE TABLE IF NOT EXISTS devops_metrics_database_performance (
  id SERIAL PRIMARY KEY,
  environment VARCHAR(50) NOT NULL,
  slow_query_count INTEGER DEFAULT 0,
  avg_query_time_ms NUMERIC(10, 2),
  max_query_time_ms NUMERIC(10, 2),
  connection_pool_active INTEGER,
  connection_pool_max INTEGER,
  connection_pool_usage_percent NUMERIC(5, 2),
  time_bucket TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(environment, time_bucket)
);

CREATE INDEX IF NOT EXISTS idx_db_perf_env_time ON devops_metrics_database_performance(environment, time_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_db_perf_created ON devops_metrics_database_performance(created_at DESC);

-- Anomaly Detection Results Table
CREATE TABLE IF NOT EXISTS devops_anomalies (
  id SERIAL PRIMARY KEY,
  environment VARCHAR(50) NOT NULL,
  metric_type VARCHAR(50) NOT NULL, -- 'api_latency', 'event_loop', 'memory', 'database', etc.
  metric_name VARCHAR(200) NOT NULL,
  current_value NUMERIC(12, 2),
  baseline_value NUMERIC(12, 2),
  deviation_percent NUMERIC(5, 2),
  severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  context JSONB,
  alert_sent BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_anomalies_env_type ON devops_anomalies(environment, metric_type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved ON devops_anomalies(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_anomalies_detected ON devops_anomalies(detected_at DESC);

-- Dyno Restart Tracking Table
CREATE TABLE IF NOT EXISTS devops_dyno_restarts (
  id SERIAL PRIMARY KEY,
  environment VARCHAR(50) NOT NULL,
  app_name VARCHAR(100) NOT NULL,
  dyno_name VARCHAR(100),
  restart_reason VARCHAR(200),
  restart_count INTEGER DEFAULT 1,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  context JSONB
);

CREATE INDEX IF NOT EXISTS idx_dyno_restarts_env_time ON devops_dyno_restarts(environment, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_dyno_restarts_app ON devops_dyno_restarts(app_name, detected_at DESC);

-- Cleanup function for old metrics (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
  DELETE FROM devops_metrics_api_latency WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM devops_metrics_node_performance WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM devops_metrics_database_performance WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM devops_anomalies WHERE detected_at < NOW() - INTERVAL '90 days' AND resolved_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

