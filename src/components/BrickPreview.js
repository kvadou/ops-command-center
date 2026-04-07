import React from "react";
import { Box, Paper, Typography, Divider } from "@mui/material";

export default function BrickPreview({ description, title = "Job Description Preview" }) {
  if (!description) {
    return (
      <Paper sx={{ p: 2, bgcolor: "#f5f5f5" }}>
        <Typography variant="subtitle2" color="textSecondary" gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ fontStyle: "italic" }}>
          No description available. Brick will be generated based on form data.
        </Typography>
      </Paper>
    );
  }

  // Parse the description to handle formatting
  const formatDescription = (text) => {
    if (!text) return "";
    
    // Split by lines and process each line
    return text.split('\n').map((line, index) => {
      if (!line.trim()) {
        return <br key={index} />;
      }
      
      // Handle bold text (**text**)
      if (line.includes('**')) {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <Box key={index} sx={{ mb: 0.5 }}>
            {parts.map((part, partIndex) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <Typography
                    key={partIndex}
                    component="span"
                    sx={{ fontWeight: "bold", fontSize: "0.9rem" }}
                  >
                    {part.slice(2, -2)}
                  </Typography>
                );
              }
              return (
                <Typography
                  key={partIndex}
                  component="span"
                  sx={{ fontSize: "0.9rem" }}
                >
                  {part}
                </Typography>
              );
            })}
          </Box>
        );
      }
      
      // Regular line
      return (
        <Typography
          key={index}
          sx={{ 
            fontSize: "0.9rem",
            mb: 0.5,
            lineHeight: 1.4
          }}
        >
          {line}
        </Typography>
      );
    });
  };

  return (
    <Paper sx={{ p: 2, bgcolor: "#fafafa", border: "1px solid #e0e0e0" }}>
      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
        {title}
      </Typography>
      <Divider sx={{ mb: 2 }} />
      <Box sx={{ 
        fontFamily: "monospace",
        fontSize: "0.85rem",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap"
      }}>
        {formatDescription(description)}
      </Box>
    </Paper>
  );
}