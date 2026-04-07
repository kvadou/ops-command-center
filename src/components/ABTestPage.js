import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import {
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Radio,
  RadioGroup,
  FormControlLabel,
  Card,
  CardContent,
  Grid,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  ArrowLeftIcon,
  BeakerIcon,
  PlusIcon,
  ArrowTrendingUpIcon,
  ChartBarIcon,
  XCircleIcon,
  InformationCircleIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { DateTime } from 'luxon';

export default function ABTestPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState(0);
  const [openSetupDialog, setOpenSetupDialog] = useState(false);
  const [tests, setTests] = useState([]);
  const [bookingTypes, setBookingTypes] = useState([]);
  
  // Setup form state
  const [setupStep, setSetupStep] = useState(1);
  const [setupMethod, setSetupMethod] = useState('copy'); // 'copy' or 'select'
  const [selectedForm, setSelectedForm] = useState('');
  const [versionA, setVersionA] = useState(null);
  const [versionB, setVersionB] = useState(null);
  const [testName, setTestName] = useState('');
  const [testDescription, setTestDescription] = useState('');
  const [testDuration, setTestDuration] = useState(7); // days
  const [testMetric, setTestMetric] = useState('conversion_rate'); // primary metric

  useEffect(() => {
    fetchBookingTypes();
    fetchTests();
  }, []);

  const fetchBookingTypes = async () => {
    try {
      const response = await fetch('/api/booking-types');
      const data = await response.json();
      setBookingTypes(data);
    } catch (error) {
      console.error('Failed to fetch booking types:', error);
    }
  };

  const fetchTests = async () => {
    try {
      // TODO: Implement API endpoint for fetching A/B tests
      // const response = await fetch('/api/ab-tests');
      // const data = await response.json();
      // setTests(data);
      
      // Mock data for now
      setTests([
        {
          id: 1,
          name: 'Home Trial Form - CTA Language Test',
          description: 'Testing different call-to-action button text',
          status: 'running',
          versionA: { id: 23, name: 'Home - LA Trial' },
          versionB: { id: 24, name: 'Home - LA Trial (Copy)' },
          startDate: DateTime.now().minus({ days: 3 }).toISODate(),
          endDate: DateTime.now().plus({ days: 4 }).toISODate(),
          metrics: {
            versionA: { views: 245, submissions: 18, conversionRate: 7.35 },
            versionB: { views: 238, submissions: 22, conversionRate: 9.24 },
          },
          winner: 'versionB',
          confidence: 85,
        },
        {
          id: 2,
          name: 'School Registration - Form Layout Test',
          description: 'Testing single-page vs multi-step form layout',
          status: 'completed',
          versionA: { id: 108, name: 'ABC Preschool' },
          versionB: { id: 109, name: 'ABC Preschool (Multi-Step)' },
          startDate: DateTime.now().minus({ days: 14 }).toISODate(),
          endDate: DateTime.now().minus({ days: 7 }).toISODate(),
          metrics: {
            versionA: { views: 1234, submissions: 156, conversionRate: 12.64 },
            versionB: { views: 1187, submissions: 189, conversionRate: 15.92 },
          },
          winner: 'versionB',
          confidence: 92,
        },
      ]);
    } catch (error) {
      console.error('Failed to fetch A/B tests:', error);
    }
  };

  const handleStartSetup = () => {
    setOpenSetupDialog(true);
    setSetupStep(1);
    setSetupMethod('copy');
    setSelectedForm('');
    setVersionA(null);
    setVersionB(null);
    setTestName('');
    setTestDescription('');
  };

  const handleNextStep = () => {
    if (setupStep === 1) {
      // Validate form selection
      if (!selectedForm) {
        toast.error('Please select a form to test');
        return;
      }
      setSetupStep(2);
    } else if (setupStep === 2) {
      // Validate test configuration
      if (!testName || !testDescription) {
        toast.error('Please fill in all required fields');
        return;
      }
      setSetupStep(3);
    }
  };

  const handleCreateTest = async () => {
    try {
      // TODO: Implement API endpoint for creating A/B test
      // const response = await fetch('/api/ab-tests', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     name: testName,
      //     description: testDescription,
      //     versionA: versionA,
      //     versionB: versionB,
      //     duration: testDuration,
      //     primaryMetric: testMetric,
      //   }),
      // });
      
      // For now, just close and refresh
      setOpenSetupDialog(false);
      fetchTests();
      
      // Reset form
      setSetupStep(1);
      setSelectedForm('');
      setVersionA(null);
      setVersionB(null);
      setTestName('');
      setTestDescription('');
    } catch (error) {
      console.error('Failed to create A/B test:', error);
      toast.error('Failed to create A/B test');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'success';
      case 'completed': return 'default';
      case 'paused': return 'warning';
      case 'draft': return 'info';
      default: return 'default';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'running': return 'Running';
      case 'completed': return 'Completed';
      case 'paused': return 'Paused';
      case 'draft': return 'Draft';
      default: return status;
    }
  };


  return (
    <Box sx={{ p: 3 }}>
      {/* Action Bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate('/booking-forms/config')} sx={{ mr: 2 }}>
          <ArrowLeftIcon className="h-5 w-5" />
        </IconButton>
        <Button
          variant="contained"
          startIcon={<PlusIcon className="h-5 w-5" />}
          onClick={handleStartSetup}
          sx={{
            bgcolor: '#42b72a',
            '&:hover': { bgcolor: '#36a420' },
            textTransform: 'none',
            fontWeight: 500,
          }}
        >
          Create Test
        </Button>
      </Box>

      {/* Info Banner */}
      <Alert severity="info" icon={<InformationCircleIcon className="h-5 w-5" />} sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>Best Practices:</strong> Run tests for at least 2 weeks to ensure statistical significance. 
          Test one variable at a time (e.g., CTA text, form layout, pricing) for clear results. 
          Aim for 95% confidence or higher before declaring a winner.
        </Typography>
      </Alert>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="Active Tests" />
          <Tab label="Completed Tests" />
          <Tab label="Analytics Dashboard" />
          <Tab label="Best Practices" />
        </Tabs>
      </Box>

      {/* Active Tests Tab */}
      {activeTab === 0 && (
        <Box>
          {tests.filter(t => t.status === 'running' || t.status === 'paused').length === 0 ? (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 6 }}>
                <BeakerIcon className="h-16 w-16 text-gray-400 mb-2 mx-auto" />
                <Typography variant="h6" gutterBottom>
                  No active tests
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Create your first A/B test to start optimizing your booking forms
                </Typography>
                <Button variant="contained" startIcon={<PlusIcon className="h-5 w-5" />} onClick={handleStartSetup}>
                  Create Test
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Grid container spacing={3}>
              {tests
                .filter(t => t.status === 'running' || t.status === 'paused')
                .map((test) => (
                  <Grid item xs={12} md={6} key={test.id}>
                    <Card>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                          <Typography variant="h6">{test.name}</Typography>
                          <Chip
                            label={getStatusLabel(test.status)}
                            color={getStatusColor(test.status)}
                            size="small"
                          />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {test.description}
                        </Typography>
                        
                        <Divider sx={{ my: 2 }} />
                        
                        {/* Metrics */}
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="subtitle2" gutterBottom>
                            Current Results
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={6}>
                              <Box>
                                <Typography variant="caption" color="text.secondary">
                                  Version A
                                </Typography>
                                <Typography variant="h6">
                                  {test.metrics.versionA.conversionRate.toFixed(2)}%
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {test.metrics.versionA.submissions} submissions
                                </Typography>
                              </Box>
                            </Grid>
                            <Grid item xs={6}>
                              <Box>
                                <Typography variant="caption" color="text.secondary">
                                  Version B
                                </Typography>
                                <Typography variant="h6" color={test.winner === 'versionB' ? 'success.main' : 'inherit'}>
                                  {test.metrics.versionB.conversionRate.toFixed(2)}%
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {test.metrics.versionB.submissions} submissions
                                </Typography>
                              </Box>
                            </Grid>
                          </Grid>
                        </Box>

                        {/* Progress */}
                        <Box sx={{ mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="caption">
                              Test Progress
                            </Typography>
                            <Typography variant="caption">
                              {test.confidence}% confidence
                            </Typography>
                          </Box>
                          <LinearProgress 
                            variant="determinate" 
                            value={(test.confidence || 0)} 
                            sx={{ height: 8, borderRadius: 1 }}
                          />
                        </Box>

                        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                          <Button size="small" variant="outlined" startIcon={<ChartBarIcon className="h-5 w-5" />}>
                            View Details
                          </Button>
                          {test.status === 'running' && (
                            <Button size="small" variant="outlined" startIcon={<PauseIcon className="h-5 w-5" />}>
                              Pause
                            </Button>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Completed Tests Tab */}
      {activeTab === 1 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Test Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Version A</TableCell>
                <TableCell>Version B</TableCell>
                <TableCell>Winner</TableCell>
                <TableCell>Confidence</TableCell>
                <TableCell>Date Completed</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tests
                .filter(t => t.status === 'completed')
                .map((test) => (
                  <TableRow key={test.id}>
                    <TableCell>{test.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={getStatusLabel(test.status)}
                        color={getStatusColor(test.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{test.versionA.name}</TableCell>
                    <TableCell>{test.versionB.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={test.winner === 'versionA' ? 'Version A' : 'Version B'}
                        color={test.winner === 'versionB' ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{test.confidence}%</TableCell>
                    <TableCell>{DateTime.fromISO(test.endDate).toFormat('MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined">
                        View Report
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Analytics Dashboard Tab */}
      {activeTab === 2 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            A/B Test Analytics Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Comprehensive analytics and insights from all your A/B tests
          </Typography>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Analytics dashboard coming soon...
              </Typography>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Best Practices Tab */}
      {activeTab === 3 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            A/B Testing Best Practices
          </Typography>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    1. Test One Variable at a Time
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Isolate your tests to measure the impact of specific changes. 
                    Testing multiple variables simultaneously makes it impossible to determine 
                    which change caused the improvement.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    2. Run Tests for Statistical Significance
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Aim for at least 95% confidence before declaring a winner. 
                    Run tests for a minimum of 2 weeks to account for daily and weekly variations 
                    in traffic and user behavior.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    3. Test High-Impact Elements
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Focus on elements that have the greatest potential impact: 
                    call-to-action buttons, form layouts, pricing, headlines, and trust signals. 
                    Small changes can lead to significant improvements.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    4. Segment Your Audience
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Consider testing different variations for different audience segments. 
                    What works for one group may not work for another. 
                    Analyze results by traffic source, device type, and user demographics.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    5. Document and Learn
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Keep detailed records of your tests, including hypotheses, results, and insights. 
                    Use these learnings to inform future tests and continuously improve your forms.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    6. Test Continuously
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    A/B testing is an ongoing process. Even after finding a winner, 
                    continue testing to find further improvements. The market and user behavior 
                    evolve over time, so what works today may not work tomorrow.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Setup Dialog */}
      <Dialog
        open={openSetupDialog}
        onClose={() => setOpenSetupDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {setupStep === 1 && 'How do you want to set up your test?'}
          {setupStep === 2 && 'Select Test Settings'}
          {setupStep === 3 && 'Review & Create Test'}
        </DialogTitle>
        <DialogContent dividers>
          {setupStep === 1 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                You can select a form to test it against its duplicate version or pick two existing forms and compare them.
              </Typography>
              
              <FormControl component="fieldset" sx={{ mb: 3 }}>
                <RadioGroup
                  value={setupMethod}
                  onChange={(e) => setSetupMethod(e.target.value)}
                >
                  <FormControlLabel
                    value="copy"
                    control={<Radio />}
                    label="Make a copy of a form"
                  />
                  <FormControlLabel
                    value="select"
                    control={<Radio />}
                    label="Select two existing forms"
                  />
                </RadioGroup>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Which form do you want to use?</InputLabel>
                <Select
                  value={selectedForm}
                  onChange={(e) => {
                    setSelectedForm(e.target.value);
                    const form = bookingTypes.find(bt => bt.id === e.target.value);
                    setVersionA(form);
                    if (setupMethod === 'copy') {
                      // For copy method, version B would be a duplicate
                      setVersionB({ ...form, id: null, name: `${form.name} (Copy)` });
                    }
                  }}
                  label="Which form do you want to use?"
                >
                  {bookingTypes.map((bt) => (
                    <MenuItem key={bt.id} value={bt.id}>
                      {bt.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {setupMethod === 'select' && selectedForm && (
                <FormControl fullWidth>
                  <InputLabel>Select second form (Version B)</InputLabel>
                  <Select
                    value={versionB?.id || ''}
                    onChange={(e) => {
                      const form = bookingTypes.find(bt => bt.id === e.target.value);
                      setVersionB(form);
                    }}
                    label="Select second form (Version B)"
                  >
                    {bookingTypes
                      .filter(bt => bt.id !== parseInt(selectedForm))
                      .map((bt) => (
                        <MenuItem key={bt.id} value={bt.id}>
                          {bt.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              )}
            </Box>
          )}

          {setupStep === 2 && (
            <Box>
              <TextField
                fullWidth
                label="Test Name"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Description"
                value={testDescription}
                onChange={(e) => setTestDescription(e.target.value)}
                margin="normal"
                multiline
                rows={3}
                required
              />
              <FormControl fullWidth margin="normal">
                <InputLabel>Test Duration (days)</InputLabel>
                <Select
                  value={testDuration}
                  onChange={(e) => setTestDuration(e.target.value)}
                  label="Test Duration (days)"
                >
                  <MenuItem value={7}>7 days</MenuItem>
                  <MenuItem value={14}>14 days</MenuItem>
                  <MenuItem value={21}>21 days</MenuItem>
                  <MenuItem value={30}>30 days</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth margin="normal">
                <InputLabel>Primary Metric</InputLabel>
                <Select
                  value={testMetric}
                  onChange={(e) => setTestMetric(e.target.value)}
                  label="Primary Metric"
                >
                  <MenuItem value="conversion_rate">Conversion Rate</MenuItem>
                  <MenuItem value="submissions">Total Submissions</MenuItem>
                  <MenuItem value="revenue">Revenue</MenuItem>
                  <MenuItem value="completion_rate">Form Completion Rate</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}

          {setupStep === 3 && (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Test Configuration
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Name:</strong> {testName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Description:</strong> {testDescription}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Duration:</strong> {testDuration} days
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Primary Metric:</strong> {testMetric.replace('_', ' ')}
                </Typography>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom>
                Test Versions
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>Version A:</strong> {versionA?.name}
                </Typography>
                <Typography variant="body2">
                  <strong>Version B:</strong> {versionB?.name}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenSetupDialog(false)}>Cancel</Button>
          {setupStep > 1 && (
            <Button onClick={() => setSetupStep(setupStep - 1)}>Previous</Button>
          )}
          {setupStep < 3 ? (
            <Button variant="contained" onClick={handleNextStep}>
              Next
            </Button>
          ) : (
            <Button variant="contained" onClick={handleCreateTest}>
              Create Test
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

