'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api';

/** Shape returned by /api/v1/catalog/search (no price or stock quantity unless the viewer is an approved customer). */
type Suggestion = { id: string; sku: string; nameAr: string; nameEn: string; model?: string | null };

/**
 * Header search with instant suggestions (UX-001). Suggestions come from /api/v1/catalog/search, which applies the
 * same visibility rules as the catalog: no prices and no stock quantities for anonymous or unapproved viewers.
 */
export function HeaderSearch({ locale, placeholder, buttonLabel }: { locale: 'ar' | 'en'; placeholder: string; buttonLabel: string }) {
  const ar = locale === 'ar';
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      return;
    }
    const handle = setTimeout(async () => {
      const res = await api<Suggestion[]>(`/api/v1/catalog/search?q=${encodeURIComponent(term)}`);
      if (res.ok && Array.isArray(res.data)) setItems(res.data);
    }, 180);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="header-search" ref={boxRef} role="search">
      <form method="get" action="/catalog" onSubmit={() => setOpen(false)}>
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(items.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(-1, i - 1));
            } else if (e.key === 'Escape') {
              setOpen(false);
            } else if (e.key === 'Enter' && active >= 0 && items[active]) {
              e.preventDefault();
              window.location.href = `/products/${encodeURIComponent(items[active].sku)}`;
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open && items.length > 0}
          autoComplete="off"
          maxLength={100}
        />
        <button type="submit">{buttonLabel}</button>
      </form>
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="search-suggest">
          {items.map((it, i) => {
            const name = ar ? it.nameAr || it.nameEn : it.nameEn || it.nameAr;
            return (
              <li key={it.id} role="option" aria-selected={i === active}>
                <Link href={`/products/${encodeURIComponent(it.sku)}`} className={i === active ? 'is-active' : undefined}>
                  <span className="s-name">{name}</span>
                  <span className="s-meta" dir="ltr">
                    {it.sku}
                    {it.model ? ` · ${it.model}` : ''}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
