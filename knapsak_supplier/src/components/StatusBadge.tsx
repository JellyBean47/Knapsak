import type { OrderStatus } from '../types';
import { statusLabel } from '../utils/orderStatus';

const CLASS: Record<OrderStatus, string> = {
  pending: 'badge badge-pending',
  confirmed: 'badge badge-confirmed',
  preparing: 'badge badge-preparing',
  delivering: 'badge badge-delivering',
  delivered: 'badge badge-delivered',
  cancelled: 'badge badge-cancelled',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={CLASS[status]}>{statusLabel(status)}</span>;
}
