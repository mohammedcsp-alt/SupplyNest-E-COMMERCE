import Link from 'next/link';
import { localized, type Locale } from '@/lib/i18n';
import { Money } from '@/components/ui';
import { QuickAdd } from './QuickAdd';
import { FavoriteButton } from './FavoriteButton';

/** Shape shared by catalog results and homepage sections (see listCatalog / projectSku). */
export type CardItem = {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  brand: { id: string; name: string } | null;
  model: { id: string; name: string } | null;
  quality: { code: string; nameAr: string; nameEn: string } | null;
  images: Array<{ id: string; url: string; altText: string | null }>;
  attributes: Array<{ key: string; labelAr: string; labelEn: string; value: string; unit: string | null }>;
  availability: string;
  price?: { amount: string; currency: string; levelCode: string };
};

export type CardViewer = {
  locale: Locale;
  /** Customer price visible (approved and active). */
  canSeePrice: boolean;
  /** Customer may order (ACTIVE customer). */
  canBuy: boolean;
  /** Signed-in customer: show the favourites control. */
  canFavorite: boolean;
  favoriteSkus: ReadonlySet<string>;
};

export function availabilityLabel(status: string, locale: Locale): string {
  if (status === 'AVAILABLE') return localized(locale, 'متوفر', 'Available');
  return localized(locale, 'غير متوفر حاليًا', 'Currently unavailable');
}

/** Up to three specification pairs shown on cards; extra attributes stay on the product page. */
export function cardAttrs(item: CardItem, locale: Locale): string[] {
  const parts: string[] = [];
  if (item.brand) parts.push(item.brand.name);
  if (item.model) parts.push(item.model.name);
  if (item.quality) parts.push(localized(locale, item.quality.nameAr, item.quality.nameEn));
  for (const a of item.attributes.slice(0, 3)) {
    parts.push(`${localized(locale, a.labelAr, a.labelEn)}: ${a.value}${a.unit ? ` ${a.unit}` : ''}`);
  }
  return parts;
}

export function ProductCard({ item, v }: { item: CardItem; v: CardViewer }) {
  const ar = v.locale === 'ar';
  const name = localized(v.locale, item.nameAr, item.nameEn);
  const img = item.images[0];
  const attrs = cardAttrs(item, v.locale);
  const available = item.availability === 'AVAILABLE';
  return (
    <article className="product-card" aria-label={name}>
      {v.canFavorite && <FavoriteButton sku={item.sku} locale={v.locale} initial={v.favoriteSkus.has(item.sku)} />}
      <Link href={`/products/${encodeURIComponent(item.sku)}`} className="thumb" tabIndex={-1} aria-hidden="true">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={img.altText ?? name} loading="lazy" />
        ) : (
          <span>{ar ? 'بلا صورة' : 'No image'}</span>
        )}
      </Link>
      <h3>
        <Link href={`/products/${encodeURIComponent(item.sku)}`}>{name}</Link>
      </h3>
      <div className="sku-line">{item.sku}</div>
      {attrs.length > 0 && <div className="attrs">{attrs.map((a) => <span key={a}>{a}</span>)}</div>}
      <div className="foot">
        <div className="price-row">
          <span className={available ? 'badge badge-ok' : 'badge'}>{availabilityLabel(item.availability, v.locale)}</span>
          {v.canSeePrice && item.price ? (
            <span className="price">
              <Money value={item.price.amount} locale={v.locale} />
            </span>
          ) : (
            <span className="price-hidden">
              {v.canBuy || v.canSeePrice ? '—' : ar ? 'سعر الجملة' : 'Wholesale price'}
            </span>
          )}
        </div>
        {v.canBuy && item.price && available && <QuickAdd sku={item.sku} locale={v.locale} compact />}
      </div>
    </article>
  );
}
