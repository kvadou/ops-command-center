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

const TutorLabelSelectorModal = ({ open, onClose, onSave, selectedLabelIds = [], allLabels = [] }) => {
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

  // Synthetic tutor filter labels (market-based)
  const syntheticTutorFilters = [
    { id: -1001, name: 'Tutor - LA', isTutorFilter: true, market: 'LA' },
    { id: -1002, name: 'Tutor - NYC', isTutorFilter: true, market: 'NYC' },
    { id: -1003, name: 'Tutor - SF', isTutorFilter: true, market: 'SF' },
  ];

  // Filter to only tutor labels - include 1099, W2, and synthetic tutor filters
  const tutorLabels = [
    ...allLabels.filter(label => label.name === '1099' || label.name === 'W2'),
    ...syntheticTutorFilters
  ];

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
          Select Tutor Labels
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
            {selectedLabels.size} of {tutorLabels.length} tutor labels selected
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
            <Box sx={{ mb: 2 }}>
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
                Tutor Filters
              </Typography>
              <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 0.5,
                ml: 0.5
              }}>
                {tutorLabels.map((label) => {
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

export default TutorLabelSelectorModal;

