import type { Timestamp } from 'firebase/firestore';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'delivering'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  productId: string;
  productName: string;
  productPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  paymentIntentId?: string;
  paymentStatus?: 'paid' | 'unpaid';
  deliveryAddress: string;
  createdAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancelledFromStatus?: string;
  cancelledBy?: 'customer' | 'supplier';
  supplierNote?: string;
  statusUpdatedAt?: Timestamp;
}

export const ACTIVE_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'delivering',
];

export const ALL_STATUSES: OrderStatus[] = [
  ...ACTIVE_STATUSES,
  'delivered',
  'cancelled',
];

export function canSupplierCancel(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}
