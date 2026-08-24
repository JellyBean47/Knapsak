import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { StatusBadge } from '../components/StatusBadge';
import { db } from '../firebase';
import { canSupplierCancel, type Order, type OrderStatus } from '../types';
import { formatDateTime, formatPrice, shortId } from '../utils/format';
import { nextActionLabel, nextStatus, statusLabel } from '../utils/orderStatus';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const orderRef = useRef(order);
  orderRef.current = order;
  const updatingRef = useRef(updating);
  updatingRef.current = updating;

  useEffect(() => {
    if (!orderId) return;

    const unsub = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        if (!snap.exists()) {
          setOrder(null);
          setError('Order not found.');
          setLoading(false);
          return;
        }
        const data = snap.data();
        const next: Order = {
          id: snap.id,
          userId: data.userId as string,
          items: (data.items ?? []) as Order['items'],
          totalAmount: Number(data.totalAmount ?? 0),
          status: data.status as OrderStatus,
          paymentIntentId: data.paymentIntentId as string | undefined,
          paymentStatus: data.paymentStatus as Order['paymentStatus'],
          deliveryAddress: String(data.deliveryAddress ?? ''),
          createdAt: data.createdAt,
          cancelledAt: data.cancelledAt,
          cancelledFromStatus: data.cancelledFromStatus as string | undefined,
          cancelledBy: data.cancelledBy as Order['cancelledBy'],
          supplierNote: data.supplierNote as string | undefined,
          statusUpdatedAt: data.statusUpdatedAt,
        };
        setOrder(next);
        setNoteDraft(next.supplierNote ?? '');
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Could not load order.');
        setLoading(false);
      },
    );

    return () => unsub();
  }, [orderId]);

  async function advanceStatus() {
    const current = orderRef.current;
    if (!current || updatingRef.current) return;
    const next = nextStatus(current.status);
    if (!next) return;

    setUpdating(true);
    setError(null);
    try {
      await updateDoc(doc(db, 'orders', current.id), {
        status: next,
        statusUpdatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Could not update status.');
    } finally {
      setUpdating(false);
    }
  }

  async function saveNote() {
    if (!order) return;
    const trimmed = noteDraft.trim();
    if (trimmed === (order.supplierNote ?? '')) return;

    setUpdating(true);
    setError(null);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        supplierNote: trimmed,
        statusUpdatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Could not save note.');
    } finally {
      setUpdating(false);
    }
  }

  async function cancelOrder() {
    if (!order || !canSupplierCancel(order.status)) return;

    setUpdating(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledFromStatus: order.status,
        cancelledBy: 'supplier',
        statusUpdatedAt: serverTimestamp(),
      };
      const note = noteDraft.trim();
      if (note) payload.supplierNote = note;

      await updateDoc(doc(db, 'orders', order.id), payload);
      setShowCancelConfirm(false);
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Could not cancel order.');
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (showCancelConfirm) {
          setShowCancelConfirm(false);
        } else {
          navigate('/');
        }
        return;
      }

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        window.print();
        return;
      }

      if (e.key === 'Enter' || e.key === 'a' || e.key === 'A') {
        const current = orderRef.current;
        if (!current || !nextStatus(current.status)) return;
        e.preventDefault();
        void advanceStatus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, showCancelConfirm]);

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Loading order…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page">
        <Link to="/" className="back-link">← Orders</Link>
        <div className="alert alert-error">{error ?? 'Order not found.'}</div>
      </div>
    );
  }

  const action = nextActionLabel(order.status);
  const next = nextStatus(order.status);
  const noteDirty = noteDraft.trim() !== (order.supplierNote ?? '');

  return (
    <div className="page order-detail-page">
      <div className="no-print detail-toolbar">
        <Link to="/" className="back-link">← Orders</Link>
        <div className="detail-toolbar-actions">
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
            Print pick list
          </button>
          <span className="shortcuts-hint muted small">
            A / Enter advance · P print · Esc back
          </span>
        </div>
      </div>

      <div className="print-only print-letterhead">
        <h1>Knapsak — Pick list</h1>
        <p>Order #{shortId(order.id)} · {formatDateTime(order.createdAt)}</p>
      </div>

      <div className="page-header detail-header">
        <div>
          <h1>Order #{shortId(order.id)}</h1>
          <p className="muted mono">{order.id}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {error && <div className="alert alert-error no-print">{error}</div>}

      <div className="detail-grid">
        <section className="panel">
          <h2>Items</h2>
          <table className="order-table pick-table">
            <thead>
              <tr>
                <th className="print-check">✓</th>
                <th>Product</th>
                <th>Qty</th>
                <th className="no-print">Unit</th>
                <th className="no-print">Line</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={`${item.productId}-${i}`}>
                  <td className="print-check">☐</td>
                  <td>{item.productName}</td>
                  <td>{item.quantity}</td>
                  <td className="no-print">{formatPrice(item.productPrice)}</td>
                  <td className="no-print">{formatPrice(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="total-row">
            <span>Total</span>
            <strong>{formatPrice(order.totalAmount)}</strong>
          </div>
        </section>

        <aside className="panel stack">
          <div>
            <h2>Delivery</h2>
            <p>{order.deliveryAddress || '—'}</p>
          </div>

          <div>
            <h2>Payment</h2>
            <p>
              <span className={order.paymentStatus === 'paid' ? 'paid' : 'unpaid'}>
                {order.paymentStatus ?? 'unknown'}
              </span>
            </p>
            {order.paymentIntentId && (
              <p className="muted mono small no-print">{order.paymentIntentId}</p>
            )}
          </div>

          <div>
            <h2>Timeline</h2>
            <dl className="meta-list">
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(order.createdAt)}</dd>
              </div>
              {order.statusUpdatedAt && (
                <div>
                  <dt>Status updated</dt>
                  <dd>{formatDateTime(order.statusUpdatedAt)}</dd>
                </div>
              )}
              {order.cancelledAt && (
                <div>
                  <dt>Cancelled</dt>
                  <dd>
                    {formatDateTime(order.cancelledAt)}
                    {order.cancelledFromStatus
                      ? ` (from ${statusLabel(order.cancelledFromStatus as OrderStatus)})`
                      : ''}
                    {order.cancelledBy ? ` · ${order.cancelledBy}` : ''}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="no-print">
            <h2>Issue note</h2>
            <textarea
              className="note-input"
              rows={3}
              maxLength={500}
              placeholder="Stock-out, substitution, driver note…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              disabled={order.status === 'cancelled' || updating}
            />
            <div className="note-actions">
              <span className="muted small">{noteDraft.length}/500</span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!noteDirty || updating || order.status === 'cancelled'}
                onClick={() => void saveNote()}
              >
                Save note
              </button>
            </div>
          </div>

          {order.supplierNote && (
            <div className="print-only">
              <h2>Note</h2>
              <p>{order.supplierNote}</p>
            </div>
          )}

          {action && next && (
            <button
              type="button"
              className="btn btn-primary btn-block no-print"
              disabled={updating}
              onClick={() => void advanceStatus()}
            >
              {updating ? 'Updating…' : `${action} → ${statusLabel(next)}`}
            </button>
          )}

          {canSupplierCancel(order.status) && (
            <div className="no-print">
              {!showCancelConfirm ? (
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-block"
                  disabled={updating}
                  onClick={() => setShowCancelConfirm(true)}
                >
                  Cancel order
                </button>
              ) : (
                <div className="cancel-confirm">
                  <p>Cancel this order? The customer will see it as cancelled.</p>
                  <div className="cancel-confirm-actions">
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={updating}
                      onClick={() => void cancelOrder()}
                    >
                      {updating ? 'Cancelling…' : 'Yes, cancel'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={updating}
                      onClick={() => setShowCancelConfirm(false)}
                    >
                      Keep order
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
