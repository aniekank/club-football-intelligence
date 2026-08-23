import type { Metadata, Viewport } from 'next';
import { Fraunces, Archivo, JetBrains_Mono } from 'next/font/google';
import { themeScript } from '@/components/layout/ThemeToggle';
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

export const metadata: Metadata = {
  title: {
    default: 'Club Football Intelligence',
    template: '%s · Club Football Intelligence',
  },
  description:
    'Cross-league club football analytics: live matches, league tables, Monte Carlo season odds, xG, and a model-vs-market betting edge.',
  applicationName: 'Club Football Intelligence',
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
      </head>
      <body>
        <a href="#main" className="sr-only-focusable absolute left-4 top-4 z-toast rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
