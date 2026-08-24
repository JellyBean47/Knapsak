const { validateJournalLines } = require('./validateJournal');
const { balanceDelta, periodIdFromDate } = require('./posting');
const { loadTaggedAccounts, requireTag } = require('./accounts');
const { splitInclusiveVat, todayInSA } = require('./money');

function buildSaleJournalLines({
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
      accountCode: tenderCode,
      debitCents: tenderCents,
      creditCents: 0,
      memo: 'Tender',
    },
    {
      accountCode: accountCodes.sales,
      debitCents: 0,
      creditCents: exVatCents,
      memo: 'Sales ex VAT',
    },
  ];
  if (vatCents > 0) {
    lines.push({
      accountCode: accountCodes.vat_output,
      debitCents: 0,
      creditCents: vatCents,
      memo: 'VAT output',
    });
  }
  if (cogsCents > 0) {
    lines.push(
      {
        accountCode: accountCodes.cogs,
        debitCents: cogsCents,
        creditCents: 0,
        memo: 'Cost of sales',
      },
      {
        accountCode: accountCodes.inventory,
        debitCents: 0,
        creditCents: cogsCents,
        memo: 'Inventory relief',
      },
    );
  }
  return lines;
}

async function postPosSale(db, admin, {
  uid,
  tillSessionId,
  tender,
  lines: rawLines,
  date: dateOverride,
}) {
  if (!tillSessionId || typeof tillSessionId !== 'string') {
    throw Object.assign(new Error('tillSessionId is required.'), {
      code: 'invalid-argument',
    });
  }
  if (tender !== 'cash' && tender !== 'card') {
    throw Object.assign(new Error("tender must be 'cash' or 'card'."), {
      code: 'invalid-argument',
    });
  }
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw Object.assign(new Error('At least one line is required.'), {
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
  const journalSeqRef = db.collection('documentSequences').doc('journal');
  const saleSeqRef = db.collection('documentSequences').doc('posSale');
  const journalRef = db.collection('journals').doc();
  const saleRef = db.collection('posSales').doc();
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

    const itemSnaps = [];
    for (const itemId of itemIds) {
      itemSnaps.push(await tx.get(db.collection('inventoryItems').doc(itemId)));
    }

    const saleLines = [];
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
          new Error(`Insufficient stock for ${item.sku || item.name} (have ${item.qtyOnHand}, need ${qty}).`),
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

      saleLines.push({
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
      throw Object.assign(new Error('Sale total must be positive.'), {
        code: 'invalid-argument',
      });
    }

    const journalLines = buildSaleJournalLines({
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
    const saleSeqSnap = await tx.get(saleSeqRef);
    const journalNumber = (journalSeqSnap.exists ? journalSeqSnap.data().nextNumber : 1) || 1;
    const saleNumber = (saleSeqSnap.exists ? saleSeqSnap.data().nextNumber : 1) || 1;

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

    // Stock updates
    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const qty = qtyByItem.get(itemId);
      const item = itemSnaps[i].data();
      const saleLine = saleLines.find((l) => l.itemId === itemId);
      const qtyAfter = (item.qtyOnHand || 0) - qty;
      const avgCost = item.avgCostCents || 0;
      const stockValueCents = qtyAfter * avgCost;

      if (item.trackStock !== false) {
        tx.update(db.collection('inventoryItems').doc(itemId), {
          qtyOnHand: qtyAfter,
          stockValueCents,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      tx.set(db.collection('stockMovements').doc(), {
        itemId,
        type: 'sale',
        qtyDelta: -qty,
        unitCostCents: avgCost,
        stockValueDeltaCents: -(saleLine.cogsCents),
        avgCostAfterCents: avgCost,
        qtyAfter: item.trackStock === false ? item.qtyOnHand : qtyAfter,
        source: 'pos_sale',
        sourceRef: saleRef.id,
        journalId: journalRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: uid,
      });
    }

    for (const [code, balanceCents] of balances.entries()) {
      tx.update(db.collection('accounts').doc(code), { balanceCents });
    }

    tx.set(journalRef, {
      number: journalNumber,
      date,
      periodId,
      source: 'pos_sale',
      sourceRef: saleRef.id,
      memo: `POS sale #${saleNumber} (${tender})`,
      status: 'posted',
      lines: journalLines,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.set(saleRef, {
      number: saleNumber,
      tillSessionId,
      date,
      tender,
      lines: saleLines,
      totalCents,
      exVatCents: exVatTotal,
      vatCents: vatTotal,
      cogsCents: cogsTotal,
      journalId: journalRef.id,
      journalNumber,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    const totals = till.totals || {};
    tx.update(tillRef, {
      totals: {
        saleCount: (totals.saleCount || 0) + 1,
        cashCents: (totals.cashCents || 0) + (tender === 'cash' ? totalCents : 0),
        cardCents: (totals.cardCents || 0) + (tender === 'card' ? totalCents : 0),
        totalCents: (totals.totalCents || 0) + totalCents,
        exVatCents: (totals.exVatCents || 0) + exVatTotal,
        vatCents: (totals.vatCents || 0) + vatTotal,
        cogsCents: (totals.cogsCents || 0) + cogsTotal,
      },
    });

    tx.set(journalSeqRef, { nextNumber: journalNumber + 1 }, { merge: true });
    tx.set(saleSeqRef, { nextNumber: saleNumber + 1 }, { merge: true });

    tx.set(db.collection('financeAudit').doc(), {
      type: 'pos_sale',
      saleId: saleRef.id,
      saleNumber,
      journalId: journalRef.id,
      tillSessionId,
      totalCents,
      tender,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    tx.set(db.collection('financeTimeline').doc(), {
      anchorType: 'pos_sale',
      anchorId: saleRef.id,
      at: date,
      kind: 'sale_posted',
      label: `POS sale #${saleNumber} (${tender})`,
      amountCents: totalCents,
      journalId: journalRef.id,
      journalNumber,
      tillSessionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });

    result = {
      saleId: saleRef.id,
      saleNumber,
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

module.exports = { postPosSale, buildSaleJournalLines };
