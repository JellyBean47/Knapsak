import type { OrderStatus } from '../types';

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'delivering',
  delivering: 'delivered',
};

const LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  delivering: 'Delivering',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const ACTIONS: Partial<Record<OrderStatus, string>> = {
  pending: 'Confirm order',
  confirmed: 'Start preparing',
  preparing: 'Out for delivery',
  delivering: 'Mark delivered',
};

export function nextStatus(status: OrderStatus): OrderStatus | null {
  return NEXT[status] ?? null;
}

export function statusLabel(status: OrderStatus): string {
  return LABELS[status];
}

export function nextActionLabel(status: OrderStatus): string | null {
  return ACTIONS[status] ?? null;
}
