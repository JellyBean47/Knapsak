const { todayInSA } = require('./money');

async function findOpenTillSession(db) {
  const snap = await db
    .collection('tillSessions')
    .where('status', '==', 'open')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ref: doc.ref, ...doc.data() };
}

async function openTill(db, admin, { uid, openingFloatCents, registerId }) {
  if (!Number.isInteger(openingFloatCents) || openingFloatCents < 0) {
    throw Object.assign(new Error('openingFloatCents must be a non-negative integer.'), {
      code: 'invalid-argument',
    });
  }

  const existing = await findOpenTillSession(db);
  if (existing) {
    throw Object.assign(new Error('A till session is already open. Close it first.'), {
      code: 'failed-precondition',
    });
  }

  const ref = db.collection('tillSessions').doc();
  const date = todayInSA();
  const payload = {
    status: 'open',
    date,
    registerId: registerId || 'main',
    openedAt: admin.firestore.FieldValue.serverTimestamp(),
    openedByUid: uid,
    openingFloatCents,
    totals: {
      saleCount: 0,
      cashCents: 0,
      cardCents: 0,
      totalCents: 0,
      exVatCents: 0,
      vatCents: 0,
      cogsCents: 0,
      returnCount: 0,
      returnCashCents: 0,
      returnCardCents: 0,
      returnTotalCents: 0,
      returnExVatCents: 0,
      returnVatCents: 0,
      returnCogsCents: 0,
    },
  };
  await ref.set(payload);
  await db.collection('financeAudit').add({
    type: 'till_opened',
    tillSessionId: ref.id,
    openingFloatCents,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
  });

  return { tillSessionId: ref.id, ...payload, openedAt: null };
}

async function closeTill(db, admin, { uid, tillSessionId, countedCashCents, note }) {
  if (!tillSessionId || typeof tillSessionId !== 'string') {
    throw Object.assign(new Error('tillSessionId is required.'), {
      code: 'invalid-argument',
    });
  }
  if (!Number.isInteger(countedCashCents) || countedCashCents < 0) {
    throw Object.assign(new Error('countedCashCents must be a non-negative integer.'), {
      code: 'invalid-argument',
    });
  }

  const ref = db.collection('tillSessions').doc(tillSessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error('Till session not found.'), { code: 'not-found' });
  }
  const session = snap.data();
  if (session.status !== 'open') {
    throw Object.assign(new Error('Till session is already closed.'), {
      code: 'failed-precondition',
    });
  }

  const totals = session.totals || {};
  const expectedCashCents =
    session.openingFloatCents
    + (totals.cashCents || 0)
    - (totals.returnCashCents || 0);
  const varianceCents = countedCashCents - expectedCashCents;
  const netExVat =
    (totals.exVatCents || 0) - (totals.returnExVatCents || 0);
  const netCogs =
    (totals.cogsCents || 0) - (totals.returnCogsCents || 0);
  const zReport = {
    date: session.date || todayInSA(),
    registerId: session.registerId || 'main',
    openingFloatCents: session.openingFloatCents,
    expectedCashCents,
    countedCashCents,
    varianceCents,
    saleCount: totals.saleCount || 0,
    cashSalesCents: totals.cashCents || 0,
    cardSalesCents: totals.cardCents || 0,
    totalSalesCents: totals.totalCents || 0,
    returnCount: totals.returnCount || 0,
    cashReturnsCents: totals.returnCashCents || 0,
    cardReturnsCents: totals.returnCardCents || 0,
    totalReturnsCents: totals.returnTotalCents || 0,
    exVatCents: netExVat,
    vatCents: (totals.vatCents || 0) - (totals.returnVatCents || 0),
    cogsCents: netCogs,
    grossProfitCents: netExVat - netCogs,
    note: typeof note === 'string' ? note.slice(0, 500) : null,
    closedAt: null,
    closedByUid: uid,
  };

  await ref.update({
    status: 'closed',
    closedAt: admin.firestore.FieldValue.serverTimestamp(),
    closedByUid: uid,
    countedCashCents,
    expectedCashCents,
    varianceCents,
    closeNote: zReport.note,
    zReport: {
      ...zReport,
      closedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  });

  await db.collection('financeAudit').add({
    type: 'till_closed',
    tillSessionId,
    expectedCashCents,
    countedCashCents,
    varianceCents,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
  });

  return {
    tillSessionId,
    zReport: {
      ...zReport,
      closedAt: new Date().toISOString(),
    },
  };
}

module.exports = { findOpenTillSession, openTill, closeTill };
