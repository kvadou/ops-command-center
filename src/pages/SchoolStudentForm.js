import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Box,
  Card,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Container,
} from '@mui/material';
import { AcademicCapIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const brandColors = {
  purple: '#6A469D',
  navy: '#2D2F8E',
  cyan: '#50C8DF',
  green: '#34B256',
};

export default function SchoolStudentForm() {
  const { formToken } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [formConfig, setFormConfig] = useState(null);
  
  // Multiple students support - array of student objects
  const [students, setStudents] = useState([
    {
      student_first_name: '',
      student_last_name: '',
      parent_first_name: '',
      parent_last_name: '',
      parent_email: '',
    }
  ]);

  useEffect(() => {
    // Fetch form configuration to display school/job info
    const fetchFormConfig = async () => {
      try {
        const response = await axios.get(`/api/school-student-import/form/${formToken}/config`);
        setFormConfig(response.data);
        
        // Form config is loaded - no need to set defaults here
        // The form will automatically add students to the job specified in formConfig
      } catch (err) {
        console.error('Error fetching form config:', err);
        if (err.response?.status === 404) {
          setError('Form not found or inactive. Please check the form link.');
        } else {
          setError('Failed to load form. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };
    
    if (formToken) {
      fetchFormConfig();
    }
  }, [formToken]);

  const handleAddStudent = () => {
    setStudents([...students, {
      student_first_name: '',
      student_last_name: '',
      parent_first_name: '',
      parent_last_name: '',
      parent_email: '',
    }]);
  };

  const handleRemoveStudent = (index) => {
    if (students.length > 1) {
      setStudents(students.filter((_, i) => i !== index));
    }
  };

  const handleStudentChange = (index, field, value) => {
    const updatedStudents = [...students];
    updatedStudents[index] = {
      ...updatedStudents[index],
      [field]: value
    };
    setStudents(updatedStudents);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    // Validate: at least one student with first name
    const validStudents = students.filter(s => s.student_first_name.trim());
    if (validStudents.length === 0) {
      setError('Please enter at least one student with a first name.');
      return;
    }

    // Validate: if parent email is provided, it should be valid
    const invalidEmails = validStudents.filter(s => 
      s.parent_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.parent_email)
    );
    if (invalidEmails.length > 0) {
      setError('Please enter valid email addresses for all students.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await axios.post(`/api/school-student-import/form/${formToken}`, {
        students: validStudents,
        service_id: formConfig?.service_id || formConfig?.auto_add_to_service_id,
      });
      
      if (response.data.success) {
        setSubmitted(true);
      } else {
        setError(response.data.error || 'Failed to submit form');
      }
    } catch (err) {
      console.error('Error submitting form:', err);
      setError(err.response?.data?.error || 'Failed to submit form. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (submitted) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <CheckCircleIcon className="h-16 w-16" style={{ color: brandColors.green, marginBottom: 16 }} />
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Thank You!
          </Typography>
          <Typography variant="body1" color="textSecondary" sx={{ mt: 2 }}>
            {formConfig?.service_name 
              ? `All students have been successfully enrolled in ${formConfig.service_name}. They have been added to the class and all scheduled lessons.`
              : 'All students have been successfully enrolled. They have been added to the class and all scheduled lessons.'}
          </Typography>
        </Card>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
      <Card sx={{ p: 4 }}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <AcademicCapIcon className="h-10 w-10" style={{ color: brandColors.purple }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              Student Roster
            </Typography>
            {formConfig && (
              <>
                <Typography variant="h6" color="textSecondary" sx={{ mt: 0.5 }}>
                  {formConfig.school_name}
                </Typography>
                {formConfig.service_name && (
                  <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                    <Typography variant="body1" fontWeight={600}>
                      Class: {formConfig.service_name}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      Students will be automatically added to this class when you submit the form.
                    </Typography>
                  </Alert>
                )}
              </>
            )}
          </Box>
        </Box>

        {formConfig && formConfig.form_name && (
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            {formConfig.form_name}
          </Typography>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
              Add Students ({students.length} {students.length === 1 ? 'student' : 'students'})
            </Typography>
            
            {students.map((student, index) => (
              <Card key={index} variant="outlined" sx={{ p: 2, position: 'relative' }}>
                {students.length > 1 && (
                  <Button
                    onClick={() => handleRemoveStudent(index)}
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      minWidth: 'auto',
                      p: 0.5,
                      color: 'error.main',
                    }}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </Button>
                )}
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  Student {index + 1}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Student First Name *"
                    value={student.student_first_name}
                    onChange={(e) => handleStudentChange(index, 'student_first_name', e.target.value)}
                    required
                    sx={{ flex: '1 1 200px', minWidth: '150px' }}
                  />
                  <TextField
                    label="Student Last Name"
                    value={student.student_last_name}
                    onChange={(e) => handleStudentChange(index, 'student_last_name', e.target.value)}
                    sx={{ flex: '1 1 200px', minWidth: '150px' }}
                  />
                  <TextField
                    label="Parent First Name"
                    value={student.parent_first_name}
                    onChange={(e) => handleStudentChange(index, 'parent_first_name', e.target.value)}
                    sx={{ flex: '1 1 200px', minWidth: '150px' }}
                  />
                  <TextField
                    label="Parent Last Name"
                    value={student.parent_last_name}
                    onChange={(e) => handleStudentChange(index, 'parent_last_name', e.target.value)}
                    sx={{ flex: '1 1 200px', minWidth: '150px' }}
                  />
                  <TextField
                    label="Parent Email"
                    type="email"
                    value={student.parent_email}
                    onChange={(e) => handleStudentChange(index, 'parent_email', e.target.value)}
                    sx={{ flex: '1 1 250px', minWidth: '200px' }}
                  />
                </Box>
              </Card>
            ))}

            <Button
              onClick={handleAddStudent}
              variant="outlined"
              startIcon={<PlusIcon className="h-5 w-5" />}
              sx={{
                borderColor: brandColors.purple,
                color: brandColors.purple,
                '&:hover': {
                  borderColor: brandColors.navy,
                  bgcolor: `${brandColors.purple}10`,
                },
              }}
            >
              Add Another Student
            </Button>

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Note:</strong> Only student first name is required. All other fields are optional.
                {formConfig?.service_name && (
                  <> Students will be automatically added to <strong>{formConfig.service_name}</strong> when you submit.</>
                )}
              </Typography>
            </Alert>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={submitting}
              sx={{
                mt: 3,
                bgcolor: brandColors.purple,
                '&:hover': { bgcolor: brandColors.navy },
                py: 1.5,
              }}
            >
              {submitting ? <CircularProgress size={24} /> : `Submit ${students.filter(s => s.student_first_name.trim()).length} Student${students.filter(s => s.student_first_name.trim()).length !== 1 ? 's' : ''}`}
            </Button>
          </Box>
        </form>
      </Card>
    </Container>
  );
}

