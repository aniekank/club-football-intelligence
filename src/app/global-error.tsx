'use client';

/**
 * The last resort, for a failure in the root layout itself.
 *
 * This one replaces <html> and <body>, so it cannot use the app's fonts,
 * tokens or components — none of them have mounted. Everything here is inline
 * and self-contained on purpose: a fallback that depends on the thing that
 * broke is not a fallback.
 */
export default function GlobalError({
  error, reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0a0d12',
          color: '#f2f5f8',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: '36rem' }}>
          <p style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7887', margin: 0 }}>
            Club Football Intelligence
          </p>
          <h1 style={{ fontSize: '1.75rem', lineHeight: 1.2, margin: '0.5rem 0 0' }}>
            The application failed to start
          </h1>
          <p style={{ color: '#a7b2c0', lineHeight: 1.6 }}>
            This is a failure in the page shell itself rather than in any one
            section, so there is nothing here to fall back to.
          </p>
          {error.digest ? (
            <p style={{ color: '#6b7887', fontSize: '0.75rem' }}>Reference {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '4px',
              border: 0, background: '#c8f751', color: '#0a0d12',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
