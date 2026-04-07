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

const JobLabelSelectorModal = ({ open, onClose, onSave, selectedLabelIds = [], allLabels = [] }) => {
  const [selectedLabels, setSelectedLabels] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Normalize IDs to numbers for consistent comparison
  const normalizeIds = (ids) => {
    if (!ids || !Array.isArray(ids)) return [];
    return ids.map(id => typeof id === 'string' ? parseInt(id, 10) : id).filter(id => !isNaN(id));
  };

  // Sync selectedLabels when modal opens
  useEffect(() => {
    if (open) {
      const normalized = normalizeIds(selectedLabelIds);
      setSelectedLabels(new Set(normalized));
    }
  }, [open, selectedLabelIds]);

  const handleLabelToggle = (labelId) => {
    const normalizedId = typeof labelId === 'string' ? parseInt(labelId, 10) : labelId;
    const newSelected = new Set(selectedLabels);
    if (newSelected.has(normalizedId)) {
      newSelected.delete(normalizedId);
    } else {
      newSelected.add(normalizedId);
    }
    setSelectedLabels(newSelected);
  };

  const handleSave = () => {
    onSave(Array.from(selectedLabels));
    onClose();
  };

  // Filter out tutor labels - only show job/service labels
  const jobLabels = allLabels.filter(label => {
    // Exclude tutor filter labels (1099, W2, Tutor - LA, etc.)
    if (label.name === '1099' || label.name === 'W2' || label.name.startsWith('Tutor - ')) {
      return false;
    }
    // Exclude synthetic tutor filter IDs
    const labelIdNum = typeof label.id === 'string' ? parseInt(label.id, 10) : Number(label.id);
    if (labelIdNum < 0) return false; // Synthetic labels have negative IDs
    return true;
  });

  // Group labels by type (Home, Club, School, Online, etc.)
  const groupLabelsByType = (labels) => {
    const groups = {};
    
    labels.forEach(label => {
      // Extract the type prefix (e.g., "Home", "Club", "School", "Online")
      const parts = label.name.split(' - ');
      const type = parts.length > 1 ? parts[0] : 'Other';
      
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(label);
    });

    // Sort groups by a predefined order
    const typeOrder = ['Home', 'Club', 'School', 'Online', 'Tournament', 'Other'];
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

  const groupedLabels = groupLabelsByType(jobLabels);

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
          Select Job Labels
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
            {selectedLabels.size} of {jobLabels.length} job labels selected
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
          Apply Filters
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default JobLabelSelectorModal;

