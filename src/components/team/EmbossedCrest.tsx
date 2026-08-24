/**
 * The club crest as bas-relief — the mark molded out of the surface.
 *
 * Ported from the NFL Intelligence `EmbossedMark`, and the port matters more
 * than it sounds: the first attempt here invented its own effect (a coloured
 * badge sitting on a cracked granite rectangle) and read as a sticker on a wall
 * rather than something carved. Two differences do the work.
 *
 * ── The relief is the MARK, not a slab behind it ───────────────────────────
 * The lighting is composited back through `SourceAlpha`, so it exists only
 * where the crest itself does. There is no rectangle. The crest is seen purely
 * through cream edge-lighting and never through its own colours — which is why
 * it reads as material rather than as an image with an effect applied.
 *
 * ── Luminance has to be moved into alpha ───────────────────────────────────
 * Lighting filters read ONLY the alpha channel as a height map. A crest is a
 * flat silhouette in alpha, so lighting it directly raises the outline and
 * loses everything inside — the NFL baker's note for this exact line reads
 * "without this the marks embossed as featureless slabs, outline only, faces
 * and letters lost". `feColorMatrix` projects luminance into alpha, and the
 * height map is a blend of the blurred silhouette (shape) and that detail.
 *
 * ── Live filter rather than baked PNGs ─────────────────────────────────────
 * NFL bakes these ahead of time because live filters proved flaky there and
 * lighting differs by engine. That is not portable here: this product carries
 * thousands of clubs across thirty-six competitions, with crests served from a
 * remote CDN, so there is no fixed set to bake. Same chain, computed live, with
 * a plain crest still rendered alongside for identification — if the filter
 * ever fails to apply, the reader loses an effect, not the badge.
 */
export function EmbossedCrest({
  url, size = 340, className, opacity = 0.5,
}: {
  url: string | null;
  size?: number;
  className?: string;
  opacity?: number;
}) {
  if (!url) return null;

  // Unique per URL: two marks on one page would otherwise share a filter id and
  // the second would silently reuse the first's height map.
  const uid = `emb-${url.replace(/\D/g, '').slice(-8) || 'x'}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      className={['emboss-mark', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, opacity }}
    >
      <defs>
        <filter
          id={uid}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.0" result="shape" />

          {/* Interior detail: luminance projected into alpha, because the
              lighting filters below read only alpha as the height map. */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.299 0.587 0.114 0 0"
            result="lumA"
          />
          <feGaussianBlur in="lumA" stdDeviation="0.5" result="detail" />
          <feComposite
            in="shape"
            in2="detail"
            operator="arithmetic"
            k1="0"
            k2="0.45"
            k3="0.55"
            k4="0"
            result="height"
          />

          <feDiffuseLighting
            in="height"
            surfaceScale="9"
            diffuseConstant="1"
            lightingColor="#f4e9d0"
            result="d"
          >
            <feDistantLight azimuth="230" elevation="42" />
          </feDiffuseLighting>
          <feSpecularLighting
            in="height"
            surfaceScale="9"
            specularConstant="0.35"
            specularExponent="14"
            lightingColor="#fdf6e6"
            result="s"
          >
            <feDistantLight azimuth="230" elevation="42" />
          </feSpecularLighting>

          <feComposite in="s" in2="d" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit" />
          {/* Clipped to the crest's own silhouette — this is what makes it a
              carved mark instead of a lit rectangle. */}
          <feComposite in="lit" in2="SourceAlpha" operator="in" result="relief" />
          <feDropShadow in="relief" dx="0.7" dy="1.1" stdDeviation="1.4" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>

      <image href={url} width="100" height="100" preserveAspectRatio="xMidYMid meet" filter={`url(#${uid})`} />
    </svg>
  );
}
