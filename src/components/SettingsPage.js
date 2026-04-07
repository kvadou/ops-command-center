import React, { useState, useMemo } from 'react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  BuildingOfficeIcon,
  CreditCardIcon,
  UserGroupIcon,
  BoltIcon,
  TagIcon,
  MapPinIcon,
  AcademicCapIcon,
  EnvelopeIcon,
  CurrencyDollarIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Checkbox,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Box,
  IconButton,
  Radio,
  RadioGroup,
  FormLabel,
} from '@mui/material';

// Settings categories structure
const SETTINGS_CATEGORIES = [
  {
    id: 'company-details',
    name: 'Company Details',
    icon: BuildingOfficeIcon,
    description: 'Company Name, URL bit, Page Logo, Default signup Branch, Company Blurb',
    items: [
      { id: 'company-details-main', name: 'Company Details', description: 'Company Name, URL bit, Page Logo, Default signup Branch, Company Blurb' },
      { id: 'branch-details', name: 'Branch Details', description: 'Branch Name, Client login, Client signup, Send Pipeline clients a welcome email, Date Input Format, Date Output Format, Distance Units, Street Address, Town' },
    ],
  },
  {
    id: 'terms',
    name: 'Terms and Conditions',
    icon: DocumentTextIcon,
    description: 'Edit Terms and Conditions shown to users when they sign up, login, or make payments',
    items: [
      { id: 'terms-conditions', name: 'Terms and Conditions', description: 'Edit Terms and Conditions shown to users when they sign up, login, or make payments' },
    ],
  },
  {
    id: 'payment-integrations',
    name: 'Payment Integrations',
    icon: CreditCardIcon,
    description: 'Card Payments with Stripe, Direct Debit with GoCardless',
    items: [
      { id: 'stripe-payments', name: 'Card Payments with Stripe', description: 'Set up online card payments and manage the settings for them here' },
      { id: 'stripe-matching', name: 'Card Payment Matching', description: 'Match your clients from TutorCruncher to your clients in Stripe' },
      { id: 'gocardless-payments', name: 'Direct Debit Integration with GoCardless', description: 'Set up direct debit payments and manage the settings for them here' },
      { id: 'gocardless-matching', name: 'Direct Debit Matching', description: 'Match your clients from TutorCruncher to your clients in GoCardless' },
    ],
  },
  {
    id: 'people-activity',
    name: 'People and Activity',
    icon: UserGroupIcon,
    description: 'People settings, Activity settings, Clients Booking Lessons & Tutors',
    items: [
      { id: 'people', name: 'People', description: "Automatically mark idle Tutors Dormant, Number of idle days to be Dormant, Tutors view Student/Client details, Tutors can view other Tutors' reports, Use Affiliates" },
      { id: 'activity', name: 'Activity', description: 'Group to notify when a Tutor applies for a Job, Create job for enquiries, Report Visibility, Lesson Reports Required, Approve lesson reports before sending, Job Inactivity Time, Create Gone Cold tasks, Request Reviews automatically, Request Review on job completion by tutor, Default lesson duration, Default Review Units, Default Job Status, Default Job Tutor Permissions, Use Assigned Credit, Use TutorCruncher Subscriptions, Use TutorCruncher Packages, Lesson late cancellation notice, Require reason for lesson cancellation, Default Online Integration' },
      { id: 'clients-booking', name: 'Clients Booking Lessons & Tutors', description: 'Public Tutor profiles, Lesson late cancellation notice, Clients book Public Tutors, Lesson booking time threshold' },
      { id: 'safeguarding', name: 'Safeguarding/Wellbeing Concerns', description: 'Use Safeguarding/Wellbeing Concerns, Safeguarding/Wellbeing Concerns start ID, Lock functionality for severe Safeguarding/Wellbeing Concerns', badge: 'new' },
    ],
  },
  {
    id: 'labels',
    name: 'Labels',
    icon: TagIcon,
    description: 'Create and manage your Labels here',
    items: [
      { id: 'labels', name: 'Labels', description: 'Create and manage your Labels here' },
    ],
  },
  {
    id: 'pipeline',
    name: 'Pipeline Stages',
    icon: BoltIcon,
    description: 'Create and reorder Client Pipeline stages',
    items: [
      { id: 'pipeline-stages', name: 'Pipeline Stages', description: 'Create and reorder Client Pipeline stages' },
    ],
  },
  {
    id: 'locations',
    name: 'Locations',
    icon: MapPinIcon,
    description: 'Create and manage your Locations here',
    items: [
      { id: 'locations', name: 'Locations', description: 'Create and manage your Locations here' },
    ],
  },
  {
    id: 'subjects',
    name: 'Custom Subjects',
    icon: AcademicCapIcon,
    description: 'Add and manage your Custom Subjects here',
    items: [
      { id: 'custom-subjects', name: 'Custom Subjects', description: 'Add and manage your Custom Subjects here' },
      { id: 'hidden-subjects', name: 'Hidden Subjects', description: 'Hide any Subjects you don\'t use here' },
    ],
  },
  {
    id: 'qualifications',
    name: 'Custom Qualification Levels',
    icon: AcademicCapIcon,
    description: 'Add and manage your Custom Qualification Levels here',
    items: [
      { id: 'custom-qualifications', name: 'Custom Qualification Levels', description: 'Add and manage your Custom Qualification Levels here' },
      { id: 'hidden-qualifications', name: 'Hidden Qualification Levels', description: 'Hide any Qualification Levels you don\'t use here' },
    ],
  },
  {
    id: 'communication',
    name: 'Communication Settings',
    icon: EnvelopeIcon,
    description: 'Email Styles, Email Definitions, SMS Definitions',
    items: [
      { id: 'email-styles', name: 'Email Styles', description: 'Configure email styling and templates' },
      { id: 'email-definitions', name: 'Email Definitions', description: 'Define email types and settings' },
      { id: 'sms-definitions', name: 'SMS Definitions', description: 'Define SMS types and settings' },
    ],
  },
  {
    id: 'accounting',
    name: 'Accounting Settings',
    icon: CurrencyDollarIcon,
    description: 'General, Client Balances, Tax Rates, Lookups, Ad Hoc Charge Categories',
    items: [
      { id: 'accounting-general', name: 'General', description: 'General accounting settings' },
      { id: 'client-balances', name: 'Client Balances', description: 'Manage client balance settings' },
      { id: 'tax-rates', name: 'Tax Rates', description: 'Configure tax rates' },
      { id: 'lookups', name: 'Lookups', description: 'Manage accounting lookups' },
      { id: 'adhoc-categories', name: 'Ad Hoc Charge Categories', description: 'Manage ad hoc charge categories' },
      { id: 'credit-categories', name: 'Credit/Discount Categories', description: 'Manage credit and discount categories' },
    ],
  },
  {
    id: 'integrations',
    name: 'Integrations',
    icon: LinkIcon,
    description: 'Online Integrations, Approve Public Tutor Profiles',
    items: [
      { id: 'online-integrations', name: 'Online Integrations', description: 'Configure online integrations' },
      { id: 'approve-tutor-profiles', name: 'Approve Public Tutor Profiles', description: 'Manage public tutor profile approvals' },
    ],
  },
  {
    id: 'system',
    name: 'System Customization',
    icon: Cog6ToothIcon,
    description: 'PDFs, Custom Fields, Email Templates, Dashboard Templates, Image Assets, Custom CSS, Custom Javascript, Bookings',
    items: [
      { id: 'pdfs', name: 'PDFs', description: 'Manage PDF templates and settings' },
      { id: 'custom-fields', name: 'Custom Fields', description: 'Create and manage custom fields' },
      { id: 'email-templates', name: 'Email Templates', description: 'Manage email templates' },
      { id: 'dashboard-templates', name: 'Dashboard Templates', description: 'Manage dashboard templates' },
      { id: 'image-assets', name: 'Image Assets', description: 'Manage image assets' },
      { id: 'custom-css', name: 'Custom CSS', description: 'Add custom CSS' },
      { id: 'custom-javascript', name: 'Custom Javascript', description: 'Add custom JavaScript' },
      { id: 'bookings', name: 'Bookings', description: 'Configure booking settings' },
    ],
  },
  {
    id: 'api',
    name: 'TutorCruncher API',
    icon: LinkIcon,
    description: 'Branch Feeds',
    items: [
      { id: 'branch-feeds', name: 'Branch Feeds', description: 'Manage branch feeds for API' },
    ],
  },
];

function SettingsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [openModal, setOpenModal] = useState(false);

  // Filter categories and items based on search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return SETTINGS_CATEGORIES;
    }

    const query = searchQuery.toLowerCase();
    return SETTINGS_CATEGORIES.map(category => {
      const matchesCategory = category.name.toLowerCase().includes(query) ||
        category.description.toLowerCase().includes(query);
      
      const filteredItems = category.items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );

      if (matchesCategory || filteredItems.length > 0) {
        return {
          ...category,
          items: matchesCategory ? category.items : filteredItems,
        };
      }
      return null;
    }).filter(Boolean);
  }, [searchQuery]);

  const handleItemClick = (category, item) => {
    setSelectedCategory(category);
    setSelectedItem(item);
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setSelectedItem(null);
    setSelectedCategory(null);
  };

  const handleSave = () => {
    // TODO: Implement save functionality
    console.log('Saving settings for:', selectedItem?.id);
    handleCloseModal();
  };

  return (
    <div className="max-w-7xl mx-auto w-full">
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-neutral-900">Settings</h1>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Start typing to search settings..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent w-64"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Settings Categories */}
          <div className="space-y-6">
            {filteredCategories.map((category) => {
              const Icon = category.icon;
              return (
                <div key={category.id} className="border-b border-neutral-200 pb-6 last:border-b-0">
                  <div className="flex items-start gap-3 mb-4">
                    <Icon className="h-6 w-6 text-brand-purple mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-neutral-900 mb-1">
                        {category.name}
                      </h2>
                      <p className="text-sm text-neutral-600">{category.description}</p>
                    </div>
                  </div>
                  
                  <div className="ml-9 space-y-2">
                    {category.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(category, item)}
                        className="w-full text-left p-3 rounded-lg hover:bg-neutral-50 transition-colors border border-transparent hover:border-neutral-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-medium text-neutral-900">
                                {item.name}
                              </h3>
                              {item.badge && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">{item.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Settings Modal */}
          <Dialog
            open={openModal}
            onClose={handleCloseModal}
            maxWidth="md"
            fullWidth
            PaperProps={{
              sx: {
                borderRadius: 2,
                maxHeight: '90vh',
              },
            }}
          >
            <DialogTitle sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              pb: 1,
              pt: 2,
            }}>
              <Typography variant="h6" component="div">
                {selectedItem?.name || 'Settings'}
              </Typography>
              <IconButton onClick={handleCloseModal} size="small">
                <XMarkIcon className="h-5 w-5" />
              </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ pt: 2 }}>
              {selectedItem && (
                <SettingsModalContent 
                  itemId={selectedItem.id} 
                  itemName={selectedItem.name}
                />
              )}
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={handleCloseModal} color="error">
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                variant="contained" 
                sx={{ 
                  bgcolor: '#6A469D',
                  '&:hover': { bgcolor: '#5a3a8d' },
                }}
              >
                Save
              </Button>
            </DialogActions>
          </Dialog>
        </div>
      </div>
  );
}

// Settings Modal Content Component
function SettingsModalContent({ itemId, itemName }) {
  // This will render different content based on itemId
  // For now, we'll create basic forms for the most common settings

  if (itemId === 'company-details-main') {
    return <CompanyDetailsForm />;
  }
  
  if (itemId === 'branch-details') {
    return <BranchDetailsForm />;
  }

  if (itemId === 'people') {
    return <PeopleSettingsForm />;
  }

  if (itemId === 'activity') {
    return <ActivitySettingsForm />;
  }

  if (itemId === 'terms-conditions') {
    return <TermsConditionsForm />;
  }

  if (itemId === 'stripe-payments') {
    return <StripePaymentsForm />;
  }

  if (itemId === 'clients-booking') {
    return <ClientsBookingForm />;
  }

  if (itemId === 'safeguarding') {
    return <SafeguardingForm />;
  }

  // Default placeholder
  return (
    <Box sx={{ py: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Settings form for {itemName} will be implemented here.
      </Typography>
    </Box>
  );
}

// Individual Settings Forms
function CompanyDetailsForm() {
  const [formData, setFormData] = useState({
    companyName: 'Acme Operations',
    urlBit: 'login',
    companyBlurb: '',
    defaultSignupBranch: 'Acme Operations',
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
      <TextField
        label="Company Name *"
        value={formData.companyName}
        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
        fullWidth
        required
      />
      <TextField
        label="URL bit"
        value={formData.urlBit}
        onChange={(e) => setFormData({ ...formData, urlBit: e.target.value })}
        fullWidth
        helperText="This makes up part of your Company's links."
      />
      <TextField
        label="Company Blurb"
        value={formData.companyBlurb}
        onChange={(e) => setFormData({ ...formData, companyBlurb: e.target.value })}
        fullWidth
        multiline
        rows={4}
        helperText="This will be the text displayed above the listing of all of your company branches in the contact section."
      />
      <FormControl fullWidth>
        <InputLabel>Default signup Branch</InputLabel>
        <Select
          value={formData.defaultSignupBranch}
          onChange={(e) => setFormData({ ...formData, defaultSignupBranch: e.target.value })}
          label="Default signup Branch"
        >
          <MenuItem value="Acme Operations">Acme Operations</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );
}

function BranchDetailsForm() {
  const [formData, setFormData] = useState({
    branchName: 'Acme Operations',
    clientLogin: true,
    clientSignup: true,
    sendPipelineWelcomeEmail: true,
    tutorsCanJoin: false,
    clientsCanCreateStudents: true,
    branchEmail: 'support@acmeops.com',
    telephone: '(212) 796 - 2737',
    branchWebsite: 'https://acmeops.com/',
    timezone: 'America/New_York',
    firstDayOfWeek: 'Sunday',
    dateInputFormat: 'M/D/YYYY h:mm a',
    dateOutputFormat: 'M/D/YYYY h:mm a',
    distanceUnits: 'Miles',
    streetAddress: '254 7th Ave',
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
      <TextField
        label="Branch Name *"
        value={formData.branchName}
        onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
        fullWidth
        required
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={formData.clientLogin}
            onChange={(e) => setFormData({ ...formData, clientLogin: e.target.checked })}
          />
        }
        label="Client login"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Whether clients can login to TutorCruncher.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.clientSignup}
            onChange={(e) => setFormData({ ...formData, clientSignup: e.target.checked })}
          />
        }
        label="Client signup"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Whether new clients can signup for accounts when booking lessons.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.sendPipelineWelcomeEmail}
            onChange={(e) => setFormData({ ...formData, sendPipelineWelcomeEmail: e.target.checked })}
          />
        }
        label="Send Pipeline clients a welcome email"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Sends Clients who are added to the pipeline a Welcome Email. Uncheck this to only send a Welcome Email to clients when they get the Live status.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.tutorsCanJoin}
            onChange={(e) => setFormData({ ...formData, tutorsCanJoin: e.target.checked })}
          />
        }
        label="Tutors can join"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Whether or not Tutors can join this Branch, applies to both new Tutors applying to the branch and Tutors from other Branches switching to this Branch.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.clientsCanCreateStudents}
            onChange={(e) => setFormData({ ...formData, clientsCanCreateStudents: e.target.checked })}
          />
        }
        label="Clients can create their own Students"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        If checked clients can create their own students. The student's paying client will be set to the client who created them.
      </Typography>

      <TextField
        label="Branch Email"
        value={formData.branchEmail}
        onChange={(e) => setFormData({ ...formData, branchEmail: e.target.value })}
        fullWidth
        helperText="Used on Invoices and Payment Orders."
      />

      <TextField
        label="Telephone Number"
        value={formData.telephone}
        onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
        fullWidth
      />

      <TextField
        label="Branch Website"
        value={formData.branchWebsite}
        onChange={(e) => setFormData({ ...formData, branchWebsite: e.target.value })}
        fullWidth
        helperText="The address of your company's website. If you haven't set up a website yet you can leave this blank."
      />

      <FormControl fullWidth>
        <InputLabel>Timezone *</InputLabel>
        <Select
          value={formData.timezone}
          onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
          label="Timezone *"
        >
          <MenuItem value="America/New_York">New York</MenuItem>
          <MenuItem value="America/Chicago">Chicago</MenuItem>
          <MenuItem value="America/Denver">Denver</MenuItem>
          <MenuItem value="America/Los_Angeles">Los Angeles</MenuItem>
        </Select>
      </FormControl>

      <FormControl fullWidth>
        <InputLabel>First day of the week *</InputLabel>
        <Select
          value={formData.firstDayOfWeek}
          onChange={(e) => setFormData({ ...formData, firstDayOfWeek: e.target.value })}
          label="First day of the week *"
        >
          <MenuItem value="Sunday">Sunday</MenuItem>
          <MenuItem value="Monday">Monday</MenuItem>
        </Select>
      </FormControl>

      <FormControl fullWidth>
        <InputLabel>Date Input Format *</InputLabel>
        <Select
          value={formData.dateInputFormat}
          onChange={(e) => setFormData({ ...formData, dateInputFormat: e.target.value })}
          label="Date Input Format *"
        >
          <MenuItem value="M/D/YYYY h:mm a">7/25/2014 2:30 pm</MenuItem>
          <MenuItem value="DD/MM/YYYY HH:mm">25/07/2014 14:30</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: 2 }}>
        The first half will be used for date fields, this does not affect how dates are displayed.
      </Typography>

      <FormControl fullWidth>
        <InputLabel>Date Output Format *</InputLabel>
        <Select
          value={formData.dateOutputFormat}
          onChange={(e) => setFormData({ ...formData, dateOutputFormat: e.target.value })}
          label="Date Output Format *"
        >
          <MenuItem value="M/D/YYYY h:mm a">7/25/2014 2:30 pm</MenuItem>
          <MenuItem value="DD/MM/YYYY HH:mm">25/07/2014 14:30</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: 2 }}>
        The first half will be used for dates.
      </Typography>

      <FormControl fullWidth>
        <InputLabel>Distance Units *</InputLabel>
        <Select
          value={formData.distanceUnits}
          onChange={(e) => setFormData({ ...formData, distanceUnits: e.target.value })}
          label="Distance Units *"
        >
          <MenuItem value="Miles">Miles</MenuItem>
          <MenuItem value="Kilometers">Kilometers</MenuItem>
        </Select>
      </FormControl>

      <TextField
        label="Street Address"
        value={formData.streetAddress}
        onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
        fullWidth
      />
    </Box>
  );
}

function PeopleSettingsForm() {
  const [formData, setFormData] = useState({
    markIdleTutorsDormant: true,
    idleDays: 60,
    tutorsViewStudentClientDetails: true,
    tutorsViewOtherTutorsReports: true,
    useAffiliates: false,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={formData.markIdleTutorsDormant}
            onChange={(e) => setFormData({ ...formData, markIdleTutorsDormant: e.target.checked })}
          />
        }
        label="Automatically mark idle Tutors Dormant"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        If checked, Tutors that are idle for more than X days will be marked as Dormant. (Any activity by, or about the Tutor will reset the timer).
      </Typography>

      <TextField
        label="Number of idle days to be Dormant *"
        type="number"
        value={formData.idleDays}
        onChange={(e) => setFormData({ ...formData, idleDays: parseInt(e.target.value) || 0 })}
        fullWidth
        required
        helperText="Number of days that a Tutor has to have been inactive for the system to mark him or her as Dormant"
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.tutorsViewStudentClientDetails}
            onChange={(e) => setFormData({ ...formData, tutorsViewStudentClientDetails: e.target.checked })}
          />
        }
        label="Tutors view Student/Client details"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        If checked Tutors can view basic details of Students and Clients on their Jobs.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.tutorsViewOtherTutorsReports}
            onChange={(e) => setFormData({ ...formData, tutorsViewOtherTutorsReports: e.target.checked })}
          />
        }
        label="Tutors can view other Tutors' reports"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        If checked, your Tutors will be able to view other tutors' reports, providing they are on the same Job.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.useAffiliates}
            onChange={(e) => setFormData({ ...formData, useAffiliates: e.target.checked })}
          />
        }
        label="Use Affiliates"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Whether or not you use Affiliates with your Company
      </Typography>
    </Box>
  );
}

function ActivitySettingsForm() {
  const [formData, setFormData] = useState({
    groupToNotify: 'both',
    createJobForEnquiries: false,
    reportVisibility: 'clients_and_invoice',
    lessonReportsRequired: true,
    approveLessonReports: false,
    jobInactivityTime: 90,
    createGoneColdTasks: false,
    requestReviewsAutomatically: true,
    requestReviewOnJobCompletion: false,
    defaultLessonDuration: 60,
    defaultReviewUnits: 5,
    defaultJobStatus: 'pending',
    defaultJobTutorPermissions: 'add_edit_lessons',
    useAssignedCredit: false,
    useSubscriptions: true,
    usePackages: true,
    lessonLateCancellationNotice: 24,
    requireReasonForCancellation: true,
    defaultOnlineIntegration: '',
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
      <FormControl fullWidth>
        <InputLabel>Group to notify when a Tutor applies for a Job</InputLabel>
        <Select
          value={formData.groupToNotify}
          onChange={(e) => setFormData({ ...formData, groupToNotify: e.target.value })}
          label="Group to notify when a Tutor applies for a Job"
        >
          <MenuItem value="both">Notify both groups</MenuItem>
          <MenuItem value="client_managers">Notify client managers only</MenuItem>
          <MenuItem value="tutors">Notify tutors only</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: 2 }}>
        Choose who to notify when a Tutor applies for a new job.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.createJobForEnquiries}
            onChange={(e) => setFormData({ ...formData, createJobForEnquiries: e.target.checked })}
          />
        }
        label="Create job for enquiries"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Create a new job every time a Client submits an Enquiry
      </Typography>

      <FormControl fullWidth>
        <InputLabel>Report Visibility</InputLabel>
        <Select
          value={formData.reportVisibility}
          onChange={(e) => setFormData({ ...formData, reportVisibility: e.target.value })}
          label="Report Visibility"
        >
          <MenuItem value="clients_and_invoice">Viewable to Clients and included in Invoice emails</MenuItem>
          <MenuItem value="clients_only">Viewable to Clients only</MenuItem>
          <MenuItem value="internal_only">Internal only</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: 2 }}>
        Choose who Lesson Reports should be visible to.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.lessonReportsRequired}
            onChange={(e) => setFormData({ ...formData, lessonReportsRequired: e.target.checked })}
          />
        }
        label="Lesson Reports Required"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb:2 }}>
        Prevents Lessons being marked as complete until they have a Report. Turned on automatically if auto invoice is enabled (see accounting settings).
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.approveLessonReports}
            onChange={(e) => setFormData({ ...formData, approveLessonReports: e.target.checked })}
          />
        }
        label="Approve lesson reports before sending"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        If true, then no lesson reports will be sent until they are approved
      </Typography>

      <TextField
        label="Job Inactivity Time"
        type="number"
        value={formData.jobInactivityTime}
        onChange={(e) => setFormData({ ...formData, jobInactivityTime: parseInt(e.target.value) || 0 })}
        fullWidth
        helperText="Time (in days) of inactivity on a job before it is marked as 'Gone Cold'"
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.createGoneColdTasks}
            onChange={(e) => setFormData({ ...formData, createGoneColdTasks: e.target.checked })}
          />
        }
        label="Create Gone Cold tasks"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Whether a job being marked as 'Gone Cold' creates a task for any relevant client managers.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.requestReviewsAutomatically}
            onChange={(e) => setFormData({ ...formData, requestReviewsAutomatically: e.target.checked })}
          />
        }
        label="Request Reviews automatically"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Automatically request reviews from your clients after a set number of lesson units per job
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.requestReviewOnJobCompletion}
            onChange={(e) => setFormData({ ...formData, requestReviewOnJobCompletion: e.target.checked })}
          />
        }
        label="Request Review on job completion by tutor"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Automatically request reviews from your clients when a tutor marks a job as finished
      </Typography>

      <TextField
        label="Default lesson duration"
        type="number"
        value={formData.defaultLessonDuration}
        onChange={(e) => setFormData({ ...formData, defaultLessonDuration: parseInt(e.target.value) || 0 })}
        fullWidth
        helperText="Default lesson duration in minutes"
      />

      <TextField
        label="Default Review Units"
        type="number"
        value={formData.defaultReviewUnits}
        onChange={(e) => setFormData({ ...formData, defaultReviewUnits: parseInt(e.target.value) || 0 })}
        fullWidth
        helperText="The default amount of units before an automatic review request is sent."
      />

      <FormControl fullWidth>
        <InputLabel>Default Job Status</InputLabel>
        <Select
          value={formData.defaultJobStatus}
          onChange={(e) => setFormData({ ...formData, defaultJobStatus: e.target.value })}
          label="Default Job Status"
        >
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="available">Available</MenuItem>
          <MenuItem value="in_progress">In Progress</MenuItem>
          <MenuItem value="finished">Finished</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: 2 }}>
        The default status for a job when it's created
      </Typography>

      <FormControl fullWidth>
        <InputLabel>Default Job Tutor Permissions</InputLabel>
        <Select
          value={formData.defaultJobTutorPermissions}
          onChange={(e) => setFormData({ ...formData, defaultJobTutorPermissions: e.target.value })}
          label="Default Job Tutor Permissions"
        >
          <MenuItem value="add_edit_lessons">Tutor can add and edit Lessons</MenuItem>
          <MenuItem value="view_only">Tutor can view only</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -2, mb: 2 }}>
        Choose the default permission for Tutor when creating a Job
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.useAssignedCredit}
            onChange={(e) => setFormData({ ...formData, useAssignedCredit: e.target.checked })}
          />
        }
        label="Use Assigned Credit"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Whether or not you use Assigned Credit with Jobs
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.useSubscriptions}
            onChange={(e) => setFormData({ ...formData, useSubscriptions: e.target.checked })}
          />
        }
        label="Use TutorCruncher Subscriptions"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Whether or not you want to use Subscriptions in TutorCruncher. More info.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.usePackages}
            onChange={(e) => setFormData({ ...formData, usePackages: e.target.checked })}
          />
        }
        label="Use TutorCruncher Packages"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Whether you want to use Packages in TutorCruncher. More info.
      </Typography>

      <TextField
        label="Lesson late cancellation notice"
        type="number"
        value={formData.lessonLateCancellationNotice}
        onChange={(e) => setFormData({ ...formData, lessonLateCancellationNotice: parseInt(e.target.value) || 0 })}
        fullWidth
        helperText="The amount of notice in hours a client can give when cancelling an Lesson late without it still being chargeable"
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.requireReasonForCancellation}
            onChange={(e) => setFormData({ ...formData, requireReasonForCancellation: e.target.checked })}
          />
        }
        label="Require reason for lesson cancellation"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        When cancelling a lesson, require the reason to be filled out.
      </Typography>
    </Box>
  );
}

function TermsConditionsForm() {
  const [formData, setFormData] = useState({
    title: 'Please agree to our terms and conditions',
    content: '',
    notifyUsers: 'not_yet_consented',
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
      <TextField
        label="Terms and Conditions Title *"
        value={formData.title}
        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        fullWidth
        required
      />

      <TextField
        label="Terms and Conditions"
        value={formData.content}
        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
        fullWidth
        multiline
        rows={10}
        helperText="Terms and conditions for your users to agree to before using TutorCruncher with your branch and making payments."
      />

      <FormControl component="fieldset">
        <FormLabel component="legend">Notify users of changes to Terms and Conditions *</FormLabel>
        <RadioGroup
          value={formData.notifyUsers}
          onChange={(e) => setFormData({ ...formData, notifyUsers: e.target.value })}
        >
          <FormControlLabel value="no_one" control={<Radio />} label="Notify no one" />
          <FormControlLabel 
            value="not_yet_consented" 
            control={<Radio />} 
            label="Only notify users who have not yet given consent" 
          />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1, mb: 2 }}>
            All users who have not yet consented will receive an email
          </Typography>
          <FormControlLabel 
            value="all_users" 
            control={<Radio />} 
            label="Notify all users and require them to reconsent to data storage" 
          />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -1 }}>
            All users who either given consent or not yet given consent will receive an email requesting them to reconsent to you new terms and conditions. All of these users will have their "Storage Consent" status set back to Not yet given.
          </Typography>
        </RadioGroup>
      </FormControl>
    </Box>
  );
}

function StripePaymentsForm() {
  const [formData, setFormData] = useState({
    addCardProcessingSurcharge: false,
    fixedSurcharge: '',
    percentageSurcharge: '',
    requireZipcode: false,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Acme Operations is currently connected to Stripe.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Button variant="outlined">Refresh connection with Stripe</Button>
        <Button variant="contained" color="error">Remove Stripe from TutorCruncher</Button>
      </Box>

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.addCardProcessingSurcharge}
            onChange={(e) => setFormData({ ...formData, addCardProcessingSurcharge: e.target.checked })}
          />
        }
        label="Add card processing surcharge"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Add card processing surcharge to Invoices, Credit Requests and top-ups paid via card. This is not included in system accounting, instead it is applied at payment time.
      </Typography>

      <TextField
        label="Card processing surcharge (fixed)"
        value={formData.fixedSurcharge}
        onChange={(e) => setFormData({ ...formData, fixedSurcharge: e.target.value })}
        fullWidth
        disabled={!formData.addCardProcessingSurcharge}
        helperText="Fixed part of card fees in cents/pence, eg. '20' for $/£0.20. Only applies if 'Add card processing surcharge' is checked."
      />

      <TextField
        label="Card processing surcharge (percentage)"
        value={formData.percentageSurcharge}
        onChange={(e) => setFormData({ ...formData, percentageSurcharge: e.target.value })}
        fullWidth
        disabled={!formData.addCardProcessingSurcharge}
        helperText="A surcharge that clients will be charged for paying via card, eg. '1.4' for 1.4%. Only applies if 'Add card processing surcharge' is checked."
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.requireZipcode}
            onChange={(e) => setFormData({ ...formData, requireZipcode: e.target.checked })}
          />
        }
        label="Require zipcode/postcode when saving a new card for a client"
      />
    </Box>
  );
}

function ClientsBookingForm() {
  const [formData, setFormData] = useState({
    publicTutorProfiles: false,
    lessonLateCancellationNotice: 24,
    clientsBookPublicTutors: false,
    lessonBookingTimeThreshold: 24,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={formData.publicTutorProfiles}
            onChange={(e) => setFormData({ ...formData, publicTutorProfiles: e.target.checked })}
          />
        }
        label="Public Tutor profiles"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Generate public profiles for tutors which are accessible via Socket and the API.
      </Typography>

      <TextField
        label="Lesson late cancellation notice *"
        type="number"
        value={formData.lessonLateCancellationNotice}
        onChange={(e) => setFormData({ ...formData, lessonLateCancellationNotice: parseInt(e.target.value) || 0 })}
        fullWidth
        required
        helperText="The amount of notice in hours a client can give when cancelling an Lesson late without it still being chargeable"
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.clientsBookPublicTutors}
            onChange={(e) => setFormData({ ...formData, clientsBookPublicTutors: e.target.checked })}
          />
        }
        label="Clients book Public Tutors"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Ticking this option will allow clients to book any public tutors that have set their availability.
      </Typography>

      <TextField
        label="Lesson booking time threshold *"
        type="number"
        value={formData.lessonBookingTimeThreshold}
        onChange={(e) => setFormData({ ...formData, lessonBookingTimeThreshold: parseInt(e.target.value) || 0 })}
        fullWidth
        required
        helperText="The amount of hours before a lesson is due to take place that a client can book a lesson. If a Pending lesson has not been confirmed by this time, then it will be automatically cancelled."
      />
    </Box>
  );
}

function SafeguardingForm() {
  const [formData, setFormData] = useState({
    useSafeguarding: true,
    startId: 1,
    lockFunctionality: true,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={formData.useSafeguarding}
            onChange={(e) => setFormData({ ...formData, useSafeguarding: e.target.checked })}
          />
        }
        label="Use Safeguarding/Wellbeing Concerns"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Whether you want to use TutorCrunchers Safeguarding/Wellbeing Concerns feature.
      </Typography>

      <TextField
        label="Safeguarding/Wellbeing Concerns start ID"
        type="number"
        value={formData.startId}
        onChange={(e) => setFormData({ ...formData, startId: parseInt(e.target.value) || 0 })}
        fullWidth
        helperText="Initial Safeguarding/Wellbeing Concerns ID, this will have no effect if it's lower than an existing Safeguarding/Wellbeing Concerns ID. For example, if you set this to 100, Safeguarding/Wellbeing Concerns will start from WBC-100."
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={formData.lockFunctionality}
            onChange={(e) => setFormData({ ...formData, lockFunctionality: e.target.checked })}
          />
        }
        label="Lock functionality for severe Safeguarding/Wellbeing Concerns"
      />
      <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -2, mb: 2 }}>
        Whether Safeguarding/Wellbeing Concerns that are raised with a 'Severe' severity level should lock Job and Lesson functionality.
      </Typography>
    </Box>
  );
}

export default SettingsPage;

