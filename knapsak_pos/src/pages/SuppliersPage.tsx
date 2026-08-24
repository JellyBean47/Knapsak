import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { canPurchase } from '../domain/roles';
import type { Supplier } from '../domain/types';
import { db } from '../firebase';
import { upsertSupplier } from '../services/financeApi';

export function SuppliersPage() {
  const { posRole } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        setSuppliers(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Supplier),
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
      const res = await upsertSupplier({
        name,
        email: email || undefined,
        phone: phone || undefined,
        vatNumber: vatNumber || undefined,
      });
      setMessage(`Saved supplier ${res.id}`);
      setName('');
      setEmail('');
      setPhone('');
      setVatNumber('');
    } catch (err) {
      setError((err as { message?: string }).message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Suppliers</h1>
        <p className="muted">Creditors for POs, GRNs, and bills.</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      {canPurchase(posRole) && (
        <form className="panel form-grid" onSubmit={(e) => void onSubmit(e)}>
          <h2>Add supplier</h2>
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
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      {suppliers.length === 0 ? (
        <p className="muted">No suppliers yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>VAT</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="muted">{s.email || '—'}</td>
                  <td className="muted">{s.phone || '—'}</td>
                  <td className="mono muted">{s.vatNumber || '—'}</td>
                  <td>
                    <span className={`status-pill ${s.isActive === false ? 'status-closed' : ''}`}>
                      {s.isActive === false ? 'inactive' : 'active'}
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
