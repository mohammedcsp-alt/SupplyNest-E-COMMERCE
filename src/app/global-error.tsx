'use client';

// Shown when the root layout itself fails (for example, the database is unreachable while the layout loads).
// It must render its own <html> and <body>, and it deliberately shows no error text: the real error is logged on the
// server with a digest, so visitors never see Prisma messages, connection details or stack traces.

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f5f5f2',
          color: '#1d1d1b',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif',
        }}
      >
        <main style={{ maxWidth: 560, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 12 }}>The site is temporarily unavailable</h1>
          <p style={{ lineHeight: 1.6, marginBottom: 16 }}>
            We are restoring the service. Your orders and account data are safe. Please try again in a few minutes.
          </p>
          <p lang="ar" dir="rtl" style={{ lineHeight: 1.8, marginBottom: 24 }}>
            الموقع غير متاح مؤقتًا. نعمل على استعادة الخدمة، وبياناتك وطلباتك محفوظة. يرجى المحاولة مرة أخرى بعد بضع دقائق.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '10px 22px',
              borderRadius: 6,
              border: 'none',
              background: '#1d4f91',
              color: '#fff',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Try again / حاول مرة أخرى
          </button>
        </main>
      </body>
    </html>
  );
}
