const {
  SA_RETAIL_CHART_OF_ACCOUNTS,
  SA_DEFAULT_VAT_RATES,
  SA_DEFAULT_VAT_RATE_ID,
} = require('./chartOfAccounts');
const { PHASE2_ACCOUNTS } = require('./ensureAccounts');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function buildPeriod(year, month1to12) {
  const id = `${year}-${pad2(month1to12)}`;
  const startDate = `${id}-01`;
  const endDate = `${id}-${pad2(daysInMonth(year, month1to12))}`;
  return {
    id,
    label: new Date(year, month1to12 - 1, 1).toLocaleString('en-ZA', {
      month: 'short',
      year: 'numeric',
    }),
    startDate,
    endDate,
    status: 'open',
    fiscalYear: year,
  };
}

async function bootstrapFinance(db, admin, { uid, fiscalYear, periodMonth }) {
  const settingsRef = db.collection('financeSettings').doc('default');
  const existing = await settingsRef.get();
  if (existing.exists && existing.data().bootstrappedAt) {
    const err = new Error('Finance already bootstrapped.');
    err.code = 'already-exists';
    throw err;
  }

  const now = new Date();
  const year = fiscalYear || now.getFullYear();
  const month = periodMonth || now.getMonth() + 1;
  const period = buildPeriod(year, month);

  const batch = db.batch();

  for (const acct of SA_RETAIL_CHART_OF_ACCOUNTS) {
    const ref = db.collection('accounts').doc(acct.code);
    batch.set(ref, {
      ...acct,
      balanceCents: 0,
      vatRateId: acct.vatRateId || null,
      systemTag: acct.systemTag || null,
      subtype: acct.subtype || null,
    });
  }

  batch.set(db.collection('periods').doc(period.id), {
    label: period.label,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    fiscalYear: period.fiscalYear,
  });

  batch.set(settingsRef, {
    currency: 'ZAR',
    valuationMethod: 'weighted_average',
    fiscalYearStartMonth: 3, // SA common Mar FY start — confirm with accountant
    sellPricesVatInclusive: true,
    vatRates: SA_DEFAULT_VAT_RATES,
    defaultVatRateId: SA_DEFAULT_VAT_RATE_ID,
    bootstrappedAt: admin.firestore.FieldValue.serverTimestamp(),
    bootstrappedByUid: uid,
  });

  batch.set(db.collection('documentSequences').doc('journal'), {
    nextNumber: 1,
  });
  batch.set(db.collection('documentSequences').doc('posSale'), {
    nextNumber: 1,
  });
  for (const name of [
    'purchaseOrder',
    'goodsReceipt',
    'supplierBill',
    'supplierPayment',
    'bankStatement',
  ]) {
    batch.set(db.collection('documentSequences').doc(name), { nextNumber: 1 });
  }

  // Ensure Phase 2 tags exist even if CoA array is older
  for (const acct of PHASE2_ACCOUNTS) {
    const ref = db.collection('accounts').doc(acct.code);
    batch.set(ref, acct, { merge: true });
  }

  batch.set(db.collection('financeAudit').doc(), {
    type: 'finance_bootstrapped',
    periodId: period.id,
    accounts: SA_RETAIL_CHART_OF_ACCOUNTS.length,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
  });

  await batch.commit();

  return {
    accounts: SA_RETAIL_CHART_OF_ACCOUNTS.length,
    periodId: period.id,
  };
}

module.exports = { bootstrapFinance, buildPeriod };
