/** Catalog display modes. Kept in a plain module so server pages and client components can both import it. */
export type CatalogView = 'grid' | 'list' | 'compact';
export const CATALOG_VIEWS: readonly CatalogView[] = ['grid', 'list', 'compact'];
export const VIEW_COOKIE = 'b2b_catalog_view';

export function parseView(v: string | null | undefined): CatalogView | null {
  return v && (CATALOG_VIEWS as readonly string[]).includes(v) ? (v as CatalogView) : null;
}
