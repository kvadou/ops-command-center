import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  Divider,
  Button,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../hooks/useToast';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  CheckIcon,
  XMarkIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import {
  StarIcon as StarSolidIcon,
  CheckCircleIcon as CheckCircleSolidIcon,
} from '@heroicons/react/24/solid';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

const brandColors = {
  purple: '#6A469D',
  navy: '#2D2F8E',
  green: '#34B256',
  orange: '#F79A30',
  pink: '#DA2E72',
  cyan: '#50C8DF',
  yellow: '#FACC29',
  light: '#E8FBFF',
};

// Margin color coding based on ranges
const getMarginColor = (margin) => {
  if (margin < 0) return { bg: '#d32f2f', color: 'white' }; // Dark red
  if (margin >= 0 && margin < 10) return { bg: '#f44336', color: 'white' }; // Red
  if (margin >= 10 && margin < 20) return { bg: '#ffcdd2', color: '#000' }; // Light red
  if (margin >= 20 && margin < 30) return { bg: '#ffebee', color: '#000' }; // Very light red/pink
  if (margin >= 30 && margin < 40) return { bg: '#fce4ec', color: '#000' }; // Pale pink
  if (margin >= 40 && margin < 50) return { bg: '#f3e5f5', color: '#000' }; // Very pale pink/off-white
  if (margin >= 50 && margin < 60) return { bg: '#fff9c4', color: '#000' }; // Light yellow
  if (margin >= 60 && margin < 70) return { bg: '#b2ebf2', color: '#000' }; // Light blue-green
  if (margin >= 70) return { bg: '#c8e6c9', color: '#000' }; // Light green
};

// Default models that ship with the component
const defaultModels = {
  standard: {
    name: 'Standard Model ($25/kid, $50/$100/$150 tutors)',
    pricePerKid: 25,
    tutorCost1: 50,
    tutorCost2: 100,
    tutorCost3: 150,
    threshold1: 10,
    threshold2: 20,
    targetMargin: 50,
  },
  premium: {
    name: 'Premium Model ($30/kid, $50/$100/$150 tutors)',
    pricePerKid: 30,
    tutorCost1: 50,
    tutorCost2: 100,
    tutorCost3: 150,
    threshold1: 10,
    threshold2: 20,
    targetMargin: 60,
  },
  budget: {
    name: 'Budget Model ($20/kid, $50/$100/$150 tutors)',
    pricePerKid: 20,
    tutorCost1: 50,
    tutorCost2: 100,
    tutorCost3: 150,
    threshold1: 10,
    threshold2: 20,
    targetMargin: 40,
  },
  early: {
    name: 'Early Threshold Model ($25/kid, $50/$80/$120 tutors, 8 kids threshold)',
    pricePerKid: 25,
    tutorCost1: 50,
    tutorCost2: 80,
    tutorCost3: 120,
    threshold1: 8,
    threshold2: 20,
    targetMargin: 50,
  },
};

// Local storage key for persisting custom models
const MODELS_STORAGE_KEY = 'schoolPricingModels';

export default function SchoolPricingModels() {
  const toast = useToast();
  const navigate = useNavigate();
  const [targetMargin, setTargetMargin] = useState(50); // Target margin percentage
  
  // Default pricing model inputs
  const [pricePerKid, setPricePerKid] = useState(25);
  const [tutorCost1, setTutorCost1] = useState(50); // Cost for first tutor (6-9 kids)
  const [tutorCost2, setTutorCost2] = useState(100); // Cost for second tutor (10-19 kids)
  const [tutorCost3, setTutorCost3] = useState(150); // Cost for third tutor (20+ kids)
  const [threshold1, setThreshold1] = useState(10); // When to add second tutor
  const [threshold2, setThreshold2] = useState(20); // When to add third tutor
  const [minKids, setMinKids] = useState(6);
  const [maxKids, setMaxKids] = useState(30);
  const [selectedModel, setSelectedModel] = useState('standard'); // standard, custom

  // Model configuration state
  const [predefinedModels, setPredefinedModels] = useState(defaultModels);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [editingModel, setEditingModel] = useState(null); // null = adding new, string = editing key
  const [modelForm, setModelForm] = useState({
    key: '',
    name: '',
    pricePerKid: 25,
    tutorCost1: 50,
    tutorCost2: 100,
    tutorCost3: 150,
    threshold1: 10,
    threshold2: 20,
    targetMargin: 50,
  });

  // Load saved models from localStorage on mount
  useEffect(() => {
    const savedModels = localStorage.getItem(MODELS_STORAGE_KEY);
    if (savedModels) {
      try {
        const parsed = JSON.parse(savedModels);
        setPredefinedModels(parsed);
      } catch (e) {
        console.error('Failed to parse saved models:', e);
      }
    }
  }, []);

  // Save models to localStorage when they change
  const saveModels = (models) => {
    localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(models));
    setPredefinedModels(models);
  };

  // Open config dialog
  const handleOpenConfig = () => {
    setConfigDialogOpen(true);
    setEditingModel(null);
    setModelForm({
      key: '',
      name: '',
      pricePerKid: 25,
      tutorCost1: 50,
      tutorCost2: 100,
      tutorCost3: 150,
      threshold1: 10,
      threshold2: 20,
      targetMargin: 50,
    });
  };

  // Close config dialog
  const handleCloseConfig = () => {
    setConfigDialogOpen(false);
    setEditingModel(null);
  };

  // Start editing a model
  const handleEditModel = (key) => {
    const model = predefinedModels[key];
    setEditingModel(key);
    setModelForm({
      key,
      name: model.name,
      pricePerKid: model.pricePerKid,
      tutorCost1: model.tutorCost1,
      tutorCost2: model.tutorCost2,
      tutorCost3: model.tutorCost3,
      threshold1: model.threshold1,
      threshold2: model.threshold2,
      targetMargin: model.targetMargin || 50,
    });
  };

  // Start adding a new model
  const handleAddModel = () => {
    setEditingModel('new');
    setModelForm({
      key: '',
      name: '',
      pricePerKid: 25,
      tutorCost1: 50,
      tutorCost2: 100,
      tutorCost3: 150,
      threshold1: 10,
      threshold2: 20,
      targetMargin: 50,
    });
  };

  // Save the model being edited/added
  const handleSaveModel = () => {
    if (!modelForm.name.trim()) {
      toast.error('Please enter a model name');
      return;
    }

    const newModels = { ...predefinedModels };

    if (editingModel === 'new') {
      // Generate a key from the name
      const key = modelForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      newModels[key] = {
        name: modelForm.name,
        pricePerKid: modelForm.pricePerKid,
        tutorCost1: modelForm.tutorCost1,
        tutorCost2: modelForm.tutorCost2,
        tutorCost3: modelForm.tutorCost3,
        threshold1: modelForm.threshold1,
        threshold2: modelForm.threshold2,
        targetMargin: modelForm.targetMargin,
      };
    } else {
      // Update existing model
      newModels[editingModel] = {
        name: modelForm.name,
        pricePerKid: modelForm.pricePerKid,
        tutorCost1: modelForm.tutorCost1,
        tutorCost2: modelForm.tutorCost2,
        tutorCost3: modelForm.tutorCost3,
        threshold1: modelForm.threshold1,
        threshold2: modelForm.threshold2,
        targetMargin: modelForm.targetMargin,
      };
    }

    saveModels(newModels);
    setEditingModel(null);
  };

  // Delete a model
  const handleDeleteModel = (key) => {
    setConfirmState({
      isOpen: true,
      action: () => {
        const newModels = { ...predefinedModels };
        delete newModels[key];
        saveModels(newModels);
        if (selectedModel === key) {
          const firstKey = Object.keys(newModels)[0];
          if (firstKey) {
            handleModelSelect(firstKey);
          }
        }
      },
      title: 'Delete Model',
      message: `Are you sure you want to delete "${predefinedModels[key].name}"?`,
    });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingModel(null);
  };

  // Reset to default models
  const handleResetToDefaults = () => {
    setConfirmState({
      isOpen: true,
      action: () => {
        saveModels(defaultModels);
        setSelectedModel('standard');
        handleModelSelect('standard');
      },
      title: 'Reset Models',
      message: 'Reset all models to defaults? This will remove any custom models.',
    });
  };

  // Helper: Calculate tutor count based on number of kids
  const calculateTutorCount = (kids) => {
    if (kids < threshold1) return 1;
    if (kids < threshold2) return 2;
    return 3;
  };

  // Helper: Calculate tutor cost based on number of kids
  const getTutorCost = (kids) => {
    if (kids < threshold1) {
      return tutorCost1;
    } else if (kids < threshold2) {
      return tutorCost2;
    } else {
      return tutorCost3;
    }
  };

  // Helper: Calculate recommended price to achieve target margin
  const calculateRecommendedPrice = (targetMarginPercent = 70) => {
    // Find the scenario with the most kids (highest tutor cost)
    // Calculate price needed to achieve target margin
    const avgTutorCost = (tutorCost1 + tutorCost2 + tutorCost3) / 3;
    const avgKids = (minKids + maxKids) / 2;
    
    // Formula: margin = (revenue - cost) / revenue
    // targetMargin = (price * kids - tutorCost) / (price * kids)
    // Solving for price: price = tutorCost / (kids * (1 - targetMargin/100))
    
    // Use worst case scenario (highest tutor cost)
    const worstCaseCost = tutorCost3;
    const worstCaseKids = threshold2; // When 3rd tutor is needed
    
    const recommendedPrice = worstCaseCost / (worstCaseKids * (1 - targetMarginPercent / 100));
    return Math.ceil(recommendedPrice);
  };

  // Calculate pricing data for all kid counts
  const pricingData = useMemo(() => {
    const data = [];
    for (let kids = minKids; kids <= maxKids; kids++) {
      const revenue = kids * pricePerKid;
      const tutorCost = getTutorCost(kids);
      const tutorCount = calculateTutorCount(kids);
      const netProfit = revenue - tutorCost;
      const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
      
      data.push({
        kids,
        revenue,
        tutorCost,
        tutorCount,
        netProfit,
        margin,
      });
    }
    return data;
  }, [pricePerKid, tutorCost1, tutorCost2, tutorCost3, threshold1, threshold2, minKids, maxKids]);

  // Summary statistics
  const summary = useMemo(() => {
    // Handle empty pricingData array
    if (pricingData.length === 0) {
      return {
        avgMargin: 0,
        minMargin: 0,
        maxMargin: 0,
        avgProfit: 0,
        minProfit: 0,
        maxProfit: 0,
        breakEvenKids: null,
        profitableKids: 0,
        optimalScenario: null,
        recommendedPrice: calculateRecommendedPrice(targetMargin),
      };
    }
    
    const margins = pricingData.map(d => d.margin);
    const profits = pricingData.map(d => d.netProfit);
    const breakEvenKids = pricingData.find(d => d.netProfit >= 0)?.kids || null;
    const optimalScenario = pricingData.reduce((best, current) => 
      current.margin > best.margin ? current : best
    );
    
    return {
      avgMargin: margins.reduce((a, b) => a + b, 0) / margins.length,
      minMargin: Math.min(...margins),
      maxMargin: Math.max(...margins),
      avgProfit: profits.reduce((a, b) => a + b, 0) / profits.length,
      minProfit: Math.min(...profits),
      maxProfit: Math.max(...profits),
      breakEvenKids,
      profitableKids: pricingData.filter(d => d.netProfit > 0).length,
      optimalScenario,
      recommendedPrice: calculateRecommendedPrice(targetMargin),
    };
  }, [pricingData, targetMargin]);


  // Generate insights
  const generateInsights = () => {
    const insights = [];
    
    // Break-even insight
    if (summary.breakEvenKids) {
      insights.push({
        type: 'info',
        icon: <CheckCircleSolidIcon className="h-5 w-5" />,
        text: `You hit break-even at ${summary.breakEvenKids} kids—aim for at least this enrollment.`,
      });
    }
    
    // Margin dip at thresholds
    const threshold1Data = pricingData.find(d => d.kids === threshold1);
    const threshold2Data = pricingData.find(d => d.kids === threshold2);
    
    if (threshold1Data) {
      const beforeThreshold = pricingData.find(d => d.kids === threshold1 - 1);
      if (beforeThreshold && threshold1Data.margin < beforeThreshold.margin) {
        const marginDrop = beforeThreshold.margin - threshold1Data.margin;
        insights.push({
          type: 'warning',
          icon: <ExclamationTriangleIcon className="h-5 w-5" />,
          text: `Margin dips ${marginDrop.toFixed(1)}% at ${threshold1} kids because a second tutor is required (cost jumps +${formatCurrency(tutorCost2 - tutorCost1)}).`,
        });
      }
    }
    
    if (threshold2Data) {
      const beforeThreshold = pricingData.find(d => d.kids === threshold2 - 1);
      if (beforeThreshold && threshold2Data.margin < beforeThreshold.margin) {
        const marginDrop = beforeThreshold.margin - threshold2Data.margin;
        insights.push({
          type: 'warning',
          icon: <ExclamationTriangleIcon className="h-5 w-5" />,
          text: `Margin dips ${marginDrop.toFixed(1)}% at ${threshold2} kids because a third tutor is required (cost jumps +${formatCurrency(tutorCost3 - tutorCost2)}).`,
        });
      }
    }
    
    // Optimal margin insight
    if (summary.optimalScenario) {
      insights.push({
        type: 'success',
        icon: <TrophyIcon className="h-5 w-5" />,
        text: `Your best margin is at ${summary.optimalScenario.kids} kids with a ${summary.optimalScenario.margin.toFixed(2)}% margin.`,
      });
    }
    
    // Price recommendation
    if (summary.recommendedPrice > pricePerKid) {
      const priceIncrease = summary.recommendedPrice - pricePerKid;
      insights.push({
        type: 'info',
        icon: <LightBulbIcon className="h-5 w-5" />,
        text: `Consider raising price by ${formatCurrency(priceIncrease)} to maintain margins above ${targetMargin}% after adding a third tutor.`,
      });
    }
    
    return insights;
  };

  const insights = useMemo(() => generateInsights(), [summary, pricingData, threshold1, threshold2, tutorCost1, tutorCost2, tutorCost3, targetMargin, pricePerKid]);

  const handleModelSelect = (modelKey) => {
    const model = predefinedModels[modelKey];
    if (model) {
      setPricePerKid(model.pricePerKid);
      setTutorCost1(model.tutorCost1);
      setTutorCost2(model.tutorCost2);
      setTutorCost3(model.tutorCost3);
      setThreshold1(model.threshold1);
      setThreshold2(model.threshold2);
      // Update target margin if the model has one defined
      if (model.targetMargin !== undefined) {
        setTargetMargin(model.targetMargin);
      }
      setSelectedModel(modelKey);
    }
  };

  // Chart data for profit line graph
  const chartData = pricingData.map(d => ({
    kids: d.kids,
    profit: d.netProfit,
    margin: d.margin,
    tutorCount: d.tutorCount,
    isThreshold: d.kids === threshold1 || d.kids === threshold2,
  }));

  return (
    <Box>
      {/* Input Controls */}
      <Card sx={{ mb: 3, boxShadow: 2 }}>
        <CardContent>
          <Grid container spacing={3}>
            {/* Predefined Models */}
            <Grid item xs={12}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="h6">
                  Quick Select Models
                </Typography>
                <Tooltip title="Configure pricing models">
                  <IconButton 
                    onClick={handleOpenConfig}
                    size="small"
                    sx={{ 
                      bgcolor: 'grey.100',
                      '&:hover': { bgcolor: brandColors.purple, color: 'white' }
                    }}
                  >
                    <Cog6ToothIcon className="h-4 w-4" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box display="flex" gap={1} flexWrap="wrap" mb={3}>
                {Object.entries(predefinedModels).map(([key, model]) => (
                  <Chip
                    key={key}
                    label={model.name}
                    onClick={() => handleModelSelect(key)}
                    color={selectedModel === key ? 'primary' : 'default'}
                    sx={{
                      cursor: 'pointer',
                      ...(selectedModel === key && {
                        bgcolor: brandColors.purple,
                        color: 'white',
                      }),
                    }}
                  />
                ))}
              </Box>
              <Divider sx={{ my: 2 }} />
            </Grid>

            {/* Price Per Kid */}
            <Grid item xs={12} md={6}>
              <Tooltip title="Price charged per student enrolled in the class">
                <Typography variant="subtitle2" gutterBottom>
                  Price Per Kid
                </Typography>
              </Tooltip>
              <TextField
                fullWidth
                type="number"
                value={pricePerKid}
                onChange={(e) => setPricePerKid(parseFloat(e.target.value) || 0)}
                InputProps={{
                  startAdornment: <CurrencyDollarIcon className="h-5 w-5 mr-1 text-neutral-500" />,
                }}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>

            {/* Target Margin */}
            <Grid item xs={12} md={6}>
              <Tooltip title="Target profit margin percentage for calculating recommended price">
                <Typography variant="subtitle2" gutterBottom>
                  Target Margin ({targetMargin}%)
                </Typography>
              </Tooltip>
              <Slider
                value={targetMargin}
                onChange={(e, newValue) => setTargetMargin(newValue)}
                min={50}
                max={85}
                step={1}
                marks={[
                  { value: 50, label: '50%' },
                  { value: 60, label: '60%' },
                  { value: 70, label: '70%' },
                  { value: 80, label: '80%' },
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value}%`}
              />
            </Grid>

            {/* Tutor Costs */}
            <Grid item xs={12} md={6}>
              <Tooltip title="Cost structure for tutors based on class size">
                <Typography variant="subtitle2" gutterBottom>
                  Tutor Cost Structure
                </Typography>
              </Tooltip>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Tooltip title={`Cost for 1 tutor when class has less than ${threshold1} kids`}>
                    <TextField
                      fullWidth
                      label={`< ${threshold1} kids`}
                      type="number"
                      value={tutorCost1}
                      onChange={(e) => setTutorCost1(parseFloat(e.target.value) || 0)}
                      size="small"
                      InputProps={{
                        startAdornment: <CurrencyDollarIcon className="h-4 w-4 mr-0.5" />,
                      }}
                    />
                  </Tooltip>
                </Grid>
                <Grid item xs={4}>
                  <Tooltip title={`Cost for 2 tutors when class has ${threshold1}-${threshold2 - 1} kids`}>
                    <TextField
                      fullWidth
                      label={`${threshold1}-${threshold2 - 1} kids`}
                      type="number"
                      value={tutorCost2}
                      onChange={(e) => setTutorCost2(parseFloat(e.target.value) || 0)}
                      size="small"
                      InputProps={{
                        startAdornment: <CurrencyDollarIcon className="h-4 w-4 mr-0.5" />,
                      }}
                    />
                  </Tooltip>
                </Grid>
                <Grid item xs={4}>
                  <Tooltip title={`Cost for 3 tutors when class has ${threshold2} or more kids`}>
                    <TextField
                      fullWidth
                      label={`≥ ${threshold2} kids`}
                      type="number"
                      value={tutorCost3}
                      onChange={(e) => setTutorCost3(parseFloat(e.target.value) || 0)}
                      size="small"
                      InputProps={{
                        startAdornment: <CurrencyDollarIcon className="h-4 w-4 mr-0.5" />,
                      }}
                    />
                  </Tooltip>
                </Grid>
              </Grid>
            </Grid>

            {/* Thresholds */}
            <Grid item xs={12} md={3}>
              <Tooltip title="Number of kids at which a second tutor is required">
                <Typography variant="subtitle2" gutterBottom>
                  Second Tutor Threshold
                </Typography>
              </Tooltip>
              <Slider
                value={threshold1}
                onChange={(e, newValue) => setThreshold1(newValue)}
                min={6}
                max={15}
                step={1}
                marks
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value} kids`}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <Tooltip title="Number of kids at which a third tutor is required">
                <Typography variant="subtitle2" gutterBottom>
                  Third Tutor Threshold
                </Typography>
              </Tooltip>
              <Slider
                value={threshold2}
                onChange={(e, newValue) => setThreshold2(newValue)}
                min={15}
                max={25}
                step={1}
                marks
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value} kids`}
              />
            </Grid>

            {/* Range */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Kids Range
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Min Kids"
                    type="number"
                    value={minKids}
                    onChange={(e) => setMinKids(parseInt(e.target.value) || 6)}
                    inputProps={{ min: 1 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Max Kids"
                    type="number"
                    value={maxKids}
                    onChange={(e) => setMaxKids(parseInt(e.target.value) || 22)}
                    inputProps={{ min: minKids }}
                  />
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: brandColors.purple, color: 'white', boxShadow: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <CurrencyDollarIcon className="h-5 w-5" />
                <Typography variant="body2" fontWeight="medium">
                  Recommended Price per Kid
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">
                {formatCurrency(summary.recommendedPrice)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.9, mt: 0.5, display: 'block' }}>
                For {targetMargin}% target margin
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: brandColors.cyan, color: 'white', boxShadow: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <CheckCircleSolidIcon className="h-5 w-5" />
                <Typography variant="body2" fontWeight="medium">
                  Break-Even Enrollment
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">
                {summary.breakEvenKids ? `${summary.breakEvenKids} kids` : 'N/A'}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.9, mt: 0.5, display: 'block' }}>
                Profitability starts here
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: brandColors.orange, color: 'white', boxShadow: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <UserGroupIcon className="h-5 w-5" />
                <Typography variant="body2" fontWeight="medium">
                  Tutor Requirements
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">
                1-2-3 Tutors
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.9, mt: 0.5, display: 'block' }}>
                {`1-${threshold1 - 1} → 1 tutor | ${threshold1}-${threshold2 - 1} → 2 tutors | ${threshold2}+ → 3 tutors`}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: brandColors.green, color: 'white', boxShadow: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <StarSolidIcon className="h-5 w-5" />
                <Typography variant="body2" fontWeight="medium">
                  Optimal Profit Scenario
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">
                {summary.optimalScenario ? `${summary.optimalScenario.kids} kids` : 'N/A'}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.9, mt: 0.5, display: 'block' }}>
                {summary.optimalScenario ? `${summary.optimalScenario.margin.toFixed(1)}% margin` : 'N/A'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Pricing Table */}
      <Card sx={{ boxShadow: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Detailed Pricing Analysis
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell><strong>Kids</strong></TableCell>
                  <TableCell align="center"><strong>Tutors</strong></TableCell>
                  <TableCell align="right"><strong>Revenue</strong></TableCell>
                  <TableCell align="right"><strong>Tutor Cost</strong></TableCell>
                  <TableCell align="right"><strong>Net Profit</strong></TableCell>
                  <TableCell align="right"><strong>Margin (%)</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pricingData.map((row, idx) => {
                  const marginColor = getMarginColor(row.margin);
                  const isThreshold = row.kids === threshold1 || row.kids === threshold2;
                  const isBreakEven = row.kids === summary.breakEvenKids;
                  const isOptimal = row.kids === summary.optimalScenario?.kids;
                  const isLowMargin = row.margin < 50;
                  
                  return (
                    <TableRow
                      key={idx}
                      sx={{
                        bgcolor: marginColor.bg,
                        color: marginColor.color,
                        '&:hover': {
                          bgcolor: `${marginColor.bg}dd`,
                        },
                        ...(isThreshold && {
                          borderLeft: `4px solid ${brandColors.orange}`,
                        }),
                      }}
                    >
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <UserGroupIcon className="h-4 w-4" />
                          <strong>{row.kids}</strong>
                          {isBreakEven && (
                            <Tooltip title="Break-even point">
                              <CheckCircleSolidIcon className="h-4 w-4" style={{ color: brandColors.cyan }} />
                            </Tooltip>
                          )}
                          {isOptimal && (
                            <Tooltip title="Optimal profit scenario">
                              <StarSolidIcon className="h-4 w-4" style={{ color: brandColors.yellow }} />
                            </Tooltip>
                          )}
                          {isLowMargin && !isBreakEven && !isOptimal && (
                            <Tooltip title="Low margin">
                              <ExclamationTriangleIcon className="h-4 w-4" style={{ color: brandColors.orange }} />
                            </Tooltip>
                          )}
                          {isThreshold && (
                            <Chip
                              label={row.kids === threshold1 ? '2nd Tutor' : '3rd Tutor'}
                              size="small"
                              sx={{
                                bgcolor: brandColors.orange,
                                color: 'white',
                                fontSize: '0.7rem',
                                height: 20,
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={row.tutorCount}
                          size="small"
                          sx={{
                            bgcolor: row.tutorCount === 1 ? brandColors.cyan : 
                                     row.tutorCount === 2 ? brandColors.orange : 
                                     brandColors.pink,
                            color: 'white',
                            fontWeight: 'bold',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <strong>{formatCurrency(row.revenue)}</strong>
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(row.tutorCost)}
                      </TableCell>
                      <TableCell align="right">
                        <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                          {row.netProfit >= 0 ? (
                            <ArrowTrendingUpIcon className="h-4 w-4" />
                          ) : (
                            <ArrowTrendingDownIcon className="h-4 w-4" />
                          )}
                          <strong>{formatCurrency(row.netProfit)}</strong>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${row.margin.toFixed(2)}%`}
                          size="small"
                          sx={{
                            bgcolor: marginColor.bg,
                            color: marginColor.color,
                            fontWeight: 'bold',
                            minWidth: 70,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Legend */}
          <Box mt={2} p={2} sx={{ bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight="bold">
              Legend
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" gutterBottom fontWeight="medium">
                  Margin Color Bands:
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                  <Chip label="< 0%" size="small" sx={{ bgcolor: '#d32f2f', color: 'white' }} />
                  <Chip label="0-9%" size="small" sx={{ bgcolor: '#f44336', color: 'white' }} />
                  <Chip label="10-19%" size="small" sx={{ bgcolor: '#ffcdd2', color: '#000' }} />
                  <Chip label="20-29%" size="small" sx={{ bgcolor: '#ffebee', color: '#000' }} />
                  <Chip label="30-39%" size="small" sx={{ bgcolor: '#fce4ec', color: '#000' }} />
                  <Chip label="40-49%" size="small" sx={{ bgcolor: '#f3e5f5', color: '#000' }} />
                  <Chip label="50-59%" size="small" sx={{ bgcolor: '#fff9c4', color: '#000' }} />
                  <Chip label="60-69%" size="small" sx={{ bgcolor: '#b2ebf2', color: '#000' }} />
                  <Chip label="≥ 70%" size="small" sx={{ bgcolor: '#c8e6c9', color: '#000' }} />
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" gutterBottom fontWeight="medium">
                  Icons:
                </Typography>
                <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <CheckCircleSolidIcon className="h-4 w-4" style={{ color: brandColors.cyan }} />
                    <Typography variant="caption">Break-even</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <StarSolidIcon className="h-4 w-4" style={{ color: brandColors.yellow }} />
                    <Typography variant="caption">Optimal</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <ExclamationTriangleIcon className="h-4 w-4" style={{ color: brandColors.orange }} />
                    <Typography variant="caption">Low margin</Typography>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      {/* Profit Line Chart */}
      <Card sx={{ mb: 3, boxShadow: 2, mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Profit Analysis by Class Size
          </Typography>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Visualize how profit changes as enrollment increases. Vertical lines indicate tutor threshold points.
          </Typography>
          <Box height={350} mt={2}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="kids" 
                  label={{ value: 'Number of Kids', position: 'insideBottom', offset: -5 }}
                />
                <YAxis 
                  label={{ value: 'Net Profit ($)', angle: -90, position: 'insideLeft' }}
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <RechartsTooltip 
                  formatter={(value) => formatCurrency(value)}
                  labelFormatter={(value) => `${value} kids`}
                />
                <Legend />
                <ReferenceLine 
                  x={threshold1} 
                  stroke={brandColors.orange} 
                  strokeDasharray="5 5"
                  label={{ value: `2nd Tutor (${threshold1} kids)`, position: 'top' }}
                />
                <ReferenceLine 
                  x={threshold2} 
                  stroke={brandColors.orange} 
                  strokeDasharray="5 5"
                  label={{ value: `3rd Tutor (${threshold2} kids)`, position: 'top' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="profit" 
                  stroke={brandColors.green} 
                  strokeWidth={3}
                  dot={{ fill: brandColors.green, r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Net Profit"
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      {/* Key Insights & Recommendations - At Bottom */}
      {insights.length > 0 && (
        <Card sx={{ mt: 3, boxShadow: 2, bgcolor: 'background.paper' }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <LightBulbIcon className="h-7 w-7" style={{ color: brandColors.yellow }} />
              <Typography variant="h6" fontWeight="bold">
                Key Insights & Recommendations
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {insights.map((insight, idx) => (
                <Grid item xs={12} md={6} key={idx}>
                  <Alert 
                    severity={insight.type === 'success' ? 'success' : insight.type === 'warning' ? 'warning' : 'info'}
                    icon={insight.icon}
                    sx={{ 
                      '& .MuiAlert-icon': { 
                        color: insight.type === 'success' ? brandColors.green : 
                               insight.type === 'warning' ? brandColors.orange : 
                               brandColors.cyan 
                      }
                    }}
                  >
                    <Typography variant="body2">
                      {insight.text}
                    </Typography>
                  </Alert>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Model Configuration Dialog */}
      <Dialog 
        open={configDialogOpen} 
        onClose={handleCloseConfig}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <Cog6ToothIcon className="h-5 w-5" style={{ color: brandColors.purple }} />
              <Typography variant="h6">Configure Pricing Models</Typography>
            </Box>
            <IconButton onClick={handleCloseConfig} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {editingModel ? (
            // Edit/Add Form
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                {editingModel === 'new' ? 'Add New Model' : `Edit: ${predefinedModels[editingModel]?.name}`}
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Model Name"
                    value={modelForm.name}
                    onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                    placeholder="e.g., Premium School Model ($28/kid)"
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Price Per Kid ($)"
                    type="number"
                    value={modelForm.pricePerKid}
                    onChange={(e) => setModelForm({ ...modelForm, pricePerKid: parseFloat(e.target.value) || 0 })}
                    size="small"
                    InputProps={{ startAdornment: <CurrencyDollarIcon className="h-4 w-4 mr-0.5 text-neutral-500" /> }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="1 Tutor Cost ($)"
                    type="number"
                    value={modelForm.tutorCost1}
                    onChange={(e) => setModelForm({ ...modelForm, tutorCost1: parseFloat(e.target.value) || 0 })}
                    size="small"
                    helperText={`For < ${modelForm.threshold1} kids`}
                    InputProps={{ startAdornment: <CurrencyDollarIcon className="h-4 w-4 mr-0.5 text-neutral-500" /> }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="2 Tutors Cost ($)"
                    type="number"
                    value={modelForm.tutorCost2}
                    onChange={(e) => setModelForm({ ...modelForm, tutorCost2: parseFloat(e.target.value) || 0 })}
                    size="small"
                    helperText={`For ${modelForm.threshold1}-${modelForm.threshold2 - 1} kids`}
                    InputProps={{ startAdornment: <CurrencyDollarIcon className="h-4 w-4 mr-0.5 text-neutral-500" /> }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="3 Tutors Cost ($)"
                    type="number"
                    value={modelForm.tutorCost3}
                    onChange={(e) => setModelForm({ ...modelForm, tutorCost3: parseFloat(e.target.value) || 0 })}
                    size="small"
                    helperText={`For ≥ ${modelForm.threshold2} kids`}
                    InputProps={{ startAdornment: <CurrencyDollarIcon className="h-4 w-4 mr-0.5 text-neutral-500" /> }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="2nd Tutor Threshold (kids)"
                    type="number"
                    value={modelForm.threshold1}
                    onChange={(e) => setModelForm({ ...modelForm, threshold1: parseInt(e.target.value) || 10 })}
                    size="small"
                    helperText="Add 2nd tutor at this many kids"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="3rd Tutor Threshold (kids)"
                    type="number"
                    value={modelForm.threshold2}
                    onChange={(e) => setModelForm({ ...modelForm, threshold2: parseInt(e.target.value) || 20 })}
                    size="small"
                    helperText="Add 3rd tutor at this many kids"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Target Margin (%)"
                    type="number"
                    value={modelForm.targetMargin}
                    onChange={(e) => setModelForm({ ...modelForm, targetMargin: parseInt(e.target.value) || 50 })}
                    size="small"
                    helperText="Default target margin for this model"
                    inputProps={{ min: 0, max: 100 }}
                  />
                </Grid>
              </Grid>
              <Box display="flex" gap={1} mt={2}>
                <Button
                  variant="contained"
                  startIcon={<CheckIcon className="h-5 w-5" />}
                  onClick={handleSaveModel}
                  sx={{ bgcolor: brandColors.purple, '&:hover': { bgcolor: brandColors.navy } }}
                >
                  Save Model
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleCancelEdit}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          ) : (
            // Model List
            <Box>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Your Pricing Models ({Object.keys(predefinedModels).length})
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<PlusIcon className="h-5 w-5" />}
                  onClick={handleAddModel}
                  size="small"
                  sx={{ bgcolor: brandColors.green, '&:hover': { bgcolor: '#2a9145' } }}
                >
                  Add Model
                </Button>
              </Box>
              <List>
                {Object.entries(predefinedModels).map(([key, model]) => (
                  <ListItem
                    key={key}
                    sx={{
                      border: '1px solid',
                      borderColor: 'grey.200',
                      borderRadius: 1,
                      mb: 1,
                      '&:hover': { bgcolor: 'grey.50' },
                    }}
                  >
                    <ListItemText
                      primary={model.name}
                      secondary={
                        <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                          ${model.pricePerKid}/kid • Tutors: ${model.tutorCost1}/${model.tutorCost2}/${model.tutorCost3} •
                          Thresholds: {model.threshold1}/{model.threshold2} kids • Target: {model.targetMargin || 50}%
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="Edit model">
                        <IconButton 
                          onClick={() => handleEditModel(key)} 
                          size="small"
                          sx={{ mr: 0.5 }}
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete model">
                        <IconButton 
                          onClick={() => handleDeleteModel(key)} 
                          size="small"
                          sx={{ color: 'error.main' }}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
              {Object.keys(predefinedModels).length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No models configured. Click "Add Model" to create your first pricing model.
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button 
            onClick={handleResetToDefaults}
            color="warning"
            size="small"
          >
            Reset to Defaults
          </Button>
          <Box flex={1} />
          <Button onClick={handleCloseConfig} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
    </Box>
  );
}
