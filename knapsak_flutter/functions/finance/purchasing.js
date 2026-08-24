const {
  readJournalPostingState,
  writeJournalPosting,
  readSeq,
  writeSeq,
  findOpenPeriod,
} = require('./posting');
const { loadTaggedAccounts, requireTag } = require('./accounts');
const { ensurePhase2Accounts } = require('./ensureAccounts');
const { todayInSA } = require('./money');

function weightedAverageAfterReceipt(qtyOnHand, avgCostCents, recvQty, recvUnitCostCents) {
  const qtyAfter = qtyOnHand + recvQty;
  const stockValueAfterCents = qtyOnHand * avgCostCents + recvQty * recvUnitCostCents;
  const avgCostAfterCents =
    qtyAfter === 0 ? 0 : Math.round(stockValueAfterCents / qtyAfter);
  return { qtyAfter, avgCostAfterCents, stockValueAfterCents };
}

function vatOnExVat(exVatCents, rateBps) {
  return Math.round((exVatCents * rateBps) / 10_000);
}

async function upsertSupplier(db, admin, { uid, supplier }) {
  const name = typeof supplier?.name === 'string' ? supplier.name.trim() : '';
  if (!name) {
    throw Object.assign(new Error('Supplier name is required.'), {
      code: 'invalid-argument',
    });
  }
  const id =
    typeof supplier?.id === 'string' && supplier.id.trim()
      ? supplier.id.trim().toLowerCase()
      : db.collection('suppliers').doc().id;

  const payload = {
    name,
    email: typeof supplier.email === 'string' ? supplier.email.trim() : null,
    phone: typeof supplier.phone === 'string' ? supplier.phone.trim() : null,
    vatNumber: typeof supplier.vatNumber === 'string' ? supplier.vatNumber.trim() : null,
    paymentTermsDays: Number.isInteger(supplier.paymentTermsDays)
      ? supplier.paymentTermsDays
      : 30,
    isActive: supplier.isActive !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: uid,
  };

  const ref = db.collection('suppliers').doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    payload.createdByUid = uid;
  }
  await ref.set(payload, { merge: true });
  return { id };
}

async function createPurchaseOrder(db, admin, { uid, supplierId, lines, notes, orderDate }) {
  if (!supplierId || typeof supplierId !== 'string') {
    throw Object.assign(new Error('supplierId is required.'), {
      code: 'invalid-argument',
    });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    throw Object.assign(new Error('PO needs at least one line.'), {
      code: 'invalid-argument',
    });
  }

  const supplierSnap = await db.collection('suppliers').doc(supplierId).get();
  if (!supplierSnap.exists || supplierSnap.data().isActive === false) {
    throw Object.assign(new Error('Supplier not found or inactive.'), {
      code: 'not-found',
    });
  }

  const date =
    orderDate && /^\d{4}-\d{2}-\d{2}$/.test(orderDate) ? orderDate : todayInSA();

  const normalized = [];
  let totalExVatCents = 0;
  for (const line of lines) {
    const itemId = typeof line?.itemId === 'string' ? line.itemId.trim() : '';
    const qty = line?.qty;
    const unitCostExVatCents = line?.unitCostExVatCents;
    if (!itemId || !Number.isInteger(qty) || qty <= 0) {
      throw Object.assign(new Error('Each PO line needs itemId and positive qty.'), {
        code: 'invalid-argument',
      });
    }
    if (!Number.isInteger(unitCostExVatCents) || unitCostExVatCents < 0) {
      throw Object.assign(new Error('unitCostExVatCents must be a non-negative integer.'), {
        code: 'invalid-argument',
      });
    }
    const itemSnap = await db.collection('inventoryItems').doc(itemId).get();
    if (!itemSnap.exists) {
      throw Object.assign(new Error(`Unknown item ${itemId}.`), { code: 'not-found' });
    }
    const item = itemSnap.data();
    const lineEx = unitCostExVatCents * qty;
    totalExVatCents += lineEx;
    normalized.push({
      itemId,
      sku: item.sku,
      name: item.name,
      qtyOrdered: qty,
      qtyReceived: 0,
      unitCostExVatCents,
      lineExVatCents: lineEx,
      vatRateId: item.vatRateId || 'za-std-15',
    });
  }

  const poRef = db.collection('purchaseOrders').doc();
  let number = 1;
  await db.runTransaction(async (tx) => {
    const seq = await readSeq(tx, db, 'purchaseOrder');
    number = seq.nextNumber;
    writeSeq(tx, seq);
    tx.set(poRef, {
      number,
      supplierId,
      supplierName: supplierSnap.data().name,
      status: 'open',
      orderDate: date,
      notes: typeof notes === 'string' ? notes.slice(0, 500) : null,
      lines: normalized,
      totalExVatCents,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });
  });

  return { purchaseOrderId: poRef.id, number };
}

async function postGoodsReceipt(db, admin, {
  uid,
  purchaseOrderId,
  lines,
  date: dateOverride,
}) {
  await ensurePhase2Accounts(db);

  if (!purchaseOrderId) {
    throw Object.assign(new Error('purchaseOrderId is required.'), {
      code: 'invalid-argument',
    });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    throw Object.assign(new Error('Receipt needs at least one line.'), {
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

  const settingsSnap = await db.collection('financeSettings').doc('default').get();
  const vatRates = new Map(
    ((settingsSnap.data() || {}).vatRates || []).map((r) => [r.id, r]),
  );

  const byTag = await loadTaggedAccounts(db);
  const inventoryCode = requireTag(byTag, 'inventory');
  const vatInputCode = requireTag(byTag, 'vat_input');
  const grniCode = requireTag(byTag, 'grni');

  const poRef = db.collection('purchaseOrders').doc(purchaseOrderId);
  const grnRef = db.collection('goodsReceipts').doc();
  const journalRef = db.collection('journals').doc();
  let result;

  await db.runTransaction(async (tx) => {
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) {
      throw Object.assign(new Error('Purchase order not found.'), { code: 'not-found' });
    }
    const po = poSnap.data();
    if (po.status === 'cancelled' || po.status === 'closed') {
      throw Object.assign(new Error('PO is not open for receiving.'), {
        code: 'failed-precondition',
      });
    }

    const poLines = [...(po.lines || [])];
    const receiptLines = [];
    let inventoryExVat = 0;
    let vatTotal = 0;

    for (const recv of lines) {
      const itemId = typeof recv?.itemId === 'string' ? recv.itemId.trim() : '';
      const qty = recv?.qty;
      if (!itemId || !Number.isInteger(qty) || qty <= 0) {
        throw Object.assign(new Error('Each receipt line needs itemId and positive qty.'), {
          code: 'invalid-argument',
        });
      }
      const idx = poLines.findIndex((l) => l.itemId === itemId);
      if (idx < 0) {
        throw Object.assign(new Error(`Item ${itemId} is not on this PO.`), {
          code: 'invalid-argument',
        });
      }
      const pl = poLines[idx];
      const remaining = pl.qtyOrdered - (pl.qtyReceived || 0);
      if (qty > remaining) {
        throw Object.assign(
          new Error(`Cannot receive ${qty} of ${pl.sku}; only ${remaining} remaining.`),
          { code: 'failed-precondition' },
        );
      }

      const unitCost = pl.unitCostExVatCents;
      const lineEx = unitCost * qty;
      const rate = vatRates.get(pl.vatRateId) || { rateBps: 1500 };
      const lineVat = vatOnExVat(lineEx, rate.rateBps || 0);

      poLines[idx] = { ...pl, qtyReceived: (pl.qtyReceived || 0) + qty };
      receiptLines.push({
        itemId,
        sku: pl.sku,
        name: pl.name,
        qty,
        unitCostExVatCents: unitCost,
        lineExVatCents: lineEx,
        vatCents: lineVat,
        vatRateId: pl.vatRateId,
      });
      inventoryExVat += lineEx;
      vatTotal += lineVat;
    }

    const itemSnaps = [];
    for (const rl of receiptLines) {
      itemSnaps.push(await tx.get(db.collection('inventoryItems').doc(rl.itemId)));
    }

    const journalLines = [
      {
        accountCode: inventoryCode,
        debitCents: inventoryExVat,
        creditCents: 0,
        memo: 'Inventory receipt',
      },
    ];
    if (vatTotal > 0) {
      journalLines.push({
        accountCode: vatInputCode,
        debitCents: vatTotal,
        creditCents: 0,
        memo: 'VAT input',
      });
    }
    journalLines.push({
      accountCode: grniCode,
      debitCents: 0,
      creditCents: inventoryExVat + vatTotal,
      memo: 'GRNI',
    });

    const grnSeq = await readSeq(tx, db, 'goodsReceipt');
    const journalState = await readJournalPostingState(tx, db, journalLines);

    // Writes
    for (let i = 0; i < receiptLines.length; i += 1) {
      const rl = receiptLines[i];
      const snap = itemSnaps[i];
      if (!snap.exists) {
        throw Object.assign(new Error(`Inventory item ${rl.itemId} missing.`), {
          code: 'not-found',
        });
      }
      const item = snap.data();
      const { qtyAfter, avgCostAfterCents, stockValueAfterCents } =
        weightedAverageAfterReceipt(
          item.qtyOnHand || 0,
          item.avgCostCents || 0,
          rl.qty,
          rl.unitCostExVatCents,
        );
      tx.update(snap.ref, {
        qtyOnHand: qtyAfter,
        avgCostCents: avgCostAfterCents,
        stockValueCents: stockValueAfterCents,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(db.collection('stockMovements').doc(), {
        itemId: rl.itemId,
        type: 'receipt',
        qtyDelta: rl.qty,
        unitCostCents: rl.unitCostExVatCents,
        stockValueDeltaCents: rl.lineExVatCents,
        avgCostAfterCents,
        qtyAfter,
        source: 'stock_receipt',
        sourceRef: grnRef.id,
        journalId: journalRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: uid,
      });
    }

    const journal = writeJournalPosting(tx, db, admin, journalState, {
      date,
      periodId: period.id,
      memo: `GRN #${grnSeq.nextNumber} for PO #${po.number}`,
      source: 'grn',
      sourceRef: grnRef.id,
      lines: journalLines,
      uid,
      journalRef,
    });

    writeSeq(tx, grnSeq);

    const allReceived = poLines.every((l) => (l.qtyReceived || 0) >= l.qtyOrdered);
    tx.update(poRef, {
      lines: poLines,
      status: allReceived ? 'received' : 'partial',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(grnRef, {
      number: grnSeq.nextNumber,
      purchaseOrderId,
      purchaseOrderNumber: po.number,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      date,
      lines: receiptLines,
      inventoryExVatCents: inventoryExVat,
      vatCents: vatTotal,
      totalInclCents: inventoryExVat + vatTotal,
      journalId: journal.journalId,
      journalNumber: journal.number,
      billed: false,
      billId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.set(db.collection('financeTimeline').doc(), {
      anchorType: 'goods_receipt',
      anchorId: grnRef.id,
      at: date,
      kind: 'grn_posted',
      label: `GRN #${grnSeq.nextNumber} received`,
      amountCents: inventoryExVat + vatTotal,
      journalId: journal.journalId,
      journalNumber: journal.number,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    result = {
      goodsReceiptId: grnRef.id,
      number: grnSeq.nextNumber,
      journalId: journal.journalId,
      journalNumber: journal.number,
      totalInclCents: inventoryExVat + vatTotal,
    };
  });

  return result;
}

async function postSupplierBillFromGrn(db, admin, {
  uid,
  goodsReceiptId,
  supplierInvoiceRef,
  billDate,
}) {
  await ensurePhase2Accounts(db);

  if (!goodsReceiptId) {
    throw Object.assign(new Error('goodsReceiptId is required.'), {
      code: 'invalid-argument',
    });
  }

  const date =
    billDate && /^\d{4}-\d{2}-\d{2}$/.test(billDate) ? billDate : todayInSA();
  const period = await findOpenPeriod(db, date);
  if (!period) {
    throw Object.assign(new Error(`No open period covers ${date}.`), {
      code: 'failed-precondition',
    });
  }

  const byTag = await loadTaggedAccounts(db);
  const grniCode = requireTag(byTag, 'grni');
  const apCode = requireTag(byTag, 'accounts_payable');

  const grnRef = db.collection('goodsReceipts').doc(goodsReceiptId);
  const billRef = db.collection('supplierBills').doc();
  const journalRef = db.collection('journals').doc();
  let result;

  await db.runTransaction(async (tx) => {
    const grnSnap = await tx.get(grnRef);
    if (!grnSnap.exists) {
      throw Object.assign(new Error('GRN not found.'), { code: 'not-found' });
    }
    const grn = grnSnap.data();
    if (grn.billed) {
      throw Object.assign(new Error('GRN already billed.'), {
        code: 'failed-precondition',
      });
    }

    const total = grn.totalInclCents || 0;
    const journalLines = [
      {
        accountCode: grniCode,
        debitCents: total,
        creditCents: 0,
        memo: 'Clear GRNI',
      },
      {
        accountCode: apCode,
        debitCents: 0,
        creditCents: total,
        memo: 'Accounts payable',
      },
    ];

    const billSeq = await readSeq(tx, db, 'supplierBill');
    const journalState = await readJournalPostingState(tx, db, journalLines);

    const journal = writeJournalPosting(tx, db, admin, journalState, {
      date,
      periodId: period.id,
      memo: `Supplier bill #${billSeq.nextNumber} from GRN #${grn.number}`,
      source: 'supplier_bill',
      sourceRef: billRef.id,
      lines: journalLines,
      uid,
      journalRef,
    });
    writeSeq(tx, billSeq);

    tx.set(billRef, {
      number: billSeq.nextNumber,
      supplierId: grn.supplierId,
      supplierName: grn.supplierName,
      goodsReceiptId,
      purchaseOrderId: grn.purchaseOrderId || null,
      supplierInvoiceRef:
        typeof supplierInvoiceRef === 'string' ? supplierInvoiceRef.slice(0, 80) : null,
      billDate: date,
      status: 'open',
      totalCents: total,
      exVatCents: grn.inventoryExVatCents || 0,
      vatCents: grn.vatCents || 0,
      paidCents: 0,
      balanceCents: total,
      journalId: journal.journalId,
      journalNumber: journal.number,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.update(grnRef, {
      billed: true,
      billId: billRef.id,
    });

    tx.set(db.collection('financeTimeline').doc(), {
      anchorType: 'supplier_bill',
      anchorId: billRef.id,
      at: date,
      kind: 'bill_posted',
      label: `Supplier bill #${billSeq.nextNumber}`,
      amountCents: total,
      journalId: journal.journalId,
      journalNumber: journal.number,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.set(db.collection('financeTimeline').doc(), {
      anchorType: 'goods_receipt',
      anchorId: goodsReceiptId,
      at: date,
      kind: 'bill_from_grn',
      label: `Billed as #${billSeq.nextNumber}`,
      amountCents: total,
      journalId: journal.journalId,
      journalNumber: journal.number,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    result = {
      billId: billRef.id,
      number: billSeq.nextNumber,
      journalId: journal.journalId,
      totalCents: total,
    };
  });

  return result;
}

async function paySupplierBill(db, admin, {
  uid,
  billId,
  amountCents,
  tender,
  date: dateOverride,
}) {
  await ensurePhase2Accounts(db);

  if (!billId) {
    throw Object.assign(new Error('billId is required.'), {
      code: 'invalid-argument',
    });
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw Object.assign(new Error('amountCents must be a positive integer.'), {
      code: 'invalid-argument',
    });
  }
  if (tender !== 'bank' && tender !== 'cash') {
    throw Object.assign(new Error("tender must be 'bank' or 'cash'."), {
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
  const apCode = requireTag(byTag, 'accounts_payable');
  const tenderCode = requireTag(byTag, tender === 'cash' ? 'cash' : 'bank');

  const billRef = db.collection('supplierBills').doc(billId);
  const paymentRef = db.collection('supplierPayments').doc();
  const journalRef = db.collection('journals').doc();
  let result;

  await db.runTransaction(async (tx) => {
    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) {
      throw Object.assign(new Error('Bill not found.'), { code: 'not-found' });
    }
    const bill = billSnap.data();
    if (bill.status === 'paid' || bill.status === 'void') {
      throw Object.assign(new Error('Bill is not open for payment.'), {
        code: 'failed-precondition',
      });
    }
    const balance = bill.balanceCents ?? (bill.totalCents - (bill.paidCents || 0));
    if (amountCents > balance) {
      throw Object.assign(new Error(`Payment exceeds balance (${balance} cents).`), {
        code: 'failed-precondition',
      });
    }

    const journalLines = [
      {
        accountCode: apCode,
        debitCents: amountCents,
        creditCents: 0,
        memo: 'Pay supplier',
      },
      {
        accountCode: tenderCode,
        debitCents: 0,
        creditCents: amountCents,
        memo: tender === 'cash' ? 'Cash' : 'Bank',
      },
    ];

    const paySeq = await readSeq(tx, db, 'supplierPayment');
    const journalState = await readJournalPostingState(tx, db, journalLines);

    const journal = writeJournalPosting(tx, db, admin, journalState, {
      date,
      periodId: period.id,
      memo: `Supplier payment #${paySeq.nextNumber} on bill #${bill.number}`,
      source: 'supplier_payment',
      sourceRef: paymentRef.id,
      lines: journalLines,
      uid,
      journalRef,
    });
    writeSeq(tx, paySeq);

    const paidCents = (bill.paidCents || 0) + amountCents;
    const balanceCents = bill.totalCents - paidCents;
    tx.update(billRef, {
      paidCents,
      balanceCents,
      status: balanceCents === 0 ? 'paid' : 'partial',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(paymentRef, {
      number: paySeq.nextNumber,
      billId,
      supplierId: bill.supplierId,
      supplierName: bill.supplierName,
      date,
      amountCents,
      tender,
      journalId: journal.journalId,
      journalNumber: journal.number,
      bankMatched: false,
      bankLineId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.set(db.collection('financeTimeline').doc(), {
      anchorType: 'supplier_bill',
      anchorId: billId,
      at: date,
      kind: 'bill_payment',
      label: `Payment #${paySeq.nextNumber} (${tender})`,
      amountCents,
      journalId: journal.journalId,
      journalNumber: journal.number,
      paymentId: paymentRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    result = {
      paymentId: paymentRef.id,
      number: paySeq.nextNumber,
      journalId: journal.journalId,
      amountCents,
      billBalanceCents: balanceCents,
    };
  });

  return result;
}

module.exports = {
  upsertSupplier,
  createPurchaseOrder,
  postGoodsReceipt,
  postSupplierBillFromGrn,
  paySupplierBill,
};
