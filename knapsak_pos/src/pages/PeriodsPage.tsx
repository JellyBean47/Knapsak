import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { formatZar } from '../domain/money';
import { canCloseFiscalYear, canClosePeriod } from '../domain/roles';
import type { FinancialPeriod } from '../domain/types';
import { db } from '../firebase';
import { closeFiscalYear, closePeriod } from '../services/financeApi';

function todaySA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
  }).format(new Date());
}

export function PeriodsPage() {
  const { posRole } = useAuth();
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fyBusy, setFyBusy] = useState(false);
  const [fyYear, setFyYear] = useState(String(new Date().getFullYear()));

  useEffect(() => {
    const q = query(collection(db, 'periods'), orderBy('startDate', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setPeriods(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FinancialPeriod),
        );
        setError(null);
      },
      (err) => setError(err.message),
    );
  }, []);

  const fiscalYears = useMemo(() => {
    const set = new Set(periods.map((p) => p.fiscalYear));
    return [...set].sort((a, b) => b - a);
  }, [periods]);

  async function onClose(periodId: string) {
    if (!window.confirm(`Close period ${periodId}? Journals can no longer post into it.`)) {
      return;
    }
    setBusyId(periodId);
    setError(null);
    setMessage(null);
    try {
      await closePeriod({ periodId });
      setMessage(`Period ${periodId} closed.`);
    } catch (err) {
      setError((err as { message?: string }).message || 'Close failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function onYearEnd() {
    const fiscalYear = Number.parseInt(fyYear, 10);
    if (!Number.isInteger(fiscalYear)) {
      setError('Invalid fiscal year.');
      return;
    }
    if (
      !window.confirm(
        `Close FY ${fiscalYear}? This soft-closes open months and posts P&L into retained earnings.`,
      )
    ) {
      return;
    }
    setFyBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await closeFiscalYear({
        fiscalYear,
        asOfDate: todaySA(),
      });
      setMessage(
        `FY ${res.fiscalYear} closed · net to RE ${formatZar(res.netToRetainedEarningsCents)}`
        + (res.journalNumber != null ? ` · journal #${res.journalNumber}` : ''),
      );
    } catch (err) {
      setError((err as { message?: string }).message || 'Year-end failed.');
    } finally {
      setFyBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Financial periods</h1>
        <p className="muted">
          Journals post only into open periods. Close months soft; year-end posts to retained earnings.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      {canCloseFiscalYear(posRole) && (
        <section className="panel form-grid">
          <h2>Year-end close</h2>
          <label className="field">
            <span>Fiscal year</span>
            <select value={fyYear} onChange={(e) => setFyYear(e.target.value)}>
              {(fiscalYears.length ? fiscalYears : [new Date().getFullYear()]).map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={fyBusy}
            onClick={() => void onYearEnd()}
          >
            {fyBusy ? 'Closing…' : 'Close fiscal year'}
          </button>
        </section>
      )}

      {!error && periods.length === 0 && (
        <p className="muted">No periods yet. Bootstrap finance from the dashboard.</p>
      )}

      {periods.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Range</th>
                <th>FY</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.id}</td>
                  <td>
                    {p.startDate} → {p.endDate}
                  </td>
                  <td>{p.fiscalYear}</td>
                  <td>
                    <span className={`status-pill status-${p.status}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    {p.status === 'open' && canClosePeriod(posRole) ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === p.id}
                        onClick={() => void onClose(p.id)}
                      >
                        {busyId === p.id ? '…' : 'Close'}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
