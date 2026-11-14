# Implementation decisions — V3.3 storefront redesign (in progress)

Scope of this checkpoint: design system tokens, header, homepage, catalog (grid / list / compact), server-side filters.
Not yet redesigned: product details page, cart, checkout, account pages, admin, fulfillment, accounting (see PHASE_PROGRESS.md).

- D-01 Checkpoint: tag `pre-v3.3-redesign` on commit 8312471 (main). No remote operations.
- D-02 Design tokens live in `src/app/globals.css` (`:root`). Brand colour is `--brand` / `--accent`.
- D-03 System fonts only, with Arabic fallbacks; no external font or CDN requests (works offline).
- D-04 Logical CSS properties everywhere so one stylesheet serves RTL and LTR.
- D-05 Catalog view mode: `?view=grid|list|compact`, remembered in cookie `b2b_catalog_view` (1 year).
- D-06 Filters are server-side GET parameters: `brand`, `quality`, `attr_<key>`, `available`, `priceMin/priceMax` (approved customers only), `sort`, `page`.
- D-07 Storefront identity is configurable by environment variables (`STORE_NAME_EN`, `STORE_NAME_AR`, `STORE_LOGO_PATH`,
  `STORE_ANNOUNCEMENT_EN/AR`, `STORE_SHOW_ANNOUNCEMENT`, `STORE_SUPPORT_PHONE`, `STORE_SUPPORT_EMAIL`). Defaults in `src/lib/storefront-config.ts`.
- D-08 Filter facet counts are computed over the selected category subtree, not over the other active filters (keeps the query cheap).
- D-09 Attribute filters are shown only for attribute definitions marked `filterable` on the selected category.
- D-10 "Quick order" links to the cart (existing quick-add lives there); "Excel order upload" links to `/bulk-order` (existing file flow).
- D-11 No featured-products section: there is no configuration for it yet, so it is omitted rather than invented.
- D-12 Hero uses the first active CMS banner (date window respected); otherwise a factual default text. No discounts or claims.
- D-13 Compact view bulk add posts all selected lines to the existing `/api/v1/cart/bulk-add`; server re-validates each line.
- D-14 Prices and stock quantities are never sent to anonymous or unapproved viewers; the catalog API projection is unchanged.
- D-15 listCatalog gained optional multi-select `brandIds`, `qualityIds` and `attributes` (backward compatible).
- D-16 UUID-shaped ids only reach the database: malformed `brand`/`quality`/`categoryId` values are ignored (previously caused HTTP 500).
