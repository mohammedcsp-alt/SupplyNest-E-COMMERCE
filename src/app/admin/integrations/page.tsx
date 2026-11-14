import '../css/system.css';
import { Badge, Alert } from '@/components/ui';
import { PERMISSIONS } from '@/lib/rbac';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { gatePage } from '../_lib/gate';

export const dynamic = 'force-dynamic';

/** Mock WMS contracts (spec section 10). Documentation only: no network calls are made from this page. */
const CONTRACTS: Array<{ name: string; direction: string; purpose: { ar: string; en: string } }> = [
  { name: 'ProductUpsert', direction: 'Store → WMS', purpose: { ar: 'إرسال بيانات المنتج والـ SKU', en: 'Send product and SKU master data' } },
  { name: 'StockAvailabilityChanged', direction: 'WMS → Store', purpose: { ar: 'تغيّر توفر المخزون', en: 'Stock availability changed' } },
  { name: 'StoreOrderSubmitted', direction: 'Store → WMS', purpose: { ar: 'إرسال طلب جديد', en: 'New order submitted' } },
  { name: 'OrderAccepted / OrderRejected', direction: 'WMS → Store', purpose: { ar: 'قبول الطلب أو رفضه من المستودع', en: 'Warehouse accepts or rejects the order' } },
  { name: 'FulfillmentStatusChanged', direction: 'WMS → Store', purpose: { ar: 'تغيّر حالة التجهيز', en: 'Fulfillment status changed' } },
  { name: 'DeliveryOutcomeChanged', direction: 'Courier → Store', purpose: { ar: 'نتيجة التسليم (تسلّم / رفض / إرجاع)', en: 'Delivery outcome (delivered / rejected / returned)' } },
  { name: 'CODSettlementStatus', direction: 'Finance → Store', purpose: { ar: 'حالة تسوية الدفع عند الاستلام', en: 'COD settlement status' } },
];

export default async function AdminIntegrations() {
  const g = await gatePage(PERMISSIONS.INTEGRATION_VIEW, '/admin/integrations');
  if (!g.ok) return g.node;
  const { L } = g;
  const outboxCount = await db.integrationOutbox.count();
  const enabled = config.FEATURE_FLAG_WMS_INTEGRATION;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{L('التكاملات (WMS)', 'Integrations (WMS)')}</h1>
          <p className="muted">{L('توثيق فقط. لا يوجد اتصال شبكي من هذه الصفحة.', 'Documentation only. This page makes no network calls.')}</p>
        </div>
      </div>

      <Alert tone={enabled ? 'warn' : 'ok'}>
        {L(
          `تكامل WMS: ${enabled ? 'مفعّل في الإعدادات (غير مدعوم في V1)' : 'معطّل (FEATURE_FLAG_WMS_INTEGRATION=false)'}.`,
          `WMS integration: ${enabled ? 'enabled in configuration (not supported in V1)' : 'DISABLED (FEATURE_FLAG_WMS_INTEGRATION=false)'}.`,
        )}
      </Alert>

      <div className="adm-kpis">
        <div className={outboxCount > 0 ? 'adm-kpi is-warn' : 'adm-kpi'}>
          <strong>{outboxCount}</strong>
          <span>{L('رسائل في صندوق التكامل الصادر', 'Rows in integration outbox')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{CONTRACTS.length}</strong>
          <span>{L('العقود التجريبية', 'Mock contracts')}</span>
        </div>
      </div>

      <section className="adm-section">
        <header>
          <h2>{L('صندوق التكامل الصادر', 'Integration outbox')}</h2>
        </header>
        <p>
          {L('عدد الرسائل في integration_outbox:', 'Rows in integration_outbox:')} <strong>{outboxCount}</strong>
        </p>
        <p className="adm-note" style={{ margin: 0 }}>
          {L('يجب أن يكون الرقم صفراً طالما التكامل معطّل.', 'This should be zero while the integration is disabled.')}
        </p>
      </section>

      <section className="adm-section">
        <header>
          <h2>{L('العقود التجريبية (المواصفات القسم 10)', 'Mock contracts (spec section 10)')}</h2>
        </header>
        <div className="table-wrap adm-table">
          <table>
            <thead>
              <tr>
                <th>{L('العقد', 'Contract')}</th>
                <th>{L('الاتجاه', 'Direction')}</th>
                <th>{L('الغرض', 'Purpose')}</th>
                <th>{L('الحالة', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map((c) => (
                <tr key={c.name}>
                  <td className="adm-code-cell">{c.name}</td>
                  <td>{c.direction}</td>
                  <td>{L(c.purpose.ar, c.purpose.en)}</td>
                  <td>
                    <Badge>{L('معطّل', 'Disabled')}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
