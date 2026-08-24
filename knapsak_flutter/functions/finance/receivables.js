const {
  readJournalPostingState,
  writeJournalPosting,
  readSeq,
  writeSeq,
  findOpenPeriod,
} = require('./posting');
const { loadTaggedAccounts, requireTag } = require('./accounts');
const { ensurePhase2Accounts } = require('./ensureAccounts');
const { splitInclusiveVat, todayInSA } = require('./money');

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function upsertCustomer(db, admin, { uid, customer }) {
  const name = typeof customer?.name === 'string' ? customer.name.trim() : '';
  if (!name) {
    throw Object.assign(new Error('Customer name is required.'), {
      code: 'invalid-argument',
    });
  }
  const id =
    typeof customer?.id === 'string' && customer.id.trim()
      ? customer.id.trim().toLowerCase()
      : db.collection('customers').doc().id;

  const payload = {
    name,
    email: typeof customer.email === 'string' ? customer.email.trim() : null,
    phone: typeof customer.phone === 'string' ? customer.phone.trim() : null,
    vatNumber: typeof customer.vatNumber === 'string' ? customer.vatNumber.trim() : null,
    paymentTermsDays: Number.isInteger(customer.paymentTermsDays)
      ? customer.paymentTermsDays
      : 30,
    isActive: customer.isActive !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: uid,
  };

  const ref = db.collection('customers').doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    payload.createdByUid = uid;
    payload.balanceCents = 0;
  }
  await ref.set(payload, { merge: true });
  return { id };
}

/**
 * Credit invoice: stock + COGS + VAT + Dr AR (like POS sale without till tender).
 */
async function postCustomerInvoice(db, admin, {
  uid,
  customerId,
  lines: rawLines,
  invoiceDate,
  dueDate: dueDateOverride,
  notes,
}) {
  if (!customerId || typeof customerId !== 'string') {
    throw Object.assign(new Error('customerId is required.'), {
      code: 'invalid-argument',
    });
  }
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw Object.assign(new Error('Invoice needs at least one line.'), {
      code: 'invalid-argument',
    });
  }

  const qtyByItem = new Map();
  for (const line of rawLines) {
    const itemId = typeof line?.itemId === 'string' ? line.itemId.trim() : '';
    const qty = line?.qty;
    if (!itemId || !Number.isInteger(qty) || qty <= 0) {
      throw Object.assign(new Error('Each line needs itemId and positive integer qty.'), {
        code: 'invalid-argument',
      });
    }
    qtyByItem.set(itemId, (qtyByItem.get(itemId) || 0) + qty);
  }

  const date =
    invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)
      ? invoiceDate
      : todayInSA();

  const customerSnap = await db.collection('customers').doc(customerId).get();
  if (!customerSnap.exists || customerSnap.data().isActive === false) {
    throw Object.assign(new Error('Customer not found or inactive.'), {
      code: 'not-found',
    });
  }
  const customer = customerSnap.data();
  const dueDate =
    dueDateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dueDateOverride)
      ? dueDateOverride
      : addDays(date, customer.paymentTermsDays || 30);

  const period = await findOpenPeriod(db, date);
  if (!period) {
    throw Object.assign(new Error(`No open period covers ${date}.`), {
      code: 'failed-precondition',
    });
  }

  const settingsSnap = await db.collection('financeSettings').doc('default').get();
  if (!settingsSnap.exists) {
    throw Object.assign(new Error('Finance not bootstrapped.'), {
      code: 'failed-precondition',
    });
  }
  const settings = settingsSnap.data();
  const vatRates = new Map(
    (settings.vatRates || []).map((r) => [r.id, r]),
  );
  const defaultVatRateId = settings.defaultVatRateId || 'za-std-15';

  const byTag = await loadTaggedAccounts(db);
  const arCode = requireTag(byTag, 'accounts_receivable');
  const salesCode = requireTag(byTag, 'sales');
  const vatCode = requireTag(byTag, 'vat_output');
  const cogsCode = requireTag(byTag, 'cogs');
  const inventoryCode = requireTag(byTag, 'inventory');

  const customerRef = db.collection('customers').doc(customerId);
  const invoiceRef = db.collection('customerInvoices').doc();
  const journalRef = db.collection('journals').doc();
  const itemIds = [...qtyByItem.keys()];
  let result;

  await db.runTransaction(async (tx) => {
    const itemSnaps = [];
    for (const itemId of itemIds) {
      itemSnaps.push(await tx.get(db.collection('inventoryItems').doc(itemId)));
    }
    const custSnap = await tx.get(customerRef);

    const invoiceLines = [];
    let totalCents = 0;
    let exVatTotal = 0;
    let vatTotal = 0;
    let cogsTotal = 0;

    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const qty = qtyByItem.get(itemId);
      const snap = itemSnaps[i];
      if (!snap.exists) {
        throw Object.assign(new Error(`Unknown item ${itemId}.`), {
          code: 'not-found',
        });
      }
      const item = snap.data();
      if (item.isActive === false) {
        throw Object.assign(new Error(`Item ${item.sku || itemId} is inactive.`), {
          code: 'failed-precondition',
        });
      }
      if (item.trackStock !== false && item.qtyOnHand < qty) {
        throw Object.assign(
          new Error(
            `Insufficient stock for ${item.sku || item.name} (have ${item.qtyOnHand}, need ${qty}).`,
          ),
          { code: 'failed-precondition' },
        );
      }

      const unitPrice = item.sellPriceCents || 0;
      const lineTotal = unitPrice * qty;
      const rateId = item.vatRateId || defaultVatRateId;
      const rate = vatRates.get(rateId) || { rateBps: 1500 };
      const { exVatCents, vatCents } = splitInclusiveVat(lineTotal, rate.rateBps || 0);
      const unitCost = item.avgCostCents || 0;
      const cogsCents = unitCost * qty;

      invoiceLines.push({
        itemId,
        sku: item.sku,
        name: item.name,
        qty,
        unitPriceCents: unitPrice,
        lineTotalCents: lineTotal,
        vatRateId: rateId,
        exVatCents,
        vatCents,
        unitCostCents: unitCost,
        cogsCents,
      });

      totalCents += lineTotal;
      exVatTotal += exVatCents;
      vatTotal += vatCents;
      cogsTotal += cogsCents;
    }

    if (totalCents <= 0) {
      throw Object.assign(new Error('Invoice total must be positive.'), {
        code: 'invalid-argument',
      });
    }

    const journalLines = [
      {
        accountCode: arCode,
        debitCents: totalCents,
        creditCents: 0,
        memo: 'Accounts receivable',
      },
      {
        accountCode: salesCode,
        debitCents: 0,
        creditCents: exVatTotal,
        memo: 'Sales ex VAT',
      },
    ];
    if (vatTotal > 0) {
      journalLines.push({
        accountCode: vatCode,
        debitCents: 0,
        creditCents: vatTotal,
        memo: 'VAT output',
      });
    }
    if (cogsTotal > 0) {
      journalLines.push(
        {
          accountCode: cogsCode,
          debitCents: cogsTotal,
          creditCents: 0,
          memo: 'Cost of sales',
        },
        {
          accountCode: inventoryCode,
          debitCents: 0,
          creditCents: cogsTotal,
          memo: 'Inventory relief',
        },
      );
    }

    const invSeq = await readSeq(tx, db, 'customerInvoice');
    const journalState = await readJournalPostingState(tx, db, journalLines);

    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const qty = qtyByItem.get(itemId);
      const item = itemSnaps[i].data();
      const line = invoiceLines.find((l) => l.itemId === itemId);
      if (item.trackStock !== false) {
        const qtyAfter = (item.qtyOnHand || 0) - qty;
        const avgCost = item.avgCostCents || 0;
        tx.update(db.collection('inventoryItems').doc(itemId), {
          qtyOnHand: qtyAfter,
          stockValueCents: qtyAfter * avgCost,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(db.collection('stockMovements').doc(), {
          itemId,
          type: 'sale',
          qtyDelta: -qty,
          unitCostCents: avgCost,
          stockValueDeltaCents: -(line.cogsCents),
          avgCostAfterCents: avgCost,
          qtyAfter,
          source: 'customer_invoice',
          sourceRef: invoiceRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdByUid: uid,
        });
      }
    }

    const journal = writeJournalPosting(tx, db, admin, journalState, {
      date,
      periodId: period.id,
      memo: `Customer invoice #${invSeq.nextNumber} · ${customer.name}`,
      source: 'customer_invoice',
      sourceRef: invoiceRef.id,
      lines: journalLines,
      uid,
      journalRef,
    });
    writeSeq(tx, invSeq);

    tx.set(invoiceRef, {
      number: invSeq.nextNumber,
      customerId,
      customerName: customer.name,
      invoiceDate: date,
      dueDate,
      status: 'open',
      lines: invoiceLines,
      totalCents,
      exVatCents: exVatTotal,
      vatCents: vatTotal,
      cogsCents: cogsTotal,
      paidCents: 0,
      balanceCents: totalCents,
      notes: typeof notes === 'string' ? notes.slice(0, 500) : null,
      journalId: journal.journalId,
      journalNumber: journal.number,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    const bal = (custSnap.data().balanceCents || 0) + totalCents;
    tx.update(customerRef, {
      balanceCents: bal,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(db.collection('financeAudit').doc(), {
      type: 'customer_invoice',
      invoiceId: invoiceRef.id,
      invoiceNumber: invSeq.nextNumber,
      customerId,
      totalCents,
      journalId: journal.journalId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    // Timeline seed on invoice
    tx.set(db.collection('financeTimeline').doc(), {
      anchorType: 'customer_invoice',
      anchorId: invoiceRef.id,
      at: date,
      kind: 'invoice_posted',
      label: `Invoice #${invSeq.nextNumber} issued`,
      amountCents: totalCents,
      journalId: journal.journalId,
      journalNumber: journal.number,
      customerId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    result = {
      invoiceId: invoiceRef.id,
      number: invSeq.nextNumber,
      totalCents,
      journalId: journal.journalId,
      journalNumber: journal.number,
      dueDate,
    };
  });

  return result;
}

async function receiveCustomerPayment(db, admin, {
  uid,
  invoiceId,
  amountCents,
  tender,
  date: dateOverride,
}) {
  await ensurePhase2Accounts(db);

  if (!invoiceId) {
    throw Object.assign(new Error('invoiceId is required.'), {
      code: 'invalid-argument',
    });
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw Object.assign(new Error('amountCents must be a positive integer.'), {
      code: 'invalid-argument',
    });
  }
  if (tender !== 'bank' && tender !== 'cash' && tender !== 'card') {
    throw Object.assign(new Error("tender must be 'bank', 'cash', or 'card'."), {
      code: 'invalid-argument',
    });
  }

  const date =
    dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)
      ? dateOverride
      : todayInSA();
  const period = await findOpenPeriod(db, date);
  if (!period) {
    throw Object.assign(new Error(`No open period covers ${date}.`), {
      code: 'failed-precondition',
    });
  }

  const byTag = await loadTaggedAccounts(db);
  const arCode = requireTag(byTag, 'accounts_receivable');
  const tenderTag =
    tender === 'cash' ? 'cash' : tender === 'card' ? 'card_clearing' : 'bank';
  const tenderCode = requireTag(byTag, tenderTag);

  const invoiceRef = db.collection('customerInvoices').doc(invoiceId);
  const paymentRef = db.collection('customerPayments').doc();
  const journalRef = db.collection('journals').doc();
  let result;

  await db.runTransaction(async (tx) => {
    const invSnap = await tx.get(invoiceRef);
    if (!invSnap.exists) {
      throw Object.assign(new Error('Invoice not found.'), { code: 'not-found' });
    }
    const inv = invSnap.data();
    if (inv.status === 'paid' || inv.status === 'void') {
      throw Object.assign(new Error('Invoice is not open for payment.'), {
        code: 'failed-precondition',
      });
    }
    const balance = inv.balanceCents ?? (inv.totalCents - (inv.paidCents || 0));
    if (amountCents > balance) {
      throw Object.assign(new Error(`Payment exceeds balance (${balance} cents).`), {
        code: 'failed-precondition',
      });
    }

    const customerRef = db.collection('customers').doc(inv.customerId);
    const custSnap = await tx.get(customerRef);

    const journalLines = [
      {
        accountCode: tenderCode,
        debitCents: amountCents,
        creditCents: 0,
        memo: 'Customer receipt',
      },
      {
        accountCode: arCode,
        debitCents: 0,
        creditCents: amountCents,
        memo: 'Clear AR',
      },
    ];

    const paySeq = await readSeq(tx, db, 'customerPayment');
    const journalState = await readJournalPostingState(tx, db, journalLines);

    const journal = writeJournalPosting(tx, db, admin, journalState, {
      date,
      periodId: period.id,
      memo: `Customer payment #${paySeq.nextNumber} · invoice #${inv.number}`,
      source: 'customer_payment',
      sourceRef: paymentRef.id,
      lines: journalLines,
      uid,
      journalRef,
    });
    writeSeq(tx, paySeq);

    const paidCents = (inv.paidCents || 0) + amountCents;
    const balanceCents = inv.totalCents - paidCents;
    const status = balanceCents <= 0 ? 'paid' : 'partial';

    tx.set(paymentRef, {
      number: paySeq.nextNumber,
      invoiceId,
      invoiceNumber: inv.number,
      customerId: inv.customerId,
      customerName: inv.customerName,
      date,
      amountCents,
      tender,
      journalId: journal.journalId,
      journalNumber: journal.number,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.update(invoiceRef, {
      paidCents,
      balanceCents,
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (custSnap.exists) {
      tx.update(customerRef, {
        balanceCents: Math.max(0, (custSnap.data().balanceCents || 0) - amountCents),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    tx.set(db.collection('financeAudit').doc(), {
      type: 'customer_payment',
      paymentId: paymentRef.id,
      paymentNumber: paySeq.nextNumber,
      invoiceId,
      amountCents,
      journalId: journal.journalId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.set(db.collection('financeTimeline').doc(), {
      anchorType: 'customer_invoice',
      anchorId: invoiceId,
      at: date,
      kind: 'payment_received',
      label: `Payment #${paySeq.nextNumber} (${tender})`,
      amountCents,
      journalId: journal.journalId,
      journalNumber: journal.number,
      customerId: inv.customerId,
      paymentId: paymentRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    result = {
      paymentId: paymentRef.id,
      number: paySeq.nextNumber,
      amountCents,
      invoiceBalanceCents: balanceCents,
      journalId: journal.journalId,
    };
  });

  return result;
}

module.exports = {
  upsertCustomer,
  postCustomerInvoice,
  receiveCustomerPayment,
};
