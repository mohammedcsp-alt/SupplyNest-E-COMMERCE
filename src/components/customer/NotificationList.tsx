'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import { NOTIFICATION_TEXT, pick, type Loc } from './shared';

export type NotificationView = { id: string; type: string; orderNumber: string | null; read: boolean; createdAt: string };

/** In-site notifications with mark-as-read (POST /api/v1/notifications { ids }). */
export function NotificationList({ items, locale }: { items: NotificationView[]; locale: Loc }) {
  const ar = locale === 'ar';
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const unread = items.filter((i) => !i.read).map((i) => i.id);

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    setErr(null);
    const res = await api('/api/v1/notifications', { method: 'POST', body: { ids } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="stack">
      {unread.length > 0 && (
        <div className="row">
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => markRead(unread)}>
            {ar ? 'تعليم الكل كمقروء' : 'Mark all as read'}
          </button>
        </div>
      )}
      {err && (
        <p className="alert alert-error" role="alert">
          {err}
        </p>
      )}
      <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
        {items.map((n) => {
          const t = NOTIFICATION_TEXT[n.type];
          return (
            <li key={n.id} className="card" style={{ marginBlockEnd: 0, opacity: n.read ? 0.75 : 1 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{t ? pick(locale, t[0], t[1]) : n.type}</strong>
                  {!n.read && <span className="badge badge-warn" style={{ marginInlineStart: 6 }}>{ar ? 'جديد' : 'New'}</span>}
                  {n.orderNumber && (
                    <div className="muted" dir="ltr">
                      {n.orderNumber}
                    </div>
                  )}
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {n.createdAt}
                  </div>
                </div>
                {!n.read && (
                  <button type="button" className="btn btn-small" disabled={busy} onClick={() => markRead([n.id])}>
                    {ar ? 'تعليم كمقروء' : 'Mark read'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
