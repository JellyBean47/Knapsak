import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FinanceTimeline } from '../components/FinanceTimeline';
import { formatZar } from '../domain/money';
import { canSell } from '../domain/roles';
import type {
  InventoryItem,
  PosSale,
  TenderType,
  TillSession,
  ZReport,
} from '../domain/types';
import { db } from '../firebase';
import {
  closeTill,
  getOpenTill,
  openTill,
  postPosReturn,
  postPosSale,
} from '../services/financeApi';

interface CartLine {
  item: InventoryItem;
  qty: number;
}

type PosMode = 'sell' | 'return';

export function PosPage() {
  const { posRole } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [tender, setTender] = useState<TenderType>('cash');
  const [session, setSession] = useState<TillSession | null>(null);
  const [floatInput, setFloatInput] = useState('0.00');
  const [countInput, setCountInput] = useState('0.00');
  const [closeNote, setCloseNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<string | null>(null);
  const [zReport, setZReport] = useState<ZReport | null>(null);
  const [showClose, setShowClose] = useState(false);
  const [mode, setMode] = useState<PosMode>('sell');
  const [saleLookup, setSaleLookup] = useState('');
  const [returnSale, setReturnSale] = useState<PosSale | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnNote, setReturnNote] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'inventoryItems'), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as InventoryItem)
            .filter((i) => i.isActive !== false),
        );
      },
      (err) => setError(err.message),
    );
  }, []);

  useEffect(() => {
    void refreshTill();
  }, []);

  async function refreshTill() {
    try {
      const res = await getOpenTill();
      setSession(res.session);
      if (res.session) {
        const expected =
          res.session.openingFloatCents
          + (res.session.totals?.cashCents || 0)
          - (res.session.totals?.returnCashCents || 0);
        setCountInput((expected / 100).toFixed(2));
      }
    } catch (err) {
      setError((err as { message?: string }).message || 'Could not load till.');
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q)
        || i.sku.toLowerCase().includes(q)
        || (i.barcode || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const cartTotal = cart.reduce(
    (s, l) => s + l.item.sellPriceCents * l.qty,
    0,
  );

  const returnTotal = useMemo(() => {
    if (!returnSale) return 0;
    return returnSale.lines.reduce((sum, line) => {
      const qty = returnQty[line.itemId] || 0;
      return sum + line.unitPriceCents * qty;
    }, 0);
  }, [returnSale, returnQty]);

  function addItem(item: InventoryItem) {
    setLastSale(null);
    setError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [...prev, { item, qty: 1 }];
    });
  }

  function setQty(itemId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.item.id !== itemId));
      return;
    }
    setCart((prev) =>
      prev.map((l) => (l.item.id === itemId ? { ...l, qty } : l)),
    );
  }

  async function onOpenTill() {
    setBusy(true);
    setError(null);
    setZReport(null);
    try {
      const openingFloatCents = Math.round(Number.parseFloat(floatInput) * 100);
      if (!Number.isInteger(openingFloatCents) || openingFloatCents < 0) {
        throw new Error('Invalid opening float.');
      }
      await openTill({ openingFloatCents });
      await refreshTill();
    } catch (err) {
      setError((err as { message?: string }).message || 'Could not open till.');
    } finally {
      setBusy(false);
    }
  }

  async function onCloseTill() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const countedCashCents = Math.round(Number.parseFloat(countInput) * 100);
      if (!Number.isInteger(countedCashCents) || countedCashCents < 0) {
        throw new Error('Invalid counted cash.');
      }
      const res = await closeTill({
        tillSessionId: session.id,
        countedCashCents,
        note: closeNote || undefined,
      });
      setZReport(res.zReport);
      setSession(null);
      setShowClose(false);
      setCart([]);
      setReturnSale(null);
    } catch (err) {
      setError((err as { message?: string }).message || 'Could not close till.');
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    if (!session || cart.length === 0) return;
    setBusy(true);
    setError(null);
    setLastSale(null);
    try {
      const res = await postPosSale({
        tillSessionId: session.id,
        tender,
        lines: cart.map((l) => ({ itemId: l.item.id, qty: l.qty })),
      });
      setLastSale(
        `Sale #${res.saleNumber} · ${formatZar(res.totalCents)} · journal #${res.journalNumber}`,
      );
      setCart([]);
      await refreshTill();
    } catch (err) {
      setError((err as { message?: string }).message || 'Payment failed.');
    } finally {
      setBusy(false);
    }
  }

  async function lookupSale() {
    const n = Number.parseInt(saleLookup.trim(), 10);
    if (!Number.isInteger(n) || n <= 0) {
      setError('Enter a valid sale number.');
      return;
    }
    setBusy(true);
    setError(null);
    setReturnSale(null);
    setReturnQty({});
    try {
      const q = query(
        collection(db, 'posSales'),
        where('number', '==', n),
        limit(1),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError(`Sale #${n} not found.`);
        return;
      }
      const doc = snap.docs[0];
      const sale = { id: doc.id, ...doc.data() } as PosSale;
      if (sale.returnStatus === 'fully_returned') {
        setError(`Sale #${n} is already fully returned.`);
        return;
      }
      setReturnSale(sale);
      const initial: Record<string, number> = {};
      for (const line of sale.lines) {
        const remaining = line.qty - (line.qtyReturned || 0);
        initial[line.itemId] = remaining > 0 ? remaining : 0;
      }
      setReturnQty(initial);
    } catch (err) {
      setError((err as { message?: string }).message || 'Lookup failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onReturn() {
    if (!session || !returnSale) return;
    const lines = returnSale.lines
      .map((line) => ({
        itemId: line.itemId,
        qty: returnQty[line.itemId] || 0,
      }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) {
      setError('Select at least one item to return.');
      return;
    }
    setBusy(true);
    setError(null);
    setLastSale(null);
    try {
      const res = await postPosReturn({
        tillSessionId: session.id,
        saleId: returnSale.id,
        lines,
        note: returnNote || undefined,
      });
      setLastSale(
        `Return #${res.returnNumber} · sale #${res.saleNumber} · ${formatZar(res.totalCents)} · journal #${res.journalNumber}`,
      );
      setReturnSale(null);
      setReturnQty({});
      setSaleLookup('');
      setReturnNote('');
      await refreshTill();
    } catch (err) {
      setError((err as { message?: string }).message || 'Return failed.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: PosMode) {
    setMode(next);
    setError(null);
    setLastSale(null);
    setCart([]);
    setReturnSale(null);
    setReturnQty({});
  }

  if (!canSell(posRole)) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>POS till</h1>
          <p className="muted">Cashiers, managers, and owners can sell.</p>
        </header>
      </div>
    );
  }

  const expectedCash = session
    ? session.openingFloatCents
      + (session.totals?.cashCents || 0)
      - (session.totals?.returnCashCents || 0)
    : 0;

  return (
    <div className="page pos-page">
      <header className="page-header pos-header">
        <div>
          <h1>POS till</h1>
          <p className="muted">
            Sell and returns post stock, COGS, VAT, and the ledger automatically.
          </p>
        </div>
        <div className="till-status">
          {session ? (
            <>
              <span className="status-pill">Till open</span>
              <span className="mono muted">
                Sales {formatZar(session.totals?.totalCents || 0)}
                {(session.totals?.returnTotalCents || 0) > 0 && (
                  <> · Returns {formatZar(session.totals?.returnTotalCents || 0)}</>
                )}
                {' · Cash '}
                {formatZar(expectedCash)}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setShowClose(true)}
              >
                Close till
              </button>
            </>
          ) : (
            <span className="status-pill status-closed">Till closed</span>
          )}
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {lastSale && <div className="alert alert-ok">{lastSale}</div>}

      {zReport && (
        <article className="panel z-report">
          <h2>Z-report</h2>
          <div className="z-grid">
            <div><span className="muted">Date</span><strong>{zReport.date}</strong></div>
            <div><span className="muted">Sales</span><strong>{zReport.saleCount}</strong></div>
            <div><span className="muted">Total sales</span><strong>{formatZar(zReport.totalSalesCents)}</strong></div>
            <div><span className="muted">Returns</span><strong>{zReport.returnCount || 0}</strong></div>
            <div>
              <span className="muted">Total returns</span>
              <strong>{formatZar(zReport.totalReturnsCents || 0)}</strong>
            </div>
            <div><span className="muted">Cash sales</span><strong>{formatZar(zReport.cashSalesCents)}</strong></div>
            <div><span className="muted">Card sales</span><strong>{formatZar(zReport.cardSalesCents)}</strong></div>
            <div><span className="muted">VAT (net)</span><strong>{formatZar(zReport.vatCents)}</strong></div>
            <div><span className="muted">Expected cash</span><strong>{formatZar(zReport.expectedCashCents)}</strong></div>
            <div><span className="muted">Counted</span><strong>{formatZar(zReport.countedCashCents)}</strong></div>
            <div>
              <span className="muted">Variance</span>
              <strong className={zReport.varianceCents === 0 ? '' : 'text-danger'}>
                {formatZar(zReport.varianceCents)}
              </strong>
            </div>
            <div><span className="muted">Gross profit</span><strong>{formatZar(zReport.grossProfitCents)}</strong></div>
          </div>
        </article>
      )}

      {!session && (
        <section className="panel open-till">
          <h2>Open till</h2>
          <label className="field">
            <span>Opening float (cash)</span>
            <input
              value={floatInput}
              onChange={(e) => setFloatInput(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void onOpenTill()}
          >
            {busy ? 'Opening…' : 'Open till'}
          </button>
        </section>
      )}

      {session && showClose && (
        <section className="panel open-till">
          <h2>Close till</h2>
          <p className="muted">
            Expected cash = float + cash sales − cash returns (
            {formatZar(expectedCash)}
            ).
          </p>
          <label className="field">
            <span>Counted cash in drawer</span>
            <input
              value={countInput}
              onChange={(e) => setCountInput(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="field">
            <span>Note (optional)</span>
            <input
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
            />
          </label>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void onCloseTill()}
            >
              {busy ? 'Closing…' : 'Confirm close + Z-report'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setShowClose(false)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {session && !showClose && (
        <>
          <div className="tender-toggle" style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className={mode === 'sell' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => switchMode('sell')}
            >
              Sell
            </button>
            <button
              type="button"
              className={mode === 'return' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => switchMode('return')}
            >
              Return
            </button>
          </div>

          {mode === 'sell' && (
            <div className="pos-layout">
              <section className="pos-catalog">
                <input
                  className="search-input"
                  placeholder="Search name, SKU, barcode…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                <div className="product-grid">
                  {filtered.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="product-tile"
                      onClick={() => addItem(item)}
                      disabled={busy || (item.trackStock !== false && item.qtyOnHand <= 0)}
                    >
                      <strong>{item.name}</strong>
                      <span className="mono">{formatZar(item.sellPriceCents)}</span>
                      <span className="muted small">
                        {item.sku} · qty {item.qtyOnHand}
                      </span>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <p className="muted">No products match. Add items under Inventory.</p>
                  )}
                </div>
              </section>

              <aside className="pos-cart panel">
                <h2>Cart</h2>
                {cart.length === 0 ? (
                  <p className="muted">Tap products to add.</p>
                ) : (
                  <ul className="cart-list">
                    {cart.map((line) => (
                      <li key={line.item.id}>
                        <div>
                          <strong>{line.item.name}</strong>
                          <div className="muted small mono">
                            {formatZar(line.item.sellPriceCents)} each
                          </div>
                        </div>
                        <div className="qty-controls">
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            onClick={() => setQty(line.item.id, line.qty - 1)}
                          >
                            −
                          </button>
                          <span className="mono">{line.qty}</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            onClick={() => setQty(line.item.id, line.qty + 1)}
                          >
                            +
                          </button>
                        </div>
                        <strong className="mono">
                          {formatZar(line.item.sellPriceCents * line.qty)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="cart-total">
                  <span>Total</span>
                  <strong className="mono">{formatZar(cartTotal)}</strong>
                </div>

                <div className="tender-toggle">
                  <button
                    type="button"
                    className={tender === 'cash' ? 'btn btn-primary' : 'btn btn-ghost'}
                    onClick={() => setTender('cash')}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    className={tender === 'card' ? 'btn btn-primary' : 'btn btn-ghost'}
                    onClick={() => setTender('card')}
                  >
                    Card
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-block btn-pay"
                  disabled={busy || cart.length === 0}
                  onClick={() => void onPay()}
                >
                  {busy ? 'Posting…' : `Pay ${formatZar(cartTotal)}`}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  disabled={busy || cart.length === 0}
                  onClick={() => setCart([])}
                >
                  Clear cart
                </button>
              </aside>
            </div>
          )}

          {mode === 'return' && (
            <div className="pos-layout">
              <section className="panel" style={{ flex: 1 }}>
                <h2>Find original sale</h2>
                <p className="muted">
                  Enter the sale number from the receipt. Refund uses the original tender
                  (cash out of drawer / card clearing).
                </p>
                <div className="btn-row" style={{ alignItems: 'flex-end' }}>
                  <label className="field" style={{ flex: 1 }}>
                    <span>Sale number</span>
                    <input
                      value={saleLookup}
                      onChange={(e) => setSaleLookup(e.target.value)}
                      inputMode="numeric"
                      placeholder="e.g. 12"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void lookupSale()}
                  >
                    Look up
                  </button>
                </div>

                {returnSale && (
                  <>
                    <div className="alert alert-ok" style={{ marginTop: '1rem' }}>
                      Sale #{returnSale.number} · {returnSale.date} ·{' '}
                      {returnSale.tender} · {formatZar(returnSale.totalCents)}
                      {returnSale.returnStatus === 'partial' && ' · partially returned'}
                    </div>
                    <ul className="cart-list">
                      {returnSale.lines.map((line) => {
                        const remaining = line.qty - (line.qtyReturned || 0);
                        const qty = returnQty[line.itemId] || 0;
                        return (
                          <li key={line.itemId}>
                            <div>
                              <strong>{line.name}</strong>
                              <div className="muted small mono">
                                {formatZar(line.unitPriceCents)} · sold {line.qty}
                                {(line.qtyReturned || 0) > 0
                                  && ` · already returned ${line.qtyReturned}`}
                                {' · max '}
                                {remaining}
                              </div>
                            </div>
                            <div className="qty-controls">
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                disabled={qty <= 0}
                                onClick={() =>
                                  setReturnQty((prev) => ({
                                    ...prev,
                                    [line.itemId]: Math.max(0, qty - 1),
                                  }))
                                }
                              >
                                −
                              </button>
                              <span className="mono">{qty}</span>
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                disabled={qty >= remaining}
                                onClick={() =>
                                  setReturnQty((prev) => ({
                                    ...prev,
                                    [line.itemId]: Math.min(remaining, qty + 1),
                                  }))
                                }
                              >
                                +
                              </button>
                            </div>
                            <strong className="mono">
                              {formatZar(line.unitPriceCents * qty)}
                            </strong>
                          </li>
                        );
                      })}
                    </ul>
                    <label className="field">
                      <span>Note (optional)</span>
                      <input
                        value={returnNote}
                        onChange={(e) => setReturnNote(e.target.value)}
                      />
                    </label>
                    <div className="cart-total">
                      <span>Refund ({returnSale.tender})</span>
                      <strong className="mono">{formatZar(returnTotal)}</strong>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-block btn-pay"
                      disabled={busy || returnTotal <= 0}
                      onClick={() => void onReturn()}
                    >
                      {busy ? 'Posting…' : `Refund ${formatZar(returnTotal)}`}
                    </button>
                    <FinanceTimeline
                      anchorType="pos_sale"
                      anchorId={returnSale.id}
                      title={`Sale #${returnSale.number} timeline`}
                    />
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
