import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FinanceTimeline } from '../components/FinanceTimeline';
import { formatZar } from '../domain/money';
import { canBank } from '../domain/roles';
import type { BankLine, SupplierPayment } from '../domain/types';
import { db } from '../firebase';
import {
  ensurePhase2Accounts,
  importBankStatement,
  reconcileBankLine,
} from '../services/financeApi';

/**
 * Parse simple CSV: date,description,amount[,reference]
 * Amount: positive = money in, negative = money out (or use minus sign).
 */
function parseBankCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Array<{
    date: string;
    description: string;
    amountCents: number;
    reference?: string;
  }> = [];

  for (const raw of lines) {
    if (/^date\s*,/i.test(raw)) continue;
    const parts = raw.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 3) continue;
    const [date, description, amountStr, reference] = parts;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const amount = Number.parseFloat(amountStr.replace(/[^0-9.+-]/g, ''));
    if (!Number.isFinite(amount) || amount === 0) continue;
    out.push({
      date,
      description,
      amountCents: Math.round(amount * 100),
      reference: reference || undefined,
    });
  }
  return out;
}

export function BankingPage() {
  const { posRole } = useAuth();
  const [csv, setCsv] = useState(
    'date,description,amount,reference\n2026-07-19,Card batch deposit,1500.00,\n2026-07-19,Supplier payment ACME,-450.00,INV-1\n',
  );
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  const [matchedLines, setMatchedLines] = useState<BankLine[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [matchPaymentId, setMatchPaymentId] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsubs = [
      onSnapshot(
        query(collection(db, 'bankLines'), orderBy('date', 'desc'), limit(200)),
        (snap) => {
          setBankLines(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }) as BankLine)
              .filter((l) => l.status === 'unmatched'),
          );
        },
        (err) => setError(err.message),
      ),
      onSnapshot(
        query(
          collection(db, 'bankLines'),
          where('status', '==', 'matched'),
          orderBy('date', 'desc'),
          limit(30),
        ),
        (snap) => {
          setMatchedLines(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BankLine),
          );
        },
      ),
      onSnapshot(
        query(
          collection(db, 'supplierPayments'),
          orderBy('number', 'desc'),
          limit(100),
        ),
        (snap) => {
          setPayments(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }) as SupplierPayment)
              .filter((p) => p.tender === 'bank' && !p.bankMatched),
          );
        },
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const unmatchedPayments = useMemo(() => payments, [payments]);

  async function onImport() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await ensurePhase2Accounts();
      const lines = parseBankCsv(csv);
      if (lines.length === 0) throw new Error('No valid CSV lines found.');
      const res = await importBankStatement({ lines, label: 'Manual CSV import' });
      setMessage(`Imported statement #${res.number} · ${res.lineCount} lines`);
    } catch (err) {
      setError((err as { message?: string }).message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onReconcile(
    line: BankLine,
    matchType: 'supplier_payment' | 'card_clearing' | 'ignore',
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await reconcileBankLine({
        bankLineId: line.id,
        matchType,
        matchRef:
          matchType === 'supplier_payment'
            ? matchPaymentId[line.id]
            : undefined,
      });
      setMessage(`Line ${line.description}: ${res.status}`);
      if (res.status === 'matched') setSelectedLineId(line.id);
    } catch (err) {
      setError((err as { message?: string }).message || 'Reconcile failed.');
    } finally {
      setBusy(false);
    }
  }

  const selectedMatched = matchedLines.find((l) => l.id === selectedLineId) || null;

  if (!canBank(posRole)) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Banking</h1>
          <p className="muted">Books access required.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Banking</h1>
        <p className="muted">
          Import statement CSV, then match payments or clear card deposits.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      <section className="panel stack-form">
        <h2>Import CSV</h2>
        <p className="muted small">
          Columns: date (YYYY-MM-DD), description, amount (ZAR), optional reference.
          Positive = money in, negative = money out.
        </p>
        <textarea
          className="csv-input"
          rows={6}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void onImport()}
        >
          {busy ? 'Importing…' : 'Import statement'}
        </button>
      </section>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h2>Unmatched lines</h2>
        {bankLines.length === 0 ? (
          <p className="muted">Nothing waiting to reconcile.</p>
        ) : (
          <div className="table-wrap bare">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th>Match</th>
                </tr>
              </thead>
              <tbody>
                {bankLines.map((line) => (
                  <tr key={line.id}>
                    <td className="mono">{line.date}</td>
                    <td>{line.description}</td>
                    <td className="num mono">{formatZar(line.amountCents)}</td>
                    <td>
                      <div className="recon-controls">
                        {line.amountCents < 0 && (
                          <>
                            <select
                              value={matchPaymentId[line.id] || ''}
                              onChange={(e) =>
                                setMatchPaymentId({
                                  ...matchPaymentId,
                                  [line.id]: e.target.value,
                                })
                              }
                            >
                              <option value="">Supplier payment…</option>
                              {unmatchedPayments
                                .filter((p) => p.amountCents === -line.amountCents)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    #{p.number} {p.supplierName}{' '}
                                    {formatZar(p.amountCents)}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={busy || !matchPaymentId[line.id]}
                              onClick={() =>
                                void onReconcile(line, 'supplier_payment')
                              }
                            >
                              Match payment
                            </button>
                          </>
                        )}
                        {line.amountCents > 0 && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busy}
                            onClick={() => void onReconcile(line, 'card_clearing')}
                          >
                            Clear card clearing
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void onReconcile(line, 'ignore')}
                        >
                          Ignore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h2>Recently matched</h2>
        {matchedLines.length === 0 ? (
          <p className="muted">No matched lines yet.</p>
        ) : (
          <ul className="selectable-list">
            {matchedLines.map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  className={selectedLineId === line.id ? 'active' : ''}
                  onClick={() => setSelectedLineId(line.id)}
                >
                  <strong>{line.description}</strong>
                  <span className="muted">
                    {line.date} · {formatZar(line.amountCents)} · {line.matchType}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selectedMatched && (
          <FinanceTimeline
            anchorType="bank_line"
            anchorId={selectedMatched.id}
            title="Bank line timeline"
          />
        )}
      </section>
    </div>
  );
}
