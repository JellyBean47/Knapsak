const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { bootstrapFinance } = require('./bootstrap');
const { postJournalEntry } = require('./posting');
const { requirePosRole, POS_ROLES } = require('./roles');
const { openTill, closeTill, findOpenTillSession } = require('./till');
const { postPosSale } = require('./posSale');
const { postPosReturn } = require('./posReturn');
const { exportFinancePack } = require('./exportPack');
const { ensurePhase2Accounts } = require('./ensureAccounts');
const {
  upsertSupplier,
  createPurchaseOrder,
  postGoodsReceipt,
  postSupplierBillFromGrn,
  paySupplierBill,
} = require('./purchasing');
const { importBankStatement, reconcileBankLine } = require('./banking');
const {
  upsertCustomer,
  postCustomerInvoice,
  receiveCustomerPayment,
} = require('./receivables');
const { postPurchaseReturn } = require('./purchaseReturn');
const { closePeriod, closeFiscalYear } = require('./periodsClose');
const { recordInvoiceReminder } = require('./reminders');

function mapError(error) {
  const code = error.code || 'internal';
  const allowed = new Set([
    'invalid-argument',
    'failed-precondition',
    'already-exists',
    'permission-denied',
    'not-found',
    'unauthenticated',
  ]);
  if (allowed.has(code)) {
    return new HttpsError(code, error.message);
  }
  console.error(error);
  return new HttpsError('internal', error.message || 'Internal error.');
}

function db() {
  return admin.firestore();
}

exports.bootstrapFinance = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner']);
    return await bootstrapFinance(db(), admin, {
      uid: request.auth.uid,
      fiscalYear: request.data?.fiscalYear,
      periodMonth: request.data?.periodMonth,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.postJournal = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'accountant']);
    return await postJournalEntry(db(), admin, {
      date: request.data?.date,
      memo: request.data?.memo,
      source: request.data?.source || 'manual',
      sourceRef: request.data?.sourceRef,
      lines: request.data?.lines,
      uid: request.auth.uid,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.upsertInventoryItem = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager']);
    const data = request.data || {};
    const id = typeof data.id === 'string' && data.id.trim()
      ? data.id.trim().toLowerCase()
      : null;
    const sku = typeof data.sku === 'string' ? data.sku.trim() : '';
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const sellPriceCents = data.sellPriceCents;
    const avgCostCents = data.avgCostCents;
    const qtyOnHand = data.qtyOnHand;
    const vatRateId = data.vatRateId || 'za-std-15';

    if (!id || !sku || !name) {
      throw Object.assign(new Error('id, sku, and name are required.'), {
        code: 'invalid-argument',
      });
    }
    if (!Number.isInteger(sellPriceCents) || sellPriceCents < 0) {
      throw Object.assign(new Error('sellPriceCents must be a non-negative integer.'), {
        code: 'invalid-argument',
      });
    }
    if (!Number.isInteger(avgCostCents) || avgCostCents < 0) {
      throw Object.assign(new Error('avgCostCents must be a non-negative integer.'), {
        code: 'invalid-argument',
      });
    }
    if (!Number.isInteger(qtyOnHand)) {
      throw Object.assign(new Error('qtyOnHand must be an integer.'), {
        code: 'invalid-argument',
      });
    }

    const stockValueCents = qtyOnHand * avgCostCents;
    const ref = db().collection('inventoryItems').doc(id);
    await ref.set(
      {
        sku,
        name,
        barcode: data.barcode || null,
        categoryId: data.categoryId || null,
        sellPriceCents,
        avgCostCents,
        qtyOnHand,
        stockValueCents,
        vatRateId,
        trackStock: data.trackStock !== false,
        isActive: data.isActive !== false,
        catalogProductId: data.catalogProductId || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await db().collection('financeAudit').add({
      type: 'inventory_upsert',
      itemId: id,
      qtyOnHand,
      avgCostCents,
      stockValueCents,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: request.auth.uid,
    });

    return { id };
  } catch (error) {
    throw mapError(error);
  }
});

exports.openTill = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'cashier']);
    return await openTill(db(), admin, {
      uid: request.auth.uid,
      openingFloatCents: request.data?.openingFloatCents ?? 0,
      registerId: request.data?.registerId,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.closeTill = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'cashier']);
    return await closeTill(db(), admin, {
      uid: request.auth.uid,
      tillSessionId: request.data?.tillSessionId,
      countedCashCents: request.data?.countedCashCents,
      note: request.data?.note,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.getOpenTill = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'cashier', 'accountant']);
    const session = await findOpenTillSession(db());
    if (!session) return { session: null };
    const { ref, ...data } = session;
    return { session: { id: session.id, ...data } };
  } catch (error) {
    throw mapError(error);
  }
});

exports.postPosSale = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'cashier']);
    return await postPosSale(db(), admin, {
      uid: request.auth.uid,
      tillSessionId: request.data?.tillSessionId,
      tender: request.data?.tender,
      lines: request.data?.lines,
      date: request.data?.date,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.postPosReturn = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'cashier']);
    return await postPosReturn(db(), admin, {
      uid: request.auth.uid,
      tillSessionId: request.data?.tillSessionId,
      saleId: request.data?.saleId,
      lines: request.data?.lines,
      date: request.data?.date,
      note: request.data?.note,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.exportFinancePack = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'accountant']);
    return await exportFinancePack(db(), {
      startDate: request.data?.startDate,
      endDate: request.data?.endDate,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.ensurePhase2Accounts = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'accountant']);
    const created = await ensurePhase2Accounts(db());
    return { created };
  } catch (error) {
    throw mapError(error);
  }
});

exports.upsertSupplier = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager']);
    return await upsertSupplier(db(), admin, {
      uid: request.auth.uid,
      supplier: request.data || {},
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.createPurchaseOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager']);
    return await createPurchaseOrder(db(), admin, {
      uid: request.auth.uid,
      supplierId: request.data?.supplierId,
      lines: request.data?.lines,
      notes: request.data?.notes,
      orderDate: request.data?.orderDate,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.postGoodsReceipt = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager']);
    return await postGoodsReceipt(db(), admin, {
      uid: request.auth.uid,
      purchaseOrderId: request.data?.purchaseOrderId,
      lines: request.data?.lines,
      date: request.data?.date,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.postSupplierBillFromGrn = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'accountant']);
    return await postSupplierBillFromGrn(db(), admin, {
      uid: request.auth.uid,
      goodsReceiptId: request.data?.goodsReceiptId,
      supplierInvoiceRef: request.data?.supplierInvoiceRef,
      billDate: request.data?.billDate,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.paySupplierBill = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'accountant']);
    return await paySupplierBill(db(), admin, {
      uid: request.auth.uid,
      billId: request.data?.billId,
      amountCents: request.data?.amountCents,
      tender: request.data?.tender,
      date: request.data?.date,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.importBankStatement = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'accountant']);
    return await importBankStatement(db(), admin, {
      uid: request.auth.uid,
      lines: request.data?.lines,
      statementDate: request.data?.statementDate,
      label: request.data?.label,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.reconcileBankLine = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'accountant']);
    return await reconcileBankLine(db(), admin, {
      uid: request.auth.uid,
      bankLineId: request.data?.bankLineId,
      matchType: request.data?.matchType,
      matchRef: request.data?.matchRef,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.upsertCustomer = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager']);
    return await upsertCustomer(db(), admin, {
      uid: request.auth.uid,
      customer: request.data || {},
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.postCustomerInvoice = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'accountant']);
    return await postCustomerInvoice(db(), admin, {
      uid: request.auth.uid,
      customerId: request.data?.customerId,
      lines: request.data?.lines,
      invoiceDate: request.data?.invoiceDate,
      dueDate: request.data?.dueDate,
      notes: request.data?.notes,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.receiveCustomerPayment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'accountant']);
    return await receiveCustomerPayment(db(), admin, {
      uid: request.auth.uid,
      invoiceId: request.data?.invoiceId,
      amountCents: request.data?.amountCents,
      tender: request.data?.tender,
      date: request.data?.date,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.postPurchaseReturn = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager']);
    return await postPurchaseReturn(db(), admin, {
      uid: request.auth.uid,
      goodsReceiptId: request.data?.goodsReceiptId,
      lines: request.data?.lines,
      date: request.data?.date,
      note: request.data?.note,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.closePeriod = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'accountant']);
    return await closePeriod(db(), admin, {
      uid: request.auth.uid,
      periodId: request.data?.periodId,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.closeFiscalYear = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner']);
    return await closeFiscalYear(db(), admin, {
      uid: request.auth.uid,
      fiscalYear: request.data?.fiscalYear,
      asOfDate: request.data?.asOfDate,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.recordInvoiceReminder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner', 'manager', 'accountant']);
    return await recordInvoiceReminder(db(), admin, {
      uid: request.auth.uid,
      invoiceId: request.data?.invoiceId,
      channel: request.data?.channel,
      note: request.data?.note,
    });
  } catch (error) {
    throw mapError(error);
  }
});

exports.setPosRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  try {
    requirePosRole(request.auth, ['owner']);
    const email = request.data?.email;
    if (typeof email !== 'string' || !email.includes('@')) {
      throw Object.assign(new Error('A valid email is required.'), {
        code: 'invalid-argument',
      });
    }

    const posRole = request.data?.posRole;
    if (posRole !== null && posRole !== undefined && !POS_ROLES.has(posRole)) {
      throw Object.assign(
        new Error("posRole must be owner|manager|cashier|accountant or null."),
        { code: 'invalid-argument' },
      );
    }

    const user = await admin.auth().getUserByEmail(email.trim());
    const claims = { ...(user.customClaims || {}) };
    if (posRole) {
      claims.posRole = posRole;
    } else {
      delete claims.posRole;
    }
    await admin.auth().setCustomUserClaims(user.uid, claims);
    return {
      uid: user.uid,
      email: user.email,
      posRole: posRole || null,
    };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', `No user with email ${request.data?.email}.`);
    }
    throw mapError(error);
  }
});
