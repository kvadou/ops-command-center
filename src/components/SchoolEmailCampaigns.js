import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  PaperAirplaneIcon,
  EnvelopeIcon,
  ClockIcon,
  ChartBarIcon,
  UserPlusIcon,
  ArrowPathIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
const PencilSquareIcon2 = PencilSquareIcon;
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
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

export default function SchoolEmailCampaigns({ schoolClientId, schoolName, defaultTab = 0, onSubTabChange }) {
  const [contacts, setContacts] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deleteContactId, setDeleteContactId] = useState(null);
  const [deleteContactModalOpen, setDeleteContactModalOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState(defaultTab);
  const toast = useToast();
  
  // Update activeSubTab when defaultTab prop changes
  useEffect(() => {
    if (defaultTab !== undefined) {
      setActiveSubTab(defaultTab);
    }
  }, [defaultTab]);
  
  // Handle sub-tab change and notify parent
  const handleSubTabChange = (e, newValue) => {
    setActiveSubTab(newValue);
    if (onSubTabChange) {
      onSubTabChange(e, newValue);
    }
  };
  
  // Dialog states
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  
  // Email preview/edit dialog state
  const [emailPreviewDialogOpen, setEmailPreviewDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [previewMode, setPreviewMode] = useState('edit'); // 'edit' or 'preview'
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // Form states
  const [contactForm, setContactForm] = useState({
    contact_name: '',
    contact_role: 'admin',
    email_address: '',
    phone: '',
    is_primary: false,
    preferred_contact_method: 'email',
    contact_type: 'admin',
    notes: '',
  });
  
  const [scheduleForm, setScheduleForm] = useState({
    campaign_type: '',
    is_enabled: true,
    frequency: 'one-time',
    trigger_event: '',
    days_after_trigger: 0,
    send_time: '09:00:00',
    recipient_contact_ids: [],
    additional_emails: [],
    custom_subject: '',
    custom_body: '',
    notes: '',
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
        withCredentials: true,
      });

      const [contactsRes, schedulesRes, templatesRes, campaignsRes, analyticsRes] = await Promise.all([
        axiosInstance.get(`/api/school-email-campaigns/${schoolClientId}/contacts`),
        axiosInstance.get(`/api/school-email-campaigns/${schoolClientId}/schedules`),
        axiosInstance.get(`/api/school-email-campaigns/templates`),
        axiosInstance.get(`/api/school-email-campaigns/${schoolClientId}/campaigns`),
        axiosInstance.get(`/api/school-email-campaigns/${schoolClientId}/analytics`),
      ]);

      setContacts(contactsRes.data.contacts || []);
      setSchedules(schedulesRes.data.schedules || []);
      setTemplates(templatesRes.data.templates || []);
      setCampaigns(campaignsRes.data.campaigns || []);
      setAnalytics(analyticsRes.data);
    } catch (error) {
      console.error('Error fetching email campaign data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddContact = () => {
    setEditingContact(null);
    setContactForm({
      contact_name: '',
      contact_role: 'admin',
      email_address: '',
      phone: '',
      is_primary: false,
      preferred_contact_method: 'email',
      contact_type: 'admin',
      notes: '',
    });
    setContactDialogOpen(true);
  };

  const handleEditContact = (contact) => {
    setEditingContact(contact);
    setContactForm({
      contact_name: contact.contact_name || '',
      contact_role: contact.contact_role || 'admin',
      email_address: contact.email_address || '',
      phone: contact.phone || '',
      is_primary: contact.is_primary || false,
      preferred_contact_method: contact.preferred_contact_method || 'email',
      contact_type: contact.contact_type || 'admin',
      notes: contact.notes || '',
    });
    setContactDialogOpen(true);
  };

  const handleSaveContact = async () => {
    try {
      const axiosInstance = axios.create({
        withCredentials: true,
      });

      if (editingContact) {
        await axiosInstance.put(`/api/school-email-campaigns/contacts/${editingContact.id}`, {
          ...contactForm,
          school_name: schoolName,
        });
      } else {
        await axiosInstance.post(`/api/school-email-campaigns/${schoolClientId}/contacts`, {
          ...contactForm,
          school_name: schoolName,
        });
      }

      setContactDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving contact:', error);
      toast.error(`Failed to save contact: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleDeleteContact = async () => {
    if (!deleteContactId) return;
    try {
      await axios.delete(`/api/school-email-campaigns/contacts/${deleteContactId}`, {
        withCredentials: true,
      });
      setDeleteContactModalOpen(false);
      setDeleteContactId(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast.error(`Failed to delete contact: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    setScheduleForm({
      campaign_type: schedule.campaign_type || '',
      is_enabled: schedule.is_enabled !== false,
      frequency: schedule.frequency || 'one-time',
      trigger_event: schedule.trigger_event || '',
      days_after_trigger: schedule.days_after_trigger || 0,
      send_time: schedule.send_time || '09:00:00',
      recipient_contact_ids: schedule.recipient_contact_ids || [],
      additional_emails: schedule.additional_emails || [],
      custom_subject: schedule.custom_subject || '',
      custom_body: schedule.custom_body || '',
      notes: schedule.notes || '',
    });
    setScheduleDialogOpen(true);
  };

  const handleSaveSchedule = async () => {
    try {
      await axios.post(`/api/school-email-campaigns/${schoolClientId}/schedules`, {
        ...scheduleForm,
        school_name: schoolName,
      }, { withCredentials: true });

      setScheduleDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast.error(`Failed to save schedule: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleSendEmail = (template) => {
    // Get primary contacts or all active contacts
    const primaryContacts = contacts.filter(c => c.is_primary && c.is_active);
    const recipientEmails = primaryContacts.length > 0
      ? primaryContacts.map(c => c.email_address)
      : contacts.filter(c => c.is_active).map(c => c.email_address);

    if (recipientEmails.length === 0) {
      toast.warn('No active email contacts found. Please add contacts first.');
      return;
    }

    // Replace template variables with actual values
    let subject = template.subject_template || 'Email from Acme Operations';
    let body = template.body_template || '';
    
    subject = subject.replace(/\{\{school_name\}\}/g, schoolName);
    body = body.replace(/\{\{school_name\}\}/g, schoolName);
    body = body.replace(/\{\{contact_name\}\}/g, primaryContacts[0]?.contact_name || 'there');

    // Open preview/edit dialog
    setSelectedTemplate(template);
    setEmailSubject(subject);
    setEmailBody(body);
    setPreviewMode('edit');
    setEmailPreviewDialogOpen(true);
  };

  const handleSendEmailFromDialog = async () => {
    if (!selectedTemplate) return;

    // Get primary contacts or all active contacts
    const primaryContacts = contacts.filter(c => c.is_primary && c.is_active);
    const recipientEmails = primaryContacts.length > 0
      ? primaryContacts.map(c => c.email_address)
      : contacts.filter(c => c.is_active).map(c => c.email_address);

    if (recipientEmails.length === 0) {
      toast.warn('No active email contacts found. Please add contacts first.');
      return;
    }

    setSendingEmail(true);
    try {
      const axiosInstance = axios.create({
        withCredentials: true,
      });

      // Replace any remaining template variables
      let finalSubject = emailSubject;
      let finalBody = emailBody;
      
      finalSubject = finalSubject.replace(/\{\{school_name\}\}/g, schoolName);
      finalBody = finalBody.replace(/\{\{school_name\}\}/g, schoolName);
      finalBody = finalBody.replace(/\{\{contact_name\}\}/g, primaryContacts[0]?.contact_name || 'there');

      await axiosInstance.post(`/api/school-email-campaigns/${schoolClientId}/send`, {
        campaign_type: selectedTemplate.campaign_type,
        subject: finalSubject,
        body_html: finalBody,
        recipient_emails: recipientEmails,
        recipient_names: primaryContacts.map(c => c.contact_name || ''),
      });

      toast.success('Email sent successfully!');
      setEmailPreviewDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(`Failed to send email: ${error.response?.data?.error || error.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const replacePlaceholders = (text) => {
    if (!text) return '';
    const primaryContacts = contacts.filter(c => c.is_primary && c.is_active);
    const contactName = primaryContacts[0]?.contact_name || 'there';
    
    return text
      .replace(/\{\{school_name\}\}/g, schoolName)
      .replace(/\{\{contact_name\}\}/g, contactName);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  if (loading && !contacts.length && !schedules.length) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Sub-tabs - Matching school dashboard design scheme */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3, px: { xs: 1, sm: 2 } }}>
        <Tabs
          value={activeSubTab}
          onChange={handleSubTabChange}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            minHeight: '48px',
            '& .MuiTab-root': {
              textTransform: 'none',
              fontSize: { xs: '0.75rem', sm: '0.875rem' },
              fontWeight: 500,
              minHeight: '48px',
              color: 'text.secondary',
              minWidth: { xs: 'auto', sm: '100px' },
              px: { xs: 1, sm: 2 },
              '&.Mui-selected': {
                color: `${brandColors.purple} !important`,
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: brandColors.purple,
              height: '3px',
            },
          }}
        >
          <Tab 
            label="CONTACTS" 
            icon={<EnvelopeIcon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />} 
            iconPosition="start"
            sx={{
              '& .MuiTab-iconWrapper': {
                mr: 1,
              },
            }}
          />
          <Tab 
            label="SCHEDULES" 
            icon={<ClockIcon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />} 
            iconPosition="start"
            sx={{
              '& .MuiTab-iconWrapper': {
                mr: 1,
              },
            }}
          />
          <Tab 
            label="CAMPAIGNS" 
            icon={<PaperAirplaneIcon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />} 
            iconPosition="start"
            sx={{
              '& .MuiTab-iconWrapper': {
                mr: 1,
              },
            }}
          />
          <Tab 
            label="ANALYTICS" 
            icon={<ChartBarIcon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />} 
            iconPosition="start"
            sx={{
              '& .MuiTab-iconWrapper': {
                mr: 1,
              },
            }}
          />
        </Tabs>
      </Box>

      {/* Contacts Tab */}
      {activeSubTab === 0 && (
        <Card sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h6">Email Contacts</Typography>
            <Button
              variant="contained"
              startIcon={<UserPlusIcon className="h-5 w-5" />}
              onClick={handleAddContact}
              sx={{ bgcolor: brandColors.purple, '&:hover': { bgcolor: brandColors.navy } }}
            >
              Add Contact
            </Button>
          </Box>

          {contacts.length === 0 ? (
            <Alert severity="info">No contacts added yet. Add your first contact to start sending emails.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Phone</TableCell>
                    <TableCell align="center">Primary</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell>{contact.contact_name || 'N/A'}</TableCell>
                      <TableCell>
                        <Chip label={contact.contact_role} size="small" />
                      </TableCell>
                      <TableCell>{contact.email_address}</TableCell>
                      <TableCell>{contact.phone || 'N/A'}</TableCell>
                      <TableCell align="center">
                        {contact.is_primary && (
                          <Chip label="Primary" size="small" color="primary" />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={contact.is_active ? 'Active' : 'Inactive'}
                          size="small"
                          color={contact.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => handleEditContact(contact)}
                          sx={{ color: brandColors.purple }}
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => { setDeleteContactId(contact.id); setDeleteContactModalOpen(true); }}
                          sx={{ color: brandColors.pink }}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      )}

      {/* Schedules Tab */}
      {activeSubTab === 1 && (
        <Card sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h6">Email Schedules & Cadence</Typography>
            <Button
              variant="contained"
              startIcon={<ClockIcon className="h-5 w-5" />}
              onClick={() => {
                setEditingSchedule(null);
                setScheduleForm({
                  campaign_type: '',
                  is_enabled: true,
                  frequency: 'one-time',
                  trigger_event: '',
                  days_after_trigger: 0,
                  send_time: '09:00:00',
                  recipient_contact_ids: [],
                  additional_emails: [],
                  custom_subject: '',
                  custom_body: '',
                  notes: '',
                });
                setScheduleDialogOpen(true);
              }}
              sx={{ bgcolor: brandColors.purple, '&:hover': { bgcolor: brandColors.navy } }}
            >
              Add Schedule
            </Button>
          </Box>

          {schedules.length === 0 ? (
            <Alert severity="info">
              No schedules configured. Set up automated email campaigns to maintain consistent communication.
            </Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Campaign Type</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell>Frequency</TableCell>
                    <TableCell>Trigger</TableCell>
                    <TableCell>Next Send</TableCell>
                    <TableCell align="center">Total Sent</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {schedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {schedule.campaign_name || schedule.campaign_type}
                        </Typography>
                        {schedule.description && (
                          <Typography variant="caption" color="textSecondary">
                            {schedule.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={schedule.is_enabled ? 'Enabled' : 'Disabled'}
                          size="small"
                          color={schedule.is_enabled ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell>{schedule.frequency}</TableCell>
                      <TableCell>
                        {schedule.trigger_event || 'Manual'}
                        {schedule.days_after_trigger > 0 && ` (+${schedule.days_after_trigger} days)`}
                      </TableCell>
                      <TableCell>{formatDateTime(schedule.next_scheduled_at)}</TableCell>
                      <TableCell align="center">{schedule.total_sent || 0}</TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => handleEditSchedule(schedule)}
                          sx={{ color: brandColors.purple }}
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      )}

      {/* Campaigns Tab */}
      {activeSubTab === 2 && (
        <Card sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h6">Email Campaigns</Typography>
            <Box display="flex" gap={1}>
              <Button
                variant="outlined"
                startIcon={<ArrowPathIcon className="h-5 w-5" />}
                onClick={fetchData}
                sx={{ borderColor: brandColors.purple, color: brandColors.purple }}
              >
                Refresh
              </Button>
              <Button
                variant="contained"
                startIcon={<PaperAirplaneIcon className="h-5 w-5" />}
                onClick={() => setSendDialogOpen(true)}
                sx={{ bgcolor: brandColors.purple, '&:hover': { bgcolor: brandColors.navy } }}
              >
                Send Email
              </Button>
            </Box>
          </Box>

          {/* Quick Send Templates */}
          <Box mb={3}>
            <Typography variant="subtitle2" mb={1}>Quick Send Templates</Typography>
            <Box display="flex" flexWrap="wrap" gap={1}>
              {templates.map((template) => (
                <Button
                  key={template.id}
                  variant="outlined"
                  size="small"
                  onClick={() => handleSendEmail(template)}
                  sx={{ borderColor: brandColors.cyan, color: brandColors.cyan }}
                >
                  {template.campaign_name}
                </Button>
              ))}
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Campaign History */}
          <Typography variant="subtitle1" mb={2}>Campaign History</Typography>
          {campaigns.length === 0 ? (
            <Alert severity="info">No campaigns sent yet.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Campaign Type</TableCell>
                    <TableCell>Subject</TableCell>
                    <TableCell>Recipients</TableCell>
                    <TableCell>Sent At</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="center">Opened</TableCell>
                    <TableCell align="center">Clicked</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <Chip label={campaign.campaign_type} size="small" />
                      </TableCell>
                      <TableCell>{campaign.subject}</TableCell>
                      <TableCell>{campaign.recipient_emails?.length || 0} recipients</TableCell>
                      <TableCell>{formatDateTime(campaign.sent_at)}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={campaign.status}
                          size="small"
                          color={
                            campaign.status === 'sent' || campaign.status === 'delivered'
                              ? 'success'
                              : campaign.status === 'failed'
                              ? 'error'
                              : 'default'
                          }
                        />
                      </TableCell>
                      <TableCell align="center">
                        {campaign.email_opened_count > 0 ? (
                          <Chip
                            label={`${campaign.email_opened_count} opens`}
                            size="small"
                            color="success"
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {campaign.email_clicked_count > 0 ? (
                          <Chip
                            label={`${campaign.email_clicked_count} clicks`}
                            size="small"
                            color="primary"
                          />
                        ) : (
                          '—'
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

      {/* Analytics Tab */}
      {activeSubTab === 3 && (
        <Card sx={{ p: 3 }}>
          <Typography variant="h6" mb={3}>Email Campaign Analytics</Typography>
          
          {analytics ? (
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Card variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
                  <Typography variant="subtitle2" color="textSecondary">Total Campaigns</Typography>
                  <Typography variant="h4">{analytics.overall?.total_campaigns || 0}</Typography>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
                  <Typography variant="subtitle2" color="textSecondary">Total Sent</Typography>
                  <Typography variant="h4">{analytics.overall?.total_sent || 0}</Typography>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
                  <Typography variant="subtitle2" color="textSecondary">Open Rate</Typography>
                  <Typography variant="h4">
                    {analytics.overall?.total_sent > 0
                      ? `${((analytics.overall?.total_opened / analytics.overall?.total_sent) * 100).toFixed(1)}%`
                      : '0%'}
                  </Typography>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
                  <Typography variant="subtitle2" color="textSecondary">Click Rate</Typography>
                  <Typography variant="h4">
                    {analytics.overall?.total_sent > 0
                      ? `${((analytics.overall?.total_clicked / analytics.overall?.total_sent) * 100).toFixed(1)}%`
                      : '0%'}
                  </Typography>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
                  <Typography variant="subtitle2" color="textSecondary">Avg Engagement</Typography>
                  <Typography variant="h4">
                    {analytics.overall?.avg_engagement_score
                      ? `${(parseFloat(analytics.overall.avg_engagement_score) * 100).toFixed(1)}%`
                      : '0%'}
                  </Typography>
                </Card>
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" mb={2}>Performance by Campaign Type</Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Campaign Type</TableCell>
                        <TableCell align="right">Sent</TableCell>
                        <TableCell align="right">Opened</TableCell>
                        <TableCell align="right">Clicked</TableCell>
                        <TableCell align="right">Open Rate</TableCell>
                        <TableCell align="right">Click Rate</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {analytics.by_campaign_type?.map((stat) => (
                        <TableRow key={stat.campaign_type}>
                          <TableCell>{stat.campaign_type}</TableCell>
                          <TableCell align="right">{stat.total_sent || 0}</TableCell>
                          <TableCell align="right">{stat.opened_count || 0}</TableCell>
                          <TableCell align="right">{stat.clicked_count || 0}</TableCell>
                          <TableCell align="right">
                            {stat.total_sent > 0
                              ? `${((stat.opened_count / stat.total_sent) * 100).toFixed(1)}%`
                              : '0%'}
                          </TableCell>
                          <TableCell align="right">
                            {stat.total_sent > 0
                              ? `${((stat.clicked_count / stat.total_sent) * 100).toFixed(1)}%`
                              : '0%'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          ) : (
            <Alert severity="info">No analytics data available yet.</Alert>
          )}
        </Card>
      )}

      {/* Contact Dialog */}
      <Dialog open={contactDialogOpen} onClose={() => setContactDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Contact Name"
                value={contactForm.contact_name}
                onChange={(e) => setContactForm({ ...contactForm, contact_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={contactForm.contact_role}
                  onChange={(e) => setContactForm({ ...contactForm, contact_role: e.target.value })}
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="principal">Principal</MenuItem>
                  <MenuItem value="coordinator">Coordinator</MenuItem>
                  <MenuItem value="parent">Parent</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email Address"
                type="email"
                required
                value={contactForm.email_address}
                onChange={(e) => setContactForm({ ...contactForm, email_address: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Contact Type</InputLabel>
                <Select
                  value={contactForm.contact_type}
                  onChange={(e) => setContactForm({ ...contactForm, contact_type: e.target.value })}
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="billing">Billing</MenuItem>
                  <MenuItem value="parent">Parent</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Preferred Method</InputLabel>
                <Select
                  value={contactForm.preferred_contact_method}
                  onChange={(e) => setContactForm({ ...contactForm, preferred_contact_method: e.target.value })}
                >
                  <MenuItem value="email">Email</MenuItem>
                  <MenuItem value="phone">Phone</MenuItem>
                  <MenuItem value="both">Both</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={contactForm.is_primary}
                    onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })}
                  />
                }
                label="Primary Contact"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={3}
                value={contactForm.notes}
                onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveContact} variant="contained" sx={{ bgcolor: brandColors.purple }}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingSchedule ? 'Edit Schedule' : 'Add Schedule'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Campaign Type</InputLabel>
                <Select
                  value={scheduleForm.campaign_type}
                  onChange={(e) => {
                    const template = templates.find(t => t.campaign_type === e.target.value);
                    setScheduleForm({
                      ...scheduleForm,
                      campaign_type: e.target.value,
                      custom_subject: template?.subject_template || '',
                      custom_body: template?.body_template || '',
                    });
                  }}
                >
                  {templates.map((template) => (
                    <MenuItem key={template.id} value={template.campaign_type}>
                      {template.campaign_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={scheduleForm.is_enabled}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, is_enabled: e.target.checked })}
                  />
                }
                label="Enable Schedule"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Frequency</InputLabel>
                <Select
                  value={scheduleForm.frequency}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value })}
                >
                  <MenuItem value="one-time">One-time</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="custom">Custom</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Trigger Event</InputLabel>
                <Select
                  value={scheduleForm.trigger_event}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, trigger_event: e.target.value })}
                >
                  <MenuItem value="">Manual</MenuItem>
                  <MenuItem value="enrollment">After Enrollment</MenuItem>
                  <MenuItem value="term_start">Term Start</MenuItem>
                  <MenuItem value="term_end">Term End</MenuItem>
                  <MenuItem value="custom_date">Custom Date</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Days After Trigger"
                type="number"
                value={scheduleForm.days_after_trigger}
                onChange={(e) => setScheduleForm({ ...scheduleForm, days_after_trigger: parseInt(e.target.value) || 0 })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Send Time"
                type="time"
                value={scheduleForm.send_time}
                onChange={(e) => setScheduleForm({ ...scheduleForm, send_time: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Custom Subject (optional)"
                value={scheduleForm.custom_subject}
                onChange={(e) => setScheduleForm({ ...scheduleForm, custom_subject: e.target.value })}
                placeholder="Leave empty to use template default"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Custom Body (optional)"
                multiline
                rows={6}
                value={scheduleForm.custom_body}
                onChange={(e) => setScheduleForm({ ...scheduleForm, custom_body: e.target.value })}
                placeholder="Leave empty to use template default"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={2}
                value={scheduleForm.notes}
                onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveSchedule} variant="contained" sx={{ bgcolor: brandColors.purple }}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Email Preview/Edit Dialog */}
      <Dialog 
        open={emailPreviewDialogOpen} 
        onClose={() => setEmailPreviewDialogOpen(false)} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: { height: '90vh' }
        }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              {selectedTemplate?.campaign_name || 'Email Preview & Edit'}
            </Typography>
            <ToggleButtonGroup
              value={previewMode}
              exclusive
              onChange={(e, newMode) => newMode && setPreviewMode(newMode)}
              size="small"
            >
              <ToggleButton value="edit">
                <PencilSquareIcon2 className="h-4 w-4 mr-1" />
                Edit
              </ToggleButton>
              <ToggleButton value="preview">
                <EyeIcon className="h-4 w-4 mr-1" />
                Preview
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={3}>
            {/* Available Placeholders */}
            <Grid item xs={12}>
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Available Placeholders:</Typography>
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  <li><code>{'{{school_name}}'}</code> - Will be replaced with: <strong>{schoolName}</strong></li>
                  <li><code>{'{{contact_name}}'}</code> - Will be replaced with: <strong>{contacts.find(c => c.is_primary && c.is_active)?.contact_name || 'there'}</strong></li>
                </Box>
              </Alert>
            </Grid>

            {/* Subject Line */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email Subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                disabled={previewMode === 'preview'}
                helperText={previewMode === 'preview' ? `Preview: ${replacePlaceholders(emailSubject)}` : 'Use {{school_name}} and {{contact_name}} as placeholders'}
              />
            </Grid>

            {/* Email Body */}
            <Grid item xs={12}>
              {previewMode === 'edit' ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Email Body (HTML)
                  </Typography>
                  <ReactQuill
                    theme="snow"
                    value={emailBody}
                    onChange={setEmailBody}
                    modules={{
                      toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'color': [] }, { 'background': [] }],
                        ['link'],
                        ['clean']
                      ],
                    }}
                    style={{ height: '400px', marginBottom: '50px' }}
                  />
                </Box>
              ) : (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Email Preview
                  </Typography>
                  <Paper 
                    variant="outlined" 
                    sx={{ 
                      p: 3, 
                      minHeight: '400px',
                      bgcolor: '#f5f5f5',
                      border: '1px solid #ddd'
                    }}
                  >
                    <Box 
                      sx={{ 
                        bgcolor: 'white',
                        p: 3,
                        borderRadius: 1,
                        boxShadow: 1
                      }}
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(replacePlaceholders(emailBody))
                      }}
                    />
                  </Paper>
                </Box>
              )}
            </Grid>

            {/* Recipients Info */}
            <Grid item xs={12}>
              <Alert severity="info">
                <Typography variant="subtitle2">Recipients:</Typography>
                <Typography variant="body2">
                  {contacts.filter(c => c.is_primary && c.is_active).length > 0
                    ? contacts.filter(c => c.is_primary && c.is_active).map(c => c.email_address).join(', ')
                    : contacts.filter(c => c.is_active).map(c => c.email_address).join(', ')}
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailPreviewDialogOpen(false)}>
            Cancel
          </Button>
          {previewMode === 'preview' && (
            <Button
              onClick={() => setPreviewMode('edit')}
              variant="outlined"
              startIcon={<PencilSquareIcon2 className="h-5 w-5" />}
            >
              Edit
            </Button>
          )}
          <Button
            onClick={handleSendEmailFromDialog}
            variant="contained"
            disabled={sendingEmail || !emailSubject || !emailBody}
            startIcon={sendingEmail ? <CircularProgress size={16} /> : <PaperAirplaneIcon className="h-5 w-5" />}
            sx={{ bgcolor: brandColors.purple, '&:hover': { bgcolor: brandColors.navy } }}
          >
            {sendingEmail ? 'Sending...' : 'Send Email'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationModal
        isOpen={deleteContactModalOpen}
        onClose={() => { setDeleteContactModalOpen(false); setDeleteContactId(null); }}
        onConfirm={handleDeleteContact}
        title="Delete Contact"
        message="Are you sure you want to delete this contact?"
        confirmText="Delete"
        isDestructive={true}
      />
    </Box>
  );
}

