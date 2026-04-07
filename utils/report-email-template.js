/**
 * Report Email Template Generator
 * Creates HTML emails matching the analytics dashboard design
 */

const { DateTime } = require('luxon');
const { logger } = require('./logger');

let puppeteer;
let chromium;
try {
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} catch (e) {
  logger.warn({ data: e.message }, 'Puppeteer/Chromium not available for chart generation:');
}

/**
 * Format currency
 */
function formatCurrency(value) {
  if (value === null || value === undefined) return '$0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Format number with commas
 */
function formatNumber(value) {
  if (value === null || value === undefined) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US').format(Math.round(num));
}

/**
 * Format percentage
 */
function formatPercent(value) {
  if (value === null || value === undefined) return '0%';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num.toFixed(1)}%`;
}

/**
 * Generate SVG chart for Puppeteer image generation
 */
function generateSVGChart(series, reportType) {
  if (!series || series.length === 0) {
    return '<svg width="800" height="260"></svg>';
  }

  const chartWidth = 800;
  const chartHeight = 260;
  const padding = { top: 20, right: 60, left: 80, bottom: 50 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // Format labels
  const formatLabel = (dateISO) => {
    const d = DateTime.fromISO(dateISO);
    if (reportType === 'weekly') {
      return d.toFormat('MMM d');
    }
    return d.toFormat('MMM yy');
  };

  // Prepare data points
  const chartData = series.map(p => ({
    name: formatLabel(p.periodStart),
    revenue: Number(p.revenue || 0),
    profit: Number(p.profit || 0),
    periodStart: p.periodStart
  }));

  const maxRevenue = Math.max(...chartData.map(d => d.revenue));
  const maxProfit = Math.max(...chartData.map(d => d.profit));
  const maxValue = Math.max(maxRevenue, maxProfit, 1);
  
  // Round up to nice round number for Y-axis
  const yMax = Math.ceil(maxValue / 50000) * 50000;
  const yStep = yMax / 4;

  // Calculate x positions
  const xStep = plotWidth / (chartData.length - 1 || 1);
  
  // Scale functions
  const scaleX = (index) => padding.left + (index * xStep);
  const scaleY = (value) => padding.top + plotHeight - (value / yMax * plotHeight);

  // Generate path for revenue line (smooth curve)
  const generateSmoothPath = (data, valueKey) => {
    if (data.length === 0) return '';
    if (data.length === 1) {
      const x = scaleX(0);
      const y = scaleY(data[0][valueKey]);
      return `M ${x} ${y} L ${x} ${y}`;
    }
    
    let path = `M ${scaleX(0)} ${scaleY(data[0][valueKey])}`;
    
    // Use quadratic bezier curves for smooth lines
    for (let i = 1; i < data.length; i++) {
      const x0 = scaleX(i - 1);
      const y0 = scaleY(data[i - 1][valueKey]);
      const x1 = scaleX(i);
      const y1 = scaleY(data[i][valueKey]);
      
      // Control point for smooth curve
      const cpX = (x0 + x1) / 2;
      const cpY = (y0 + y1) / 2;
      
      path += ` Q ${cpX} ${y0} ${cpX} ${cpY} T ${x1} ${y1}`;
    }
    
    return path;
  };

  // Generate area path (closed path under the line)
  const generateAreaPath = (data, valueKey) => {
    const linePath = generateSmoothPath(data, valueKey);
    if (!linePath) return '';
    
    const firstX = scaleX(0);
    const lastX = scaleX(data.length - 1);
    const baseY = padding.top + plotHeight;
    
    return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  };

  const revenuePath = generateSmoothPath(chartData, 'revenue');
  const profitPath = generateSmoothPath(chartData, 'profit');
  const revenueAreaPath = generateAreaPath(chartData, 'revenue');
  const profitAreaPath = generateAreaPath(chartData, 'profit');

  // Format currency for chart
  const formatChartCurrency = (value) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}k`;
    }
    return `$${value.toFixed(0)}`;
  };

  // Get first and last period values for side labels
  const firstPeriod = chartData[0] || {};
  const lastPeriod = chartData[chartData.length - 1] || {};
  const firstRevenue = firstPeriod.revenue || 0;
  const firstProfit = firstPeriod.profit || 0;
  const lastRevenue = lastPeriod.revenue || 0;
  const lastProfit = lastPeriod.profit || 0;

  // Generate SVG chart
  let svg = `
    <svg width="${chartWidth}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect width="${chartWidth}" height="${chartHeight}" fill="#ffffff"/>
      
      <!-- Grid lines (horizontal) -->
      ${Array.from({ length: 5 }, (_, i) => {
        const y = padding.top + (plotHeight / 4) * i;
        return `<line x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="3,3"/>`;
      }).join('')}
      
      <!-- Y-axis labels (left) -->
      ${Array.from({ length: 5 }, (_, i) => {
        const value = yStep * (4 - i);
        const y = padding.top + (plotHeight / 4) * i;
        return `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#6b7280" font-family="Arial, sans-serif">${formatChartCurrency(value)}</text>`;
      }).join('')}
      
      <!-- Y-axis labels (right) -->
      ${Array.from({ length: 5 }, (_, i) => {
        const value = yStep * (4 - i);
        const y = padding.top + (plotHeight / 4) * i;
        return `<text x="${chartWidth - padding.right + 10}" y="${y + 4}" text-anchor="start" font-size="12" fill="#6b7280" font-family="Arial, sans-serif">${formatChartCurrency(value)}</text>`;
      }).join('')}
      
      <!-- Revenue area (purple, semi-transparent) -->
      <path d="${revenueAreaPath}" fill="#6D28D9" fill-opacity="0.15" stroke="none"/>
      
      <!-- Profit area (green, semi-transparent) -->
      <path d="${profitAreaPath}" fill="#16A34A" fill-opacity="0.15" stroke="none"/>
      
      <!-- Revenue line (purple) -->
      <path d="${revenuePath}" fill="none" stroke="#6D28D9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      
      <!-- Profit line (green) -->
      <path d="${profitPath}" fill="none" stroke="#16A34A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      
      <!-- Data points for revenue -->
      ${chartData.map((d, i) => {
        const x = scaleX(i);
        const y = scaleY(d.revenue);
        return `<circle cx="${x}" cy="${y}" r="4" fill="#6D28D9"/>`;
      }).join('')}
      
      <!-- Data points for profit -->
      ${chartData.map((d, i) => {
        const x = scaleX(i);
        const y = scaleY(d.profit);
        return `<circle cx="${x}" cy="${y}" r="4" fill="#16A34A"/>`;
      }).join('')}
      
      <!-- X-axis labels -->
      ${chartData.map((d, i) => {
        const x = scaleX(i);
        const y = chartHeight - padding.bottom + 20;
        return `<text x="${x}" y="${y}" text-anchor="middle" font-size="12" fill="#6b7280" font-family="Arial, sans-serif">${d.name}</text>`;
      }).join('')}
      
      <!-- Left side value labels -->
      <text x="${padding.left - 15}" y="${padding.top + 5}" text-anchor="end" font-size="10" fill="#6b7280" font-family="Arial, sans-serif" font-weight="600">${chartData[0].name}</text>
      <text x="${padding.left - 15}" y="${scaleY(firstRevenue) + 4}" text-anchor="end" font-size="12" fill="#6D28D9" font-family="Arial, sans-serif" font-weight="700">${formatChartCurrency(firstRevenue)}</text>
      <text x="${padding.left - 15}" y="${scaleY(firstProfit) + 4}" text-anchor="end" font-size="12" fill="#16A34A" font-family="Arial, sans-serif" font-weight="700">${formatChartCurrency(firstProfit)}</text>
      
      <!-- Right side value labels -->
      <text x="${chartWidth - padding.right + 15}" y="${padding.top + 5}" text-anchor="start" font-size="10" fill="#6b7280" font-family="Arial, sans-serif" font-weight="600">${chartData[chartData.length - 1].name}</text>
      <text x="${chartWidth - padding.right + 15}" y="${scaleY(lastRevenue) + 4}" text-anchor="start" font-size="12" fill="#6D28D9" font-family="Arial, sans-serif" font-weight="700">${formatChartCurrency(lastRevenue)}</text>
      <text x="${chartWidth - padding.right + 15}" y="${scaleY(lastProfit) + 4}" text-anchor="start" font-size="12" fill="#16A34A" font-family="Arial, sans-serif" font-weight="700">${formatChartCurrency(lastProfit)}</text>
    </svg>
  `;

  return svg;
}

/**
 * Generate HTML/CSS bar chart for email (email-client compatible)
 * Creates a visual representation using HTML tables and CSS gradients
 */
function generateChartHTML(series, reportType) {
  if (!series || series.length === 0) {
    return '<div style="height: 260px; display: table-cell; vertical-align: middle; text-align: center; color: #666; padding: 20px;">No data available</div>';
  }

  const chartHeight = 200;
  const numPoints = series.length;
  
  // Format labels
  const formatLabel = (dateISO) => {
    const d = DateTime.fromISO(dateISO);
    if (reportType === 'weekly') {
      return d.toFormat('MMM d');
    }
    return d.toFormat('MMM yy');
  };

  // Prepare data
  const chartData = series.map(p => ({
    name: formatLabel(p.periodStart),
    revenue: Number(p.revenue || 0),
    profit: Number(p.profit || 0),
    periodStart: p.periodStart
  }));

  const maxRevenue = Math.max(...chartData.map(d => d.revenue));
  const maxProfit = Math.max(...chartData.map(d => d.profit));
  const maxValue = Math.max(maxRevenue, maxProfit, 1);
  
  // Round up to nice number
  const yMax = Math.ceil(maxValue / 50000) * 50000;
  const yStep = yMax / 4;
  
  // Format currency for display
  const formatChartCurrency = (value) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}k`;
    }
    return `$${value.toFixed(0)}`;
  };

  // Get first and last values
  const firstPeriod = chartData[0] || {};
  const lastPeriod = chartData[chartData.length - 1] || {};
  const firstRevenue = firstPeriod.revenue || 0;
  const firstProfit = firstPeriod.profit || 0;
  const lastRevenue = lastPeriod.revenue || 0;
  const lastProfit = lastPeriod.profit || 0;

  // Generate HTML table-based chart with bars
  let chartHTML = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-family: Arial, sans-serif; table-layout: fixed;">
      <tr>
        <!-- Left side labels -->
        <td width="12%" style="vertical-align: top; padding-right: 8px; text-align: right;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="font-size: 10px; color: #6b7280; padding-bottom: 4px; text-align: right; font-weight: 600;">${chartData[0].name}</td></tr>
            <tr><td style="font-size: 12px; color: #6D28D9; font-weight: 700; padding-bottom: 2px; text-align: right;">${formatChartCurrency(firstRevenue)}</td></tr>
            <tr><td style="font-size: 12px; color: #16A34A; font-weight: 700; text-align: right;">${formatChartCurrency(firstProfit)}</td></tr>
          </table>
        </td>
        <!-- Chart area -->
        <td width="76%" style="vertical-align: bottom;">
          <!-- Y-axis labels on left of chart -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; height: ${chartHeight}px;">
            <tr>
              <td width="8%" style="vertical-align: top; text-align: right; padding-right: 5px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="height: 100%;">
                  ${Array.from({ length: 5 }, (_, i) => {
                    return `
                      <tr>
                        <td style="height: 25%; vertical-align: top; padding-top: ${i === 0 ? '0' : '2px'};">
                          <div style="font-size: 10px; color: #6b7280; text-align: right;">${formatChartCurrency(yStep * (4 - i))}</div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </table>
              </td>
              <!-- Bars area -->
              <td width="92%" style="vertical-align: bottom;">
                <table width="100%" cellpadding="0" cellspacing="2" border="0" style="border-collapse: collapse; height: ${chartHeight}px;">
                  <tr>
                    ${chartData.map((d, i) => {
                      const revenueHeight = Math.max((d.revenue / yMax) * chartHeight, 2);
                      const profitHeight = Math.max((d.profit / yMax) * chartHeight, 2);
                      const barWidth = Math.floor(92 / numPoints);
                      
                      return `
                        <td width="${barWidth}%" style="vertical-align: bottom; padding: 0 1px;">
                          <table width="100%" cellpadding="0" cellspacing="1" border="0" style="border-collapse: collapse; height: 100%;">
                            <tr>
                              <!-- Revenue bar -->
                              <td width="50%" style="vertical-align: bottom;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; height: 100%;">
                                  <tr>
                                    <td style="height: ${100 - (d.revenue / yMax * 100)}%; font-size: 0; line-height: 0;">&nbsp;</td>
                                  </tr>
                                  <tr>
                                    <td style="height: ${(d.revenue / yMax * 100)}%; background-color: #6D28D9; min-height: 2px;" bgcolor="#6D28D9">&nbsp;</td>
                                  </tr>
                                </table>
                              </td>
                              <!-- Profit bar -->
                              <td width="50%" style="vertical-align: bottom;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; height: 100%;">
                                  <tr>
                                    <td style="height: ${100 - (d.profit / yMax * 100)}%; font-size: 0; line-height: 0;">&nbsp;</td>
                                  </tr>
                                  <tr>
                                    <td style="height: ${(d.profit / yMax * 100)}%; background-color: #16A34A; min-height: 2px;" bgcolor="#16A34A">&nbsp;</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      `;
                    }).join('')}
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <!-- X-axis labels -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px;">
            <tr>
              ${chartData.map((d) => {
                return `<td style="width: ${Math.floor(100 / numPoints)}%; text-align: center; font-size: 10px; color: #6b7280; padding: 0 1px;">${d.name}</td>`;
              }).join('')}
            </tr>
          </table>
        </td>
        <!-- Right side labels -->
        <td width="12%" style="vertical-align: top; padding-left: 8px; text-align: left;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="font-size: 10px; color: #6b7280; padding-bottom: 4px; text-align: left; font-weight: 600;">${chartData[chartData.length - 1].name}</td></tr>
            <tr><td style="font-size: 12px; color: #6D28D9; font-weight: 700; padding-bottom: 2px; text-align: left;">${formatChartCurrency(lastRevenue)}</td></tr>
            <tr><td style="font-size: 12px; color: #16A34A; font-weight: 700; text-align: left;">${formatChartCurrency(lastProfit)}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return chartHTML;
}

/**
 * Generate chart as base64 image using Puppeteer
 */
async function generateChartImage(series, reportType) {
  if (!puppeteer || !chromium) {
    logger.info('Puppeteer/Chromium not available, cannot generate chart image');
    return null;
  }
  
  if (!series || series.length === 0) {
    logger.info('No series data provided for chart image generation');
    return null;
  }

  try {
    logger.info(`Starting chart image generation with ${series.length} data points`);
    // Generate SVG chart for Puppeteer (SVG renders better in Puppeteer)
    const svgChart = generateSVGChart(series, reportType);
    logger.info(`Generated SVG chart, length: ${svgChart.length}`);
    const fullHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              background: white;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .chart-wrapper {
              width: 800px;
              height: 260px;
            }
          </style>
        </head>
        <body>
          <div class="chart-wrapper">
            ${svgChart}
          </div>
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: chromium.headless,
      executablePath: await chromium.executablePath(),
      args: chromium.args
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 800, height: 300 });
      await page.setContent(fullHTML, { waitUntil: 'networkidle0' });
      
      // Wait for SVG to render - check if SVG element exists
      try {
        await page.waitForSelector('svg', { timeout: 5000 });
      } catch (e) {
        logger.warn('SVG element not found, proceeding anyway');
      }
      
      // Additional wait for rendering
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Take screenshot of the chart wrapper
      const element = await page.$('.chart-wrapper');
      if (!element) {
        throw new Error('Chart wrapper element not found');
      }
      
      const screenshot = await element.screenshot({
        type: 'png'
      });
      
      await browser.close();
      
      const base64Image = screenshot.toString('base64');
      const dataUri = `data:image/png;base64,${base64Image}`;
      logger.info(`Chart image generated successfully, size: ${base64Image.length} bytes`);
      return dataUri;
    } catch (error) {
      await browser.close();
      logger.error({ data: [error.message, error.stack] }, 'Error in chart image generation (inner):');
      throw error;
    }
  } catch (error) {
    logger.error({ data: [error.message, error.stack] }, 'Error generating chart image (outer):');
    return null;
  }
}

/**
 * Generate auto-summary sentence
 */
function generateSummaryText(multiPeriod, reportType) {
  if (!multiPeriod) return '';

  const { currentPeriod, previousPeriod, deltas, categoryData } = multiPeriod;
  const periodLabel = reportType === 'weekly' ? 'week' : 'month';

  // Day-normalization for monthly/quarterly (backend deltas are already normalized)
  const currentDays = currentPeriod?.daysInPeriod;
  const previousDays = previousPeriod?.daysInPeriod;
  const shouldNormalize = (reportType === 'monthly' || reportType === 'quarterly') && currentDays && previousDays;

  const revenueDelta = deltas.totalRevenue?.vsPrevious || 0;
  const revenueChange = Math.abs(revenueDelta);

  const categoryChanges = [];
  if (categoryData) {
    Object.entries(categoryData).forEach(([category, data]) => {
      if (data && data.current && data.previous) {
        const catRevenue = data.current.revenue || 0;
        const prevRevenue = data.previous.revenue || 0;
        if (prevRevenue > 0) {
          let catDelta;
          if (shouldNormalize) {
            const currDaily = catRevenue / currentDays;
            const prevDaily = prevRevenue / previousDays;
            catDelta = prevDaily === 0 ? (currDaily > 0 ? 100 : 0) : ((currDaily - prevDaily) / prevDaily) * 100;
          } else {
            catDelta = ((catRevenue - prevRevenue) / prevRevenue) * 100;
          }
          categoryChanges.push({ category, delta: catDelta });
        }
      }
    });
  }
  
  categoryChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  
  const revenueDirection = revenueDelta > 0.5 ? 'increased' : revenueDelta < -0.5 ? 'decreased' : 'held steady';
  const revenueText = revenueChange > 0.5 ? `${revenueDelta > 0 ? '+' : ''}${revenueDelta.toFixed(1)}%` : 'slightly';
  
  let summary = `This ${periodLabel} revenue ${revenueDirection} ${revenueText}`;
  
  if (categoryChanges.length > 0) {
    const drivers = [];
    const decliners = [];
    
    categoryChanges.slice(0, 3).forEach(({ category, delta }) => {
      if (Math.abs(delta) > 5) {
        if (delta < 0) {
          decliners.push(`${category} (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%)`);
        } else {
          drivers.push(`${category} (+${delta.toFixed(1)}%)`);
        }
      }
    });
    
    if (decliners.length > 0 && revenueDelta < 0) {
      summary += ` primarily due to declines in ${decliners.slice(0, 2).join(' and ')}`;
      if (drivers.length > 0) {
        summary += `, while ${drivers[0]} held steady`;
      }
    } else if (drivers.length > 0 && revenueDelta > 0) {
      summary += ` mainly driven by ${drivers.slice(0, 2).join(' and ')}`;
      if (decliners.length > 0) {
        summary += `, while ${decliners[0]} dipped slightly`;
      }
    }
  }
  
  const margin = currentPeriod.totals.marginPct || 0;
  if (margin > 0) {
    summary += `. Profit margin was ${margin.toFixed(1)}%`;
  }
  
  return summary + '.';
}

/**
 * Format date range for display (e.g., "Jan 6-12" or "Dec 30 - Jan 5")
 */
function formatDateRange(startDate, endDate, type) {
  if (!startDate || !endDate) return '';
  const start = DateTime.fromISO(startDate);
  const end = DateTime.fromISO(endDate);

  if (type === 'monthly') {
    return start.toFormat('MMMM yyyy');
  }

  // Weekly format: "Jan 6-12" or "Dec 30 - Jan 5"
  if (start.month === end.month) {
    return `${start.toFormat('MMM d')}-${end.toFormat('d')}`;
  }
  return `${start.toFormat('MMM d')} - ${end.toFormat('MMM d')}`;
}

/**
 * Get period labels from multiPeriod data
 */
function getPeriodLabels(multiPeriod, reportType) {
  if (!multiPeriod) return { current: '', previous: '', twoAgo: '' };

  const { currentPeriod, previousPeriod, twoPeriodsAgo } = multiPeriod;

  return {
    current: currentPeriod?.dateRange
      ? formatDateRange(currentPeriod.dateRange.start, currentPeriod.dateRange.end, reportType)
      : '',
    previous: previousPeriod?.dateRange
      ? formatDateRange(previousPeriod.dateRange.start, previousPeriod.dateRange.end, reportType)
      : '',
    twoAgo: twoPeriodsAgo?.dateRange
      ? formatDateRange(twoPeriodsAgo.dateRange.start, twoPeriodsAgo.dateRange.end, reportType)
      : ''
  };
}

/**
 * Generate Total Business Overview HTML for email
 * Shows aggregate metrics across all segments with 3-period comparison
 */
function generateTotalBusinessOverviewHTML(totalBusinessMetrics, periodLabels, reportType, daysInPeriod = null) {
  if (!totalBusinessMetrics) return '';

  const { current, previous, twoPeriodsAgo } = totalBusinessMetrics;
  if (!current) return '';

  const formatValue = (value, format) => {
    if (value === undefined || value === null) return '-';
    if (format === 'currency') return formatCurrency(value);
    if (format === 'percent') return `${value.toFixed(1)}%`;
    return formatNumber(Math.round(value));
  };

  const flowMetrics = new Set(['totalRevenue', 'totalTutorPay', 'totalProfit', 'totalAdhocPay']);
  const shouldNormalize = (reportType === 'monthly' || reportType === 'quarterly') && daysInPeriod;

  const calculateDelta = (curr, prev, metricKey = null) => {
    if (!prev || prev === 0) return curr > 0 ? 100 : 0;
    if (shouldNormalize && metricKey && flowMetrics.has(metricKey)) {
      const currDaily = curr / daysInPeriod.current;
      const prevDaily = prev / daysInPeriod.previous;
      if (prevDaily === 0) return currDaily > 0 ? 100 : 0;
      return ((currDaily - prevDaily) / prevDaily) * 100;
    }
    return ((curr - prev) / prev) * 100;
  };

  const getDeltaColor = (delta) => {
    if (delta > 0.5) return '#10B981';
    if (delta < -0.5) return '#EF4444';
    return '#6B7280';
  };

  const getDeltaArrow = (delta) => {
    if (delta > 0.5) return '↑';
    if (delta < -0.5) return '↓';
    return '→';
  };

  const formatDeltaPercent = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  // Define metrics based on report type
  // Weekly/monthly show tutor hour tiers and consistency bonus; quarterly/annual do not
  const baseMetrics = [
    { key: 'totalRevenue', label: 'Total Revenue', format: 'currency' },
    { key: 'totalTutorPay', label: 'Total Tutor Pay', format: 'currency', showMargin: true },
    { key: 'activeTutors', label: 'Active Tutors', format: 'number', divider: true },
  ];

  const metrics = reportType === 'weekly' ? [
    ...baseMetrics,
    { key: 'tutors10Plus', label: 'Tutors 10+ Hours', format: 'number' },
    { key: 'pctTutors10Plus', label: '% Tutors 10+ Hours', format: 'percent' },
    { key: 'uniqueStudents', label: 'Unique Students', format: 'number' }
  ] : reportType === 'monthly' ? [
    ...baseMetrics,
    { key: 'tutors40_60', label: 'Tutors 40-59.99 hours', format: 'number' },
    { key: 'tutors60_80', label: 'Tutors 60-79.99 hours', format: 'number' },
    { key: 'tutors80Plus', label: 'Tutors 80+ hours', format: 'number' },
    { key: 'tutorsBonusTotal', label: 'Total Consistency Bonus', format: 'number' },
    { key: 'pctConsistencyBonus', label: '% Consistency Bonus', format: 'percent' },
    { key: 'uniqueStudents', label: 'Unique Students', format: 'number' }
  ] : [
    ...baseMetrics,
    { key: 'uniqueStudents', label: 'Unique Students', format: 'number' }
  ];

  // Generate table rows
  const metricRows = metrics.map(metric => {
    const currentValue = current[metric.key];
    const previousValue = previous ? previous[metric.key] : undefined;
    const twoAgoValue = twoPeriodsAgo ? twoPeriodsAgo[metric.key] : undefined;
    const delta = calculateDelta(currentValue, previousValue, metric.key);

    // Show margin % for tutor pay row
    let marginDisplay = '';
    if (metric.showMargin && current.marginPct !== undefined) {
      marginDisplay = `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">(Margin: ${current.marginPct.toFixed(1)}%)</div>`;
    }

    const dividerRow = metric.divider ? `
      <tr>
        <td colspan="5" style="padding: 4px 0;">
          <div style="border-top: 1px solid #e5e7eb;"></div>
        </td>
      </tr>
    ` : '';

    return `
      ${dividerRow}
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; font-weight: 500; color: #374151;">
          ${metric.label}
        </td>
        <td style="padding: 8px 12px; text-align: center; font-size: 13px; color: #6b7280;">
          ${formatValue(twoAgoValue, metric.format)}
        </td>
        <td style="padding: 8px 12px; text-align: center; font-size: 13px; color: #6b7280;">
          ${formatValue(previousValue, metric.format)}
        </td>
        <td style="padding: 8px 12px; text-align: center; font-size: 13px; font-weight: 600; color: #1f2937; background-color: #f5f3ff;">
          ${formatValue(currentValue, metric.format)}
          ${marginDisplay}
        </td>
        <td style="padding: 8px 12px; text-align: center; font-size: 12px; font-weight: 500; color: ${getDeltaColor(delta)};">
          ${getDeltaArrow(delta)} ${formatDeltaPercent(delta)}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 2px solid #7c3aed; border-radius: 8px; margin-bottom: 24px; overflow: hidden;">
      <!-- Header with purple gradient -->
      <tr>
        <td colspan="5" style="background: linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%); padding: 16px;">
          <div style="font-size: 18px; font-weight: 700; color: #ffffff;">
            <span style="font-size: 20px; margin-right: 8px;">📊</span>
            Total Tutoring Business Overview
          </div>
        </td>
      </tr>
      <!-- Column Headers with Date Ranges -->
      <tr style="background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
        <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; width: 35%;">
          Metric
        </th>
        <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase;">
          ${periodLabels.twoAgo || '2 Periods Ago'}
        </th>
        <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase;">
          ${periodLabels.previous || 'Previous'}
        </th>
        <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #7c3aed; text-transform: uppercase; background-color: #f5f3ff;">
          ${periodLabels.current || 'Current'} ★
        </th>
        <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase;">
          Change
        </th>
      </tr>
      <!-- Metric Rows -->
      ${metricRows}
    </table>
  `;
}

/**
 * Generate segment card HTML for email (matches Executive Reports design)
 */
function generateSegmentCardHTML(title, icon, segment, multiPeriod, metrics, periodLabels, reportType) {
  if (!multiPeriod) return '';

  const { currentPeriod, previousPeriod, twoPeriodsAgo, categoryData, segmentMetrics } = multiPeriod;

  // Map segment names to keys
  const segmentKeyMap = {
    home: 'home',
    online: 'online',
    school: 'schools',
    schools: 'schools',
    club: 'club'
  };

  const segmentKey = segmentKeyMap[segment] || segment;

  // Get segment data from segmentMetrics first, then categoryData, then totals
  const getSegmentData = (period, periodType) => {
    if (!period) return {};

    // First, try segmentMetrics (new detailed metrics)
    if (segmentMetrics) {
      let segmentData = null;
      if (periodType === 'current' && segmentMetrics.current) {
        segmentData = segmentMetrics.current[segmentKey];
      } else if (periodType === 'previous' && segmentMetrics.previous) {
        segmentData = segmentMetrics.previous[segmentKey];
      } else if (periodType === 'twoAgo' && segmentMetrics.twoPeriodsAgo) {
        segmentData = segmentMetrics.twoPeriodsAgo[segmentKey];
      }

      if (segmentData) {
        // Merge with categoryData if available for additional metrics
        const categoryName = segment.charAt(0).toUpperCase() + segment.slice(1);
        let catData = {};
        if (categoryData && categoryData[categoryName]) {
          if (periodType === 'current' && categoryData[categoryName].current) {
            catData = categoryData[categoryName].current;
          } else if (periodType === 'previous' && categoryData[categoryName].previous) {
            catData = categoryData[categoryName].previous;
          } else if (periodType === 'twoAgo' && categoryData[categoryName].twoPeriodsAgo) {
            catData = categoryData[categoryName].twoPeriodsAgo;
          }
        }
        return { ...catData, ...segmentData };
      }
    }

    // Fallback to categoryData
    const categoryName = segment.charAt(0).toUpperCase() + segment.slice(1);
    if (categoryData && categoryData[categoryName]) {
      const catData = categoryData[categoryName];
      if (periodType === 'current' && catData.current) {
        return catData.current;
      } else if (periodType === 'previous' && catData.previous) {
        return catData.previous;
      } else if (periodType === 'twoAgo' && catData.twoPeriodsAgo) {
        return catData.twoPeriodsAgo;
      }
    }

    // Final fallback to totals
    return period.totals || period.analytics || {};
  };

  const currentData = getSegmentData(currentPeriod, 'current');
  const previousData = getSegmentData(previousPeriod, 'previous');
  const twoAgoData = getSegmentData(twoPeriodsAgo, 'twoAgo');

  const formatValue = (value, format) => {
    if (value === undefined || value === null) return '-';

    if (format === 'currency') {
      return formatCurrency(value);
    }

    if (format === 'percent') {
      return `${value.toFixed(1)}%`;
    }

    return formatNumber(Math.round(value));
  };

  // Day-normalization for monthly/quarterly segment deltas
  const currentDays = currentPeriod?.daysInPeriod;
  const previousDays = previousPeriod?.daysInPeriod;
  const shouldNormalize = (reportType === 'monthly' || reportType === 'quarterly') && currentDays && previousDays;
  const flowMetrics = new Set(['revenue', 'tutorPay', 'profit', 'adhocPay', 'totalRevenue', 'totalTutorPay', 'totalProfit', 'totalAdhocPay']);

  const calculateDelta = (current, previous, metricKey = null) => {
    if (!previous || previous === 0) {
      return current > 0 ? 100 : 0;
    }
    if (shouldNormalize && metricKey && flowMetrics.has(metricKey)) {
      const currDaily = current / currentDays;
      const prevDaily = previous / previousDays;
      if (prevDaily === 0) return currDaily > 0 ? 100 : 0;
      return ((currDaily - prevDaily) / prevDaily) * 100;
    }
    return ((current - previous) / previous) * 100;
  };

  const getDeltaColor = (delta) => {
    if (delta > 0.5) return '#10B981';
    if (delta < -0.5) return '#EF4444';
    return '#6B7280';
  };

  const getDeltaArrow = (delta) => {
    if (delta > 0.5) return '↑';
    if (delta < -0.5) return '↓';
    return '→';
  };

  const formatDeltaPercent = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  // Map metric keys to data keys (handle different naming conventions)
  const getMetricValue = (data, key) => {
    // Direct match
    if (data[key] !== undefined) return data[key];

    // Common aliases for backward compatibility
    const aliases = {
      // New names -> old names
      activeStudents: ['studentsTaught', 'students', 'totalStudents', 'uniqueStudents'],
      activeTutors: ['tutors', 'totalTutors'],
      tutorPay: ['pay', 'totalTutorPay'],
      lessonsCompleted: ['classesHeld', 'totalLessons', 'lessonCount'],
      revenue: ['totalRevenue'],
      newLeads: ['leads', 'leadCount'],
      trialLessons: ['trials', 'trialCount', 'totalTrials'],
      firstPaidLessons: ['firstLessons', 'firstLessonCount'],
      thirdLessons: ['thirdLessonCount'],
      activeSchools: ['schoolCount', 'uniqueSchools'],
      campSessions: ['camps', 'campCount'],
      campDays: ['campDaysCount'],
      campStudents: ['campKids', 'campKidsCount'],
      classPackPurchases: ['trialsConverted', 'trialsToClassPack', 'convertedTrials'],
      // Old names -> new names (for backward compatibility)
      studentsTaught: ['activeStudents'],
      leads: ['newLeads'],
      trials: ['trialLessons'],
      firstLessons: ['firstPaidLessons'],
      classesHeld: ['lessonsCompleted'],
      camps: ['campSessions'],
      campKids: ['campStudents'],
      trialsConverted: ['classPackPurchases'],
      tutors: ['activeTutors']
    };

    if (aliases[key]) {
      for (const alias of aliases[key]) {
        if (data[alias] !== undefined) return data[alias];
      }
    }

    return undefined;
  };

  // Generate table rows for each metric
  const metricRows = metrics.map(metric => {
    const currentValue = getMetricValue(currentData, metric.key);
    const previousValue = getMetricValue(previousData, metric.key);
    const twoAgoValue = getMetricValue(twoAgoData, metric.key);
    const delta = calculateDelta(currentValue, previousValue, metric.key);

    // Margin display for tutor pay
    const twoAgoMargin = metric.showMargin && twoAgoData.marginPct !== undefined
      ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">(${twoAgoData.marginPct.toFixed(1)}%)</div>` : '';
    const prevMargin = metric.showMargin && previousData.marginPct !== undefined
      ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">(${previousData.marginPct.toFixed(1)}%)</div>` : '';
    const currentMargin = metric.showMargin && currentData.marginPct !== undefined
      ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">(Margin: ${currentData.marginPct.toFixed(1)}%)</div>` : '';

    const dividerRow = metric.divider ? `
      <tr>
        <td colspan="5" style="padding: 4px 0;">
          <div style="border-top: 1px solid #e5e7eb;"></div>
        </td>
      </tr>
    ` : '';

    return `
      ${dividerRow}
      <tr>
        <td style="padding: 8px 12px; font-size: 13px; font-weight: 500; color: #374151;">
          ${metric.label}
        </td>
        <td style="padding: 8px 12px; text-align: center; font-size: 13px; color: #6b7280;">
          ${formatValue(twoAgoValue, metric.format)}${twoAgoMargin}
        </td>
        <td style="padding: 8px 12px; text-align: center; font-size: 13px; color: #6b7280;">
          ${formatValue(previousValue, metric.format)}${prevMargin}
        </td>
        <td style="padding: 8px 12px; text-align: center; font-size: 13px; font-weight: 600; color: #1f2937; background-color: #faf5ff;">
          ${formatValue(currentValue, metric.format)}${currentMargin}
        </td>
        <td style="padding: 8px 12px; text-align: center; font-size: 12px; font-weight: 500; color: ${getDeltaColor(delta)};">
          ${getDeltaArrow(delta)} ${formatDeltaPercent(delta)}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px; overflow: hidden;">
      <!-- Header -->
      <tr>
        <td colspan="5" style="background: #f9fafb; border-bottom: 1px solid #e5e7eb; padding: 16px;">
          <div style="font-size: 16px; font-weight: 600; color: #1f2937;">
            <span style="font-size: 18px; margin-right: 8px;">${icon}</span>
            ${title}
          </div>
        </td>
      </tr>
      <!-- Column Headers with Date Ranges -->
      <tr style="background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
        <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; width: 35%;">
          Metric
        </th>
        <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase;">
          ${periodLabels.twoAgo || '2 Periods Ago'}
        </th>
        <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase;">
          ${periodLabels.previous || 'Previous'}
        </th>
        <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #7c3aed; text-transform: uppercase; background-color: #faf5ff;">
          ${periodLabels.current || 'Current'} ★
        </th>
        <th style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase;">
          Change
        </th>
      </tr>
      <!-- Metric Rows -->
      ${metricRows}
    </table>
  `;
}

/**
 * Generate KPI comparison card HTML for email
 */
function generateKpiCardHTML(kpiName, kpiKey, multiPeriod, reportType) {
  if (!multiPeriod) return '';

  const { currentPeriod, previousPeriod, twoPeriodsAgo, deltas, momentum } = multiPeriod;
  const periodLabels = getPeriodLabels(multiPeriod, reportType);

  const current = currentPeriod.totals[kpiKey] || 0;
  const previous = previousPeriod.totals[kpiKey] || 0;
  const twoAgo = twoPeriodsAgo.totals[kpiKey] || 0;

  const deltaVsPrev = deltas[kpiKey]?.vsPrevious || 0;
  const deltaVsTwoAgo = deltas[kpiKey]?.vsTwoPeriodsAgo || 0;
  const momentumScore = momentum[kpiKey] || 0;

  const formatValue = (val) => {
    if (kpiKey.includes('Revenue') || kpiKey.includes('Pay') || kpiKey.includes('Profit')) {
      return formatCurrency(val);
    }
    return formatNumber(val);
  };

  const getDeltaColor = (delta) => {
    if (delta > 0.5) return '#10B981';
    if (delta < -0.5) return '#EF4444';
    return '#6B7280';
  };

  const getDeltaArrow = (delta) => {
    if (delta > 0.5) return '↑';
    if (delta < -0.5) return '↓';
    return '→';
  };

  const getMomentumText = (score) => {
    if (score >= 2) return '↑↑ (improving both periods)';
    if (score === 1) return '↑ (improving vs previous)';
    if (score === -1) return '↓ (down vs previous)';
    if (score <= -2) return '↓↓ (declining both periods)';
    return '→ (mixed)';
  };

  const getMomentumColor = (score) => {
    if (score >= 1) return '#10B981';
    if (score <= -1) return '#EF4444';
    return '#6B7280';
  };

  return `
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; margin: 0;">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
        <h3 style="font-size: 16px; font-weight: 600; color: #1f2937; margin: 0;">${kpiName}</h3>
        <div style="font-size: 12px; font-weight: 500; color: ${getMomentumColor(momentumScore)};">
          ${getMomentumText(momentumScore)}
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <!-- Two Periods Ago (left - oldest) -->
          <td style="width: 33.33%; text-align: center; padding: 8px; vertical-align: top;">
            <div style="font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 8px;">
              ${periodLabels.twoAgo || (reportType === 'weekly' ? '2W' : '2M')}
            </div>
            <div style="font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 4px;">
              ${formatValue(twoAgo)}
            </div>
            <div style="font-size: 11px; font-weight: 500; color: #9ca3af; margin-bottom: 2px;">
              vs Current:
            </div>
            <div style="font-size: 12px; font-weight: 600; color: ${getDeltaColor(deltaVsTwoAgo)};">
              ${getDeltaArrow(deltaVsTwoAgo)} ${deltaVsTwoAgo >= 0 ? '+' : ''}${deltaVsTwoAgo.toFixed(1)}%
            </div>
          </td>
          <!-- Previous Period (middle) -->
          <td style="width: 33.33%; text-align: center; padding: 12px; vertical-align: top;">
            <div style="font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 8px;">
              ${periodLabels.previous || (reportType === 'weekly' ? 'PW' : 'PM')}
            </div>
            <div style="font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 4px;">
              ${formatValue(previous)}
            </div>
            <div style="font-size: 11px; font-weight: 500; color: #9ca3af; margin-bottom: 2px;">
              vs Current:
            </div>
            <div style="font-size: 12px; font-weight: 600; color: ${getDeltaColor(deltaVsPrev)};">
              ${getDeltaArrow(deltaVsPrev)} ${deltaVsPrev >= 0 ? '+' : ''}${deltaVsPrev.toFixed(1)}%
            </div>
          </td>
          <!-- Current Period (right - newest) -->
          <td style="width: 33.33%; text-align: center; padding: 12px; vertical-align: top;">
            <div style="font-size: 11px; font-weight: 600; color: #7c3aed; margin-bottom: 8px;">
              ${periodLabels.current || (reportType === 'weekly' ? 'CW' : 'CM')} ★
            </div>
            <div style="font-size: 24px; font-weight: 700; color: #1f2937;">
              ${formatValue(current)}
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
}

/**
 * Generate category card HTML for email
 */
function generateCategoryCardHTML(category, categoryData, reportType, daysInPeriod = null) {
  if (!categoryData) {
    return `
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; margin: 0;">
        <div style="font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 12px;">${category}</div>
        <div style="text-align: center; color: #6b7280; padding: 20px;">No data available</div>
      </div>
    `;
  }
  
  const { current, previous } = categoryData;

  const flowMetrics = new Set(['revenue', 'profit', 'lessons', 'hours']);
  const shouldNormalize = (reportType === 'monthly' || reportType === 'quarterly') && daysInPeriod;

  const calculateDelta = (curr, prev, metricKey = null) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    if (shouldNormalize && metricKey && flowMetrics.has(metricKey)) {
      const currDaily = curr / daysInPeriod.current;
      const prevDaily = prev / daysInPeriod.previous;
      if (prevDaily === 0) return currDaily > 0 ? 100 : 0;
      return ((currDaily - prevDaily) / prevDaily) * 100;
    }
    return ((curr - prev) / prev) * 100;
  };

  const getDeltaColor = (delta) => {
    if (delta > 0.5) return '#10B981';
    if (delta < -0.5) return '#EF4444';
    return '#6B7280';
  };
  
  const getDeltaArrow = (delta) => {
    if (delta > 0.5) return '↑';
    if (delta < -0.5) return '↓';
    return '→';
  };
  
  const revenueDelta = calculateDelta(current.revenue, previous.revenue, 'revenue');
  const profitDelta = calculateDelta(current.profit, previous.profit, 'profit');
  const lessonsDelta = calculateDelta(current.lessons, previous.lessons, 'lessons');
  const hoursDelta = calculateDelta(current.hours, previous.hours, 'hours');
  
  // Simple sparkline SVG (3 points) for revenue - matching React component logic
  const twoAgo = categoryData.twoPeriodsAgo || {};
  const revenueSparkline = [
    twoAgo.revenue || 0,
    previous.revenue || 0,
    current.revenue || 0
  ];
  const profitSparkline = [
    twoAgo.profit || 0,
    previous.profit || 0,
    current.profit || 0
  ];
  
  // Generate sparkline visualization using HTML table (more email-friendly than SVG)
  const periodLabels = reportType === 'weekly' 
    ? { twoAgo: '2W', previous: 'PW', current: 'CW' }
    : { twoAgo: '2M', previous: 'PM', current: 'CM' };
  
  const generateSparklineHTML = (data, color) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    
    // Create a simple bar/sparkline using table cells with labels
    const labels = [periodLabels.twoAgo, periodLabels.previous, periodLabels.current];
    const bars = data.map((value, index) => {
      const height = range > 0 ? ((value - min) / range) * 100 : 50;
      return `<td style="width: 33.33%; padding: 0 2px; vertical-align: bottom; text-align: center;">
        <div style="background-color: ${color}; height: ${Math.max(2, height)}%; min-height: 2px; width: 100%; border-radius: 1px; margin-bottom: 2px;"></div>
        <div style="font-size: 9px; color: #6b7280; text-align: center; padding-top: 2px;">${labels[index]}</div>
      </td>`;
    }).join('');
    
    return `<table style="width: 100%; height: 20px; border-collapse: collapse; margin: 0 auto;">
      <tr style="height: 20px; vertical-align: bottom;">
        ${bars}
      </tr>
    </table>`;
  };
  
  const revenueSparklineHTML = generateSparklineHTML(revenueSparkline, '#7C3AED');
  const profitSparklineHTML = generateSparklineHTML(profitSparkline, '#10B981');
  
  return `
    <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; table-layout: fixed;">
      <tr>
        <td style="padding: 24px; width: 100%;">
          <div style="font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 12px;">${category}</div>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="font-size: 14px; color: #6b7280;">Lessons</td>
                    <td style="text-align: right;">
                      <span style="font-size: 14px; font-weight: 600; color: #1f2937;">${formatNumber(current.lessons)}</span>
                      <span style="font-size: 12px; font-weight: 500; color: ${getDeltaColor(lessonsDelta)}; margin-left: 8px;">
                        ${getDeltaArrow(lessonsDelta)} ${lessonsDelta >= 0 ? '+' : ''}${lessonsDelta.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="font-size: 14px; color: #6b7280;">Hours</td>
                    <td style="text-align: right;">
                      <span style="font-size: 14px; font-weight: 600; color: #1f2937;">${formatNumber(current.hours)}</span>
                      <span style="font-size: 12px; font-weight: 500; color: ${getDeltaColor(hoursDelta)}; margin-left: 8px;">
                        ${getDeltaArrow(hoursDelta)} ${hoursDelta >= 0 ? '+' : ''}${hoursDelta.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="font-size: 14px; color: #6b7280;">Revenue</td>
                    <td style="text-align: right;">
                      <span style="font-size: 14px; font-weight: 600; color: #1f2937;">${formatCurrency(current.revenue)}</span>
                      <span style="font-size: 12px; font-weight: 500; color: ${getDeltaColor(revenueDelta)}; margin-left: 8px;">
                        ${getDeltaArrow(revenueDelta)} ${revenueDelta >= 0 ? '+' : ''}${revenueDelta.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="font-size: 14px; color: #6b7280;">Profit</td>
                    <td style="text-align: right;">
                      <span style="font-size: 14px; font-weight: 600; color: #1f2937;">${formatCurrency(current.profit)}</span>
                      <span style="font-size: 12px; font-weight: 500; color: ${getDeltaColor(profitDelta)}; margin-left: 8px;">
                        ${getDeltaArrow(profitDelta)} ${profitDelta >= 0 ? '+' : ''}${profitDelta.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="width: 50%; text-align: center; padding: 4px; vertical-align: middle;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="text-align: center; padding: 0;">
                        ${revenueSparklineHTML}
                      </td>
                      <td style="padding-left: 8px; vertical-align: middle; text-align: left;">
                        <span style="font-size: 12px; color: #6b7280;">
                          <span style="color: #7C3AED; font-size: 10px;">●</span> Revenue
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td style="width: 50%; text-align: center; padding: 4px; vertical-align: middle;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="text-align: center; padding: 0;">
                        ${profitSparklineHTML}
                      </td>
                      <td style="padding-left: 8px; vertical-align: middle; text-align: left;">
                        <span style="font-size: 12px; color: #6b7280;">
                          <span style="color: #10B981; font-size: 10px;">●</span> Profit
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Generate report email HTML
 */
async function generateReportEmail({ reportType, dateRange, analytics, trends, marketing, chartImage = null, multiPeriod = null }) {
  const periodLabel = reportType === 'weekly'
    ? `${dateRange.startDateTime.toFormat('MMM d')} - ${dateRange.endDateTime.toFormat('MMM d, yyyy')}`
    : dateRange.startDateTime.toFormat('MMMM yyyy');

  const analyticsUrl = process.env.BASE_URL || 'https://join.acmeops.com';
  const preset = reportType === 'weekly' ? 'lastWeek' : 'lastMonth';
  const analyticsLink = `${analyticsUrl}/analytics?preset=${preset}`;
  const marketingLink = `${analyticsUrl}/marketing-analytics?preset=${preset}`;
  const executiveReportsLink = `${analyticsUrl}/executive-reports?type=${reportType}&period=${dateRange.start}`;

  // Extract KPI data from analytics response
  const totals = analytics?.totals || {};
  const totalLessons = totals.totalLessons || 0;
  const totalHours = totals.totalHours || 0;
  const totalStudents = totals.totalStudents || 0;
  const activeTutors = totals.totalActiveTutors || 0;
  const totalRevenue = totals.totalRevenue || 0;
  const totalTutorPay = totals.totalTutorPay || 0;
  const totalAdhocPay = totals.totalAdhocPay || 0;
  const totalProfit = totalRevenue - totalTutorPay - totalAdhocPay;
  const marginPct = totals.profitMarginPct || (totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0);

  // Get trends series - ensure we have the right view
  const trendsSeries = trends?.series || [];
  
  // Use chart image if available, otherwise generate SVG HTML
  let chartHTML;
  if (chartImage) {
    chartHTML = chartImage;
  } else if (trendsSeries.length > 0) {
    chartHTML = generateChartHTML(trendsSeries, reportType);
  } else {
    chartHTML = '<div style="padding: 40px; text-align: center; color: #666;">No trends data available</div>';
  }

  // Marketing data
  const marketingData = marketing || {};

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportType === 'weekly' ? 'Weekly' : 'Monthly'} Analytics Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f9fafb;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 10px 0 0 0;
      opacity: 0.9;
      font-size: 16px;
    }
    .content {
      padding: 48px;
    }
    .section {
      margin-bottom: 32px;
    }
    .section-title {
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 30px;
    }
    .kpi-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .kpi-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .kpi-value {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
    }
    .kpi-subtitle {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
    .chart-container {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
      min-height: 300px;
      overflow-x: visible !important;
      overflow-y: visible !important;
      width: 100%;
      max-width: 100%;
    }
    .chart-container table {
      width: 100%;
      table-layout: fixed;
      max-width: 100%;
    }
    .chart-container td {
      vertical-align: bottom;
    }
    .chart-legend {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-top: 15px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: #374151;
    }
    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 3px;
    }
    .marketing-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .marketing-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 16px;
    }
    .marketing-label {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .marketing-value {
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
    }
    .cta-button {
      display: inline-block;
      background: #7C3AED;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      margin: 10px 5px;
      text-align: center;
      border: none;
    }
    .cta-button:hover {
      background: #5B21B6;
      color: #ffffff !important;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
      border-top: 1px solid #e5e7eb;
    }
    @media (max-width: 600px) {
      .kpi-grid {
        grid-template-columns: 1fr;
      }
      .marketing-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Analytics Dashboard</h1>
      <p>${reportType === 'weekly' ? 'Weekly' : 'Monthly'} Report - ${periodLabel}</p>
    </div>
    
    <div class="content">
      <!-- Executive Summary -->
      ${multiPeriod ? `
      <div style="background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%); border-left: 4px solid #7C3AED; padding: 20px; margin-bottom: 30px; border-radius: 8px;">
        <p style="font-size: 16px; line-height: 1.6; color: #1f2937; margin: 0;">
          ${generateSummaryText(multiPeriod, reportType)}
        </p>
      </div>
      ` : ''}

      <!-- Period Timeline -->
      ${multiPeriod ? (() => {
        const labels = getPeriodLabels(multiPeriod, reportType);
        return `
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h2 style="font-size: 14px; font-weight: 600; color: #6b7280; margin: 0 0 16px 0;">
          ${reportType === 'weekly' ? '3-Week' : '3-Month'} Comparison
        </h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="text-align: center; padding: 8px;">
              <div style="background: #f9fafb; border-radius: 8px; padding: 12px;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">2 ${reportType === 'weekly' ? 'Weeks' : 'Months'} Ago</div>
                <div style="font-size: 14px; font-weight: 600; color: #374151;">${labels.twoAgo}</div>
              </div>
            </td>
            <td style="text-align: center; padding: 8px; width: 40px; color: #9ca3af;">→</td>
            <td style="text-align: center; padding: 8px;">
              <div style="background: #f9fafb; border-radius: 8px; padding: 12px;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Previous</div>
                <div style="font-size: 14px; font-weight: 600; color: #374151;">${labels.previous}</div>
              </div>
            </td>
            <td style="text-align: center; padding: 8px; width: 40px; color: #9ca3af;">→</td>
            <td style="text-align: center; padding: 8px;">
              <div style="background: #faf5ff; border: 2px solid #e9d5ff; border-radius: 8px; padding: 12px;">
                <div style="font-size: 11px; color: #7c3aed; margin-bottom: 4px;">Current ★</div>
                <div style="font-size: 14px; font-weight: 600; color: #7c3aed;">${labels.current}</div>
              </div>
            </td>
          </tr>
        </table>
      </div>
        `;
      })() : ''}

      <!-- Total Business Overview -->
      ${multiPeriod && multiPeriod.totalBusinessMetrics ? (() => {
        const labels = getPeriodLabels(multiPeriod, reportType);
        const daysInPeriod = {
          current: multiPeriod.currentPeriod?.daysInPeriod,
          previous: multiPeriod.previousPeriod?.daysInPeriod,
          twoAgo: multiPeriod.twoPeriodsAgo?.daysInPeriod
        };
        return generateTotalBusinessOverviewHTML(multiPeriod.totalBusinessMetrics, labels, reportType, daysInPeriod);
      })() : ''}

      <!-- Business Segments (Segment-First Layout) -->
      ${multiPeriod ? (() => {
        const labels = getPeriodLabels(multiPeriod, reportType);

        // Define metrics for each segment (matching ExecutiveReports.js)
        const homeMetrics = [
          { key: 'revenue', label: 'Revenue', format: 'currency' },
          { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
          { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
          { key: 'activeStudents', label: 'Active Students', format: 'number' },
          { key: 'newLeads', label: 'New Leads', format: 'number', divider: true },
          { key: 'trialLessons', label: 'Trial Lessons', format: 'number' },
          { key: 'firstPaidLessons', label: 'First Paid Lessons', format: 'number' },
          { key: 'thirdLessons', label: '3rd Lessons', format: 'number' },
        ];

        const onlineMetrics = [
          { key: 'revenue', label: 'Revenue', format: 'currency' },
          { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
          { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
          { key: 'activeStudents', label: 'Active Students', format: 'number' },
          { key: 'newLeads', label: 'New Leads', format: 'number', divider: true },
          { key: 'trialLessons', label: 'Trial Lessons', format: 'number' },
          { key: 'firstPaidLessons', label: 'First Paid Lessons', format: 'number' },
          { key: 'thirdLessons', label: '3rd Lessons', format: 'number' },
        ];

        const schoolsMetrics = [
          { key: 'revenue', label: 'Revenue', format: 'currency' },
          { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
          { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
          { key: 'activeSchools', label: 'Active Schools', format: 'number' },
          { key: 'lessonsCompleted', label: 'Lessons Completed', format: 'number' },
        ];

        const clubMetrics = [
          { key: 'revenue', label: 'Revenue', format: 'currency' },
          { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
          { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
          { key: 'lessonsCompleted', label: 'Lessons Completed', format: 'number' },
          { key: 'activeStudents', label: 'Active Students', format: 'number' },
          { key: 'campSessions', label: 'Camp Sessions', format: 'number', divider: true },
          { key: 'campDays', label: 'Camp Days', format: 'number' },
          { key: 'campStudents', label: 'Camp Students', format: 'number' },
          { key: 'newLeads', label: 'New Leads', format: 'number', divider: true },
          { key: 'trialLessons', label: 'Trial Lessons', format: 'number' },
          { key: 'classPackPurchases', label: 'Class Pack Purchases', format: 'number' },
        ];

        return `
      <div class="section">
        <h2 class="section-title">Performance by Segment</h2>

        <!-- Home Lessons -->
        ${generateSegmentCardHTML('Home Lessons', '🏠', 'home', multiPeriod, homeMetrics, labels, reportType)}

        <!-- Online Lessons -->
        ${generateSegmentCardHTML('Online Lessons', '💻', 'online', multiPeriod, onlineMetrics, labels, reportType)}

        <!-- Schools -->
        ${generateSegmentCardHTML('Schools', '🏫', 'schools', multiPeriod, schoolsMetrics, labels, reportType)}

        <!-- Club -->
        ${generateSegmentCardHTML('Club', '♟️', 'club', multiPeriod, clubMetrics, labels, reportType)}
      </div>
        `;
      })() : `
      <!-- Fallback to original KPI display when multiPeriod not available -->
      <div class="section">
        <h2 class="section-title">Key Performance Indicators</h2>
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Total Lessons</div>
            <div class="kpi-value">${formatNumber(totalLessons)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total Hours</div>
            <div class="kpi-value">${formatNumber(totalHours)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total Students</div>
            <div class="kpi-value">${formatNumber(totalStudents)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Active Tutors</div>
            <div class="kpi-value">${formatNumber(activeTutors)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total Revenue</div>
            <div class="kpi-value">${formatCurrency(totalRevenue)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total Tutor Pay</div>
            <div class="kpi-value">${formatCurrency(totalTutorPay)}</div>
            <div class="kpi-subtitle">Margin ${formatPercent(marginPct)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total Adhoc Pay</div>
            <div class="kpi-value">${formatCurrency(totalAdhocPay)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total Profit</div>
            <div class="kpi-value">${formatCurrency(totalProfit)}</div>
            <div class="kpi-subtitle">Margin ${formatPercent(marginPct)}</div>
          </div>
        </div>
      </div>
      `}

      <!-- Marketing Analytics -->
      ${marketingData && Object.keys(marketingData).length > 0 ? `
      <div class="section">
        <h2 class="section-title">Marketing Analytics</h2>
        <div class="marketing-grid">
          ${marketingData.totalLeads ? `
          <div class="marketing-card">
            <div class="marketing-label">Total Leads</div>
            <div class="marketing-value">${formatNumber(marketingData.totalLeads)}</div>
          </div>
          ` : ''}
          ${marketingData.totalRegistrations ? `
          <div class="marketing-card">
            <div class="marketing-label">Total Registrations</div>
            <div class="marketing-value">${formatNumber(marketingData.totalRegistrations)}</div>
          </div>
          ` : ''}
          ${marketingData.conversionRate !== undefined ? `
          <div class="marketing-card">
            <div class="marketing-label">Conversion Rate</div>
            <div class="marketing-value">${formatPercent(marketingData.conversionRate)}</div>
          </div>
          ` : ''}
          ${marketingData.metaSpend !== undefined ? `
          <div class="marketing-card">
            <div class="marketing-label">Meta Ad Spend</div>
            <div class="marketing-value">${formatCurrency(marketingData.metaSpend)}</div>
          </div>
          ` : ''}
          ${marketingData.googleSpend !== undefined ? `
          <div class="marketing-card">
            <div class="marketing-label">Google Ad Spend</div>
            <div class="marketing-value">${formatCurrency(marketingData.googleSpend)}</div>
          </div>
          ` : ''}
          ${marketingData.klaviyoEmailsSent !== undefined ? `
          <div class="marketing-card">
            <div class="marketing-label">Klaviyo Emails Sent</div>
            <div class="marketing-value">${formatNumber(marketingData.klaviyoEmailsSent)}</div>
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}

      <!-- Call to Action -->
      <div class="section" style="text-align: center; margin-top: 40px;">
        <a href="${executiveReportsLink}" class="cta-button" style="display: inline-block; background-color: #7C3AED; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 10px 5px; text-align: center; border: none;">📊 View Executive Reports</a>
        <a href="${analyticsLink}" class="cta-button" style="display: inline-block; background-color: #6b7280; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 10px 5px; text-align: center; border: none;">View Full Analytics Dashboard</a>
        ${marketingData && Object.keys(marketingData).length > 0 ? `
        <a href="${marketingLink}" class="cta-button" style="display: inline-block; background-color: #6b7280; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 10px 5px; text-align: center; border: none;">View Marketing Analytics</a>
        ` : ''}
      </div>
    </div>

    <div class="footer">
      <p>This is an automated report from Acme Operations Analytics Dashboard.</p>
      <p>For questions or feedback, please contact support@acmeops.com</p>
    </div>
  </div>
</body>
</html>
  `;
}

module.exports = {
  generateReportEmail,
  generateChartImage
};

