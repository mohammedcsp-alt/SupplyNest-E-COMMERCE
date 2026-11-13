import type { Locale } from '@/lib/i18n';

/** Plain link to the locale route (no client JS needed). The route sets the cookie and redirects back. */
export function LanguageToggle({ current, label }: { current: Locale; label: string }) {
  const target = current === 'ar' ? 'en' : 'ar';
  return (
    <a href={`/api/v1/locale?set=${target}`} className="btn btn-small" hrefLang={target} lang={target}>
      {label}
    </a>
  );
}
