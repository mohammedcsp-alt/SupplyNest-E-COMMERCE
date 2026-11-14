'use client';

import { VIEW_COOKIE, type CatalogView } from './catalog-view';

/** Grid / list / compact switcher. The choice is remembered in a 1-year cookie (no personal data). */
export function ViewSwitch({
  current,
  hrefs,
  labels,
}: {
  current: CatalogView;
  hrefs: Record<CatalogView, string>;
  labels: Record<CatalogView, string> & { label: string };
}) {
  function remember(view: CatalogView) {
    document.cookie = `${VIEW_COOKIE}=${view}; path=/; max-age=31536000; samesite=lax`;
  }
  const views: CatalogView[] = ['grid', 'list', 'compact'];
  return (
    <nav className="view-switch" aria-label={labels.label}>
      {views.map((v) => (
        <a key={v} href={hrefs[v]} aria-current={current === v ? 'true' : undefined} onClick={() => remember(v)}>
          {labels[v]}
        </a>
      ))}
    </nav>
  );
}
