'use client';

import { useState } from 'react';

export function LogoutButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  async function onClick() {
    setBusy(true);
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
      });
    } finally {
      window.location.assign('/');
    }
  }
  return (
    <button type="button" className="btn btn-small" onClick={onClick} disabled={busy}>
      {label}
    </button>
  );
}
