/**
 * PaymentPlanSelector Component
 * Shows monthly vs term payment options when term billing is available
 * Used in BookingForms component
 */

import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Radio,
  RadioGroup,
  FormControlLabel,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Divider,
} from '@mui/material';
import axios from 'axios';

const getAuthenticatedAxios = () => {
  return axios.create({
    withCredentials: true,
  });
};

// Public axios instance for endpoints that don't require authentication
const publicAxios = axios;

export default function PaymentPlanSelector({ 
  serviceId, 
  enrollmentDate,
  onPlanSelected,
  onProrationCalculated,
  onConfigLoaded,
  onPriceCalculated
}) {
  const [loading, setLoading] = useState(false);
  const [termConfig, setTermConfig] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState('monthly'); // 'monthly' or 'term'
  const [proration, setProration] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (serviceId) {
      console.log('[PaymentPlanSelector] Loading term config for serviceId:', serviceId);
      loadTermConfig();
    } else {
      console.log('[PaymentPlanSelector] No serviceId provided, component will not render');
    }
  }, [serviceId]);

  // Notify parent of default plan selection when term config loads
  useEffect(() => {
    if (termConfig && onPlanSelected && selectedPlan) {
      console.log('[PaymentPlanSelector] Notifying parent of default plan:', selectedPlan);
      onPlanSelected(selectedPlan);
    }
  }, [termConfig]); // Run when term config loads

  const calculatePriceForPlan = (plan) => {
    if (!termConfig || !enrollmentDate) return;
    
    const enrollDate = new Date(enrollmentDate);
    let price = 0;
    
    if (plan === 'term') {
      // Term payment - use prorated amount if available, otherwise full term
      if (proration && proration.discountedAmount) {
        price = proration.discountedAmount;
      } else {
        price = termConfig.discounted_term_total || termConfig.term_total;
      }
    } else {
      // Monthly - calculate initial charge (remaining lessons in current month)
      const currentMonth = new Date(enrollDate.getFullYear(), enrollDate.getMonth(), 1);
      const monthDates = termConfig.class_dates.filter(dateStr => {
        const date = new Date(dateStr);
        return date >= enrollDate && 
               date.getMonth() === currentMonth.getMonth() && 
               date.getFullYear() === currentMonth.getFullYear();
      });
      price = monthDates.length * termConfig.rate_per_lesson;
    }
    
    if (onPriceCalculated) {
      onPriceCalculated(price);
    }
  };

  useEffect(() => {
    if (termConfig && enrollmentDate) {
      calculateProration();
    }
  }, [termConfig, enrollmentDate, selectedPlan]);
  
  // Calculate price when config, plan, or proration changes
  useEffect(() => {
    if (termConfig && selectedPlan && enrollmentDate) {
      calculatePriceForPlan(selectedPlan);
    }
  }, [termConfig, selectedPlan, enrollmentDate, proration]);

  const loadTermConfig = async () => {
    try {
      setLoading(true);
      // Use regular axios (not authenticated) since this is a public endpoint
      const response = await axios.get(`/api/term-billing/config/${serviceId}`);
      
      if (response.data.config) {
        console.log('[PaymentPlanSelector] Term config loaded:', response.data.config);
        setTermConfig(response.data.config);
        if (onConfigLoaded) {
          onConfigLoaded(response.data.config);
        }
        // Notify parent of default plan selection when config loads
        // This ensures useTermBilling is set even if user doesn't interact with selector
        if (onPlanSelected && selectedPlan) {
          console.log('[PaymentPlanSelector] Notifying parent of default plan on config load:', selectedPlan);
          onPlanSelected(selectedPlan);
        }
      } else {
        console.log('[PaymentPlanSelector] No term config found for serviceId:', serviceId);
      }
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Error loading term config:', error);
        setError('Failed to load billing options');
      }
      // 404 means no term billing config - this is OK, component won't show
    } finally {
      setLoading(false);
    }
  };

  const calculateProration = async () => {
    if (!termConfig || !enrollmentDate) return;
    
    try {
      // Use regular axios since preview endpoint is now public
      const response = await axios.post('/api/term-billing/preview', {
        ratePerLesson: termConfig.rate_per_lesson,
        termDiscountPercent: termConfig.term_discount_percent,
        classDates: termConfig.class_dates,
        enrollmentDate: enrollmentDate,
      });
      
      if (response.data.preview?.proration) {
        setProration(response.data.preview.proration);
        if (onProrationCalculated) {
          onProrationCalculated(response.data.preview.proration);
        }
      }
      
      // Price will be calculated by useEffect when proration state updates
    } catch (error) {
      console.error('Error calculating proration:', error);
      // If preview fails (e.g., auth required), calculate proration locally
      // This is a fallback - the component will still work without proration
    }
  };

  const handlePlanChange = (event) => {
    const newPlan = event.target.value;
    setSelectedPlan(newPlan);
    if (onPlanSelected) {
      onPlanSelected(newPlan);
    }
    
    // Calculate and notify parent of price
    if (termConfig) {
      calculatePriceForPlan(newPlan);
    }
  };
  
  // Calculate price when config or plan changes
  useEffect(() => {
    if (termConfig && selectedPlan) {
      calculatePriceForPlan(selectedPlan);
    }
  }, [termConfig, selectedPlan, enrollmentDate, proration]);


  // Show loading state while fetching config
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={2}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  // Don't render if no term config available (after loading completes)
  if (!termConfig) {
    console.log('[PaymentPlanSelector] No term config found, component will not render');
    return null;
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  const monthlyTotal = termConfig.term_total;
  const termTotal = termConfig.discounted_term_total || termConfig.term_total;
  const savings = monthlyTotal - termTotal;
  const savingsPercent = termConfig.term_discount_percent || 0;

  // Calculate initial monthly charge (remaining lessons in current month)
  const enrollDate = new Date(enrollmentDate || new Date());
  const currentMonth = new Date(enrollDate.getFullYear(), enrollDate.getMonth(), 1);
  const monthDates = termConfig.class_dates.filter(dateStr => {
    const date = new Date(dateStr);
    return date >= enrollDate && 
           date.getMonth() === currentMonth.getMonth() && 
           date.getFullYear() === currentMonth.getFullYear();
  });
  const initialMonthlyCharge = monthDates.length * termConfig.rate_per_lesson;

  return (
    <Card sx={{ mb: 3, border: '2px solid', borderColor: 'primary.main' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          Choose Your Payment Plan
        </Typography>
        
        <RadioGroup
          value={selectedPlan}
          onChange={handlePlanChange}
          sx={{ mt: 2 }}
        >
          {/* Monthly Option */}
          <Card 
            variant="outlined" 
            sx={{ 
              mb: 2, 
              border: selectedPlan === 'monthly' ? '2px solid' : '1px solid',
              borderColor: selectedPlan === 'monthly' ? 'primary.main' : 'divider',
              bgcolor: selectedPlan === 'monthly' ? 'primary.50' : 'background.paper',
            }}
          >
            <CardContent>
              <FormControlLabel
                value="monthly"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Pay Monthly
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Auto-billed on the 1st of each month
                    </Typography>
                  </Box>
                }
                sx={{ width: '100%', m: 0 }}
              />
              
              {selectedPlan === 'monthly' && (
                <Box sx={{ mt: 2, pl: 4 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Payment Schedule:
                  </Typography>
                  <Box sx={{ pl: 2 }}>
                    <Typography variant="body2">
                      • Today: {formatCurrency(initialMonthlyCharge)} ({monthDates.length} lessons this month)
                    </Typography>
                    <Typography variant="body2">
                      • Then: {formatCurrency(termConfig.rate_per_lesson)} per lesson, billed monthly
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                      Only charged for upcoming class dates within the month
                    </Typography>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Term Option */}
          <Card 
            variant="outlined" 
            sx={{ 
              border: selectedPlan === 'term' ? '2px solid' : '1px solid',
              borderColor: selectedPlan === 'term' ? 'primary.main' : 'divider',
              bgcolor: selectedPlan === 'term' ? 'primary.50' : 'background.paper',
            }}
          >
            <CardContent>
              <FormControlLabel
                value="term"
                control={<Radio />}
                label={
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        Pay Full Term
                      </Typography>
                      {savingsPercent > 0 && (
                        <Chip 
                          label={`Save ${savingsPercent}%`} 
                          color="success" 
                          size="small"
                        />
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      One-time payment for entire term
                    </Typography>
                  </Box>
                }
                sx={{ width: '100%', m: 0 }}
              />
              
              {selectedPlan === 'term' && (
                <Box sx={{ mt: 2, pl: 4 }}>
                  {proration ? (
                    <>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Prorated Payment (joining mid-term):
                      </Typography>
                      <Box sx={{ pl: 2 }}>
                        <Typography variant="body2">
                          • {proration.lessons} remaining lessons
                        </Typography>
                        <Typography variant="h6" sx={{ mt: 1, color: 'success.main' }}>
                          {formatCurrency(proration.discountedAmount || proration.amount)}
                        </Typography>
                        {proration.discountedAmount && (
                          <Typography variant="caption" color="text.secondary">
                            Regular price: {formatCurrency(proration.amount)} 
                            (Save {formatCurrency(proration.amount - proration.discountedAmount)})
                          </Typography>
                        )}
                      </Box>
                    </>
                  ) : (
                    <>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Full Term Payment:
                      </Typography>
                      <Box sx={{ pl: 2 }}>
                        <Typography variant="body2">
                          • {termConfig.total_lessons} total lessons
                        </Typography>
                        <Typography variant="h6" sx={{ mt: 1, color: 'success.main' }}>
                          {formatCurrency(termTotal)}
                        </Typography>
                        {savings > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            Regular price: {formatCurrency(monthlyTotal)} 
                            (Save {formatCurrency(savings)})
                          </Typography>
                        )}
                      </Box>
                    </>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </RadioGroup>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            <strong>Term Details:</strong> {termConfig.term_name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            <strong>Rate:</strong> {formatCurrency(termConfig.rate_per_lesson)} per lesson
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            <strong>Total Lessons:</strong> {termConfig.total_lessons}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}






