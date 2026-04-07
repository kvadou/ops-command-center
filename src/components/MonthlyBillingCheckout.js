import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Alert
} from '@mui/material';
import axios from 'axios';

// Get Stripe publishable key (same pattern as BookingForms.js)
const STATIC_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 
                               import.meta.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;

// Create Stripe promise factory function
const createStripePromise = (publishableKey) => {
  if (!publishableKey) {
    return Promise.resolve(null);
  }
  return loadStripe(publishableKey).catch((error) => {
    console.error('[Stripe] Failed to load Stripe.js:', error);
    return null;
  });
};

// Create initial Stripe promise from static key if available
let stripePromise = STATIC_PUBLISHABLE_KEY 
  ? createStripePromise(STATIC_PUBLISHABLE_KEY)
  : Promise.resolve(null);

const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': {
        color: '#aab7c4',
      },
    },
    invalid: {
      color: '#9e2146',
    },
  },
};

function CheckoutForm({ paymentDetails, checkoutSessionId, stripeCustomerId, serviceId, submissionId, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get card element
      const cardElement = elements.getElement(CardElement);

      // Create payment method
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (pmError) {
        throw new Error(pmError.message);
      }

      // Attach payment method to customer and complete setup
      const response = await axios.post('/api/subscriptions/complete-setup', {
        checkoutSessionId,
        paymentMethodId: paymentMethod.id,
        stripeCustomerId,
        serviceId,
        submissionId
      });

      if (response.data.success) {
        onSuccess(response.data);
      } else {
        throw new Error(response.data.error || 'Failed to complete setup');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'An error occurred');
      onError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
          Card Information
        </Typography>
        <Card
          variant="outlined"
          sx={{
            p: 2,
            mb: 2,
            bgcolor: '#f9fafb',
            border: '1px solid #e5e7eb'
          }}
        >
          <CardElement options={cardElementOptions} />
        </Card>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </Box>

      <Button
        type="submit"
        variant="contained"
        fullWidth
        disabled={!stripe || loading}
        sx={{
          py: 1.5,
          fontSize: '1rem',
          fontWeight: 600,
          bgcolor: '#635bff',
          '&:hover': {
            bgcolor: '#5851ea'
          }
        }}
      >
        {loading ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1, color: 'white' }} />
            Processing...
          </>
        ) : (
          'Save Payment Method'
        )}
      </Button>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>
        By saving your payment information, you allow Acme Operations to charge you for future payments in accordance with their terms.
      </Typography>
    </form>
  );
}

export default function MonthlyBillingCheckout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState(null);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);
  const [serviceId, setServiceId] = useState(null);
  const [submissionId, setSubmissionId] = useState(null);
  const [stripePublishableKey, setStripePublishableKey] = useState(STATIC_PUBLISHABLE_KEY);
  const [stripePromiseState, setStripePromiseState] = useState(stripePromise);

  useEffect(() => {
    // Fetch Stripe publishable key from API if not available in env
    if (!STATIC_PUBLISHABLE_KEY) {
      fetch('/api/config/stripe-publishable-key')
        .then(res => res.json())
        .then(data => {
          if (data.publishableKey) {
            console.log('[Stripe] Fetched publishable key from API');
            setStripePublishableKey(data.publishableKey);
            const newPromise = createStripePromise(data.publishableKey);
            setStripePromiseState(newPromise);
          }
        })
        .catch(err => {
          console.error('[Stripe] Error fetching publishable key:', err);
        });
    }
  }, []);

  useEffect(() => {
    // Get parameters from URL
    const sessionId = searchParams.get('session_id');
    const customerId = searchParams.get('customer_id');
    const svcId = searchParams.get('service_id');
    const subId = searchParams.get('submission_id');

    // Validate required parameters
    const missingParams = [];
    if (!sessionId) missingParams.push('session_id');
    if (!customerId) missingParams.push('customer_id');
    if (!svcId) missingParams.push('service_id');

    if (missingParams.length > 0) {
      console.error('[MonthlyBillingCheckout] Missing required parameters:', missingParams);
      console.error('[MonthlyBillingCheckout] URL params:', {
        sessionId,
        customerId,
        svcId,
        subId,
        fullUrl: window.location.href
      });
      
      // Try to fetch missing parameters from session metadata if we have sessionId
      if (sessionId && (missingParams.includes('customer_id') || missingParams.includes('service_id'))) {
        console.log('[MonthlyBillingCheckout] Attempting to fetch missing parameters from session metadata...');
        fetch(`/api/subscriptions/checkout-details/${sessionId}`)
          .then(res => res.json())
          .then(data => {
            if (data.paymentDetails) {
              const resolvedCustomerId = customerId || data.stripeCustomerId;
              const resolvedServiceId = svcId || data.serviceId;
              
              if (resolvedCustomerId && resolvedServiceId) {
                console.log('[MonthlyBillingCheckout] Resolved missing parameters from session metadata');
                setCheckoutSessionId(sessionId);
                setStripeCustomerId(resolvedCustomerId);
                setServiceId(resolvedServiceId);
                setSubmissionId(subId);
                fetchPaymentDetails(sessionId);
                return;
              }
            }
            setError(`Missing required parameters: ${missingParams.join(', ')}. Please try again or contact support.`);
            setLoading(false);
          })
          .catch(err => {
            console.error('[MonthlyBillingCheckout] Error fetching session details:', err);
            setError(`Missing required parameters: ${missingParams.join(', ')}. Please try again or contact support.`);
            setLoading(false);
          });
        return;
      }
      
      setError(`Missing required parameters: ${missingParams.join(', ')}. Please try again or contact support.`);
      setLoading(false);
      return;
    }

    setCheckoutSessionId(sessionId);
    setStripeCustomerId(customerId);
    setServiceId(svcId);
    setSubmissionId(subId);

    // Fetch payment details from session metadata
    fetchPaymentDetails(sessionId);
  }, [searchParams]);

  const fetchPaymentDetails = async (sessionId) => {
    try {
      const response = await axios.get(`/api/subscriptions/checkout-details/${sessionId}`);
      setPaymentDetails(response.data.paymentDetails);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load checkout details');
      setLoading(false);
    }
  };

  const handleSuccess = (data) => {
    // Redirect to success page
    const successUrl = `/booking-forms/success?${submissionId ? `submission_id=${submissionId}&` : ''}setup=success&session_id=${checkoutSessionId}`;
    navigate(successUrl);
  };

  const handleError = (err) => {
    console.error('Checkout error:', err);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !paymentDetails) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!stripePromiseState) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', p: 3 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading payment form...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f6f8', py: 4 }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: 3 }}>
        <Box sx={{ display: 'flex', gap: 4, flexDirection: { xs: 'column', lg: 'row' } }}>
          {/* Left Sidebar - Order Summary */}
          <Box sx={{ flex: { xs: '1', lg: '0 0 400px' }, order: { xs: 2, lg: 1 } }}>
            <Card sx={{ position: { lg: 'sticky' }, top: 20 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                  Order Summary
                </Typography>

                {paymentDetails && (
                  <>
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        Service
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {paymentDetails.termName || 'Term Billing'}
                      </Typography>
                    </Box>

                    <Divider sx={{ my: 3 }} />

                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        Paying Today
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        ${paymentDetails.payingToday?.amount?.toFixed(2) || '0.00'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {paymentDetails.payingToday?.description || 'Initial charge'}
                      </Typography>
                    </Box>

                    <Divider sx={{ my: 3 }} />

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        Future Billing
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 500, mb: 0.5 }}>
                        Starting {paymentDetails.futurePayments?.startDate || 'Next month'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {paymentDetails.futurePayments?.description || 'Monthly billing'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Total lessons: {paymentDetails.futurePayments?.totalLessons || 0}
                      </Typography>
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Box>

          {/* Right Side - Payment Form */}
          <Box sx={{ flex: 1, order: { xs: 1, lg: 2 } }}>
            <Card>
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ maxWidth: 500, mx: 'auto' }}>
                  <Box sx={{ textAlign: 'center', mb: 4 }}>
                    <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
                      Complete Your Payment
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Enter your card details to set up monthly billing
                    </Typography>
                  </Box>

                  <Elements stripe={stripePromiseState}>
                    <CheckoutForm
                      paymentDetails={paymentDetails}
                      checkoutSessionId={checkoutSessionId}
                      stripeCustomerId={stripeCustomerId}
                      serviceId={serviceId}
                      submissionId={submissionId}
                      onSuccess={handleSuccess}
                      onError={handleError}
                    />
                  </Elements>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
