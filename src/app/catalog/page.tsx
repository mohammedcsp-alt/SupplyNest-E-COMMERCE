import Link from 'next/link';
import { cookies } from 'next/headers';
import { currentLocale, localized, messagesFor } from '@/lib/i18n';
import { getCurrentUser, viewerOf, canSeePrices, canOrder } from '@/lib/session';
import { listCatalog, categoryTree } from '@/modules/catalog/public';
import { catalogFacets } from '@/modules/catalog/facets';
import { db } from '@/lib/db';
import { formatIqd } from '@/lib/money';
import { Alert, PageHeader } from '@/components/ui';
import { ProductCard, availabilityLabel, cardAttrs, type CardItem } from '@/components/storefront/ProductCard';
import { ProductRow } from '@/components/storefront/ProductRow';
import { BulkCompact, type CompactRow } from '@/components/storefront/BulkCompact';
import { ViewSwitch } from '@/components/storefront/ViewSwitch';
import { AutoSubmitSelect } from '@/components/storefront/AutoSubmit';
import { FilterDrawerToggle, FilterDrawerBackdrop } from '@/components/storefront/FilterDrawer';
import { CATALOG_VIEWS, VIEW_COOKIE, parseView, type CatalogView } from '@/components/storefront/catalog-view';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const SORTS = ['relevance', 'newest', 'name', 'price_asc', 'price_desc'] as const;
type Sort = (typeof SORTS)[number];
const PAGE_SIZE: Record<CatalogView, number> = { grid: 24, list: 20, compact: 50 };
const KEY_RE = /^[a-z0-9_]{1,60}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuids = (xs: string[]) => xs.filter((x) => UUID_RE.test(x));

function arr(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean).slice(0, 50);
}
function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
}
function money(v: string): string {
  return v.replace(/[^\d.]/g, '').slice(0, 12);
}

type CatNode = Awaited<ReturnType<typeof categoryTree>>[number];
function findNode(nodes: CatNode[], id: string): CatNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}
async function categoryPath(id: string): Promise<Array<{ id: string; nameAr: string; nameEn: string }>> {
  const path: Array<{ id: string; nameAr: string; nameEn: string }> = [];
  let cur: string | null = id;
  for (let i = 0; cur && i < 12; i++) {
    const row: { id: string; parentId: string | null; nameAr: string; nameEn: string } | null = await db.category.findUnique({
      where: { id: cur },
      select: { id: true, parentId: true, nameAr: true, nameEn: true },
    });
    if (!row) break;
    path.unshift({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn });
    cur = row.parentId;
  }
  return path;
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const locale = await currentLocale();
  const t = messagesFor(locale);
  const sp = await searchParams;
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await getCurrentUser();
  const viewer = viewerOf(user);
  const priced = canSeePrices(user);
  const buyable = canOrder(user);
  const isCustomer = user?.userType === 'CUSTOMER';
  const ar = locale === 'ar';

  // ----- state from the URL -----
  const cookieView = parseView((await cookies()).get(VIEW_COOKIE)?.value);
  const view: CatalogView = parseView(one(sp.view)) ?? cookieView ?? 'grid';
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const pageSize = PAGE_SIZE[view];
  const sort: Sort = (SORTS as readonly string[]).includes(one(sp.sort)) ? (one(sp.sort) as Sort) : 'relevance';
  const q = one(sp.q).slice(0, 100);
  const rawCategory = one(sp.categoryId);
  const categoryId = UUID_RE.test(rawCategory) ? rawCategory : undefined;
  const brandIds = uuids(arr(sp.brand));
  const qualityIds = uuids(arr(sp.quality));
  const available = one(sp.available) === '1';
  const priceMin = priced ? money(one(sp.priceMin)) : '';
  const priceMax = priced ? money(one(sp.priceMax)) : '';
  const attributes: Array<{ key: string; values: string[] }> = [];
  for (const k of Object.keys(sp)) {
    if (!k.startsWith('attr_')) continue;
    const key = k.slice(5);
    if (!KEY_RE.test(key)) continue;
    const values = arr(sp[k]);
    if (values.length) attributes.push({ key, values });
  }

  const [result, facets, tree, path] = await Promise.all([
    listCatalog(
      {
        q,
        categoryId,
        brandIds: brandIds.length ? brandIds : undefined,
        qualityIds: qualityIds.length ? qualityIds : undefined,
        attributes: attributes.length ? attributes : undefined,
        availableOnly: available,
        priceMin: priceMin || undefined,
        priceMax: priceMax || undefined,
        sort,
        page,
        pageSize,
      },
      viewer,
    ),
    catalogFacets(categoryId),
    categoryTree(),
    categoryId ? categoryPath(categoryId) : Promise.resolve([]),
  ]);

  const favoriteSkus = new Set<string>();
  if (isCustomer && user) {
    const favs = await db.favorite.findMany({ where: { customerId: user.id }, select: { sku: { select: { sku: true } } } });
    for (const f of favs) favoriteSkus.add(f.sku.sku);
  }

  // Sidebar categories: children of the selected category, or the top level.
  const selectedNode = categoryId ? findNode(tree, categoryId) : null;
  const sideCats = selectedNode ? selectedNode.children : tree;

  // ----- link helpers (every link keeps the current state; changing a filter resets paging) -----
  const state: Record<string, string[]> = {
    q: q ? [q] : [],
    categoryId: categoryId ? [categoryId] : [],
    brand: brandIds,
    quality: qualityIds,
    available: available ? ['1'] : [],
    priceMin: priceMin ? [priceMin] : [],
    priceMax: priceMax ? [priceMax] : [],
    sort: sort !== 'relevance' ? [sort] : [],
    view: [view],
  };
  for (const a of attributes) state[`attr_${a.key}`] = a.values;

  function href(overrides: Record<string, string[] | null> = {}, keepPage = false): string {
    const qs = new URLSearchParams();
    const merged = { ...state, ...overrides };
    for (const [k, vals] of Object.entries(merged)) {
      if (!vals) continue;
      for (const v of vals) qs.append(k, v);
    }
    if (keepPage && page > 1) qs.set('page', String(page));
    const s = qs.toString();
    return s ? `/catalog?${s}` : '/catalog';
  }
  function without(key: string, value?: string): string {
    const cur = state[key] ?? [];
    return href({ [key]: value === undefined ? null : cur.filter((v) => v !== value) });
  }

  const viewHrefs = {
    grid: href({ view: ['grid'] }, true),
    list: href({ view: ['list'] }, true),
    compact: href({ view: ['compact'] }, true),
  } as Record<CatalogView, string>;
  const viewLabels = {
    label: L('طريقة العرض', 'Display mode'),
    grid: L('شبكة', 'Grid'),
    list: L('قائمة', 'List'),
    compact: L('مضغوط (جملة)', 'Compact (B2B)'),
  };

  // ----- active filter chips -----
  const chips: Array<{ label: string; remove: string }> = [];
  if (q) chips.push({ label: `"${q}"`, remove: href({ q: null }) });
  if (selectedNode) chips.push({ label: localized(locale, selectedNode.nameAr, selectedNode.nameEn), remove: href({ categoryId: null }) });
  for (const b of brandIds) {
    const name = facets.brands.find((x) => x.id === b)?.name ?? b;
    chips.push({ label: name, remove: without('brand', b) });
  }
  for (const qid of qualityIds) {
    const q2 = facets.qualities.find((x) => x.id === qid);
    chips.push({ label: q2 ? localized(locale, q2.nameAr, q2.nameEn) : qid, remove: without('quality', qid) });
  }
  if (available) chips.push({ label: L('المتوفر فقط', 'Available only'), remove: href({ available: null }) });
  if (priceMin) chips.push({ label: `≥ ${priceMin}`, remove: href({ priceMin: null }) });
  if (priceMax) chips.push({ label: `≤ ${priceMax}`, remove: href({ priceMax: null }) });
  for (const a of attributes) {
    const def = facets.attributes.find((x) => x.key === a.key);
    const name = def ? localized(locale, def.labelAr, def.labelEn) : a.key;
    for (const v of a.values) chips.push({ label: `${name}: ${v}`, remove: without(`attr_${a.key}`, v) });
  }
  const hasFilters = chips.length > 0;

  // ----- pagination -----
  const totalPages = Math.max(1, Math.ceil(result.meta.total / pageSize));
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, vals] of Object.entries(state)) for (const v of vals) qs.append(k, v);
    if (p > 1) qs.set('page', String(p));
    const s = qs.toString();
    return s ? `/catalog?${s}` : '/catalog';
  };
  const pageNums: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pageNums.push(p);

  // ----- card viewer -----
  const cardViewer = {
    locale,
    canSeePrice: priced,
    canBuy: buyable,
    canFavorite: isCustomer,
    favoriteSkus,
  };

  const title = selectedNode ? localized(locale, selectedNode.nameAr, selectedNode.nameEn) : L('كل المنتجات', 'All products');
  const items = result.items as CardItem[];

  const compactRows: CompactRow[] = items.map((it) => ({
    id: it.id,
    sku: it.sku,
    name: localized(locale, it.nameAr, it.nameEn),
    href: `/products/${encodeURIComponent(it.sku)}`,
    thumb: it.images[0]?.url ?? null,
    attrs: cardAttrs(it, locale).join(' · '),
    availability: it.availability,
    availabilityLabel: availabilityLabel(it.availability, locale),
    priceText: it.price ? formatIqd(it.price.amount, locale) : null,
  }));

  return (
    <div className="stack" style={{ marginBlockStart: 0 }}>
      <nav className="crumbs" aria-label={L('مسار التصفح', 'Breadcrumb')}>
        <Link href="/">{L('الرئيسية', 'Home')}</Link>
        <span aria-hidden="true">›</span>
        {path.length === 0 ? (
          <span aria-current="page">{L('كل المنتجات', 'All products')}</span>
        ) : (
          <>
            <Link href="/catalog">{L('الكتالوج', 'Catalogue')}</Link>
            {path.map((p, i) => (
              <span key={p.id} style={{ display: 'contents' }}>
                <span aria-hidden="true">›</span>
                {i === path.length - 1 ? (
                  <span aria-current="page">{localized(locale, p.nameAr, p.nameEn)}</span>
                ) : (
                  <Link href={`/catalog?categoryId=${p.id}`}>{localized(locale, p.nameAr, p.nameEn)}</Link>
                )}
              </span>
            ))}
          </>
        )}
      </nav>

      {!user && (
        <Alert tone="warn">
          {L(
            'سجّل حسابًا للجملة لعرض أسعار العملاء المعتمدين والطلب. ',
            'Register for a wholesale account to see your price tier and order. ',
          )}
          <Link href="/register">{L('تسجيل', 'Register')}</Link>
        </Alert>
      )}
      {user && !priced && <Alert tone="warn">{L('الأسعار تظهر بعد موافقة الإدارة على حسابك.', 'Prices appear after an administrator approves your account.')}</Alert>}
      {result.meta.ignored.length > 0 && <Alert tone="warn">{t.common.priceHidden}</Alert>}

      <form method="get" action="/catalog" role="search" aria-label={L('تصفية وبحث الكتالوج', 'Filter and search the catalogue')}>
        {categoryId && <input type="hidden" name="categoryId" value={categoryId} />}
        {view !== 'grid' && <input type="hidden" name="view" value={view} />}

        <div className="catalog-head">
          <div>
            <h1>{title}</h1>
            <span className="catalog-count" aria-live="polite">
              {L(`${result.meta.total} منتج`, `${result.meta.total} products`)}
            </span>
          </div>
          <div className="catalog-tools">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={L('بحث بالاسم أو SKU أو العلامة', 'Search name, SKU or brand')}
              aria-label={L('بحث في الكتالوج', 'Search the catalogue')}
              style={{ minWidth: 240 }}
              maxLength={100}
            />
            <AutoSubmitSelect id="sort" name="sort" defaultValue={sort} label={L('ترتيب', 'Sort')}>
              <option value="relevance">{L('الأكثر صلة', 'Relevance')}</option>
              <option value="newest">{L('الأحدث', 'Newest')}</option>
              <option value="name">{L('الاسم', 'Name')}</option>
              {priced && <option value="price_asc">{L('السعر: من الأقل', 'Price: low to high')}</option>}
              {priced && <option value="price_desc">{L('السعر: من الأعلى', 'Price: high to low')}</option>}
            </AutoSubmitSelect>
            <ViewSwitch current={view} hrefs={viewHrefs} labels={viewLabels} />
            <FilterDrawerToggle label={L('التصفية', 'Filters')} closeLabel={L('إغلاق', 'Close')} />
          </div>
        </div>

        <div className="catalog-layout">
          <aside id="filter-panel" className="filter-panel" aria-label={L('عوامل التصفية', 'Filters')}>
            <div className="filter-panel-head">
              <h2>{L('التصفية', 'Filters')}</h2>
              {hasFilters && <Link href={href({ q: null, categoryId: null, brand: null, quality: null, available: null, priceMin: null, priceMax: null, ...Object.fromEntries(attributes.map((a) => [`attr_${a.key}`, null])) })} className="btn btn-small btn-ghost">{L('مسح الكل', 'Clear all')}</Link>}
            </div>

            {chips.length > 0 && (
              <div className="applied" aria-label={L('الفلاتر المطبقة', 'Applied filters')}>
                {chips.map((c) => (
                  <span key={c.label + c.remove} className="chip">
                    {c.label}
                    <Link href={c.remove} aria-label={`${L('إزالة', 'Remove')} ${c.label}`}>
                      ×
                    </Link>
                  </span>
                ))}
              </div>
            )}

            {sideCats.length > 0 && (
              <details className="filter-section" open>
                <summary>{L('الفئات', 'Categories')}</summary>
                <div className="filter-body">
                  {selectedNode && (
                    <Link href={href({ categoryId: null })} className="filter-opt">
                      ← {L('كل الفئات', 'All categories')}
                    </Link>
                  )}
                  {sideCats.map((c) => (
                    <Link key={c.id} href={href({ categoryId: [c.id] })} className="filter-opt">
                      {localized(locale, c.nameAr, c.nameEn)}
                    </Link>
                  ))}
                </div>
              </details>
            )}

            {facets.brands.length > 0 && (
              <details className="filter-section" open>
                <summary>{L('العلامات التجارية', 'Brands')}</summary>
                <div className="filter-body">
                  {facets.brands.slice(0, 8).map((b) => (
                    <label key={b.id} className="filter-opt">
                      <input type="checkbox" name="brand" value={b.id} defaultChecked={brandIds.includes(b.id)} />
                      <span>{b.name}</span>
                      <span className="n">{b.count}</span>
                    </label>
                  ))}
                  {facets.brands.length > 8 && (
                    <details>
                      <summary className="filter-more">{L(`عرض الكل (${facets.brands.length})`, `Show all (${facets.brands.length})`)}</summary>
                      <div className="filter-body" style={{ padding: '6px 0 0' }}>
                        {facets.brands.slice(8).map((b) => (
                          <label key={b.id} className="filter-opt">
                            <input type="checkbox" name="brand" value={b.id} defaultChecked={brandIds.includes(b.id)} />
                            <span>{b.name}</span>
                            <span className="n">{b.count}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </details>
            )}

            {facets.attributes.map((a) => (
              <details key={a.key} className="filter-section" open={attributes.some((x) => x.key === a.key)}>
                <summary>
                  {localized(locale, a.labelAr, a.labelEn)}
                  {a.unit ? ` (${a.unit})` : ''}
                </summary>
                <div className="filter-body">
                  {a.values.slice(0, 10).map((v) => (
                    <label key={v.value} className="filter-opt">
                      <input type="checkbox" name={`attr_${a.key}`} value={v.value} defaultChecked={(state[`attr_${a.key}`] ?? []).includes(v.value)} />
                      <span>{v.value}</span>
                      <span className="n">{v.count}</span>
                    </label>
                  ))}
                  {a.values.length > 10 && (
                    <details>
                      <summary className="filter-more">{L(`عرض الكل (${a.values.length})`, `Show all (${a.values.length})`)}</summary>
                      <div className="filter-body" style={{ padding: '6px 0 0' }}>
                        {a.values.slice(10).map((v) => (
                          <label key={v.value} className="filter-opt">
                            <input type="checkbox" name={`attr_${a.key}`} value={v.value} defaultChecked={(state[`attr_${a.key}`] ?? []).includes(v.value)} />
                            <span>{v.value}</span>
                            <span className="n">{v.count}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </details>
            ))}

            {facets.qualities.length > 0 && (
              <details className="filter-section">
                <summary>{L('الجودة', 'Quality')}</summary>
                <div className="filter-body">
                  {facets.qualities.map((qq) => (
                    <label key={qq.id} className="filter-opt">
                      <input type="checkbox" name="quality" value={qq.id} defaultChecked={qualityIds.includes(qq.id)} />
                      <span>{localized(locale, qq.nameAr, qq.nameEn)}</span>
                      <span className="n">{qq.count}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}

            <details className="filter-section" open>
              <summary>{L('الإتاحة', 'Availability')}</summary>
              <div className="filter-body">
                <label className="filter-opt">
                  <input type="checkbox" name="available" value="1" defaultChecked={available} />
                  <span>{L('المتوفر فقط', 'Available only')}</span>
                </label>
              </div>
            </details>

            {priced && (
              <details className="filter-section" open={Boolean(priceMin || priceMax)}>
                <summary>{L('نطاق السعر (IQD)', 'Price range (IQD)')}</summary>
                <div className="filter-body">
                  <div className="row" style={{ gap: 6 }}>
                    <input type="number" name="priceMin" min={0} inputMode="numeric" defaultValue={priceMin} aria-label={L('من', 'From')} style={{ inlineSize: '50%' }} />
                    <input type="number" name="priceMax" min={0} inputMode="numeric" defaultValue={priceMax} aria-label={L('إلى', 'To')} style={{ inlineSize: '50%' }} />
                  </div>
                </div>
              </details>
            )}

            <div className="clear-all">
              <button type="submit" className="btn btn-primary btn-block">
                {L('تطبيق الفلاتر', 'Apply filters')}
              </button>
            </div>
          </aside>
          <FilterDrawerBackdrop />

          <section aria-label={L('النتائج', 'Results')} style={{ minWidth: 0 }}>
            {items.length === 0 ? (
              <div className="empty-state">
                <strong>{L('لا توجد منتجات مطابقة', 'No matching products')}</strong>
                {hasFilters ? (
                  <Link href={href({ q: null, categoryId: null, brand: null, quality: null, available: null, priceMin: null, priceMax: null, ...Object.fromEntries(attributes.map((a) => [`attr_${a.key}`, null])) })}>
                    {L('مسح الفلاتر', 'Clear filters')}
                  </Link>
                ) : (
                  <span>{L('لم تُنشر منتجات في هذا القسم بعد.', 'No products have been published in this section yet.')}</span>
                )}
              </div>
            ) : view === 'grid' ? (
              <div className="product-grid" role="list">
                {items.map((it) => (
                  <div role="listitem" key={it.id}>
                    <ProductCard item={it} v={cardViewer} />
                  </div>
                ))}
              </div>
            ) : view === 'list' ? (
              <div className="product-list" role="list">
                {items.map((it) => (
                  <div role="listitem" key={it.id}>
                    <ProductRow item={it} v={cardViewer} />
                  </div>
                ))}
              </div>
            ) : (
              <BulkCompact
                rows={compactRows}
                locale={locale}
                canBuy={buyable}
                labels={{
                  tableLabel: L('قائمة المنتجات المضغوطة', 'Compact product list'),
                  selectAll: L('تحديد الكل', 'Select all'),
                  select: L('تحديد', 'Select'),
                  image: L('صورة', 'Image'),
                  sku: 'SKU',
                  name: L('المنتج', 'Product'),
                  attrs: L('المواصفات', 'Specifications'),
                  availability: L('الإتاحة', 'Availability'),
                  price: L('السعر', 'Price'),
                  qty: L('الكمية', 'Qty'),
                  bulkRegion: L('إضافة جماعية إلى السلة', 'Bulk add to cart'),
                  selectedPrefix: L('المحدد:', 'Selected:'),
                  addSelected: L('أضف المحدد إلى السلة', 'Add selected to cart'),
                }}
              />
            )}

            {totalPages > 1 && (
              <nav className="pagination" aria-label={L('ترقيم الصفحات', 'Pagination')}>
                <span className="muted">
                  {L(`صفحة ${page} من ${totalPages}`, `Page ${page} of ${totalPages}`)}
                </span>
                <div>
                  {page > 1 ? <Link href={pageHref(page - 1)}>{L('السابق', 'Previous')}</Link> : <span className="page-num muted">{L('السابق', 'Previous')}</span>}{' '}
                  {pageNums.map((p) =>
                    p === page ? (
                      <span key={p} className="page-num" aria-current="page">
                        {p}
                      </span>
                    ) : (
                      <Link key={p} href={pageHref(p)}>
                        {p}
                      </Link>
                    ),
                  )}{' '}
                  {page < totalPages ? <Link href={pageHref(page + 1)}>{L('التالي', 'Next')}</Link> : <span className="page-num muted">{L('التالي', 'Next')}</span>}
                </div>
              </nav>
            )}
            {view !== 'compact' && items.length > 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>{ar ? 'الأسعار بالدينار العراقي (IQD).' : 'Prices in Iraqi dinar (IQD).'}</p>}
          </section>
        </div>
      </form>
    </div>
  );
}
