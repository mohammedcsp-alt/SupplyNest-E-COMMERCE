import Link from 'next/link';
import { PageHeader, Card, Badge, EmptyState, Pagination } from '@/components/ui';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { availableOf } from '@/modules/inventory/inventory';
import { ALERT_TYPES_LIST } from '@/modules/admin/constants';
import { gatePage } from '../_lib/gate';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function AdminInventory({ searchParams }: { searchParams: Promise<{ q?: string; low?: string; page?: string }> }) {
  const g = await gatePage(PERMISSIONS.INVENTORY_VIEW, '/admin/inventory');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().toUpperCase().slice(0, 64);
  const onlyLow = sp.low === '1';
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const staleHours = await getSetting(db, 'inventory.staleAfterHours');
  const lowThreshold = await getSetting(db, 'inventory.lowStockThreshold');

  const skus = await db.sku.findMany({
    where: { deletedAt: null, ...(q ? { sku: { contains: q } } : {}) },
    orderBy: { sku: 'asc' },
    include: { inventory: true, alerts: { where: { state: 'OPEN' }, select: { alertType: true } } },
  });
  const now = Date.now();
  const rows = skus
    .map((s) => {
      const phys = s.inventory?.physicalOnHand ?? 0;
      const res = s.inventory?.reservedQty ?? 0;
      const available = availableOf(phys, res);
      const ts = s.inventory?.sourceTimestamp ?? null;
      const freshness = !ts ? 'UNKNOWN' : now - ts.getTime() > staleHours * 3600 * 1000 ? 'STALE' : 'FRESH';
      return {
        id: s.id,
        sku: s.sku,
        nameEn: s.nameEn,
        physical: phys,
        reserved: res,
        available,
        conflict: res > phys,
        lowStock: available <= lowThreshold,
        freshness,
        ts,
        alerts: s.alerts.map((a) => a.alertType),
      };
    })
    .filter((r) => (onlyLow ? r.lowStock || r.conflict || r.alerts.includes('LOW_STOCK') : true));
  const total = rows.length;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openAlerts = await db.inventoryAlert.findMany({
    where: { state: 'OPEN' },
    orderBy: [{ alertType: 'asc' }, { detectedAt: 'desc' }],
    take: 200,
    include: { sku: { select: { sku: true, nameEn: true } } },
  });

  return (
    <>
      <PageHeader title={L('المخزون', 'Inventory')} subtitle={L(`الفعلي والمحجوز والمتاح. منخفض = المتاح ≤ ${lowThreshold}. قديم بعد ${staleHours} ساعة.`, `Physical, reserved and available. Low = available ≤ ${lowThreshold}. Stale after ${staleHours} hours.`)} />
      <form method="GET" className="form-row" role="search" style={{ marginBlockEnd: 16 }}>
        <div className="field">
          <label htmlFor="inv-q">{L('بحث برمز SKU', 'Search SKU')}</label>
          <input id="inv-q" name="q" type="search" defaultValue={q} maxLength={64} />
        </div>
        <div className="field" style={{ flex: '0 0 auto' }}>
          <label className="row" style={{ fontWeight: 400 }}>
            <input type="checkbox" name="low" value="1" defaultChecked={onlyLow} /> {L('المخزون المنخفض فقط', 'Low stock only')}
          </label>
        </div>
        <div className="field">
          <button type="submit" className="btn btn-primary">{L('تصفية', 'Filter')}</button>
        </div>
      </form>

      {pageRows.length === 0 ? (
        <EmptyState>{L('لا توجد نتائج.', 'No rows.')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{L('رمز SKU', 'SKU')}</th>
                <th>{L('الاسم', 'Name')}</th>
                <th className="num">{L('الفعلي', 'Physical')}</th>
                <th className="num">{L('محجوز', 'Reserved')}</th>
                <th className="num">{L('المتاح', 'Available')}</th>
                <th>{L('تعارض', 'Conflict')}</th>
                <th>{L('الحداثة', 'Freshness')}</th>
                <th>{L('التنبيهات', 'Alerts')}</th>
                <th>{L('فتح', 'Open')}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td dir="ltr">{r.sku}</td>
                  <td>{r.nameEn}</td>
                  <td className="num">{r.physical}</td>
                  <td className="num">{r.reserved}</td>
                  <td className="num">{r.available}</td>
                  <td>{r.conflict ? <Badge tone="danger">{L('تعارض', 'Conflict')}</Badge> : '—'}</td>
                  <td>
                    <Badge tone={r.freshness === 'FRESH' ? 'ok' : 'warn'}>{r.freshness}</Badge>
                    {r.ts && <div className="muted" style={{ fontSize: '0.8rem' }}>{formatDateTime(r.ts, locale)}</div>}
                  </td>
                  <td>{r.alerts.length ? r.alerts.map((a) => <Badge key={a} tone="warn">{a.replace(/_/g, ' ')}</Badge>) : '—'}</td>
                  <td>
                    <Link href={`/admin/catalog/${r.id}`}>{L('تفاصيل', 'Details')}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/inventory" params={{ q, low: onlyLow ? '1' : undefined }} labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: 'of' }} />

      <Card title={L('التنبيهات المفتوحة', 'Open alerts')}>
        <p className="muted">{L('التنبيهات معلوماتية. لا يوجد حل يدوي لها من هذه الشاشة؛ تُحدَّث تلقائياً عند تغيّر الظروف.', 'Alerts are informational. There is no manual resolve; they refresh automatically when conditions change.')}</p>
        <div className="row" style={{ marginBlockEnd: 10 }}>
          {ALERT_TYPES_LIST.map((t) => (
            <Badge key={t} tone={openAlerts.some((a) => a.alertType === t) ? 'warn' : 'neutral'}>
              {t.replace(/_/g, ' ')}: {openAlerts.filter((a) => a.alertType === t).length}
            </Badge>
          ))}
        </div>
        {openAlerts.length === 0 ? (
          <EmptyState>{L('لا توجد تنبيهات مفتوحة.', 'No open alerts.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{L('النوع', 'Type')}</th>
                  <th>{L('رمز SKU', 'SKU')}</th>
                  <th>{L('الاسم', 'Name')}</th>
                  <th>{L('رُصد', 'Detected')}</th>
                </tr>
              </thead>
              <tbody>
                {openAlerts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.alertType.replace(/_/g, ' ')}</td>
                    <td dir="ltr">{a.sku.sku}</td>
                    <td>{a.sku.nameEn}</td>
                    <td>{formatDateTime(a.detectedAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {user.permissions.has(PERMISSIONS.INVENTORY_ADJUST) && (
        <p className="muted">{L('للتعديل اليدوي افتح SKU من الجدول واستخدم نموذج تعديل المخزون.', 'For manual adjustments open the SKU and use the stock adjustment form.')}</p>
      )}
    </>
  );
}
