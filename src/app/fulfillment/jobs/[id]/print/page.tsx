import { notFound } from 'next/navigation';
import { ForbiddenNotice, LoginRequired } from '@/components/ui';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { AppError } from '@/lib/errors';
import { getJobForActor } from '@/modules/fulfillment/service';
import { fmtDateTime } from '@/components/ops';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Address = { recipientName?: string; recipientPhone?: string; governorate?: string; area?: string | null; details?: string };

/**
 * Internal preparation document. It is NOT a sales invoice and shows no prices, totals or money values.
 * Printing counts the print on the server before the dialog opens.
 */
export default async function PrepDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const { id } = await params;
  const next = `/fulfillment/jobs/${id}/print`;

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next={next} />;
  const user = await userWithPermission(PERMISSIONS.FULFILLMENT_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;
  if (!UUID.test(id)) notFound();

  let job;
  try {
    ({ job } = await getJobForActor(user, id));
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }
  const address = (job.order.addressSnapshot ?? {}) as Address;

  return (
    <section className="prep-doc" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <style>{`
        .prep-doc { background: #fff; color: #000; padding: 16px; }
        .prep-doc table { font-size: 0.95rem; }
        .prep-doc td, .prep-doc th { border: 1px solid #333; }
        .prep-doc .counted { width: 120px; height: 28px; }
        @media print {
          .site-header, .site-footer, .dev-banner, .skip-link, .no-print { display: none !important; }
          .main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
          .prep-doc { padding: 0; }
          body { background: #fff; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="no-print" style={{ marginBlockEnd: 12 }}>
        <PrintButton jobId={job.id} locale={locale} />
      </div>

      <header style={{ borderBlockEnd: '2px solid #000', paddingBlockEnd: 8, marginBlockEnd: 12 }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{L('مستند تجهيز داخلي — ليس فاتورة مبيعات', 'Internal preparation document — not a sales invoice')}</h1>
        <p style={{ margin: '4px 0 0' }}>
          {L('للاستخدام الداخلي فقط. لا يحمل أسعاراً أو مبالغ.', 'For internal use only. Contains no prices or amounts.')}
        </p>
      </header>

      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', margin: '0 0 12px' }}>
        <dt>{L('رقم مستند التجهيز', 'Prep document no.')}</dt>
        <dd dir="ltr" style={{ margin: 0 }}>{job.prepDocumentNo}</dd>
        <dt>{L('رقم الطلب', 'Order number')}</dt>
        <dd dir="ltr" style={{ margin: 0 }}>{job.order.orderNumber}</dd>
        <dt>{L('تاريخ الطباعة', 'Printed at')}</dt>
        <dd style={{ margin: 0 }}>{fmtDateTime(new Date(), locale)}</dd>
        <dt>{L('المستلم', 'Recipient')}</dt>
        <dd style={{ margin: 0 }}>
          {address.recipientName ?? '—'} {address.recipientPhone ? <span dir="ltr">{address.recipientPhone}</span> : null}
        </dd>
        <dt>{L('العنوان', 'Address')}</dt>
        <dd style={{ margin: 0 }}>
          {[address.governorate, address.area, address.details].filter(Boolean).join(' — ') || '—'}
        </dd>
        {job.order.customerNote && (
          <>
            <dt>{L('ملاحظة', 'Note')}</dt>
            <dd style={{ margin: 0 }}>{job.order.customerNote}</dd>
          </>
        )}
      </dl>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'start', padding: 6 }}>#</th>
            <th scope="col" style={{ textAlign: 'start', padding: 6 }}>SKU</th>
            <th scope="col" style={{ textAlign: 'start', padding: 6 }}>{L('الصنف', 'Item')}</th>
            <th scope="col" style={{ textAlign: 'start', padding: 6 }}>{L('الجودة', 'Quality')}</th>
            <th scope="col" style={{ textAlign: 'end', padding: 6 }}>{L('الكمية المطلوبة', 'Requested qty')}</th>
            <th scope="col" style={{ textAlign: 'end', padding: 6 }}>{L('العدد الفعلي', 'Counted')}</th>
          </tr>
        </thead>
        <tbody>
          {job.lines.map((l, i) => (
            <tr key={l.id}>
              <td style={{ padding: 6 }}>{i + 1}</td>
              <td dir="ltr" style={{ padding: 6 }}>{l.orderItem.skuSnapshot}</td>
              <td style={{ padding: 6 }}>{l.orderItem.titleSnapshot}</td>
              <td style={{ padding: 6 }}>{l.orderItem.qualitySnapshot ?? '—'}</td>
              <td style={{ padding: 6, textAlign: 'end' }}>{l.requestedQty}</td>
              <td style={{ padding: 6 }}>
                <span className="counted" style={{ display: 'inline-block', border: '1px solid #000' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBlockStart: 32 }}>
        <p>{L('الملتقط: ________________________', 'Picker: ________________________')}</p>
        <p>{L('المدقق: ________________________', 'Checker: ________________________')}</p>
      </div>
    </section>
  );
}
