import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  Box,
  Typography,
  IconButton,
  Alert,
  CircularProgress
} from '@mui/material';
import { XMarkIcon } from '@heroicons/react/24/outline';

const LabelConfigurationModal = ({ open, onClose, onSave, currentLabels = [], userPreferences = {} }) => {
  const [availableLabels, setAvailableLabels] = useState([]);
  // Normalize IDs to numbers for consistent comparison
  const normalizeIds = (ids) => {
    if (!ids || !Array.isArray(ids)) return [];
    return ids.map(id => typeof id === 'string' ? parseInt(id, 10) : id).filter(id => !isNaN(id));
  };
  
  const [selectedLabels, setSelectedLabels] = useState(new Set(normalizeIds(userPreferences.visibleLabels || [])));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(userPreferences.showAll !== false);

  // Fetch available labels from TutorCruncher
  useEffect(() => {
    if (open) {
      fetchAvailableLabels();
      // Sync selectedLabels when modal opens - normalize IDs
      setSelectedLabels(new Set(normalizeIds(userPreferences.visibleLabels || [])));
    }
  }, [open]);

  // Sync selectedLabels with userPreferences when preferences change (e.g., when chip is removed outside modal)
  useEffect(() => {
    if (open && userPreferences.visibleLabels) {
      setSelectedLabels(new Set(normalizeIds(userPreferences.visibleLabels || [])));
    }
  }, [open, userPreferences.visibleLabels]);

  const fetchAvailableLabels = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/labels');
      if (!response.ok) throw new Error('Failed to fetch labels');
      const data = await response.json();
      setAvailableLabels(data.labels || []);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching labels:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLabelToggle = (labelId) => {
    // Normalize labelId to number for consistent Set operations
    const normalizedId = typeof labelId === 'string' ? parseInt(labelId, 10) : labelId;
    console.log('🔄 Toggling label:', { labelId, normalizedId, labelName: availableLabels.find(l => l.id === labelId || l.id === normalizedId)?.name });
    const newSelected = new Set(selectedLabels);
    if (newSelected.has(normalizedId)) {
      newSelected.delete(normalizedId);
      console.log('➖ Removed label:', normalizedId);
    } else {
      newSelected.add(normalizedId);
      console.log('➕ Added label:', normalizedId);
    }
    console.log('📋 Current selected labels:', Array.from(newSelected));
    setSelectedLabels(newSelected);
  };

  const handleSave = () => {
    let finalShowAll = showAll;
    // If no labels are selected, force showAll to false to prevent displaying all labels
    if (selectedLabels.size === 0) {
      finalShowAll = false;
    }

    const preferences = {
      visibleLabels: Array.from(selectedLabels), // These are already normalized to numbers
      showAll: finalShowAll,
      lastUpdated: new Date().toISOString()
    };
    
    console.log('💾 Saving preferences:', preferences);
    console.log('💾 Selected label IDs:', Array.from(selectedLabels));
    console.log('💾 Label names:', Array.from(selectedLabels).map(id => {
      const label = availableLabels.find(l => {
        const lid = typeof l.id === 'string' ? parseInt(l.id, 10) : l.id;
        return lid === id;
      });
      return label ? label.name : 'NOT FOUND';
    }));
    
    onSave(preferences);
    onClose();
  };

  // Synthetic tutor filter labels (market-based)
  // These use negative IDs to distinguish them from real TutorCruncher labels
  const syntheticTutorFilters = [
    { id: -1001, name: 'Tutor - LA', isTutorFilter: true, market: 'LA' },
    { id: -1002, name: 'Tutor - NYC', isTutorFilter: true, market: 'NYC' },
    { id: -1003, name: 'Tutor - SF', isTutorFilter: true, market: 'SF' },
  ];

  // Group labels by type (Home, Club, School, Online, etc.)
  const groupLabelsByType = (labels) => {
    const groups = {};
    
    labels.forEach(label => {
      // Check for tutor filter labels (1099, W2)
      if (label.name === '1099' || label.name === 'W2') {
        if (!groups['Tutor Filters']) {
          groups['Tutor Filters'] = [];
        }
        // Mark these as tutor filters
        groups['Tutor Filters'].push({ ...label, isTutorFilter: true });
        return;
      }
      
      // Extract the type prefix (e.g., "Home", "Club", "School", "Online")
      const parts = label.name.split(' - ');
      const type = parts.length > 1 ? parts[0] : 'Other';
      
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(label);
    });

    // Add synthetic market-based tutor filters
    if (!groups['Tutor Filters']) {
      groups['Tutor Filters'] = [];
    }
    groups['Tutor Filters'].push(...syntheticTutorFilters);

    // Sort groups by a predefined order
    const typeOrder = ['Home', 'Club', 'School', 'Online', 'Tournament', 'Tutor Filters', 'Other'];
    const sortedGroups = {};
    
    // Add groups in order
    typeOrder.forEach(type => {
      if (groups[type]) {
        sortedGroups[type] = groups[type].sort((a, b) => a.name.localeCompare(b.name));
      }
    });

    // Add any remaining groups not in the order
    Object.keys(groups).forEach(type => {
      if (!sortedGroups[type]) {
        sortedGroups[type] = groups[type].sort((a, b) => a.name.localeCompare(b.name));
      }
    });

    return sortedGroups;
  };

  const groupedLabels = groupLabelsByType(availableLabels);

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2, maxHeight: '90vh' }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        pb: 1,
        pt: 2
      }}>
        <Typography variant="h6" component="div">
          Label Configuration
        </Typography>
        <IconButton onClick={onClose} size="small">
          <XMarkIcon className="h-5 w-5" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Selected Count */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {selectedLabels.size} of {availableLabels.length} labels selected
          </Typography>
        </Box>

        {/* Grouped Labels */}
        <Box sx={{ 
          maxHeight: '50vh', 
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          p: 1.5
        }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            Object.keys(groupedLabels).map((groupType) => (
              <Box key={groupType} sx={{ mb: 2 }}>
                <Typography 
                  variant="subtitle2" 
                  sx={{ 
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'text.primary',
                    mb: 1,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                >
                  {groupType}
                </Typography>
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 0.5,
                  ml: 0.5
                }}>
                  {groupedLabels[groupType].map((label) => {
                    // Normalize label.id for comparison
                    const normalizedLabelId = typeof label.id === 'string' ? parseInt(label.id, 10) : label.id;
                    const isSelected = selectedLabels.has(normalizedLabelId);
                    
                    return (
                      <Box
                        key={label.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          py: 0.25,
                          px: 0.5,
                          cursor: 'pointer',
                          borderRadius: 0.5,
                          '&:hover': {
                            backgroundColor: 'action.hover'
                          }
                        }}
                        onClick={() => handleLabelToggle(label.id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleLabelToggle(label.id)}
                          size="small"
                          sx={{ 
                            p: 0.25,
                            '& .MuiSvgIcon-root': { 
                              fontSize: '1rem' 
                            }
                          }}
                        />
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            fontSize: '0.75rem',
                            ml: 0.5,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {label.name}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            ))
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, pt: 1 }}>
        <Button onClick={onClose} color="inherit" size="small">
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          color="primary"
          disabled={loading}
          size="small"
        >
          Save Configuration
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LabelConfigurationModal;
