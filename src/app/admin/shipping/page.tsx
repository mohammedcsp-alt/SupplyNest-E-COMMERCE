import '../css/system.css';
import { Badge, EmptyState, Alert } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { getShippingAdmin } from '@/modules/admin/shipping';
import { canSeePrices } from '@/modules/admin/access';
import { gatePage } from '../_lib/gate';

export const dynamic = 'force-dynamic';

export default async function AdminShipping() {
  const g = await gatePage(PERMISSIONS.SHIPPING_MANAGE, '/admin/shipping');
  if (!g.ok) return g.node;
  const { L, locale, prices } = g;
  const data = await getShippingAdmin(canSeePrices(g.user));
  const govOptions = data.governorates.map((gv) => ({ value: gv.id, label: locale === 'ar' ? gv.nameAr : gv.nameEn }));
  const statusLabel: Record<string, string> = {
    CURRENT: L('سارٍ', 'Current'),
    SCHEDULED: L('مجدول', 'Scheduled'),
    CLOSED: L('منتهٍ', 'Closed'),
    INACTIVE: L('غير فعال', 'Inactive'),
  };
  const areaCount = data.governorates.reduce((sum, gv) => sum + gv.areas.length, 0);
  const currentRules = data.rules.filter((r) => r.status === 'CURRENT').length;
  const scheduledRules = data.rules.filter((r) => r.status === 'SCHEDULED').length;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{L('الشحن', 'Shipping')}</h1>
          <p className="muted">{L('المحافظات والمناطق وقواعد رسوم التوصيل.', 'Governorates, areas and delivery fee rules.')}</p>
        </div>
        <div className="adm-head-actions">
          <a className="btn btn-small" href="#ship-rules">{L('قاعدة جديدة', 'New rule')}</a>
          <a className="btn btn-small" href="#ship-history">{L('السجل', 'History')}</a>
        </div>
      </div>

      <Alert tone="warn">
        {L(
          'مبالغ الشحن يُدخلها فريق الإدارة فقط. لا يوجد أي مبلغ افتراضي في النظام؛ إذا لم توجد قاعدة سارية لمحافظة ما فلن يُحسب الشحن لها وسيُرفض الطلب.',
          'Shipping amounts are entered by administration only. The system has no default amount; if no rule is in effect for a governorate, its shipping cannot be quoted and the order is refused.',
        )}
      </Alert>

      <div className="adm-kpis">
        <div className="adm-kpi">
          <strong>{data.governorates.length}</strong>
          <span>{L('المحافظات', 'Governorates')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{areaCount}</strong>
          <span>{L('المناطق', 'Areas')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{currentRules}</strong>
          <span>{L('قواعد سارية', 'Rules in effect')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{scheduledRules}</strong>
          <span>{L('قواعد مجدولة', 'Scheduled rules')}</span>
        </div>
      </div>

      <section className="adm-section">
        <header>
          <h2>{L('المحافظات والمناطق', 'Governorates and areas')}</h2>
        </header>
        {data.governorates.length === 0 ? (
          <EmptyState>{L('لا توجد محافظات.', 'No governorates.')}</EmptyState>
        ) : (
          <ul className="ship-tree">
            {data.governorates.map((gv) => (
              <li key={gv.id} className="ship-gov">
                <div className="ship-gov-head">
                  <span className="ship-gov-name">{locale === 'ar' ? gv.nameAr : gv.nameEn}</span>
                  <span className="adm-code-cell adm-muted-small" dir="ltr">{gv.code}</span>
                  {!gv.active && <Badge tone="danger">{L('غير فعالة', 'Inactive')}</Badge>}
                </div>
                {gv.areas.length > 0 && (
                  <ul className="ship-areas">
                    {gv.areas.map((a) => (
                      <li key={a.id}>
                        {locale === 'ar' ? a.nameAr : a.nameEn} {!a.active && <Badge tone="danger">{L('غير فعالة', 'Inactive')}</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
                <details>
                  <summary>{L('تعديل المحافظة', 'Edit governorate')}</summary>
                  <div className="adm-form-grid">
                    <ApiForm
                      endpoint="/api/v1/admin/shipping"
                      method="POST"
                      extra={{ type: 'governorate', id: gv.id }}
                      submitLabel={L('حفظ المحافظة', 'Save governorate')}
                      successMessage={L('تم الحفظ.', 'Saved.')}
                      fields={[
                        { name: 'code', label: L('الرمز', 'Code'), required: true, defaultValue: gv.code, dir: 'ltr' },
                        { name: 'nameAr', label: L('الاسم بالعربية', 'Name (Arabic)'), required: true, defaultValue: gv.nameAr, dir: 'rtl' },
                        { name: 'nameEn', label: L('الاسم بالإنجليزية', 'Name (English)'), required: true, defaultValue: gv.nameEn },
                        { name: 'sortOrder', label: L('الترتيب', 'Sort order'), type: 'number', defaultValue: gv.sortOrder, min: 0 },
                        { name: 'active', label: L('فعالة', 'Active'), type: 'checkbox', defaultValue: gv.active },
                      ]}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="ship-forms">
        <section className="adm-section">
          <header>
            <h2>{L('إضافة محافظة', 'Add governorate')}</h2>
          </header>
          <div className="adm-form-grid">
            <ApiForm
              endpoint="/api/v1/admin/shipping"
              method="POST"
              extra={{ type: 'governorate' }}
              submitLabel={L('إضافة المحافظة', 'Add governorate')}
              successMessage={L('تمت الإضافة.', 'Added.')}
              fields={[
                { name: 'code', label: L('الرمز (مثال BAGHDAD)', 'Code (e.g. BAGHDAD)'), required: true, dir: 'ltr' },
                { name: 'nameAr', label: L('الاسم بالعربية', 'Name (Arabic)'), required: true, dir: 'rtl' },
                { name: 'nameEn', label: L('الاسم بالإنجليزية', 'Name (English)'), required: true },
                { name: 'sortOrder', label: L('الترتيب', 'Sort order'), type: 'number', defaultValue: 0, min: 0 },
              ]}
            />
          </div>
        </section>

        <section className="adm-section">
          <header>
            <h2>{L('إضافة منطقة', 'Add area')}</h2>
          </header>
          {govOptions.length === 0 ? (
            <EmptyState>{L('أضف محافظة أولاً.', 'Add a governorate first.')}</EmptyState>
          ) : (
            <div className="adm-form-grid">
              <ApiForm
                endpoint="/api/v1/admin/shipping"
                method="POST"
                extra={{ type: 'area' }}
                submitLabel={L('إضافة المنطقة', 'Add area')}
                successMessage={L('تمت الإضافة.', 'Added.')}
                fields={[
                  { name: 'governorateId', label: L('المحافظة', 'Governorate'), type: 'select', required: true, options: govOptions },
                  { name: 'nameAr', label: L('الاسم بالعربية', 'Name (Arabic)'), required: true, dir: 'rtl' },
                  { name: 'nameEn', label: L('الاسم بالإنجليزية', 'Name (English)'), required: true },
                ]}
              />
            </div>
          )}
        </section>
      </div>

      <section className="adm-section" id="ship-rules">
        <header>
          <h2>{L('قاعدة شحن جديدة', 'New shipping rule')}</h2>
        </header>
        <p className="adm-note">
          {L(
            'كل قاعدة نسخة جديدة. القاعدة المفتوحة السابقة لنفس النطاق تُغلق تلقائياً عند بداية الجديدة. التواريخ بتوقيت بغداد.',
            'Each rule is a new version. The open rule for the same scope is closed automatically when the new one starts. Dates are Baghdad time.',
          )}
        </p>
        {govOptions.length === 0 ? (
          <EmptyState>{L('أضف محافظة أولاً.', 'Add a governorate first.')}</EmptyState>
        ) : (
          <div className="adm-form-grid">
            <ApiForm
              endpoint="/api/v1/admin/shipping/rules"
              submitLabel={L('حفظ القاعدة', 'Save rule')}
              successMessage={L('تم حفظ القاعدة الجديدة.', 'New rule saved.')}
              fields={[
                { name: 'governorateId', label: L('المحافظة', 'Governorate'), type: 'select', required: true, options: govOptions },
                { name: 'areaId', label: L('المنطقة (اختياري: فارغ = كامل المحافظة)', 'Area (optional: empty = whole governorate)'), type: 'select', options: data.governorates.flatMap((gv) => gv.areas.map((a) => ({ value: a.id, label: `${locale === 'ar' ? gv.nameAr : gv.nameEn} / ${locale === 'ar' ? a.nameAr : a.nameEn}` }))) },
                { name: 'amount', label: L('المبلغ (دينار عراقي صحيح)', 'Amount (whole IQD)'), required: true, placeholder: '0', help: L('يُدخله المسؤول. لا توجد قيمة افتراضية.', 'Entered by the administrator. No default value.') },
                { name: 'effectiveFrom', label: L('ساري من (توقيت بغداد)', 'Effective from (Baghdad time)'), type: 'datetime-local', required: true },
                { name: 'effectiveTo', label: L('ساري حتى (اختياري)', 'Effective to (optional)'), type: 'datetime-local' },
              ]}
            />
          </div>
        )}
      </section>

      <section className="adm-section" id="ship-history">
        <header>
          <h2>{L('سجل قواعد الشحن', 'Shipping rule history')}</h2>
        </header>
        {data.rules.length === 0 ? (
          <EmptyState>{L('لا توجد قواعد بعد.', 'No rules yet.')}</EmptyState>
        ) : (
          <div className="table-wrap adm-table">
            <table>
              <thead>
                <tr>
                  <th>{L('المحافظة', 'Governorate')}</th>
                  <th>{L('المنطقة', 'Area')}</th>
                  <th className="num">{L('المبلغ (IQD)', 'Amount (IQD)')}</th>
                  <th>{L('ساري من', 'From')}</th>
                  <th>{L('ساري حتى', 'To')}</th>
                  <th>{L('الحالة', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.governorate}</td>
                    <td>{r.area ?? L('كل المحافظة', 'Whole governorate')}</td>
                    <td className="num">{prices ? r.amount : <span className="muted">{L('مخفي (price.view)', 'Hidden (price.view)')}</span>}</td>
                    <td>{formatDateTime(r.effectiveFrom, locale)}</td>
                    <td>{r.effectiveTo ? formatDateTime(r.effectiveTo, locale) : '—'}</td>
                    <td>
                      <Badge tone={r.status === 'CURRENT' ? 'ok' : r.status === 'SCHEDULED' ? 'warn' : 'neutral'}>{statusLabel[r.status] ?? r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
