import { ImageResponse } from 'next/og';

/**
 * The social card.
 *
 * A link with no card is the difference between something that looks shipped
 * and something that looks like a localhost URL someone pasted. It is also the
 * only part of the product most people will ever see, since a shared link is
 * seen by everyone in the thread and opened by a few.
 *
 * Generated rather than a static asset so it stays in step with the palette,
 * and deliberately typographic: a screenshot of a table at card size is an
 * unreadable grey smear, while the wordmark and a plain claim survive being
 * shown at 200px wide in a chat app.
 */
export const runtime = 'edge';
export const alt = 'Club Football Intelligence — cross-league club football analytics';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0a0d12',
          padding: 72,
          color: '#f2f5f8',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 6, color: '#6b7887' }}>
            TASK ENTERPRISES
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 14 }}>
            <div style={{ fontSize: 68, fontWeight: 700 }}>Club Football</div>
            <div style={{ fontSize: 30, letterSpacing: 5, color: '#c8f751' }}>INTELLIGENCE</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 40, lineHeight: 1.25, maxWidth: 940 }}>
            Ratings, projections and market comparison across 43 competitions —
            on one scale.
          </div>
          <div style={{ display: 'flex', gap: 28, fontSize: 22, color: '#a7b2c0' }}>
            <div style={{ display: 'flex' }}>Live tables</div>
            <div style={{ display: 'flex', color: '#2a3441' }}>·</div>
            <div style={{ display: 'flex' }}>Monte Carlo projections</div>
            <div style={{ display: 'flex', color: '#2a3441' }}>·</div>
            <div style={{ display: 'flex' }}>World rankings</div>
          </div>
        </div>

        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
          {['#c8f751', '#3f91e6', '#e05f41', '#14a98b'].map((c) => (
            <div key={c} style={{ display: 'flex', flex: 1, background: c }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
