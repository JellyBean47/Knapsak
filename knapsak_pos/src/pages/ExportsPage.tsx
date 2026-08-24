import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { formatZar } from '../domain/money';
import { canManageBooks } from '../domain/roles';
import type { FinanceExportPack } from '../domain/types';
import { exportFinancePack } from '../services/financeApi';
import { centsCell, downloadText, toCsv } from '../utils/csv';

function todaySA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
  }).format(new Date());
}

function monthStartSA(): string {
  const t = todaySA();
  return `${t.slice(0, 7)}-01`;
}

export function ExportsPage() {
  const { posRole } = useAuth();
  const [startDate, setStartDate] = useState(monthStartSA);
  const [endDate, setEndDate] = useState(todaySA);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pack, setPack] = useState<FinanceExportPack | null>(null);

  async function onExport() {
    setBusy(true);
    setError(null);
    try {
      const data = await exportFinancePack({ startDate, endDate });
      setPack(data);
    } catch (err) {
      setError((err as { message?: string }).message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  function downloadAll() {
    if (!pack) return;
    const prefix = `knapsak_${pack.meta.startDate}_${pack.meta.endDate}`;

    downloadText(
      `${prefix}_trial_balance.csv`,
      toCsv(
        pack.trialBalance.map((r) => ({
          code: r.code,
          name: r.name,
          type: r.type,
          debit: centsCell(r.debitCents),
          credit: centsCell(r.creditCents),
        })),
      ),
    );

    downloadText(
      `${prefix}_income_statement.csv`,
      toCsv(
        pack.incomeStatement.rows.map((r) => ({
          code: r.code,
          name: r.name,
          type: r.type,
          debit: centsCell(r.debitCents),
          credit: centsCell(r.creditCents),
          net: centsCell(r.netCents),
        })),
      ),
    );

    downloadText(
      `${prefix}_general_ledger.csv`,
      toCsv(
        pack.generalLedger.map((r) => ({
          date: r.date,
          journal: r.journalNumber,
          account: r.accountCode,
          source: r.source,
          memo: r.memo,
          lineMemo: r.lineMemo,
          debit: centsCell(r.debitCents),
          credit: centsCell(r.creditCents),
        })),
      ),
    );

    downloadText(
      `${prefix}_vat_summary.csv`,
      toCsv([
        {
          output: centsCell(pack.vatSummary.outputCents),
          input: centsCell(pack.vatSummary.inputCents),
          netPayable: centsCell(pack.vatSummary.netPayableCents),
        },
      ]),
    );

    if (pack.balanceSheet) {
      downloadText(
        `${prefix}_balance_sheet.csv`,
        toCsv(
          pack.balanceSheet.rows.map((r) => ({
            section: r.section,
            code: r.code,
            name: r.name,
            amount: centsCell(r.amountCents),
          })),
        ),
      );
    }
  }

  if (!canManageBooks(posRole)) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Exports</h1>
          <p className="muted">Owner, manager, or accountant access required.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Finance exports</h1>
        <p className="muted">
          Trial balance (current), income statement, dated balance sheet (as-of end date), GL, VAT — CSV pack.
        </p>
      </header>

      <section className="panel form-grid export-form">
        <label className="field">
          <span>From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span>To</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void onExport()}
        >
          {busy ? 'Building…' : 'Build pack'}
        </button>
        {pack && (
          <button type="button" className="btn btn-ghost" onClick={downloadAll}>
            Download CSVs
          </button>
        )}
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      {pack && (
        <section className="card-grid">
          <article className="panel">
            <h2>Summary</h2>
            <ul className="checklist">
              <li>Journals in range: {pack.journalCount}</li>
              <li>Income: {formatZar(pack.incomeStatement.incomeTotalCents)}</li>
              <li>Expenses: {formatZar(pack.incomeStatement.expenseTotalCents)}</li>
              <li>Net profit: {formatZar(pack.incomeStatement.netProfitCents)}</li>
              {pack.balanceSheet && (
                <>
                  <li>
                    BS assets ({pack.balanceSheet.asOfDate}):{' '}
                    {formatZar(pack.balanceSheet.totals.assetsCents)}
                  </li>
                  <li>
                    BS equity + liab:{' '}
                    {formatZar(pack.balanceSheet.totals.financingCents)}
                  </li>
                  <li>
                    BS difference:{' '}
                    {formatZar(pack.balanceSheet.totals.differenceCents)}
                  </li>
                </>
              )}
              <li>VAT output: {formatZar(pack.vatSummary.outputCents)}</li>
              <li>VAT input: {formatZar(pack.vatSummary.inputCents)}</li>
              <li>VAT net: {formatZar(pack.vatSummary.netPayableCents)}</li>
            </ul>
          </article>
          <article className="panel">
            <h2>Notes</h2>
            <ul className="checklist">
              {pack.meta.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </article>
        </section>
      )}
    </div>
  );
}
