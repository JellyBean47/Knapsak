import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { formatZar } from '../domain/money';
import { canAdjustInventory } from '../domain/roles';
import type { InventoryItem } from '../domain/types';
import { SA_DEFAULT_VAT_RATE_ID } from '../domain/vat/saVat';
import { db } from '../firebase';
import { upsertInventoryItem } from '../services/financeApi';

export function InventoryPage() {
  const { posRole } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [sellPrice, setSellPrice] = useState('0.00');
  const [avgCost, setAvgCost] = useState('0.00');
  const [qty, setQty] = useState('0');

  useEffect(() => {
    const q = query(collection(db, 'inventoryItems'), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InventoryItem),
        );
        setError(null);
      },
      (err) => setError(err.message),
    );
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const sellPriceCents = Math.round(Number.parseFloat(sellPrice) * 100);
      const avgCostCents = Math.round(Number.parseFloat(avgCost) * 100);
      const qtyOnHand = Number.parseInt(qty, 10);
      if (
        !Number.isFinite(sellPriceCents)
        || !Number.isFinite(avgCostCents)
        || !Number.isInteger(qtyOnHand)
      ) {
        throw new Error('Check price, cost, and quantity.');
      }
      await upsertInventoryItem({
        id: sku.trim().toLowerCase(),
        sku: sku.trim(),
        name: name.trim(),
        sellPriceCents,
        avgCostCents,
        qtyOnHand,
        vatRateId: SA_DEFAULT_VAT_RATE_ID,
        trackStock: true,
        isActive: true,
      });
      setSku('');
      setName('');
      setSellPrice('0.00');
      setAvgCost('0.00');
      setQty('0');
    } catch (err) {
      setFormError((err as { message?: string }).message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Inventory</h1>
        <p className="muted">
          Weighted-average valuation. Stock source of truth for POS (catalog sync later).
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {canAdjustInventory(posRole) && (
        <form className="panel form-grid" onSubmit={(e) => void onSubmit(e)}>
          <h2>Add / update item</h2>
          {formError && <div className="alert alert-error">{formError}</div>}
          <label className="field">
            <span>SKU</span>
            <input value={sku} onChange={(e) => setSku(e.target.value)} required />
          </label>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>Sell price (VAT incl.)</span>
            <input
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              inputMode="decimal"
              required
            />
          </label>
          <label className="field">
            <span>Avg cost (ex VAT)</span>
            <input
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              inputMode="decimal"
              required
            />
          </label>
          <label className="field">
            <span>Qty on hand</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="numeric"
              required
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save item'}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="muted">No inventory items yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th className="num">Qty</th>
                <th className="num">Avg cost</th>
                <th className="num">Stock value</th>
                <th className="num">Sell</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{item.sku}</td>
                  <td>{item.name}</td>
                  <td className="num mono">{item.qtyOnHand}</td>
                  <td className="num mono">{formatZar(item.avgCostCents)}</td>
                  <td className="num mono">{formatZar(item.stockValueCents)}</td>
                  <td className="num mono">{formatZar(item.sellPriceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
