import React, { useEffect, useState } from "react";
import { useSearchParams, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Divider,
  CircularProgress,
} from "@mui/material";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

export default function SuccessPage() {
  const [search] = useSearchParams();
  // Handle both camelCase (submissionId) and snake_case (submission_id) parameter names
  const submissionId = search.get("submissionId") || search.get("submission_id");
  const stripeSessionId = search.get("session_id");
  const paymentType = search.get("type"); // 'term_payment' or 'subscription'
  const lastBookingUrl =
    sessionStorage.getItem("lastBookingUrl") || "/booking-forms/frontend";
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState(null);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);
  // Track whether we've already fired the conversion event (prevent double-firing)
  const conversionFiredRef = React.useRef(false);

  // Fire Google Ads + Meta conversion event when payment data is confirmed
  useEffect(() => {
    if (!d || conversionFiredRef.current) return;
    if (d.payment_status !== 'paid') return;

    conversionFiredRef.current = true;

    const value = parseFloat(d.actual_price || 0);
    const transactionId = String(submissionId || '');
    const bookingType = d.booking_type || d.label_name || '';

    try {
      // Push to GTM dataLayer — GTM container GTM-KC2BXWF2 picks this up
      // Set up a Google Ads Conversion tag in GTM triggered by event = 'purchase'
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'purchase',
        ecommerce: {
          transaction_id: transactionId,
          value: value,
          currency: 'USD',
          items: [{
            item_name: bookingType,
            item_category: 'chess_tutoring',
            price: value,
            quantity: 1,
          }],
        },
        // Flat fields for simpler GTM variable mapping
        conversion_value: value,
        conversion_currency: 'USD',
        conversion_transaction_id: transactionId,
      });

      // Also fire gtag directly as a fallback (works even without GTM tag setup)
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', {
          send_to: 'AW-' + (window._googleAdsConversionId || ''),
          value: value,
          currency: 'USD',
          transaction_id: transactionId,
        });
      }
    } catch (e) {
      console.error('Error firing conversion event:', e);
    }
  }, [d, submissionId]);

  useEffect(() => {
    // For subscription flows, we might only have session_id (setup mode)
    // For regular booking flows, we need both submissionId and session_id
    if (!stripeSessionId) {
      console.error("Missing session_id");
      setLoading(false);
      return;
    }
    
    // If no submissionId, fetch subscription details from Stripe session
    if (!submissionId) {
      console.log("No submissionId provided - fetching subscription details from session");
      setLoading(true);
      setBackgroundProcessing(true);
      
      fetch(`/api/subscriptions/session/${stripeSessionId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && (data.type === 'subscription' || data.type === 'term_payment')) {
            setSubscriptionData(data);
            console.log(`✅ Fetched ${data.type} details:`, data);
            
            // If enrollment doesn't exist yet, keep background processing indicator
            if (!data.enrollment) {
              console.log("⚠️ Enrollment not yet created, setup may still be processing");
              // Poll for enrollment status (check every 5 seconds for up to 30 seconds)
              let pollCount = 0;
              const maxPolls = 6;
              const pollInterval = setInterval(() => {
                pollCount++;
                fetch(`/api/subscriptions/session/${stripeSessionId}`)
                  .then((r) => r.json())
                  .then((updatedData) => {
                    if (updatedData.success && updatedData.enrollment) {
                      console.log("✅ Enrollment created:", updatedData.enrollment);
                      setSubscriptionData(updatedData);
                      setBackgroundProcessing(false);
                      clearInterval(pollInterval);
                    } else if (pollCount >= maxPolls) {
                      console.log("⏱️ Stopped polling after 30 seconds - attempting manual completion");
                      clearInterval(pollInterval);
                      setBackgroundProcessing(true);
                      
                      // Determine which endpoint to call based on payment type
                      const isTermPayment = data.type === 'term_payment';
                      const completionEndpoint = isTermPayment 
                        ? `/api/subscriptions/complete-term-payment/${stripeSessionId}`
                        : `/api/subscriptions/complete-setup/${stripeSessionId}`;
                      
                      console.log(`🔄 Attempting manual completion via ${completionEndpoint}`);
                      
                      // Try to manually complete subscription setup or term payment as fallback
                      fetch(completionEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      })
                        .then((r) => r.json())
                        .then((completionData) => {
                          if (completionData.success && completionData.enrollment) {
                            console.log(`✅ ${isTermPayment ? 'Term payment' : 'Subscription setup'} completed manually:`, completionData.enrollment);
                            // Fetch updated session data
                            return fetch(`/api/subscriptions/session/${stripeSessionId}`);
                          } else {
                            console.error("❌ Manual completion failed:", completionData.error);
                            setBackgroundProcessing(false);
                            throw new Error(completionData.error || 'Manual completion failed');
                          }
                        })
                        .then((r) => r?.json())
                        .then((finalData) => {
                          if (finalData?.success) {
                            setSubscriptionData(finalData);
                          }
                          setBackgroundProcessing(false);
                        })
                        .catch((completionError) => {
                          console.error("Error completing payment manually:", completionError);
                          setBackgroundProcessing(false);
                        });
                    }
                  })
                  .catch((pollError) => {
                    console.error("Error polling enrollment status:", pollError);
                    if (pollCount >= maxPolls) {
                      setBackgroundProcessing(false);
                      clearInterval(pollInterval);
                    }
                  });
              }, 5000);
            } else {
              setBackgroundProcessing(false);
            }
          } else {
            console.warn("Unexpected response from subscription session API:", data);
            setBackgroundProcessing(false);
          }
          setLoading(false);
        })
        .catch((error) => {
          console.error("Error fetching subscription details:", error);
          setLoading(false);
          setBackgroundProcessing(false);
        });
      return;
    }
    
    const storedData = sessionStorage.getItem(`submissionData-${submissionId}`);

    if (storedData) {
      // We have stored data, show it immediately
      setD(JSON.parse(storedData));
      setLoading(false);
      
      // Still process backend in background to update with latest data
      setBackgroundProcessing(true);
      
      // For term payments, check if enrollment exists and complete if needed
      if (paymentType === 'term_payment' && stripeSessionId) {
        // Check enrollment status first
        fetch(`/api/subscriptions/session/${stripeSessionId}`)
          .then((r) => r.json())
          .then((sessionData) => {
            if (sessionData.success && !sessionData.enrollment) {
              // Enrollment doesn't exist, trigger completion
              console.log("⚠️ Term payment enrollment not found - triggering completion");
              return fetch(`/api/subscriptions/complete-term-payment/${stripeSessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              })
                .then((r) => r.json())
                .then((completionData) => {
                  if (completionData.success) {
                    console.log("✅ Term payment completed successfully");
                  } else {
                    console.error("❌ Term payment completion failed:", completionData.error);
                  }
                })
                .catch((error) => {
                  console.error("Error completing term payment:", error);
                });
            }
          })
          .catch((error) => {
            console.error("Error checking enrollment status:", error);
          });
      }
      
      fetch(`/api/submissions/${submissionId}/payment-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      })
        .then(() => fetch(`/api/submissions/${submissionId}`))
        .then((r) => r.json())
        .then((data) => {
          setD(data);
          sessionStorage.setItem(
            `submissionData-${submissionId}`,
            JSON.stringify(data)
          );
        })
        .catch((error) => {
          console.error("Error updating payment status:", error);
        })
        .finally(() => {
          setBackgroundProcessing(false);
        });
    } else {
      // No stored data, show success immediately and fetch data in background
      setLoading(false);
      setBackgroundProcessing(true);
      
      // For term payments, check if enrollment exists and complete if needed
      if (paymentType === 'term_payment' && stripeSessionId) {
        // Check enrollment status first
        fetch(`/api/subscriptions/session/${stripeSessionId}`)
          .then((r) => r.json())
          .then((sessionData) => {
            if (sessionData.success && !sessionData.enrollment) {
              // Enrollment doesn't exist, trigger completion
              console.log("⚠️ Term payment enrollment not found - triggering completion");
              return fetch(`/api/subscriptions/complete-term-payment/${stripeSessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              })
                .then((r) => r.json())
                .then((completionData) => {
                  if (completionData.success) {
                    console.log("✅ Term payment completed successfully");
                  } else {
                    console.error("❌ Term payment completion failed:", completionData.error);
                  }
                })
                .catch((error) => {
                  console.error("Error completing term payment:", error);
                });
            }
          })
          .catch((error) => {
            console.error("Error checking enrollment status:", error);
          });
      }
      
      // Process payment status in background without blocking UI
      fetch(`/api/submissions/${submissionId}/payment-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      })
        .then(() => fetch(`/api/submissions/${submissionId}`))
        .then((r) => r.json())
        .then((data) => {
          setD(data);
          sessionStorage.setItem(
            `submissionData-${submissionId}`,
            JSON.stringify(data)
          );
        })
        .catch((error) => {
          console.error("Error updating payment status:", error);
        })
        .finally(() => {
          setBackgroundProcessing(false);
        });
    }
  }, [submissionId, stripeSessionId]);

  if (loading) {
    return (
      <Box textAlign="center" mt={12}>
        <CircularProgress />
        <Typography variant="h6" mt={2}>
          Confirming Your Booking… please do not close this window.
        </Typography>
      </Box>
    );
  }

  const {
    bookingType = "—",
    actualPrice = "0.00",
    students = [],
    slots = [],
    parentFirstName,
    parentLastName,
    parentEmail,
    paymentStatus = "",
  } = d || {};
  const price = parseFloat(actualPrice) || 0;
  const studentNames = students.map((s) => s.first).join(", ");
  const preferredDates = slots
    .filter((s) => s.date && s.start !== "-" && s.end !== "-")
    .map((s) => {
      // Parse the date without timezone conversion
      const dateParts = s.date.split('-');
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1; // JavaScript months are 0-indexed
      const day = parseInt(dateParts[2]);
      
      // Create date object in local timezone to avoid conversion
      const date = new Date(year, month, day);
      
      const dayName = date.toLocaleDateString(undefined, { weekday: "short" });
      const monthDay = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      
      return `${dayName} ${monthDay} at ${s.start} - ${s.end}`;
    })
    .join(", ");

  return (
    <Box
      sx={{
        minHeight: "100vh",
        py: 6,
        px: 2,
        backgroundImage: `url('https://cdn.prod.website-files.com/64d4e8b883dfdc36c02531c1/673cb1a1775d0cc1d68e4599_C%403Webbackground.jpg')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Box
        sx={{
          maxWidth: 600,
          mx: "auto",
          textAlign: "center",
          mb: 4,
        }}
      >
        <Box textAlign="center" mb={3}>
          <Box
            component="img"
            src="/logo512.png"
            alt="App Logo"
            sx={{ height: 64, mx: "auto", display: "block" }}
          />
        </Box>

        <CheckCircleIcon className="h-16 w-16 text-success-500" />
        <Typography variant="h2" mt={2} fontWeight="bold" color="white">
          {subscriptionData?.type === 'term_payment' 
            ? "Payment Successful!" 
            : submissionId 
              ? "Booking Confirmed!" 
              : subscriptionData?.enrollment 
                ? "Monthly Billing Active!" 
                : "Monthly Billing Setup Complete!"}
        </Typography>

        {subscriptionData?.type === 'term_payment' ? (
          <Typography color="white" mt={1}>
            Your full term payment has been processed successfully.
          </Typography>
        ) : submissionId ? (
          <>
            {paymentStatus === "verified" ? (
              <Typography color="white" mt={2}>
                Your payment authorization was successful and will be refunded
                shortly.
              </Typography>
            ) : (
              <Typography color="white" mt={1}>
                Your payment was successful.
              </Typography>
            )}
          </>
        ) : subscriptionData?.enrollment ? (
          <Typography color="white" mt={1}>
            Your monthly billing is active and billing has been set up successfully.
          </Typography>
        ) : (
          <Typography color="white" mt={1}>
            Your payment method has been saved. Your monthly billing will begin automatically.
          </Typography>
        )}
        
        {backgroundProcessing && (
          <Box mt={2} display="flex" alignItems="center" justifyContent="center" gap={1}>
            <CircularProgress size={16} sx={{ color: "white" }} />
            <Typography color="white" variant="body2">
              Finalizing your booking details...
            </Typography>
          </Box>
        )}
      </Box>

      {/* Show term payment details if available */}
      {subscriptionData?.type === 'term_payment' && subscriptionData?.payment ? (
        <Card
          variant="outlined"
          sx={{
            maxWidth: 600,
            mx: "auto",
            borderRadius: 2,
            boxShadow: 3,
            mb: 2,
          }}
        >
          <CardHeader
            title={subscriptionData.payment.termName || "Full Term Payment"}
            titleTypographyProps={{ variant: "h6", fontWeight: "medium" }}
            sx={{ bgcolor: "grey.100" }}
          />
          <Divider />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Amount Charged
                </Typography>
                <Typography variant="h5" fontWeight="bold" mb={2} color="success.main">
                  ${subscriptionData.payment.amount.toFixed(2)}
                </Typography>
              </Grid>
              
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Lessons Paid For
                </Typography>
                <Typography variant="body1" mb={1}>
                  {subscriptionData.payment.lessons} lesson{subscriptionData.payment.lessons !== 1 ? 's' : ''} 
                  {subscriptionData.payment.discountPercent > 0 && (
                    <span className="text-green-700 font-semibold">
                      {' '}({subscriptionData.payment.discountPercent}% discount applied)
                    </span>
                  )}
                </Typography>
                {subscriptionData.payment.totalLessons > subscriptionData.payment.lessons && (
                  <Typography variant="caption" color="text.secondary">
                    Out of {subscriptionData.payment.totalLessons} total lessons in term
                  </Typography>
                )}
              </Grid>
              
              {subscriptionData.payment.lessonDates && subscriptionData.payment.lessonDates.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Lesson Dates
                  </Typography>
                  <Box component="ul" sx={{ pl: 2, mb: 0 }}>
                    {subscriptionData.payment.lessonDates.map((date, index) => (
                      <li key={index}>
                        <Typography variant="body2">
                          {date}
                        </Typography>
                      </li>
                    ))}
                  </Box>
                </Grid>
              )}
              
              {subscriptionData.submission?.students?.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Students
                  </Typography>
                  <Typography variant="body1">
                    {subscriptionData.submission.students.map((s, i) => (
                      <span key={i}>
                        {s.first} {s.last}
                        {i < subscriptionData.submission.students.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </Typography>
                </Grid>
              )}
              
              {!subscriptionData.enrollment && (
                <Grid item xs={12}>
                  <Box sx={{ bgcolor: "info.light", p: 2, borderRadius: 1 }}>
                    <Typography variant="body2" color="info.dark">
                      Your enrollment is being processed. You'll receive a confirmation email shortly with all the details.
                    </Typography>
                  </Box>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      ) : subscriptionData?.subscription ? (
        <Card
          variant="outlined"
          sx={{
            maxWidth: 600,
            mx: "auto",
            borderRadius: 2,
            boxShadow: 3,
            mb: 2,
          }}
        >
          <CardHeader
            title={subscriptionData.subscription.termName || "Subscription"}
            titleTypographyProps={{ variant: "h6", fontWeight: "medium" }}
            sx={{ bgcolor: "grey.100" }}
          />
          <Divider />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Students
                </Typography>
                <Typography variant="body1" mb={2}>
                  {subscriptionData.submission?.students?.length > 0
                    ? subscriptionData.submission.students.map((s, i) => (
                        <span key={i}>
                          {s.first} {s.last}
                          {i < subscriptionData.submission.students.length - 1 ? ", " : ""}
                        </span>
                      ))
                    : subscriptionData.submission?.parentName || "—"}
                </Typography>
              </Grid>
              
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Paying Today
                </Typography>
                <Typography variant="body1" fontWeight="bold" mb={2}>
                  ${(subscriptionData.subscription.initialCharge?.amount || 0).toFixed(2)} for {subscriptionData.subscription.initialCharge?.lessons || 0} lesson{(subscriptionData.subscription.initialCharge?.lessons || 0) !== 1 ? 's' : ''} this month
                </Typography>
              </Grid>
              
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Future Monthly Payments
                </Typography>
                <Typography variant="body1" mb={2}>
                  Starting {subscriptionData.subscription.futurePayments?.startDate || subscriptionData.subscription.nextBillingDate}, billed monthly at ${(subscriptionData.subscription.futurePayments?.ratePerLesson || subscriptionData.subscription.ratePerLesson || 0).toFixed(2)} per lesson
                  <br />
                  <Typography variant="caption" color="text.secondary">
                    ({subscriptionData.subscription.futurePayments?.monthsRemaining || 0} months remaining, {subscriptionData.subscription.futurePayments?.totalLessons || subscriptionData.subscription.totalLessons || 0} lessons total)
                  </Typography>
                </Typography>
              </Grid>
              
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Class Dates
                </Typography>
                <Typography variant="body2" mb={2}>
                  {subscriptionData.subscription.classDates?.length > 0
                    ? subscriptionData.subscription.classDates.slice(0, 5).join(", ") +
                      (subscriptionData.subscription.classDates.length > 5
                        ? ` (+${subscriptionData.subscription.classDates.length - 5} more)`
                        : "")
                    : "—"}
                </Typography>
              </Grid>
              
              {!subscriptionData.enrollment && (
                <Grid item xs={12}>
                  <Box sx={{ bgcolor: "info.light", p: 2, borderRadius: 1 }}>
                    <Typography variant="body2" color="info.dark">
                      Your subscription is being set up. You'll receive a confirmation email shortly with all the details.
                    </Typography>
                  </Box>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      ) : submissionId && d ? (
        <Card
          variant="outlined"
          sx={{
            maxWidth: 600,
            mx: "auto",
            borderRadius: 2,
            boxShadow: 3,
          }}
        >
          <CardHeader
            title={`${bookingType}`}
            titleTypographyProps={{ variant: "h6", fontWeight: "medium" }}
            sx={{ bgcolor: "grey.100" }}
          />
          <Divider />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Price
                </Typography>
                <Typography variant="body1" mb={2}>
                  ${price.toFixed(2)}
                </Typography>

                <Typography variant="subtitle2" color="text.secondary">
                  Students
                </Typography>
                <Typography variant="body1" mb={2}>
                  {studentNames || "—"}
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle2" color="text.secondary">
                  Preferred Dates
                </Typography>
                <Typography variant="body1" mb={2}>
                  {preferredDates || "—"}
                </Typography>

                <Typography variant="body1">
                  We'll be in touch very soon to help you get started!
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      ) : subscriptionData?.type === 'term_payment' ? (
        <Card
          variant="outlined"
          sx={{
            maxWidth: 600,
            mx: "auto",
            borderRadius: 2,
            boxShadow: 3,
          }}
        >
          <CardContent>
            <Typography variant="body1" textAlign="center">
              Your payment has been processed successfully. You will receive a confirmation email shortly with all the details.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card
          variant="outlined"
          sx={{
            maxWidth: 600,
            mx: "auto",
            borderRadius: 2,
            boxShadow: 3,
          }}
        >
          <CardContent>
            <Typography variant="body1" textAlign="center">
              Your monthly billing has been set up successfully. You will receive a confirmation email shortly with all the details.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Box textAlign="center" mt={4}>
        <Button
          component={RouterLink}
          to={lastBookingUrl}
          variant="contained"
          size="large"
          sx={{ borderRadius: 3, px: 4 }}
        >
          Make another booking
        </Button>
      </Box>
    </Box>
  );
}
