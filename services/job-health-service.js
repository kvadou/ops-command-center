const { logger } = require('../utils/logger');
const { getOrSet, clearCacheByPrefix } = require('../utils/cache');

class JobHealthService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get all at-risk jobs (available/pending status) with risk scores
   */
  async getAtRiskJobs() {
    return getOrSet('job-health:at-risk', async () => {
      const { rows: jobs } = await this.pool.query(`
        SELECT
          s.service_id,
          s.name AS job_name,
          s.status,
          s.dft_charge_rate,
          s.dft_contractor_rate,
          s.labels,
          s.dft_location_address,
          s.dft_location_lat,
          s.dft_location_lng,
          s.conjobs_count,
          s.rcrs_count,
          s.sr_premium,
          s.desired_skills,
          s.tc_created_at,
          s.status_changed_at,
          s.created_at,
          s.updated_at,
          EXTRACT(EPOCH FROM (NOW() - COALESCE(s.status_changed_at, s.created_at))) / 86400.0 AS days_in_status,
          COALESCE(ja.bid_count, 0) AS tutor_bids_count,
          jps.risk_score AS cached_risk_score,
          jps.risk_factors AS cached_risk_factors
        FROM services s
        LEFT JOIN (
          SELECT service_id, COUNT(*) AS bid_count
          FROM job_applications
          WHERE status != 'declined'
          GROUP BY service_id
        ) ja ON ja.service_id = s.service_id
        LEFT JOIN job_placement_scores jps ON jps.service_id = s.service_id
        WHERE s.status IN ('available', 'pending')
        ORDER BY COALESCE(jps.risk_score, 50) DESC, days_in_status DESC
      `);

      const avgPlacementDays = await this.getAvgPlacementDaysByChannel();
      const avgRates = await this.getAvgRatesByChannel();

      const enrichedJobs = jobs.map(job => {
        const channel = this.getChannelFromLabels(job.labels);
        const { score, factors } = this.calculateRiskScore(job, channel, avgPlacementDays, avgRates);
        return {
          ...job,
          channel,
          risk_score: score,
          risk_factors: factors,
          suggested_actions: this.getSuggestedActions(factors),
          tc_url: `https://secure.tutorcruncher.com/cal/service/${job.service_id}/`,
        };
      });

      enrichedJobs.sort((a, b) => b.risk_score - a.risk_score);
      return enrichedJobs;
    }, 1800);
  }

  /**
   * Calculate risk score for a single job
   */
  calculateRiskScore(job, channel, avgPlacementDays, avgRates) {
    let score = 0;
    const factors = [];
    const daysInStatus = parseFloat(job.days_in_status) || 0;
    const bidCount = parseInt(job.tutor_bids_count) || 0;

    if (bidCount === 0 && daysInStatus >= 3) {
      score += 20;
      factors.push({ factor: 'no_bids_3_days', points: 20, detail: `${Math.round(daysInStatus)} days with zero tutor bids` });
    }

    if (bidCount === 0 && daysInStatus < 3) {
      score += 15;
      factors.push({ factor: 'zero_bids', points: 15, detail: 'No tutor applications yet' });
    }

    const channelAvg = avgPlacementDays[channel] || avgPlacementDays.overall || 7;
    if (daysInStatus > channelAvg) {
      score += 15;
      factors.push({ factor: 'above_avg_wait', points: 15, detail: `${Math.round(daysInStatus)}d waiting vs ${Math.round(channelAvg)}d avg for ${channel}` });
    }

    const channelAvgRate = avgRates[channel]?.contractor || avgRates.overall?.contractor || 0;
    if (channelAvgRate > 0 && job.dft_contractor_rate < channelAvgRate * 0.9) {
      score += 10;
      factors.push({ factor: 'low_contractor_rate', points: 10, detail: `$${job.dft_contractor_rate}/hr vs $${Math.round(channelAvgRate)}/hr market avg` });
    }

    if (channel !== 'Online' && !job.dft_location_lat) {
      score += 10;
      factors.push({ factor: 'no_location', points: 10, detail: 'No location set for in-person job' });
    }

    if (job.status === 'available') {
      score += 10;
      factors.push({ factor: 'available_status', points: 10, detail: 'Job is in "available" status (longer-standing)' });
    }

    const skills = job.desired_skills;
    if (!skills || (Array.isArray(skills) && skills.length === 0)) {
      score += 5;
      factors.push({ factor: 'no_skills', points: 5, detail: 'No desired skills specified' });
    }

    if (daysInStatus > 7 && (job.conjobs_count || 0) === 0) {
      score += 5;
      factors.push({ factor: 'old_no_tutors', points: 5, detail: `${Math.round(daysInStatus)} days old with no assigned tutors` });
    }

    return { score: Math.min(score, 100), factors };
  }

  getSuggestedActions(factors) {
    const actions = [];
    const factorNames = factors.map(f => f.factor);

    if (factorNames.includes('low_contractor_rate')) actions.push('Consider increasing tutor pay rate');
    if (factorNames.includes('no_location')) actions.push('Add location details to the job');
    if (factorNames.includes('no_bids_3_days') || factorNames.includes('zero_bids')) actions.push('Reach out to available tutors in the area');
    if (factorNames.includes('above_avg_wait')) actions.push('Escalate — this job has been waiting longer than average');
    if (factorNames.includes('no_skills')) actions.push('Add desired skills to attract relevant tutors');

    return actions;
  }

  async getAvgPlacementDaysByChannel() {
    return getOrSet('job-health:avg-placement-days', async () => {
      const { rows } = await this.pool.query(`
        SELECT
          CASE
            WHEN s.labels::text LIKE '%"Online"%' THEN 'Online'
            WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
            WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
            WHEN s.labels::text LIKE '%"School%' THEN 'School'
            ELSE 'Other'
          END AS channel,
          AVG(ssh.duration_hours / 24.0) AS avg_days,
          COUNT(*) AS sample_size
        FROM service_status_history ssh
        JOIN services s ON s.service_id = ssh.service_id
        WHERE ssh.from_status IN ('available', 'pending')
          AND ssh.to_status IN ('live', 'in_progress')
          AND ssh.changed_at > NOW() - INTERVAL '6 months'
        GROUP BY channel
      `);

      const result = { overall: 7 };
      let totalDays = 0;
      let totalCount = 0;

      for (const row of rows) {
        result[row.channel] = parseFloat(row.avg_days) || 7;
        totalDays += (parseFloat(row.avg_days) || 7) * parseInt(row.sample_size);
        totalCount += parseInt(row.sample_size);
      }

      if (totalCount > 0) result.overall = totalDays / totalCount;
      return result;
    }, 3600);
  }

  async getAvgRatesByChannel() {
    return getOrSet('job-health:avg-rates', async () => {
      const { rows } = await this.pool.query(`
        SELECT
          CASE
            WHEN s.labels::text LIKE '%"Online"%' THEN 'Online'
            WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
            WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
            WHEN s.labels::text LIKE '%"School%' THEN 'School'
            ELSE 'Other'
          END AS channel,
          AVG(s.dft_charge_rate) AS avg_charge_rate,
          AVG(s.dft_contractor_rate) AS avg_contractor_rate
        FROM services s
        WHERE s.status IN ('live', 'in_progress')
          AND s.dft_contractor_rate > 0
        GROUP BY channel
      `);

      const result = { overall: { charge: 0, contractor: 0 } };
      let totalCharge = 0;
      let totalContractor = 0;
      let count = 0;

      for (const row of rows) {
        result[row.channel] = {
          charge: parseFloat(row.avg_charge_rate) || 0,
          contractor: parseFloat(row.avg_contractor_rate) || 0,
        };
        totalCharge += parseFloat(row.avg_charge_rate) || 0;
        totalContractor += parseFloat(row.avg_contractor_rate) || 0;
        count++;
      }

      if (count > 0) result.overall = { charge: totalCharge / count, contractor: totalContractor / count };
      return result;
    }, 3600);
  }

  async getAnalytics() {
    return getOrSet('job-health:analytics', async () => {
      const [placementByChannel, placementOverTime, coldJobs, currentUnplaced] = await Promise.all([
        this.getPlacementTimeByChannel(),
        this.getPlacementSuccessOverTime(),
        this.getColdJobPatterns(),
        this.getCurrentUnplacedCount(),
      ]);

      return {
        placement_by_channel: placementByChannel,
        placement_over_time: placementOverTime,
        cold_jobs: coldJobs,
        current_unplaced: currentUnplaced,
      };
    }, 1800);
  }

  async getPlacementTimeByChannel() {
    const { rows } = await this.pool.query(`
      SELECT
        CASE
          WHEN s.labels::text LIKE '%"Online"%' THEN 'Online'
          WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
          WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
          WHEN s.labels::text LIKE '%"School%' THEN 'School'
          ELSE 'Other'
        END AS channel,
        ROUND(AVG(ssh.duration_hours / 24.0)::numeric, 1) AS avg_days,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ssh.duration_hours / 24.0)::numeric, 1) AS median_days,
        COUNT(*) AS total_placed,
        ROUND(MIN(ssh.duration_hours / 24.0)::numeric, 1) AS min_days,
        ROUND(MAX(ssh.duration_hours / 24.0)::numeric, 1) AS max_days
      FROM service_status_history ssh
      JOIN services s ON s.service_id = ssh.service_id
      WHERE ssh.from_status IN ('available', 'pending')
        AND ssh.to_status IN ('live', 'in_progress')
        AND ssh.changed_at > NOW() - INTERVAL '6 months'
      GROUP BY channel
      ORDER BY avg_days DESC
    `);
    return rows;
  }

  async getPlacementSuccessOverTime() {
    const { rows } = await this.pool.query(`
      WITH monthly_data AS (
        SELECT
          DATE_TRUNC('month', ssh.changed_at) AS month,
          COUNT(*) FILTER (WHERE ssh.to_status IN ('live', 'in_progress')) AS placed,
          COUNT(*) FILTER (WHERE ssh.to_status IN ('gone_cold', 'cancelled', 'deleted')) AS failed,
          COUNT(*) AS total
        FROM service_status_history ssh
        WHERE ssh.changed_at > NOW() - INTERVAL '12 months'
          AND ssh.from_status IN ('available', 'pending')
        GROUP BY month
        ORDER BY month
      )
      SELECT
        month,
        placed,
        failed,
        total,
        CASE WHEN total > 0 THEN ROUND((placed::numeric / total) * 100, 1) ELSE 0 END AS success_rate
      FROM monthly_data
    `);
    return rows;
  }

  async getColdJobPatterns() {
    const { rows } = await this.pool.query(`
      SELECT
        s.service_id,
        s.name AS job_name,
        s.dft_charge_rate,
        s.dft_contractor_rate,
        s.labels,
        CASE
          WHEN s.labels::text LIKE '%"Online"%' THEN 'Online'
          WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
          WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
          WHEN s.labels::text LIKE '%"School%' THEN 'School'
          ELSE 'Other'
        END AS channel,
        ssh.duration_hours,
        ROUND((ssh.duration_hours / 24.0)::numeric, 1) AS days_before_cold,
        ssh.changed_at AS went_cold_at
      FROM service_status_history ssh
      JOIN services s ON s.service_id = ssh.service_id
      WHERE ssh.to_status IN ('gone_cold', 'cancelled')
        AND ssh.from_status IN ('available', 'pending')
        AND ssh.changed_at > NOW() - INTERVAL '6 months'
      ORDER BY ssh.changed_at DESC
      LIMIT 50
    `);
    return rows;
  }

  async getCurrentUnplacedCount() {
    const { rows } = await this.pool.query(`
      SELECT COUNT(*) AS count
      FROM services
      WHERE status IN ('available', 'pending')
    `);
    return parseInt(rows[0]?.count) || 0;
  }

  async getJobScore(serviceId) {
    const { rows } = await this.pool.query(`
      SELECT
        s.*,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(s.status_changed_at, s.created_at))) / 86400.0 AS days_in_status,
        COALESCE(ja.bid_count, 0) AS tutor_bids_count,
        COALESCE(ja.bids, '[]'::jsonb) AS bids_detail
      FROM services s
      LEFT JOIN (
        SELECT
          service_id,
          COUNT(*) AS bid_count,
          jsonb_agg(jsonb_build_object(
            'contractor_id', contractor_id,
            'status', status,
            'created_at', created_at
          )) AS bids
        FROM job_applications
        GROUP BY service_id
      ) ja ON ja.service_id = s.service_id
      WHERE s.service_id = $1
    `, [serviceId]);

    if (rows.length === 0) return null;

    const job = rows[0];
    const channel = this.getChannelFromLabels(job.labels);
    const avgPlacementDays = await this.getAvgPlacementDaysByChannel();
    const avgRates = await this.getAvgRatesByChannel();
    const { score, factors } = this.calculateRiskScore(job, channel, avgPlacementDays, avgRates);

    const { rows: history } = await this.pool.query(`
      SELECT from_status, to_status, changed_at, duration_hours
      FROM service_status_history
      WHERE service_id = $1
      ORDER BY changed_at DESC
    `, [serviceId]);

    return {
      ...job,
      channel,
      risk_score: score,
      risk_factors: factors,
      suggested_actions: this.getSuggestedActions(factors),
      status_history: history,
      avg_placement_days: avgPlacementDays[channel] || avgPlacementDays.overall,
      tc_url: `https://secure.tutorcruncher.com/cal/service/${serviceId}/`,
    };
  }

  async recalculateAllScores() {
    // Clear cache first so getAtRiskJobs fetches fresh data
    await clearCacheByPrefix('job-health');

    const jobs = await this.getAtRiskJobs();
    const avgPlacementDays = await this.getAvgPlacementDaysByChannel();

    for (const job of jobs) {
      const daysInStatus = parseFloat(job.days_in_status) || 0;
      try {
        await this.pool.query(`
          INSERT INTO job_placement_scores (service_id, risk_score, risk_factors, tutor_bids_count, days_in_current_status, avg_market_placement_days, calculated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (service_id) DO UPDATE SET
            risk_score = EXCLUDED.risk_score,
            risk_factors = EXCLUDED.risk_factors,
            tutor_bids_count = EXCLUDED.tutor_bids_count,
            days_in_current_status = EXCLUDED.days_in_current_status,
            avg_market_placement_days = EXCLUDED.avg_market_placement_days,
            calculated_at = NOW()
        `, [
          job.service_id,
          job.risk_score,
          JSON.stringify(job.risk_factors),
          job.tutor_bids_count || 0,
          daysInStatus,
          avgPlacementDays[job.channel] || avgPlacementDays.overall || 7,
        ]);
      } catch (err) {
        logger.error({ err, serviceId: job.service_id }, 'Failed to update placement score');
      }
    }

    await clearCacheByPrefix('job-health');
    return { updated: jobs.length };
  }

  async recordStatusChange(serviceId, fromStatus, toStatus) {
    try {
      const { rows: lastEntry } = await this.pool.query(`
        SELECT changed_at FROM service_status_history
        WHERE service_id = $1
        ORDER BY changed_at DESC
        LIMIT 1
      `, [serviceId]);

      let durationHours = null;
      if (lastEntry.length > 0) {
        const lastChange = new Date(lastEntry[0].changed_at);
        durationHours = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60);
      }

      await this.pool.query(`
        INSERT INTO service_status_history (service_id, from_status, to_status, changed_at, duration_hours)
        VALUES ($1, $2, $3, NOW(), $4)
      `, [serviceId, fromStatus, toStatus, durationHours]);

      await this.pool.query(`
        UPDATE services SET status_changed_at = NOW() WHERE service_id = $1
      `, [serviceId]);

      await clearCacheByPrefix('job-health');

      logger.info({ serviceId, fromStatus, toStatus, durationHours }, 'Recorded service status change');
    } catch (err) {
      logger.error({ err, serviceId }, 'Failed to record status change');
    }
  }

  getChannelFromLabels(labels) {
    if (!labels) return 'Other';
    const labelsStr = typeof labels === 'string' ? labels : JSON.stringify(labels);
    if (labelsStr.includes('"Online"')) return 'Online';
    if (labelsStr.includes('"Home ')) return 'Home';
    if (labelsStr.includes('"Club ')) return 'Club';
    if (labelsStr.includes('"School')) return 'School';
    return 'Other';
  }
}

module.exports = JobHealthService;
