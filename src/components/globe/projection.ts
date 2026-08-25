/**
 * Orthographic projection — the globe, in about sixty lines of arithmetic.
 *
 * ── Why this is not a library ──────────────────────────────────────────────
 * A globe is the one chart everybody reaches for a dependency to draw, and it
 * is also one of the few that is genuinely small: an orthographic projection is
 * three trigonometric identities, and flying between two points on a sphere is
 * one more. Everything else in this product is drawn from arithmetic it owns,
 * and there is no reason for the map to be the exception.
 *
 * ── Orthographic, specifically ─────────────────────────────────────────────
 * It is the projection that looks like a photograph of a planet: parallel rays,
 * no perspective distortion, and a hard horizon at ninety degrees from centre.
 * That horizon is what makes it read as a SPHERE rather than a circle with a
 * map in it — half the world is genuinely not there, and the eye knows it.
 */

export interface Rotation {
  /** Degrees. The point the globe is facing. */
  lon: number;
  lat: number;
}

const RAD = Math.PI / 180;

/**
 * The horizon belongs to the far side.
 *
 * `z` is the cosine of the angular distance from the centre of the view, so a
 * point exactly ninety degrees away should give zero — and gives 6e-17,
 * because that is what `Math.cos(Math.PI / 2)` is in binary floating point. A
 * bare `z > 0` therefore calls the exact horizon VISIBLE, which is a decision
 * made by rounding error rather than by anyone. Anything within a rounding
 * error of the limb is treated as behind it.
 */
const HORIZON_EPSILON = 1e-12;

export interface Projected {
  x: number;
  y: number;
  /**
   * True on the near hemisphere.
   *
   * The far side projects onto exactly the same disc as the near side, so
   * without this every coastline would be drawn twice, once mirrored — which
   * looks less like a globe than like a fault.
   */
  visible: boolean;
}

/**
 * Project a point onto the disc.
 *
 * `z` is the component pointing at the viewer; it is the whole visibility test
 * and it is also, not coincidentally, the cosine of the angular distance from
 * the centre of the view.
 */
export function project(
  lon: number, lat: number,
  centre: Rotation,
  radius: number, cx: number, cy: number,
): Projected {
  const dLon = (lon - centre.lon) * RAD;
  const phi = lat * RAD;
  const phi0 = centre.lat * RAD;

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosPhi0 = Math.cos(phi0);
  const sinPhi0 = Math.sin(phi0);
  const cosDLon = Math.cos(dLon);

  const x = cosPhi * Math.sin(dLon);
  const y = cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosDLon;
  const z = sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosDLon;

  return {
    x: cx + radius * x,
    // Screen y grows downward and latitude grows upward.
    y: cy - radius * y,
    visible: z > HORIZON_EPSILON,
  };
}

/** Radians between two points on the sphere — how far the camera must travel. */
export function angularDistance(a: Rotation, b: Rotation): number {
  const phi1 = a.lat * RAD;
  const phi2 = b.lat * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const cos = Math.sin(phi1) * Math.sin(phi2)
    + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLon);
  // Guard the domain: accumulated float error puts this a hair outside [-1, 1]
  // for identical points, and Math.acos returns NaN rather than 0.
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

/**
 * Fly between two points along the great circle.
 *
 * Interpolating longitude and latitude separately is the obvious thing and it
 * is wrong in a way that is immediately visible: the camera swings up toward
 * the pole on any long east-west move, and crossing the antimeridian sends it
 * the whole way round the planet the wrong way. Spherical interpolation moves
 * along the shortest path on the surface, which is what "flies there" means.
 */
export function slerp(a: Rotation, b: Rotation, t: number): Rotation {
  const omega = angularDistance(a, b);
  // Antipodal or identical: no unique shortest path, and no movement to make.
  if (omega < 1e-9) return { ...b };

  const sinOmega = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / sinOmega;
  const wb = Math.sin(t * omega) / sinOmega;

  const av = unit(a);
  const bv = unit(b);
  const x = wa * av[0] + wb * bv[0];
  const y = wa * av[1] + wb * bv[1];
  const z = wa * av[2] + wb * bv[2];

  return {
    lon: Math.atan2(y, x) / RAD,
    lat: Math.asin(Math.min(1, Math.max(-1, z / Math.hypot(x, y, z)))) / RAD,
  };
}

function unit({ lon, lat }: Rotation): [number, number, number] {
  const phi = lat * RAD;
  const lambda = lon * RAD;
  return [
    Math.cos(phi) * Math.cos(lambda),
    Math.cos(phi) * Math.sin(lambda),
    Math.sin(phi),
  ];
}

/**
 * Meridians and parallels, generated rather than stored.
 *
 * A graticule is a rule, not data — every thirty degrees, sampled finely enough
 * that a curve on the sphere does not read as a chain of straight lines.
 */
export function graticule(step = 30, sample = 5): number[][] {
  const lines: number[][] = [];

  for (let lon = -180; lon < 180; lon += step) {
    const line: number[] = [];
    for (let lat = -90; lat <= 90; lat += sample) line.push(lon, lat);
    lines.push(line);
  }

  for (let lat = -60; lat <= 60; lat += step) {
    const line: number[] = [];
    for (let lon = -180; lon <= 180; lon += sample) line.push(lon, lat);
    lines.push(line);
  }

  return lines;
}
