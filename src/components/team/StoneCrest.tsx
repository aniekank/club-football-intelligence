/**
 * The club crest, carved into cracked stone.
 *
 * A deliberate nod to the cover of The LOX's "We Are the Streets" — faces set
 * into fractured rock — used once, on the club header, where the crest is
 * already the largest thing on the page and is otherwise a small flat PNG.
 *
 * ── How it is built ────────────────────────────────────────────────────────
 * Entirely with SVG filters, no image assets and no network cost.
 * `feTurbulence` generates fractal noise; `feDisplacementMap` pushes the
 * crest's own pixels around by that noise so its edges fracture;
 * `feDiffuseLighting` over the same noise raises a granite surface lit from the
 * upper left. The crest is then laid back over its own relief so the club's
 * colours survive — a pure lighting pass renders every badge as grey rock,
 * which is striking once and useless for telling clubs apart.
 *
 * ── Why it is restrained ───────────────────────────────────────────────────
 * Displacement is small and the lighting soft. A heavier hand genuinely
 * destroys the crest, and a crest that cannot be recognised has failed at the
 * only job it has. This should read as texture at a glance and resolve into the
 * real badge when looked at.
 *
 * Nothing here animates, so reduced motion is not a factor. The whole treatment
 * is dropped under `forced-colors`, where a lighting pass would fight the
 * reader's own palette — see `.stone-crest` in globals.css.
 */
export function StoneCrest({
  url, code, name, size = 88,
}: {
  url: string | null;
  code: string;
  name: string;
  size?: number;
}) {
  // Unique per club: two crests on one page would otherwise share filter ids,
  // and the second would silently reuse the first's noise.
  const uid = `stone-${code.toLowerCase().replace(/[^a-z0-9]/g, '') || 'x'}`;

  if (!url) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-surface-2 font-display text-2xl font-bold text-ink-muted"
        style={{ width: size, height: size }}
      >
        {code.slice(0, 3)}
      </span>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${name} crest`}
      className="stone-crest block shrink-0"
      style={{ width: size, height: size }}
    >
      <defs>
        {/* The rock: fractal noise lit from the upper left. */}
        <filter id={`${uid}-rock`} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.055"
            numOctaves="4"
            seed="7"
            result="noise"
          />
          <feDiffuseLighting
            in="noise"
            surfaceScale="3.2"
            diffuseConstant="1.05"
            lightingColor="#b9b2ab"
            result="relief"
          >
            <feDistantLight azimuth="235" elevation="58" />
          </feDiffuseLighting>
        </filter>

        {/* The fracture: the crest displaced by the same class of noise. */}
        <filter id={`${uid}-crack`} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.03"
            numOctaves="3"
            seed="11"
            result="warp"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="warp"
            scale="2.6"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Fissures: straight strokes pushed off-line by noise, which is how a
            crack actually looks — roughly directional, never smooth. */}
        <filter id={`${uid}-fissure`} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="4" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="B" />
        </filter>

        <clipPath id={`${uid}-clip`}>
          <rect x="0" y="0" width="100" height="100" rx="10" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid}-clip)`}>
        {/* Stone slab behind the badge. */}
        <rect width="100" height="100" fill="var(--surface-2)" />
        <rect width="100" height="100" filter={`url(#${uid}-rock)`} opacity="0.5" />

        {/* The crest, fractured, then laid back over its own relief at partial
            strength so club colour is never lost to the rock. */}
        <image
          href={url}
          x="14"
          y="14"
          width="72"
          height="72"
          preserveAspectRatio="xMidYMid meet"
          filter={`url(#${uid}-crack)`}
          opacity="0.85"
        />
        <image
          href={url}
          x="14"
          y="14"
          width="72"
          height="72"
          preserveAspectRatio="xMidYMid meet"
          opacity="0.6"
        />

        {/* The break. Dark fissure with a lit edge just below it, which is what
            sells depth — a crack is a shadow with a highlight on its lower lip,
            not a black line. */}
        <g filter={`url(#${uid}-fissure)`} fill="none" strokeLinecap="round">
          <g stroke="#000" strokeOpacity="0.55" strokeWidth="2.4">
            <path d="M-6 34 L44 30 L70 44 L106 38" />
            <path d="M-6 72 L30 66 L58 78 L106 70" />
            <path d="M52 -6 L46 32 L58 62 L50 106" />
          </g>
          <g stroke="#fff" strokeOpacity="0.16" strokeWidth="1" transform="translate(0,1.6)">
            <path d="M-6 34 L44 30 L70 44 L106 38" />
            <path d="M-6 72 L30 66 L58 78 L106 70" />
            <path d="M52 -6 L46 32 L58 62 L50 106" />
          </g>
        </g>

        {/* A carved lip — light catching the edge of the slab. */}
        <rect
          width="100"
          height="100"
          fill="none"
          stroke="var(--edge-highlight)"
          strokeWidth="1.5"
          rx="10"
        />
      </g>
    </svg>
  );
}
