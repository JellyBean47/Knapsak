import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { formatZar } from '../domain/money';
import type { Account } from '../domain/types';
import { db } from '../firebase';

export function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'accounts'), orderBy('sortOrder', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        setAccounts(snap.docs.map((d) => d.data() as Account));
        setError(null);
      },
      (err) => setError(err.message),
    );
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Chart of Accounts</h1>
        <p className="muted">SA retail defaults — balances update when journals post.</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {!error && accounts.length === 0 && (
        <p className="muted">No accounts yet. Bootstrap finance from the dashboard.</p>
      )}

      {accounts.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Tag</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.code} className={a.isPosting ? '' : 'row-header'}>
                  <td className="mono">{a.code}</td>
                  <td>{a.name}</td>
                  <td>{a.type}</td>
                  <td className="mono muted">{a.systemTag ?? '—'}</td>
                  <td className="num mono">
                    {a.isPosting ? formatZar(a.balanceCents ?? 0) : ''}
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
