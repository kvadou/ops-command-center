import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  LinearProgress, 
  Tooltip, 
  Paper, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText, 
  Chip,
  Divider,
  IconButton
} from '@mui/material';
import {
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  InformationCircleIcon,
  ArrowTrendingUpIcon,
  EyeIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

/**
 * SystemHealthScore - Top-level weighted health score
 * Similar to Vercel's deployment health score
 */
export default function SystemHealthScore({
  score = 0, // 0-100
  breakdown = [], // [{ label: string, value: number, weight: number }]
  details = {}, // { criticalOpen, highOpen, totalOpen, last24h }
  isLoading = false,
  onViewAlerts = null, // Callback to navigate to alerts tab
  suppressAutoPopup = false // If true, don't auto-show popup (e.g., when navigating from Slack links)
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const getScoreColor = () => {
    if (score >= 95) return '#10b981';
    if (score >= 80) return '#f59e0b';
    return '#ef4444';
  };

  const getScoreLabel = () => {
    if (score >= 95) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Poor';
  };

  const getScoreIcon = () => {
    if (score >= 95) return <CheckCircleIcon className="h-8 w-8 text-emerald-500" />;
    if (score >= 80) return <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />;
    return <ExclamationCircleIcon className="h-8 w-8 text-red-500" />;
  };

  // Convert breakdown to pie chart data
  const pieData = breakdown.map((item, index) => ({
    name: item.label,
    value: item.value * item.weight,
    fill: ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'][index % 5]
  }));

  if (isLoading) {
    return (
      <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary">Loading health score...</Typography>
      </Paper>
    );
  }

  const shouldShowPopup = score < 50; // Show popup for scores below 50

  // Generate recommendations based on score and details
  const generateRecommendations = () => {
    const recommendations = [];
    
    if (details.criticalOpen > 0) {
      recommendations.push({
        priority: 'critical',
        title: `Resolve ${details.criticalOpen} Critical Alert${details.criticalOpen > 1 ? 's' : ''}`,
        description: 'Critical alerts require immediate attention and are heavily impacting your health score.',
        action: 'View Critical Alerts',
        actionCallback: () => {
          setDialogOpen(false);
          if (onViewAlerts) {
            onViewAlerts({ severity: ['critical'], status: ['open'] });
          }
        }
      });
    }
    
    if (details.highOpen > 5) {
      recommendations.push({
        priority: 'high',
        title: `Address ${details.highOpen} High Priority Alert${details.highOpen > 1 ? 's' : ''}`,
        description: 'High priority alerts are affecting system stability and should be resolved soon.',
        action: 'View High Priority Alerts',
        actionCallback: () => {
          setDialogOpen(false);
          if (onViewAlerts) {
            onViewAlerts({ severity: ['high'], status: ['open'] });
          }
        }
      });
    }
    
    if (details.totalOpen > 50) {
      recommendations.push({
        priority: 'medium',
        title: `Review ${details.totalOpen} Open Alert${details.totalOpen > 1 ? 's' : ''}`,
        description: 'A large number of open alerts suggests systemic issues that need attention.',
        action: 'View All Alerts',
        actionCallback: () => {
          setDialogOpen(false);
          if (onViewAlerts) {
            onViewAlerts({ status: ['open'] });
          }
        }
      });
    }
    
    if (details.last24h > 50) {
      recommendations.push({
        priority: 'medium',
        title: `High Alert Volume: ${details.last24h} in Last 24 Hours`,
        description: 'The high volume of recent alerts may indicate an ongoing issue or overly sensitive alert rules.',
        action: 'Review Alert Rules',
        actionCallback: () => {
          setDialogOpen(false);
          // Could navigate to alert rules page if it exists
        }
      });
    }
    
    // Default recommendation if score is low but we don't have specific details
    if (recommendations.length === 0 && score < 50) {
      recommendations.push({
        priority: 'medium',
        title: 'Review Active Alerts',
        description: 'The system health score is low. Review active alerts to identify and resolve issues.',
        action: 'View Active Alerts',
        actionCallback: () => {
          setDialogOpen(false);
          if (onViewAlerts) {
            onViewAlerts({ status: ['open'] });
          }
        }
      });
    }
    
    return recommendations;
  };

  const recommendations = generateRecommendations();

  return (
    <>
      <Paper
        sx={{
          p: 3,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          background: `linear-gradient(135deg, ${getScoreColor()}15 0%, transparent 100%)`,
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            boxShadow: `0 4px 12px ${getScoreColor()}40`,
            transform: 'translateY(-2px)'
          }
        }}
        onClick={() => setDialogOpen(true)}
      >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box>{getScoreIcon()}</Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            System Health Score
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.5 }}>
            <Typography variant="h3" sx={{ fontWeight: 700, color: getScoreColor(), fontSize: '2.5rem' }}>
              {score.toFixed(1)}
            </Typography>
            <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400 }}>
              / 100
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: getScoreColor(), fontWeight: 500, mt: 0.5 }}>
            {getScoreLabel()}
          </Typography>
        </Box>
        {breakdown.length > 0 && (
          <Box sx={{ width: 100, height: 100 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={45}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Box>

      <LinearProgress
        variant="determinate"
        value={score}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: 'grey.200',
          '& .MuiLinearProgress-bar': {
            bgcolor: getScoreColor(),
            borderRadius: 4
          }
        }}
      />

      {breakdown.length > 0 && (
        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          {breakdown.map((item, index) => (
            <Tooltip key={item.label} title={`Weight: ${(item.weight * 100).toFixed(0)}%`}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: pieData[index]?.fill || '#6b7280'
                  }}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {item.label}: {(item.value * 100).toFixed(1)}%
                </Typography>
              </Box>
            </Tooltip>
          ))}
        </Box>
      )}

      {/* Click indicator - always show for low scores, show info icon for others */}
      {shouldShowPopup ? (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: 'error.main',
            color: 'white',
            px: 1.5,
            py: 0.5,
            borderRadius: 1,
            fontSize: '0.75rem',
            fontWeight: 600
          }}
        >
          <InformationCircleIcon className="h-4 w-4" />
          Click for recommendations
        </Box>
      ) : (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            color: 'text.secondary',
            fontSize: '0.75rem',
            opacity: 0.6
          }}
        >
          <InformationCircleIcon className="h-4 w-4" />
          Click for details
        </Box>
      )}
    </Paper>

    {/* Health Score Recommendations Dialog */}
    <Dialog 
      open={dialogOpen} 
      onClose={() => setDialogOpen(false)}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
        }
      }}
    >
      <DialogTitle sx={{ 
        pb: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {getScoreIcon()}
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              System Health Score: {score.toFixed(1)}/100 ({getScoreLabel()})
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Your system health score is below optimal levels. Here's what's affecting it:
            </Typography>
          </Box>
        </Box>
        <IconButton 
          onClick={() => setDialogOpen(false)}
          size="small"
        >
          <XMarkIcon className="h-5 w-5" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        {/* Score Breakdown */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Score Breakdown
          </Typography>
          {breakdown.map((item, index) => (
            <Box key={item.label} sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {item.label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {(item.value * 100).toFixed(1)}% (weight: {(item.weight * 100).toFixed(0)}%)
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={item.value * 100}
                sx={{
                  height: 6,
                  borderRadius: 1,
                  bgcolor: 'grey.200',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: item.value > 0.7 ? '#10b981' : item.value > 0.4 ? '#f59e0b' : '#ef4444'
                  }
                }}
              />
            </Box>
          ))}
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Current Issues */}
        {(details.criticalOpen > 0 || details.highOpen > 0 || details.totalOpen > 0) && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
              Current Issues
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {details.criticalOpen > 0 && (
                <Chip
                  icon={<ExclamationCircleIcon className="h-4 w-4" />}
                  label={`${details.criticalOpen} Critical Alert${details.criticalOpen > 1 ? 's' : ''}`}
                  color="error"
                  sx={{ fontWeight: 600 }}
                />
              )}
              {details.highOpen > 0 && (
                <Chip
                  icon={<ExclamationTriangleIcon className="h-4 w-4" />}
                  label={`${details.highOpen} High Priority Alert${details.highOpen > 1 ? 's' : ''}`}
                  color="warning"
                  sx={{ fontWeight: 600 }}
                />
              )}
              {details.totalOpen > 0 && (
                <Chip
                  label={`${details.totalOpen} Total Open Alert${details.totalOpen > 1 ? 's' : ''}`}
                  color="default"
                  sx={{ fontWeight: 600 }}
                />
              )}
              {details.last24h > 0 && (
                <Chip
                  label={`${details.last24h} Alert${details.last24h > 1 ? 's' : ''} in Last 24h`}
                  color="default"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              )}
            </Box>
          </Box>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <ArrowTrendingUpIcon className="h-5 w-5" />
              Recommendations to Improve Score
            </Typography>
            <List>
              {recommendations.map((rec, index) => (
                <ListItem
                  key={index}
                  sx={{
                    bgcolor: rec.priority === 'critical' ? 'error.light' :
                             rec.priority === 'high' ? 'warning.light' : 'grey.50',
                    borderRadius: 1,
                    mb: 1,
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    py: 2
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'start', width: '100%', gap: 1 }}>
                    <ListItemIcon sx={{ minWidth: 40, mt: 0.5 }}>
                      {rec.priority === 'critical' ? <ExclamationCircleIcon className="h-5 w-5 text-red-500" /> :
                       rec.priority === 'high' ? <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" /> :
                       <InformationCircleIcon className="h-5 w-5 text-blue-500" />}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                          {rec.title}
                        </Typography>
                      }
                      secondary={rec.description}
                      sx={{ mb: 1 }}
                    />
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EyeIcon className="h-5 w-5" />}
                    onClick={rec.actionCallback}
                    sx={{ mt: 1, ml: 7 }}
                  >
                    {rec.action}
                  </Button>
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {/* Quick Tips */}
        <Box sx={{ mt: 3, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            💡 Quick Tips
          </Typography>
          <Typography variant="body2" component="div">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Resolve critical alerts first - they have the highest impact on your score</li>
              <li>Review and acknowledge alerts regularly to keep the system healthy</li>
              <li>Consider bulk actions for similar alerts to save time</li>
              <li>Add resolution notes to help identify patterns and prevent future issues</li>
            </ul>
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={() => setDialogOpen(false)} variant="outlined">
          Close
        </Button>
        {onViewAlerts && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<SparklesIcon className="h-5 w-5" />}
            onClick={() => {
              setDialogOpen(false);
              onViewAlerts({ status: ['open'] });
            }}
          >
            View All Active Alerts
          </Button>
        )}
      </DialogActions>
    </Dialog>
    </>
  );
}

