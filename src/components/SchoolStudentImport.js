import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
} from '@mui/material';
import {
  PlusIcon,
  UserPlusIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  PaperAirplaneIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { useToast } from '../hooks/useToast';
import ConfirmationModal from './ConfirmationModal';

const brandColors = {
  purple: '#6A469D',
  navy: '#2D2F8E',
  cyan: '#50C8DF',
  green: '#34B256',
  orange: '#F79A30',
  pink: '#DA2E72',
};

export default function SchoolStudentImport({ schoolClientId, schoolName, currentJobs }) {
  const toast = useToast();
  const [prospects, setProspects] = useState([]);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState(0);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  // Dialog states
  const [addStudentDialogOpen, setAddStudentDialogOpen] = useState(false);
  const [createFormDialogOpen, setCreateFormDialogOpen] = useState(false);
  const [enrollingProspect, setEnrollingProspect] = useState(null);
  const [deletingFormId, setDeletingFormId] = useState(null);
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [formToDelete, setFormToDelete] = useState(null);
  
  // Form states
  const [studentForm, setStudentForm] = useState({
    student_first_name: '',
    student_last_name: '',
    parent_first_name: '',
    parent_last_name: '',
    parent_email: '',
    parent_phone: '',
    add_to_current_job: false,
    add_to_future_lessons: true,
    target_job_service_id: '',
    notes: '',
  });
  
  const [formConfig, setFormConfig] = useState({
    form_name: `${schoolName} - Student Roster`,
    require_student_name: true,
    require_parent_name: false,
    require_email: false,
    require_phone: false,
    allow_add_to_current_job: true,
    allow_add_to_future_lessons: false,
    default_add_to_current_job: true,
    default_add_to_future_lessons: false,
    auto_add_to_service_id: '',
    auto_trigger_email_campaign: false,
    email_campaign_type: 'enrollment_reminder',
  });

  useEffect(() => {
    if (schoolClientId) {
      fetchData();
    }
  }, [schoolClientId, activeSubTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const axiosInstance = axios.create({
        withCredentials: true
      });

      if (activeSubTab === 0) {
        // Fetch prospects
        const prospectsRes = await axiosInstance.get(`/api/school-student-import/${schoolClientId}/prospects`);
        setProspects(prospectsRes.data.prospects || []);
      } else if (activeSubTab === 1) {
        // Fetch forms
        const formsRes = await axiosInstance.get(`/api/school-student-import/${schoolClientId}/forms`);
        setForms(formsRes.data.forms || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async () => {
    if (!studentForm.student_first_name || !studentForm.parent_email) {
      toast.error('Please fill in required fields: Student First Name and Parent Email');
      return;
    }

    try {
      const axiosInstance = axios.create({
        withCredentials: true
      });

      await axiosInstance.post(`/api/school-student-import/${schoolClientId}/prospects`, {
        ...studentForm,
        school_name: schoolName,
      });

      toast.success('Student prospect added successfully!');
      setAddStudentDialogOpen(false);
      setStudentForm({
        student_first_name: '',
        student_last_name: '',
        parent_first_name: '',
        parent_last_name: '',
        parent_email: '',
        parent_phone: '',
        add_to_current_job: false,
        add_to_future_lessons: true,
        target_job_service_id: '',
        notes: '',
      });
      fetchData();
    } catch (error) {
      console.error('Error adding student:', error);
      toast.error(`Failed to add student: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleEnrollProspect = async (prospectId) => {
    setConfirmState({
      isOpen: true,
      title: 'Enroll Student',
      message: 'Enroll this student in TutorCruncher? This will create a client record.',
      action: async () => {
        setEnrollingProspect(prospectId);
        try {
          const axiosInstance = axios.create({
            withCredentials: true
          });

          await axiosInstance.post(`/api/school-student-import/${schoolClientId}/enroll`, {
            prospectId: prospectId,
          });

          toast.success('Student enrolled successfully in TutorCruncher!');
          fetchData();
        } catch (error) {
          console.error('Error enrolling student:', error);
          toast.error(`Failed to enroll student: ${error.response?.data?.error || error.message}`);
        } finally {
          setEnrollingProspect(null);
        }
      },
    });
  };

  const handleCreateForm = async () => {
    if (!formConfig.form_name) {
      toast.error('Please enter a form name');
      return;
    }

    if (!formConfig.auto_add_to_service_id) {
      toast.error('Please select a class/job for this roster form. Students will be automatically added to this class.');
      return;
    }

    try {
      const axiosInstance = axios.create({
        withCredentials: true
      });

      const response = await axiosInstance.post(`/api/school-student-import/${schoolClientId}/forms`, {
        ...formConfig,
        school_name: schoolName,
      });

      toast.success('Student Roster form created successfully! Share the form URL with the school administrator.');
      setCreateFormDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error creating form:', error);
      toast.error(`Failed to create form: ${error.response?.data?.error || error.message}`);
    }
  };

  const copyFormUrl = (formUrl) => {
    navigator.clipboard.writeText(formUrl);
    toast.success('Form URL copied to clipboard!');
  };

  const handleDeleteForm = (form) => {
    setFormToDelete(form);
    setDeleteConfirmDialogOpen(true);
  };

  const confirmDeleteForm = async () => {
    if (!formToDelete) return;

    setDeletingFormId(formToDelete.id);
    try {
      const axiosInstance = axios.create({
        withCredentials: true
      });

      await axiosInstance.delete(`/api/school-student-import/${schoolClientId}/forms/${formToDelete.id}`);

      toast.success('Form deleted successfully!');
      setDeleteConfirmDialogOpen(false);
      setFormToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting form:', error);
      toast.error(`Failed to delete form: ${error.response?.data?.error || error.message}`);
    } finally {
      setDeletingFormId(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Get in-progress jobs for dropdown
  const inProgressJobs = currentJobs?.filter(job => job.status === 'in-progress') || [];

  if (loading && prospects.length === 0 && forms.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Sub-tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={activeSubTab}
          onChange={(e, newValue) => setActiveSubTab(newValue)}
          sx={{
            '& .Mui-selected': {
              color: `${brandColors.purple} !important`,
            },
            '& .MuiTabs-indicator': {
              backgroundColor: brandColors.purple,
            },
          }}
        >
          <Tab label="Prospect Students" icon={<UserIcon className="h-5 w-5" />} iconPosition="start" />
          <Tab label="Student Roster" icon={<LinkIcon className="h-5 w-5" />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Prospect Students Tab */}
      {activeSubTab === 0 && (
        <Card sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h6">Prospect Students</Typography>
            <Button
              variant="contained"
              startIcon={<UserPlusIcon className="h-5 w-5" />}
              onClick={() => setAddStudentDialogOpen(true)}
              sx={{ bgcolor: brandColors.purple, '&:hover': { bgcolor: brandColors.navy } }}
            >
              Add Student
            </Button>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              Prospect students are parents/students who have expressed interest but haven't been fully enrolled yet. 
              Once you have their information, you can enroll them in TutorCruncher to add them to jobs and lessons.
            </Typography>
          </Alert>

          {prospects.length === 0 ? (
            <Alert severity="info">No prospect students yet. Add your first student to get started.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Student Name</TableCell>
                    <TableCell>Parent Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Phone</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell>Added</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {prospects.map((prospect) => (
                    <TableRow key={prospect.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {prospect.student_first_name} {prospect.student_last_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {prospect.parent_first_name || prospect.parent_last_name
                          ? `${prospect.parent_first_name || ''} ${prospect.parent_last_name || ''}`.trim()
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <EnvelopeIcon className="h-4 w-4 text-gray-500" />
                          {prospect.parent_email}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {prospect.parent_phone ? (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <PhoneIcon className="h-4 w-4 text-gray-500" />
                            {prospect.parent_phone}
                          </Box>
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={prospect.status}
                          size="small"
                          color={
                            prospect.status === 'enrolled'
                              ? 'success'
                              : prospect.status === 'contacted'
                              ? 'info'
                              : 'default'
                          }
                        />
                      </TableCell>
                      <TableCell>{formatDate(prospect.created_at)}</TableCell>
                      <TableCell align="center">
                        {prospect.status !== 'enrolled' ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleEnrollProspect(prospect.id)}
                            disabled={enrollingProspect === prospect.id}
                            startIcon={enrollingProspect === prospect.id ? <CircularProgress size={16} /> : <CheckCircleIcon className="h-5 w-5" />}
                            sx={{ borderColor: brandColors.green, color: brandColors.green }}
                          >
                            {enrollingProspect === prospect.id ? 'Enrolling...' : 'Enroll'}
                          </Button>
                        ) : (
                          <Chip
                            label="Enrolled"
                            size="small"
                            color="success"
                            icon={<CheckCircleIcon className="h-5 w-5" />}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      )}

      {/* Public Forms Tab */}
      {activeSubTab === 1 && (
        <Card sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h6">Public Registration Forms</Typography>
            <Button
              variant="contained"
              startIcon={<LinkIcon className="h-5 w-5" />}
              onClick={() => setCreateFormDialogOpen(true)}
              sx={{ bgcolor: brandColors.purple, '&:hover': { bgcolor: brandColors.navy } }}
            >
              Create Form
            </Button>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              Create a public form link that school administrators can share with parents. 
              When parents submit the form, all students will be automatically created in TutorCruncher and added to the selected class and its lessons.
            </Typography>
          </Alert>

          {forms.length === 0 ? (
            <Alert severity="info">No forms created yet. Create your first form to share with school administrators.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Form Name</TableCell>
                    <TableCell>Form URL</TableCell>
                    <TableCell align="center">Submissions</TableCell>
                    <TableCell>Last Submission</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {forms.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {form.form_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {form.form_url}
                          </Typography>
                          <Tooltip title="Copy URL">
                            <IconButton
                              size="small"
                              onClick={() => copyFormUrl(form.form_url)}
                              sx={{ color: brandColors.purple }}
                            >
                              <ClipboardDocumentIcon className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell align="center">{form.total_submissions || 0}</TableCell>
                      <TableCell>{formatDate(form.last_submission_at)}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={form.is_active ? 'Active' : 'Inactive'}
                          size="small"
                          color={form.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Box display="flex" alignItems="center" gap={1} justifyContent="center">
                          <Tooltip title="Copy Link">
                            <IconButton
                              size="small"
                              onClick={() => copyFormUrl(form.form_url)}
                              sx={{ color: brandColors.cyan }}
                            >
                              <ClipboardDocumentIcon className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Form">
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteForm(form)}
                              disabled={deletingFormId === form.id}
                              sx={{ color: 'error.main' }}
                            >
                              {deletingFormId === form.id ? (
                                <CircularProgress size={16} />
                              ) : (
                                <TrashIcon className="h-4 w-4" />
                              )}
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      )}

      {/* Add Student Dialog */}
      <Dialog open={addStudentDialogOpen} onClose={() => setAddStudentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Student Prospect</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Student First Name *"
                value={studentForm.student_first_name}
                onChange={(e) => setStudentForm({ ...studentForm, student_first_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Student Last Name"
                value={studentForm.student_last_name}
                onChange={(e) => setStudentForm({ ...studentForm, student_last_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Parent First Name"
                value={studentForm.parent_first_name}
                onChange={(e) => setStudentForm({ ...studentForm, parent_first_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Parent Last Name"
                value={studentForm.parent_last_name}
                onChange={(e) => setStudentForm({ ...studentForm, parent_last_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Parent Email *"
                type="email"
                required
                value={studentForm.parent_email}
                onChange={(e) => setStudentForm({ ...studentForm, parent_email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Parent Phone"
                type="tel"
                value={studentForm.parent_phone}
                onChange={(e) => setStudentForm({ ...studentForm, parent_phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" gutterBottom>Enrollment Options</Typography>
            </Grid>
            {inProgressJobs.length > 0 && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={studentForm.add_to_current_job}
                      onChange={(e) => setStudentForm({ ...studentForm, add_to_current_job: e.target.checked })}
                    />
                  }
                  label="Add to current in-progress job"
                />
                {studentForm.add_to_current_job && (
                  <FormControl fullWidth sx={{ mt: 1 }}>
                    <InputLabel>Select Job</InputLabel>
                    <Select
                      value={studentForm.target_job_service_id}
                      onChange={(e) => setStudentForm({ ...studentForm, target_job_service_id: e.target.value })}
                    >
                      {inProgressJobs.map((job) => (
                        <MenuItem key={job.serviceId} value={job.serviceId}>
                          {job.serviceName}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Grid>
            )}
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={studentForm.add_to_future_lessons}
                    onChange={(e) => setStudentForm({ ...studentForm, add_to_future_lessons: e.target.checked })}
                  />
                }
                label="Add to future scheduled lessons (will trigger enrollment email)"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={3}
                value={studentForm.notes}
                onChange={(e) => setStudentForm({ ...studentForm, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddStudentDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddStudent} variant="contained" sx={{ bgcolor: brandColors.purple }}>
            Add Student
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Form Dialog */}
      <Dialog open={createFormDialogOpen} onClose={() => setCreateFormDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create Public Registration Form</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Form Name *"
                value={formConfig.form_name}
                onChange={(e) => setFormConfig({ ...formConfig, form_name: e.target.value })}
                required
              />
            </Grid>
            
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>Important:</strong> Select the class/job below. When parents submit the form, all students will be automatically created in TutorCruncher and added to this class and all its lessons.
                </Typography>
              </Alert>
            </Grid>
            
            {inProgressJobs.length > 0 ? (
              <Grid item xs={12}>
                <FormControl fullWidth required>
                  <InputLabel>Select Class/Job *</InputLabel>
                  <Select
                    value={formConfig.auto_add_to_service_id}
                    onChange={(e) => setFormConfig({ ...formConfig, auto_add_to_service_id: e.target.value })}
                    required
                  >
                    <MenuItem value="">-- Select a class --</MenuItem>
                    {inProgressJobs.map((job) => (
                      <MenuItem key={job.serviceId} value={job.serviceId}>
                        {job.serviceName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            ) : (
              <Grid item xs={12}>
                <Alert severity="warning">
                  <Typography variant="body2">
                    No in-progress jobs found. Please create a job first before creating a student roster form.
                  </Typography>
                </Alert>
              </Grid>
            )}
            
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>Form Fields</Typography>
              <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                The form will allow multiple students to be added at once. Only student first name is required.
              </Typography>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateFormDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleCreateForm} 
            variant="contained" 
            sx={{ bgcolor: brandColors.purple }}
            disabled={!formConfig.auto_add_to_service_id}
          >
            Create Student Roster Form
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmDialogOpen} onClose={() => setDeleteConfirmDialogOpen(false)}>
        <DialogTitle>Delete Registration Form?</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Are you sure you want to delete the form <strong>"{formToDelete?.form_name}"</strong>?
          </Typography>
          {formToDelete && formToDelete.total_submissions > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                This form has {formToDelete.total_submissions} submission{formToDelete.total_submissions !== 1 ? 's' : ''}. 
                Deleting it will prevent future submissions, but existing submissions will remain in the system.
              </Typography>
            </Alert>
          )}
          <Alert severity="error" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Warning:</strong> This action cannot be undone. The form URL will no longer work after deletion.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={confirmDeleteForm} 
            variant="contained" 
            color="error"
            disabled={deletingFormId !== null}
          >
            {deletingFormId ? <CircularProgress size={20} /> : 'Delete Form'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

