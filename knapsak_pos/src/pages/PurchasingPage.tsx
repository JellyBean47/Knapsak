import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FinanceTimeline } from '../components/FinanceTimeline';
import { formatZar } from '../domain/money';
import { canPurchase } from '../domain/roles';
import type {
  GoodsReceipt,
  InventoryItem,
  PurchaseOrder,
  Supplier,
} from '../domain/types';
import { db } from '../firebase';
import {
  createPurchaseOrder,
  ensurePhase2Accounts,
  postGoodsReceipt,
  postPurchaseReturn,
  postSupplierBillFromGrn,
} from '../services/financeApi';

interface PoDraftLine {
  itemId: string;
  qty: string;
  unitCost: string;
}

export function PurchasingPage() {
  const { posRole } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [draftLines, setDraftLines] = useState<PoDraftLine[]>([
    { itemId: '', qty: '1', unitCost: '0.00' },
  ]);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [selectedGrnId, setSelectedGrnId] = useState<string | null>(null);
  const [recvQty, setRecvQty] = useState<Record<string, string>>({});
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubs = [
      onSnapshot(query(collection(db, 'suppliers'), orderBy('name')), (snap) => {
        setSuppliers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Supplier));
      }),
      onSnapshot(query(collection(db, 'inventoryItems'), orderBy('name')), (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InventoryItem));
      }),
      onSnapshot(
        query(collection(db, 'purchaseOrders'), orderBy('number', 'desc')),
        (snap) => {
          setOrders(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseOrder),
          );
        },
      ),
      onSnapshot(
        query(collection(db, 'goodsReceipts'), orderBy('number', 'desc')),
        (snap) => {
          setReceipts(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GoodsReceipt),
          );
        },
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const selectedPo = useMemo(
    () => orders.find((o) => o.id === selectedPoId) || null,
    [orders, selectedPoId],
  );

  const selectedGrn = useMemo(
    () => receipts.find((g) => g.id === selectedGrnId) || null,
    [receipts, selectedGrnId],
  );

  async function onCreatePo(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await ensurePhase2Accounts();
      const lines = draftLines
        .filter((l) => l.itemId)
        .map((l) => ({
          itemId: l.itemId,
          qty: Number.parseInt(l.qty, 10),
          unitCostExVatCents: Math.round(Number.parseFloat(l.unitCost) * 100),
        }));
      if (!supplierId || lines.length === 0) {
        throw new Error('Pick a supplier and at least one line.');
      }
      const res = await createPurchaseOrder({ supplierId, lines });
      setMessage(`Created PO #${res.number}`);
      setDraftLines([{ itemId: '', qty: '1', unitCost: '0.00' }]);
      setSelectedPoId(res.purchaseOrderId);
    } catch (err) {
      setError((err as { message?: string }).message || 'Could not create PO.');
    } finally {
      setBusy(false);
    }
  }

  async function onReceive() {
    if (!selectedPo) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const lines = selectedPo.lines
        .map((l) => ({
          itemId: l.itemId,
          qty: Number.parseInt(recvQty[l.itemId] || '0', 10),
        }))
        .filter((l) => l.qty > 0);
      if (lines.length === 0) throw new Error('Enter quantities to receive.');
      const res = await postGoodsReceipt({
        purchaseOrderId: selectedPo.id,
        lines,
      });
      setMessage(
        `GRN #${res.number} posted · ${formatZar(res.totalInclCents)} · journal created`,
      );
      setRecvQty({});
    } catch (err) {
      setError((err as { message?: string }).message || 'Receive failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onBillGrn(grnId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await postSupplierBillFromGrn({ goodsReceiptId: grnId });
      setMessage(`Bill #${res.number} · ${formatZar(res.totalCents)}`);
      setSelectedGrnId(grnId);
    } catch (err) {
      setError((err as { message?: string }).message || 'Billing failed.');
    } finally {
      setBusy(false);
    }
  }

  function selectGrn(g: GoodsReceipt) {
    setSelectedGrnId(g.id);
    const init: Record<string, string> = {};
    for (const l of g.lines || []) {
      const rem = l.qty - (l.qtyReturned || 0);
      init[l.itemId] = rem > 0 ? String(rem) : '0';
    }
    setReturnQty(init);
  }

  async function onPurchaseReturn() {
    if (!selectedGrn) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const lines = (selectedGrn.lines || [])
        .map((l) => ({
          itemId: l.itemId,
          qty: Number.parseInt(returnQty[l.itemId] || '0', 10),
        }))
        .filter((l) => l.qty > 0);
      if (lines.length === 0) throw new Error('Enter quantities to return.');
      const res = await postPurchaseReturn({
        goodsReceiptId: selectedGrn.id,
        lines,
      });
      setMessage(
        `Purchase return #${res.number} · ${formatZar(res.totalInclCents)}`
        + (res.creditNoteNumber != null
          ? ` · credit note #${res.creditNoteNumber}`
          : ' · GRNI reversed'),
      );
    } catch (err) {
      setError((err as { message?: string }).message || 'Return failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!canPurchase(posRole)) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Purchasing</h1>
          <p className="muted">Owner or manager access required.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Purchasing</h1>
        <p className="muted">PO → GRN (stock + GRNI) → Bill (AP) · returns to supplier.</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-ok">{message}</div>}

      <form className="panel stack-form" onSubmit={(e) => void onCreatePo(e)}>
        <h2>New purchase order</h2>
        <label className="field">
          <span>Supplier</span>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {suppliers
              .filter((s) => s.isActive !== false)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>

        {draftLines.map((line, idx) => (
          <div className="form-grid" key={idx}>
            <label className="field">
              <span>Item</span>
              <select
                value={line.itemId}
                onChange={(e) => {
                  const next = [...draftLines];
                  next[idx] = { ...line, itemId: e.target.value };
                  const item = items.find((i) => i.id === e.target.value);
                  if (item) {
                    next[idx].unitCost = (item.avgCostCents / 100).toFixed(2);
                  }
                  setDraftLines(next);
                }}
              >
                <option value="">Select…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.sku})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Qty</span>
              <input
                value={line.qty}
                onChange={(e) => {
                  const next = [...draftLines];
                  next[idx] = { ...line, qty: e.target.value };
                  setDraftLines(next);
                }}
              />
            </label>
            <label className="field">
              <span>Unit cost ex VAT</span>
              <input
                value={line.unitCost}
                onChange={(e) => {
                  const next = [...draftLines];
                  next[idx] = { ...line, unitCost: e.target.value };
                  setDraftLines(next);
                }}
              />
            </label>
          </div>
        ))}

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setDraftLines([...draftLines, { itemId: '', qty: '1', unitCost: '0.00' }])
            }
          >
            Add line
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create PO'}
          </button>
        </div>
      </form>

      <section className="split-panels">
        <div className="panel">
          <h2>Open / partial POs</h2>
          <ul className="selectable-list">
            {orders
              .filter((o) => o.status === 'open' || o.status === 'partial')
              .map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className={selectedPoId === o.id ? 'active' : ''}
                    onClick={() => {
                      setSelectedPoId(o.id);
                      const init: Record<string, string> = {};
                      for (const l of o.lines) {
                        const rem = l.qtyOrdered - (l.qtyReceived || 0);
                        init[l.itemId] = rem > 0 ? String(rem) : '0';
                      }
                      setRecvQty(init);
                    }}
                  >
                    <strong>PO #{o.number}</strong>
                    <span className="muted">
                      {o.supplierName} · {formatZar(o.totalExVatCents)} ex VAT · {o.status}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Receive goods</h2>
          {!selectedPo ? (
            <p className="muted">Select a PO to receive.</p>
          ) : (
            <>
              <p>
                <strong>PO #{selectedPo.number}</strong> — {selectedPo.supplierName}
              </p>
              <div className="table-wrap bare">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Ordered</th>
                      <th className="num">Received</th>
                      <th className="num">Receive now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPo.lines.map((l) => (
                      <tr key={l.itemId}>
                        <td>{l.name}</td>
                        <td className="num mono">{l.qtyOrdered}</td>
                        <td className="num mono">{l.qtyReceived || 0}</td>
                        <td className="num">
                          <input
                            className="qty-input"
                            value={recvQty[l.itemId] || '0'}
                            onChange={(e) =>
                              setRecvQty({ ...recvQty, [l.itemId]: e.target.value })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void onReceive()}
              >
                {busy ? 'Posting…' : 'Post GRN'}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h2>Recent GRNs</h2>
        {receipts.length === 0 ? (
          <p className="muted">No goods receipts yet.</p>
        ) : (
          <div className="table-wrap bare">
            <table className="data-table">
              <thead>
                <tr>
                  <th>GRN</th>
                  <th>PO</th>
                  <th>Supplier</th>
                  <th className="num">Total incl.</th>
                  <th>Bill</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {receipts.slice(0, 20).map((g) => (
                  <tr
                    key={g.id}
                    className={selectedGrnId === g.id ? 'row-selected' : ''}
                  >
                    <td className="mono">#{g.number}</td>
                    <td className="mono">#{g.purchaseOrderNumber}</td>
                    <td>{g.supplierName}</td>
                    <td className="num mono">{formatZar(g.totalInclCents)}</td>
                    <td>
                      {g.billed ? (
                        <span className="status-pill">billed</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void onBillGrn(g.id)}
                        >
                          Create bill
                        </button>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => selectGrn(g)}
                      >
                        Return / timeline
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedGrn && (
        <section className="split-panels" style={{ marginTop: '1rem' }}>
          <div className="panel">
            <h2>Return to supplier — GRN #{selectedGrn.number}</h2>
            <p className="muted">
              {selectedGrn.billed
                ? 'Billed GRN → AP credit note + stock out.'
                : 'Unbilled GRN → reverse GRNI + stock out.'}
            </p>
            {(selectedGrn.lines || []).length === 0 ? (
              <p className="muted">No line detail on this GRN.</p>
            ) : (
              <>
                <div className="table-wrap bare">
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="num">Received</th>
                        <th className="num">Returned</th>
                        <th className="num">Return now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedGrn.lines || []).map((l) => (
                        <tr key={l.itemId}>
                          <td>{l.name}</td>
                          <td className="num mono">{l.qty}</td>
                          <td className="num mono">{l.qtyReturned || 0}</td>
                          <td className="num">
                            <input
                              className="qty-input"
                              value={returnQty[l.itemId] || '0'}
                              onChange={(e) =>
                                setReturnQty({
                                  ...returnQty,
                                  [l.itemId]: e.target.value,
                                })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void onPurchaseReturn()}
                >
                  {busy ? 'Posting…' : 'Post purchase return'}
                </button>
              </>
            )}
          </div>
          <FinanceTimeline
            anchorType="goods_receipt"
            anchorId={selectedGrn.id}
            title={`GRN #${selectedGrn.number} timeline`}
          />
        </section>
      )}
    </div>
  );
}
