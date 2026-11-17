import type { ReactNode } from 'react';
import Link from 'next/link';
import { formatIqd } from '@/lib/money';
import type { Locale } from '@/lib/i18n';

/** Presentational building blocks shared by every page. Server-safe (no hooks). */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Alert({ tone = 'error', children, role }: { tone?: 'error' | 'ok' | 'warn'; children: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div className={`alert alert-${tone}`} role={role ?? (tone === 'error' ? 'alert' : 'status')}>
      {children}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  const cls = tone === 'neutral' ? 'badge' : `badge badge-${tone}`;
  return <span className={cls}>{children}</span>;
}

const STATUS_TONE: Record<string, 'neutral' | 'ok' | 'warn' | 'danger'> = {
  ACTIVE: 'ok',
  HANDED_OVER: 'ok',
  CHECKED: 'ok',
  PACKED: 'ok',
  COMMITTED: 'ok',
  FRESH: 'ok',
  AVAILABLE: 'ok',
  APPROVAL_PENDING: 'warn',
  REGISTERED: 'warn',
  PENDING_ASSIGNMENT: 'warn',
  ASSIGNED: 'warn',
  PICKING: 'warn',
  PICKED: 'warn',
  CHECKING: 'warn',
  PACKING: 'warn',
  REVIEW_REQUIRED: 'warn',
  CANCELLATION_REQUESTED: 'warn',
  ON_HOLD_LOCAL: 'warn',
  STALE: 'warn',
  UNKNOWN: 'warn',
  DISCREPANCY_HOLD: 'danger',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
  CANCELLED: 'danger',
  UNAVAILABLE: 'danger',
  PREVIEW_INVALID: 'danger',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="page-head" style={{ marginBlockEnd: 12 }}>
          {title && <h2 style={{ margin: 0 }}>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="muted" style={{ padding: '16px 4px' }}>{children}</p>;
}

export function Money({ value, locale }: { value: string | number | null | undefined; locale: Locale }) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  return <span dir="ltr" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatIqd(String(value), locale)}</span>;
}

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
  labels,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
  labels: { prev: string; next: string; of: string };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set('page', String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav aria-label="pagination" className="row" style={{ justifyContent: 'center', margin: '16px 0' }}>
      {page > 1 && <Link className="btn btn-small" href={href(page - 1)} rel="prev">{labels.prev}</Link>}
      <span className="muted">
        {page} / {pages} ({total})
      </span>
      {page < pages && <Link className="btn btn-small" href={href(page + 1)} rel="next">{labels.next}</Link>}
    </nav>
  );
}

export function ForbiddenNotice({ locale }: { locale: Locale }) {
  return (
    <Alert tone="error">
      {locale === 'ar' ? 'ليست لديك صلاحية لعرض هذه الصفحة.' : 'You do not have permission to view this page.'}
    </Alert>
  );
}

export function LoginRequired({ locale, next }: { locale: Locale; next: string }) {
  return (
    <Card>
      <p>{locale === 'ar' ? 'يلزم تسجيل الدخول للمتابعة.' : 'Please sign in to continue.'}</p>
      <Link className="btn btn-primary" href={next.startsWith('/admin') ? `/login?portal=admin&next=${encodeURIComponent(next)}` : `/login?next=${encodeURIComponent(next)}`}>
        {locale === 'ar' ? 'تسجيل الدخول' : 'Sign in'}
      </Link>
    </Card>
  );
}
