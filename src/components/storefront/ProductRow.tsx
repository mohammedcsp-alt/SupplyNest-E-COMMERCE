import Link from 'next/link';
import { localized } from '@/lib/i18n';
import { Money } from '@/components/ui';
import { QuickAdd } from './QuickAdd';
import { FavoriteButton } from './FavoriteButton';
import { availabilityLabel, cardAttrs, type CardItem, type CardViewer } from './ProductCard';

/** List view row (horizontal): image, identity and specs on the start side; price and purchase controls on the end side. */
export function ProductRow({ item, v }: { item: CardItem; v: CardViewer }) {
  const ar = v.locale === 'ar';
  const name = localized(v.locale, item.nameAr, item.nameEn);
  const img = item.images[0];
  const attrs = cardAttrs(item, v.locale);
  const available = item.availability === 'AVAILABLE';
  return (
    <article className="product-row">
      <Link href={`/products/${encodeURIComponent(item.sku)}`} className="thumb" tabIndex={-1} aria-hidden="true">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={img.altText ?? name} loading="lazy" />
        ) : (
          <span>{ar ? 'بلا صورة' : 'No image'}</span>
        )}
      </Link>
      <div className="info">
        <h3>
          <Link href={`/products/${encodeURIComponent(item.sku)}`}>{name}</Link>
        </h3>
        <div className="sku-line">{item.sku}</div>
        {attrs.length > 0 && <div className="attrs">{attrs.map((a) => <span key={a}>{a}</span>)}</div>}
        <div className="row" style={{ gap: 8 }}>
          <span className={available ? 'badge badge-ok' : 'badge'}>{availabilityLabel(item.availability, v.locale)}</span>
          {v.canFavorite && <FavoriteButton sku={item.sku} locale={v.locale} initial={v.favoriteSkus.has(item.sku)} />}
        </div>
      </div>
      <div className="buy">
        {v.canSeePrice && item.price ? (
          <span className="price">
            <Money value={item.price.amount} locale={v.locale} />
          </span>
        ) : (
          <span className="price-hidden">{ar ? 'سعر الجملة' : 'Wholesale price'}</span>
        )}
        {v.canBuy && item.price && available && <QuickAdd sku={item.sku} locale={v.locale} />}
      </div>
    </article>
  );
}
