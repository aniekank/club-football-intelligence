/**
 * Turns a TopoJSON world into a compact coordinate table this product can draw.
 *
 * ── Why a build step and not a dependency ──────────────────────────────────
 * The runtime here has five dependencies and no charting library; every chart
 * is drawn from arithmetic this repo owns. A globe is the same kind of object,
 * and pulling in d3-geo plus topojson-client plus a world atlas to draw one
 * would be the first time a visual in this product was assembled rather than
 * built. So the decoding happens ONCE, here, and what ships is a plain array of
 * numbers.
 *
 * ── What it emits ──────────────────────────────────────────────────────────
 * One flat `[lon, lat, lon, lat, …]` array per ring. Flat because the globe
 * redraws every frame and walking a flat Float64-shaped array is the cheapest
 * thing a canvas loop can do; rings rather than countries because the renderer
 * fills and strokes each one identically and never needs to know which country
 * it is.
 *
 * Coordinates are rounded to a tenth of a degree. On a 440px globe one degree
 * of arc is under 4px, so a tenth is a third of a pixel — below what a screen
 * can show, and it takes the payload down by more than half.
 *
 * Usage: node scripts/build-world.mjs <path-to-countries-110m.json>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-world.mjs <countries-110m.json>');
  process.exit(1);
}

const topo = JSON.parse(readFileSync(src, 'utf8'));
const { scale, translate } = topo.transform;

/** Arcs are delta-encoded against a quantised grid; undo both. */
function decodeArc(arc) {
  let x = 0;
  let y = 0;
  const out = [];
  for (const [dx, dy] of arc) {
    x += dx;
    y += dy;
    out.push([x * scale[0] + translate[0], y * scale[1] + translate[1]]);
  }
  return out;
}

const arcs = topo.arcs.map(decodeArc);

/** A negative index means "this arc, reversed" — ~i, not -i. */
function arcPoints(index) {
  return index < 0 ? arcs[~index].slice().reverse() : arcs[index];
}

/** Stitch a ring's arcs, dropping each arc's first point after the first. */
function ring(indices) {
  const out = [];
  indices.forEach((index, i) => {
    const pts = arcPoints(index);
    for (let p = i === 0 ? 0 : 1; p < pts.length; p++) out.push(pts[p]);
  });
  return out;
}

const rings = [];
for (const geom of topo.objects.countries.geometries) {
  const polygons = geom.type === 'Polygon' ? [geom.arcs]
    : geom.type === 'MultiPolygon' ? geom.arcs
    : [];
  for (const polygon of polygons) {
    for (const r of polygon) rings.push(ring(r));
  }
}

const round = (v) => Math.round(v * 10) / 10;

/**
 * Douglas-Peucker, because 110m coastlines carry points a globe cannot show.
 *
 * Natural Earth's vertices are spaced for a printed atlas: long stretches of
 * Siberian coast arrive as dozens of near-collinear points that all land inside
 * the same pixel here. Dropping any point that sits within a fifth of a degree
 * of the line between its neighbours removes more than half of them and changes
 * nothing visible at 440px.
 *
 * Distance is measured in degrees, not on the sphere. That is deliberate: the
 * error it introduces is a cosine-of-latitude stretch near the poles, which
 * makes the tolerance STRICTER there rather than looser, and a globe shows less
 * of the poles than of the equator anyway.
 */
const TOLERANCE = 0.2;

function simplify(points, tolerance = TOLERANCE) {
  if (points.length < 3) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let worst = 0;
    let index = -1;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);

    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      // A degenerate segment (start === end, which closed rings produce) has no
      // line to measure against, so fall back to distance from the endpoint.
      const d = len === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > worst) {
        worst = d;
        index = i;
      }
    }

    if (index !== -1 && worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/** Rough spherical-ish area, only ever compared against itself. */
function extent(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}

/**
 * An islet smaller than a quarter of a square degree is under half a pixel at
 * globe scale. Drawing it costs a path and shows nothing.
 */
const MIN_EXTENT = 0.25;

const emitted = [];
for (const r of rings) {
  if (r.length < 4) continue;
  if (extent(r) < MIN_EXTENT) continue;

  const simplified = simplify(r);
  if (simplified.length < 4) continue;

  const flat = [];
  let lastX = null;
  let lastY = null;
  for (const [x, y] of simplified) {
    const rx = round(x);
    const ry = round(y);
    // Rounding collapses neighbouring points; keeping both draws a zero-length
    // segment every time.
    if (rx === lastX && ry === lastY) continue;
    flat.push(rx, ry);
    lastX = rx;
    lastY = ry;
  }
  if (flat.length >= 8) emitted.push(flat);
}

const total = emitted.reduce((n, r) => n + r.length / 2, 0);

const out = `/**
 * The world, as rings of [lon, lat] pairs.
 *
 * GENERATED by scripts/build-world.mjs from Natural Earth 110m via world-atlas.
 * Do not edit by hand — regenerate.
 *
 * ${emitted.length} rings, ${total} points, rounded to a tenth of a degree.
 * Public domain (Natural Earth).
 */
export const WORLD_RINGS: number[][] = ${JSON.stringify(emitted)};
`;

const dest = 'src/data/geo/world.ts';
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, out);
console.log(`${dest}: ${emitted.length} rings, ${total} points, ${(out.length / 1024).toFixed(1)}KB`);
