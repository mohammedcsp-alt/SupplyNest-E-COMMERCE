import Link from 'next/link';
import { Badge, Card, EmptyState, ForbiddenNotice, LoginRequired, Money, PageHeader } from '@/components/ui';
import { SETTLEMENT_LABEL, fmtDateTime, pick } from '@/components/ops';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { listShipments } from '@/modules/accounting/views';
import { AccountingNav } from '../AccountingNav';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const sp = await searchParams;
  const next = '/accounting/shipments';

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next={next} />;
  const user = await userWithPermission(PERMISSIONS.FINANCE_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;

  const courierId = sp.courierId && /^[0-9a-f-]{36}$/i.test(sp.courierId) ? sp.courierId : undefined;
  const [rows, couriers] = await Promise.all([listShipments({ courierId }), db.courier.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })]);

  return (
    <section className="stack">
      <PageHeader
        title={L('الشحنات', 'Shipments')}
        subtitle={L('كل شحنة سُلّمت للشركة. التحصيل يُؤكَّد يدوياً من كشف الشركة.', 'Every shipment handed to a courier. Collection is confirmed manually from the courier statement.')}
      />
      <AccountingNav locale={locale} current="/accounting/shipments" />

      <Card>
        <form method="get" className="form-row">
          <div className="field">
            <label htmlFor="courierId">{L('الشركة', 'Courier')}</label>
            <select id="courierId" name="courierId" defaultValue={courierId ?? ''}>
              <option value="">{L('كل الشركات', 'All couriers')}</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button type="submit" className="btn btn-primary">
              {L('تصفية', 'Filter')}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState>{L('لا توجد شحنات.', 'No shipments.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('الطلب', 'Order')}</th>
                  <th scope="col">{L('الشركة', 'Courier')}</th>
                  <th scope="col">{L('الطريقة', 'Method')}</th>
                  <th scope="col">{L('سُلّم', 'Handed over')}</th>
                  <th scope="col">{L('التحصيل', 'Collection')}</th>
                  <th scope="col" className="num">{L('COD المتوقع', 'Expected COD')}</th>
                  <th scope="col" className="num">{L('COD المحصّل', 'Collected COD')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ shipment: s, f }) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/accounting/shipments/${s.id}`} dir="ltr">
                        {s.order.orderNumber}
                      </Link>
                    </td>
                    <td>{s.courier.name}</td>
                    <td>{pick(SETTLEMENT_LABEL[s.settlementModeSnapshot], locale).split(' — ')[0]}</td>
                    <td>{fmtDateTime(s.handedOverAt, locale)}</td>
                    <td>
                      {f.codCollected === null ? <Badge tone="warn">{L('بانتظار التأكيد', 'Awaiting confirmation')}</Badge> : <Badge tone="ok">{L('مؤكد', 'Confirmed')}</Badge>}
                    </td>
                    <td className="num">
                      <Money value={f.codExpected} locale={locale} />
                    </td>
                    <td className="num">
                      <Money value={f.codCollected} locale={locale} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
