import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FinanceTimeline } from '../components/FinanceTimeline';
import { formatZar } from '../domain/money';
import { canBank } from '../domain/roles';
import type { SupplierBill } from '../domain/types';
import { db } from '../firebase';
import { paySupplierBill } from '../services/financeApi';

export function BillsPage() {
  const { posRole } = useAuth();
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState<Record<string, string>>({});
  const [tender, setTender] = useState<Record<string, 'bank' | 'cash'>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'supplierBills'), orderBy('number', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as SupplierBill,
        );
        setBills(list);
        const amts: Record<string, string> = {};
        const tends: Record<string, 'bank' | 'cash'> = {};
        for (const b of list) {
          amts[b.id] = ((b.balanceCents ?? b.totalCents - (b.paidCents || 0)) / 100).toFixed(2);
          tends[b.id] = 'bank';
        }
        setPayAmount((prev) => ({ ...amts, ...prev }));
        setTender((prev) => ({ ...tends, ...prev }));
      },
      (err) => setError(err.message),
    );
  }, []);

  async function onPay(bill: SupplierBill) {
    setBusyId(bill.id);
    setError(null);
    setMessage(null);
    try {
      const amountCents = Math.round(Number.parseFloat(payAmount[bill.id] || '0') * 100);
      const res = await paySupplierBill({
        billId: bill.id,
        amountCents,
        tender: tender[bill.id] || 'bank',
      });
      setMessage(
        `Payment #${res.number} · ${formatZar(res.amountCents)} · balance ${formatZar(res.billBalanceCents)}`,
      );
      setSelectedBillId(bill.id);
    } catch (err) {
      setError((err as { message?: string }).message || 'Payment failed.');
    } finally {
      setBusyId(null);
    }
  }

  const selectedBill = bills.find((b) => b.id === selectedBillId) || null;

  if (!canBank(posRole)) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Supplier bills</h1>
          <p className="muted">Books access required.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Supplier bills</h1>
        <p className="muted">Pay from bank or cash — clears accounts payable.</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      {bills.length === 0 ? (
        <p className="muted">No bills yet. Create one from a GRN on Purchasing.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Supplier</th>
                <th>Date</th>
                <th className="num">Total</th>
                <th className="num">Balance</th>
                <th>Status</th>
                <th>Pay</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const balance = b.balanceCents ?? b.totalCents - (b.paidCents || 0);
                const open = balance > 0 && b.status !== 'void';
                return (
                  <tr
                    key={b.id}
                    className={selectedBillId === b.id ? 'row-selected' : ''}
                    onClick={() => setSelectedBillId(b.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="mono">#{b.number}</td>
                    <td>{b.supplierName}</td>
                    <td>{b.billDate}</td>
                    <td className="num mono">{formatZar(b.totalCents)}</td>
                    <td className="num mono">{formatZar(balance)}</td>
                    <td>
                      <span className={`status-pill ${b.status === 'paid' ? '' : 'status-closed'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {open ? (
                        <div className="pay-controls">
                          <input
                            className="qty-input"
                            value={payAmount[b.id] || ''}
                            onChange={(e) =>
                              setPayAmount({ ...payAmount, [b.id]: e.target.value })
                            }
                          />
                          <select
                            value={tender[b.id] || 'bank'}
                            onChange={(e) =>
                              setTender({
                                ...tender,
                                [b.id]: e.target.value as 'bank' | 'cash',
                              })
                            }
                          >
                            <option value="bank">Bank</option>
                            <option value="cash">Cash</option>
                          </select>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busyId === b.id}
                            onClick={() => void onPay(b)}
                          >
                            {busyId === b.id ? '…' : 'Pay'}
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedBill && (
        <FinanceTimeline
          anchorType="supplier_bill"
          anchorId={selectedBill.id}
          title={`Bill #${selectedBill.number} timeline`}
        />
      )}
    </div>
  );
}
