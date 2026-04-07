import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  TextField,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  InputAdornment,
  Paper,
  Alert,
  Divider,
  Badge,
  Tooltip
} from '@mui/material';
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  DocumentTextIcon,
  BugAntIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  CommandLineIcon,
  CircleStackIcon,
  CpuChipIcon,
  ArrowTrendingUpIcon,
  CalendarDaysIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

/**
 * LearningCenter - Knowledge base for alert patterns and resolutions
 * Designed like Linear/Datadog knowledge base with search, categories, and collapsible sections
 */
export default function LearningCenter({ learningData, onRefresh }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedSections, setExpandedSections] = useState({});

  // Categories for organizing patterns
  const categories = [
    { id: 'all', label: 'All', icon: DocumentTextIcon, color: 'default' },
    { id: 'payment', label: 'Payment', icon: CreditCardIcon, color: 'error' },
    { id: 'database', label: 'Database', icon: CircleStackIcon, color: 'warning' },
    { id: 'api', label: 'API', icon: CommandLineIcon, color: 'info' },
    { id: 'performance', label: 'Performance', icon: ArrowTrendingUpIcon, color: 'success' },
    { id: 'security', label: 'Security', icon: ShieldCheckIcon, color: 'error' },
    { id: 'configuration', label: 'Config', icon: Cog6ToothIcon, color: 'default' },
    { id: 'other', label: 'Other', icon: BugAntIcon, color: 'default' }
  ];

  // Categorize patterns based on title/type
  const categorizePattern = (pattern) => {
    const title = (pattern.title || '').toLowerCase();
    const type = (pattern.type || '').toLowerCase();
    
    if (title.includes('payment') || title.includes('stripe') || type === 'payment_failure') {
      return 'payment';
    }
    if (title.includes('database') || title.includes('postgres') || title.includes('sql') || title.includes('query')) {
      return 'database';
    }
    if (title.includes('api') || title.includes('endpoint') || title.includes('route') || type === 'performance') {
      return 'api';
    }
    if (title.includes('performance') || title.includes('latency') || title.includes('slow')) {
      return 'performance';
    }
    if (title.includes('security') || title.includes('auth') || title.includes('unauthorized')) {
      return 'security';
    }
    if (title.includes('config') || title.includes('environment') || title.includes('env')) {
      return 'configuration';
    }
    return 'other';
  };

  // Filter and search patterns
  const filteredPatterns = useMemo(() => {
    if (!learningData?.patterns) return [];
    
    let filtered = learningData.patterns;
    
    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => categorizePattern(p) === selectedCategory);
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => {
        const title = (p.title || '').toLowerCase();
        const type = (p.type || '').toLowerCase();
        const notes = (p.resolutions || []).map(r => (r.notes || '').toLowerCase()).join(' ');
        return title.includes(query) || type.includes(query) || notes.includes(query);
      });
    }
    
    return filtered;
  }, [learningData, selectedCategory, searchQuery]);

  // Group patterns by category
  const groupedPatterns = useMemo(() => {
    const grouped = {};
    filteredPatterns.forEach(pattern => {
      const category = categorizePattern(pattern);
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(pattern);
    });
    
    // Sort categories by pattern count
    Object.keys(grouped).forEach(cat => {
      grouped[cat].sort((a, b) => b.count - a.count);
    });
    
    return grouped;
  }, [filteredPatterns]);

  const handleToggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  if (!learningData) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <Alert severity="info">Loading learning data...</Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header with Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CheckCircleIcon className="h-5 w-5 mr-1 text-green-500" />
                <Typography color="textSecondary" variant="body2">
                  Total Resolved
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {learningData.totalResolved || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CpuChipIcon className="h-5 w-5 mr-1 text-blue-500" />
                <Typography color="textSecondary" variant="body2">
                  🤖 Agent Resolved
                </Typography>
              </Box>
              <Typography variant="h4" color="primary" sx={{ fontWeight: 600 }}>
                {learningData.agentResolved || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <UserIcon className="h-5 w-5 mr-1 text-gray-500" />
                <Typography color="textSecondary" variant="body2">
                  👤 Manual Resolved
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {learningData.manualResolved || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search and Filters */}
      <Paper 
        elevation={0}
        sx={{ 
          p: 2, 
          mb: 3, 
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2
        }}
      >
        <TextField
          fullWidth
          placeholder="Search patterns, fixes, or resolutions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={clearSearch}>
                  <XMarkIcon className="h-4 w-4" />
                </IconButton>
              </InputAdornment>
            )
          }}
        />

        {/* Category Chips */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {categories.map(cat => {
            const Icon = cat.icon;
            const count = cat.id === 'all' 
              ? filteredPatterns.length
              : (groupedPatterns[cat.id] || []).length;
            
            return (
              <Chip
                key={cat.id}
                icon={<Icon className="h-5 w-5" />}
                label={`${cat.label} ${count > 0 ? `(${count})` : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
                color={selectedCategory === cat.id ? cat.color : 'default'}
                variant={selectedCategory === cat.id ? 'filled' : 'outlined'}
                sx={{
                  borderRadius: 1.5,
                  fontWeight: selectedCategory === cat.id ? 600 : 400,
                  cursor: 'pointer'
                }}
              />
            );
          })}
        </Box>
      </Paper>

      {/* Knowledge Base Content */}
      {filteredPatterns.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          {searchQuery 
            ? `No patterns found matching "${searchQuery}". Try a different search term.`
            : 'No patterns detected yet. As alerts are resolved, patterns will appear here.'
          }
        </Alert>
      ) : (
        <Box>
          {selectedCategory === 'all' ? (
            // Show grouped by category when "All" is selected
            categories.filter(cat => cat.id !== 'all').map(category => {
              const patterns = groupedPatterns[category.id] || [];
              if (patterns.length === 0) return null;
              
              const Icon = category.icon;
              const isExpanded = expandedSections[category.id] !== false; // Default to expanded
              
              return (
                <Accordion
                  key={category.id}
                  expanded={isExpanded}
                  onChange={() => handleToggleSection(category.id)}
                  sx={{
                    mb: 2,
                    borderRadius: 2,
                    '&:before': { display: 'none' },
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    border: '1px solid',
                    borderColor: 'divider'
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ChevronDownIcon className="h-5 w-5" />}
                    sx={{
                      bgcolor: 'background.paper',
                      borderRadius: isExpanded ? '8px 8px 0 0' : '8px',
                      minHeight: 56,
                      '&.Mui-expanded': {
                        minHeight: 56
                      }
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      <Icon className="h-5 w-5 mr-2" />
                      <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
                        {category.label}
                      </Typography>
                      <Badge 
                        badgeContent={patterns.length} 
                        color={category.color}
                        sx={{ mr: 2 }}
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 2 }}>
                    {patterns.map((pattern, idx) => (
                      <PatternCard key={idx} pattern={pattern} />
                    ))}
                  </AccordionDetails>
                </Accordion>
              );
            })
          ) : (
            // Show flat list when specific category is selected
            filteredPatterns.map((pattern, idx) => (
              <PatternCard key={idx} pattern={pattern} />
            ))
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * PatternCard - Individual pattern/resolution card
 */
function PatternCard({ pattern }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      sx={{
        mb: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          transform: 'translateY(-2px)'
        }
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              {pattern.title}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 1 }}>
              <Chip
                label={pattern.type || 'unknown'}
                size="small"
                color="default"
                variant="outlined"
              />
              <Tooltip title="Times this pattern occurred">
                <Chip
                  icon={<BugAntIcon className="h-4 w-4" />}
                  label={`${pattern.count}x`}
                  size="small"
                  color={pattern.count > 5 ? 'error' : pattern.count > 2 ? 'warning' : 'default'}
                  sx={{ fontWeight: 600 }}
                />
              </Tooltip>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CalendarDaysIcon className="h-4 w-4 text-gray-400" />
                <Typography variant="caption" color="text.secondary">
                  First: {new Date(pattern.firstSeen).toLocaleDateString()} | 
                  Last: {new Date(pattern.lastSeen).toLocaleDateString()}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {pattern.resolutions && pattern.resolutions.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                {pattern.resolutions.length} Resolution{pattern.resolutions.length !== 1 ? 's' : ''} Available
              </Typography>
              <IconButton 
                size="small" 
                onClick={() => setExpanded(!expanded)}
                sx={{ color: 'primary.main' }}
              >
                <ChevronDownIcon className={`h-5 w-5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
              </IconButton>
            </Box>

            {expanded && (
              <Box sx={{ mt: 2 }}>
                {pattern.resolutions.slice(0, 5).map((resolution, idx) => (
                  <Alert
                    key={idx}
                    severity="success"
                    icon={<CheckCircleIcon className="h-5 w-5" />}
                    sx={{
                      mt: idx > 0 ? 1.5 : 0,
                      borderRadius: 1.5,
                      bgcolor: 'success.light',
                      '& .MuiAlert-icon': {
                        color: 'success.main'
                      }
                    }}
                  >
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Resolved by: {resolution.resolvedBy || 'Unknown'}
                        </Typography>
                        <Chip
                          size="small"
                          label={new Date(resolution.resolvedAt).toLocaleDateString()}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      </Box>
                      <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                        <strong>Fix Applied:</strong> {resolution.notes || 'No notes provided'}
                      </Typography>
                    </Box>
                  </Alert>
                ))}
                {pattern.resolutions.length > 5 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    + {pattern.resolutions.length - 5} more resolution{pattern.resolutions.length - 5 !== 1 ? 's' : ''}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

