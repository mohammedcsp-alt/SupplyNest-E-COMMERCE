'use client';

// Segment-level error boundary: a page failed while the layout still rendered (for example, a query timed out).
// Shows a friendly message only. The technical error is logged on the server and never shown to the visitor.

export default function SegmentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: 12 }}>This page is temporarily unavailable</h1>
      <p style={{ lineHeight: 1.6, marginBottom: 8 }}>
        Please try again in a moment. Your data is safe.
      </p>
      <p lang="ar" dir="rtl" style={{ lineHeight: 1.8, marginBottom: 20 }}>
        هذه الصفحة غير متاحة مؤقتًا. يرجى المحاولة مرة أخرى بعد لحظات. بياناتك محفوظة.
      </p>
      <button type="button" className="btn" onClick={() => reset()}>
        Try again / حاول مرة أخرى
      </button>
    </div>
  );
}
