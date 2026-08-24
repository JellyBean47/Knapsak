import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { formatZar } from '../domain/money';
import { canManageCustomers } from '../domain/roles';
import type { Customer } from '../domain/types';
import { db } from '../firebase';
import { upsertCustomer } from '../services/financeApi';

export function CustomersPage() {
  const { posRole } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [terms, setTerms] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        setCustomers(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Customer),
        );
      },
      (err) => setError(err.message),
    );
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const paymentTermsDays = Number.parseInt(terms, 10);
      const res = await upsertCustomer({
        name,
        email: email || undefined,
        phone: phone || undefined,
        vatNumber: vatNumber || undefined,
        paymentTermsDays: Number.isInteger(paymentTermsDays)
          ? paymentTermsDays
          : 30,
      });
      setMessage(`Saved customer ${res.id}`);
      setName('');
      setEmail('');
      setPhone('');
      setVatNumber('');
      setTerms('30');
    } catch (err) {
      setError((err as { message?: string }).message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Customers</h1>
        <p className="muted">Debtors for credit invoices and statements.</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      {canManageCustomers(posRole) && (
        <form className="panel form-grid" onSubmit={(e) => void onSubmit(e)}>
          <h2>Add customer</h2>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="field">
            <span>VAT number</span>
            <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
          </label>
          <label className="field">
            <span>Payment terms (days)</span>
            <input value={terms} onChange={(e) => setTerms(e.target.value)} inputMode="numeric" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      {customers.length === 0 ? (
        <p className="muted">No customers yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Terms</th>
                <th className="num">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="muted">{c.email || '—'}</td>
                  <td className="muted">{c.phone || '—'}</td>
                  <td className="mono muted">{c.paymentTermsDays ?? 30}d</td>
                  <td className="num mono">{formatZar(c.balanceCents || 0)}</td>
                  <td>
                    <span className={`status-pill ${c.isActive === false ? 'status-closed' : ''}`}>
                      {c.isActive === false ? 'inactive' : 'active'}
                    </span>
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
