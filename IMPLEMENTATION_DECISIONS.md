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

## Execution continuity (V3.3, D-17 to D-19)
- D-17 Work queue: `MASTER_TASK_QUEUE.json` lists every V3.3 task with dependencies, priority, status, acceptance, evidence and blocker reason. It is the source of truth for what remains.
- D-18 Stop hook: `.claude/settings.json` (project scope only; no global settings changed) runs `.claude/hooks/stop-queue.cjs` when a turn ends. It blocks the stop while an executable pending task exists (all dependencies done), names the next task, and allows the stop when: nothing executable remains, the queue is unreadable, no progress was made since the last block, or only blocked tasks remain. A "done" task without verification evidence blocks the stop. Claude Code's own cap (8 consecutive continuations, `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`) also applies. Ctrl+C / Escape are not affected by Stop hooks.
- D-19 Limits: the hook verifies the queue's bookkeeping, not the quality of the work. Evidence is still reviewed by the agent and the owner.

## Decisions taken during the remaining queue (2026-11-14)
- D-20 Multipart allow-list (`src/lib/api.ts`, `isMultipartAllowed`): multipart bodies are accepted only on paths `imports`, `images`, `image` (category/brand/banner uploads), `uploads` and `bulk-preview` (customer SKU,QTY file, preview only). Before this fix the singular `/image` upload routes and the customer Excel upload returned 400. Every handler still checks its permission first; covered by `tests/integration/media-merchandising.test.ts`.
- D-21 Quick order has its own page `/quick-order` (rows of SKU and qty, same server preview and add-to-cart as bulk paste). This supersedes D-10, which linked quick order to the cart. The header and home "Start an order" now point to `/quick-order`.
- D-22 Excel/CSV upload is the second card on `/bulk-order`. Eligibility is the existing `orderingGate` (active, approved customers); there is no separate eligibility flag in the schema.
- D-23 Auth pages (login, register, verify, recover) share `AuthShell`. Forms and API endpoints are unchanged; registration shows a 3-step indicator.
- D-24 Customer account pages share `AccountShell` (breadcrumb and side navigation). The overview tiles show only real database counts.
- D-25 Admin navigation is grouped (Operations, Catalogue, Customers, Content & reports, Administration) with native `<details>` groups. Links are still filtered by permission; pages still enforce it.
- D-26 Authenticated development states: scripts/auth-states.mjs logs each role in once and stores the session cookie in storage/auth/<role>.json (gitignored via storage/). ui-review-auth.mjs reuses it. Rate limits are not bypassed; a 429 is reported, not retried in a loop.
