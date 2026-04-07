/**
 * Generate recommendations for improving booking form conversion
 * based on submission state and errors
 */
function generateRecommendations(submission) {
  const recommendations = [];
  const errors = [];
  
  // Check payment status
  const paymentStatus = submission.paymentStatus || submission.payment_status || 'pending';
  const stripeSessionId = submission.stripeSessionId || submission.stripe_session_id;
  const actualPrice = submission.actualPrice || submission.actual_price || 0;
  const tcClientId = submission.tcClientId || submission.tc_client_id;
  const tcServiceId = submission.tcServiceId || submission.tc_service_id;
  
  // Check for missing Stripe session
  if (paymentStatus === 'pending' && !stripeSessionId) {
    errors.push({
      type: 'checkout_session_missing',
      severity: 'high',
      message: 'No Stripe checkout session was created',
      timestamp: submission.createdAt || submission.created_at
    });
    
    recommendations.push({
      type: 'payment_flow',
      priority: 'high',
      title: 'Payment Redirect Issue',
      description: 'User completed the form but never reached the payment page. This suggests they may have closed the browser or encountered a redirect error.',
      actions: [
        'Check browser console for JavaScript errors',
        'Verify Stripe checkout session creation endpoint is working',
        'Consider adding a loading indicator during redirect',
        'Add retry mechanism for failed redirects'
      ],
      impact: 'High - Direct revenue loss'
    });
  }
  
  // Check for zero price
  if (actualPrice === 0 || actualPrice === null) {
    errors.push({
      type: 'invalid_price',
      severity: 'high',
      message: `Price is $${actualPrice} - should be at least $0.50`,
      timestamp: submission.createdAt || submission.created_at
    });
    
    recommendations.push({
      type: 'pricing',
      priority: 'high',
      title: 'Invalid Price Detected',
      description: 'Submission has a $0 price, which prevents Stripe checkout session creation.',
      actions: [
        'Review booking type pricing configuration',
        'Check price calculation logic',
        'Add validation to prevent $0 submissions',
        'Consider auto-correcting price from booking type default'
      ],
      impact: 'High - Prevents payment processing'
    });
  }
  
  // Check for incomplete form data
  const missingFields = [];
  if (!submission.signature || submission.signature === '') {
    missingFields.push('signature');
  }
  if (!submission.heardAbout || submission.heardAbout === '') {
    missingFields.push('heardAbout');
  }
  if (!submission.address?.street || submission.address?.street === '') {
    missingFields.push('address');
  }
  
  if (missingFields.length > 0 && paymentStatus === 'pending') {
    recommendations.push({
      type: 'form_completion',
      priority: 'medium',
      title: 'Incomplete Form Data',
      description: `Missing required fields: ${missingFields.join(', ')}. Form was submitted but may be incomplete.`,
      actions: [
        'Review form validation requirements',
        'Consider making some fields optional',
        'Add client-side validation before submission',
        'Send follow-up email to complete missing information'
      ],
      impact: 'Medium - May affect data quality'
    });
  }
  
  // Check for missing TutorCruncher integration
  if (paymentStatus === 'paid' && !tcClientId) {
    errors.push({
      type: 'client_creation_failed',
      severity: 'high',
      message: 'Payment completed but TutorCruncher client was not created',
      timestamp: submission.createdAt || submission.created_at
    });
    
    recommendations.push({
      type: 'integration',
      priority: 'high',
      title: 'TutorCruncher Integration Issue',
      description: 'Payment was successful but client was not created in TutorCruncher. Manual intervention required.',
      actions: [
        'Check TutorCruncher API connection',
        'Review payment processing logs',
        'Manually create client in TutorCruncher',
        'Investigate payment processing webhook'
      ],
      impact: 'High - Operational issue'
    });
  }
  
  // Check for missing service creation (for trial bookings)
  if (paymentStatus === 'paid' && submission.is_trial && !tcServiceId) {
    errors.push({
      type: 'service_creation_failed',
      severity: 'high',
      message: 'Payment completed but TutorCruncher service was not created',
      timestamp: submission.createdAt || submission.created_at
    });
    
    recommendations.push({
      type: 'integration',
      priority: 'high',
      title: 'Service Creation Failed',
      description: 'Payment was successful but service/job was not created in TutorCruncher for this trial booking.',
      actions: [
        'Check TutorCruncher API connection',
        'Review service creation logic',
        'Manually create service in TutorCruncher',
        'Verify booking type configuration'
      ],
      impact: 'High - Operational issue'
    });
  }
  
  // Check for old pending submissions
  const createdAt = new Date(submission.createdAt || submission.created_at);
  const hoursSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  
  if (paymentStatus === 'pending' && hoursSinceCreation > 24) {
    recommendations.push({
      type: 'follow_up',
      priority: 'medium',
      title: 'Stale Pending Submission',
      description: `This submission has been pending for ${Math.round(hoursSinceCreation)} hours. Consider following up with the parent.`,
      actions: [
        'Send follow-up email to parent',
        'Call parent to complete booking',
        'Check if they encountered technical issues',
        'Offer assistance with payment process'
      ],
      impact: 'Medium - Potential lost conversion'
    });
  }
  
  // Check for checkout session errors from database
  const checkoutErrors = submission.checkoutSessionErrors || submission.checkout_session_errors || [];
  if (checkoutErrors.length > 0) {
    errors.push(...checkoutErrors.map(err => ({
      ...err,
      type: 'checkout_session_error',
      severity: err.severity || 'high'
    })));
    
    recommendations.push({
      type: 'payment_flow',
      priority: 'high',
      title: 'Checkout Session Creation Errors',
      description: `${checkoutErrors.length} error(s) occurred while creating the Stripe checkout session.`,
      actions: [
        'Review Stripe API logs',
        'Check Stripe account configuration',
        'Verify payment amount is valid',
        'Test checkout session creation manually'
      ],
      impact: 'High - Prevents payment'
    });
  }
  
  // Check for payment processing errors
  const paymentErrors = submission.paymentErrors || submission.payment_errors || [];
  if (paymentErrors.length > 0) {
    errors.push(...paymentErrors.map(err => ({
      ...err,
      type: 'payment_processing_error',
      severity: err.severity || 'high'
    })));
    
    recommendations.push({
      type: 'payment_flow',
      priority: 'high',
      title: 'Payment Processing Errors',
      description: `${paymentErrors.length} error(s) occurred during payment processing.`,
      actions: [
        'Review payment processing logs',
        'Check Stripe webhook configuration',
        'Verify TutorCruncher API connection',
        'Review error details for specific issues'
      ],
      impact: 'High - Payment may have failed'
    });
  }
  
  // Generate summary
  const hasErrors = errors.length > 0;
  const hasHighPriorityRecommendations = recommendations.some(r => r.priority === 'high');
  
  let summary = '';
  if (hasErrors) {
    summary = `${errors.length} error(s) detected. `;
  }
  if (hasHighPriorityRecommendations) {
    summary += `${recommendations.filter(r => r.priority === 'high').length} high-priority recommendation(s) for improvement.`;
  } else if (recommendations.length > 0) {
    summary += `${recommendations.length} recommendation(s) for improvement.`;
  } else {
    summary = 'No issues detected. Submission appears to be processing normally.';
  }
  
  return {
    errors,
    recommendations,
    summary,
    hasErrors,
    hasRecommendations: recommendations.length > 0,
    priority: hasHighPriorityRecommendations ? 'high' : recommendations.length > 0 ? 'medium' : 'low'
  };
}

module.exports = { generateRecommendations };

