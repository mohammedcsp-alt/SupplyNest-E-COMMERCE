# Final delivery report — B2B-STORE V1 (local build)

## 1. Local application
- URL: **http://127.0.0.1:3200** (development server, verified serving pages and APIs in this pass).
- Not deployed. Not connected to any WMS system, port, database or credential.

## 2. How to inspect it manually
1. Start the database container: `docker start b2b-store-postgres` (or run `scripts/start-local.ps1`).
2. From `B2B-STORE/`: `npm run dev`, then open http://127.0.0.1:3200.
3. Sign in with a development account. Accounts and the shared synthetic password are in the gitignored file
   **`DEV-CREDENTIALS.local.md`**, which the seed writes. Do not share it.
   - Approved customer with prices: the level-A account in that file.
   - Manager (administration area): the manager account in that file.
   - Other roles (picker, checker, packer, accountant, content editor, report viewer): listed in the same file.
4. Suggested walkthrough:
   - Storefront: browse the catalog as a visitor (no prices), then as the approved customer (prices appear).
   - Customer: add an item, review the checkout quote, confirm, then request cancellation or reorder from the order page.
   - Administration: catalog (create a SKU, change a price, upload an image), imports (preview then commit), inventory
     and reservations, orders (approve or reject a cancellation), CMS, reports, backup.
   - Fulfillment and accounting: assign picker and checker, count blind, resolve a discrepancy, pack, hand over; record a
     collection, a remittance and an allocation under the NET or GROSS courier method.

## 3. Verified results (this pass)
| Check | Result |
|---|---|
| Type check | PASS |
| Vitest: unit, integration, concurrency | PASS — 30 files, 231 tests |
| Playwright: API security, hardening and reports | PASS — 37 tests |
| Playwright: browser (admin, customer, fulfillment, accounting, responsive) | PASS — 68 tests (both projects: Arabic RTL desktop, English LTR mobile) |
| Production build | PASS |
| Production server smoke (port 3220) | PASS for pages and GET API; TRACE returns a framework 500 (see §5) |
| Backup and restore (independent) | PASS — API run, dump checksum recomputed, manual restore compared with development counts |
| Controlled concurrency | PASS — checkout, idempotency, reservations, collections, allocations (up to 20 simultaneous callers) |

Details: `TEST_REPORT.md`.

## 4. Completed features
- Customer storefront (Arabic RTL, English LTR): catalog with filters, product pages, cart, bulk ordering from paste or file,
  checkout with quote and consent, orders, edits before preparation, cancellation requests, reorder, addresses, favourites,
  notifications, password recovery.
- Administration: customers and approvals, categories and attributes, brands and models (optional), SKUs with prices and
  images, product and price imports with freshness gates, inventory and alerts, reservations, orders, shipping rules, roles
  and staff, audit, CMS pages and banners, reports, settings, backup and restore test.
- Temporary fulfillment module: job assignment, independent checking, discrepancy hold and resolution, packing, handover.
- Temporary accounting module: invoices with revisions, couriers and effective-dated agreements (both settlement methods),
  collections, remittances, allocations, fee payments, adjustments and reversals, statements, reconciliation, reports.
- Controls: server-side permission checks on every route, audit rows in the same transaction, append-only audit log,
  immutable financial rows, idempotent writes, non-negative stock, rate limits, same-origin checks.

## 5. Failed or open items
- **TRACE returns a framework 500 error page.** The runtime rejects TRACE before application code runs. A reverse proxy
  must refuse it with 405 in any deployment. The production body is generic; the development body shows detail.
- **Not verified:** load beyond 20 simultaneous callers; soak tests; independent security review; printing and PDF in a
  browser; fulfillment and accounting forms in a browser; visual regression; physical devices.

## 6. Remaining limitations (summary; full list in KNOWN_LIMITATIONS.md)
- No SMS or email provider; OTP is a development mock only.
- WMS integration is disabled and documented only.
- Shipping fee values and courier identities are placeholders; the owner must supply real values.
- Test-generated orders, shipments and immutable financial rows remain in the development database.
- Development password is in pushed history; rotation recommended.
- Local HTTP only; no TLS.

## 7. Decisions needed from the owner
1. Shipping fee amounts per governorate; courier names and agreements.
2. SMS provider and credentials, when production OTP is needed.
3. Whether to rebuild the development database (removes test financial rows).
4. Whether to rotate the synthetic development password.
5. Whether to push the latest local commits to GitHub. This needs separate explicit authorization; the earlier approval
   covered only the earlier commit.
6. Confirmation of cancellation and merge rules after preparation starts (IMPLEMENTATION_DECISIONS section B).

---

## التقرير النهائي للتسليم (ملخص عربي)

**التشغيل المحلي:** http://127.0.0.1:3200 — غير منشور وغير متصل بأي نظام WMS.

**بيانات الدخول:** موجودة في الملف المحلي غير المرفوع `DEV-CREDENTIALS.local.md` الذي تكتبه بذرة البيانات. لا تُشاركه.

**النتائج المتحقق منها:** فحص الأنواع ينجح؛ 231 اختبار وحدات وتكامل وتزامن ينجح؛ 105 اختبارات متصفح وواجهة برمجية ينجح؛ بناء الإنتاج ينجح؛ النسخ الاحتياطي والاستعادة يُعاد التحقق منهما بشكل مستقل؛ الاختبارات المتزامنة تنجح حتى 20 طلبًا متزامنًا.

**الإخفاقات والقيود المفتوحة:** أسلوب الطلب TRACE يعيد خطأ 500 من إطار العمل ويجب أن يرفضه الوكيل العكسي (reverse proxy)؛ لم يُجرَ اختبار أحمال أعلى من 20 طلبًا متزامنًا، ولا مراجعة أمنية مستقلة، ولا اختبار للطباعة وPDF في المتصفح.

**القرارات المطلوبة من المالك:** قيم رسوم التوصيل وشركات التوصيل، ومزود الرسائل النصية، وإعادة بناء قاعدة التطوير، وتدوير كلمة مرور التطوير، والدفع إلى GitHub بتفويض منفصل.
