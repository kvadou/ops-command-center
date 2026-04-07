import React, { useState } from "react";
import {
  Box,
  Button,
  Typography,
  TextField,
  Alert,
  CircularProgress,
  Fade,
  Grow,
  IconButton,
} from "@mui/material";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { isValidPhoneNumber } from "libphonenumber-js";
import { CheckCircleIcon, PlusCircleIcon, MinusCircleIcon } from '@heroicons/react/24/outline';

// Brand colors
const BRAND = {
  navy: "#2D2F8E",
  purple: "#6A469D",
  cyan: "#50C8DF",
  green: "#34B256",
  yellow: "#FACC29",
  orange: "#F79A30",
  pink: "#DA2E72",
  light: "#E8FBFF",
};

export default function EventLeadCaptureForm({ eventName, eventId, onSuccess, headerText, thankYouText }) {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [students, setStudents] = useState([{ firstName: "", lastName: "" }]);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({});

  const requiredFields = ["firstName", "lastName", "email", "phone"];

  const validateField = (field, value) => {
    switch (field) {
      case "firstName":
        return value.trim() ? "" : "First name is required";
      case "lastName":
        return value.trim() ? "" : "Last name is required";
      case "email":
        if (!value.trim()) return "Email is required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Please enter a valid email";
        return "";
      case "phone":
        if (!value) return "Phone number is required";
        if (!isValidPhoneNumber(value)) return "Please enter a valid phone number";
        return "";
      default:
        return "";
    }
  };

  const validateForm = () => {
    const newErrors = {};
    requiredFields.forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) newErrors[field] = error;
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      // Mark all required fields as touched to show errors
      const allTouched = {};
      requiredFields.forEach((f) => { allTouched[f] = true; });
      setTouched(allTouched);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      // Filter out empty students
      const validStudents = students.filter(s => s.firstName.trim() || s.lastName.trim());

      const response = await fetch("/api/event-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          // Keep backward compatibility with single student fields
          studentFirstName: validStudents[0]?.firstName || "",
          studentLastName: validStudents[0]?.lastName || "",
          // Also send full students array for future use
          students: validStudents,
          eventName,
          eventId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit form");
      }

      const result = await response.json();
      setSubmitted(true);

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (error) {
      console.error("Form submission error:", error);
      setErrors({ submit: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field) => (e) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Validate on change if field was touched
    if (touched[field]) {
      setErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
    }
  };

  const handleStudentChange = (index, field) => (e) => {
    const value = e.target.value;
    setStudents((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addStudent = () => {
    if (students.length < 2) {
      setStudents((prev) => [...prev, { firstName: "", lastName: "" }]);
    }
  };

  const removeStudent = (index) => {
    if (students.length > 1) {
      setStudents((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleBlur = (field) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateField(field, formData[field]);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handlePhoneChange = (value) => {
    setFormData((prev) => ({ ...prev, phone: value || "" }));

    if (touched.phone) {
      setErrors((prev) => ({ ...prev, phone: validateField("phone", value || "") }));
    }
  };

  if (submitted) {
    return (
      <Grow in timeout={500}>
        <Box
          sx={{
            maxWidth: 480,
            mx: "auto",
            mt: { xs: 2, sm: 4 },
            p: { xs: 3, sm: 4 },
            bgcolor: "white",
            borderRadius: 3,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            textAlign: "center",
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              mx: "auto",
              mb: 3,
              borderRadius: "50%",
              bgcolor: BRAND.green,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCircleIcon className="h-12 w-12" style={{ color: "white" }} />
          </Box>

          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: BRAND.navy,
              mb: 2,
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            Thank You!
          </Typography>

          <Typography
            variant="body1"
            sx={{ color: "text.secondary", mb: 2, lineHeight: 1.7 }}
          >
            {thankYouText || "We've received your information and will be in touch soon about our chess programs."}
          </Typography>

          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              bgcolor: BRAND.light,
              py: 1.5,
              px: 2,
              borderRadius: 2,
              display: "inline-block",
            }}
          >
            No payment or commitment required - we'll follow up with more information!
          </Typography>
        </Box>
      </Grow>
    );
  }

  return (
    <Fade in timeout={300}>
      <Box
        sx={{
          maxWidth: 480,
          mx: "auto",
          mt: { xs: 0, sm: 4 },
          p: 0,
          bgcolor: "white",
          borderRadius: { xs: 0, sm: 3 },
          boxShadow: { xs: "none", sm: "0 8px 32px rgba(0,0,0,0.12)" },
          overflow: "hidden",
        }}
      >
        {/* Header with gradient */}
        <Box
          sx={{
            background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.purple} 100%)`,
            py: 3,
            px: 3,
            textAlign: "center",
          }}
        >
          <Box sx={{ mb: 1.5, display: "flex", justifyContent: "center" }}>
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                bgcolor: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              <img
                src="/logo512.png"
                alt="Acme Operations"
                style={{ width: 56, height: 56, objectFit: "contain" }}
              />
            </Box>
          </Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              color: "white",
              fontFamily: "'Poppins', sans-serif",
              mb: 0.5,
            }}
          >
            {eventName || "Event Registration"}
          </Typography>
          {headerText && (
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.85)", mt: 1 }}>
              {headerText}
            </Typography>
          )}
        </Box>

        {/* Form */}
        <Box component="form" onSubmit={handleSubmit} sx={{ p: 3, pt: 2.5 }}>
          {/* Parent Information */}
          <Typography
            variant="overline"
            sx={{ color: BRAND.purple, fontWeight: 600, letterSpacing: 1, display: "block", mb: 1.5 }}
          >
            Your Information
          </Typography>

          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            <TextField
              fullWidth
              label="First Name"
              value={formData.firstName}
              onChange={handleInputChange("firstName")}
              onBlur={handleBlur("firstName")}
              error={touched.firstName && !!errors.firstName}
              helperText={touched.firstName && errors.firstName}
              required
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: BRAND.purple,
                  },
                },
                "& .MuiInputLabel-root.Mui-focused": { color: BRAND.purple },
              }}
            />
            <TextField
              fullWidth
              label="Last Name"
              value={formData.lastName}
              onChange={handleInputChange("lastName")}
              onBlur={handleBlur("lastName")}
              error={touched.lastName && !!errors.lastName}
              helperText={touched.lastName && errors.lastName}
              required
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                    borderColor: BRAND.purple,
                  },
                },
                "& .MuiInputLabel-root.Mui-focused": { color: BRAND.purple },
              }}
            />
          </Box>

          <TextField
            fullWidth
            label="Email"
            type="email"
            value={formData.email}
            onChange={handleInputChange("email")}
            onBlur={handleBlur("email")}
            error={touched.email && !!errors.email}
            helperText={touched.email && errors.email}
            required
            size="small"
            sx={{
              mb: 2,
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: BRAND.purple,
                },
              },
              "& .MuiInputLabel-root.Mui-focused": { color: BRAND.purple },
            }}
          />

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 0.5, fontSize: "0.75rem" }}>
              Phone Number *
            </Typography>
            <PhoneInput
              value={formData.phone}
              onChange={handlePhoneChange}
              onBlur={() => handleBlur("phone")()}
              defaultCountry="US"
              placeholder="(555) 123-4567"
              style={{
                border: touched.phone && errors.phone ? "1px solid #d32f2f" : "1px solid #c4c4c4",
                borderRadius: "8px",
                padding: "10px 12px",
                width: "100%",
                fontSize: "16px",
                transition: "border-color 0.2s",
              }}
            />
            {touched.phone && errors.phone && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block", ml: 1.5 }}>
                {errors.phone}
              </Typography>
            )}
          </Box>

          {/* Student Information (Optional) */}
          <Box sx={{ mt: 3, pt: 2, borderTop: "1px solid #e8e8e8" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
              <Typography
                variant="overline"
                sx={{ color: BRAND.purple, fontWeight: 600, letterSpacing: 1 }}
              >
                Student Information
              </Typography>
              {students.length < 2 && (
                <Button
                  size="small"
                  startIcon={<PlusCircleIcon className="h-5 w-5" />}
                  onClick={addStudent}
                  sx={{
                    textTransform: "none",
                    color: BRAND.purple,
                    fontSize: "0.75rem",
                    "&:hover": { bgcolor: "rgba(106, 70, 157, 0.08)" },
                  }}
                >
                  Add Student
                </Button>
              )}
            </Box>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
              Optional - tell us about your {students.length > 1 ? "children" : "child"} (up to 2)
            </Typography>

            {students.map((student, index) => (
              <Box key={index} sx={{ mb: 2 }}>
                {students.length > 1 && (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500 }}>
                      Student {index + 1}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => removeStudent(index)}
                      sx={{ color: "error.main", p: 0.5 }}
                    >
                      <MinusCircleIcon className="h-5 w-5" />
                    </IconButton>
                  </Box>
                )}
                <Box sx={{ display: "flex", gap: 2 }}>
                  <TextField
                    fullWidth
                    label={students.length > 1 ? "First Name" : "Student First Name"}
                    value={student.firstName}
                    onChange={handleStudentChange(index, "firstName")}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                          borderColor: BRAND.purple,
                        },
                      },
                      "& .MuiInputLabel-root.Mui-focused": { color: BRAND.purple },
                    }}
                  />
                  <TextField
                    fullWidth
                    label={students.length > 1 ? "Last Name" : "Student Last Name"}
                    value={student.lastName}
                    onChange={handleStudentChange(index, "lastName")}
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                          borderColor: BRAND.purple,
                        },
                      },
                      "& .MuiInputLabel-root.Mui-focused": { color: BRAND.purple },
                    }}
                  />
                </Box>
              </Box>
            ))}
          </Box>

          {/* Notes */}
          <TextField
            fullWidth
            label="Questions or Notes"
            multiline
            rows={2}
            value={formData.notes}
            onChange={handleInputChange("notes")}
            placeholder="Anything you'd like us to know?"
            size="small"
            sx={{
              mt: 1,
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: BRAND.purple,
                },
              },
              "& .MuiInputLabel-root.Mui-focused": { color: BRAND.purple },
            }}
          />

          {errors.submit && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
              {errors.submit}
            </Alert>
          )}

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={isSubmitting}
            sx={{
              mt: 3,
              py: 1.5,
              borderRadius: 2,
              textTransform: "none",
              fontSize: "1rem",
              fontWeight: 600,
              bgcolor: BRAND.purple,
              "&:hover": {
                bgcolor: BRAND.navy,
              },
              "&:disabled": {
                bgcolor: "#ccc",
              },
            }}
          >
            {isSubmitting ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={20} sx={{ color: "white" }} />
                <span>Submitting...</span>
              </Box>
            ) : (
              "Get More Information"
            )}
          </Button>

          <Typography
            variant="caption"
            sx={{ display: "block", textAlign: "center", mt: 2, color: "text.secondary" }}
          >
            No payment or commitment required
          </Typography>
        </Box>
      </Box>
    </Fade>
  );
}
