const { validateJournalLines } = require('./validateJournal');
const { balanceDelta, periodIdFromDate } = require('./posting');
const { loadTaggedAccounts, requireTag } = require('./accounts');
const { splitInclusiveVat, todayInSA } = require('./money');

function weightedAverageAfterReceipt(qtyOnHand, avgCostCents, recvQty, recvUnitCostCents) {
  const qtyAfter = qtyOnHand + recvQty;
  const stockValueAfterCents = qtyOnHand * avgCostCents + recvQty * recvUnitCostCents;
  const avgCostAfterCents =
    qtyAfter === 0 ? 0 : Math.round(stockValueAfterCents / qtyAfter);
  return { qtyAfter, avgCostAfterCents, stockValueAfterCents };
}

/**
 * Reverse of a VAT-inclusive POS sale (credit note / refund).
 * Dr Sales + VAT output · Cr Cash/Card · Dr Inventory · Cr COGS
 */
function buildReturnJournalLines({
  tender,
  tenderCents,
  exVatCents,
  vatCents,
  cogsCents,
  accountCodes,
}) {
  const tenderCode =
    tender === 'cash' ? accountCodes.cash : accountCodes.card_clearing;
  const lines = [
    {
      accountCode: accountCodes.sales,
      debitCents: exVatCents,
      creditCents: 0,
      memo: 'Sales return ex VAT',
    },
  ];
  if (vatCents > 0) {
    lines.push({
      accountCode: accountCodes.vat_output,
      debitCents: vatCents,
      creditCents: 0,
      memo: 'VAT output reverse',
    });
  }
  lines.push({
    accountCode: tenderCode,
    debitCents: 0,
    creditCents: tenderCents,
    memo: 'Refund tender',
  });
  if (cogsCents > 0) {
    lines.push(
      {
        accountCode: accountCodes.inventory,
        debitCents: cogsCents,
        creditCents: 0,
        memo: 'Inventory restore',
      },
      {
        accountCode: accountCodes.cogs,
        debitCents: 0,
        creditCents: cogsCents,
        memo: 'COGS reverse',
      },
    );
  }
  return lines;
}

async function postPosReturn(db, admin, {
  uid,
  tillSessionId,
  saleId,
  lines: rawLines,
  date: dateOverride,
  note,
}) {
  if (!tillSessionId || typeof tillSessionId !== 'string') {
    throw Object.assign(new Error('tillSessionId is required.'), {
      code: 'invalid-argument',
    });
  }
  if (!saleId || typeof saleId !== 'string') {
    throw Object.assign(new Error('saleId is required.'), {
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

  const date = dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)
    ? dateOverride
    : todayInSA();

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
  const accountCodes = {
    cash: requireTag(byTag, 'cash'),
    card_clearing: requireTag(byTag, 'card_clearing'),
    sales: requireTag(byTag, 'sales'),
    vat_output: requireTag(byTag, 'vat_output'),
    cogs: requireTag(byTag, 'cogs'),
    inventory: requireTag(byTag, 'inventory'),
  };

  const periodId = periodIdFromDate(date);
  const periodRef = db.collection('periods').doc(periodId);
  const tillRef = db.collection('tillSessions').doc(tillSessionId);
  const saleRef = db.collection('posSales').doc(saleId);
  const journalSeqRef = db.collection('documentSequences').doc('journal');
  const returnSeqRef = db.collection('documentSequences').doc('posReturn');
  const journalRef = db.collection('journals').doc();
  const returnRef = db.collection('posReturns').doc();
  const itemIds = [...qtyByItem.keys()];

  let result;

  await db.runTransaction(async (tx) => {
    const periodSnap = await tx.get(periodRef);
    if (!periodSnap.exists || periodSnap.data().status !== 'open') {
      throw Object.assign(new Error(`No open period covers ${date}.`), {
        code: 'failed-precondition',
      });
    }
    const period = periodSnap.data();
    if (date < period.startDate || date > period.endDate) {
      throw Object.assign(new Error(`No open period covers ${date}.`), {
        code: 'failed-precondition',
      });
    }

    const tillSnap = await tx.get(tillRef);
    if (!tillSnap.exists || tillSnap.data().status !== 'open') {
      throw Object.assign(new Error('Till session is not open.'), {
        code: 'failed-precondition',
      });
    }
    const till = tillSnap.data();

    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists) {
      throw Object.assign(new Error('Original sale not found.'), {
        code: 'not-found',
      });
    }
    const sale = saleSnap.data();
    const tender = sale.tender;
    if (tender !== 'cash' && tender !== 'card') {
      throw Object.assign(new Error('Sale has invalid tender.'), {
        code: 'failed-precondition',
      });
    }

    const saleLinesByItem = new Map();
    for (const line of sale.lines || []) {
      saleLinesByItem.set(line.itemId, line);
    }

    const itemSnaps = [];
    for (const itemId of itemIds) {
      itemSnaps.push(await tx.get(db.collection('inventoryItems').doc(itemId)));
    }

    const returnLines = [];
    let totalCents = 0;
    let exVatTotal = 0;
    let vatTotal = 0;
    let cogsTotal = 0;
    const updatedSaleLines = (sale.lines || []).map((l) => ({ ...l }));

    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const qty = qtyByItem.get(itemId);
      const saleLine = saleLinesByItem.get(itemId);
      if (!saleLine) {
        throw Object.assign(
          new Error(`Item ${itemId} was not on sale #${sale.number}.`),
          { code: 'invalid-argument' },
        );
      }
      const alreadyReturned = saleLine.qtyReturned || 0;
      const remaining = saleLine.qty - alreadyReturned;
      if (qty > remaining) {
        throw Object.assign(
          new Error(
            `Cannot return ${qty} of ${saleLine.sku || itemId}; only ${remaining} remaining.`,
          ),
          { code: 'failed-precondition' },
        );
      }

      const snap = itemSnaps[i];
      if (!snap.exists) {
        throw Object.assign(new Error(`Unknown item ${itemId}.`), {
          code: 'not-found',
        });
      }
      const item = snap.data();

      const unitPrice = saleLine.unitPriceCents || 0;
      const lineTotal = unitPrice * qty;
      const rateId = saleLine.vatRateId || defaultVatRateId;
      const rate = vatRates.get(rateId) || { rateBps: 1500 };
      const { exVatCents, vatCents } = splitInclusiveVat(lineTotal, rate.rateBps || 0);
      const unitCost = saleLine.unitCostCents || 0;
      const cogsCents = unitCost * qty;

      returnLines.push({
        itemId,
        sku: saleLine.sku,
        name: saleLine.name,
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

      const idx = updatedSaleLines.findIndex((l) => l.itemId === itemId);
      if (idx >= 0) {
        updatedSaleLines[idx] = {
          ...updatedSaleLines[idx],
          qtyReturned: alreadyReturned + qty,
        };
      }
    }

    if (totalCents <= 0) {
      throw Object.assign(new Error('Return total must be positive.'), {
        code: 'invalid-argument',
      });
    }

    // Cash drawer must cover cash refunds
    if (tender === 'cash') {
      const expectedCash =
        (till.openingFloatCents || 0) + (till.totals?.cashCents || 0)
        - (till.totals?.returnCashCents || 0);
      if (totalCents > expectedCash) {
        throw Object.assign(
          new Error(
            `Insufficient till cash for refund (have ${expectedCash}c, need ${totalCents}c).`,
          ),
          { code: 'failed-precondition' },
        );
      }
    }

    const journalLines = buildReturnJournalLines({
      tender,
      tenderCents: totalCents,
      exVatCents: exVatTotal,
      vatCents: vatTotal,
      cogsCents: cogsTotal,
      accountCodes,
    });
    const balanceError = validateJournalLines(journalLines);
    if (balanceError) {
      throw Object.assign(new Error(balanceError), { code: 'invalid-argument' });
    }

    const journalSeqSnap = await tx.get(journalSeqRef);
    const returnSeqSnap = await tx.get(returnSeqRef);
    const journalNumber = (journalSeqSnap.exists ? journalSeqSnap.data().nextNumber : 1) || 1;
    const returnNumber = (returnSeqSnap.exists ? returnSeqSnap.data().nextNumber : 1) || 1;

    const accountCodesUsed = [...new Set(journalLines.map((l) => l.accountCode))];
    const balances = new Map();
    for (const code of accountCodesUsed) {
      const acctSnap = await tx.get(db.collection('accounts').doc(code));
      if (!acctSnap.exists || !acctSnap.data().isPosting || !acctSnap.data().isActive) {
        throw Object.assign(new Error(`Account ${code} is not postable.`), {
          code: 'failed-precondition',
        });
      }
      balances.set(code, acctSnap.data().balanceCents || 0);
    }
    for (const line of journalLines) {
      balances.set(
        line.accountCode,
        balances.get(line.accountCode) + balanceDelta(line.debitCents, line.creditCents),
      );
    }

    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const qty = qtyByItem.get(itemId);
      const item = itemSnaps[i].data();
      const returnLine = returnLines.find((l) => l.itemId === itemId);
      const unitCost = returnLine.unitCostCents || 0;

      if (item.trackStock !== false) {
        const { qtyAfter, avgCostAfterCents, stockValueAfterCents } =
          weightedAverageAfterReceipt(
            item.qtyOnHand || 0,
            item.avgCostCents || 0,
            qty,
            unitCost,
          );
        tx.update(db.collection('inventoryItems').doc(itemId), {
          qtyOnHand: qtyAfter,
          avgCostCents: avgCostAfterCents,
          stockValueCents: stockValueAfterCents,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(db.collection('stockMovements').doc(), {
          itemId,
          type: 'return',
          qtyDelta: qty,
          unitCostCents: unitCost,
          stockValueDeltaCents: unitCost * qty,
          avgCostAfterCents,
          qtyAfter,
          source: 'pos_return',
          sourceRef: returnRef.id,
          journalId: journalRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdByUid: uid,
        });
      } else {
        tx.set(db.collection('stockMovements').doc(), {
          itemId,
          type: 'return',
          qtyDelta: qty,
          unitCostCents: unitCost,
          stockValueDeltaCents: unitCost * qty,
          avgCostAfterCents: item.avgCostCents || 0,
          qtyAfter: item.qtyOnHand || 0,
          source: 'pos_return',
          sourceRef: returnRef.id,
          journalId: journalRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdByUid: uid,
        });
      }
    }

    for (const [code, balanceCents] of balances.entries()) {
      tx.update(db.collection('accounts').doc(code), { balanceCents });
    }

    tx.set(journalRef, {
      number: journalNumber,
      date,
      periodId,
      source: 'pos_return',
      sourceRef: returnRef.id,
      memo: `POS return #${returnNumber} for sale #${sale.number} (${tender})`,
      status: 'posted',
      lines: journalLines,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.set(returnRef, {
      number: returnNumber,
      saleId,
      saleNumber: sale.number,
      tillSessionId,
      date,
      tender,
      lines: returnLines,
      totalCents,
      exVatCents: exVatTotal,
      vatCents: vatTotal,
      cogsCents: cogsTotal,
      journalId: journalRef.id,
      journalNumber,
      note: typeof note === 'string' ? note.slice(0, 500) : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    const allReturned = updatedSaleLines.every(
      (l) => (l.qtyReturned || 0) >= l.qty,
    );
    const anyReturned = updatedSaleLines.some((l) => (l.qtyReturned || 0) > 0);
    tx.update(saleRef, {
      lines: updatedSaleLines,
      returnStatus: allReturned ? 'fully_returned' : anyReturned ? 'partial' : 'none',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const totals = till.totals || {};
    tx.update(tillRef, {
      totals: {
        ...totals,
        returnCount: (totals.returnCount || 0) + 1,
        returnCashCents:
          (totals.returnCashCents || 0) + (tender === 'cash' ? totalCents : 0),
        returnCardCents:
          (totals.returnCardCents || 0) + (tender === 'card' ? totalCents : 0),
        returnTotalCents: (totals.returnTotalCents || 0) + totalCents,
        returnExVatCents: (totals.returnExVatCents || 0) + exVatTotal,
        returnVatCents: (totals.returnVatCents || 0) + vatTotal,
        returnCogsCents: (totals.returnCogsCents || 0) + cogsTotal,
      },
    });

    tx.set(journalSeqRef, { nextNumber: journalNumber + 1 }, { merge: true });
    tx.set(returnSeqRef, { nextNumber: returnNumber + 1 }, { merge: true });

    tx.set(db.collection('financeAudit').doc(), {
      type: 'pos_return',
      returnId: returnRef.id,
      returnNumber,
      saleId,
      saleNumber: sale.number,
      journalId: journalRef.id,
      tillSessionId,
      totalCents,
      tender,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.set(db.collection('financeTimeline').doc(), {
      anchorType: 'pos_sale',
      anchorId: saleId,
      at: date,
      kind: 'return_posted',
      label: `POS return #${returnNumber}`,
      amountCents: totalCents,
      journalId: journalRef.id,
      journalNumber,
      returnId: returnRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    result = {
      returnId: returnRef.id,
      returnNumber,
      saleId,
      saleNumber: sale.number,
      journalId: journalRef.id,
      journalNumber,
      totalCents,
      exVatCents: exVatTotal,
      vatCents: vatTotal,
      cogsCents: cogsTotal,
      tender,
      date,
    };
  });

  return result;
}

module.exports = { postPosReturn, buildReturnJournalLines };
