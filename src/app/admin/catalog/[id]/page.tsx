import Link from 'next/link';
import { Badge, EmptyState, Money } from '@/components/ui';
import { ApiForm, ActionButton } from '@/components/forms';
import { formatDateTime } from '@/lib/time';
import { PERMISSIONS } from '@/lib/rbac';
import { AppError } from '@/lib/errors';
import { db } from '@/lib/db';
import { getAdminSku } from '@/modules/catalog/admin';
import { gatePage, isUuid, NotFoundCard } from '../../_lib/gate';
import { categoryOptions, loadTaxonomyOptions } from '../../_lib/taxonomy';
import { NullableJsonForm } from '../../_components/NullableJsonForm';
import { AttributesForm, type AttributeInput } from '../../_components/AttributesForm';
import { ImageUpload, SKU_IMAGE_LIMIT } from '../../_components/ImageUpload';
import '../../css/catalog.css';

export const dynamic = 'force-dynamic';

export default async function AdminSkuEditor({ params }: { params: Promise<{ id: string }> }) {
  const g = await gatePage(PERMISSIONS.CATALOG_VIEW, '/admin/catalog');
  if (!g.ok) return g.node;
  const { L, locale, user, prices: canPrice } = g;
  const { id } = await params;
  if (!isUuid(id)) {
    return <NotFoundCard message={L('لا يوجد سجل بهذا المعرّف.', 'No record with this identifier.')} />;
  }

  let detail;
  try {
    detail = await getAdminSku(id);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') {
      return (
        <>
          <div className="adm-head">
            <div>
              <h1>{L('المنتج غير موجود', 'SKU not found')}</h1>
            </div>
          </div>
          <NotFoundCard message={L('لا يوجد SKU بهذا المعرّف.', 'No SKU with this identifier.')} />
          <p>
            <Link className="cat-back" href="/admin/catalog">← {L('العودة إلى الكتالوج', 'Back to catalog')}</Link>
          </p>
        </>
      );
    }
    throw err;
  }
  const { sku } = detail;
  const canManage = user.permissions.has(PERMISSIONS.CATALOG_MANAGE);
  const canEditPrice = user.permissions.has(PERMISSIONS.PRICE_EDIT);
  const canAdjust = user.permissions.has(PERMISSIONS.INVENTORY_ADJUST);
  const canImages = user.permissions.has(PERMISSIONS.IMAGE_MANAGE);
  const canInventory = user.permissions.has(PERMISSIONS.INVENTORY_VIEW);
  const tax = await loadTaxonomyOptions();
  const images = await db.skuImage.findMany({ where: { skuId: id }, orderBy: { sortOrder: 'asc' } });
  const defs = await db.attributeDefinition.findMany({ where: { categoryId: sku.categoryId }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
  const valueByDef = new Map(sku.attributeValues.map((v) => [v.attributeDefinitionId, v.value]));
  const attributeInputs: AttributeInput[] = defs.map((d) => ({
    key: d.key,
    labelAr: d.labelAr,
    labelEn: d.labelEn,
    dataType: d.dataType,
    unit: d.unit,
    options: Array.isArray(d.options) ? (d.options as string[]) : null,
    required: d.required,
    value: valueByDef.get(d.id) ?? null,
  }));
  const base = `/api/v1/admin/skus/${id}`;
  const isAr = locale === 'ar';

  return (
    <>
      <p>
        <Link className="cat-back" href="/admin/catalog">← {L('الكتالوج', 'Catalog')}</Link>
      </p>
      <div className="adm-head">
        <div>
          <h1>{`${sku.sku} · ${isAr ? sku.nameAr : sku.nameEn}`}</h1>
          <p className="muted">{L(`الفئة: ${sku.category.nameAr}`, `Category: ${sku.category.nameEn}`)}</p>
        </div>
        <div className="adm-head-actions">
          <span className="cat-status">
            {sku.published ? <Badge tone="ok">{L('منشور', 'Published')}</Badge> : <Badge>{L('غير منشور', 'Unpublished')}</Badge>}
            {sku.active ? <Badge tone="ok">{L('فعال', 'Active')}</Badge> : <Badge tone="danger">{L('غير فعال', 'Inactive')}</Badge>}
          </span>
          {canManage && (
            <ActionButton
              endpoint={base}
              method="PATCH"
              body={{ published: !sku.published }}
              label={sku.published ? L('إلغاء النشر', 'Unpublish') : L('نشر', 'Publish')}
              tone={sku.published ? 'default' : 'primary'}
              confirmText={sku.published ? L('إلغاء نشر هذا المنتج؟ سيختفي عن العملاء.', 'Unpublish this SKU? Customers will no longer see it.') : L('نشر هذا المنتج للعملاء؟', 'Publish this SKU to customers?')}
            />
          )}
        </div>
      </div>

      <div className="cat-grid">
        <section className="adm-section" aria-labelledby="sku-details-title">
          <header>
            <h2 id="sku-details-title">{L('بيانات المنتج', 'Product details')}</h2>
          </header>
          {canManage ? (
            <div className="cat-form-grid">
              <NullableJsonForm
                endpoint={base}
                method="PATCH"
                locale={locale}
                submitLabel={L('حفظ التغييرات', 'Save changes')}
                busyLabel={L('جارٍ الحفظ…', 'Saving…')}
                successMessage={L('تم الحفظ.', 'Saved.')}
                fields={[
                  { name: 'categoryId', label: L('الفئة', 'Category'), type: 'select', required: true, options: categoryOptions(tax.categories, locale), defaultValue: sku.categoryId },
                  { name: 'brandId', label: L('العلامة التجارية', 'Brand'), type: 'select', nullable: true, options: tax.brands.map((b) => ({ value: b.id, label: b.name })), defaultValue: sku.brandId },
                  { name: 'modelId', label: L('الموديل', 'Model'), type: 'select', nullable: true, options: tax.models.map((m) => ({ value: m.id, label: m.name })), defaultValue: sku.modelId },
                  { name: 'qualityId', label: L('الجودة', 'Quality'), type: 'select', nullable: true, options: tax.qualities.map((q) => ({ value: q.id, label: isAr ? q.nameAr : q.nameEn })), defaultValue: sku.qualityId },
                  { name: 'nameAr', label: L('الاسم بالعربية', 'Name (Arabic)'), required: true, defaultValue: sku.nameAr },
                  { name: 'nameEn', label: L('الاسم بالإنجليزية', 'Name (English)'), required: true, defaultValue: sku.nameEn },
                  { name: 'descriptionAr', label: L('الوصف بالعربية', 'Description (Arabic)'), type: 'textarea', nullable: true, defaultValue: sku.descriptionAr },
                  { name: 'descriptionEn', label: L('الوصف بالإنجليزية', 'Description (English)'), type: 'textarea', nullable: true, defaultValue: sku.descriptionEn },
                  { name: 'unit', label: L('وحدة القياس', 'Unit'), required: true, defaultValue: sku.unit },
                  { name: 'active', label: L('فعال', 'Active'), type: 'checkbox', defaultValue: sku.active },
                ]}
              />
            </div>
          ) : (
            <dl>
              <dt className="muted">{L('الاسم (EN)', 'Name (EN)')}</dt>
              <dd>{sku.nameEn}</dd>
              <dt className="muted">{L('الاسم (AR)', 'Name (AR)')}</dt>
              <dd dir="rtl">{sku.nameAr}</dd>
              <dt className="muted">{L('الوحدة', 'Unit')}</dt>
              <dd>{sku.unit}</dd>
            </dl>
          )}
        </section>

        <section className="adm-section" aria-labelledby="sku-attr-title">
          <header>
            <h2 id="sku-attr-title">{L('الخصائص', 'Attributes')}</h2>
          </header>
          {canManage ? (
            <AttributesForm skuId={id} attributes={attributeInputs} locale={locale} />
          ) : (
            <EmptyState>{L('لا تملك صلاحية تعديل الخصائص.', 'You cannot edit attributes.')}</EmptyState>
          )}
        </section>
      </div>

      <section className="adm-section" aria-labelledby="sku-images-title">
        <header>
          <h2 id="sku-images-title">{L('الصور', 'Images')}</h2>
          <span className="muted">{L(`${images.length} من ${SKU_IMAGE_LIMIT}`, `${images.length} of ${SKU_IMAGE_LIMIT}`)}</span>
        </header>
        <p className="cat-lede">{L(`الحد الأقصى ${SKU_IMAGE_LIMIT} صور. تظهر الصور للعملاء بعد نشر المنتج فقط.`, `Maximum ${SKU_IMAGE_LIMIT} images. Images are visible to customers only once the SKU is published.`)}</p>
        {images.length === 0 ? (
          <EmptyState>{L('لا توجد صور.', 'No images yet.')}</EmptyState>
        ) : (
          <div className="cat-images">
            {images.map((img) => (
              <figure key={img.id} className="cat-image-tile">
                {sku.published ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/v1/media/${img.id}`} alt={img.altText ?? sku.nameEn} />
                ) : (
                  <div className="cat-image-preview">{L('معاينة بعد النشر', 'Preview after publishing')}</div>
                )}
                <figcaption>{img.altText ?? img.mimeType}</figcaption>
                {canImages && (
                  <ActionButton endpoint={`/api/v1/admin/images/${img.id}`} method="DELETE" label={L('حذف الصورة', 'Delete image')} tone="danger" confirmText={L('حذف هذه الصورة نهائياً؟', 'Delete this image permanently?')} />
                )}
              </figure>
            ))}
          </div>
        )}
        {canImages && <ImageUpload skuId={id} count={images.length} locale={locale} />}
      </section>

      {canPrice && (
        <section className="adm-section" aria-labelledby="sku-price-title">
          <header>
            <h2 id="sku-price-title">{L('الأسعار حسب المستوى (IQD)', 'Tier prices by level (IQD)')}</h2>
            <span className="muted">{L('أرقام صحيحة بالدينار العراقي', 'Whole Iraqi dinars')}</span>
          </header>
          <div className="table-wrap adm-table">
            <table>
              <thead>
                <tr>
                  <th>{L('المستوى', 'Level')}</th>
                  <th className="num">{L('السعر الحالي', 'Current price')}</th>
                  <th>{L('تحديث', 'Update')}</th>
                </tr>
              </thead>
              <tbody>
                {tax.levels.map((lvl) => {
                  const current = detail.prices.find((p) => p.levelId === lvl.id)?.amount ?? null;
                  return (
                    <tr key={lvl.id}>
                      <td>
                        <div className="cat-tier-level">
                          <span className="cat-code">{lvl.code}</span>
                          <small>
                            {lvl.name}
                            {lvl.active ? '' : ` (${L('غير فعال', 'inactive')})`}
                          </small>
                        </div>
                      </td>
                      <td className="num">
                        <Money value={current} locale={locale} />
                      </td>
                      <td>
                        {canEditPrice ? (
                          <div className="cat-tier-form">
                            <ApiForm
                              endpoint={`${base}/prices`}
                              method="PUT"
                              extra={{ priceLevelId: lvl.id }}
                              submitLabel={L('حفظ السعر', 'Save price')}
                              successMessage={L('تم تحديث السعر.', 'Price updated.')}
                              fields={[
                                { name: 'amount', label: L('السعر (دينار عراقي صحيح)', 'Price (whole IQD)'), required: true, placeholder: '15000', help: L('أرقام فقط، بدون فواصل.', 'Digits only, no separators.') },
                                { name: 'reason', label: L('السبب', 'Reason'), required: true },
                              ]}
                            />
                          </div>
                        ) : (
                          <span className="muted">{L('للعرض فقط', 'View only')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3 className="cat-subhead">{L('سجل الأسعار', 'Price history')}</h3>
          {detail.priceHistory.length === 0 ? (
            <EmptyState>{L('لا توجد تغييرات مسجلة.', 'No recorded changes.')}</EmptyState>
          ) : (
            <div className="table-wrap adm-table">
              <table>
                <thead>
                  <tr>
                    <th>{L('التاريخ', 'When')}</th>
                    <th>{L('المستوى', 'Level')}</th>
                    <th className="num">{L('القديم', 'Old')}</th>
                    <th className="num">{L('الجديد', 'New')}</th>
                    <th>{L('المصدر', 'Source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.priceHistory.map((h, i) => (
                    <tr key={`${h.occurredAt.toString()}-${i}`}>
                      <td>{formatDateTime(h.occurredAt, locale)}</td>
                      <td>{h.level}</td>
                      <td className="num">
                        <Money value={h.oldAmount} locale={locale} />
                      </td>
                      <td className="num">
                        <Money value={h.newAmount} locale={locale} />
                      </td>
                      <td>{h.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {canInventory && (
        <section className="adm-section" aria-labelledby="sku-stock-title">
          <header>
            <h2 id="sku-stock-title">{L('المخزون', 'Stock')}</h2>
          </header>
          <dl className="adm-kpis">
            <div className="adm-kpi">
              <dt>{L('الفعلي', 'Physical')}</dt>
              <dd>{detail.stock.physicalOnHand}</dd>
            </div>
            <div className="adm-kpi">
              <dt>{L('محجوز', 'Reserved')}</dt>
              <dd>{detail.stock.reservedQty}</dd>
            </div>
            <div className={`adm-kpi${detail.stock.availableQty <= 0 ? ' is-warn' : ''}`}>
              <dt>{L('المتاح', 'Available')}</dt>
              <dd>{detail.stock.availableQty}</dd>
            </div>
            <div className="adm-kpi">
              <dt>{L('تاريخ المصدر', 'Source timestamp')}</dt>
              <dd className="cat-kpi-meta">{formatDateTime(detail.stock.sourceTimestamp, locale)}</dd>
            </div>
          </dl>
          {sku.alerts.length > 0 && (
            <p className="cat-status">
              {sku.alerts.map((a) => (
                <Badge key={a.id} tone="warn">
                  {a.alertType.replace(/_/g, ' ')}
                </Badge>
              ))}
            </p>
          )}
          {canAdjust && (
            <div className="cat-subsection">
              <h3>{L('تعديل المخزون يدوياً', 'Manual stock adjustment')}</h3>
              <div className="cat-form-grid">
                <ApiForm
                  endpoint={`${base}/inventory/adjust`}
                  submitLabel={L('تسجيل التعديل', 'Record adjustment')}
                  successMessage={L('تم تسجيل التعديل.', 'Adjustment recorded.')}
                  fields={[
                    { name: 'mode', label: L('الطريقة', 'Mode'), type: 'select', required: true, options: [{ value: 'SET', label: 'SET — set physical count' }, { value: 'DELTA', label: 'DELTA — add or subtract' }], defaultValue: 'DELTA' },
                    { name: 'value', label: L('القيمة (عدد صحيح)', 'Value (integer)'), type: 'number', required: true, step: 1, help: L('مع DELTA استخدم قيمة سالبة للخصم. لا يمكن أن ينزل الفعلي تحت المحجوز.', 'With DELTA use a negative number to subtract. Physical stock cannot drop below reserved units.') },
                    { name: 'reason', label: L('السبب', 'Reason'), required: true },
                  ]}
                />
              </div>
            </div>
          )}
          <div className="cat-subsection">
            <h3>{L('حركات المخزون (آخر 50)', 'Inventory movements (latest 50)')}</h3>
            {detail.movements.length === 0 ? (
              <EmptyState>{L('لا توجد حركات.', 'No movements.')}</EmptyState>
            ) : (
              <div className="table-wrap adm-table">
                <table>
                  <thead>
                    <tr>
                      <th>{L('التاريخ', 'When')}</th>
                      <th>{L('النوع', 'Type')}</th>
                      <th className="num">{L('التغيير', 'Change')}</th>
                      <th className="num">{L('الرصيد بعد', 'Balance after')}</th>
                      <th>{L('ملاحظة', 'Note')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.movements.map((m) => (
                      <tr key={m.id}>
                        <td>{formatDateTime(m.occurredAt, locale)}</td>
                        <td>{m.movementType.replace(/_/g, ' ')}</td>
                        <td className="num">{m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}</td>
                        <td className="num">{m.balanceAfter}</td>
                        <td>{m.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
