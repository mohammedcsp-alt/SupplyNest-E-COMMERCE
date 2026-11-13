import Link from 'next/link';
import { currentLocale, localized, messagesFor } from '@/lib/i18n';
import { getCurrentUser, viewerOf, canSeePrices } from '@/lib/session';
import { listCatalog } from '@/modules/catalog/public';
import { Alert, EmptyState, Money, Pagination, PageHeader, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;

/** Search results use the same projection and product-card markup as the catalog. Prices only for entitled viewers. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const locale = await currentLocale();
  const t = messagesFor(locale);
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 20;

  const user = await getCurrentUser();
  const priced = canSeePrices(user);
  const result = q ? await listCatalog({ q, page, pageSize, sort: 'relevance' }, viewerOf(user)) : null;

  return (
    <section className="stack">
      <PageHeader title={L('بحث', 'Search')} subtitle={priced ? L('الأسعار حسب مستوى حسابك.', 'Prices shown for your price level.') : t.common.priceHidden} />

      <form method="get" action="/search" role="search" className="card" aria-label={L('البحث في الكتالوج', 'Search the catalog')}>
        <div className="form-row">
          <div className="field">
            <label htmlFor="search-q">{L('الاسم أو رمز SKU أو الموديل', 'Name, SKU or model')}</label>
            <input id="search-q" name="q" type="search" defaultValue={q} maxLength={100} />
          </div>
          <button className="btn btn-primary" type="submit">
            {t.common.search}
          </button>
        </div>
      </form>

      {!q && <EmptyState>{L('اكتب كلمة للبحث.', 'Type a word to search.')}</EmptyState>}

      {result && result.meta.ignored.length > 0 && <Alert tone="warn">{L('تم تجاهل خيارات السعر لأنك لست عميلًا معتمدًا.', 'Price options were ignored because you are not an approved customer.')}</Alert>}

      {result && result.items.length === 0 && <EmptyState>{L(`لا توجد نتائج لـ «${q}».`, `No results for "${q}".`)}</EmptyState>}

      {result && result.items.length > 0 && (
        <>
          <p className="muted">{L(`${result.meta.total} نتيجة`, `${result.meta.total} result(s)`)}</p>
          <div className="product-grid" role="list">
            {result.items.map((item) => {
              const name = localized(locale, item.nameAr, item.nameEn);
              const price = (item as { price?: { amount: string } }).price;
              return (
                <article className="product-card" role="listitem" key={item.id}>
                  <div className="thumb" aria-hidden={item.images.length === 0}>
                    {item.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.images[0].url} alt={item.images[0].altText ?? name} loading="lazy" />
                    ) : (
                      <span>{L('بلا صورة', 'No image')}</span>
                    )}
                  </div>
                  <h3>
                    <Link href={`/products/${encodeURIComponent(item.sku)}`}>{name}</Link>
                  </h3>
                  <div className="muted" dir="ltr">
                    {item.sku}
                    {item.model ? ` · ${item.model.name}` : ''}
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <StatusBadge status={item.availability} />
                    {priced && price ? <Money value={price.amount} locale={locale} /> : <span className="muted">{priced ? '—' : L('السعر للعملاء المعتمدين', 'Price for approved customers')}</span>}
                  </div>
                </article>
              );
            })}
          </div>
          <Pagination
            page={result.meta.page}
            pageSize={result.meta.pageSize}
            total={result.meta.total}
            basePath="/search"
            params={{ q }}
            labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: 'of' }}
          />
        </>
      )}
    </section>
  );
}
