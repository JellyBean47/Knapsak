import type { Timestamp } from 'firebase/firestore';

export function formatPrice(amount: number): string {
  return `R${amount.toFixed(2)}`;
}

export function formatDateTime(ts?: Timestamp): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
}
