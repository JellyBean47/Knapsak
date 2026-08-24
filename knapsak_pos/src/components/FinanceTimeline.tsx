import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { formatZar } from '../domain/money';
import type { FinanceTimelineEvent } from '../domain/types';
import { db } from '../firebase';

export function FinanceTimeline(props: {
  anchorType: string;
  anchorId: string;
  title?: string;
}) {
  const { anchorType, anchorId, title = 'Finance timeline' } = props;
  const [events, setEvents] = useState<FinanceTimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!anchorId) {
      setEvents([]);
      return;
    }
    const q = query(
      collection(db, 'financeTimeline'),
      where('anchorType', '==', anchorType),
      where('anchorId', '==', anchorId),
      orderBy('at', 'asc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setEvents(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              at: data.at,
              kind: data.kind,
              label: data.label,
              amountCents: data.amountCents,
              journalId: data.journalId,
              journalNumber: data.journalNumber,
              refId: data.returnId || data.paymentId || null,
              refType: data.kind,
            } as FinanceTimelineEvent;
          }),
        );
      },
      (err) => setError(err.message),
    );
  }, [anchorType, anchorId]);

  if (!anchorId) return null;

  return (
    <section className="panel finance-timeline">
      <h2>{title}</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {events.length === 0 ? (
        <p className="muted">No timeline events yet.</p>
      ) : (
        <ol className="timeline-list">
          {events.map((ev) => (
            <li key={ev.id}>
              <div className="timeline-dot" />
              <div className="timeline-body">
                <div className="timeline-meta">
                  <span className="mono muted">{ev.at}</span>
                  {ev.journalNumber != null && (
                    <span className="mono muted"> · J#{ev.journalNumber}</span>
                  )}
                </div>
                <strong>{ev.label}</strong>
                {ev.amountCents != null && (
                  <div className="mono">{formatZar(ev.amountCents)}</div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
