/**
 * Owner-configurable storefront identity (V3.3, decision D-07 in IMPLEMENTATION_DECISIONS.md).
 *
 * Every value has a neutral default and can be overridden with an environment variable, so the owner can change
 * the company name, logo, announcement and support contacts without editing components. Nothing here is a secret.
 * Brand colours live in src/app/globals.css (:root --brand, --accent).
 */

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

export const storefront = {
  companyNameEn: env('STORE_NAME_EN', 'SupplyNest'),
  companyNameAr: env('STORE_NAME_AR', 'سابلاي نست'),
  /** Optional logo path under /public. When empty, a monogram is shown. */
  logoPath: env('STORE_LOGO_PATH', ''),
  announcementEn: env('STORE_ANNOUNCEMENT_EN', 'Wholesale accounts: register once, prices are shown after approval.'),
  announcementAr: env('STORE_ANNOUNCEMENT_AR', 'حسابات الجملة: سجّل مرة واحدة، وتظهر الأسعار بعد الموافقة.'),
  /** Set STORE_SHOW_ANNOUNCEMENT=0 to hide the announcement line. */
  showAnnouncement: env('STORE_SHOW_ANNOUNCEMENT', '1') !== '0',
  supportPhone: env('STORE_SUPPORT_PHONE', ''),
  supportEmail: env('STORE_SUPPORT_EMAIL', ''),
} as const;

/** Development demonstration category images (public/demo/categories). Real categories show a letter tile unless listed. */
export const DEMO_CATEGORY_IMAGE_SLUGS: readonly string[] = [
  'dev-apparel',
  'dev-batteries',
  'dev-hand-tools',
  'dev-hardware',
  'dev-mobile-spare-parts',
  'dev-office',
  'dev-screens',
  'dev-tshirts',
];
export function categoryImageSrc(slug: string): string | null {
  return DEMO_CATEGORY_IMAGE_SLUGS.includes(slug) ? `/demo/categories/${slug}.png` : null;
}
