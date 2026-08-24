import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import {
  useOrdersContext,
  type StatusFilter,
} from '../orders/OrdersContext';
import type { OrderStatus } from '../types';
import { formatDateTime, formatPrice, shortId } from '../utils/format';
import { statusLabel } from '../utils/orderStatus';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'delivering', label: 'Delivering' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function OrdersPage() {
  const {
    allOrders,
    loading,
    error,
    newOrderCount,
    acknowledgeNewOrders,
    dismissNewOrderBanner,
    filterOrders,
  } = useOrdersContext();

  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    acknowledgeNewOrders();
    dismissNewOrderBanner();
  }, [acknowledgeNewOrders, dismissNewOrderBanner]);

  const orders = useMemo(
    () => filterOrders({ status, search, dateFrom, dateTo }),
    [filterOrders, status, search, dateFrom, dateTo],
  );

  const activeCount = allOrders.filter((o) =>
    ['pending', 'confirmed', 'preparing', 'delivering'].includes(o.status),
  ).length;

  const hasExtraFilters = Boolean(search.trim() || dateFrom || dateTo);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p className="muted">
            {activeCount} active · live updates from Firestore
            {newOrderCount > 0 ? ` · ${newOrderCount} new` : ''}
          </p>
        </div>
      </div>

      <div className="toolbar">
        <label className="search-field">
          <span className="sr-only">Search orders</span>
          <input
            type="search"
            placeholder="Search ID, address, product…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="date-field">
          <span>From</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="date-field">
          <span>To</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setDateFrom(todayIso());
            setDateTo(todayIso());
          }}
        >
          Today
        </button>
        {hasExtraFilters && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSearch('');
              setDateFrom('');
              setDateTo('');
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="filter-row" role="tablist" aria-label="Filter orders">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={status === f.id}
            className={`chip ${status === f.id ? 'chip-active' : ''}`}
            onClick={() => setStatus(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="muted">Loading orders…</p>
      ) : orders.length === 0 ? (
        <div className="empty">
          <p>
            {hasExtraFilters
              ? 'No orders match your search or date range.'
              : status === 'active'
                ? 'No active orders in the queue.'
                : status === 'all'
                  ? 'No orders yet.'
                  : `No ${statusLabel(status as OrderStatus).toLowerCase()} orders.`}
          </p>
        </div>
      ) : (
        <div className="order-table-wrap">
          <table className="order-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Address</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link to={`/orders/${order.id}`} className="order-link">
                      #{shortId(order.id)}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                  <td>{order.items.length}</td>
                  <td>{formatPrice(order.totalAmount)}</td>
                  <td>
                    <span className={order.paymentStatus === 'paid' ? 'paid' : 'unpaid'}>
                      {order.paymentStatus ?? '—'}
                    </span>
                  </td>
                  <td className="address-cell">{order.deliveryAddress || '—'}</td>
                  <td className="nowrap">{formatDateTime(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
