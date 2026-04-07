
import React, { useEffect } from "react";
import DOMPurify from "dompurify";
import {
  Dialog, DialogTitle, DialogContent, IconButton,
  Box, Typography, Divider, List, ListItemButton, ListItemText,
  useMediaQuery, useTheme
} from "@mui/material";
import { XMarkIcon } from '@heroicons/react/24/outline';

import "./PolicyModal.css";

const PolicyModal = ({ open, onClose, sections = [], jumpTo = [], scrollTo = null }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Auto-scroll to specified section when modal opens
  useEffect(() => {
    if (open && scrollTo) {
      // Small delay to allow modal to render
      const timer = setTimeout(() => {
        scrollToSection(scrollTo);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, scrollTo]);

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      fullWidth 
      maxWidth="md" 
      fullScreen={isMobile}
      scroll="paper"
      PaperProps={{
        sx: {
          borderRadius: { xs: 0, sm: 2 },
          maxHeight: { xs: '100vh', sm: '90vh' },
          m: { xs: 0, sm: 2 },
        },
      }}
    >
      <DialogTitle sx={{ 
        display: "flex", 
        justifyContent: "space-between",
        alignItems: "center",
        px: { xs: 2, sm: 3 },
        py: { xs: 1.5, sm: 2 },
      }}>
        <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
          Policies & Agreements
        </Typography>
        <IconButton 
          edge="end" 
          onClick={onClose} 
          aria-label="close"
          sx={{
            p: { xs: 1, sm: 0.5 },
            minWidth: { xs: '44px', sm: 'auto' },
            minHeight: { xs: '44px', sm: 'auto' },
          }}
        >
          <XMarkIcon className="h-5 w-5" />
        </IconButton>
      </DialogTitle>

      <DialogContent 
        dividers
        sx={{
          px: { xs: 2, sm: 3 },
          py: { xs: 2, sm: 3 },
          maxHeight: { xs: "calc(100vh - 120px)", sm: "calc(90vh - 120px)" },
        }}
      >
        {jumpTo?.length > 0 && (
          <Box mb={3}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
              Jump to:
            </Typography>
            <List dense disablePadding>
              {jumpTo.map(({ id, label }) => (
                <ListItemButton 
                  key={id} 
                  onClick={() => scrollToSection(id)}
                  sx={{
                    minHeight: { xs: '44px', sm: 'auto' },
                    py: { xs: 1.5, sm: 1 },
                  }}
                >
                  <ListItemText 
                    primary={label} 
                    primaryTypographyProps={{
                      sx: { fontSize: { xs: '0.875rem', sm: '0.875rem' } }
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
            <Divider sx={{ mt: 2 }} />
          </Box>
        )}

        {sections.map(({ id, html, label }) => (
          <Box key={id} mb={4}>
            <Typography 
              id={id} 
              variant="h6" 
              gutterBottom
              sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
            >
              {label}
            </Typography>
            <Box
              className="policy-content"
              sx={{
                fontSize: { xs: '0.875rem', sm: '1rem' },
                lineHeight: { xs: 1.6, sm: 1.5 },
              }}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(html || ""),
              }}
            />
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
};

export default PolicyModal;
