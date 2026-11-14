'use client';

import type { ReactNode } from 'react';

/** Submits the enclosing GET form when the wrapped control changes (used for sort). Works without JS as a plain form too. */
export function AutoSubmitSelect({ children, name, defaultValue, id, label }: { children: ReactNode; name: string; defaultValue: string; id: string; label: string }) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} name={name} defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {children}
      </select>
    </>
  );
}
