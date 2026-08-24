import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { formatZar, sumDebits } from '../domain/money';
import type { JournalEntry } from '../domain/types';
import { db } from '../firebase';

export function JournalsPage() {
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'journals'),
      orderBy('number', 'desc'),
      limit(100),
    );
    return onSnapshot(
      q,
      (snap) => {
        setJournals(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as JournalEntry),
        );
        setError(null);
      },
      (err) => setError(err.message),
    );
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Journals</h1>
        <p className="muted">
          Posted entries are immutable. Corrections use reversing journals.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {journals.length === 0 && !error && (
        <p className="muted">No journals posted yet.</p>
      )}

      <div className="stack">
        {journals.map((j) => (
          <article key={j.id} className="panel journal-card">
            <div className="journal-head">
              <strong className="mono">#{j.number}</strong>
              <span className="muted">{j.date}</span>
              <span className="status-pill">{j.source}</span>
              <span className="mono muted">{j.periodId}</span>
            </div>
            <p>{j.memo}</p>
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {j.lines.map((line, idx) => (
                  <tr key={`${j.id}-${idx}`}>
                    <td className="mono">{line.accountCode}</td>
                    <td className="num mono">
                      {line.debitCents ? formatZar(line.debitCents) : ''}
                    </td>
                    <td className="num mono">
                      {line.creditCents ? formatZar(line.creditCents) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num mono">{formatZar(sumDebits(j.lines))}</td>
                  <td className="num mono">{formatZar(sumDebits(j.lines))}</td>
                </tr>
              </tfoot>
            </table>
          </article>
        ))}
      </div>
    </div>
  );
}
