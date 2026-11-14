import '../css/system.css';
import { Badge } from '@/components/ui';
import { ApiForm, ActionButton } from '@/components/forms';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { listCmsBanners, listCmsPages } from '@/modules/admin/cms';
import { toBaghdadInputValue } from '@/modules/admin/time';
import { gatePage } from '../_lib/gate';
import { OwnerImage } from '../_components/OwnerImage';

export const dynamic = 'force-dynamic';

export default async function AdminCms() {
  const g = await gatePage(PERMISSIONS.CONTENT_EDIT, '/admin/cms');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const canPublish = user.permissions.has(PERMISSIONS.CONTENT_PUBLISH);
  const [pages, banners] = await Promise.all([listCmsPages(), listCmsBanners()]);

  const publishField = canPublish ? [{ name: 'published', label: L('منشورة', 'Published'), type: 'checkbox' as const, defaultValue: false }] : [];
  const publishedPages = pages.filter((p) => p.publishedAt).length;
  const activeBanners = banners.filter((b) => b.active).length;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{L('المحتوى', 'Content (CMS)')}</h1>
          <p className="muted">
            {L(
              'الصفحات والبنرات. النص يُعرض كنص فقط (بدون HTML). النشر يتطلب صلاحية content.publish.',
              'Pages and banners. Text is rendered as plain text (no HTML). Publishing requires content.publish.',
            )}
          </p>
        </div>
        <div className="adm-head-actions">
          <a className="btn btn-small" href="#cms-pages">{L('الصفحات', 'Pages')}</a>
          <a className="btn btn-small" href="#cms-banners">{L('البنرات', 'Banners')}</a>
        </div>
      </div>

      <div className="adm-kpis">
        <div className="adm-kpi">
          <strong>{pages.length}</strong>
          <span>{L('الصفحات', 'Pages')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{publishedPages}</strong>
          <span>{L('صفحات منشورة', 'Published pages')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{pages.length - publishedPages}</strong>
          <span>{L('مسودات', 'Drafts')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{activeBanners}</strong>
          <span>{L('بنرات فعالة', 'Active banners')}</span>
        </div>
      </div>

      <section className="adm-section" id="cms-pages">
        <header>
          <h2>{L('الصفحات', 'Pages')}</h2>
          <span className="muted">{L(`${pages.length} صفحة`, `${pages.length} pages`)}</span>
        </header>
        {pages.length === 0 ? (
          <p className="adm-empty">{L('لا توجد صفحات.', 'No pages.')}</p>
        ) : (
          pages.map((p) => (
            <details key={p.id} className="adm-item">
              <summary>
                <span className="adm-code-cell" dir="ltr">/p/{p.slug}</span>
                <span className="adm-item-title">{locale === 'ar' ? p.titleAr : p.titleEn}</span>
                {p.publishedAt ? <Badge tone="ok">{L('منشورة', 'Published')}</Badge> : <Badge>{L('مسودة', 'Draft')}</Badge>}
                <span className="adm-item-meta">{formatDateTime(p.updatedAt, locale)}</span>
              </summary>
              <div className="adm-item-body">
                <div className="adm-form-grid">
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
                </div>
                {!canPublish && <p className="adm-note">{L('لا تملك صلاحية النشر؛ تغيير حالة النشر غير متاح.', 'You lack content.publish; publish state cannot be changed.')}</p>}
                {canPublish && (
                  <div style={{ marginBlockStart: 14 }}>
                    {p.publishedAt ? (
                      <p className="adm-note">{L('ألغِ النشر أولاً لحذف الصفحة.', 'Unpublish the page first to delete it.')}</p>
                    ) : (
                      <details className="adm-confirm">
                        <summary>{L('حذف الصفحة…', 'Delete page…')}</summary>
                        <p className="adm-consequence">{L('تُحذف الصفحة نهائياً ولا يمكن استرجاعها.', 'The page is permanently deleted and cannot be recovered.')}</p>
                        <ActionButton
                          endpoint={`/api/v1/admin/cms/pages/${p.id}`}
                          method="DELETE"
                          label={L('حذف الصفحة', 'Delete page')}
                          tone="danger"
                          confirmText={L('حذف هذه الصفحة نهائياً؟', 'Permanently delete this page?')}
                          reasonLabel={L('سبب الحذف (3 أحرف على الأقل)', 'Reason for deleting (at least 3 characters)')}
                        />
                      </details>
                    )}
                  </div>
                )}
              </div>
            </details>
          ))
        )}

        <div className="adm-subhead">
          <h3>{L('إضافة صفحة', 'Add page')}</h3>
          <div className="adm-form-grid">
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
          </div>
        </div>
      </section>

      <section className="adm-section" id="cms-banners">
        <header>
          <h2>{L('البنرات', 'Banners')}</h2>
          <span className="muted">{L(`${banners.length} بنر`, `${banners.length} banners`)}</span>
        </header>
        {banners.length === 0 ? (
          <p className="adm-empty">{L('لا توجد بنرات.', 'No banners.')}</p>
        ) : (
          <div className="table-wrap adm-table">
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
                    <td className="code">{b.targetPath}</td>
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
          <div className="adm-subhead">
            <h3>{L('تعديل البنرات', 'Edit banners')}</h3>
            {banners.map((b) => (
              <details key={b.id} className="adm-item">
                <summary>
                  <span className="adm-item-title">{locale === 'ar' ? b.titleAr : b.titleEn}</span>
                  <span className="adm-code-cell" dir="ltr">{b.targetPath}</span>
                  {b.active ? <Badge tone="ok">{L('فعال', 'Active')}</Badge> : <Badge>{L('غير فعال', 'Inactive')}</Badge>}
                </summary>
                <div className="adm-item-body">
                  <div className="cms-banner-body">
                    <div className="cms-banner-media">
                      <OwnerImage
                        endpoint={`/api/v1/admin/cms/banners/${b.id}/image`}
                        previewUrl={`/api/v1/cms/banners/${b.id}/image`}
                        hasImage={Boolean(b.imageKey)}
                        locale={locale}
                        label={L('صورة البنر', 'Banner image')}
                      />
                    </div>
                    <div className="adm-form-grid">
                      <ApiForm
                        endpoint={`/api/v1/admin/cms/banners/${b.id}`}
                        method="PATCH"
                        submitLabel={L('حفظ البنر', 'Save banner')}
                        successMessage={L('تم حفظ البنر.', 'Banner saved.')}
                        fields={[
                          { name: 'titleAr', label: L('العنوان بالعربية', 'Title (Arabic)'), required: true, defaultValue: b.titleAr, dir: 'rtl' },
                          { name: 'titleEn', label: L('العنوان بالإنجليزية', 'Title (English)'), required: true, defaultValue: b.titleEn },
                          { name: 'targetPath', label: L('الوجهة (مسار داخلي)', 'Target (internal path)'), required: true, defaultValue: b.targetPath, dir: 'ltr' },
                          { name: 'descriptionAr', label: L('الوصف بالعربية (اختياري)', 'Description (Arabic, optional)'), type: 'textarea', defaultValue: b.descriptionAr ?? '', dir: 'rtl' },
                          { name: 'descriptionEn', label: L('الوصف بالإنجليزية (اختياري)', 'Description (English, optional)'), type: 'textarea', defaultValue: b.descriptionEn ?? '' },
                          { name: 'linkLabelAr', label: L('نص الرابط بالعربية (اختياري)', 'Link label (Arabic, optional)'), defaultValue: b.linkLabelAr ?? '', dir: 'rtl' },
                          { name: 'linkLabelEn', label: L('نص الرابط بالإنجليزية (اختياري)', 'Link label (English, optional)'), defaultValue: b.linkLabelEn ?? '' },
                          { name: 'position', label: L('الترتيب', 'Position'), type: 'number', defaultValue: b.position, min: 0, max: 1000 },
                          { name: 'active', label: L('فعال', 'Active'), type: 'checkbox', defaultValue: b.active },
                          { name: 'activeFrom', label: L('يبدأ (بغداد، اختياري)', 'Starts (Baghdad, optional)'), type: 'datetime-local', defaultValue: toBaghdadInputValue(b.activeFrom) },
                          { name: 'activeTo', label: L('ينتهي (بغداد، اختياري)', 'Ends (Baghdad, optional)'), type: 'datetime-local', defaultValue: toBaghdadInputValue(b.activeTo) },
                        ]}
                      />
                    </div>
                  </div>
                  {canPublish && b.active && (
                    <div style={{ marginBlockStart: 14 }}>
                      <details className="adm-confirm">
                        <summary>{L('إلغاء تفعيل البنر…', 'Deactivate banner…')}</summary>
                        <p className="adm-consequence">
                          {L('يتوقف ظهور البنر في الواجهة. يبقى السجل محفوظاً.', 'The banner stops appearing on the storefront. The record is kept.')}
                        </p>
                        <ActionButton
                          endpoint={`/api/v1/admin/cms/banners/${b.id}`}
                          method="DELETE"
                          label={L('إلغاء تفعيل البنر', 'Deactivate banner')}
                          tone="danger"
                          confirmText={L('إلغاء تفعيل هذا البنر؟ يبقى السجل محفوظاً.', 'Deactivate this banner? The record is kept.')}
                        />
                      </details>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
        <div className="adm-subhead">
          <h3>{L('إضافة بنر', 'Add banner')}</h3>
          <div className="adm-form-grid">
            <ApiForm
              endpoint="/api/v1/admin/cms/banners"
              submitLabel={L('إضافة البنر', 'Add banner')}
              successMessage={L('تمت إضافة البنر.', 'Banner added.')}
              fields={[
                { name: 'titleAr', label: L('العنوان بالعربية', 'Title (Arabic)'), required: true, dir: 'rtl' },
                { name: 'titleEn', label: L('العنوان بالإنجليزية', 'Title (English)'), required: true },
                { name: 'targetPath', label: L('الوجهة (مسار داخلي)', 'Target (internal path)'), required: true, placeholder: '/catalog', dir: 'ltr' },
                { name: 'descriptionAr', label: L('الوصف بالعربية (اختياري)', 'Description (Arabic, optional)'), type: 'textarea', dir: 'rtl' },
                { name: 'descriptionEn', label: L('الوصف بالإنجليزية (اختياري)', 'Description (English, optional)'), type: 'textarea' },
                { name: 'linkLabelAr', label: L('نص الرابط بالعربية (اختياري)', 'Link label (Arabic, optional)'), dir: 'rtl' },
                { name: 'linkLabelEn', label: L('نص الرابط بالإنجليزية (اختياري)', 'Link label (English, optional)') },
                { name: 'position', label: L('الترتيب', 'Position'), type: 'number', defaultValue: 0, min: 0, max: 1000 },
                ...(canPublish ? [{ name: 'active', label: L('فعال', 'Active'), type: 'checkbox' as const, defaultValue: false }] : []),
                { name: 'activeFrom', label: L('يبدأ (بغداد، اختياري)', 'Starts (Baghdad, optional)'), type: 'datetime-local' },
                { name: 'activeTo', label: L('ينتهي (بغداد، اختياري)', 'Ends (Baghdad, optional)'), type: 'datetime-local' },
              ]}
            />
          </div>
        </div>
      </section>
    </>
  );
}
