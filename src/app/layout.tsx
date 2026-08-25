import type { Metadata, Viewport } from 'next';
import { Fraunces, Archivo, JetBrains_Mono } from 'next/font/google';
import { themeScript } from '@/components/layout/ThemeToggle';
import { railScript } from '@/components/layout/Rail';
import { IntroSplash, introScript } from '@/components/intro/IntroSplash';
import './globals.css';

/**
 * Three typefaces, three jobs.
 *
 *  Fraunces      — display serif. Editorial voice for headlines and hero
 *                  scorelines. Variable, with the `SOFT`/`WONK` axes dialled
 *                  back so it stays authoritative rather than whimsical.
 *  Archivo       — UI grotesk. Dense, slightly technical, excellent at 11-14px
 *                  where most of a football table lives.
 *  JetBrains Mono— every figure. Tall x-height and a slashed zero, so a column
 *                  of xG values reads cleanly at 11px.
 *
 * All three are self-hosted by next/font (no external request at runtime, which
 * also keeps the app inside a strict CSP) and declared `display: swap` against
 * the real fallback stacks in tokens.css.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  axes: ['SOFT', 'WONK', 'opsz'],
});

const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3010';
const DESCRIPTION =
  'Cross-league club football analytics: live matches, league tables, Monte Carlo season odds, xG, and a model-vs-market betting edge.';

export const metadata: Metadata = {
  /**
   * `metadataBase` is what makes the social card resolve.
   *
   * Without it Next emits a RELATIVE og:image URL, and every crawler that
   * matters — Slack, iMessage, X, LinkedIn — silently drops it. The card then
   * exists, renders correctly when visited directly, and never once appears in
   * the place it was built for.
   */
  metadataBase: new URL(SITE),
  title: {
    default: 'Club Football Intelligence',
    template: '%s · Club Football Intelligence',
  },
  description: DESCRIPTION,
  applicationName: 'Club Football Intelligence',
  authors: [{ name: 'Task Enterprises' }],
  openGraph: {
    type: 'website',
    siteName: 'Club Football Intelligence',
    title: 'Club Football Intelligence',
    description: DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Club Football Intelligence',
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    // A crawler that renders a stale cached card is worse than one that does
    // not render a card, so previews are allowed at full size.
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0d12' },
    { media: '(prefers-color-scheme: light)', color: '#f4f4f1' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${archivo.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint — without it every
            navigation flashes the OS theme before snapping to the chosen one. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Same job for the sidebar: applied after hydration, the reader would
            watch a 22rem column shut itself on every navigation. */}
        <script dangerouslySetInnerHTML={{ __html: railScript }} />
        {/* Decides whether the intro plays, and covers the page if it does —
            before the first frame, so the app is never briefly visible behind
            its own introduction. */}
        <script dangerouslySetInnerHTML={{ __html: introScript }} />
      </head>
      <body>
        <a href="#main" className="sr-only-focusable absolute left-4 top-4 z-toast rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
          Skip to content
        </a>
        {children}
        <IntroSplash />
      </body>
    </html>
  );
}
