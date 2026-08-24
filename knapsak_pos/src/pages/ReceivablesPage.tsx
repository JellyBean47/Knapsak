import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FinanceTimeline } from '../components/FinanceTimeline';
import { formatZar } from '../domain/money';
import { canManageReceivables } from '../domain/roles';
import type {
  Customer,
  CustomerInvoice,
  CustomerPayment,
  InventoryItem,
} from '../domain/types';
import { db } from '../firebase';
import {
  postCustomerInvoice,
  receiveCustomerPayment,
  recordInvoiceReminder,
} from '../services/financeApi';

interface DraftLine {
  itemId: string;
  qty: string;
}

export function ReceivablesPage() {
  const { posRole } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { itemId: '', qty: '1' },
  ]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [statementCustomerId, setStatementCustomerId] = useState('');
  const [statementInvoices, setStatementInvoices] = useState<CustomerInvoice[]>([]);
  const [statementPayments, setStatementPayments] = useState<CustomerPayment[]>([]);
  const [payAmount, setPayAmount] = useState<Record<string, string>>({});
  const [tender, setTender] = useState<Record<string, 'bank' | 'cash' | 'card'>>({});
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubs = [
      onSnapshot(query(collection(db, 'customers'), orderBy('name')), (snap) => {
        setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Customer));
      }),
      onSnapshot(query(collection(db, 'inventoryItems'), orderBy('name')), (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InventoryItem));
      }),
      onSnapshot(
        query(collection(db, 'customerInvoices'), orderBy('number', 'desc')),
        (snap) => {
          const list = snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as CustomerInvoice,
          );
          setInvoices(list);
          const amts: Record<string, string> = {};
          const tends: Record<string, 'bank' | 'cash' | 'card'> = {};
          for (const inv of list) {
            amts[inv.id] = ((inv.balanceCents ?? inv.totalCents - (inv.paidCents || 0)) / 100).toFixed(2);
            tends[inv.id] = 'bank';
          }
          setPayAmount((prev) => ({ ...amts, ...prev }));
          setTender((prev) => ({ ...tends, ...prev }));
        },
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!statementCustomerId) {
      setStatementInvoices([]);
      setStatementPayments([]);
      return;
    }
    const unsubs = [
      onSnapshot(
        query(
          collection(db, 'customerInvoices'),
          where('customerId', '==', statementCustomerId),
          orderBy('invoiceDate', 'desc'),
        ),
        (snap) => {
          setStatementInvoices(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CustomerInvoice),
          );
        },
        (err) => setError(err.message),
      ),
      onSnapshot(
        query(
          collection(db, 'customerPayments'),
          where('customerId', '==', statementCustomerId),
          orderBy('date', 'desc'),
        ),
        (snap) => {
          setStatementPayments(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CustomerPayment),
          );
        },
        (err) => setError(err.message),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [statementCustomerId]);

  const statementBalance = useMemo(() => {
    const cust = customers.find((c) => c.id === statementCustomerId);
    return cust?.balanceCents || 0;
  }, [customers, statementCustomerId]);

  async function onCreateInvoice(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const lines = draftLines
        .filter((l) => l.itemId)
        .map((l) => ({
          itemId: l.itemId,
          qty: Number.parseInt(l.qty, 10),
        }));
      if (!customerId || lines.length === 0) {
        throw new Error('Pick a customer and at least one line.');
      }
      if (lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0)) {
        throw new Error('Quantities must be positive integers.');
      }
      const res = await postCustomerInvoice({ customerId, lines });
      setMessage(
        `Invoice #${res.number} · ${formatZar(res.totalCents)} · journal posted`,
      );
      setDraftLines([{ itemId: '', qty: '1' }]);
      setSelectedInvoiceId(res.invoiceId);
    } catch (err) {
      setError((err as { message?: string }).message || 'Could not create invoice.');
    } finally {
      setBusy(false);
    }
  }

  function todaySA(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Johannesburg',
    }).format(new Date());
  }

  const overdueInvoices = useMemo(() => {
    const today = todaySA();
    return invoices.filter((inv) => {
      const balance = inv.balanceCents ?? inv.totalCents - (inv.paidCents || 0);
      return balance > 0 && inv.status !== 'void' && inv.dueDate < today;
    });
  }, [invoices]);

  async function onRemind(inv: CustomerInvoice) {
    setBusyId(inv.id);
    setError(null);
    setMessage(null);
    try {
      const res = await recordInvoiceReminder({
        invoiceId: inv.id,
        channel: 'manual',
      });
      setMessage(res.statementText.replace(/\n/g, ' · '));
      setSelectedInvoiceId(inv.id);
      await navigator.clipboard?.writeText(res.statementText);
    } catch (err) {
      setError((err as { message?: string }).message || 'Reminder failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function onPay(inv: CustomerInvoice) {
    setBusyId(inv.id);
    setError(null);
    setMessage(null);
    try {
      const amountCents = Math.round(Number.parseFloat(payAmount[inv.id] || '0') * 100);
      const res = await receiveCustomerPayment({
        invoiceId: inv.id,
        amountCents,
        tender: tender[inv.id] || 'bank',
      });
      setMessage(
        `Payment #${res.number} · ${formatZar(res.amountCents)} · balance ${formatZar(res.invoiceBalanceCents)}`,
      );
      setSelectedInvoiceId(inv.id);
    } catch (err) {
      setError((err as { message?: string }).message || 'Payment failed.');
    } finally {
      setBusyId(null);
    }
  }

  if (!canManageReceivables(posRole)) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Receivables</h1>
          <p className="muted">Owner, manager, or accountant access required.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Receivables</h1>
        <p className="muted">
          Credit invoices, receipts, and customer statements — all post to AR.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      <form className="panel form-grid" onSubmit={(e) => void onCreateInvoice(e)}>
        <h2>New invoice</h2>
        <label className="field">
          <span>Customer</span>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {customers
              .filter((c) => c.isActive !== false)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>

        {draftLines.map((line, idx) => (
          <div key={idx} className="btn-row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 2 }}>
              <span>Item</span>
              <select
                value={line.itemId}
                onChange={(e) => {
                  const next = [...draftLines];
                  next[idx] = { ...line, itemId: e.target.value };
                  setDraftLines(next);
                }}
              >
                <option value="">Select…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {formatZar(item.sellPriceCents)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Qty</span>
              <input
                value={line.qty}
                onChange={(e) => {
                  const next = [...draftLines];
                  next[idx] = { ...line, qty: e.target.value };
                  setDraftLines(next);
                }}
                inputMode="numeric"
              />
            </label>
          </div>
        ))}

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setDraftLines([...draftLines, { itemId: '', qty: '1' }])
            }
          >
            Add line
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Posting…' : 'Post invoice'}
          </button>
        </div>
      </form>

      {overdueInvoices.length > 0 && (
        <section className="panel">
          <h2>Overdue — reminders</h2>
          <p className="muted">
            Logs a reminder on the invoice timeline and copies statement text to the clipboard.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Due</th>
                  <th className="num">Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overdueInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono">#{inv.number}</td>
                    <td>{inv.customerName}</td>
                    <td className="text-danger">{inv.dueDate}</td>
                    <td className="num mono">
                      {formatZar(inv.balanceCents ?? inv.totalCents)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyId === inv.id}
                        onClick={() => void onRemind(inv)}
                      >
                        {busyId === inv.id ? '…' : 'Log reminder'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Open invoices</h2>
        {invoices.length === 0 ? (
          <p className="muted">No invoices yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th className="num">Total</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                  <th>Receive</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const balance =
                    inv.balanceCents ?? inv.totalCents - (inv.paidCents || 0);
                  const open = balance > 0 && inv.status !== 'void';
                  return (
                    <tr
                      key={inv.id}
                      className={selectedInvoiceId === inv.id ? 'row-selected' : ''}
                      onClick={() => setSelectedInvoiceId(inv.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="mono">#{inv.number}</td>
                      <td>{inv.customerName}</td>
                      <td>{inv.invoiceDate}</td>
                      <td>{inv.dueDate}</td>
                      <td className="num mono">{formatZar(inv.totalCents)}</td>
                      <td className="num mono">{formatZar(balance)}</td>
                      <td>
                        <span
                          className={`status-pill ${inv.status === 'paid' ? '' : 'status-closed'}`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {open ? (
                          <div className="pay-controls">
                            <input
                              className="qty-input"
                              value={payAmount[inv.id] || ''}
                              onChange={(e) =>
                                setPayAmount({ ...payAmount, [inv.id]: e.target.value })
                              }
                            />
                            <select
                              value={tender[inv.id] || 'bank'}
                              onChange={(e) =>
                                setTender({
                                  ...tender,
                                  [inv.id]: e.target.value as 'bank' | 'cash' | 'card',
                                })
                              }
                            >
                              <option value="bank">Bank</option>
                              <option value="cash">Cash</option>
                              <option value="card">Card</option>
                            </select>
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={busyId === inv.id}
                              onClick={() => void onPay(inv)}
                            >
                              {busyId === inv.id ? '…' : 'Receive'}
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
      </section>

      {selectedInvoiceId && (
        <FinanceTimeline
          anchorType="customer_invoice"
          anchorId={selectedInvoiceId}
          title="Invoice timeline"
        />
      )}

      <section className="panel">
        <h2>Customer statement</h2>
        <label className="field">
          <span>Customer</span>
          <select
            value={statementCustomerId}
            onChange={(e) => setStatementCustomerId(e.target.value)}
          >
            <option value="">Select…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {statementCustomerId && (
          <>
            <p>
              Outstanding balance:{' '}
              <strong className="mono">{formatZar(statementBalance)}</strong>
            </p>
            <h3>Invoices</h3>
            {statementInvoices.length === 0 ? (
              <p className="muted">No invoices.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>Due</th>
                      <th className="num">Total</th>
                      <th className="num">Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="mono">{inv.number}</td>
                        <td>{inv.invoiceDate}</td>
                        <td>{inv.dueDate}</td>
                        <td className="num mono">{formatZar(inv.totalCents)}</td>
                        <td className="num mono">{formatZar(inv.balanceCents)}</td>
                        <td>{inv.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h3>Payments</h3>
            {statementPayments.length === 0 ? (
              <p className="muted">No payments.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>Invoice</th>
                      <th>Tender</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementPayments.map((p) => (
                      <tr key={p.id}>
                        <td className="mono">{p.number}</td>
                        <td>{p.date}</td>
                        <td className="mono">#{p.invoiceNumber ?? '—'}</td>
                        <td>{p.tender}</td>
                        <td className="num mono">{formatZar(p.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
