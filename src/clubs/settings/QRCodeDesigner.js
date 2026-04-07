import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { HexColorPicker } from 'react-colorful';
import {
  EyeIcon,
  SwatchIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import axios from "axios";

// Pattern style options with visual representations
// Shape icons as small styled components (Heroicons doesn't have exact shape icons)
const SquareShapeIcon = ({ sx, ...props }) => (
  <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: 'currentColor', borderRadius: 0, ...(sx || {}) }} {...props} />
);
const CircleShapeIcon = ({ sx, ...props }) => (
  <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: 'currentColor', borderRadius: '50%', ...(sx || {}) }} {...props} />
);
const RoundedSquareIcon = ({ sx, ...props }) => (
  <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: 'currentColor', borderRadius: 4, ...(sx || {}) }} {...props} />
);

const PATTERN_STYLES = [
  { value: 'square', label: 'Square', icon: SquareShapeIcon },
  { value: 'dots', label: 'Dots', icon: CircleShapeIcon },
  { value: 'rounded', label: 'Rounded', icon: RoundedSquareIcon },
];

// Corner style options
const CORNER_STYLES = [
  { value: 'square', label: 'Square' },
  { value: 'dot', label: 'Dot' },
  { value: 'extra-rounded', label: 'Rounded' },
];

// Preset color themes
const COLOR_PRESETS = [
  { name: 'Classic', fg: '#000000', bg: '#FFFFFF' },
  { name: 'Acme Operations', fg: '#6A469D', bg: '#FFFFFF' },
  { name: 'Ocean', fg: '#50C8DF', bg: '#FFFFFF' },
  { name: 'Forest', fg: '#34B256', bg: '#FFFFFF' },
  { name: 'Sunset', fg: '#F79A30', bg: '#FFFFFF' },
  { name: 'Berry', fg: '#DA2E72', bg: '#FFFFFF' },
  { name: 'Navy', fg: '#2D2F8E', bg: '#E8FBFF' },
  { name: 'Inverted', fg: '#FFFFFF', bg: '#000000' },
];

/**
 * QR Code Designer Component
 * 
 * Provides visual customization controls for QR code design including:
 * - Pattern style selection
 * - Corner style selection
 * - Color pickers for foreground and background
 * - Preset color themes
 * - Live preview generation
 */
export default function QRCodeDesigner({
  value = {},
  onChange,
  destinationUrl,
  showPreview = true,
  compact = false,
}) {
  // Design state
  const [foregroundColor, setForegroundColor] = useState(value.foreground_color || '#000000');
  const [backgroundColor, setBackgroundColor] = useState(value.background_color || '#FFFFFF');
  const [patternStyle, setPatternStyle] = useState(value.pattern_style || 'square');
  const [cornerStyle, setCornerStyle] = useState(value.corner_style || 'square');
  
  // Color picker visibility
  const [showFgPicker, setShowFgPicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  
  // Preview state
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  // Notify parent of changes
  useEffect(() => {
    if (onChange) {
      onChange({
        foreground_color: foregroundColor,
        background_color: backgroundColor,
        pattern_style: patternStyle,
        corner_style: cornerStyle,
      });
    }
  }, [foregroundColor, backgroundColor, patternStyle, cornerStyle, onChange]);

  // Generate preview
  const generatePreview = useCallback(async () => {
    if (!destinationUrl) return;
    
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const { data } = await axios.post('/api/qr-codes/generate-preview', {
        destination_url: destinationUrl,
        foreground_color: foregroundColor,
        background_color: backgroundColor,
      });
      setPreview(data.preview);
    } catch (e) {
      setPreviewError(e?.response?.data?.error || 'Failed to generate preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [destinationUrl, foregroundColor, backgroundColor]);

  // Auto-generate preview when design changes (debounced)
  useEffect(() => {
    if (!showPreview || !destinationUrl) return;
    
    const timer = setTimeout(() => {
      generatePreview();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [destinationUrl, foregroundColor, backgroundColor, showPreview, generatePreview]);

  // Apply color preset
  const applyPreset = (preset) => {
    setForegroundColor(preset.fg);
    setBackgroundColor(preset.bg);
  };

  return (
    <Box>
      <Grid container spacing={compact ? 2 : 3}>
        {/* Left Column: Design Controls */}
        <Grid item xs={12} md={showPreview ? 7 : 12}>
          {/* Color Presets */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight="bold" color="primary" gutterBottom>
              Color Presets
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {COLOR_PRESETS.map((preset) => (
                <Tooltip key={preset.name} title={preset.name}>
                  <Button
                    size="small"
                    variant={foregroundColor === preset.fg && backgroundColor === preset.bg ? 'contained' : 'outlined'}
                    onClick={() => applyPreset(preset)}
                    sx={{
                      minWidth: 36,
                      height: 36,
                      p: 0.5,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: preset.bg,
                        border: '1px solid',
                        borderColor: 'grey.300',
                        borderRadius: 0.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          bgcolor: preset.fg,
                          borderRadius: 0.25,
                        }}
                      />
                    </Box>
                  </Button>
                </Tooltip>
              ))}
            </Stack>
          </Box>

          {/* Custom Colors */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight="bold" color="primary" gutterBottom>
              Custom Colors
            </Typography>
            <Grid container spacing={2}>
              {/* Foreground Color */}
              <Grid item xs={6}>
                <Box>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    Foreground (QR Code)
                  </Typography>
                  <Box
                    onClick={() => setShowFgPicker(!showFgPicker)}
                    sx={{
                      width: '100%',
                      height: 40,
                      bgcolor: foregroundColor,
                      borderRadius: 1,
                      border: '2px solid',
                      borderColor: 'grey.300',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      '&:hover': {
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <SwatchIcon className="h-5 w-5" style={{ color: backgroundColor }} />
                  </Box>
                  <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                    {foregroundColor}
                  </Typography>
                  {showFgPicker && (
                    <Box sx={{ position: 'relative', mt: 1 }}>
                      <Box
                        sx={{
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          zIndex: 1,
                        }}
                        onClick={() => setShowFgPicker(false)}
                      />
                      <Box sx={{ position: 'relative', zIndex: 2 }}>
                        <HexColorPicker color={foregroundColor} onChange={setForegroundColor} />
                      </Box>
                    </Box>
                  )}
                </Box>
              </Grid>

              {/* Background Color */}
              <Grid item xs={6}>
                <Box>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    Background
                  </Typography>
                  <Box
                    onClick={() => setShowBgPicker(!showBgPicker)}
                    sx={{
                      width: '100%',
                      height: 40,
                      bgcolor: backgroundColor,
                      borderRadius: 1,
                      border: '2px solid',
                      borderColor: 'grey.300',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      '&:hover': {
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <Squares2X2Icon className="h-5 w-5" style={{ color: foregroundColor }} />
                  </Box>
                  <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
                    {backgroundColor}
                  </Typography>
                  {showBgPicker && (
                    <Box sx={{ position: 'relative', mt: 1 }}>
                      <Box
                        sx={{
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          zIndex: 1,
                        }}
                        onClick={() => setShowBgPicker(false)}
                      />
                      <Box sx={{ position: 'relative', zIndex: 2 }}>
                        <HexColorPicker color={backgroundColor} onChange={setBackgroundColor} />
                      </Box>
                    </Box>
                  )}
                </Box>
              </Grid>
            </Grid>
          </Box>

          {/* Pattern Style - Note: These are stored but current qrcode library uses square patterns only */}
          <Box sx={{ mb: 3, display: 'none' }}>
            <Typography variant="subtitle2" fontWeight="bold" color="primary" gutterBottom>
              Pattern Style
            </Typography>
            <ToggleButtonGroup
              value={patternStyle}
              exclusive
              onChange={(e, v) => v && setPatternStyle(v)}
              fullWidth
            >
              {PATTERN_STYLES.map((style) => (
                <ToggleButton key={style.value} value={style.value}>
                  <style.icon sx={{ mr: 1 }} />
                  {style.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* Corner Style - Note: These are stored but current qrcode library uses square corners only */}
          <Box sx={{ mb: 3, display: 'none' }}>
            <Typography variant="subtitle2" fontWeight="bold" color="primary" gutterBottom>
              Corner Style
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={cornerStyle}
                onChange={(e) => setCornerStyle(e.target.value)}
              >
                {CORNER_STYLES.map((style) => (
                  <MenuItem key={style.value} value={style.value}>{style.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Grid>

        {/* Right Column: Preview */}
        {showPreview && (
          <Grid item xs={12} md={5}>
            <Box sx={{ position: 'sticky', top: 16 }}>
              <Typography variant="subtitle2" fontWeight="bold" color="primary" gutterBottom>
                Preview
              </Typography>
              <Paper
                elevation={2}
                sx={{
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 200,
                  bgcolor: backgroundColor,
                  border: '1px solid',
                  borderColor: 'grey.200',
                }}
              >
                {previewLoading ? (
                  <CircularProgress size={40} />
                ) : preview ? (
                  <img
                    src={preview}
                    alt="QR Code Preview"
                    style={{ maxWidth: '100%', maxHeight: 200 }}
                  />
                ) : !destinationUrl ? (
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Enter a destination URL to see a preview
                  </Typography>
                ) : previewError ? (
                  <Typography variant="body2" color="error" textAlign="center">
                    {previewError}
                  </Typography>
                ) : (
                  <Button
                    variant="outlined"
                    onClick={generatePreview}
                    startIcon={<EyeIcon className="h-5 w-5" />}
                  >
                    Generate Preview
                  </Button>
                )}
              </Paper>
              
              {preview && (
                <Button
                  fullWidth
                  variant="outlined"
                  size="small"
                  onClick={generatePreview}
                  disabled={previewLoading}
                  startIcon={previewLoading ? <CircularProgress size={16} /> : <VisibilityIcon />}
                  sx={{ mt: 1 }}
                >
                  Refresh Preview
                </Button>
              )}
            </Box>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
