/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Build output directory, overridable per-invocation.
   *
   * `next build` and `next dev` share `.next` by default, so a verification
   * build run while the dev server is up overwrites the chunks that server is
   * still referencing. The site keeps serving HTML, the stylesheet 404s, and
   * every page renders as unstyled markup — which looks like a catastrophic CSS
   * regression rather than a local collision. `npm run build:verify` writes
   * elsewhere so the two cannot collide; deploys use the default.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Runs src/instrumentation.ts at server start (snapshot bootstrap).
    instrumentationHook: true,
  },
  // NOTE: deliberately NO `images.remotePatterns`. Enabling the Image Optimizer
  // for a remote host exposes GHSA-9g9p-9gw9-jx7f (DoS via crafted optimizer
  // requests), which is only patched in Next 16 — a semver-major we are not
  // taking on a Next 14 target. Club crests are small static PNGs where the
  // optimizer earns almost nothing, so they render through a plain <img> with
  // width/height set to reserve layout. See docs/DECISIONS.md.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Framing: this site, and Motion's in-car browser (the Tesla screen on /tapes opens links in place). Everyone
          // else is still refused. frame-ancestors replaces the old X-Frame-Options: SAMEORIGIN.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://motion-page-alpha.taskenterprises.workers.dev https://motionpage.link https://*.motionpage.link" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
