import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/forms';
import { Alert, Badge, Card, EmptyState, ForbiddenNotice, LoginRequired, Money, PageHeader } from '@/components/ui';
import { ADJUSTMENT_LABEL, SETTLEMENT_LABEL, fmtDateTime, pick } from '@/components/ops';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { shipmentDetail } from '@/modules/accounting/views';
import { AccountingNav } from '../../AccountingNav';
import { AdjustmentForm } from './AdjustmentForm';
import { CollectionForm } from './CollectionForm';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const { id } = await params;
  const next = `/accounting/shipments/${id}`;

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next={next} />;
  const user = await userWithPermission(PERMISSIONS.FINANCE_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;
  if (!UUID.test(id)) notFound();

  const detail = await shipmentDetail(id);
  if (!detail) notFound();
  const { shipment: s, f } = detail;

  const can = (p: string) => user.permissions.has(p);
  const isNet = s.settlementModeSnapshot === 'NET_DEDUCTION';
  const reversedIds = new Set(s.adjustments.map((a) => a.reversesId).filter((x): x is string => !!x));
  const collectionOpen = f.codCollected === null && s.deliveryStatus !== 'RETURNED';

  const rows: Array<{ label: string; value: string | null; note?: string }> = [
    { label: L('قيمة البضاعة المقبولة', 'Order value (accepted goods)'), value: f.orderValue, note: L('عند التسليم للشركة، قبل التعديلات', 'At handover, before adjustments') },
    { label: L('رسوم توصيل العميل', 'Customer delivery fee'), value: f.customerDeliveryFee, note: L('يدفعها العميل، منفصلة عن أجر الشركة', 'Paid by the customer, separate from the courier fee') },
    { label: L('COD المتوقع', 'Expected COD'), value: f.codExpected, note: L('البضاعة + رسوم العميل ± تعديلات COD المتوقع', 'Goods + customer fee ± expected-side adjustments') },
    { label: L('COD المحصّل (مؤكد من الشركة)', 'Collected COD (courier-confirmed)'), value: f.codCollected, note: L('غير معروف حتى يُسجَّل التحصيل', 'Unknown until collection is recorded') },
    { label: L('الفرق (محصّل − متوقع)', 'COD variance (collected − expected)'), value: f.codVariance },
    { label: L('أجر الشركة (لقطة)', 'Courier fee (snapshot)'), value: f.courierFeeSnapshot, note: L('من الاتفاقية السارية عند التسليم', 'From the agreement in force at handover') },
    isNet
      ? { label: L('أجر الشركة المخصوم من COD (صافي)', 'Courier fee deducted from COD (NET)'), value: f.courierFeeDeducted }
      : { label: L('أجر يُدفع منفصلاً (إجمالي)', 'Courier fee payable separately (GROSS)'), value: f.courierFeePayableSeparately },
    { label: L('المستحق من الشركة', 'Courier due'), value: f.courierDue, note: L('لا يُحسب قبل تأكيد التحصيل', 'Not computed until collection is confirmed') },
    { label: L('التحويلات المخصصة', 'Transfers allocated'), value: f.transfersReceived },
    { label: L('المتبقي على الشركة', 'Merchant outstanding'), value: f.merchantOutstanding },
    { label: L('تعديلات COD المتوقع', 'Expected-side adjustments'), value: f.expectedSideAdjustments },
    { label: L('تعديلات المستحق', 'Due-side adjustments'), value: f.dueSideAdjustments },
  ];

  return (
    <section className="stack">
      <PageHeader
        title={`${L('الشحنة', 'Shipment')} ${s.order.orderNumber}`}
        subtitle={`${s.courier.name} · ${pick(SETTLEMENT_LABEL[s.settlementModeSnapshot], locale)}`}
        actions={
          <Link className="btn" href="/accounting/shipments">
            {L('كل الشحنات', 'All shipments')}
          </Link>
        }
      />
      <AccountingNav locale={locale} current="/accounting/shipments" />

      <Alert tone="warn" role="status">
        {L(
          'COD المتوقع يتغير فقط بالتعديلات. التحصيل يُسجَّل مرة واحدة فقط. أي تصحيح يكون سجلاً جديداً وليس تعديلاً للسجل الأصلي.',
          'Expected COD changes only through adjustments. Collected COD can be set once. Any correction is a new record, never an edit of the original.',
        )}
      </Alert>

      <Card title={L('الحالة والتواريخ', 'Status and dates')}>
        <p className="row">
          <Badge>{s.deliveryStatus.replace(/_/g, ' ')}</Badge>
          <span className="muted">{L('سُلّم للشركة في', 'Handed over to courier at')} {fmtDateTime(s.handedOverAt, locale)}</span>
          {s.codCollectedAt && <span className="muted">· {L('تأكيد التحصيل', 'Collection confirmed')} {fmtDateTime(s.codCollectedAt, locale)}</span>}
        </p>
        {s.trackingNote && <p>{L('ملاحظة التتبع:', 'Tracking note:')} <span dir="ltr">{s.trackingNote}</span></p>}
        <p className="field-help">
          {L('"سُلّم للشركة" ليس تأكيداً للتوصيل للعميل. حالة التوصيل تُحدَّث فقط من بيانات الشركة المسجلة.', '"Handed over to courier" does not confirm delivery to the customer.')}
        </p>
      </Card>

      <Card title={L('القيم المالية (منفصلة)', 'Financial values (separate)')}>
        <dl className="form-row" style={{ alignItems: 'start' }}>
          {rows.map((r) => (
            <div key={r.label} className="kpi" style={{ minWidth: 220 }}>
              <dt className="kpi-label">{r.label}</dt>
              <dd style={{ margin: 0 }}>{r.value === null ? <span className="muted">{L('غير متاح بعد', 'Not yet')}</span> : <Money value={r.value} locale={locale} />}</dd>
              {r.note && <div className="field-help">{r.note}</div>}
            </div>
          ))}
        </dl>
      </Card>

      <div className="card-grid">
        <Card title={L('تأكيد التحصيل', 'Confirm collection')}>
          {!collectionOpen ? (
            <p className="muted">
              {f.codCollected !== null
                ? L('تم تأكيد التحصيل. لا يُعدَّل. للتصحيح استخدم تعديل "تصحيح من الشركة" بعد تسجيل السبب.', 'Collection is confirmed and cannot be changed. For a correction, use a "Courier correction" adjustment with a reason.')
                : L('الشحنة مرتجعة، لا يوجد تحصيل.', 'The shipment was returned; there is no collection.')}
            </p>
          ) : can(PERMISSIONS.FINANCE_REMITTANCE_RECORD) ? (
            <CollectionForm shipmentId={s.id} locale={locale} />
          ) : (
            <p className="muted">{L('لا تملك صلاحية تسجيل التحصيل.', 'You cannot record collections.')}</p>
          )}
        </Card>

        <Card title={L('تسجيل تعديل', 'Record adjustment')}>
          {can(PERMISSIONS.FINANCE_ADJUSTMENT_APPROVE) ? (
            <AdjustmentForm shipmentId={s.id} locale={locale} />
          ) : (
            <p className="muted">{L('لا تملك صلاحية التعديلات المالية.', 'You cannot record adjustments.')}</p>
          )}
        </Card>
      </div>

      <Card title={L('التعديلات المسجلة', 'Recorded adjustments')}>
        {s.adjustments.length === 0 ? (
          <EmptyState>{L('لا توجد تعديلات.', 'No adjustments.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('التاريخ', 'Date')}</th>
                  <th scope="col">{L('النوع', 'Type')}</th>
                  <th scope="col" className="num">{L('المبلغ', 'Amount')}</th>
                  <th scope="col">{L('السبب', 'Reason')}</th>
                  <th scope="col">{L('الحالة', 'State')}</th>
                  <th scope="col">{L('إجراء', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {s.adjustments.map((a) => {
                  const isReversal = !!a.reversesId;
                  const reversed = reversedIds.has(a.id);
                  return (
                    <tr key={a.id}>
                      <td>{fmtDateTime(a.createdAt, locale)}</td>
                      <td>{pick(ADJUSTMENT_LABEL[a.type], locale)}</td>
                      <td className="num"><Money value={a.signedAmount.toFixed(0)} locale={locale} /></td>
                      <td>{a.reason}</td>
                      <td>
                        {isReversal ? <Badge>{L('قيد عكسي', 'Reversal entry')}</Badge> : reversed ? <Badge tone="warn">{L('تم عكسه', 'Reversed')}</Badge> : <Badge tone="ok">{L('مسجّل', 'Posted')}</Badge>}
                      </td>
                      <td>
                        {!isReversal && !reversed && can(PERMISSIONS.FINANCE_ADJUSTMENT_APPROVE) ? (
                          <ActionButton
                            endpoint={`/api/v1/accounting/adjustments/${a.id}/reverse`}
                            label={L('عكس بقيد جديد', 'Reverse with new entry')}
                            reasonLabel={L('سبب العكس (3 أحرف على الأقل)', 'Reason for reversal (at least 3 characters)')}
                            confirmText={L('سيُضاف قيد عكسي جديد. السجل الأصلي لا يتغير.', 'A new reversing entry will be added. The original stays unchanged.')}
                            tone="danger"
                            idempotent
                          />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-help">{L('لا يوجد زر تعديل للقيود المرحّلة. التصحيح يكون بعكس القيد ثم تسجيل قيد جديد.', 'Posted entries have no edit button. Correct by reversing and recording a new entry.')}</p>
      </Card>

      <Card title={L('التحويلات المخصصة لهذه الشحنة', 'Transfers allocated to this shipment')}>
        {s.allocations.length === 0 ? (
          <EmptyState>{L('لم يُخصَّص أي تحويل لهذه الشحنة.', 'No transfer allocated to this shipment.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('التحويل', 'Transfer')}</th>
                  <th scope="col">{L('تاريخ الاستلام', 'Received')}</th>
                  <th scope="col" className="num">{L('المخصص', 'Allocated')}</th>
                  <th scope="col">{L('إجراء', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {s.allocations.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href="/accounting/remittances" dir="ltr">{a.remittance.reference}</Link>
                    </td>
                    <td>{fmtDateTime(a.remittance.receivedAt, locale)}</td>
                    <td className="num"><Money value={a.allocatedAmount.toFixed(0)} locale={locale} /></td>
                    <td>
                      {can(PERMISSIONS.FINANCE_ALLOCATE) ? (
                        <ActionButton
                          endpoint={`/api/v1/accounting/allocations/${a.id}/void`}
                          label={L('إلغاء التخصيص', 'Void allocation')}
                          reasonLabel={L('سبب الإلغاء (3 أحرف على الأقل)', 'Reason for voiding (at least 3 characters)')}
                          confirmText={L('سيُلغى هذا التخصيص فقط. التحويل نفسه لا يتغير.', 'Only this allocation is removed. The transfer itself is unchanged.')}
                          tone="danger"
                          idempotent
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={L('سجل التحصيل', 'Collection log')}>
        {s.financialEvents.length === 0 ? (
          <EmptyState>{L('لا توجد أحداث تحصيل.', 'No collection events.')}</EmptyState>
        ) : (
          <ul style={{ paddingInlineStart: 18 }}>
            {s.financialEvents.map((e) => (
              <li key={e.id}>
                {fmtDateTime(e.occurredAt, locale)} — {e.eventType.replace(/_/g, ' ')} <Money value={e.amount.toFixed(0)} locale={locale} /> <span dir="ltr">{e.reference ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
