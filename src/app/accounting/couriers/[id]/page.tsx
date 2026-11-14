import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, Card, EmptyState, ForbiddenNotice, LoginRequired, Money, PageHeader } from '@/components/ui';
import { SETTLEMENT_LABEL, fmtDateTime } from '@/components/ops';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { courierStatement } from '@/modules/accounting/service';
import { rangeDate } from '@/modules/accounting/views';
import { AccountingNav } from '../../AccountingNav';
import { FeePaymentForm } from './FeePaymentForm';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SP = Record<string, string | undefined>;

export default async function CourierStatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const { id } = await params;
  const sp = await searchParams;
  const next = `/accounting/couriers/${id}`;

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next={next} />;
  const user = await userWithPermission(PERMISSIONS.FINANCE_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;
  if (!UUID.test(id)) notFound();

  // Date-only filters are Asia/Baghdad calendar days.
  const from = rangeDate(sp.from, 'start');
  const to = rangeDate(sp.to, 'end');

  let st;
  try {
    st = await courierStatement(id, { from, to });
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }
  const courier = await db.courier.findUnique({ where: { id }, include: { agreements: { orderBy: { effectiveFrom: 'desc' }, take: 10 } } });
  if (!courier) notFound();
  const payments = await db.courierFeePayment.findMany({ where: { courierId: id }, orderBy: { paidAt: 'desc' }, take: 100 });

  const isGross = courier.agreements.some((a) => a.settlementMode === 'GROSS_REMITTANCE' && a.active) || st.shipments.some((s) => s.settlementMode === 'GROSS_REMITTANCE');
  const canPay = user.permissions.has(PERMISSIONS.FINANCE_FEE_PAYMENT_RECORD);
  const t = st.totals;

  type TotalRow = { label: string; value: string | null; note?: string };
  const totalGroups: Array<{ title: string; tone: 'info' | 'warn' | 'ok'; rows: TotalRow[] }> = [
    {
      title: L('COD', 'COD'),
      tone: 'info',
      rows: [
        { label: L('COD المتوقع', 'Expected COD'), value: t.codExpected, note: L('مجموع البضاعة المقبولة + رسوم توصيل العميل ± التعديلات المتوقعة', 'Accepted goods + customer delivery fee ± expected-side adjustments') },
        { label: L('COD المحصّل (المؤكد من الشركة)', 'Collected COD (confirmed by courier)'), value: t.codCollected, note: L('لا يُستنتج من المتوقع', 'Never inferred from expected COD') },
        { label: L('رسوم توصيل العميل (منفصلة)', 'Customer delivery fees (separate)'), value: t.customerDeliveryFees, note: L('يدفعها العميل، ولا تُجمع مع أجر الشركة', 'Paid by the customer; never added to the courier fee') },
      ],
    },
    {
      title: L('أجور الشركة والمستحق', 'Courier fees and amount due'),
      tone: 'warn',
      rows: [
        { label: L('أجور الشركة المخصومة من COD (صافي)', 'Courier fees deducted from COD (NET)'), value: t.courierFeesDeductedFromCod },
        { label: L('المستحق من الشركة', 'Courier due'), value: t.courierDue, note: L('صافي: المحصّل − الأجر المخصوم · إجمالي: المحصّل', 'NET: collected − deducted fee · GROSS: collected') },
        { label: L('أجور تُدفع منفصلاً (إجمالي)', 'Courier fees payable separately (GROSS)'), value: t.courierFeesPayableSeparately },
        { label: L('دفعات الأجور المسجلة', 'Fee payments recorded'), value: t.courierFeePayments },
        { label: L('أجور متبقية', 'Fees outstanding'), value: t.courierFeesOutstanding },
      ],
    },
    {
      title: L('الرصيد والمركز', 'Balance and position'),
      tone: 'ok',
      rows: [
        { label: L('التحويلات المستلمة والمخصصة', 'Transfers received (allocated)'), value: t.transfersReceived },
        { label: L('المتبقي على الشركة', 'Merchant outstanding'), value: t.merchantOutstanding, note: L('المستحق − التحويلات المخصصة', 'Courier due − allocated transfers') },
        { label: L('المركز الصافي', 'Net position'), value: t.netPosition, note: L('المتبقي على الشركة − الأجور المتبقية (مجموع التزامين منفصلين)', 'Merchant outstanding − fees outstanding (sum of two separate obligations)') },
      ],
    },
  ];

  return (
    <section className="stack">
      <PageHeader
        title={`${L('كشف الحساب', 'Statement')} — ${courier.name}`}
        subtitle={L('قيم منفصلة فقط. لا توجد أرقام مجمّعة تدمج التزامات مختلفة.', 'Separate values only. No combined figures that merge different obligations.')}
        actions={
          <Link className="btn" href="/accounting/couriers">
            {L('كل الشركات', 'All couriers')}
          </Link>
        }
      />
      <AccountingNav locale={locale} current="/accounting/couriers" />

      <Card title={L('الفترة', 'Period')}>
        <form method="get" className="form-row">
          <div className="field">
            <label htmlFor="from">{L('من', 'From')}</label>
            <input id="from" name="from" type="date" defaultValue={sp.from ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="to">{L('إلى', 'To')}</label>
            <input id="to" name="to" type="date" defaultValue={sp.to ?? ''} />
            <div className="field-help">{L('التاريخ حسب توقيت بغداد، شاملاً اليوم.', 'Baghdad calendar days, inclusive.')}</div>
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button type="submit" className="btn btn-primary">
              {L('عرض', 'Show')}
            </button>
          </div>
        </form>
      </Card>

      <Card title={L('الإجماليات', 'Totals')}>
        <div className="stack">
          {totalGroups.map((g) => (
            <section key={g.title} className="stack">
              <h3 className="fa-group-title">{g.title}</h3>
              <dl className="fa-group">
                {g.rows.map((r) => (
                  <div key={r.label} className={`fa-metric is-${g.tone}`}>
                    <dt className="kpi-label">{r.label}</dt>
                    <dd className="kpi" style={{ margin: 0 }}>
                      {r.value === null ? <span className="muted">{L('لم يُؤكَّد بعد', 'Not confirmed yet')}</span> : <Money value={r.value} locale={locale} />}
                    </dd>
                    {r.note && <div className="fa-metric-hint">{r.note}</div>}
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="field-help">{L(`عدد الشحنات: ${st.shipments.length}`, `Shipments: ${st.shipments.length}`)}</p>
      </Card>

      <Card title={L('الشحنات', 'Shipments')}>
        {st.shipments.length === 0 ? (
          <EmptyState>{L('لا توجد شحنات في هذه الفترة.', 'No shipments in this period.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('الطلب', 'Order')}</th>
                  <th scope="col">{L('سُلّم', 'Handed over')}</th>
                  <th scope="col">{L('الطريقة', 'Method')}</th>
                  <th scope="col" className="num">{L('قيمة البضاعة', 'Order value')}</th>
                  <th scope="col" className="num">{L('رسوم العميل', 'Customer fee')}</th>
                  <th scope="col" className="num">{L('COD المتوقع', 'Expected COD')}</th>
                  <th scope="col" className="num">{L('COD المحصّل', 'Collected COD')}</th>
                  <th scope="col" className="num">{L('أجر الشركة', 'Courier fee')}</th>
                  <th scope="col" className="num">{L('أجر مخصوم (صافي)', 'Fee deducted (NET)')}</th>
                  <th scope="col" className="num">{L('المستحق', 'Courier due')}</th>
                  <th scope="col" className="num">{L('التحويلات', 'Transfers')}</th>
                  <th scope="col" className="num">{L('المتبقي', 'Outstanding')}</th>
                  <th scope="col" className="num">{L('أجر يُدفع منفصلاً (إجمالي)', 'Fee payable separately (GROSS)')}</th>
                </tr>
              </thead>
              <tbody>
                {st.shipments.map((s) => (
                  <tr key={s.shipmentId}>
                    <td>
                      <Link href={`/accounting/shipments/${s.shipmentId}`} dir="ltr">{s.orderNumber}</Link>
                    </td>
                    <td>{fmtDateTime(s.handedOverAt, locale)}</td>
                    <td>{pickMode(s.settlementMode, locale)}</td>
                    <td className="num"><Money value={s.orderValue} locale={locale} /></td>
                    <td className="num"><Money value={s.customerDeliveryFee} locale={locale} /></td>
                    <td className="num"><Money value={s.codExpected} locale={locale} /></td>
                    <td className="num"><Money value={s.codCollected} locale={locale} /></td>
                    <td className="num"><Money value={s.courierFeeSnapshot} locale={locale} /></td>
                    <td className="num"><Money value={s.courierFeeDeducted} locale={locale} /></td>
                    <td className="num"><Money value={s.courierDue} locale={locale} /></td>
                    <td className="num"><Money value={s.transfersReceived} locale={locale} /></td>
                    <td className="num"><Money value={s.merchantOutstanding} locale={locale} /></td>
                    <td className="num">{s.settlementMode === 'GROSS_REMITTANCE' ? <Money value={s.courierFeePayableSeparately} locale={locale} /> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isGross ? (
        <div className="card-grid">
          <Card title={L('تسجيل دفعة أجور الشركة', 'Record courier fee payment')}>
            <Alert tone="warn" role="status">
              {L('هذه الشركة لديها شحنات إجمالية (GROSS). أجرها يُدفع منفصلاً وليس من COD.', 'This courier has GROSS shipments. Its fee is paid separately, not from COD.')}
            </Alert>
            {canPay ? (
              <FeePaymentForm courierId={id} locale={locale} />
            ) : (
              <p className="muted">{L('لا تملك صلاحية تسجيل الدفعات.', 'You cannot record fee payments.')}</p>
            )}
          </Card>
          <Card title={L('الدفعات المسجلة', 'Recorded fee payments')}>
            {payments.length === 0 ? (
              <EmptyState>{L('لا توجد دفعات.', 'No payments yet.')}</EmptyState>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{L('تاريخ الدفع', 'Paid at')}</th>
                      <th scope="col">{L('المرجع', 'Reference')}</th>
                      <th scope="col" className="num">{L('المبلغ', 'Amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDateTime(p.paidAt, locale)}</td>
                        <td dir="ltr">{p.reference}</td>
                        <td className="num"><Money value={p.amount.toFixed(0)} locale={locale} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="field-help">{L('الدفعات المسجلة لا تُعدّل. الخطأ يُصحَّح بإدخال جديد.', 'Recorded payments are never edited. Correct mistakes with a new entry.')}</p>
          </Card>
        </div>
      ) : (
        <Alert tone="ok" role="status">
          {L('هذه الشركة تعمل بطريقة صافية فقط؛ لا توجد دفعات أجور منفصلة.', 'This courier works on NET settlement only; there are no separate fee payments.')}
        </Alert>
      )}

      <Card title={L('الاتفاقيات', 'Agreements')}>
        <ul className="fa-timeline">
          {courier.agreements.map((a) => (
            <li key={a.id}>
              {pickMode(a.settlementMode, locale)} · <Money value={a.serviceFee.toFixed(0)} locale={locale} /> · {fmtDateTime(a.effectiveFrom, locale)}
              {a.effectiveTo ? ` → ${fmtDateTime(a.effectiveTo, locale)}` : ''} {!a.active && <Badge tone="danger">{L('غير نشطة', 'Inactive')}</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function pickMode(mode: string, locale: 'ar' | 'en'): string {
  const b = SETTLEMENT_LABEL[mode];
  if (!b) return mode;
  return (locale === 'ar' ? b.ar : b.en).split(' — ')[0];
}
