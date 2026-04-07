/**
 * BookingFormPreview Component
 * Live preview of how the booking form will appear to end users
 * Shows term billing options, sibling discounts, and pricing calculations
 */

import React, { useMemo } from 'react';
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
  Grid,
  Paper,
} from '@mui/material';
import { DateTime } from 'luxon';



export default function BookingFormPreview({
  serviceName,
  serviceDescription,
  price,
  termBillingEnabled,
  termBillingConfig,
  termDiscountPercent,
  monthlySubscriptionEnabled,
  studentDiscountEnabled,
  studentDiscountPercent,
  numberOfStudents = 1,
  onNumberOfStudentsChange,
}) {
  // Calculate pricing based on configuration
  const pricing = useMemo(() => {
    if (!termBillingEnabled || !termBillingConfig) {
      // Standard pricing
      const basePrice = Number(price) || 0;
      let total = basePrice * numberOfStudents;
      
      // Apply sibling discount if enabled and 2+ students
      if (studentDiscountEnabled && numberOfStudents >= 2 && studentDiscountPercent > 0) {
        const discountAmount = total * (studentDiscountPercent / 100);
        total = total - discountAmount;
        return {
          basePrice: basePrice * numberOfStudents,
          discount: discountAmount,
          discountPercent: studentDiscountPercent,
          total,
          breakdown: `$${basePrice.toFixed(2)} × ${numberOfStudents} student${numberOfStudents > 1 ? 's' : ''} = $${(basePrice * numberOfStudents).toFixed(2)}`,
        };
      }
      
      return {
        basePrice: total,
        discount: 0,
        discountPercent: 0,
        total,
        breakdown: `$${basePrice.toFixed(2)} × ${numberOfStudents} student${numberOfStudents > 1 ? 's' : ''} = $${total.toFixed(2)}`,
      };
    }

    // Term billing pricing
    const classDates = termBillingConfig.class_dates || [];
    const ratePerLesson = Number(termBillingConfig.rate_per_lesson) || 0;
    const totalLessons = classDates.length;
    const termTotal = totalLessons * ratePerLesson * numberOfStudents;
    
    // Apply term discount if enabled
    let discountAmount = 0;
    let discountedTotal = termTotal;
    if (termDiscountPercent && termDiscountPercent > 0) {
      discountAmount = termTotal * (termDiscountPercent / 100);
      discountedTotal = termTotal - discountAmount;
    }
    
    // Apply sibling discount on top of term discount
    let siblingDiscount = 0;
    let finalTotal = discountedTotal;
    if (studentDiscountEnabled && numberOfStudents >= 2 && studentDiscountPercent > 0) {
      siblingDiscount = discountedTotal * (studentDiscountPercent / 100);
      finalTotal = discountedTotal - siblingDiscount;
    }

    // Calculate monthly breakdown if monthly subscription is enabled
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
              return {
                month: DateTime.fromISO(`${monthKey}-01`).toFormat('MMMM yyyy'),
                lessons: data.count,
                amount: monthTotal,
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
      finalTotal,
      totalLessons,
      ratePerLesson,
      monthlyBreakdown,
      breakdown: `${totalLessons} lessons × $${ratePerLesson.toFixed(2)} × ${numberOfStudents} student${numberOfStudents > 1 ? 's' : ''} = $${termTotal.toFixed(2)}`,
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
  ]);

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Booking Form Preview
      </Typography>
      
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
            {serviceName || 'Service Name'}
          </Typography>
          
          {serviceDescription && (
            <Box
              sx={{ mb: 2 }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(serviceDescription) }}
            />
          )}
        </CardContent>
      </Card>

      {/* Number of Students Selector */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <FormControl fullWidth>
            <InputLabel>Number of Students</InputLabel>
            <Select
              value={numberOfStudents}
              onChange={(e) => onNumberOfStudentsChange?.(Number(e.target.value))}
              label="Number of Students"
            >
              <MenuItem value={1}>1 Student</MenuItem>
              <MenuItem value={2}>2 Students</MenuItem>
              <MenuItem value={3}>3 Students</MenuItem>
              <MenuItem value={4}>4+ Students</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* Payment Options */}
      {termBillingEnabled && termBillingConfig ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Payment Options
            </Typography>

            {/* Term Billing Option */}
            <Paper sx={{ p: 2, mb: 2, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Pay Entire Term Upfront
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {pricing.breakdown}
              </Typography>
              
              {pricing.termDiscountPercent > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2">
                    Term Discount ({pricing.termDiscountPercent}%): -{formatCurrency(pricing.discountAmount)}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    After Term Discount: {formatCurrency(pricing.termTotal - pricing.discountAmount)}
                  </Typography>
                </Box>
              )}
              
              {pricing.siblingDiscountPercent > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2">
                    Sibling Discount ({pricing.siblingDiscountPercent}%): -{formatCurrency(pricing.siblingDiscount)}
                  </Typography>
                </Box>
              )}
              
              <Divider sx={{ my: 1, bgcolor: 'rgba(255,255,255,0.3)' }} />
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Total: {formatCurrency(pricing.finalTotal)}
              </Typography>
            </Paper>

            {/* Monthly Billing Option */}
            {monthlySubscriptionEnabled && pricing.monthlyBreakdown.length > 0 && (
              <Paper sx={{ p: 2, border: '2px dashed', borderColor: 'divider' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Monthly Billing
                </Typography>
                <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                  Pay monthly for upcoming lessons
                </Typography>
                
                {pricing.monthlyBreakdown.map((month, idx) => (
                  <Box key={idx} sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {month.month}: {month.lessons} lesson{month.lessons !== 1 ? 's' : ''} = {formatCurrency(month.amount)}
                    </Typography>
                  </Box>
                ))}
                
                {pricing.siblingDiscountPercent > 0 && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Sibling discount applies to monthly payments
                  </Alert>
                )}
              </Paper>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Standard Pricing */
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Pricing
            </Typography>
            
            <Typography variant="body1" sx={{ mb: 1 }}>
              {pricing.breakdown}
            </Typography>
            
            {pricing.discount > 0 && (
              <>
                <Typography variant="body2" color="success.main" sx={{ mb: 1 }}>
                  Sibling Discount ({pricing.discountPercent}%): -{formatCurrency(pricing.discount)}
                </Typography>
                <Divider sx={{ my: 1 }} />
              </>
            )}
            
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Total: {formatCurrency(pricing.total)}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Class Dates Preview */}
      {termBillingEnabled && termBillingConfig?.class_dates?.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Class Schedule ({termBillingConfig.class_dates.length} classes)
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {termBillingConfig.class_dates.slice(0, 10).map((dateStr, idx) => (
                <Chip
                  key={idx}
                  label={formatDate(dateStr)}
                  size="small"
                  variant="outlined"
                />
              ))}
              {termBillingConfig.class_dates.length > 10 && (
                <Chip
                  label={`+${termBillingConfig.class_dates.length - 10} more`}
                  size="small"
                  variant="outlined"
                  color="primary"
                />
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Info Alert */}
      <Alert severity="info" sx={{ mt: 2 }}>
        This is a live preview. Changes you make on the left will update here in real-time.
      </Alert>
    </Box>
  );
}





