import { discrepancyReasonVisible } from '@/modules/fulfillment/visibility';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton, ApiForm } from '@/components/forms';
import { Alert, Card, EmptyState, ForbiddenNotice, LoginRequired, PageHeader, StatusBadge } from '@/components/ui';
import { EVENT_LABEL, FULFILLMENT_AR, fmtDateTime, personName } from '@/components/ops';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { FULFILLMENT_LABELS, getJobForActor } from '@/modules/fulfillment/service';
import { FulfillmentLinesForm, type LineInput } from './FulfillmentLinesForm';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Address = { recipientName?: string; recipientPhone?: string; governorate?: string; area?: string | null; details?: string };

export default async function FulfillmentJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const { id } = await params;
  const { done } = await searchParams;
  const next = `/fulfillment/jobs/${id}`;

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next={next} />;
  const user = await userWithPermission(PERMISSIONS.FULFILLMENT_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;
  if (!UUID.test(id)) notFound();

  let data;
  try {
    data = await getJobForActor(user, id);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }
  const { job, canSeeExpected } = data;
  const status = job.status;
  const has = (p: string) => user.permissions.has(p);
  const isPicker = job.assignedPickerId === user.id;
  const isChecker = job.assignedCheckerId === user.id;
  // Independent count: the checker must not see the picker's shortage reason before submitting their own count.
  const reasonVisible = discrepancyReasonVisible({ viewerId: user.id, assignedCheckerId: job.assignedCheckerId, status: job.status, viewerCanResolve: has(PERMISSIONS.FULFILLMENT_DISCREPANCY_RESOLVE) });

  // Blind counting: a picker sees only their own picked counts; a checker never sees the picker's counts.
  const pickedVisible = canSeeExpected || isPicker;
  const checkedVisible = canSeeExpected;

  const canAssign = has(PERMISSIONS.FULFILLMENT_ASSIGN) && (status === 'PENDING_ASSIGNMENT' || status === 'ASSIGNED');
  const canPickStart = status === 'ASSIGNED' && isPicker && has(PERMISSIONS.FULFILLMENT_PICK);
  const canPickSubmit = status === 'PICKING' && isPicker && has(PERMISSIONS.FULFILLMENT_PICK);
  const canCheckStart = status === 'PICKED' && isChecker && has(PERMISSIONS.FULFILLMENT_CHECK);
  const canCheckSubmit = status === 'CHECKING' && isChecker && has(PERMISSIONS.FULFILLMENT_CHECK);
  const canResolve = status === 'DISCREPANCY_HOLD' && has(PERMISSIONS.FULFILLMENT_DISCREPANCY_RESOLVE);
  const canPackStart = status === 'CHECKED' && has(PERMISSIONS.FULFILLMENT_PACK);
  const canAddParcel = status === 'PACKING' && has(PERMISSIONS.FULFILLMENT_PACK);
  const canFinishPack = status === 'PACKING' && has(PERMISSIONS.FULFILLMENT_PACK) && job.packages.length > 0;
  const canHandover = status === 'PACKED' && has(PERMISSIONS.FULFILLMENT_HANDOVER);
  const canPrint = has(PERMISSIONS.FULFILLMENT_PRINT) && status !== 'CANCELLED';

  const [staffUsers, couriers] = await Promise.all([
    canAssign
      ? db.user.findMany({
          where: { status: 'ACTIVE', userRoles: { some: { role: { name: { in: ['PICKER', 'CHECKER'] } } } } },
          select: { id: true, phone: true, fullNameAr: true, fullNameEn: true, userRoles: { select: { role: { select: { name: true } } } } },
          orderBy: { phone: 'asc' },
        })
      : Promise.resolve([]),
    canHandover ? db.courier.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const assignedIds = [job.assignedPickerId, job.assignedCheckerId].filter((x): x is string => !!x);
  const assignedUsers = assignedIds.length ? await db.user.findMany({ where: { id: { in: assignedIds } }, select: { id: true, phone: true, fullNameAr: true, fullNameEn: true } }) : [];
  const nameOf = new Map(assignedUsers.map((u) => [u.id, personName(u, locale)]));
  const pickerOptions = staffUsers
    .filter((u) => u.userRoles.some((r) => r.role.name === 'PICKER'))
    .map((u) => ({ value: u.id, label: personName(u, locale) }));
  const checkerOptions = staffUsers
    .filter((u) => u.userRoles.some((r) => r.role.name === 'CHECKER'))
    .map((u) => ({ value: u.id, label: personName(u, locale) }));

  const address = (job.order.addressSnapshot ?? {}) as Address;
  const label = locale === 'ar' ? FULFILLMENT_AR[status] : FULFILLMENT_LABELS[status];

  const guidance: Record<string, string> = {
    PENDING_ASSIGNMENT: L('كلّف ملتقطاً ومدققاً مختلفين. تُقفل تعديلات الطلب من العميل عند التكليف.', 'Assign a picker and a different checker. Customer edits lock at assignment.'),
    ASSIGNED: L('الملتقط المكلّف يبدأ الالتقاط.', 'The assigned picker starts picking.'),
    PICKING: L('الملتقط يدخل الكميات الملتقطة. النقص يحتاج سبباً.', 'The picker enters picked quantities. Shortages need a reason.'),
    PICKED: L('بانتظار المدقق المكلّف (شخص مختلف عن الملتقط) لإجراء العد المستقل.', 'Waiting for the assigned checker (a different person) to count independently.'),
    CHECKING: L('المدقق يدخل عدده المستقل. الأعداد السابقة غير معروضة.', 'The checker enters an independent count. Earlier counts are not shown.'),
    DISCREPANCY_HOLD: L('الأعداد غير متطابقة. المدير يعتمد كمية مقبولة وسبباً لكل سطر.', 'Counts do not match. A manager accepts a quantity and gives a reason for every line.'),
    CHECKED: L('تم التدقيق. يمكن بدء التعليب.', 'Checked. Packing can start.'),
    PACKING: L('أضف الطرود، ثم أنهِ التعليب (طرد واحد على الأقل).', 'Add parcels, then finish packing (at least one parcel).'),
    PACKED: L('تم التعليب. سلّم الطرود لشركة توصيل نشطة.', 'Packed. Hand the parcels to an active courier.'),
    HANDED_OVER: L('سُلّم للشركة. أُنشئت شحنة الشركة والفاتورة. هذا ليس تأكيداً للتوصيل.', 'Handed over to courier. The courier shipment and invoice were created. This does not confirm delivery.'),
    CANCELLED: L('ملغى.', 'Cancelled.'),
  };

  const lineInputs = (withCounts: boolean): LineInput[] =>
    job.lines.map((l) => ({
      id: l.id,
      sku: l.orderItem.skuSnapshot,
      title: l.orderItem.titleSnapshot,
      requestedQty: l.requestedQty,
      ...(withCounts ? { pickedQty: l.pickedQty, checkedQty: l.checkedQty } : {}),
    }));

  const anyAction = canAssign || canPickStart || canPickSubmit || canCheckStart || canCheckSubmit || canResolve || canPackStart || canAddParcel || canFinishPack || canHandover;

  return (
    <section className="stack">
      <PageHeader
        title={job.prepDocumentNo}
        subtitle={`${L('الطلب', 'Order')} ${job.order.orderNumber}`}
        actions={
          <>
            {canPrint && (
              <Link className="btn" href={`/fulfillment/jobs/${job.id}/print`}>
                {L('مستند التجهيز الداخلي', 'Internal preparation document')}
              </Link>
            )}
            <Link className="btn" href="/fulfillment">
              {L('العودة للقائمة', 'Back to queue')}
            </Link>
          </>
        }
      />

      <Alert tone="warn" role="status">
        {L('مستند تجهيز داخلي — ليس فاتورة مبيعات. تسليم الشركة ليس تأكيداً للتوصيل.', 'Internal preparation — not a sales invoice. Handover to a courier does not confirm delivery.')}
      </Alert>
      {done === 'handover' && <Alert tone="ok">{L('تم التسليم للشركة.', 'Handed over to courier.')}</Alert>}

      <Card title={L('الحالة', 'Status')}>
        <p className="row">
          <StatusBadge status={status} /> <strong>{label}</strong>
        </p>
        <p>{guidance[status]}</p>
        <dl className="kv" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px' }}>
          <dt>{L('الملتقط', 'Picker')}</dt>
          <dd>{job.assignedPickerId ? nameOf.get(job.assignedPickerId) ?? '—' : L('غير مكلّف', 'Unassigned')}</dd>
          <dt>{L('المدقق', 'Checker')}</dt>
          <dd>{job.assignedCheckerId ? nameOf.get(job.assignedCheckerId) ?? '—' : L('غير مكلّف', 'Unassigned')}</dd>
          <dt>{L('طبعات المستند', 'Document prints')}</dt>
          <dd>{job.prepPrintCount}</dd>
        </dl>
      </Card>

      <Card title={L('الطلب والتوصيل', 'Order and delivery')}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px' }}>
          <dt>{L('المستلم', 'Recipient')}</dt>
          <dd>{address.recipientName ?? '—'} {address.recipientPhone ? <span dir="ltr">{address.recipientPhone}</span> : null}</dd>
          <dt>{L('المحافظة / المنطقة', 'Governorate / area')}</dt>
          <dd>{[address.governorate, address.area].filter(Boolean).join(' / ') || '—'}</dd>
          <dt>{L('العنوان', 'Address')}</dt>
          <dd>{address.details ?? '—'}</dd>
          <dt>{L('ملاحظة العميل', 'Customer note')}</dt>
          <dd>{job.order.customerNote ?? '—'}</dd>
        </dl>
      </Card>

      <Card title={L('بنود الطلب', 'Lines')}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">{L('الصنف', 'Item')}</th>
                <th scope="col">{L('الجودة', 'Quality')}</th>
                <th scope="col" className="num">{L('المطلوب', 'Requested')}</th>
                {pickedVisible && <th scope="col" className="num">{L('الملتقط', 'Picked')}</th>}
                {checkedVisible && <th scope="col" className="num">{L('المدقَّق', 'Checked')}</th>}
                <th scope="col" className="num">{L('المقبول', 'Accepted')}</th>
                <th scope="col">{L('السبب', 'Reason')}</th>
              </tr>
            </thead>
            <tbody>
              {job.lines.map((l) => (
                <tr key={l.id}>
                  <td dir="ltr">{l.orderItem.skuSnapshot}</td>
                  <td>{l.orderItem.titleSnapshot}</td>
                  <td>{l.orderItem.qualitySnapshot ?? '—'}</td>
                  <td className="num">{l.requestedQty}</td>
                  {pickedVisible && <td className="num">{l.pickedQty ?? '—'}</td>}
                  {checkedVisible && <td className="num">{l.checkedQty ?? '—'}</td>}
                  <td className="num">{l.resolvedQty ?? '—'}</td>
                  <td>{reasonVisible ? (l.discrepancyReason ?? '—') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!canSeeExpected && (
          <p className="field-help">
            {L('أعداد الالتقاط والتدقيق تظهر حسب دورك في المهمة. المدقق لا يرى عدد الملتقط قبل إرسال عدّه.', 'Picked and checked counts are shown according to your role. The checker never sees the picker count before submitting their own.')}
          </p>
        )}
      </Card>

      {job.packages.length > 0 && (
        <Card title={L('الطرود', 'Parcels')}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('الطرد', 'Parcel')}</th>
                  <th scope="col">{L('الملصق', 'Label')}</th>
                  <th scope="col" className="num">{L('الوزن (غ)', 'Weight (g)')}</th>
                  <th scope="col">{L('رمز التتبع', 'Tracking code')}</th>
                </tr>
              </thead>
              <tbody>
                {job.packages.map((p) => (
                  <tr key={p.id}>
                    <td>{p.packageNo}</td>
                    <td dir="ltr">{p.label}</td>
                    <td className="num">{p.weightGrams ?? '—'}</td>
                    <td dir="ltr">{p.trackingCode ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title={L('الإجراءات المتاحة لك', 'Actions available to you')}>
        {!anyAction && <EmptyState>{L('لا يوجد إجراء متاح لك في هذه الخطوة.', 'No action is available to you at this step.')}</EmptyState>}

        {canAssign && (
          <div className="stack">
            <h3>{L('تكليف الملتقط والمدقق', 'Assign picker and checker')}</h3>
            <p className="field-help">{L('يجب أن يكون الملتقط والمدقق شخصين مختلفين. سيرفض الخادم الاختيار المكرر برسالة واضحة.', 'The picker and checker must be two different people. The server rejects a duplicate choice with a clear message.')}</p>
            {pickerOptions.length === 0 || checkerOptions.length === 0 ? (
              <Alert tone="warn">{L('لا يوجد موظفون نشطون بدور ملتقط ومدقق.', 'There are no active staff with picker and checker roles.')}</Alert>
            ) : (
              <ApiForm
                endpoint={`/api/v1/fulfillment/jobs/${job.id}/assign`}
                submitLabel={L('حفظ التكليف', 'Save assignment')}
                successMessage={L('تم التكليف.', 'Assigned.')}
                fields={[
                  { name: 'pickerId', label: L('الملتقط', 'Picker'), type: 'select', required: true, options: pickerOptions, defaultValue: job.assignedPickerId ?? undefined },
                  { name: 'checkerId', label: L('المدقق (مختلف عن الملتقط)', 'Checker (different from picker)'), type: 'select', required: true, options: checkerOptions, defaultValue: job.assignedCheckerId ?? undefined },
                ]}
              />
            )}
          </div>
        )}

        {canPickStart && (
          <div className="stack">
            <h3>{L('بدء الالتقاط', 'Start picking')}</h3>
            <ActionButton endpoint={`/api/v1/fulfillment/jobs/${job.id}/pick`} body={{ action: 'start' }} label={L('بدء الالتقاط', 'Start picking')} tone="primary" />
          </div>
        )}

        {canPickSubmit && (
          <div className="stack">
            <h3>{L('إدخال الكميات الملتقطة', 'Enter picked quantities')}</h3>
            <FulfillmentLinesForm jobId={job.id} mode="pick" lines={lineInputs(false)} locale={locale} />
          </div>
        )}

        {canCheckStart && (
          <div className="stack">
            <h3>{L('بدء التدقيق', 'Start checking')}</h3>
            <p className="field-help">{L('ستدخل عدّك المستقل دون رؤية أعداد الملتقط.', 'You will enter your own independent count without seeing the picker counts.')}</p>
            <ActionButton endpoint={`/api/v1/fulfillment/jobs/${job.id}/check`} body={{ action: 'start' }} label={L('بدء التدقيق', 'Start checking')} tone="primary" />
          </div>
        )}

        {canCheckSubmit && (
          <div className="stack">
            <h3>{L('العد المستقل', 'Independent count (blind)')}</h3>
            <p className="field-help">{L('أدخل ما تراه فعلياً. لا توجد أعداد سابقة معبّأة مسبقاً.', 'Enter what you physically count. Nothing is pre-filled.')}</p>
            <FulfillmentLinesForm jobId={job.id} mode="check" lines={lineInputs(false)} locale={locale} />
          </div>
        )}

        {canResolve && (
          <div className="stack">
            <h3>{L('حل فرق الكميات (مدير)', 'Resolve discrepancy (manager)')}</h3>
            <p className="field-help">{L('لكل سطر: الكمية المقبولة فعلياً (لا تتجاوز ما تم عدّه) مع سبب. يعود المستند إلى "تم التدقيق" بعد الاعتماد.', 'For each line: the accepted quantity (not above what was counted) and a reason. The job returns to Checked after approval.')}</p>
            <FulfillmentLinesForm jobId={job.id} mode="resolve" lines={lineInputs(true)} locale={locale} />
          </div>
        )}

        {canPackStart && (
          <div className="stack">
            <h3>{L('بدء التعليب', 'Start packing')}</h3>
            <ActionButton endpoint={`/api/v1/fulfillment/jobs/${job.id}/pack`} body={{ action: 'start' }} label={L('بدء التعليب', 'Start packing')} tone="primary" />
          </div>
        )}

        {canAddParcel && (
          <div className="stack">
            <h3>{L('إضافة طرد', 'Add parcel')}</h3>
            <ApiForm
              endpoint={`/api/v1/fulfillment/jobs/${job.id}/pack`}
              extra={{ action: 'add_package' }}
              submitLabel={L('إضافة الطرد', 'Add parcel')}
              successMessage={L('تمت إضافة الطرد.', 'Parcel added.')}
              fields={[
                { name: 'weightGrams', label: L('الوزن بالغرام (اختياري)', 'Weight in grams (optional)'), type: 'number', min: 1, max: 200000, step: 1, help: L('عدد صحيح بالغرام.', 'Whole grams.') },
                { name: 'trackingCode', label: L('رمز التتبع (اختياري)', 'Tracking code (optional)'), type: 'text', dir: 'ltr', help: L('رمز الشحنة إن توفر.', 'Shipment code if available.') },
              ]}
            />
          </div>
        )}

        {canFinishPack && (
          <div className="stack">
            <h3>{L('إنهاء التعليب', 'Finish packing')}</h3>
            <ActionButton endpoint={`/api/v1/fulfillment/jobs/${job.id}/pack`} body={{ action: 'finish' }} label={L('إنهاء التعليب', 'Finish packing')} tone="primary" />
          </div>
        )}
        {status === 'PACKING' && has(PERMISSIONS.FULFILLMENT_PACK) && job.packages.length === 0 && (
          <p className="field-help">{L('أضف طرداً واحداً على الأقل قبل إنهاء التعليب.', 'Add at least one parcel before finishing packing.')}</p>
        )}

        {canHandover && (
          <div className="stack">
            <h3>{L('التسليم للشركة', 'Handover to courier')}</h3>
            <p className="field-help">
              {L(
                'ينشئ هذا الإجراء شحنة الشركة والفاتورة. يُخصم المخزون للكمية المقبولة فقط، ويُحرر الباقي من الحجز. النتيجة "سُلّم للشركة"، لا "تم التوصيل".',
                'This creates the courier shipment and the invoice. Stock is consumed for the accepted quantity only and the rest is released. The result is "Handed over to courier", not "delivered".',
              )}
            </p>
            {couriers.length === 0 ? (
              <Alert tone="warn">{L('لا توجد شركات توصيل نشطة. أضف شركة من الحسابات أولاً.', 'No active couriers. Add one in Accounting first.')}</Alert>
            ) : (
              <ApiForm
                endpoint={`/api/v1/fulfillment/jobs/${job.id}/handover`}
                submitLabel={L('سُلّم للشركة', 'Handed over to courier')}
                successHref={`/fulfillment/jobs/${job.id}?done=handover`}
                fields={[
                  { name: 'courierId', label: L('شركة التوصيل', 'Courier'), type: 'select', required: true, options: couriers.map((c) => ({ value: c.id, label: c.name })) },
                  { name: 'trackingNote', label: L('ملاحظة التتبع (اختياري)', 'Tracking note (optional)'), type: 'text', help: L('مثال: رقم بوليصة الشركة.', 'e.g. courier waybill number.') },
                ]}
              />
            )}
          </div>
        )}
      </Card>

      <Card title={L('سجل الأحداث', 'Event timeline')}>
        {job.events.length === 0 ? (
          <EmptyState>{L('لا توجد أحداث.', 'No events yet.')}</EmptyState>
        ) : (
          <ol style={{ paddingInlineStart: 18 }}>
            {job.events.map((e, i) => (
              <li key={`${e.occurredAt.toISOString()}-${i}`}>
                <span className="muted" dir="ltr">{fmtDateTime(e.occurredAt, locale)}</span> — {EVENT_LABEL[e.eventType] ? (locale === 'ar' ? EVENT_LABEL[e.eventType].ar : EVENT_LABEL[e.eventType].en) : e.eventType}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
