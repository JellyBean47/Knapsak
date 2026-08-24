const { validateJournalLines } = require('./validateJournal');

function balanceDelta(debitCents, creditCents) {
  return debitCents - creditCents;
}

function periodIdFromDate(dateStr) {
  return dateStr.slice(0, 7);
}

async function findOpenPeriod(db, dateStr) {
  const periodId = periodIdFromDate(dateStr);
  const ref = db.collection('periods').doc(periodId);
  const snap = await ref.get();
  if (!snap.exists) {
    return null;
  }
  const data = snap.data();
  if (data.status !== 'open') {
    return null;
  }
  if (dateStr < data.startDate || dateStr > data.endDate) {
    return null;
  }
  return { id: periodId, ...data, ref };
}

function assertJournalInput({ date, memo, lines }) {
  const balanceError = validateJournalLines(lines);
  if (balanceError) {
    const err = new Error(balanceError);
    err.code = 'invalid-argument';
    throw err;
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('date must be YYYY-MM-DD.');
    err.code = 'invalid-argument';
    throw err;
  }
  if (typeof memo !== 'string' || !memo.trim()) {
    const err = new Error('memo is required.');
    err.code = 'invalid-argument';
    throw err;
  }
}

/** Reads only — call before any writes in the transaction. */
async function readJournalPostingState(tx, db, lines) {
  assertJournalInput({ date: '2000-01-01', memo: 'x', lines });
  const seqRef = db.collection('documentSequences').doc('journal');
  const seqSnap = await tx.get(seqRef);
  const nextNumber = (seqSnap.exists ? seqSnap.data().nextNumber : 1) || 1;
  const uniqueCodes = [...new Set(lines.map((l) => l.accountCode))];
  const balances = new Map();
  for (const code of uniqueCodes) {
    const snap = await tx.get(db.collection('accounts').doc(code));
    if (!snap.exists) {
      const err = new Error(`Unknown account ${code}.`);
      err.code = 'invalid-argument';
      throw err;
    }
    const acct = snap.data();
    if (!acct.isPosting || !acct.isActive) {
      const err = new Error(`Account ${code} is not postable.`);
      err.code = 'failed-precondition';
      throw err;
    }
    balances.set(code, acct.balanceCents || 0);
  }
  return { seqRef, nextNumber, balances };
}

/** Writes only — call after all reads. */
function writeJournalPosting(tx, db, admin, state, {
  date,
  periodId,
  memo,
  source,
  sourceRef,
  lines,
  uid,
  journalRef,
}) {
  const ref = journalRef || db.collection('journals').doc();
  const balances = new Map(state.balances);

  for (const line of lines) {
    balances.set(
      line.accountCode,
      balances.get(line.accountCode) + balanceDelta(line.debitCents, line.creditCents),
    );
  }

  for (const [code, balanceCents] of balances.entries()) {
    tx.update(db.collection('accounts').doc(code), { balanceCents });
  }

  tx.set(ref, {
    number: state.nextNumber,
    date,
    periodId,
    source: source || 'manual',
    sourceRef: sourceRef || null,
    memo: memo.trim(),
    status: 'posted',
    lines: lines.map((l) => ({
      accountCode: l.accountCode,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      memo: l.memo || null,
    })),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
  });

  tx.set(state.seqRef, { nextNumber: state.nextNumber + 1 }, { merge: true });

  tx.set(db.collection('financeAudit').doc(), {
    type: 'journal_posted',
    journalId: ref.id,
    number: state.nextNumber,
    periodId,
    source: source || 'manual',
    sourceRef: sourceRef || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
  });

  return { journalId: ref.id, number: state.nextNumber, periodId };
}

async function readSeq(tx, db, name) {
  const ref = db.collection('documentSequences').doc(name);
  const snap = await tx.get(ref);
  const nextNumber = (snap.exists ? snap.data().nextNumber : 1) || 1;
  return { ref, nextNumber };
}

function writeSeq(tx, seqState) {
  tx.set(seqState.ref, { nextNumber: seqState.nextNumber + 1 }, { merge: true });
}

async function postJournalEntry(db, admin, {
  date,
  memo,
  source,
  sourceRef,
  lines,
  uid,
}) {
  assertJournalInput({ date, memo, lines });

  const period = await findOpenPeriod(db, date);
  if (!period) {
    const err = new Error(`No open period covers ${date}.`);
    err.code = 'failed-precondition';
    throw err;
  }

  const journalRef = db.collection('journals').doc();
  let result;

  await db.runTransaction(async (tx) => {
    const state = await readJournalPostingState(tx, db, lines);
    result = writeJournalPosting(tx, db, admin, state, {
      date,
      periodId: period.id,
      memo,
      source,
      sourceRef,
      lines,
      uid,
      journalRef,
    });
  });

  return result;
}

module.exports = {
  postJournalEntry,
  readJournalPostingState,
  writeJournalPosting,
  readSeq,
  writeSeq,
  findOpenPeriod,
  periodIdFromDate,
  balanceDelta,
  assertJournalInput,
};
