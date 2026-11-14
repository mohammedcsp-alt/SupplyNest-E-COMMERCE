'use client';

/** Mobile filter drawer toggle: adds `filter-drawer-open` to <body>; the panel is styled in globals.css. */
export function FilterDrawerToggle({ label, closeLabel }: { label: string; closeLabel: string }) {
  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const open = document.body.classList.toggle('filter-drawer-open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.textContent = open ? closeLabel : label;
  }
  return (
    <button type="button" className="btn btn-small filter-toggle" aria-expanded="false" aria-controls="filter-panel" onClick={toggle}>
      {label}
    </button>
  );
}

/** Closes the drawer when the backdrop is tapped (no-op on desktop, where the backdrop is hidden). */
export function FilterDrawerBackdrop() {
  return (
    <div
      className="drawer-backdrop"
      aria-hidden="true"
      onClick={() => {
        document.body.classList.remove('filter-drawer-open');
      }}
    />
  );
}
