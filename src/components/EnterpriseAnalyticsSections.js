import React from 'react';
import { formatCurrency } from '../utils/formatters';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Tooltip,
  IconButton,
  Chip,
  Switch,
  FormControlLabel,
  TextField,
  MenuItem,
  Button
} from '@mui/material';
import { InformationCircleIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';

// Helper function to format currency

// Helper function to format percent
const formatPercent = (value) => {
  if (value === null || value === undefined) return '0.0%';
  return `${parseFloat(value).toFixed(1)}%`;
};

// Helper function to format number with commas
const formatNumber = (value, decimals = 0) => {
  if (value === null || value === undefined) return '0';
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return '0';
  
  // Format with commas for numbers >= 1000
  if (numValue >= 1000) {
    return numValue.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
  
  // For smaller numbers, just format decimals
  return numValue.toFixed(decimals);
};

// KPI Card Component with Tooltip
export const KPICard = ({ 
  title, 
  value, 
  subtitle, 
  color = 'primary', 
  onClick, 
  tooltip, 
  icon,
  valueColor,
  trend,
  kpiKey,
  onCardClick
}) => {
  const colorMap = {
    primary: 'primary.main',
    success: 'success.main',
    error: 'error.main',
    warning: 'warning.main',
    info: 'info.main',
    secondary: 'secondary.main'
  };

  const borderColor = colorMap[color] || 'primary.main';
  const displayColor = valueColor || borderColor;

  const handleClick = () => {
    if (onCardClick && kpiKey) {
      onCardClick(kpiKey);
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <Card 
      onClick={handleClick}
      sx={{ 
        height: '100%',
        borderLeft: '4px solid',
        borderColor: borderColor,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: (onClick || onCardClick) ? 'pointer' : 'default',
        '&:hover': (onClick || onCardClick) ? {
          transform: 'translateY(-2px)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
        } : {}
      }}
    >
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Typography 
            variant="body2" 
            sx={{ 
              color: 'text.secondary', 
              fontWeight: 500,
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              flex: 1
            }}
          >
            {title}
          </Typography>
          {tooltip && (
            <Tooltip title={tooltip} arrow placement="top">
              <IconButton size="small" sx={{ p: 0.5, ml: 1 }}>
                <InformationCircleIcon className="h-4 w-4" style={{ color: 'rgba(0,0,0,0.6)' }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          {icon && <Box sx={{ color: displayColor }}>{icon}</Box>}
          <Typography 
            variant="h4" 
            sx={{ 
              color: displayColor,
              fontWeight: 700,
              fontSize: '2rem',
              lineHeight: 1.2
            }}
          >
            {value}
          </Typography>
          {trend && (
            trend > 0 ? (
              <ArrowTrendingUpIcon className="h-5 w-5" style={{ color: '#2e7d32' }} />
            ) : (
              <ArrowTrendingDownIcon className="h-5 w-5" style={{ color: '#d32f2f' }} />
            )
          )}
        </Box>
        {subtitle && (
          <Typography 
            variant="caption" 
            sx={{ 
              color: 'text.secondary',
              fontSize: '0.75rem',
              display: 'block',
              mt: 0.5
            }}
          >
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

// Section Header Component
export const SectionHeader = ({ title, description, icon }) => (
  <Box sx={{ mb: { xs: 2, sm: 3 }, display: 'flex', alignItems: 'center', gap: 2 }}>
    {icon && <Box sx={{ fontSize: '1.5rem' }}>{icon}</Box>}
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', fontSize: { xs: '1rem', sm: '1.25rem' } }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
          {description}
        </Typography>
      )}
    </Box>
  </Box>
);

// Core Funnel Metrics Section
export const CoreFunnelSection = ({ metrics, onCardClick }) => {
  if (!metrics) return null;

  const kpis = [
    {
      title: 'Reach',
      value: formatNumber(metrics.reach || 0, 0),
      subtitle: 'Unique users (approximate)',
      color: 'primary',
      tooltip: 'Approximate number of unique users who saw your ads (based on impressions)',
      kpiKey: 'reach'
    },
    {
      title: 'CTR',
      value: formatPercent(metrics.ctr || 0),
      subtitle: 'Click-through rate',
      color: 'info',
      tooltip: 'CTR = (Clicks ÷ Impressions) × 100',
      kpiKey: 'ctr'
    },
    {
      title: 'CPC',
      value: formatCurrency(metrics.cpc || 0),
      subtitle: 'Cost per click',
      color: 'warning',
      tooltip: 'CPC = Ad Spend ÷ Clicks',
      kpiKey: 'cpc'
    },
    {
      title: 'Form Views',
      value: formatNumber(metrics.formViews || 0, 0),
      subtitle: 'Total form page views',
      color: 'secondary',
      tooltip: 'Number of times the booking form page was viewed',
      kpiKey: 'formViews'
    },
    {
      title: 'Leads',
      value: formatNumber(metrics.formStarts || 0, 0),
      subtitle: 'Users who started filling the form',
      color: 'primary',
      tooltip: 'Number of users who began filling out the booking form',
      kpiKey: 'formStarts'
    },
    {
      title: 'Registrations',
      value: formatNumber(metrics.formCompletions || 0, 0),
      subtitle: 'Paid/Verified registrations',
      color: 'success',
      tooltip: 'Number of completed forms with paid or verified status',
      kpiKey: 'formCompletions'
    },
    {
      title: 'CPL',
      value: formatCurrency(metrics.cpl || 0),
      subtitle: 'Cost per lead',
      color: 'warning',
      tooltip: 'CPL = Meta Spend ÷ Leads',
      kpiKey: 'cpl'
    },
    {
      title: 'CPR',
      value: formatCurrency(metrics.cpr || 0),
      subtitle: 'Cost per registration',
      color: 'error',
      tooltip: 'CPR = Meta Spend ÷ Registrations',
      kpiKey: 'cpr'
    },
    {
      title: 'Trial Conversion Rate',
      value: formatPercent(metrics.trialConversionRate || 0),
      subtitle: 'Leads → Registrations',
      color: 'success',
      tooltip: 'Trial Conversion Rate = (Registrations ÷ Leads) × 100',
      kpiKey: 'trialConversionRate'
    },
    {
      title: 'Trial ROAS',
      value: `${formatNumber(metrics.trialRoas || 0, 2)}x`,
      subtitle: 'Trial revenue ÷ Ad spend',
      color: 'success',
      tooltip: 'Trial ROAS = Trial Revenue ÷ Ad Spend',
      kpiKey: 'trialRoas'
    }
  ];

  return (
    <Box sx={{ mb: 4 }}>
      <SectionHeader 
        title="Ad Funnel Performance" 
        description="Core metrics tracking the complete customer acquisition funnel"
        icon="📊"
      />
      <Grid container spacing={{ xs: 2, sm: 3 }}>
        {kpis.map((kpi, idx) => (
          <Grid item xs={12} sm={6} md={4} lg={2.4} key={idx}>
            <KPICard {...kpi} onCardClick={onCardClick} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

// Revenue & Value Metrics Section
export const RevenueSection = ({ metrics, onCardClick }) => {
  if (!metrics) return null;

  const kpis = [
    {
      title: 'Total Ad Revenue',
      value: formatCurrency(metrics.totalAdAttributedRevenue || 0),
      subtitle: 'Revenue from ad-attributed trials',
      color: 'success',
      tooltip: 'Total revenue from booking forms attributed to paid ads',
      kpiKey: 'totalAdAttributedRevenue'
    },
    {
      title: 'AOV',
      value: formatCurrency(metrics.aov || 0),
      subtitle: 'Average order value',
      color: 'info',
      tooltip: 'AOV = Total Revenue ÷ Number of Payments',
      kpiKey: 'aov'
    },
    {
      title: 'Avg LTV',
      value: formatCurrency(metrics.avgLtv || 0),
      subtitle: 'Average lifetime value',
      color: 'success',
      tooltip: 'Average lifetime value across all client labels',
      kpiKey: 'avgLtv'
    },
    {
      title: 'Short-Term ROAS',
      value: `${formatNumber(metrics.shortTermRoas || 0, 2)}x`,
      subtitle: 'Trial revenue ÷ Ad spend',
      color: 'primary',
      tooltip: 'Short-Term ROAS = Trial Revenue ÷ Ad Spend',
      kpiKey: 'shortTermRoas'
    },
    {
      title: 'Lifetime ROAS',
      value: `${formatNumber(metrics.lifetimeRoas || 0, 2)}x`,
      subtitle: 'LTV-based revenue ÷ Ad spend',
      color: 'success',
      tooltip: 'Lifetime ROAS = (LTV × Conversions) ÷ Ad Spend',
      kpiKey: 'lifetimeRoas'
    },
    {
      title: 'Blended ROAS',
      value: `${formatNumber(metrics.blendedRoas || 0, 2)}x`,
      subtitle: '(Trial + Lifetime) ÷ Ad spend',
      color: 'info',
      tooltip: 'Blended ROAS = (Trial Revenue + Lifetime Revenue) ÷ Ad Spend',
      kpiKey: 'blendedRoas'
    },
    {
      title: 'POAS',
      value: `${formatNumber(metrics.poas || 0, 2)}x`,
      subtitle: 'Profit after tutor costs ÷ Ad spend',
      color: 'success',
      tooltip: 'POAS = (Profit After Tutor Costs) ÷ Ad Spend',
      kpiKey: 'poas'
    },
    {
      title: 'Gross Margin',
      value: formatPercent(metrics.grossMargin || 0),
      subtitle: '(Revenue - Tutor Costs) ÷ Revenue',
      color: 'success',
      tooltip: 'Gross Margin = ((Revenue - Tutor Costs) ÷ Revenue) × 100',
      kpiKey: 'grossMargin'
    },
    {
      title: 'Net Margin',
      value: formatPercent(metrics.netMarginAfterAdSpend || 0),
      subtitle: 'After all costs including ad spend',
      color: metrics.netMarginAfterAdSpend >= 0 ? 'success' : 'error',
      tooltip: 'Net Margin = ((Revenue - All Costs) ÷ Revenue) × 100',
      kpiKey: 'netMarginAfterAdSpend'
    }
  ];

  return (
    <Box sx={{ mb: 4 }}>
      <SectionHeader 
        title="Revenue & Return Performance" 
        description="Comprehensive revenue metrics and profitability analysis"
        icon="💰"
      />
      <Grid container spacing={{ xs: 2, sm: 3 }}>
        {kpis.map((kpi, idx) => (
          <Grid item xs={12} sm={6} md={4} lg={2.7} key={idx}>
            <KPICard {...kpi} onCardClick={onCardClick} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

// Conversion & Behavior Metrics Section
export const ConversionSection = ({ metrics, onCardClick }) => {
  if (!metrics) return null;

  const kpis = [
    {
      title: 'Bounce Rate',
      value: formatPercent(metrics.bounceRate || 0),
      subtitle: 'Form views without starts',
      color: metrics.bounceRate > 50 ? 'error' : 'warning',
      tooltip: 'Bounce Rate = ((Form Views - Leads) ÷ Form Views) × 100',
      kpiKey: 'bounceRate'
    },
    {
      title: 'Conversion Rate',
      value: formatPercent(metrics.conversionRate || 0),
      subtitle: 'Leads → Registrations',
      color: 'success',
      tooltip: 'Conversion Rate = (Registrations ÷ Leads) × 100',
      kpiKey: 'conversionRate'
    },
    {
      title: 'Form Abandonment',
      value: formatPercent(metrics.formAbandonmentRate || 0),
      subtitle: 'Started but not completed',
      color: 'error',
      tooltip: 'Form Abandonment Rate = ((Leads - Registrations) ÷ Leads) × 100',
      kpiKey: 'formAbandonmentRate'
    },
    {
      title: 'Frequency',
      value: formatNumber(metrics.frequency || 0, 1),
      subtitle: 'Avg impressions per user',
      color: 'info',
      tooltip: 'Frequency = Impressions ÷ Unique Sessions',
      kpiKey: 'frequency'
    },
    {
      title: 'Multi-Touch ROAS',
      value: `${formatNumber(metrics.multiTouchRoas || 0, 2)}x`,
      subtitle: 'LTV-based across touchpoints',
      color: 'success',
      tooltip: 'Multi-Touch ROAS accounts for all customer touchpoints before conversion',
      kpiKey: 'multiTouchRoas'
    }
  ];

  return (
    <Box sx={{ mb: 4 }}>
      <SectionHeader 
        title="Conversion & User Behavior" 
        description="User engagement and conversion behavior metrics"
        icon="📈"
      />
      <Grid container spacing={{ xs: 2, sm: 3 }}>
        {kpis.map((kpi, idx) => (
          <Grid item xs={12} sm={6} md={4} lg={2.4} key={idx}>
            <KPICard {...kpi} onCardClick={onCardClick} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

// Cost & Efficiency Metrics Section
export const EfficiencySection = ({ metrics, onCardClick }) => {
  if (!metrics) return null;

  const kpis = [
    {
      title: 'CPM',
      value: formatCurrency(metrics.cpm || 0),
      subtitle: 'Cost per 1,000 impressions',
      color: 'warning',
      tooltip: 'CPM = (Ad Spend ÷ Impressions) × 1,000',
      kpiKey: 'cpm'
    },
    {
      title: 'CAC',
      value: formatCurrency(metrics.cac || 0),
      subtitle: 'Cost per acquired client',
      color: 'error',
      tooltip: 'CAC = Total Ad Spend ÷ Registrations',
      kpiKey: 'cac'
    },
    {
      title: 'Spend by Channel',
      value: '—',
      subtitle: 'See breakdown below',
      color: 'info',
      tooltip: 'Ad spend breakdown by marketing channel',
      kpiKey: 'spendByChannel'
    }
  ];

  const channelData = metrics.spendVsRevenueByChannel || {};

  return (
    <Box sx={{ mb: 4 }}>
      <SectionHeader 
        title="Efficiency & Spend Distribution" 
        description="Cost efficiency and spend allocation metrics"
        icon="⚡"
      />
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: 3 }}>
        {kpis.map((kpi, idx) => (
          <Grid item xs={12} sm={6} md={4} key={idx}>
            <KPICard {...kpi} onCardClick={onCardClick} />
          </Grid>
        ))}
      </Grid>
      
      {/* Channel Breakdown */}
      <Grid container spacing={2}>
        {Object.keys(channelData).map((channel) => (
          <Grid item xs={12} sm={6} md={4} key={channel}>
            <Card sx={{ borderLeft: '4px solid', borderColor: channel === 'meta' ? 'primary.main' : 'success.main' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1, textTransform: 'capitalize' }}>
                  {channel}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Spend: {formatCurrency(channelData[channel]?.spend || 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Revenue: {formatCurrency(channelData[channel]?.revenue || 0)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

// Strategic & Advanced KPIs Section
export const StrategicSection = ({ metrics, onCardClick }) => {
  if (!metrics) return null;

  const basicKpis = [
    {
      title: 'LTV:CAC Ratio',
      value: formatNumber(metrics.ltvCacRatio || 0, 2),
      subtitle: 'Lifetime value to acquisition cost',
      color: metrics.ltvCacRatio >= 3 ? 'success' : metrics.ltvCacRatio >= 1 ? 'warning' : 'error',
      tooltip: 'LTV:CAC Ratio = Average LTV ÷ CAC. Ideal: 3:1 or higher',
      kpiKey: 'ltvCacRatio'
    },
    {
      title: 'Incremental Revenue',
      value: formatCurrency(metrics.incrementalRevenuePerDollar || 0),
      subtitle: 'Revenue per $1 spent',
      color: 'success',
      tooltip: 'Incremental Revenue = LTV Revenue ÷ Total Ad Spend',
      kpiKey: 'incrementalRevenuePerDollar'
    },
    {
      title: 'Revenue per Impression',
      value: formatCurrency(metrics.revenuePerImpression || 0),
      subtitle: 'Revenue efficiency',
      color: 'info',
      tooltip: 'Revenue per Impression = Total Revenue ÷ Impressions',
      kpiKey: 'revenuePerImpression'
    }
  ];

  const advancedKpis = [
    {
      title: 'Predicted LTV',
      value: formatCurrency(metrics.predictedLtv || 0),
      subtitle: 'ML-based projection',
      color: 'info',
      tooltip: 'Predicted LTV based on retention trends and historical data',
      kpiKey: 'predictedLtv'
    },
    {
      title: 'ROAS by Market',
      value: '—',
      subtitle: 'See breakdown below',
      color: 'info',
      tooltip: 'ROAS breakdown by geographic market',
      kpiKey: 'roasByMarket'
    },
    {
      title: 'ROAS by Channel',
      value: '—',
      subtitle: 'See breakdown below',
      color: 'info',
      tooltip: 'ROAS breakdown by marketing channel',
      kpiKey: 'roasByChannel'
    },
    {
      title: 'Retention Rate',
      value: formatPercent(metrics.retentionRate || 0),
      subtitle: 'Client rebooking rate',
      color: 'success',
      tooltip: 'Percentage of clients who rebook after initial trial',
      kpiKey: 'retentionRate'
    }
  ];

  const roasByMarket = metrics.roasByMarket || {};
  const roasByChannel = metrics.roasByChannel || {};

  return (
    <Box sx={{ mb: 4 }}>
      <SectionHeader 
        title="Advanced Growth & Forecasting" 
        description="Strategic KPIs for long-term growth planning"
        icon="🚀"
      />
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: 3 }}>
        {basicKpis.map((kpi, idx) => (
          <Grid item xs={12} sm={6} md={4} key={idx}>
            <KPICard {...kpi} onCardClick={onCardClick} />
          </Grid>
        ))}
        {advancedKpis.map((kpi, idx) => (
          <Grid item xs={12} sm={6} md={4} key={`advanced-${idx}`}>
            <KPICard {...kpi} onCardClick={onCardClick} />
          </Grid>
        ))}
      </Grid>

      {/* Market Breakdown */}
      {Object.keys(roasByMarket).length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>ROAS by Market</Typography>
          <Grid container spacing={2}>
            {Object.keys(roasByMarket).map((market) => (
              <Grid item xs={12} sm={6} md={3} key={market}>
                <Card>
                  <CardContent>
                    <Typography variant="h6">{market}</Typography>
                    <Typography variant="h5" color="success.main">
                      {formatNumber(roasByMarket[market], 2)}x
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Channel Breakdown */}
      {Object.keys(roasByChannel).length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>ROAS by Channel</Typography>
          <Grid container spacing={2}>
            {Object.keys(roasByChannel).map((channel) => (
              <Grid item xs={12} sm={6} md={3} key={channel}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ textTransform: 'capitalize' }}>{channel}</Typography>
                    <Typography variant="h5" color="success.main">
                      {formatNumber(roasByChannel[channel], 2)}x
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

// Filters Component
export const FiltersSection = ({ filters, onFilterChange, onReset }) => (
  <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
    <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>Filters</Typography>
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} md={3}>
        <TextField
          fullWidth
          size="small"
          label="Market"
          select
          value={filters.market}
          onChange={(e) => onFilterChange('market', e.target.value)}
        >
          <MenuItem value="">All Markets</MenuItem>
          <MenuItem value="NYC">NYC</MenuItem>
          <MenuItem value="LA">LA</MenuItem>
          <MenuItem value="SF">SF</MenuItem>
          <MenuItem value="Online">Online</MenuItem>
          <MenuItem value="Hamptons">Hamptons</MenuItem>
        </TextField>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <TextField
          fullWidth
          size="small"
          label="Channel"
          select
          value={filters.channel}
          onChange={(e) => onFilterChange('channel', e.target.value)}
        >
          <MenuItem value="">All Channels</MenuItem>
          <MenuItem value="facebook">Meta/Facebook</MenuItem>
          <MenuItem value="google">Google</MenuItem>
        </TextField>
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <TextField
          fullWidth
          size="small"
          label="Campaign"
          value={filters.campaign}
          onChange={(e) => onFilterChange('campaign', e.target.value)}
          placeholder="Filter by campaign"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <TextField
          fullWidth
          size="small"
          label="Lesson Type"
          value={filters.lessonType}
          onChange={(e) => onFilterChange('lessonType', e.target.value)}
          placeholder="Filter by lesson type"
        />
      </Grid>
      <Grid item xs={12}>
        <Button variant="outlined" size="small" onClick={onReset}>
          Reset Filters
        </Button>
      </Grid>
    </Grid>
  </Box>
);

