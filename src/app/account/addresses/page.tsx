import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { AccountShell } from '@/components/customer/AccountShell';
import { requireSignedIn } from '@/lib/page-guards';
import { db } from '@/lib/db';
import { Alert, Card, EmptyState, PageHeader } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { AddressCard, type AddressView, type GeoOption } from '@/components/customer/AddressCard';
import { addressFormFields } from '@/components/customer/address-fields';

export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/account/addresses');
  const title = L('عناويني', 'My addresses');

  if (user.userType !== 'CUSTOMER') {
    return (
      <section className="stack">
        <PageHeader title={title} />
        <Alert tone="error">{L('هذه الصفحة مخصصة لحسابات العملاء.', 'This page is for customer accounts only.')}</Alert>
      </section>
    );
  }

  // Only active governorates and areas are offered (the API enforces the same rule).
  const [rows, governorates, areas] = await Promise.all([
    db.address.findMany({
      where: { customerId: user.id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { governorate: true, area: true },
    }),
    db.governorate.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }] }),
    db.deliveryArea.findMany({ where: { active: true, governorate: { active: true } }, include: { governorate: true }, orderBy: { nameEn: 'asc' } }),
  ]);

  const govOptions: GeoOption[] = governorates.map((g) => ({ id: g.id, nameAr: g.nameAr, nameEn: g.nameEn }));
  const areaOptions: GeoOption[] = areas.map((a) => ({ id: a.id, nameAr: a.nameAr, nameEn: a.nameEn, governorateId: a.governorateId }));

  return (
    <AccountShell locale={locale} current="addresses" isCustomer={user.userType === 'CUSTOMER'}>
      <p>
        <Link href="/account">← {L('حسابي', 'My account')}</Link>
      </p>
      <PageHeader title={title} subtitle={L('تُنسخ بيانات العنوان إلى الطلب عند إرساله، فتبقى الطلبات السابقة كما هي.', 'The address is copied onto each order when it is placed, so past orders are not affected by later edits.')} />

      {rows.length === 0 ? (
        <EmptyState>{L('لا توجد عناوين محفوظة.', 'No saved addresses.')}</EmptyState>
      ) : (
        <div className="card-grid">
          {rows.map((a) => {
            const view: AddressView = {
              id: a.id,
              label: a.label,
              governorateId: a.governorateId,
              areaId: a.areaId,
              details: a.details,
              recipientName: a.recipientName,
              recipientPhone: a.recipientPhone,
              isDefault: a.isDefault,
              governorateAr: a.governorate.nameAr,
              governorateEn: a.governorate.nameEn,
              areaAr: a.area?.nameAr ?? null,
              areaEn: a.area?.nameEn ?? null,
            };
            return <AddressCard key={a.id} address={view} governorates={govOptions} areas={areaOptions} locale={locale} />;
          })}
        </div>
      )}

      <Card title={L('إضافة عنوان', 'Add an address')}>
        <ApiForm
          endpoint="/api/v1/me/addresses"
          submitLabel={L('حفظ العنوان', 'Save address')}
          busyLabel={L('جاري الحفظ…', 'Saving…')}
          successMessage={L('تم حفظ العنوان.', 'Address saved.')}
          fields={addressFormFields(locale, governorates, areas)}
        />
      </Card>
    </AccountShell>
  );
}
