import React, { useCallback, useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { PlusIcon, TagIcon } from '@heroicons/react/24/outline';
import axios from "axios";

/**
 * QR Code Tag Manager Component
 * 
 * Manages tags for QR codes - both displaying/editing tags on a QR code
 * and managing the global tag list
 */
export default function QRCodeTagManager({ 
  qrCodeId,
  selectedTags = [],
  onTagsChange,
  mode = 'inline', // 'inline' | 'dialog' | 'readonly'
}) {
  const [allTags, setAllTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6A469D');

  const PRESET_COLORS = [
    '#DA2E72', '#F79A30', '#6A469D', '#50C8DF', '#34B256', '#2D2F8E', '#FACC29', '#000000'
  ];

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/qr-codes/tags');
      setAllTags(response.data);
    } catch (err) {
      console.error('Error fetching tags:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    
    try {
      const response = await axios.post('/api/qr-codes/tags', {
        name: newTagName.trim(),
        color: newTagColor,
      });
      setAllTags(prev => [...prev, response.data]);
      setNewTagName('');
      setDialogOpen(false);
      
      // If we have a QR code ID, add this tag to it
      if (qrCodeId && onTagsChange) {
        onTagsChange([...selectedTags, response.data]);
      }
    } catch (err) {
      console.error('Error creating tag:', err);
    }
  };

  const handleTagChange = async (event, newValue) => {
    if (!qrCodeId) {
      onTagsChange?.(newValue);
      return;
    }

    try {
      setSaving(true);
      const tagIds = newValue.map(t => t.id);
      await axios.post(`/api/qr-codes/${qrCodeId}/tags`, { tag_ids: tagIds });
      onTagsChange?.(newValue);
    } catch (err) {
      console.error('Error updating tags:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTag = async (tagId) => {
    try {
      await axios.delete(`/api/qr-codes/tags/${tagId}`);
      setAllTags(prev => prev.filter(t => t.id !== tagId));
      onTagsChange?.(selectedTags.filter(t => t.id !== tagId));
    } catch (err) {
      console.error('Error deleting tag:', err);
    }
  };

  if (mode === 'readonly') {
    return (
      <Stack direction="row" spacing={0.5} flexWrap="wrap">
        {selectedTags.map(tag => (
          <Chip
            key={tag.id}
            label={tag.name}
            size="small"
            sx={{
              bgcolor: tag.color || '#6A469D',
              color: 'white',
              fontWeight: 500,
            }}
          />
        ))}
        {selectedTags.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            No tags
          </Typography>
        )}
      </Stack>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <TagIcon className="h-5 w-5 text-neutral-500" />
        <Typography variant="subtitle2" fontWeight="bold" color="primary">
          Tags
        </Typography>
        <Tooltip title="Create New Tag">
          <IconButton size="small" onClick={() => setDialogOpen(true)}>
            <PlusIcon className="h-5 w-5" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Autocomplete
        multiple
        options={allTags}
        value={selectedTags}
        onChange={handleTagChange}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        loading={loading}
        disabled={saving}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="outlined"
            placeholder="Add tags..."
            size="small"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {(loading || saving) && <CircularProgress size={16} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        renderTags={(value, getTagProps) =>
          value.map((tag, index) => (
            <Chip
              {...getTagProps({ index })}
              key={tag.id}
              label={tag.name}
              size="small"
              sx={{
                bgcolor: tag.color || '#6A469D',
                color: 'white',
                '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)' },
              }}
            />
          ))
        }
        renderOption={(props, option) => {
          const { key, ...otherProps } = props;
          return (
            <Box component="li" key={key} {...otherProps} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: option.color || '#6A469D',
                }}
              />
              <Typography variant="body2">{option.name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                {option.usage_count || 0} uses
              </Typography>
            </Box>
          );
        }}
      />

      {/* Create Tag Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create New Tag</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Tag Name"
            fullWidth
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="e.g., Marketing, Events, Urgent"
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            Color
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            {PRESET_COLORS.map(color => (
              <Box
                key={color}
                onClick={() => setNewTagColor(color)}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1,
                  bgcolor: color,
                  cursor: 'pointer',
                  border: newTagColor === color ? '2px solid' : '1px solid',
                  borderColor: newTagColor === color ? 'primary.main' : 'divider',
                }}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateTag} variant="contained" disabled={!newTagName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
