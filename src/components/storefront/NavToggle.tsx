'use client';

/** Mobile/tablet menu toggle: flips `nav-open` on the nearest site header (CSS in globals.css). */
export function NavToggle({ labelOpen, labelClose }: { labelOpen: string; labelClose: string }) {
  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const header = e.currentTarget.closest('.site-header');
    if (!header) return;
    const open = header.classList.toggle('nav-open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.textContent = open ? labelClose : labelOpen;
  }
  return (
    <button type="button" className="btn btn-small mobile-nav-toggle" aria-expanded="false" aria-controls="category-bar" onClick={toggle}>
      {labelOpen}
    </button>
  );
}
