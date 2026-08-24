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

/**
 * Import bank statement lines.
 * amountCents: positive = money in, negative = money out.
 */
async function importBankStatement(db, admin, { uid, lines, statementDate, label }) {
  await ensurePhase2Accounts(db);

  if (!Array.isArray(lines) || lines.length === 0) {
    throw Object.assign(new Error('At least one bank line is required.'), {
      code: 'invalid-argument',
    });
  }

  const normalized = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const date = line?.date;
    const description = typeof line?.description === 'string' ? line.description.trim() : '';
    const amountCents = line?.amountCents;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw Object.assign(new Error(`Line ${i + 1}: date must be YYYY-MM-DD.`), {
        code: 'invalid-argument',
      });
    }
    if (!description) {
      throw Object.assign(new Error(`Line ${i + 1}: description is required.`), {
        code: 'invalid-argument',
      });
    }
    if (!Number.isInteger(amountCents) || amountCents === 0) {
      throw Object.assign(new Error(`Line ${i + 1}: amountCents must be a non-zero integer.`), {
        code: 'invalid-argument',
      });
    }
    normalized.push({
      date,
      description: description.slice(0, 200),
      amountCents,
      reference: typeof line.reference === 'string' ? line.reference.slice(0, 80) : null,
      externalId: typeof line.externalId === 'string' ? line.externalId.slice(0, 80) : null,
    });
  }

  const stmtRef = db.collection('bankStatements').doc();
  let number = 1;

  await db.runTransaction(async (tx) => {
    const seq = await readSeq(tx, db, 'bankStatement');
    number = seq.nextNumber;
    writeSeq(tx, seq);
    tx.set(stmtRef, {
      number,
      label: typeof label === 'string' ? label.slice(0, 120) : `Import ${todayInSA()}`,
      statementDate:
        statementDate && /^\d{4}-\d{2}-\d{2}$/.test(statementDate)
          ? statementDate
          : todayInSA(),
      lineCount: normalized.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });
  });

  // Denormalize lines into bankLines (+ statement subcollection) in chunks
  const chunkSize = 200;
  for (let offset = 0; offset < normalized.length; offset += chunkSize) {
    const chunk = normalized.slice(offset, offset + chunkSize);
    const writeBatch = db.batch();
    for (const line of chunk) {
      const lineRef = stmtRef.collection('lines').doc();
      const flatRef = db.collection('bankLines').doc(lineRef.id);
      const payload = {
        statementId: stmtRef.id,
        statementNumber: number,
        ...line,
        status: 'unmatched',
        matchType: null,
        matchRef: null,
        journalId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: uid,
      };
      writeBatch.set(lineRef, payload);
      writeBatch.set(flatRef, payload);
    }
    await writeBatch.commit();
  }

  await db.collection('financeAudit').add({
    type: 'bank_statement_imported',
    statementId: stmtRef.id,
    lineCount: normalized.length,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
  });

  return { statementId: stmtRef.id, number, lineCount: normalized.length };
}

/**
 * Reconcile a bank line.
 * matchType:
 *  - supplier_payment: link to payment (amount must match abs), no new journal
 *  - card_clearing: Dr Bank Cr Card clearing for amount (deposit)
 *  - ignore: mark ignored, no journal
 */
async function reconcileBankLine(db, admin, {
  uid,
  bankLineId,
  matchType,
  matchRef,
}) {
  await ensurePhase2Accounts(db);

  if (!bankLineId || typeof bankLineId !== 'string') {
    throw Object.assign(new Error('bankLineId is required.'), {
      code: 'invalid-argument',
    });
  }
  if (!['supplier_payment', 'card_clearing', 'ignore'].includes(matchType)) {
    throw Object.assign(
      new Error("matchType must be supplier_payment | card_clearing | ignore."),
      { code: 'invalid-argument' },
    );
  }

  const lineRef = db.collection('bankLines').doc(bankLineId);
  const byTag = await loadTaggedAccounts(db);
  const bankCode = requireTag(byTag, 'bank');
  const cardCode = requireTag(byTag, 'card_clearing');

  let result;

  await db.runTransaction(async (tx) => {
    const lineSnap = await tx.get(lineRef);
    if (!lineSnap.exists) {
      throw Object.assign(new Error('Bank line not found.'), { code: 'not-found' });
    }
    const line = lineSnap.data();
    if (line.status !== 'unmatched') {
      throw Object.assign(new Error('Bank line is already reconciled.'), {
        code: 'failed-precondition',
      });
    }

    const stmtLineRef = db
      .collection('bankStatements')
      .doc(line.statementId)
      .collection('lines')
      .doc(bankLineId);

    if (matchType === 'ignore') {
      const update = {
        status: 'ignored',
        matchType: 'ignore',
        matchRef: null,
        reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
        reconciledByUid: uid,
      };
      tx.update(lineRef, update);
      tx.set(stmtLineRef, update, { merge: true });
      result = { bankLineId, status: 'ignored' };
      return;
    }

    if (matchType === 'supplier_payment') {
      if (!matchRef) {
        throw Object.assign(new Error('matchRef (paymentId) is required.'), {
          code: 'invalid-argument',
        });
      }
      const payRef = db.collection('supplierPayments').doc(matchRef);
      const paySnap = await tx.get(payRef);
      if (!paySnap.exists) {
        throw Object.assign(new Error('Supplier payment not found.'), {
          code: 'not-found',
        });
      }
      const pay = paySnap.data();
      if (pay.bankMatched) {
        throw Object.assign(new Error('Payment already matched to a bank line.'), {
          code: 'failed-precondition',
        });
      }
      if (pay.tender !== 'bank') {
        throw Object.assign(new Error('Payment tender is not bank.'), {
          code: 'failed-precondition',
        });
      }
      // Payment is money out → bank line should be negative
      if (line.amountCents !== -pay.amountCents) {
        throw Object.assign(
          new Error(
            `Amount mismatch: bank ${line.amountCents} vs payment ${-pay.amountCents}.`,
          ),
          { code: 'failed-precondition' },
        );
      }

      const update = {
        status: 'matched',
        matchType: 'supplier_payment',
        matchRef,
        journalId: pay.journalId || null,
        reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
        reconciledByUid: uid,
      };
      tx.update(lineRef, update);
      tx.set(stmtLineRef, update, { merge: true });
      tx.update(payRef, {
        bankMatched: true,
        bankLineId,
      });
      tx.set(db.collection('financeTimeline').doc(), {
        anchorType: 'bank_line',
        anchorId: bankLineId,
        at: line.date,
        kind: 'bank_matched_payment',
        label: `Matched supplier payment`,
        amountCents: line.amountCents,
        journalId: pay.journalId || null,
        matchRef,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: uid,
      });
      if (pay.billId) {
        tx.set(db.collection('financeTimeline').doc(), {
          anchorType: 'supplier_bill',
          anchorId: pay.billId,
          at: line.date,
          kind: 'bank_matched',
          label: 'Bank statement matched',
          amountCents: pay.amountCents,
          journalId: pay.journalId || null,
          bankLineId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdByUid: uid,
        });
      }
      result = { bankLineId, status: 'matched', matchType, matchRef };
      return;
    }

    // card_clearing — deposit into bank from card clearing
    if (line.amountCents <= 0) {
      throw Object.assign(new Error('Card clearing match requires a positive bank deposit.'), {
        code: 'failed-precondition',
      });
    }

    const period = await findOpenPeriod(db, line.date);
    if (!period) {
      throw Object.assign(new Error(`No open period covers ${line.date}.`), {
        code: 'failed-precondition',
      });
    }

    const amount = line.amountCents;
    const journalLines = [
      {
        accountCode: bankCode,
        debitCents: amount,
        creditCents: 0,
        memo: 'Bank deposit',
      },
      {
        accountCode: cardCode,
        debitCents: 0,
        creditCents: amount,
        memo: 'Clear card clearing',
      },
    ];

    const journalRef = db.collection('journals').doc();
    const journalState = await readJournalPostingState(tx, db, journalLines);
    const journal = writeJournalPosting(tx, db, admin, journalState, {
      date: line.date,
      periodId: period.id,
      memo: `Bank recon: card clearing (${line.description})`,
      source: 'bank_recon',
      sourceRef: bankLineId,
      lines: journalLines,
      uid,
      journalRef,
    });

    const update = {
      status: 'matched',
      matchType: 'card_clearing',
      matchRef: journal.journalId,
      journalId: journal.journalId,
      reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
      reconciledByUid: uid,
    };
    tx.update(lineRef, update);
    tx.set(stmtLineRef, update, { merge: true });
    tx.set(db.collection('financeTimeline').doc(), {
      anchorType: 'bank_line',
      anchorId: bankLineId,
      at: line.date,
      kind: 'bank_matched_card',
      label: 'Card clearing → bank',
      amountCents: amount,
      journalId: journal.journalId,
      journalNumber: journal.number,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByUid: uid,
    });
    result = {
      bankLineId,
      status: 'matched',
      matchType,
      journalId: journal.journalId,
      journalNumber: journal.number,
    };
  });

  return result;
}

module.exports = { importBankStatement, reconcileBankLine };
