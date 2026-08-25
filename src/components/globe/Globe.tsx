'use client';

import { useEffect, useRef } from 'react';
import { WORLD_RINGS } from '@/data/geo/world';
import { project, slerp, angularDistance, graticule, type Rotation } from './projection';

/**
 * The globe. Canvas, hand-drawn, no dependency.
 *
 * ── Why canvas and not SVG ─────────────────────────────────────────────────
 * Six thousand coastline points are re-projected on every frame while the
 * camera is moving. In SVG that is six thousand path commands rebuilt sixty
 * times a second through React's diff, which is not a rendering strategy, it is
 * a stress test. Canvas draws them in about a millisecond and never touches the
 * DOM. The cost is that the picture is not in the accessibility tree — so the
 * canvas is labelled, and everything it says is also said in real text beside
 * it, which is where a screen reader was always going to read it from.
 *
 * ── Coastlines are STROKED, not filled ─────────────────────────────────────
 * Filling a landmass that crosses the horizon means clipping the polygon
 * against the limb and then tracing the arc back around it — genuinely fiddly,
 * and wrong in an obvious way when it goes wrong: a chord straight across the
 * disc, cutting the visible half of Eurasia off. Stroking has no closure
 * problem at all. Each run of visible points is a polyline, the limb takes care
 * of itself, and a hairline world on a dark sphere is closer to this product's
 * register than a filled one would be anyway.
 *
 * ── The camera moves along the sphere ──────────────────────────────────────
 * Between two stops it interpolates on the great circle rather than in
 * lon/lat, so it takes the short way and never swings up over the pole. See
 * `slerp` — that is the entire reason it exists.
 *
 * ── What it does when asked to sit still ───────────────────────────────────
 * Under `prefers-reduced-motion` there is no flight, no drift and no pulse: it
 * paints the destination once, and repaints only when the stop changes. A
 * carousel that respects the setting by animating faster has not respected it.
 */

export interface GlobePoint {
  key: string;
  lat: number;
  lon: number;
}

/** How long the camera takes to cross the planet, and the floor for a hop. */
const FLIGHT_MIN_MS = 900;
const FLIGHT_MAX_MS = 2400;
/** Degrees per second of idle drift, so a held frame is not a still image. */
const DRIFT_DEG_PER_S = 1.1;
/** The pin's pulse, one breath. */
const PULSE_MS = 2400;

interface Palette {
  sphere: string;
  sphereEdge: string;
  graticule: string;
  coast: string;
  limb: string;
  brand: string;
  /** The active competition's own colour, for the halo. */
  accent: string;
  dot: string;
}

/**
 * Read from the WRAPPER, not the document.
 *
 * The theme tokens resolve either way, but `--comp-active` is bound per
 * competition on an ancestor of this panel — reading from <html> would resolve
 * it to whatever the page-level default is and the globe's halo would stop
 * following the fixture it is showing.
 */
function readPalette(el: HTMLElement): Palette {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    sphere: v('--surface-3', '#1b2029'),
    sphereEdge: v('--surface-inset', '#0d1117'),
    graticule: v('--border-default', '#2a333d'),
    // The coastline is the SUBJECT. Drawn in a border token it disappeared
    // into the sphere it sits on; it wants text ink, not furniture ink.
    coast: v('--text-secondary', '#9aa7b5'),
    limb: v('--border-strong', '#3a4653'),
    brand: v('--brand', '#c8f751'),
    accent: v('--comp-active', v('--brand', '#c8f751')),
    dot: v('--text-muted', '#7a8899'),
  };
}

const GRATICULE = graticule();

export function Globe({
  points, activeIndex, label, className,
}: {
  points: GlobePoint[];
  activeIndex: number;
  /** What the picture currently shows, for anyone who cannot see it. */
  label: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Everything the animation loop touches lives in refs. Driving a 60fps
  // camera through React state would re-render the tree on every frame to
  // change two numbers nothing else reads.
  const rotation = useRef<Rotation>({ lon: 0, lat: 20 });
  const flight = useRef<{ from: Rotation; to: Rotation; start: number; ms: number } | null>(null);
  const palette = useRef<Palette | null>(null);
  const reduced = useRef(false);
  const visible = useRef(true);
  const target = useRef<Rotation | null>(null);
  const previous = useRef<Rotation | null>(null);
  const progress = useRef(1);

  // Start the camera on the first stop rather than flying to it from the
  // Atlantic on load.
  const started = useRef(false);
  const first = points[0];
  if (!started.current && first) {
    rotation.current = { lon: first.lon, lat: first.lat };
    target.current = { lon: first.lon, lat: first.lat };
    started.current = true;
  }

  /** Retarget whenever the tour advances. */
  useEffect(() => {
    const stop = points[activeIndex];
    if (!stop) return;
    const to = { lon: stop.lon, lat: stop.lat };
    const from = { ...rotation.current };
    previous.current = from;
    target.current = to;

    if (reduced.current) {
      rotation.current = to;
      progress.current = 1;
      flight.current = null;
      return;
    }

    // Time scales with the distance actually travelled: a hop across a country
    // and a jump across an ocean taking the same three seconds is what makes a
    // flying camera feel like a slideshow.
    const share = angularDistance(from, to) / Math.PI;
    flight.current = {
      from,
      to,
      start: performance.now(),
      ms: FLIGHT_MIN_MS + share * (FLIGHT_MAX_MS - FLIGHT_MIN_MS),
    };
    progress.current = 0;
  }, [activeIndex, points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    palette.current = readPalette(wrap);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => { reduced.current = motionQuery.matches; };
    syncMotion();
    motionQuery.addEventListener('change', syncMotion);

    // The palette is five themes deep and switching one must repaint the globe.
    const themeWatcher = new MutationObserver(() => {
      palette.current = readPalette(wrap);
    });
    themeWatcher.observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme'],
    });

    // A globe animating in a tab nobody is looking at, or scrolled far above
    // the viewport, is a battery being spent on nothing.
    const io = new IntersectionObserver(([entry]) => {
      visible.current = entry?.isIntersecting ?? true;
    }, { threshold: 0.05 });
    io.observe(wrap);

    const onVisibility = () => {
      if (document.hidden) visible.current = false;
      else visible.current = true;
    };
    document.addEventListener('visibilitychange', onVisibility);

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    let raf = 0;
    let lastFrame = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - lastFrame, 100);
      lastFrame = now;
      if (!visible.current || width === 0) return;

      const f = flight.current;
      if (f) {
        const t = Math.min((now - f.start) / f.ms, 1);
        progress.current = t;
        rotation.current = slerp(f.from, f.to, easeInOut(t));
        if (t >= 1) flight.current = null;
      } else if (!reduced.current) {
        // Idle drift, eastward. Small enough that the pin stays where the
        // reader last saw it, large enough that the frame is alive.
        rotation.current = {
          lon: wrap180(rotation.current.lon + (DRIFT_DEG_PER_S * dt) / 1000),
          lat: rotation.current.lat,
        };
      }

      draw(ctx, width, height, {
        rotation: rotation.current,
        palette: palette.current ?? readPalette(wrap),
        points,
        activeIndex,
        route: previous.current && target.current
          ? { from: previous.current, to: target.current, t: progress.current }
          : null,
        pulse: reduced.current ? 0 : ((now % PULSE_MS) / PULSE_MS),
      });
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      themeWatcher.disconnect();
      motionQuery.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [points, activeIndex]);

  return (
    <div ref={wrapRef} className={className}>
      <canvas ref={canvasRef} role="img" aria-label={label} className="block h-full w-full" />
    </div>
  );
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const wrap180 = (lon: number) => ((lon + 540) % 360) - 180;

interface DrawState {
  rotation: Rotation;
  palette: Palette;
  points: GlobePoint[];
  activeIndex: number;
  route: { from: Rotation; to: Rotation; t: number } | null;
  pulse: number;
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: DrawState,
) {
  const { rotation, palette, points, activeIndex, route, pulse } = state;
  const cx = width / 2;
  const cy = height / 2;
  // Room for the pin's outer pulse without it being clipped by the edge.
  const radius = Math.min(width, height) / 2 - 10;
  if (radius <= 0) return;

  ctx.clearRect(0, 0, width, height);

  /* The halo. A soft ring of the active competition's colour just outside the
     limb, which reads as atmosphere and is also the only place on the panel
     where the competition's identity is a light rather than a label. */
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.shadowColor = palette.accent;
  ctx.shadowBlur = 26;
  ctx.strokeStyle = palette.accent;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;

  /* The sphere. A radial gradient offset up and left is the whole illusion:
     it puts a light source somewhere and the eye reads curvature from it. */
  const gradient = ctx.createRadialGradient(
    cx - radius * 0.4, cy - radius * 0.4, radius * 0.05,
    cx, cy, radius,
  );
  gradient.addColorStop(0, palette.sphere);
  gradient.addColorStop(0.75, palette.sphere);
  gradient.addColorStop(1, palette.sphereEdge);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  strokeLines(ctx, GRATICULE, rotation, radius, cx, cy, palette.graticule, 1, 0.55);
  strokeLines(ctx, WORLD_RINGS, rotation, radius, cx, cy, palette.coast, 1, 0.6, true);

  /* The limb. Drawn last of the sphere furniture so coastlines meeting the
     edge are cut by a clean line rather than fraying into the background. */
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = palette.limb;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  ctx.stroke();

  /* The route travelled, drawn as far as the camera has come. */
  if (route && route.t > 0.02) {
    const samples: number[] = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * route.t;
      const p = slerp(route.from, route.to, t);
      samples.push(p.lon, p.lat);
    }
    strokeLines(ctx, [samples], rotation, radius, cx, cy, palette.brand, 1.25, 0.45);
  }

  /* Every stop, so the shape of the tour is visible, and then the one the
     panel is talking about. */
  points.forEach((p, i) => {
    if (i === activeIndex) return;
    const q = project(p.lon, p.lat, rotation, radius, cx, cy);
    if (!q.visible) return;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = palette.dot;
    ctx.globalAlpha = 0.5;
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  const active = points[activeIndex];
  if (active) {
    const q = project(active.lon, active.lat, rotation, radius, cx, cy);
    if (q.visible) {
      if (pulse > 0) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, 4 + pulse * 18, 0, Math.PI * 2);
        ctx.strokeStyle = palette.brand;
        ctx.globalAlpha = 0.55 * (1 - pulse);
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(q.x, q.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = palette.brand;
      ctx.shadowColor = palette.brand;
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 1;
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.globalAlpha = 1;
}

/**
 * Draw flat [lon, lat, …] runs, breaking wherever the line goes behind.
 *
 * The break is the important part. Carrying a path across the far side draws a
 * straight line through the middle of the disc from one limb to the other,
 * which is how a hand-rolled globe usually announces itself.
 */
function strokeLines(
  ctx: CanvasRenderingContext2D,
  lines: number[][],
  rotation: Rotation,
  radius: number,
  cx: number,
  cy: number,
  colour: string,
  lineWidth: number,
  alpha: number,
  /** Land is closed; a graticule line is not. */
  closeRuns = false,
) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = alpha;
  ctx.beginPath();

  for (const line of lines) {
    let drawing = false;
    let firstX = 0;
    let firstY = 0;
    let wholeRingVisible = true;

    for (let i = 0; i < line.length; i += 2) {
      const p = project(line[i] as number, line[i + 1] as number, rotation, radius, cx, cy);
      if (!p.visible) {
        drawing = false;
        wholeRingVisible = false;
        continue;
      }
      if (!drawing) {
        ctx.moveTo(p.x, p.y);
        if (!closeRuns || wholeRingVisible) {
          firstX = p.x;
          firstY = p.y;
        }
        drawing = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }

    // A ring entirely on the near side is a closed shape — an island whose last
    // point does not meet its first has a visible notch in it.
    if (closeRuns && wholeRingVisible && drawing) ctx.lineTo(firstX, firstY);
  }

  ctx.stroke();
  ctx.globalAlpha = 1;
}
