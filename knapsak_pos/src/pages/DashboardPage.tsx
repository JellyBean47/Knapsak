import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { formatZar } from '../domain/money';
import {
  canBootstrapFinance,
  canManageBooks,
  canPurchase,
  canSell,
} from '../domain/roles';
import type { Account, InventoryItem, TillSession } from '../domain/types';
import { VAT_ACCOUNTANT_CONFIRMATION } from '../domain/vat/saVat';
import { db } from '../firebase';
import { bootstrapFinance, ensurePhase2Accounts } from '../services/financeApi';

export function DashboardPage() {
  const { posRole } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [till, setTill] = useState<TillSession | null>(null);
  const [stockValueCents, setStockValueCents] = useState(0);
  const [cashCents, setCashCents] = useState(0);
  const [cardCents, setCardCents] = useState(0);

  useEffect(() => {
    const q = query(
      collection(db, 'tillSessions'),
      where('status', '==', 'open'),
    );
    return onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setTill(null);
          return;
        }
        const d = snap.docs[0];
        setTill({ id: d.id, ...d.data() } as TillSession);
      },
      () => setTill(null),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'inventoryItems'), (snap) => {
      const items = snap.docs.map((d) => d.data() as InventoryItem);
      setStockValueCents(
        items.reduce((s, i) => s + (i.stockValueCents || 0), 0),
      );
    });
  }, []);

  useEffect(() => {
    if (!canManageBooks(posRole)) return;
    const unsubs = [
      onSnapshot(doc(db, 'accounts', '1100'), (snap) => {
        setCashCents((snap.data() as Account | undefined)?.balanceCents ?? 0);
      }),
      onSnapshot(doc(db, 'accounts', '1110'), (snap) => {
        setCardCents((snap.data() as Account | undefined)?.balanceCents ?? 0);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [posRole]);

  async function onBootstrap() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await bootstrapFinance();
      setMessage(
        `Finance ready: ${res.accounts} accounts, open period ${res.periodId}.`,
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      const msg = (err as { message?: string }).message;
      setError(
        code === 'functions/already-exists'
          ? 'Finance already bootstrapped.'
          : msg || 'Bootstrap failed. Deploy functions first.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Owner dashboard</h1>
        <p className="muted">Today’s till, cash position, and stock value at a glance.</p>
      </header>

      <section className="metric-grid">
        <article className="metric">
          <span className="muted">Till sales (open session)</span>
          <strong className="mono">
            {till ? formatZar(till.totals?.totalCents || 0) : '—'}
          </strong>
          <span className="small muted">
            {till
              ? `${till.totals?.saleCount || 0} sales · ${till.status}`
              : 'No open till'}
          </span>
        </article>
        <article className="metric">
          <span className="muted">Till cash / card</span>
          <strong className="mono">
            {till
              ? `${formatZar(till.totals?.cashCents || 0)} / ${formatZar(till.totals?.cardCents || 0)}`
              : '—'}
          </strong>
        </article>
        {canManageBooks(posRole) && (
          <>
            <article className="metric">
              <span className="muted">Cash on hand (ledger)</span>
              <strong className="mono">{formatZar(cashCents)}</strong>
            </article>
            <article className="metric">
              <span className="muted">Card clearing (ledger)</span>
              <strong className="mono">{formatZar(cardCents)}</strong>
            </article>
          </>
        )}
        <article className="metric">
          <span className="muted">Stock value</span>
          <strong className="mono">{formatZar(stockValueCents)}</strong>
        </article>
        <article className="metric">
          <span className="muted">Session gross profit</span>
          <strong className="mono">
            {till
              ? formatZar(
                  (till.totals?.exVatCents || 0) - (till.totals?.cogsCents || 0),
                )
              : '—'}
          </strong>
        </article>
      </section>

      <section className="card-grid">
        <article className="panel">
          <h2>Quick actions</h2>
          <ul className="link-list">
            {canSell(posRole) && (
              <li>
                <Link to="/pos">Open POS till</Link>
              </li>
            )}
            <li>
              <Link to="/inventory">Inventory</Link>
            </li>
            {canPurchase(posRole) && (
              <>
                <li>
                  <Link to="/suppliers">Suppliers</Link>
                </li>
                <li>
                  <Link to="/purchasing">Purchasing (PO / GRN)</Link>
                </li>
              </>
            )}
            {canManageBooks(posRole) && (
              <>
                <li>
                  <Link to="/bills">Supplier bills</Link>
                </li>
                <li>
                  <Link to="/banking">Banking / recon</Link>
                </li>
                <li>
                  <Link to="/exports">Finance export pack</Link>
                </li>
                <li>
                  <Link to="/journals">Journals</Link>
                </li>
                <li>
                  <Link to="/accounts">Chart of Accounts</Link>
                </li>
              </>
            )}
          </ul>
        </article>

        <article className="panel">
          <h2>Setup</h2>
          <p className="muted">
            Seed CoA, VAT rates, and the current open period (once). Already
            bootstrapped? Ensure Phase 2 bank/GRNI accounts exist.
          </p>
          <div className="btn-row">
            {canBootstrapFinance(posRole) && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void onBootstrap()}
              >
                {busy ? 'Working…' : 'Bootstrap finance'}
              </button>
            )}
            {canManageBooks(posRole) && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setMessage(null);
                  setError(null);
                  void ensurePhase2Accounts()
                    .then((res) => {
                      setMessage(
                        res.created.length
                          ? `Added accounts: ${res.created.join(', ')}`
                          : 'Phase 2 accounts already present.',
                      );
                    })
                    .catch((err) => {
                      setError(
                        (err as { message?: string }).message || 'Ensure failed.',
                      );
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Ensure Phase 2 accounts
              </button>
            )}
          </div>
          {!canBootstrapFinance(posRole) && !canManageBooks(posRole) && (
            <p className="muted">Only owners can bootstrap.</p>
          )}
          {message && <div className="alert alert-ok">{message}</div>}
          {error && <div className="alert alert-error">{error}</div>}
        </article>

        <article className="panel">
          <h2>Accountant checkpoints</h2>
          <ul className="checklist">
            {VAT_ACCOUNTANT_CONFIRMATION.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
