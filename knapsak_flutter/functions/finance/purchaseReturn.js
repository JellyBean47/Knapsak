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

function weightedAverageAfterIssue(qtyOnHand, avgCostCents, issueQty, issueUnitCostCents) {
  const qtyAfter = qtyOnHand - issueQty;
  const stockValueAfterCents =
    qtyOnHand * avgCostCents - issueQty * issueUnitCostCents;
  const safeValue = Math.max(0, stockValueAfterCents);
  const avgCostAfterCents =
    qtyAfter === 0 ? 0 : Math.round(safeValue / qtyAfter);
  return { qtyAfter, avgCostAfterCents, stockValueAfterCents: safeValue };
}

/**
 * Return goods to supplier against a GRN (partial OK).
 * Unbilled: reverse GRNI. Billed: Dr AP / create supplier credit note.
 */
async function postPurchaseReturn(db, admin, {
  uid,
  goodsReceiptId,
  lines: rawLines,
  date: dateOverride,
  note,
}) {
  await ensurePhase2Accounts(db);

  if (!goodsReceiptId || typeof goodsReceiptId !== 'string') {
    throw Object.assign(new Error('goodsReceiptId is required.'), {
      code: 'invalid-argument',
    });
  }
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw Object.assign(new Error('At least one return line is required.'), {
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
  const inventoryCode = requireTag(byTag, 'inventory');
  const vatInputCode = requireTag(byTag, 'vat_input');
  const grniCode = requireTag(byTag, 'grni');
  const apCode = requireTag(byTag, 'accounts_payable');

  const grnRef = db.collection('goodsReceipts').doc(goodsReceiptId);
  const returnRef = db.collection('purchaseReturns').doc();
  const creditRef = db.collection('supplierCreditNotes').doc();
  const journalRef = db.collection('journals').doc();
  let result;

  await db.runTransaction(async (tx) => {
    const grnSnap = await tx.get(grnRef);
    if (!grnSnap.exists) {
      throw Object.assign(new Error('GRN not found.'), { code: 'not-found' });
    }
    const grn = grnSnap.data();
    const grnLines = (grn.lines || []).map((l) => ({ ...l }));
    const byItem = new Map(grnLines.map((l) => [l.itemId, l]));

    const returnLines = [];
    let inventoryExVat = 0;
    let vatTotal = 0;

    for (const [itemId, qty] of qtyByItem.entries()) {
      const gl = byItem.get(itemId);
      if (!gl) {
        throw Object.assign(
          new Error(`Item ${itemId} was not on GRN #${grn.number}.`),
          { code: 'invalid-argument' },
        );
      }
      const already = gl.qtyReturned || 0;
      const remaining = gl.qty - already;
      if (qty > remaining) {
        throw Object.assign(
          new Error(
            `Cannot return ${qty} of ${gl.sku || itemId}; only ${remaining} remaining.`,
          ),
          { code: 'failed-precondition' },
        );
      }
      const unitCost = gl.unitCostExVatCents || 0;
      const lineEx = unitCost * qty;
      const unitVat = gl.qty > 0 ? Math.round((gl.vatCents || 0) / gl.qty) : 0;
      // Prefer proportional VAT to avoid rounding drift on full return
      const lineVat =
        already + qty === gl.qty
          ? (gl.vatCents || 0) - unitVat * already
          : unitVat * qty;

      returnLines.push({
        itemId,
        sku: gl.sku,
        name: gl.name,
        qty,
        unitCostExVatCents: unitCost,
        lineExVatCents: lineEx,
        vatCents: lineVat,
        vatRateId: gl.vatRateId,
      });
      inventoryExVat += lineEx;
      vatTotal += lineVat;

      const idx = grnLines.findIndex((l) => l.itemId === itemId);
      grnLines[idx] = { ...grnLines[idx], qtyReturned: already + qty };
    }

    const totalIncl = inventoryExVat + vatTotal;
    if (totalIncl <= 0) {
      throw Object.assign(new Error('Return total must be positive.'), {
        code: 'invalid-argument',
      });
    }

    let billRef = null;
    let bill = null;
    if (grn.billed && grn.billId) {
      billRef = db.collection('supplierBills').doc(grn.billId);
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw Object.assign(new Error('Linked supplier bill not found.'), {
          code: 'not-found',
        });
      }
      bill = billSnap.data();
      if (bill.status === 'void') {
        throw Object.assign(new Error('Linked bill is void.'), {
          code: 'failed-precondition',
        });
      }
    }

    const itemIds = returnLines.map((l) => l.itemId);
    const itemSnaps = [];
    for (const id of itemIds) {
      itemSnaps.push(await tx.get(db.collection('inventoryItems').doc(id)));
    }

    const journalLines = [];
    if (bill) {
      journalLines.push({
        accountCode: apCode,
        debitCents: totalIncl,
        creditCents: 0,
        memo: 'Supplier credit / AP reverse',
      });
    } else {
      journalLines.push({
        accountCode: grniCode,
        debitCents: totalIncl,
        creditCents: 0,
        memo: 'GRNI reverse',
      });
    }
    journalLines.push({
      accountCode: inventoryCode,
      debitCents: 0,
      creditCents: inventoryExVat,
      memo: 'Inventory return to supplier',
    });
    if (vatTotal > 0) {
      journalLines.push({
        accountCode: vatInputCode,
        debitCents: 0,
        creditCents: vatTotal,
        memo: 'VAT input reverse',
      });
    }

    const retSeq = await readSeq(tx, db, 'purchaseReturn');
    const creditSeq = bill ? await readSeq(tx, db, 'supplierCreditNote') : null;
    const journalState = await readJournalPostingState(tx, db, journalLines);

    for (let i = 0; i < returnLines.length; i += 1) {
      const rl = returnLines[i];
      const snap = itemSnaps[i];
      if (!snap.exists) {
        throw Object.assign(new Error(`Inventory item ${rl.itemId} missing.`), {
          code: 'not-found',
        });
      }
      const item = snap.data();
      if (item.trackStock !== false) {
        if ((item.qtyOnHand || 0) < rl.qty) {
          throw Object.assign(
            new Error(
              `Insufficient stock to return ${rl.sku || rl.itemId} (have ${item.qtyOnHand}).`,
            ),
            { code: 'failed-precondition' },
          );
        }
        const { qtyAfter, avgCostAfterCents, stockValueAfterCents } =
          weightedAverageAfterIssue(
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
          type: 'return',
          qtyDelta: -rl.qty,
          unitCostCents: rl.unitCostExVatCents,
          stockValueDeltaCents: -rl.lineExVatCents,
          avgCostAfterCents,
          qtyAfter,
          source: 'purchase_return',
          sourceRef: returnRef.id,
          journalId: journalRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdByUid: uid,
        });
      }
    }

    const journal = writeJournalPosting(tx, db, admin, journalState, {
      date,
      periodId: period.id,
      memo: `Purchase return #${retSeq.nextNumber} on GRN #${grn.number}`,
      source: 'purchase_return',
      sourceRef: returnRef.id,
      lines: journalLines,
      uid,
      journalRef,
    });
    writeSeq(tx, retSeq);

    let creditNoteId = null;
    let creditNumber = null;
    if (bill && billRef && creditSeq) {
      creditNumber = creditSeq.nextNumber;
      creditNoteId = creditRef.id;
      const newBillTotal = Math.max(0, (bill.totalCents || 0) - totalIncl);
      const newPaid = Math.min(bill.paidCents || 0, newBillTotal);
      const newBalance = newBillTotal - newPaid;
      tx.update(billRef, {
        totalCents: newBillTotal,
        paidCents: newPaid,
        balanceCents: newBalance,
        status: newBalance === 0 ? (newBillTotal === 0 ? 'void' : 'paid') : (newPaid > 0 ? 'partial' : 'open'),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(creditRef, {
        number: creditNumber,
        goodsReceiptId,
        billId: grn.billId,
        supplierId: grn.supplierId,
        supplierName: grn.supplierName,
        date,
        lines: returnLines,
        inventoryExVatCents: inventoryExVat,
        vatCents: vatTotal,
        totalInclCents: totalIncl,
        journalId: journal.journalId,
        journalNumber: journal.number,
        purchaseReturnId: returnRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: uid,
      });
      writeSeq(tx, creditSeq);

      tx.set(db.collection('financeTimeline').doc(), {
        anchorType: 'supplier_bill',
        anchorId: grn.billId,
        at: date,
        kind: 'supplier_credit',
        label: `Supplier credit #${creditNumber}`,
        amountCents: totalIncl,
        journalId: journal.journalId,
        journalNumber: journal.number,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: uid,
      });
    }

    tx.set(returnRef, {
      number: retSeq.nextNumber,
      goodsReceiptId,
      goodsReceiptNumber: grn.number,
      purchaseOrderId: grn.purchaseOrderId || null,
      supplierId: grn.supplierId,
      supplierName: grn.supplierName,
      date,
      lines: returnLines,
      inventoryExVatCents: inventoryExVat,
      vatCents: vatTotal,
      totalInclCents: totalIncl,
      billed: !!bill,
      billId: grn.billId || null,
      creditNoteId,
      creditNoteNumber: creditNumber,
      journalId: journal.journalId,
      journalNumber: journal.number,
      note: typeof note === 'string' ? note.slice(0, 500) : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.update(grnRef, {
      lines: grnLines,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(db.collection('financeTimeline').doc(), {
      anchorType: 'goods_receipt',
      anchorId: goodsReceiptId,
      at: date,
      kind: 'purchase_return',
      label: `Purchase return #${retSeq.nextNumber}`,
      amountCents: totalIncl,
      journalId: journal.journalId,
      journalNumber: journal.number,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.set(db.collection('financeAudit').doc(), {
      type: 'purchase_return',
      returnId: returnRef.id,
      returnNumber: retSeq.nextNumber,
      goodsReceiptId,
      totalInclCents: totalIncl,
      journalId: journal.journalId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    result = {
      purchaseReturnId: returnRef.id,
      number: retSeq.nextNumber,
      journalId: journal.journalId,
      journalNumber: journal.number,
      totalInclCents: totalIncl,
      creditNoteId,
      creditNoteNumber: creditNumber,
    };
  });

  return result;
}

module.exports = { postPurchaseReturn };
