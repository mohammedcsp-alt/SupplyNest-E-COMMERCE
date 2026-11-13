'use client';

/** Opens the browser print dialog. "Save as PDF" is done by the browser's print destination; no server PDF is produced. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
