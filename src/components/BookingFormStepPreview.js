/**
 * BookingFormStepPreview Component
 * Full booking form preview with step-by-step navigation
 * Shows exactly how the booking form will appear to end users
 */

import React, { useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Divider,
  Alert,
  Stepper,
  Step,
  StepLabel,
  IconButton,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
} from '@mui/material';
import { DateTime } from 'luxon';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';



export default function BookingFormStepPreview({
  serviceName,
  serviceDescription,
  price,
  image,
  academicSkills,
  termBillingEnabled,
  termBillingConfig,
  termDiscountPercent,
  monthlySubscriptionEnabled,
  studentDiscountEnabled,
  studentDiscountPercent,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [numberOfStudents, setNumberOfStudents] = useState(1);
  const [paymentPlan, setPaymentPlan] = useState('term'); // 'term' or 'monthly'
  const [selectedDates, setSelectedDates] = useState([]);

  // Define steps based on configuration
  const steps = useMemo(() => {
    const stepList = ['Booking Details', 'Student Info'];
    if (termBillingEnabled && termBillingConfig?.class_dates?.length > 0) {
      stepList.push('Payment Plan');
    }
    stepList.push('Confirmation');
    return stepList;
  }, [termBillingEnabled, termBillingConfig]);

  // Calculate pricing
  const pricing = useMemo(() => {
    if (!termBillingEnabled || !termBillingConfig) {
      const basePrice = Number(price) || 0;
      let total = basePrice * numberOfStudents;
      
      if (studentDiscountEnabled && numberOfStudents >= 2 && studentDiscountPercent > 0) {
        const discountAmount = total * (studentDiscountPercent / 100);
        total = total - discountAmount;
        return {
          basePrice: basePrice * numberOfStudents,
          discount: discountAmount,
          discountPercent: studentDiscountPercent,
          total,
        };
      }
      
      return {
        basePrice: total,
        discount: 0,
        discountPercent: 0,
        total,
      };
    }

    // Term billing pricing
    const classDates = termBillingConfig.class_dates || [];
    const ratePerLesson = Number(termBillingConfig.rate_per_lesson) || 0;
    const totalLessons = classDates.length;
    const termTotal = totalLessons * ratePerLesson * numberOfStudents;
    
    // Always calculate term discount for upfront option display (regardless of selected payment plan)
    let discountAmount = 0;
    let discountedTotal = termTotal;
    if (termDiscountPercent && termDiscountPercent > 0) {
      discountAmount = termTotal * (termDiscountPercent / 100);
      discountedTotal = termTotal - discountAmount;
    }
    
    // Calculate sibling discount on the discounted total (after term discount)
    let siblingDiscount = 0;
    let finalTotal = discountedTotal;
    if (studentDiscountEnabled && numberOfStudents >= 2 && studentDiscountPercent > 0) {
      siblingDiscount = discountedTotal * (studentDiscountPercent / 100);
      finalTotal = discountedTotal - siblingDiscount;
    }
    
    // For monthly payments, calculate total without term discount (term discount only applies to upfront)
    let monthlyFinalTotal = termTotal;
    let monthlySiblingDiscount = 0;
    if (studentDiscountEnabled && numberOfStudents >= 2 && studentDiscountPercent > 0) {
      monthlySiblingDiscount = termTotal * (studentDiscountPercent / 100);
      monthlyFinalTotal = termTotal - monthlySiblingDiscount;
    }

    // Monthly breakdown
    const monthlyBreakdown = monthlySubscriptionEnabled && classDates.length > 0
      ? (() => {
          const months = {};
          classDates.forEach(dateStr => {
            try {
              const date = DateTime.fromISO(dateStr);
              const monthKey = date.toFormat('yyyy-MM');
              if (!months[monthKey]) {
                months[monthKey] = { dates: [], count: 0 };
              }
              months[monthKey].dates.push(dateStr);
              months[monthKey].count++;
            } catch (e) {
              console.warn('Invalid date:', dateStr);
            }
          });
          
          return Object.entries(months)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([monthKey, data]) => {
              const monthTotal = data.count * ratePerLesson * numberOfStudents;
              let monthDiscount = 0;
              if (studentDiscountEnabled && numberOfStudents >= 2 && studentDiscountPercent > 0) {
                monthDiscount = monthTotal * (studentDiscountPercent / 100);
              }
              return {
                month: DateTime.fromISO(`${monthKey}-01`).toFormat('MMMM yyyy'),
                lessons: data.count,
                amount: monthTotal - monthDiscount,
                originalAmount: monthTotal,
                discount: monthDiscount,
              };
            });
        })()
      : [];

    return {
      termTotal,
      discountAmount,
      termDiscountPercent: termDiscountPercent || 0,
      siblingDiscount,
      siblingDiscountPercent: studentDiscountEnabled && numberOfStudents >= 2 ? studentDiscountPercent : 0,
      finalTotal, // Upfront total (with term discount + sibling discount)
      monthlyFinalTotal, // Monthly total (sibling discount only, no term discount)
      monthlySiblingDiscount, // Sibling discount amount for monthly (calculated on base total)
      totalLessons,
      ratePerLesson,
      monthlyBreakdown,
    };
  }, [
    termBillingEnabled,
    termBillingConfig,
    termDiscountPercent,
    monthlySubscriptionEnabled,
    studentDiscountEnabled,
    studentDiscountPercent,
    numberOfStudents,
    price,
    paymentPlan,
  ]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Booking Details
        // Calculate price breakdown for display (matching actual booking form)
        // On Booking Details step, show BASE PRICE ONLY - no discounts applied yet
        // Discounts will be shown on later steps when user selects payment plan or number of students
        const getPriceBreakdown = () => {
          if (!termBillingEnabled || !termBillingConfig) {
            const basePrice = Number(price) || 0;
            // Show base price only - no discounts on step 1
            return {
              numberOfStudents: 1, // Default for display
              basePricePerStudent: basePrice,
              discountedPricePerStudent: basePrice,
              totalPrice: basePrice, // Base price for 1 student, no discounts
              hasDiscount: false, // No discounts shown on step 1
              discountPercent: 0,
              totalSavings: 0,
              isPerSession: false,
            };
          }
          
          // Term billing - show base per session pricing only
          const ratePerLesson = Number(termBillingConfig.rate_per_lesson) || 0;
          const totalLessons = termBillingConfig.class_dates?.length || 0;
          const baseTotal = totalLessons * ratePerLesson; // Base price for 1 student, no discounts
          
          return {
            numberOfStudents: 1, // Default for display
            basePricePerStudent: ratePerLesson,
            discountedPricePerStudent: ratePerLesson,
            totalPrice: baseTotal, // Base total for 1 student, no discounts applied
            hasDiscount: false, // No discounts shown on step 1
            discountPercent: 0,
            totalSavings: 0,
            isPerSession: true,
            totalLessons: totalLessons,
          };
        };
        
        const breakdown = getPriceBreakdown();
        
        return (
          <Box>
            {/* Service Image - matching actual booking form */}
            {image && image.trim() !== '' && (
              <Box
                sx={{
                  width: '100%',
                  paddingBottom: '100%', // Creates square aspect ratio
                  position: 'relative',
                  mb: 3,
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                <Box
                  component="img"
                  src={image}
                  alt={serviceName || 'Service'}
                  onError={(e) => {
                    console.error('Image failed to load:', image);
                    e.target.style.display = 'none';
                  }}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    borderRadius: 1,
                  }}
                />
              </Box>
            )}
            
            {/* Service Name */}
            <Typography 
              variant="h5" 
              sx={{ 
                mb: 2, 
                fontWeight: 600,
                fontSize: '1.5rem',
                lineHeight: 1.2,
              }}
            >
              {serviceName || 'Service Name'}
            </Typography>
            
            {/* Service Description */}
            {serviceDescription && (
              <Box
                sx={{ 
                  mb: 2,
                  color: 'text.primary',
                  '& p': {
                    mb: 1.5,
                    lineHeight: 1.6,
                  },
                  '& p:last-child': {
                    mb: 0,
                  },
                  '& strong': {
                    fontWeight: 600,
                  },
                }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(serviceDescription) }}
              />
            )}
            
            {/* Academic Skills */}
            {academicSkills && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Academic Skills:
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {academicSkills}
                </Typography>
              </Box>
            )}

            {/* Pricing Box - matching actual booking form "Total" section */}
            <Card sx={{ 
              mt: 2, 
              bgcolor: 'white',
              border: '1px solid',
              borderColor: 'grey.300',
              borderRadius: 1,
            }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, fontSize: '1.5rem' }}>
                  Total
                </Typography>
                
                {/* Price Breakdown */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Students:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {breakdown.numberOfStudents}
                    </Typography>
                  </Box>
                  
                  {breakdown.isPerSession && (
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          Lessons:
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {breakdown.totalLessons || (termBillingConfig?.class_dates?.length || 0)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          Per student per session:
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {formatCurrency(breakdown.basePricePerStudent)}
                        </Typography>
                      </Box>
                    </>
                  )}
                </Box>

                {/* Final Total */}
                <Box sx={{ pt: 2, mt: 2, borderTop: '2px solid', borderColor: 'grey.400' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '1.125rem' }}>
                      Total Price:
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main', fontSize: '1.5rem' }}>
                      {formatCurrency(breakdown.totalPrice)}
                    </Typography>
                  </Box>
                  {termBillingEnabled && termBillingConfig && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                      Discounts will be applied when you select your payment plan
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Box>
        );

      case 1: // Student Info
        return (
          <Box>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              How many students will be enrolling?
            </Typography>
            
            <FormControl fullWidth>
              <FormLabel>Number of Students</FormLabel>
              <RadioGroup
                value={numberOfStudents}
                onChange={(e) => setNumberOfStudents(Number(e.target.value))}
                sx={{ mt: 1 }}
              >
                <FormControlLabel value={1} control={<Radio />} label="1 Student" />
                <FormControlLabel value={2} control={<Radio />} label="2 Students" />
                <FormControlLabel value={3} control={<Radio />} label="3 Students" />
                <FormControlLabel value={4} control={<Radio />} label="4+ Students" />
              </RadioGroup>
            </FormControl>

            {/* Only show sibling discount on Student Info step - term discount appears later on Payment Plan step */}
            {numberOfStudents >= 2 && studentDiscountEnabled && studentDiscountPercent > 0 && (
              <Alert 
                severity="success" 
                sx={{ 
                  mt: 2,
                  bgcolor: 'success.light',
                  '& .MuiAlert-icon': {
                    color: 'success.main',
                  },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5, fontSize: '0.95rem' }}>
                  🎉 Discounts applied!
                </Typography>
                
                <Box sx={{ mt: 1 }}>
                  {/* Calculate base total without term discount for this step */}
                  {termBillingEnabled && termBillingConfig ? (
                    <>
                      {/* Base total (no term discount applied yet) */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Base total:
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatCurrency(pricing.termTotal)}
                        </Typography>
                      </Box>
                      
                      {/* Sibling discount - calculate without term discount */}
                      {(() => {
                        // Calculate sibling discount on base total (without term discount)
                        const baseTotal = pricing.termTotal;
                        const siblingDiscountAmount = baseTotal * (pricing.siblingDiscountPercent / 100);
                        const finalPriceWithoutTermDiscount = baseTotal - siblingDiscountAmount;
                        
                        return (
                          <>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                              <Typography variant="body2" sx={{ color: 'success.dark' }}>
                                Sibling discount ({pricing.siblingDiscountPercent}%):
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.dark' }}>
                                -{formatCurrency(siblingDiscountAmount)}
                              </Typography>
                            </Box>
                            
                            {/* Divider */}
                            <Divider sx={{ my: 1.5, borderColor: 'rgba(0,0,0,0.12)' }} />
                            
                            {/* Total savings */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.dark' }}>
                                Total savings:
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.dark', fontSize: '1rem' }}>
                                {formatCurrency(siblingDiscountAmount)}
                              </Typography>
                            </Box>
                            
                            {/* Final price (without term discount) */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Final price:
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                                {formatCurrency(finalPriceWithoutTermDiscount)}
                              </Typography>
                            </Box>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      {/* Base total */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Base total:
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatCurrency(pricing.basePrice)}
                        </Typography>
                      </Box>
                      
                      {/* Sibling discount */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography variant="body2" sx={{ color: 'success.dark' }}>
                          Sibling discount ({studentDiscountPercent}%):
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.dark' }}>
                          -{formatCurrency(pricing.discount)}
                        </Typography>
                      </Box>
                      
                      {/* Divider */}
                      <Divider sx={{ my: 1.5, borderColor: 'rgba(0,0,0,0.12)' }} />
                      
                      {/* Total savings */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.dark' }}>
                          Total savings:
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.dark', fontSize: '1rem' }}>
                          {formatCurrency(pricing.discount)}
                        </Typography>
                      </Box>
                      
                      {/* Final price */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Final price:
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                          {formatCurrency(pricing.total)}
                        </Typography>
                      </Box>
                    </>
                  )}
                </Box>
              </Alert>
            )}

            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Student Information
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  In the actual form, parents will enter:
                </Typography>
                <Box component="ul" sx={{ mt: 1, pl: 2 }}>
                  <li><Typography variant="body2">Student name</Typography></li>
                  <li><Typography variant="body2">Date of birth</Typography></li>
                  <li><Typography variant="body2">School name</Typography></li>
                  <li><Typography variant="body2">Chess experience level</Typography></li>
                  {numberOfStudents > 1 && (
                    <li><Typography variant="body2">Additional student details...</Typography></li>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Box>
        );

      case 2: // Payment Plan (only shown if term billing enabled)
        if (!termBillingEnabled || !termBillingConfig) {
          return null;
        }

        // Calculate totals for comparison - matching actual PaymentPlanSelector component
        const monthlyTotal = pricing.termTotal; // Total without term discount
        const termTotal = pricing.finalTotal; // Total with term discount + sibling discount
        const savings = monthlyTotal - termTotal;
        const savingsPercent = pricing.termDiscountPercent || 0;

        // Calculate initial monthly charge (first month)
        const initialMonthlyCharge = pricing.monthlyBreakdown.length > 0 
          ? pricing.monthlyBreakdown[0].amount 
          : 0;
        const firstMonthLessons = pricing.monthlyBreakdown.length > 0 
          ? pricing.monthlyBreakdown[0].lessons 
          : 0;

        return (
          <Box>
            {/* Section Header - matching actual PaymentPlanSelector */}
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Choose Your Payment Plan
            </Typography>

            <RadioGroup
              value={paymentPlan}
              onChange={(e) => setPaymentPlan(e.target.value)}
              sx={{ mt: 2 }}
            >
              {/* Monthly Option - matching actual PaymentPlanSelector */}
              {monthlySubscriptionEnabled && pricing.monthlyBreakdown.length > 0 && (
                <Card 
                  variant="outlined" 
                  sx={{ 
                    mb: 2, 
                    border: paymentPlan === 'monthly' ? '2px solid' : '1px solid',
                    borderColor: paymentPlan === 'monthly' ? 'primary.main' : 'divider',
                    bgcolor: paymentPlan === 'monthly' ? 'primary.50' : 'background.paper',
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
                    
                    {paymentPlan === 'monthly' && (
                      <Box sx={{ mt: 2, pl: 4 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Payment Schedule:
                        </Typography>
                        <Box sx={{ pl: 2 }}>
                          <Typography variant="body2">
                            • Today: {formatCurrency(initialMonthlyCharge)} ({firstMonthLessons} lesson{firstMonthLessons !== 1 ? 's' : ''} this month)
                          </Typography>
                          <Typography variant="body2">
                            • Then: {formatCurrency(pricing.ratePerLesson)} per lesson, billed monthly
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                            Only charged for upcoming class dates within the month
                          </Typography>
                        </Box>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Term Option - matching actual PaymentPlanSelector */}
              <Card 
                variant="outlined" 
                sx={{ 
                  border: paymentPlan === 'term' ? '2px solid' : '1px solid',
                  borderColor: paymentPlan === 'term' ? 'primary.main' : 'divider',
                  bgcolor: paymentPlan === 'term' ? 'primary.50' : 'background.paper',
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
                              label={`Save ${savingsPercent.toFixed(2)}%`} 
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
                  
                  {paymentPlan === 'term' && (
                    <Box sx={{ mt: 2, pl: 4 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Prorated Payment (joining mid-term):
                      </Typography>
                      <Box sx={{ pl: 2 }}>
                        <Typography variant="body2">
                          • {pricing.totalLessons} remaining lessons
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
                    </Box>
                  )}
                </CardContent>
              </Card>
            </RadioGroup>

            <Divider sx={{ my: 2 }} />

            {/* Term Details - matching actual PaymentPlanSelector */}
            <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Term Details:</strong> {serviceName || 'Service'} Term
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                <strong>Rate:</strong> {formatCurrency(pricing.ratePerLesson)} per lesson
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                <strong>Total Lessons:</strong> {pricing.totalLessons}
              </Typography>
            </Box>
          </Box>
        );

      case 3: // Confirmation (or step 2 if no payment plan step)
        const isConfirmationStep = steps.length === 4 ? currentStep === 3 : currentStep === 2;
        if (!isConfirmationStep) return null;

        return (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
              <CheckCircleIcon className="h-16 w-16" style={{ color: '#2e7d32' }} />
            </Box>
            
            <Typography variant="h5" sx={{ mb: 2, textAlign: 'center', fontWeight: 600 }}>
              Review Your Booking
            </Typography>

            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                  Service Details
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>Service:</strong> {serviceName}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>Students:</strong> {numberOfStudents}
                </Typography>
                {termBillingEnabled && (
                  <>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      <strong>Payment Plan:</strong> {paymentPlan === 'term' ? 'Pay Entire Term Upfront' : 'Monthly Billing'}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      <strong>Total Lessons:</strong> {pricing.totalLessons}
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>

            <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                  {paymentPlan === 'monthly' && pricing.monthlyBreakdown.length > 0 
                    ? 'Amount Due Now' 
                    : 'Total Amount'}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {paymentPlan === 'monthly' && pricing.monthlyBreakdown.length > 0
                    ? formatCurrency(pricing.monthlyBreakdown[0].amount)
                    : formatCurrency(pricing.finalTotal)}
                </Typography>
                {paymentPlan === 'monthly' && pricing.monthlyBreakdown.length > 0 && (
                  <>
                    <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
                      First payment: {DateTime.now().toLocaleString(DateTime.DATE_MED)}
                    </Typography>
                    {pricing.monthlyBreakdown.length > 1 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                          Future payments:
                        </Typography>
                        {pricing.monthlyBreakdown.slice(1).map((month, idx) => {
                          // Parse the month string (e.g., "January 2026") and create date for 1st of that month
                          const monthDate = DateTime.fromFormat(month.month, 'MMMM yyyy');
                          const paymentDate = monthDate.isValid 
                            ? monthDate.set({ day: 1 }).toLocaleString(DateTime.DATE_MED)
                            : `${month.month} 1`;
                          
                          return (
                            <Box 
                              key={idx} 
                              sx={{ 
                                display: 'flex', 
                                justifyContent: 'space-between',
                                mb: 0.75,
                                pl: 1,
                              }}
                            >
                              <Typography variant="body2">
                                {paymentDate}:
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {formatCurrency(month.amount)}
                              </Typography>
                            </Box>
                          );
                        })}
                        <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.9 }}>
                          Future payments will be charged automatically
                        </Typography>
                      </Box>
                    )}
                  </>
                )}
                {termBillingEnabled && paymentPlan === 'term' && pricing.termDiscountPercent > 0 && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Includes {pricing.termDiscountPercent}% term discount
                  </Typography>
                )}
                {pricing.siblingDiscountPercent > 0 && (
                  <Typography variant="body2">
                    Includes {pricing.siblingDiscountPercent}% sibling discount
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Alert severity="info" sx={{ mt: 2 }}>
              In the actual form, parents will review all details and proceed to payment.
            </Alert>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {/* Step Navigation Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Booking Form Preview
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton
              onClick={handleBack}
              disabled={currentStep === 0}
              size="small"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </IconButton>
            <IconButton
              onClick={handleNext}
              disabled={currentStep === steps.length - 1}
              size="small"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </Box>
        
        <Stepper activeStep={currentStep} alternativeLabel>
          {steps.map((label, index) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
          Step {currentStep + 1} of {steps.length}
        </Typography>
      </Box>

      {/* Step Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        <Card>
          <CardContent>
            {renderStepContent()}
          </CardContent>
        </Card>
      </Box>

      {/* Navigation Footer */}
      <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            onClick={handleBack}
            disabled={currentStep === 0}
            startIcon={<ChevronLeftIcon className="h-5 w-5" />}
          >
            Previous
          </Button>
          <Button
            onClick={handleNext}
            disabled={currentStep === steps.length - 1}
            variant="contained"
            endIcon={<ChevronRightIcon className="h-5 w-5" />}
          >
            {currentStep === steps.length - 1 ? 'Complete' : 'Next'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

