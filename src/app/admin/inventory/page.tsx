import Link from 'next/link';
import { PageHeader, Badge, EmptyState, Pagination } from '@/components/ui';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { availableOf } from '@/modules/inventory/inventory';
import { ALERT_TYPES_LIST } from '@/modules/admin/constants';
import { gatePage } from '../_lib/gate';
import '../css/operations.css';

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
  const filtered = Boolean(q || onlyLow);

  return (
    <div className="ops ops-inventory">
      <PageHeader title={L('المخزون', 'Inventory')} subtitle={L(`الفعلي والمحجوز والمتاح. منخفض = المتاح ≤ ${lowThreshold}. قديم بعد ${staleHours} ساعة.`, `Physical, reserved and available. Low = available ≤ ${lowThreshold}. Stale after ${staleHours} hours.`)} />

      <div className="adm-kpis">
        <div className="adm-kpi">
          <span>{filtered ? L('رموز SKU المطابقة', 'SKUs matching') : L('كل رموز SKU', 'All SKUs')}</span>
          <strong>{total}</strong>
        </div>
        <div className={openAlerts.length > 0 ? 'adm-kpi is-warn' : 'adm-kpi'}>
          <span>{L('التنبيهات المفتوحة', 'Open alerts')}</span>
          <strong>{openAlerts.length}</strong>
        </div>
      </div>

      <form method="GET" className="adm-filters" role="search">
        <div className="field">
          <label htmlFor="inv-q">{L('بحث برمز SKU', 'Search SKU')}</label>
          <input id="inv-q" name="q" type="search" defaultValue={q} maxLength={64} />
        </div>
        <div className="field ops-check">
          <label>
            <input type="checkbox" name="low" value="1" defaultChecked={onlyLow} /> {L('المخزون المنخفض فقط', 'Low stock only')}
          </label>
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary">{L('تصفية', 'Filter')}</button>
          {filtered && (
            <Link className="btn" href="/admin/inventory">
              {L('مسح', 'Clear')}
            </Link>
          )}
        </div>
      </form>

      {pageRows.length === 0 ? (
        <div className="adm-empty">{L('لا توجد نتائج.', 'No rows.')}</div>
      ) : (
        <div className="table-wrap adm-table">
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
                <th>
                  <span className="sr-only">{L('فتح', 'Open')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className={r.conflict ? 'ops-row-conflict' : undefined}>
                  <td className="code">{r.sku}</td>
                  <td>{r.nameEn}</td>
                  <td className="num">{r.physical}</td>
                  <td className="num">{r.reserved}</td>
                  <td className="num">{r.available}</td>
                  <td>{r.conflict ? <Badge tone="danger">{L('تعارض', 'Conflict')}</Badge> : <span className="muted">—</span>}</td>
                  <td>
                    <Badge tone={r.freshness === 'FRESH' ? 'ok' : 'warn'}>{r.freshness}</Badge>
                    {r.ts && <div className="ops-sub">{formatDateTime(r.ts, locale)}</div>}
                  </td>
                  <td>
                    {r.alerts.length ? (
                      <div className="ops-badges">
                        {r.alerts.map((a) => (
                          <Badge key={a} tone="warn">
                            {a.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <div className="adm-row-actions">
                      <Link className="btn btn-small" href={`/admin/catalog/${r.id}`}>
                        {L('تفاصيل', 'Details')}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/inventory" params={{ q, low: onlyLow ? '1' : undefined }} labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: 'of' }} />

      <section className="adm-section" aria-labelledby="inv-alerts-h">
        <header>
          <div>
            <h2 id="inv-alerts-h">{L('التنبيهات المفتوحة', 'Open alerts')}</h2>
            <p className="muted">{L('التنبيهات معلوماتية. لا يوجد حل يدوي لها من هذه الشاشة؛ تُحدَّث تلقائياً عند تغيّر الظروف.', 'Alerts are informational. There is no manual resolve; they refresh automatically when conditions change.')}</p>
          </div>
        </header>
        <div className="ops-badges" style={{ marginBlockEnd: 12 }}>
          {ALERT_TYPES_LIST.map((t) => (
            <Badge key={t} tone={openAlerts.some((a) => a.alertType === t) ? 'warn' : 'neutral'}>
              {t.replace(/_/g, ' ')}: {openAlerts.filter((a) => a.alertType === t).length}
            </Badge>
          ))}
        </div>
        {openAlerts.length === 0 ? (
          <div className="adm-empty">{L('لا توجد تنبيهات مفتوحة.', 'No open alerts.')}</div>
        ) : (
          <div className="table-wrap adm-table">
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
                    <td className="code">{a.sku.sku}</td>
                    <td>{a.sku.nameEn}</td>
                    <td>{formatDateTime(a.detectedAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {user.permissions.has(PERMISSIONS.INVENTORY_ADJUST) && (
        <p className="ops-note">{L('للتعديل اليدوي افتح SKU من الجدول واستخدم نموذج تعديل المخزون.', 'For manual adjustments open the SKU and use the stock adjustment form.')}</p>
      )}
    </div>
  );
}
