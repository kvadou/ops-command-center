import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Typography,
} from "@mui/material";
import { CheckCircleIcon, StarIcon } from '@heroicons/react/24/solid';
import axios from "axios";

/**
 * QR Code Template Picker Component
 * 
 * Displays available QR code templates for selection
 */
export default function QRCodeTemplatePicker({ 
  selectedTemplateId, 
  onSelect, 
  compact = false 
}) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/qr-codes/templates');
      setTemplates(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography color="error" variant="body2" sx={{ p: 2 }}>
        {error}
      </Typography>
    );
  }

  const categories = [...new Set(templates.map(t => t.category))].filter(Boolean);

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight="bold" color="primary" gutterBottom>
        Templates
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        Choose a pre-designed template to quickly style your QR code
      </Typography>

      {categories.map(category => (
        <Box key={category} sx={{ mb: 3 }}>
          <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, display: 'block' }}>
            {category}
          </Typography>
          <Grid container spacing={compact ? 1 : 2}>
            {templates.filter(t => t.category === category).map(template => (
              <Grid item xs={compact ? 4 : 6} sm={compact ? 3 : 4} md={compact ? 2 : 3} key={template.id}>
                <Card 
                  sx={{ 
                    position: 'relative',
                    border: selectedTemplateId === template.id ? '2px solid' : '1px solid',
                    borderColor: selectedTemplateId === template.id ? 'primary.main' : 'divider',
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: 'primary.light',
                      boxShadow: 2,
                    }
                  }}
                >
                  <CardActionArea onClick={() => onSelect(template)}>
                    <Box 
                      sx={{ 
                        height: compact ? 60 : 80, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        bgcolor: template.background_color || '#FFFFFF',
                        p: 1,
                      }}
                    >
                      {/* Simple QR code preview representation */}
                      <Box
                        sx={{
                          width: compact ? 40 : 50,
                          height: compact ? 40 : 50,
                          bgcolor: template.foreground_color || '#000000',
                          borderRadius: template.dot_style === 'dots' ? '50%' : template.dot_style === 'rounded' ? 1 : 0,
                          opacity: 0.8,
                        }}
                      />
                    </Box>
                    <CardContent sx={{ p: compact ? 1 : 1.5, '&:last-child': { pb: compact ? 1 : 1.5 } }}>
                      <Typography variant={compact ? 'caption' : 'body2'} fontWeight="medium" noWrap>
                        {template.name}
                      </Typography>
                    </CardContent>
                  </CardActionArea>

                  {/* Selected indicator */}
                  {selectedTemplateId === template.id && (
                    <CheckCircleIcon
                      className="h-5 w-5 text-blue-600 absolute top-1 right-1 bg-white rounded-full"
                    />
                  )}

                  {/* Premium badge */}
                  {template.is_premium && (
                    <Chip
                      icon={<StarIcon className="h-3 w-3" />}
                      label="Pro"
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        height: 18,
                        fontSize: 10,
                        bgcolor: 'warning.main',
                        color: 'white',
                        '& .MuiChip-icon': { color: 'white' },
                      }}
                    />
                  )}
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}

      {/* No template option */}
      <Box sx={{ mt: 2 }}>
        <Card 
          sx={{ 
            border: !selectedTemplateId ? '2px solid' : '1px dashed',
            borderColor: !selectedTemplateId ? 'primary.main' : 'divider',
          }}
        >
          <CardActionArea onClick={() => onSelect(null)} sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary" align="center">
              No template (custom design)
            </Typography>
          </CardActionArea>
        </Card>
      </Box>
    </Box>
  );
}
