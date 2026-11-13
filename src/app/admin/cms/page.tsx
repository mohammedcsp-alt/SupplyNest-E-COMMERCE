import { PageHeader, Card, EmptyState, Badge } from '@/components/ui';
import { ApiForm, ActionButton } from '@/components/forms';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { listCmsBanners, listCmsPages } from '@/modules/admin/cms';
import { toBaghdadInputValue } from '@/modules/admin/time';
import { gatePage } from '../_lib/gate';

export const dynamic = 'force-dynamic';

export default async function AdminCms() {
  const g = await gatePage(PERMISSIONS.CONTENT_EDIT, '/admin/cms');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const canPublish = user.permissions.has(PERMISSIONS.CONTENT_PUBLISH);
  const [pages, banners] = await Promise.all([listCmsPages(), listCmsBanners()]);

  const publishField = canPublish ? [{ name: 'published', label: L('منشورة', 'Published'), type: 'checkbox' as const, defaultValue: false }] : [];

  return (
    <>
      <PageHeader
        title={L('المحتوى', 'Content (CMS)')}
        subtitle={L('الصفحات والبنرات. النص يُعرض كنص فقط (بدون HTML). النشر يتطلب صلاحية content.publish.', 'Pages and banners. Text is rendered as plain text (no HTML). Publishing requires content.publish.')}
      />

      <Card title={L('الصفحات', 'Pages')}>
        {pages.length === 0 ? (
          <EmptyState>{L('لا توجد صفحات.', 'No pages.')}</EmptyState>
        ) : (
          <div className="stack">
            {pages.map((p) => (
              <details key={p.id}>
                <summary>
                  <strong dir="ltr">/p/{p.slug}</strong> — {locale === 'ar' ? p.titleAr : p.titleEn}{' '}
                  {p.publishedAt ? <Badge tone="ok">{L('منشورة', 'Published')}</Badge> : <Badge>{L('مسودة', 'Draft')}</Badge>}{' '}
                  <span className="muted" style={{ fontSize: '0.85rem' }}>{formatDateTime(p.updatedAt, locale)}</span>
                </summary>
                <div style={{ paddingBlockStart: 10 }}>
                  <ApiForm
                    endpoint={`/api/v1/admin/cms/pages/${p.id}`}
                    method="PUT"
                    submitLabel={L('حفظ الصفحة', 'Save page')}
                    successMessage={L('تم الحفظ.', 'Saved.')}
                    fields={[
                      { name: 'titleAr', label: L('العنوان بالعربية', 'Title (Arabic)'), required: true, defaultValue: p.titleAr, dir: 'rtl' },
                      { name: 'titleEn', label: L('العنوان بالإنجليزية', 'Title (English)'), required: true, defaultValue: p.titleEn },
                      { name: 'bodyAr', label: L('النص بالعربية', 'Body (Arabic)'), type: 'textarea', required: true, defaultValue: p.bodyAr, dir: 'rtl' },
                      { name: 'bodyEn', label: L('النص بالإنجليزية', 'Body (English)'), type: 'textarea', required: true, defaultValue: p.bodyEn },
                      ...(canPublish ? [{ name: 'published', label: L('منشورة للعملاء', 'Published to customers'), type: 'checkbox' as const, defaultValue: !!p.publishedAt }] : []),
                    ]}
                  />
                  {!canPublish && <p className="muted">{L('لا تملك صلاحية النشر؛ تغيير حالة النشر غير متاح.', 'You lack content.publish; publish state cannot be changed.')}</p>}
                  {canPublish && (
                    <div style={{ paddingBlockStart: 10 }}>
                      {p.publishedAt ? (
                        <p className="muted">{L('ألغِ النشر أولاً لحذف الصفحة.', 'Unpublish the page first to delete it.')}</p>
                      ) : (
                        <ActionButton
                          endpoint={`/api/v1/admin/cms/pages/${p.id}`}
                          method="DELETE"
                          label={L('حذف الصفحة', 'Delete page')}
                          tone="danger"
                          confirmText={L('حذف هذه الصفحة نهائياً؟', 'Permanently delete this page?')}
                          reasonLabel={L('سبب الحذف (3 أحرف على الأقل)', 'Reason for deleting (at least 3 characters)')}
                        />
                      )}
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>

      <Card title={L('إضافة صفحة', 'Add page')}>
        <ApiForm
          endpoint="/api/v1/admin/cms/pages"
          submitLabel={L('إنشاء الصفحة', 'Create page')}
          successMessage={L('تم إنشاء الصفحة.', 'Page created.')}
          fields={[
            { name: 'slug', label: L('المعرّف في الرابط (slug)', 'URL slug'), required: true, placeholder: 'shipping-policy', dir: 'ltr', help: L('أحرف صغيرة وأرقام وشرطات.', 'Lowercase letters, digits and dashes.') },
            { name: 'titleAr', label: L('العنوان بالعربية', 'Title (Arabic)'), required: true, dir: 'rtl' },
            { name: 'titleEn', label: L('العنوان بالإنجليزية', 'Title (English)'), required: true },
            { name: 'bodyAr', label: L('النص بالعربية', 'Body (Arabic)'), type: 'textarea', required: true, dir: 'rtl' },
            { name: 'bodyEn', label: L('النص بالإنجليزية', 'Body (English)'), type: 'textarea', required: true },
            ...publishField,
          ]}
        />
      </Card>

      <Card title={L('البنرات', 'Banners')}>
        {banners.length === 0 ? (
          <EmptyState>{L('لا توجد بنرات.', 'No banners.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{L('العنوان', 'Title')}</th>
                  <th>{L('الوجهة', 'Target')}</th>
                  <th className="num">{L('الترتيب', 'Position')}</th>
                  <th>{L('الحالة', 'Status')}</th>
                  <th>{L('الفترة', 'Window')}</th>
                </tr>
              </thead>
              <tbody>
                {banners.map((b) => (
                  <tr key={b.id}>
                    <td>{locale === 'ar' ? b.titleAr : b.titleEn}</td>
                    <td dir="ltr">{b.targetPath}</td>
                    <td className="num">{b.position}</td>
                    <td>{b.active ? <Badge tone="ok">{L('فعال', 'Active')}</Badge> : <Badge>{L('غير فعال', 'Inactive')}</Badge>}</td>
                    <td>
                      {b.activeFrom ? formatDateTime(b.activeFrom, locale) : '—'} → {b.activeTo ? formatDateTime(b.activeTo, locale) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {banners.length > 0 && (
          <>
            <h3>{L('تعديل البنرات', 'Edit banners')}</h3>
            <div className="stack">
              {banners.map((b) => (
                <details key={b.id}>
                  <summary>
                    <strong>{locale === 'ar' ? b.titleAr : b.titleEn}</strong> {b.active ? <Badge tone="ok">{L('فعال', 'Active')}</Badge> : <Badge>{L('غير فعال', 'Inactive')}</Badge>}
                  </summary>
                  <div style={{ paddingBlockStart: 10 }}>
                    <ApiForm
                      endpoint={`/api/v1/admin/cms/banners/${b.id}`}
                      method="PATCH"
                      submitLabel={L('حفظ البنر', 'Save banner')}
                      successMessage={L('تم حفظ البنر.', 'Banner saved.')}
                      fields={[
                        { name: 'titleAr', label: L('العنوان بالعربية', 'Title (Arabic)'), required: true, defaultValue: b.titleAr, dir: 'rtl' },
                        { name: 'titleEn', label: L('العنوان بالإنجليزية', 'Title (English)'), required: true, defaultValue: b.titleEn },
                        { name: 'targetPath', label: L('الوجهة (مسار داخلي)', 'Target (internal path)'), required: true, defaultValue: b.targetPath, dir: 'ltr' },
                        { name: 'position', label: L('الترتيب', 'Position'), type: 'number', defaultValue: b.position, min: 0, max: 1000 },
                        { name: 'active', label: L('فعال', 'Active'), type: 'checkbox', defaultValue: b.active },
                        { name: 'activeFrom', label: L('يبدأ (بغداد، اختياري)', 'Starts (Baghdad, optional)'), type: 'datetime-local', defaultValue: toBaghdadInputValue(b.activeFrom) },
                        { name: 'activeTo', label: L('ينتهي (بغداد، اختياري)', 'Ends (Baghdad, optional)'), type: 'datetime-local', defaultValue: toBaghdadInputValue(b.activeTo) },
                      ]}
                    />
                    {canPublish && b.active && (
                      <ActionButton
                        endpoint={`/api/v1/admin/cms/banners/${b.id}`}
                        method="DELETE"
                        label={L('إلغاء تفعيل البنر', 'Deactivate banner')}
                        tone="danger"
                        confirmText={L('إلغاء تفعيل هذا البنر؟ يبقى السجل محفوظاً.', 'Deactivate this banner? The record is kept.')}
                      />
                    )}
                  </div>
                </details>
              ))}
            </div>
          </>
        )}
        <h3>{L('إضافة بنر', 'Add banner')}</h3>
        <ApiForm
          endpoint="/api/v1/admin/cms/banners"
          submitLabel={L('إضافة البنر', 'Add banner')}
          successMessage={L('تمت إضافة البنر.', 'Banner added.')}
          fields={[
            { name: 'titleAr', label: L('العنوان بالعربية', 'Title (Arabic)'), required: true, dir: 'rtl' },
            { name: 'titleEn', label: L('العنوان بالإنجليزية', 'Title (English)'), required: true },
            { name: 'targetPath', label: L('الوجهة (مسار داخلي)', 'Target (internal path)'), required: true, placeholder: '/catalog', dir: 'ltr' },
            { name: 'imageKey', label: L('مفتاح الصورة (اختياري)', 'Image key (optional)'), dir: 'ltr' },
            { name: 'position', label: L('الترتيب', 'Position'), type: 'number', defaultValue: 0, min: 0, max: 1000 },
            ...(canPublish ? [{ name: 'active', label: L('فعال', 'Active'), type: 'checkbox' as const, defaultValue: false }] : []),
            { name: 'activeFrom', label: L('يبدأ (بغداد، اختياري)', 'Starts (Baghdad, optional)'), type: 'datetime-local' },
            { name: 'activeTo', label: L('ينتهي (بغداد، اختياري)', 'Ends (Baghdad, optional)'), type: 'datetime-local' },
          ]}
        />
      </Card>
    </>
  );
}
