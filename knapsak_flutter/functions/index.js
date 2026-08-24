const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const finance = require('./finance/callables');

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

admin.initializeApp();

// Finance-first POS / ERP (server-authoritative ledger)
exports.bootstrapFinance = finance.bootstrapFinance;
exports.postJournal = finance.postJournal;
exports.upsertInventoryItem = finance.upsertInventoryItem;
exports.setPosRole = finance.setPosRole;
exports.openTill = finance.openTill;
exports.closeTill = finance.closeTill;
exports.getOpenTill = finance.getOpenTill;
exports.postPosSale = finance.postPosSale;
exports.postPosReturn = finance.postPosReturn;
exports.exportFinancePack = finance.exportFinancePack;
exports.ensurePhase2Accounts = finance.ensurePhase2Accounts;
exports.upsertSupplier = finance.upsertSupplier;
exports.createPurchaseOrder = finance.createPurchaseOrder;
exports.postGoodsReceipt = finance.postGoodsReceipt;
exports.postSupplierBillFromGrn = finance.postSupplierBillFromGrn;
exports.paySupplierBill = finance.paySupplierBill;
exports.importBankStatement = finance.importBankStatement;
exports.reconcileBankLine = finance.reconcileBankLine;
exports.upsertCustomer = finance.upsertCustomer;
exports.postCustomerInvoice = finance.postCustomerInvoice;
exports.receiveCustomerPayment = finance.receiveCustomerPayment;
exports.postPurchaseReturn = finance.postPurchaseReturn;
exports.closePeriod = finance.closePeriod;
exports.closeFiscalYear = finance.closeFiscalYear;
exports.recordInvoiceReminder = finance.recordInvoiceReminder;

/**
 * Callable function — creates a Stripe PaymentIntent for checkout.
 *
 * Setup (requires Blaze plan):
 *   firebase functions:secrets:set STRIPE_SECRET_KEY
 *   firebase deploy --only functions
 *
 * Request data:
 *   { amount: number } — total in ZAR cents (e.g. 4599 for R45.99)
 */
exports.createPaymentIntent = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to pay.',
      );
    }

    const amount = request.data?.amount;
    if (!Number.isInteger(amount) || amount < 100) {
      throw new HttpsError(
        'invalid-argument',
        'Amount must be at least 100 cents (R1.00).',
      );
    }

    const stripe = new Stripe(stripeSecretKey.value());

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'zar',
        automatic_payment_methods: { enabled: true },
        metadata: {
          userId: request.auth.uid,
          userEmail: request.auth.token.email || '',
        },
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    } catch (error) {
      console.error('Stripe PaymentIntent creation failed', error);
      throw new HttpsError(
        'internal',
        error.message || 'Could not create payment.',
      );
    }
  },
);

/**
 * Callable — grant or revoke the supplier custom claim on a user.
 *
 * Only existing suppliers may call this. Bootstrap the first supplier with:
 *   node scripts/set-supplier-role.js <email>
 *
 * Request data:
 *   { email: string, role?: 'supplier' | null }
 *   role omitted or 'supplier' grants the claim; null/'' removes it.
 */
exports.setSupplierRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'You must be signed in.',
    );
  }

  if (request.auth.token.role !== 'supplier') {
    throw new HttpsError(
      'permission-denied',
      'Only suppliers can manage supplier roles.',
    );
  }

  const email = request.data?.email;
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new HttpsError(
      'invalid-argument',
      'A valid email is required.',
    );
  }

  const role = request.data?.role;
  const grant = role === undefined || role === 'supplier';
  if (!grant && role !== null && role !== '') {
    throw new HttpsError(
      'invalid-argument',
      "role must be 'supplier' or null.",
    );
  }

  try {
    const user = await admin.auth().getUserByEmail(email.trim());
    const claims = { ...(user.customClaims || {}) };
    if (grant) {
      claims.role = 'supplier';
    } else {
      delete claims.role;
    }
    await admin.auth().setCustomUserClaims(user.uid, claims);
    return {
      uid: user.uid,
      email: user.email,
      role: grant ? 'supplier' : null,
    };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', `No user with email ${email}.`);
    }
    console.error('setSupplierRole failed', error);
    throw new HttpsError(
      'internal',
      error.message || 'Could not update supplier role.',
    );
  }
});
