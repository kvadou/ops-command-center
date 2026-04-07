const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const router = express.Router();
const { pool, stripe, auth } = global;
const { logger } = require('../utils/logger');

// GET /api/client-billing/:clientId/payment-methods - Get Stripe payment methods for a client
router.get('/:clientId/payment-methods', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const locationPool = req.locationPool || pool;

    // Get client email to find Stripe customer
    const clientQuery = `
      SELECT email, first_name, last_name
      FROM clients
      WHERE client_id::text = $1
      LIMIT 1
    `;
    const { rows: clients } = await locationPool.query(clientQuery, [String(clientId)]);
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clients[0];
    const clientEmail = client.email;

    if (!clientEmail) {
      return res.json({
        stripeCustomerId: null,
        paymentMethods: [],
        defaultPaymentMethod: null,
        message: 'Client has no email address'
      });
    }

    // Try to find Stripe customer ID from booking_submissions first
    let stripeCustomerId = null;
    try {
      const bookingQuery = `
        SELECT DISTINCT stripe_customer_id
        FROM booking_submissions
        WHERE (parent_email = $1 OR parent_email = $2)
        AND stripe_customer_id IS NOT NULL
        LIMIT 1
      `;
      const { rows: bookings } = await locationPool.query(bookingQuery, [clientEmail, clientEmail.toLowerCase()]);
      if (bookings.length > 0 && bookings[0].stripe_customer_id) {
        stripeCustomerId = bookings[0].stripe_customer_id;
      }
    } catch (err) {
      logger.info({ error: err.message }, 'Could not query booking_submissions for Stripe customer ID');
    }

    // If not found in booking_submissions, search Stripe by email
    if (!stripeCustomerId) {
      try {
        if (!stripe) {
          logger.error('Stripe is not initialized');
          return res.status(500).json({ 
            error: 'Stripe service not available',
            message: 'Stripe API key not configured'
          });
        }
        const customers = await stripe.customers.list({
          email: clientEmail,
          limit: 1
        });
        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0].id;
        }
      } catch (stripeError) {
        logger.error({ error: stripeError.message }, 'Error searching Stripe for customer');
        // Don't fail the request if Stripe lookup fails - just log it
        // The user will see "No Stripe customer found" which is acceptable
      }
    }

    if (!stripeCustomerId) {
      return res.json({
        stripeCustomerId: null,
        paymentMethods: [],
        defaultPaymentMethod: null,
        message: 'No Stripe customer found for this client'
      });
    }

    // Get payment methods from Stripe
    let paymentMethods = [];
    let defaultPaymentMethod = null;
    let customer = null;

    try {
      // Get customer to find default payment method
      customer = await stripe.customers.retrieve(stripeCustomerId);
      const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method || customer.default_source;

      // Get all payment methods for this customer
      const paymentMethodsList = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: 'card'
      });

      paymentMethods = paymentMethodsList.data.map(pm => {
        const isDefault = pm.id === defaultPaymentMethodId || 
                         (defaultPaymentMethodId && typeof defaultPaymentMethodId === 'string' && pm.id === defaultPaymentMethodId);
        
        if (isDefault) {
          defaultPaymentMethod = pm;
        }

        return {
          id: pm.id,
          type: pm.type,
          card: pm.card ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            exp_month: pm.card.exp_month,
            exp_year: pm.card.exp_year,
            funding: pm.card.funding
          } : null,
          billing_details: pm.billing_details,
          isDefault: isDefault,
          created: new Date(pm.created * 1000).toISOString()
        };
      });

      // If we have a default source (legacy), add it
      if (customer.default_source && typeof customer.default_source === 'string') {
        try {
          const source = await stripe.customers.retrieveSource(stripeCustomerId, customer.default_source);
          if (source && source.type === 'card') {
            const isAlreadyIncluded = paymentMethods.some(pm => pm.id === source.id);
            if (!isAlreadyIncluded) {
              paymentMethods.push({
                id: source.id,
                type: 'card',
                card: {
                  brand: source.brand,
                  last4: source.last4,
                  exp_month: source.exp_month,
                  exp_year: source.exp_year,
                  funding: source.funding
                },
                billing_details: {
                  name: source.name,
                  email: source.email,
                  address: source.address
                },
                isDefault: true,
                created: new Date(source.created * 1000).toISOString()
              });
              defaultPaymentMethod = {
                id: source.id,
                type: 'card',
                card: source
              };
            }
          }
        } catch (sourceError) {
          logger.info({ error: sourceError.message }, 'Could not retrieve default source');
        }
      }

    } catch (stripeError) {
      logger.error({ error: stripeError.message }, 'Error fetching Stripe payment methods');
      return res.status(500).json({ 
        error: 'Failed to fetch payment methods from Stripe',
        details: stripeError.message 
      });
    }

    res.json({
      stripeCustomerId,
      paymentMethods,
      defaultPaymentMethod: defaultPaymentMethod ? {
        id: defaultPaymentMethod.id,
        type: defaultPaymentMethod.type,
        card: defaultPaymentMethod.card
      } : null,
      defaultPaymentMethodType: customer?.invoice_settings?.default_payment_method ? 'payment_method' : 'source'
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching client payment methods');
    res.status(500).json({ error: 'Failed to fetch payment methods', details: error.message });
  }
}));

// GET /api/client-billing/:clientId/default-payment-method - Get default payment method info
router.get('/:clientId/default-payment-method', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const locationPool = req.locationPool || pool;

    // Get client email
    const clientQuery = `
      SELECT email
      FROM clients
      WHERE client_id::text = $1
      LIMIT 1
    `;
    const { rows: clients } = await locationPool.query(clientQuery, [String(clientId)]);
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const clientEmail = clients[0].email;
    if (!clientEmail) {
      return res.json({ defaultPaymentMethod: null, message: 'Client has no email' });
    }

    // Find Stripe customer (same logic as above)
    let stripeCustomerId = null;
    try {
      const bookingQuery = `
        SELECT DISTINCT stripe_customer_id
        FROM booking_submissions
        WHERE (parent_email = $1 OR parent_email = $2)
        AND stripe_customer_id IS NOT NULL
        LIMIT 1
      `;
      const { rows: bookings } = await locationPool.query(bookingQuery, [clientEmail, clientEmail.toLowerCase()]);
      if (bookings.length > 0 && bookings[0].stripe_customer_id) {
        stripeCustomerId = bookings[0].stripe_customer_id;
      }
    } catch (err) {
      // Ignore
    }

    if (!stripeCustomerId) {
      try {
        const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0].id;
        }
      } catch (stripeError) {
        // Ignore
      }
    }

    if (!stripeCustomerId) {
      return res.json({ defaultPaymentMethod: null, message: 'No Stripe customer found' });
    }

    // Get customer to find default payment method
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method || customer.default_source;

    if (!defaultPaymentMethodId) {
      return res.json({ defaultPaymentMethod: null, message: 'No default payment method set' });
    }

    let defaultPaymentMethod = null;

    // Try as payment method first
    if (customer.invoice_settings?.default_payment_method) {
      try {
        const pm = await stripe.paymentMethods.retrieve(defaultPaymentMethodId);
        defaultPaymentMethod = {
          id: pm.id,
          type: pm.type,
          card: pm.card,
          billing_details: pm.billing_details,
          methodType: 'payment_method'
        };
      } catch (pmError) {
        // Try as source
        try {
          const source = await stripe.customers.retrieveSource(stripeCustomerId, defaultPaymentMethodId);
          if (source && source.type === 'card') {
            defaultPaymentMethod = {
              id: source.id,
              type: 'card',
              card: source,
              billing_details: {
                name: source.name,
                email: source.email,
                address: source.address
              },
              methodType: 'source'
            };
          }
        } catch (sourceError) {
          // Ignore
        }
      }
    } else if (customer.default_source) {
      // Legacy source
      try {
        const source = await stripe.customers.retrieveSource(stripeCustomerId, customer.default_source);
        if (source && source.type === 'card') {
          defaultPaymentMethod = {
            id: source.id,
            type: 'card',
            card: source,
            billing_details: {
              name: source.name,
              email: source.email,
              address: source.address
            },
            methodType: 'source'
          };
        }
      } catch (sourceError) {
        // Ignore
      }
    }

    res.json({
      stripeCustomerId,
      defaultPaymentMethod,
      defaultPaymentMethodType: customer.invoice_settings?.default_payment_method ? 'payment_method' : 'source'
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching default payment method');
    res.status(500).json({ error: 'Failed to fetch default payment method', details: error.message });
  }
}));

module.exports = router;

