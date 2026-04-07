/**
 * Metrics Collector Service
 * Collects, aggregates, and analyzes performance metrics with anomaly detection
 */

const { Pool } = require('pg');
const { logger } = require('../utils/logger');

// Database connection setup
const isLocal = process.env.DATABASE_URL?.includes('localhost') || 
                process.env.DATABASE_URL?.includes('127.0.0.1') ||
                !process.env.DATABASE_URL?.includes('amazonaws.com');

const localDbUrl = 'postgres://user:REPLACE_ME@localhost:5432/acme_ops_demo';
const dbUrl = (isLocal && process.env.DATABASE_URL) 
  ? process.env.DATABASE_URL 
  : (process.env.DATABASE_URL || localDbUrl);

const pool = new Pool({
  connectionString: dbUrl,
  ssl: !isLocal ? { rejectUnauthorized: false } : false
});

class MetricsCollector {
  constructor() {
    this.baselines = new Map(); // Store baseline values for anomaly detection
    this.baselineWindow = 24 * 60 * 60 * 1000; // 24 hours for baseline calculation
  }

  /**
   * Record API latency metric
   */
  async recordApiLatency(environment, endpoint, method, durationMs, statusCode) {
    try {
      const timeBucket = this.getTimeBucket(new Date(), 'hour');
      
      // Upsert metric
      await pool.query(`
        INSERT INTO devops_metrics_api_latency 
          (environment, endpoint, method, duration_ms, status_code, time_bucket, request_count)
        VALUES ($1, $2, $3, $4, $5, $6, 1)
        ON CONFLICT (environment, endpoint, method, time_bucket)
        DO UPDATE SET
          duration_ms = (devops_metrics_api_latency.duration_ms * devops_metrics_api_latency.request_count + EXCLUDED.duration_ms) / (devops_metrics_api_latency.request_count + 1),
          request_count = devops_metrics_api_latency.request_count + 1,
          status_code = EXCLUDED.status_code
      `, [environment, endpoint, method, durationMs, statusCode, timeBucket]);

      // Calculate percentiles for this time bucket
      await this.updatePercentiles(environment, endpoint, method, timeBucket);

      // Check for anomalies (skip 304 Not Modified responses - they're cache hits and always fast)
      if (statusCode !== 304) {
        await this.checkAnomaly('api_latency', environment, {
          endpoint,
          method,
          duration_ms: durationMs,
          status_code: statusCode
        });
      }

    } catch (error) {
      logger.error({ err: error }, 'Error recording API latency:');
    }
  }

  /**
   * Calculate percentiles (p50, p90, p99) for a time bucket
   */
  async updatePercentiles(environment, endpoint, method, timeBucket) {
    try {
      // Get all durations for this bucket
      const result = await pool.query(`
        SELECT duration_ms
        FROM devops_metrics_api_latency
        WHERE environment = $1 
          AND endpoint = $2 
          AND method = $3 
          AND time_bucket = $4
        ORDER BY duration_ms
      `, [environment, endpoint, method, timeBucket]);

      if (result.rows.length === 0) return;

      const durations = result.rows.map(r => r.duration_ms).sort((a, b) => a - b);
      const count = durations.length;

      const percentiles = {
        p50: this.getPercentile(durations, 50),
        p90: this.getPercentile(durations, 90),
        p99: this.getPercentile(durations, 99)
      };

      await pool.query(`
        UPDATE devops_metrics_api_latency
        SET percentiles = $1
        WHERE environment = $2 
          AND endpoint = $3 
          AND method = $4 
          AND time_bucket = $5
      `, [JSON.stringify(percentiles), environment, endpoint, method, timeBucket]);

    } catch (error) {
      logger.error({ err: error }, 'Error updating percentiles:');
    }
  }

  /**
   * Get percentile value from sorted array
   */
  getPercentile(sortedArray, percentile) {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Record Node.js performance metrics
   */
  async recordNodePerformance(environment, metrics) {
    try {
      const timeBucket = this.getTimeBucket(new Date(), 'hour');
      
      await pool.query(`
        INSERT INTO devops_metrics_node_performance 
          (environment, event_loop_lag_ms, memory_heap_used, memory_heap_total, 
           memory_rss, cpu_usage_percent, time_bucket)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (environment, time_bucket)
        DO UPDATE SET
          event_loop_lag_ms = EXCLUDED.event_loop_lag_ms,
          memory_heap_used = EXCLUDED.memory_heap_used,
          memory_heap_total = EXCLUDED.memory_heap_total,
          memory_rss = EXCLUDED.memory_rss,
          cpu_usage_percent = EXCLUDED.cpu_usage_percent
      `, [
        environment,
        metrics.eventLoopLag,
        metrics.memory?.heapUsed,
        metrics.memory?.heapTotal,
        metrics.memory?.rss,
        metrics.cpu?.usage,
        timeBucket
      ]);

      // Check for anomalies
      if (metrics.eventLoopLag > 100) {
        await this.checkAnomaly('event_loop', environment, {
          event_loop_lag_ms: metrics.eventLoopLag
        });
      }

      if (metrics.memory?.heapUsed && metrics.memory?.heapTotal) {
        const usagePercent = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
        if (usagePercent > 85) {
          await this.checkAnomaly('memory', environment, {
            heap_usage_percent: usagePercent,
            heap_used: metrics.memory.heapUsed,
            heap_total: metrics.memory.heapTotal
          });
        }
      }

    } catch (error) {
      logger.error({ err: error }, 'Error recording Node performance:');
    }
  }

  /**
   * Record database performance metrics
   */
  async recordDatabasePerformance(environment, metrics) {
    try {
      const timeBucket = this.getTimeBucket(new Date(), 'hour');
      
      await pool.query(`
        INSERT INTO devops_metrics_database_performance 
          (environment, slow_query_count, avg_query_time_ms, max_query_time_ms,
           connection_pool_active, connection_pool_max, connection_pool_usage_percent, time_bucket)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (environment, time_bucket)
        DO UPDATE SET
          slow_query_count = EXCLUDED.slow_query_count,
          avg_query_time_ms = EXCLUDED.avg_query_time_ms,
          max_query_time_ms = EXCLUDED.max_query_time_ms,
          connection_pool_active = EXCLUDED.connection_pool_active,
          connection_pool_max = EXCLUDED.connection_pool_max,
          connection_pool_usage_percent = EXCLUDED.connection_pool_usage_percent
      `, [
        environment,
        metrics.slowQueryCount || 0,
        metrics.avgQueryTime,
        metrics.maxQueryTime,
        metrics.connectionPool?.active,
        metrics.connectionPool?.max,
        metrics.connectionPool?.usagePercent,
        timeBucket
      ]);

      // Check for anomalies
      if (metrics.avgQueryTime > 500) {
        await this.checkAnomaly('database', environment, {
          avg_query_time_ms: metrics.avgQueryTime
        });
      }

      if (metrics.connectionPool?.usagePercent > 85) {
        await this.checkAnomaly('database_pool', environment, {
          usage_percent: metrics.connectionPool.usagePercent
        });
      }

    } catch (error) {
      logger.error({ err: error }, 'Error recording database performance:');
    }
  }

  /**
   * Check for anomalies using baseline comparison
   */
  async checkAnomaly(metricType, environment, metricData) {
    try {
      // Get baseline from last 24 hours
      const baseline = await this.getBaseline(metricType, environment);
      if (!baseline) return; // No baseline yet, skip

      const metricName = this.getMetricName(metricType, metricData);
      const currentValue = this.getCurrentValue(metricType, metricData);

      // Calculate deviation (clamp to reasonable range to prevent numeric overflow)
      let deviation = ((currentValue - baseline) / baseline) * 100;
      // Clamp to ±999.99 to prevent NUMERIC(5,2) overflow
      deviation = Math.max(-999.99, Math.min(999.99, deviation));

      // Skip anomaly detection for 304 (Not Modified) responses - they're cache hits and expected to be fast
      // Also skip if this is a cache hit (context should indicate this)
      if (metricData.status_code === 304 || metricData.statusCode === 304) {
        return; // Don't create alerts for cache hits
      }

      // Determine severity based on deviation thresholds
      // For latency, we only care about SLOW responses, not fast ones
      let severity = 'low';
      if (currentValue > baseline * 3) severity = 'critical'; // 3x slower = critical
      else if (currentValue > baseline * 2) severity = 'high'; // 2x slower = high
      else if (currentValue > baseline * 1.5) severity = 'medium'; // 1.5x slower = medium
      
      // If the response is faster than baseline, it's not an anomaly
      if (currentValue < baseline) {
        return; // Fast responses are good, not anomalies
      }

      // Only record significant anomalies
      if (severity === 'low' && deviation < 30) return;

      // Check if similar anomaly already exists (avoid duplicates)
      const existing = await pool.query(`
        SELECT id FROM devops_anomalies
        WHERE environment = $1 
          AND metric_type = $2 
          AND metric_name = $3
          AND resolved_at IS NULL
          AND detected_at > NOW() - INTERVAL '1 hour'
      `, [environment, metricType, metricName]);

      if (existing.rows.length > 0) return; // Already recorded

      // Record anomaly
      await pool.query(`
        INSERT INTO devops_anomalies
          (environment, metric_type, metric_name, current_value, baseline_value,
           deviation_percent, severity, context)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        environment,
        metricType,
        metricName,
        currentValue,
        baseline,
        deviation,
        severity,
        JSON.stringify(metricData)
      ]);

      // Create alert if critical/high
      if (severity === 'critical' || severity === 'high') {
        await this.createAnomalyAlert(metricType, environment, metricName, currentValue, baseline, deviation, severity);
      }

    } catch (error) {
      logger.error({ err: error }, 'Error checking anomaly:');
    }
  }

  /**
   * Get baseline value for a metric
   */
  async getBaseline(metricType, environment) {
    try {
      let query;
      switch (metricType) {
        case 'api_latency':
          // Exclude 304 (Not Modified) responses from baseline - they're cache hits and always fast
          // Also exclude 3xx redirects and 4xx/5xx errors for accurate performance baseline
          query = `
            SELECT AVG(duration_ms) as baseline
            FROM devops_metrics_api_latency
            WHERE environment = $1 
              AND time_bucket > NOW() - INTERVAL '24 hours'
              AND (status_code IS NULL OR (status_code >= 200 AND status_code < 300))
              AND status_code != 304
          `;
          break;
        case 'event_loop':
          query = `
            SELECT AVG(event_loop_lag_ms) as baseline
            FROM devops_metrics_node_performance
            WHERE environment = $1 
              AND time_bucket > NOW() - INTERVAL '24 hours'
          `;
          break;
        case 'memory':
          query = `
            SELECT AVG((memory_heap_used::float / NULLIF(memory_heap_total, 0)) * 100) as baseline
            FROM devops_metrics_node_performance
            WHERE environment = $1 
              AND time_bucket > NOW() - INTERVAL '24 hours'
          `;
          break;
        case 'database':
          query = `
            SELECT AVG(avg_query_time_ms) as baseline
            FROM devops_metrics_database_performance
            WHERE environment = $1 
              AND time_bucket > NOW() - INTERVAL '24 hours'
          `;
          break;
        default:
          return null;
      }

      const result = await pool.query(query, [environment]);
      return result.rows[0]?.baseline ? parseFloat(result.rows[0].baseline) : null;

    } catch (error) {
      logger.error({ err: error }, 'Error getting baseline:');
      return null;
    }
  }

  /**
   * Get metric name from data
   */
  getMetricName(metricType, metricData) {
    if (metricType === 'api_latency') {
      return `${metricData.method} ${metricData.endpoint}`;
    }
    return metricType;
  }

  /**
   * Get current value from metric data
   */
  getCurrentValue(metricType, metricData) {
    switch (metricType) {
      case 'api_latency':
        return metricData.duration_ms;
      case 'event_loop':
        return metricData.event_loop_lag_ms;
      case 'memory':
        return metricData.heap_usage_percent;
      case 'database':
        return metricData.avg_query_time_ms;
      case 'database_pool':
        return metricData.usage_percent;
      default:
        return 0;
    }
  }

  /**
   * Create alert for anomaly
   */
  async createAnomalyAlert(metricType, environment, metricName, currentValue, baseline, deviation, severity) {
    try {
      await pool.query(`
        INSERT INTO devops_alerts
          (environment, alert_type, severity, title, message, context, source)
        VALUES ($1, 'performance', $2, $3, $4, $5, 'anomaly_detection')
      `, [
        environment,
        severity,
        `Anomaly Detected: ${metricName}`,
        `${metricName} is ${deviation.toFixed(1)}% above baseline (current: ${currentValue.toFixed(2)}, baseline: ${baseline.toFixed(2)})`,
        JSON.stringify({
          metric_type: metricType,
          metric_name: metricName,
          current_value: currentValue,
          baseline_value: baseline,
          deviation_percent: deviation
        })
      ]);
    } catch (error) {
      logger.error({ err: error }, 'Error creating anomaly alert:');
    }
  }

  /**
   * Record dyno restart
   */
  async recordDynoRestart(environment, appName, dynoName, reason, context = {}) {
    try {
      await pool.query(`
        INSERT INTO devops_dyno_restarts
          (environment, app_name, dyno_name, restart_reason, context)
        VALUES ($1, $2, $3, $4, $5)
      `, [environment, appName, dynoName, reason, JSON.stringify(context)]);

      // Create alert for dyno restart
      await pool.query(`
        INSERT INTO devops_alerts
          (environment, alert_type, severity, title, message, context, source)
        VALUES ($1, 'warning', 'high', $2, $3, $4, 'dyno_monitor')
      `, [
        environment,
        `Dyno Restart: ${dynoName || appName}`,
        `Dyno ${dynoName || 'unknown'} in ${appName} restarted. Reason: ${reason || 'unknown'}`,
        JSON.stringify({ app_name: appName, dyno_name: dynoName, reason, ...context })
      ]);

    } catch (error) {
      logger.error({ err: error }, 'Error recording dyno restart:');
    }
  }

  /**
   * Get time bucket for aggregation
   */
  getTimeBucket(date, interval = 'hour') {
    const d = new Date(date);
    if (interval === 'hour') {
      d.setMinutes(0, 0, 0);
    } else if (interval === 'day') {
      d.setHours(0, 0, 0, 0);
    }
    return d;
  }
}

module.exports = new MetricsCollector();

