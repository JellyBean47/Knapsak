const {
  readJournalPostingState,
  writeJournalPosting,
  findOpenPeriod,
  periodIdFromDate,
} = require('./posting');
const { loadTaggedAccounts, requireTag } = require('./accounts');
const { todayInSA } = require('./money');

async function closePeriod(db, admin, { uid, periodId }) {
  if (!periodId || typeof periodId !== 'string') {
    throw Object.assign(new Error('periodId is required (e.g. 2026-07).'), {
      code: 'invalid-argument',
    });
  }

  const ref = db.collection('periods').doc(periodId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error(`Period ${periodId} not found.`), {
      code: 'not-found',
    });
  }
  const period = snap.data();
  if (period.status === 'closed') {
    throw Object.assign(new Error(`Period ${periodId} is already closed.`), {
      code: 'failed-precondition',
    });
  }

  await ref.update({
    status: 'closed',
    closedAt: admin.firestore.FieldValue.serverTimestamp(),
    closedByUid: uid,
  });

  await db.collection('financeAudit').add({
    type: 'period_closed',
    periodId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
  });

  return { periodId, status: 'closed' };
}

/**
 * Soft-close open months in the FY, post P&L → retained earnings, re-close.
 */
async function closeFiscalYear(db, admin, { uid, fiscalYear, asOfDate }) {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    throw Object.assign(new Error('fiscalYear must be a valid year.'), {
      code: 'invalid-argument',
    });
  }

  const date =
    asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)
      ? asOfDate
      : todayInSA();

  const periodsSnap = await db
    .collection('periods')
    .where('fiscalYear', '==', fiscalYear)
    .get();

  if (periodsSnap.empty) {
    throw Object.assign(new Error(`No periods found for FY ${fiscalYear}.`), {
      code: 'not-found',
    });
  }

  const closePeriodId = periodIdFromDate(date);
  const closePeriodRef = db.collection('periods').doc(closePeriodId);
  const closePeriodSnap = await closePeriodRef.get();
  if (!closePeriodSnap.exists) {
    throw Object.assign(
      new Error(`Need period ${closePeriodId} for closing journal date ${date}.`),
      { code: 'failed-precondition' },
    );
  }
  if (closePeriodSnap.data().fiscalYear !== fiscalYear) {
    throw Object.assign(
      new Error(
        `asOfDate ${date} falls in FY ${closePeriodSnap.data().fiscalYear}, not ${fiscalYear}.`,
      ),
      { code: 'invalid-argument' },
    );
  }

  // Soft-close every other open period in the FY first
  const closedIds = [];
  for (const doc of periodsSnap.docs) {
    if (doc.id === closePeriodId) continue;
    if (doc.data().status === 'open') {
      await closePeriod(db, admin, { uid, periodId: doc.id });
      closedIds.push(doc.id);
    }
  }

  // Ensure close-date period is open for the year-end journal
  if (closePeriodSnap.data().status === 'closed') {
    await closePeriodRef.update({
      status: 'open',
      reopenedForYearEnd: true,
      reopenedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const byTag = await loadTaggedAccounts(db);
  const reCode = requireTag(byTag, 'retained_earnings');

  const accountsSnap = await db.collection('accounts').get();
  const plAccounts = accountsSnap.docs
    .map((d) => ({ code: d.id, ...d.data() }))
    .filter(
      (a) =>
        a.isPosting
        && a.isActive !== false
        && (a.type === 'income' || a.type === 'expense'),
    );

  const journalLines = [];
  let netToRe = 0;

  for (const a of plAccounts) {
    const bal = a.balanceCents || 0;
    if (bal === 0) continue;
    if (a.type === 'income') {
      if (bal < 0) {
        const amount = -bal;
        journalLines.push({
          accountCode: a.code,
          debitCents: amount,
          creditCents: 0,
          memo: 'Close income to RE',
        });
        netToRe += amount;
      } else {
        journalLines.push({
          accountCode: a.code,
          debitCents: 0,
          creditCents: bal,
          memo: 'Close income (debit bal) to RE',
        });
        netToRe -= bal;
      }
    } else if (bal > 0) {
      journalLines.push({
        accountCode: a.code,
        debitCents: 0,
        creditCents: bal,
        memo: 'Close expense to RE',
      });
      netToRe -= bal;
    } else {
      const amount = -bal;
      journalLines.push({
        accountCode: a.code,
        debitCents: amount,
        creditCents: 0,
        memo: 'Close expense (credit bal) to RE',
      });
      netToRe += amount;
    }
  }

  let journalId = null;
  let journalNumber = null;

  if (journalLines.length > 0) {
    if (netToRe > 0) {
      journalLines.push({
        accountCode: reCode,
        debitCents: 0,
        creditCents: netToRe,
        memo: 'Retained earnings (FY profit)',
      });
    } else if (netToRe < 0) {
      journalLines.push({
        accountCode: reCode,
        debitCents: -netToRe,
        creditCents: 0,
        memo: 'Retained earnings (FY loss)',
      });
    }

    const period = await findOpenPeriod(db, date);
    if (!period) {
      throw Object.assign(new Error(`No open period covers ${date} for year-end.`), {
        code: 'failed-precondition',
      });
    }

    const journalRef = db.collection('journals').doc();
    await db.runTransaction(async (tx) => {
      const state = await readJournalPostingState(tx, db, journalLines);
      const journal = writeJournalPosting(tx, db, admin, state, {
        date,
        periodId: period.id,
        memo: `Year-end close FY ${fiscalYear}`,
        source: 'year_end_close',
        sourceRef: `fy-${fiscalYear}`,
        lines: journalLines,
        uid,
        journalRef,
      });
      journalId = journal.journalId;
      journalNumber = journal.number;

      tx.set(db.collection('financeSettings').doc('default'), {
        lastYearEndClose: {
          fiscalYear,
          date,
          journalId,
          journalNumber,
          closedAt: admin.firestore.FieldValue.serverTimestamp(),
          closedByUid: uid,
        },
      }, { merge: true });

      tx.set(db.collection('financeAudit').doc(), {
        type: 'fiscal_year_closed',
        fiscalYear,
        journalId,
        journalNumber,
        periodsClosed: closedIds,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: uid,
      });
    });
  }

  // Close the as-of period
  const finalCloseSnap = await closePeriodRef.get();
  if (finalCloseSnap.data().status === 'open') {
    await closePeriod(db, admin, { uid, periodId: closePeriodId });
    closedIds.push(closePeriodId);
  }

  return {
    fiscalYear,
    periodsClosed: closedIds,
    journalId,
    journalNumber,
    netToRetainedEarningsCents: netToRe,
    date,
  };
}

module.exports = { closePeriod, closeFiscalYear };
