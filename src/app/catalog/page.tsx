import Link from 'next/link';
import { currentLocale, localized, messagesFor } from '@/lib/i18n';
import { getCurrentUser, viewerOf, canSeePrices } from '@/lib/session';
import { listCatalog } from '@/modules/catalog/public';
import { categoryTree } from '@/modules/catalog/public';
import { db } from '@/lib/db';
import { Alert, EmptyState, Pagination, PageHeader, Money, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;

function flatCategories(nodes: Awaited<ReturnType<typeof categoryTree>>, depth = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap((n) => [{ id: n.id, label: `${'— '.repeat(depth)}${n.nameEn}` }, ...flatCategories(n.children, depth + 1)]);
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const locale = await currentLocale();
  const t = messagesFor(locale);
  const sp = await searchParams;
  const user = await getCurrentUser();
  const viewer = viewerOf(user);
  const priced = canSeePrices(user);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = 20;
  const sort = (['relevance', 'newest', 'name', 'price_asc', 'price_desc'] as const).includes(sp.sort as 'relevance') ? (sp.sort as 'relevance') : 'relevance';

  const [result, categories, qualities] = await Promise.all([
    listCatalog(
      {
        q: sp.q,
        categoryId: sp.categoryId || undefined,
        qualityId: sp.qualityId || undefined,
        availableOnly: sp.available === '1',
        sort,
        page,
        pageSize,
      },
      viewer,
    ),
    categoryTree(),
    db.quality.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const params: Record<string, string | undefined> = { q: sp.q, categoryId: sp.categoryId, qualityId: sp.qualityId, available: sp.available, sort: sp.sort };

  return (
    <section className="stack">
      <PageHeader title={L('الكتالوج', 'Catalog')} subtitle={priced ? L('الأسعار حسب مستوى حسابك.', 'Prices shown for your price level.') : t.common.priceHidden} />

      <form method="get" className="card" role="search" aria-label={L('تصفية الكتالوج', 'Filter catalog')}>
        <div className="form-row">
          <div className="field">
            <label htmlFor="f-q">{L('بحث بالاسم أو SKU أو الموديل', 'Search by name, SKU or model')}</label>
            <input id="f-q" name="q" type="search" defaultValue={sp.q ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="f-cat">{L('التصنيف', 'Category')}</label>
            <select id="f-cat" name="categoryId" defaultValue={sp.categoryId ?? ''}>
              <option value="">{L('الكل', 'All')}</option>
              {flatCategories(categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-quality">{L('الجودة', 'Quality')}</label>
            <select id="f-quality" name="qualityId" defaultValue={sp.qualityId ?? ''}>
              <option value="">{L('الكل', 'All')}</option>
              {qualities.map((q) => (
                <option key={q.id} value={q.id}>
                  {localized(locale, q.nameAr, q.nameEn)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-sort">{L('ترتيب', 'Sort')}</label>
            <select id="f-sort" name="sort" defaultValue={sort}>
              <option value="relevance">{L('الأكثر صلة', 'Relevance')}</option>
              <option value="newest">{L('الأحدث', 'Newest')}</option>
              <option value="name">{L('الاسم', 'Name')}</option>
              {priced && <option value="price_asc">{L('السعر: من الأقل', 'Price: low to high')}</option>}
              {priced && <option value="price_desc">{L('السعر: من الأعلى', 'Price: high to low')}</option>}
            </select>
          </div>
        </div>
        <div className="row">
          <label className="row" style={{ fontWeight: 400 }}>
            <input type="checkbox" name="available" value="1" defaultChecked={sp.available === '1'} /> {L('المتوفر فقط', 'Available only')}
          </label>
          <button className="btn btn-primary" type="submit">
            {t.common.search}
          </button>
          <Link className="btn" href="/catalog">
            {L('إعادة ضبط', 'Reset')}
          </Link>
        </div>
      </form>

      {result.meta.ignored.length > 0 && <Alert tone="warn">{L('تم تجاهل خيارات السعر لأنك لست عميلًا معتمدًا.', 'Price options were ignored because you are not an approved customer.')}</Alert>}

      {result.items.length === 0 ? (
        <EmptyState>{t.common.empty}</EmptyState>
      ) : (
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
                {item.quality && <div className="muted">{localized(locale, item.quality.nameAr, item.quality.nameEn)}</div>}
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <StatusBadge status={item.availability} />
                  {priced && price ? <Money value={price.amount} locale={locale} /> : <span className="muted">{priced ? '—' : L('السعر للعملاء المعتمدين', 'Price for approved customers')}</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Pagination
        page={result.meta.page}
        pageSize={result.meta.pageSize}
        total={result.meta.total}
        basePath="/catalog"
        params={params}
        labels={{ prev: L('السابق', 'Previous'), next: L('التالي', 'Next'), of: 'of' }}
      />
    </section>
  );
}
