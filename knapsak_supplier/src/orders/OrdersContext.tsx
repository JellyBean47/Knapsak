import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Order, OrderStatus } from '../types';
import { playNewOrderChime } from '../utils/chime';

const SOUND_KEY = 'knapsak.supplier.soundEnabled';

export type StatusFilter = OrderStatus | 'active' | 'all';

export interface OrderFilters {
  status: StatusFilter;
  search: string;
  dateFrom: string;
  dateTo: string;
}

export interface NewOrderBannerState {
  newestId: string;
  count: number;
}

interface OrdersState {
  allOrders: Order[];
  loading: boolean;
  error: string | null;
  newOrderCount: number;
  newOrderBanner: NewOrderBannerState | null;
  soundEnabled: boolean;
  setSoundEnabled: (on: boolean) => void;
  acknowledgeNewOrders: () => void;
  dismissNewOrderBanner: () => void;
  filterOrders: (filters: OrderFilters) => Order[];
}

const OrdersContext = createContext<OrdersState | null>(null);

function mapOrder(docId: string, data: Record<string, unknown>): Order {
  return {
    id: docId,
    userId: data.userId as string,
    items: (data.items ?? []) as Order['items'],
    totalAmount: Number(data.totalAmount ?? 0),
    status: data.status as OrderStatus,
    paymentIntentId: data.paymentIntentId as string | undefined,
    paymentStatus: data.paymentStatus as Order['paymentStatus'],
    deliveryAddress: String(data.deliveryAddress ?? ''),
    createdAt: data.createdAt as Order['createdAt'],
    cancelledAt: data.cancelledAt as Order['cancelledAt'],
    cancelledFromStatus: data.cancelledFromStatus as string | undefined,
    cancelledBy: data.cancelledBy as Order['cancelledBy'],
    supplierNote: data.supplierNote as string | undefined,
    statusUpdatedAt: data.statusUpdatedAt as Order['statusUpdatedAt'],
  };
}

function dayStart(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function dayEnd(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function matchesSearch(order: Order, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;

  if (order.id.toLowerCase().includes(q)) return true;
  if (order.id.slice(0, 8).toLowerCase().includes(q)) return true;
  if (order.deliveryAddress.toLowerCase().includes(q)) return true;
  if (order.userId.toLowerCase().includes(q)) return true;
  if (order.paymentIntentId?.toLowerCase().includes(q)) return true;
  if (order.supplierNote?.toLowerCase().includes(q)) return true;
  return order.items.some((item) => item.productName.toLowerCase().includes(q));
}

function matchesDate(order: Order, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!order.createdAt) return false;
  const t = order.createdAt.toMillis();
  if (from && t < dayStart(from)) return false;
  if (to && t > dayEnd(to)) return false;
  return true;
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [newOrderBanner, setNewOrderBanner] = useState<NewOrderBannerState | null>(null);
  const [soundEnabled, setSoundEnabledState] = useState(() => {
    const stored = localStorage.getItem(SOUND_KEY);
    return stored === null ? true : stored === 'true';
  });

  const seenIds = useRef<Set<string> | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const setSoundEnabled = useCallback((on: boolean) => {
    setSoundEnabledState(on);
    localStorage.setItem(SOUND_KEY, String(on));
  }, []);

  const acknowledgeNewOrders = useCallback(() => {
    setNewOrderCount(0);
  }, []);

  const dismissNewOrderBanner = useCallback(() => {
    setNewOrderBanner(null);
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(150),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => mapOrder(d.id, d.data()));
        const ids = next.map((o) => o.id);

        if (seenIds.current === null) {
          seenIds.current = new Set(ids);
        } else {
          const fresh = ids.filter((id) => !seenIds.current!.has(id));
          if (fresh.length > 0) {
            for (const id of fresh) seenIds.current.add(id);
            setNewOrderCount((c) => c + fresh.length);
            setNewOrderBanner((prev) => ({
              newestId: fresh[0],
              count: (prev?.count ?? 0) + fresh.length,
            }));
            if (soundEnabledRef.current) playNewOrderChime();

            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const newest = next.find((o) => o.id === fresh[0]);
              new Notification('New Knapsak order', {
                body: newest
                  ? `${newest.items.length} item(s) · ${newest.deliveryAddress || 'No address'}`
                  : `${fresh.length} new order(s)`,
                tag: 'knapsak-new-order',
              });
            }
          }
          for (const id of ids) seenIds.current.add(id);
        }

        setAllOrders(next);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(err.message || 'Could not load orders.');
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const base = 'Knapsak Supplier';
    document.title = newOrderCount > 0 ? `(${newOrderCount}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [newOrderCount]);

  const filterOrders = useCallback((filters: OrderFilters) => {
    return allOrders.filter((order) => {
      if (filters.status === 'active') {
        if (!['pending', 'confirmed', 'preparing', 'delivering'].includes(order.status)) {
          return false;
        }
      } else if (filters.status !== 'all' && order.status !== filters.status) {
        return false;
      }

      if (!matchesSearch(order, filters.search)) return false;
      if (!matchesDate(order, filters.dateFrom, filters.dateTo)) return false;
      return true;
    });
  }, [allOrders]);

  const value = useMemo(
    () => ({
      allOrders,
      loading,
      error,
      newOrderCount,
      newOrderBanner,
      soundEnabled,
      setSoundEnabled,
      acknowledgeNewOrders,
      dismissNewOrderBanner,
      filterOrders,
    }),
    [
      allOrders,
      loading,
      error,
      newOrderCount,
      newOrderBanner,
      soundEnabled,
      setSoundEnabled,
      acknowledgeNewOrders,
      dismissNewOrderBanner,
      filterOrders,
    ],
  );

  return (
    <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
  );
}

export function useOrdersContext(): OrdersState {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrdersContext must be used within OrdersProvider');
  return ctx;
}
