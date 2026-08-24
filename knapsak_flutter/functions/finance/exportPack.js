/**
 * Build accountant-oriented export pack for a date range.
 * Includes a reconstructed balance sheet as-of endDate (from journals ≤ endDate).
 */

function accumulateJournalBalances(journals) {
  const balances = new Map();
  for (const j of journals) {
    for (const line of j.lines || []) {
      const code = line.accountCode;
      const delta = (line.debitCents || 0) - (line.creditCents || 0);
      balances.set(code, (balances.get(code) || 0) + delta);
    }
  }
  return balances;
}

function buildBalanceSheet(accounts, balanceByCode, asOfDate) {
  const rows = [];
  let assetsCents = 0;
  let liabilitiesCents = 0;
  let equityCents = 0;
  let incomeCents = 0;
  let expenseCents = 0;

  for (const a of accounts.filter((x) => x.isPosting)) {
    const bal = balanceByCode.get(a.code) || 0;
    if (bal === 0) continue;

    if (a.type === 'asset') {
      assetsCents += bal;
      rows.push({
        section: 'asset',
        code: a.code,
        name: a.name,
        amountCents: bal,
      });
    } else if (a.type === 'liability') {
      // credit-normal → display as positive liability
      liabilitiesCents += -bal;
      rows.push({
        section: 'liability',
        code: a.code,
        name: a.name,
        amountCents: -bal,
      });
    } else if (a.type === 'equity') {
      equityCents += -bal;
      rows.push({
        section: 'equity',
        code: a.code,
        name: a.name,
        amountCents: -bal,
      });
    } else if (a.type === 'income') {
      incomeCents += -bal;
    } else if (a.type === 'expense') {
      expenseCents += bal;
    }
  }

  const netEarningsCents = incomeCents - expenseCents;
  if (netEarningsCents !== 0) {
    rows.push({
      section: 'equity',
      code: 'CYE',
      name: 'Current earnings (to date)',
      amountCents: netEarningsCents,
    });
    equityCents += netEarningsCents;
  }

  const financingCents = liabilitiesCents + equityCents;
  return {
    asOfDate,
    rows,
    totals: {
      assetsCents,
      liabilitiesCents,
      equityCents,
      netEarningsCents,
      financingCents,
      differenceCents: assetsCents - financingCents,
    },
  };
}

async function exportFinancePack(db, { startDate, endDate }) {
  if (
    typeof startDate !== 'string'
    || typeof endDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)
    || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    || startDate > endDate
  ) {
    throw Object.assign(new Error('startDate and endDate must be YYYY-MM-DD with start ≤ end.'), {
      code: 'invalid-argument',
    });
  }

  const [accountsSnap, journalsSnap, journalsToDateSnap] = await Promise.all([
    db.collection('accounts').orderBy('sortOrder', 'asc').get(),
    db
      .collection('journals')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'asc')
      .get(),
    db
      .collection('journals')
      .where('date', '<=', endDate)
      .orderBy('date', 'asc')
      .get(),
  ]);

  const accounts = accountsSnap.docs.map((d) => ({ code: d.id, ...d.data() }));
  const journals = journalsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const journalsToDate = journalsToDateSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
  const balanceSheet = buildBalanceSheet(
    accounts,
    accumulateJournalBalances(journalsToDate),
    endDate,
  );

  const trialBalance = accounts
    .filter((a) => a.isPosting)
    .map((a) => {
      const bal = a.balanceCents || 0;
      return {
        code: a.code,
        name: a.name,
        type: a.type,
        debitCents: bal > 0 ? bal : 0,
        creditCents: bal < 0 ? -bal : 0,
        balanceCents: bal,
      };
    });

  const activityByAccount = new Map();
  const glDetail = [];
  let vatOutputCents = 0;
  let vatInputCents = 0;

  const vatOutputCodes = new Set(
    accounts.filter((a) => a.systemTag === 'vat_output').map((a) => a.code),
  );
  const vatInputCodes = new Set(
    accounts.filter((a) => a.systemTag === 'vat_input').map((a) => a.code),
  );

  for (const j of journals) {
    for (const line of j.lines || []) {
      glDetail.push({
        date: j.date,
        journalNumber: j.number,
        journalId: j.id,
        source: j.source,
        memo: j.memo,
        accountCode: line.accountCode,
        lineMemo: line.memo || '',
        debitCents: line.debitCents || 0,
        creditCents: line.creditCents || 0,
      });

      const cur = activityByAccount.get(line.accountCode) || {
        debitCents: 0,
        creditCents: 0,
      };
      cur.debitCents += line.debitCents || 0;
      cur.creditCents += line.creditCents || 0;
      activityByAccount.set(line.accountCode, cur);

      if (vatOutputCodes.has(line.accountCode)) {
        vatOutputCents += (line.creditCents || 0) - (line.debitCents || 0);
      }
      if (vatInputCodes.has(line.accountCode)) {
        vatInputCents += (line.debitCents || 0) - (line.creditCents || 0);
      }
    }
  }

  const incomeStatement = [];
  for (const a of accounts.filter((x) => x.isPosting && (x.type === 'income' || x.type === 'expense'))) {
    const act = activityByAccount.get(a.code) || { debitCents: 0, creditCents: 0 };
    const net =
      a.type === 'income'
        ? act.creditCents - act.debitCents
        : act.debitCents - act.creditCents;
    if (act.debitCents === 0 && act.creditCents === 0) continue;
    incomeStatement.push({
      code: a.code,
      name: a.name,
      type: a.type,
      debitCents: act.debitCents,
      creditCents: act.creditCents,
      netCents: net,
    });
  }

  const incomeTotal = incomeStatement
    .filter((r) => r.type === 'income')
    .reduce((s, r) => s + r.netCents, 0);
  const expenseTotal = incomeStatement
    .filter((r) => r.type === 'expense')
    .reduce((s, r) => s + r.netCents, 0);

  return {
    meta: {
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
      currency: 'ZAR',
      notes: [
        'Trial balance is a current ledger snapshot, not a reconstructed as-of-date TB.',
        'Balance sheet is reconstructed from all journals with date ≤ endDate (includes current earnings line).',
        'VAT figures are control-account movements in the date range — confirm VAT201 mapping with an accountant.',
        'Amounts are integer ZAR cents.',
      ],
    },
    trialBalance,
    incomeStatement: {
      rows: incomeStatement,
      incomeTotalCents: incomeTotal,
      expenseTotalCents: expenseTotal,
      netProfitCents: incomeTotal - expenseTotal,
    },
    balanceSheet,
    generalLedger: glDetail,
    vatSummary: {
      outputCents: vatOutputCents,
      inputCents: vatInputCents,
      netPayableCents: vatOutputCents - vatInputCents,
    },
    journalCount: journals.length,
  };
}

module.exports = { exportFinancePack, buildBalanceSheet, accumulateJournalBalances };
