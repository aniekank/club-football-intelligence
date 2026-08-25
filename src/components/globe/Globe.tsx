'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EarthGL, type EarthView } from './EarthGL';
import { project, slerp, angularDistance, graticule, type Rotation } from './projection';

/**
 * The globe: NASA's Blue Marble underneath, this product's data on top.
 *
 * ── Two layers, one clock ──────────────────────────────────────────────────
 * The Earth is a WebGL shader running the projection backwards per pixel; the
 * pins, the flight path and the pulse are 2D canvas running it forwards. They
 * are separate because they are genuinely different problems — a million
 * inverse projections belong on a GPU, and forty forward ones belong wherever
 * the hit-testing lives — but they must never disagree about where a place is,
 * so they share one view (a ref) and one animation frame. The overlay advances
 * the camera and then calls the shader; nothing else drives either.
 *
 * ── The line globe is the fallback, not the design ─────────────────────────
 * Without WebGL, or before the texture lands, the overlay draws the world it
 * drew before: a shaded sphere, a graticule and hairline coastlines. A device
 * that cannot run a shader still gets a world with pins in the right places.
 * Once the Earth is up, the coastlines are redundant and are dropped — Blue
 * Marble already has them, in better detail than 110m vectors.
 *
 * ── It can be grabbed ──────────────────────────────────────────────────────
 * Dragging rotates it, the wheel zooms, arrow keys do both for anyone not using
 * a pointer. Any of those cancels the flight in progress and tells the caller
 * the reader has taken over — an auto-advancing tour that yanks the camera back
 * two seconds after someone has moved it is worse than one that never moved.
 *
 * On touch the surface claims horizontal gestures only (`touch-action: pan-y`),
 * so a globe that fills a phone screen cannot trap the page scroll. Latitude
 * is a mouse, a trackpad or the arrow keys.
 */

export interface GlobePoint {
  key: string;
  lat: number;
  lon: number;
}

/** How long the camera takes to cross the planet, and the floor for a hop. */
const FLIGHT_MIN_MS = 700;
const FLIGHT_MAX_MS = 1700;
/** Degrees per second of idle drift, so a held frame is not a still image. */
const DRIFT_DEG_PER_S = 1.1;
/** The pin's pulse, one breath. */
const PULSE_MS = 2400;
/** Leaves room inside the box for the outer pulse ring and the atmosphere. */
const BASE_SCALE = 0.9;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3.5;
/** Above this the globe is upside down and the drag has become a wrestle. */
const LAT_LIMIT = 85;

interface Palette {
  sphere: string;
  sphereEdge: string;
  graticule: string;
  coast: string;
  limb: string;
  brand: string;
  accent: string;
  dot: string;
}

/**
 * Read from the WRAPPER, not the document.
 *
 * The theme tokens resolve either way, but `--comp-active` is bound per
 * competition on an ancestor of this panel — reading from <html> would resolve
 * it to the page default and the globe would stop following the fixture it is
 * showing.
 */
function readPalette(el: HTMLElement): Palette {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    sphere: v('--surface-3', '#1b2029'),
    sphereEdge: v('--surface-inset', '#0d1117'),
    graticule: v('--border-default', '#2a333d'),
    coast: v('--text-secondary', '#9aa7b5'),
    limb: v('--border-strong', '#3a4653'),
    brand: v('--brand', '#c8f751'),
    accent: v('--comp-active', v('--brand', '#c8f751')),
    dot: v('--text-muted', '#7a8899'),
  };
}

const GRATICULE = graticule();

/**
 * The outline world is loaded ONLY if the shader cannot run.
 *
 * Six thousand coastline points are 62KB of source, and on any device with
 * WebGL they are never drawn — Blue Marble has coastlines, in better detail
 * than a 110m vector set. Importing them statically put that in the home
 * page's first load to serve a fallback almost nobody reaches. Fetched on
 * demand, the common path never pays for it and the uncommon one waits about
 * a network round trip for a picture it would not otherwise have at all.
 */
let ringsPromise: Promise<number[][]> | null = null;
function loadRings(): Promise<number[][]> {
  ringsPromise ??= import('@/data/geo/world').then((m) => m.WORLD_RINGS);
  return ringsPromise;
}

export function Globe({
  points, activeIndex, label, className, onGrab,
}: {
  points: GlobePoint[];
  activeIndex: number;
  /** What the picture currently shows, for anyone who cannot see it. */
  label: string;
  className?: string;
  /** Fired the moment the reader takes the camera. */
  onGrab?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Everything the animation loop touches lives in refs. Driving a 60fps
  // camera through React state would re-render the tree on every frame to
  // change two numbers nothing else reads.
  const view = useRef<EarthView>({ lon: 0, lat: 20, radiusScale: BASE_SCALE });
  const zoom = useRef(1);
  const flight = useRef<{ from: Rotation; to: Rotation; start: number; ms: number } | null>(null);
  const palette = useRef<Palette | null>(null);
  const reduced = useRef(false);
  const onScreen = useRef(true);
  const target = useRef<Rotation | null>(null);
  const previous = useRef<Rotation | null>(null);
  const progress = useRef(1);
  const grabbed = useRef(false);
  const earthDraw = useRef<(() => void) | null>(null);
  const rings = useRef<number[][] | null>(null);

  const [earthOk, setEarthOk] = useState(false);

  const handleEarth = useCallback((ok: boolean) => {
    setEarthOk(ok);
    // Only now is the vector world worth its bytes.
    if (!ok) loadRings().then((r) => { rings.current = r; }).catch(() => {});
  }, []);

  // Start the camera on the first stop rather than flying to it from the
  // Atlantic on load.
  const started = useRef(false);
  const first = points[0];
  if (!started.current && first) {
    view.current = { lon: first.lon, lat: first.lat, radiusScale: BASE_SCALE };
    target.current = { lon: first.lon, lat: first.lat };
    started.current = true;
  }

  const registerEarth = useCallback((draw: (() => void) | null) => {
    earthDraw.current = draw;
  }, []);

  /** Retarget whenever the tour advances. */
  useEffect(() => {
    const stop = points[activeIndex];
    if (!stop) return;
    const to = { lon: stop.lon, lat: stop.lat };
    const from = { lon: view.current.lon, lat: view.current.lat };
    previous.current = from;
    target.current = to;

    if (reduced.current) {
      view.current = { ...view.current, ...to };
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

  /* ── Manipulation ──────────────────────────────────────────────────────── */

  const takeOver = useCallback(() => {
    flight.current = null;
    if (!grabbed.current) {
      grabbed.current = true;
      onGrab?.();
    }
  }, [onGrab]);

  const rotateBy = useCallback((dxPx: number, dyPx: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const radius = (Math.min(wrap.clientWidth, wrap.clientHeight) / 2) * BASE_SCALE * zoom.current;
    if (radius <= 0) return;
    // A pixel at the centre of the disc subtends 1/radius radians of arc, and a
    // drag should move the ground under the finger — hence the sign flip on
    // longitude and not on latitude.
    const perPixel = (180 / Math.PI) / radius;
    view.current = {
      ...view.current,
      lon: wrap180(view.current.lon - dxPx * perPixel),
      lat: Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, view.current.lat + dyPx * perPixel)),
    };
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pointer = -1;

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragging = true;
      pointer = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      wrap.setPointerCapture(e.pointerId);
      takeOver();
    };

    const move = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointer) return;
      rotateBy(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      dragging = false;
      pointer = -1;
      if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
    };

    const wheel = (e: WheelEvent) => {
      // Only claim the gesture once it is clearly a zoom, so a page scroll that
      // happens to pass over the globe is not swallowed by it.
      if (Math.abs(e.deltaY) < 2) return;
      e.preventDefault();
      takeOver();
      const next = zoom.current * (e.deltaY > 0 ? 0.92 : 1.08);
      zoom.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    };

    const key = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 15 : 5;
      switch (e.key) {
        case 'ArrowLeft': takeOver(); view.current.lon = wrap180(view.current.lon - step); break;
        case 'ArrowRight': takeOver(); view.current.lon = wrap180(view.current.lon + step); break;
        case 'ArrowUp': takeOver(); view.current.lat = Math.min(LAT_LIMIT, view.current.lat + step); break;
        case 'ArrowDown': takeOver(); view.current.lat = Math.max(-LAT_LIMIT, view.current.lat - step); break;
        case '+': case '=': takeOver(); zoom.current = Math.min(ZOOM_MAX, zoom.current * 1.15); break;
        case '-': case '_': takeOver(); zoom.current = Math.max(ZOOM_MIN, zoom.current / 1.15); break;
        default: return;
      }
      e.preventDefault();
    };

    wrap.addEventListener('pointerdown', down);
    wrap.addEventListener('pointermove', move);
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', up);
    wrap.addEventListener('wheel', wheel, { passive: false });
    wrap.addEventListener('keydown', key);

    return () => {
      wrap.removeEventListener('pointerdown', down);
      wrap.removeEventListener('pointermove', move);
      wrap.removeEventListener('pointerup', up);
      wrap.removeEventListener('pointercancel', up);
      wrap.removeEventListener('wheel', wheel);
      wrap.removeEventListener('keydown', key);
    };
  }, [rotateBy, takeOver]);

  /* ── The frame loop ────────────────────────────────────────────────────── */

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
      onScreen.current = entry?.isIntersecting ?? true;
    }, { threshold: 0.05 });
    io.observe(wrap);

    const onVisibility = () => { onScreen.current = !document.hidden; };
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
      if (!onScreen.current || width === 0) return;

      const f = flight.current;
      if (f) {
        const t = Math.min((now - f.start) / f.ms, 1);
        progress.current = t;
        const at = slerp(f.from, f.to, easeInOut(t));
        view.current = { ...view.current, lon: at.lon, lat: at.lat };
        if (t >= 1) flight.current = null;
      } else if (!reduced.current && !grabbed.current) {
        // Idle drift, eastward. Small enough that the pin stays where the
        // reader last saw it, large enough that the frame is alive. Stopped
        // once the reader has taken the camera: their view should stay put.
        view.current = {
          ...view.current,
          lon: wrap180(view.current.lon + (DRIFT_DEG_PER_S * dt) / 1000),
        };
      }

      view.current.radiusScale = BASE_SCALE * zoom.current;
      earthDraw.current?.();

      draw(ctx, width, height, {
        rotation: view.current,
        radius: (Math.min(width, height) / 2) * view.current.radiusScale,
        palette: palette.current ?? readPalette(wrap),
        points,
        activeIndex,
        route: previous.current && target.current
          ? { from: previous.current, to: target.current, t: progress.current }
          : null,
        pulse: reduced.current ? 0 : ((now % PULSE_MS) / PULSE_MS),
        earth: earthDraw.current !== null,
        rings: rings.current,
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
    <div
      ref={wrapRef}
      tabIndex={0}
      role="group"
      aria-label="Globe. Drag to rotate, arrow keys to turn it, plus and minus to zoom."
      // `pan-y` rather than `none`: a globe that fills a phone screen must not
      // trap the page scroll. Horizontal gestures rotate; vertical ones scroll.
      style={{ touchAction: 'pan-y' }}
      className={`${className ?? ''} cursor-grab overflow-hidden active:cursor-grabbing focus-visible:shadow-focus`}
    >
      <EarthGL
        viewRef={view}
        register={registerEarth}
        onReady={handleEarth}
        className="absolute inset-0 block h-full w-full"
      />
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="absolute inset-0 block h-full w-full"
      />
      {/* Announced only. The Earth's presence changes nothing a reader needs to
          be told about, but it does change what the overlay draws. */}
      <span className="sr-only">{earthOk ? 'Satellite imagery' : 'Outline map'}</span>
    </div>
  );
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const wrap180 = (lon: number) => ((lon + 540) % 360) - 180;

interface DrawState {
  rotation: Rotation;
  radius: number;
  palette: Palette;
  points: GlobePoint[];
  activeIndex: number;
  route: { from: Rotation; to: Rotation; t: number } | null;
  pulse: number;
  /** True once the shader owns the ball; the outline world stands down. */
  earth: boolean;
  /** Present only on the fallback path, and only once it has arrived. */
  rings: number[][] | null;
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: DrawState,
) {
  const { rotation, radius, palette, points, activeIndex, route, pulse, earth, rings } = state;
  const cx = width / 2;
  const cy = height / 2;
  if (radius <= 0) return;

  ctx.clearRect(0, 0, width, height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (!earth) {
    /* The fallback world. A radial gradient offset up and left is the whole
       illusion: it puts a light source somewhere and the eye reads curvature
       from it. */
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

    strokeLines(ctx, GRATICULE, rotation, radius, cx, cy, palette.graticule, 1, 0.55);
    // A sphere with a graticule and pins is already a globe; the coastlines
    // join it when they land.
    if (rings) strokeLines(ctx, rings, rotation, radius, cx, cy, palette.coast, 1, 0.6, true);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = palette.limb;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    /* Over satellite imagery the coastlines are noise — Blue Marble has them,
       at a detail no 110m vector set can match. The graticule stays, faintly:
       it is the one thing the photograph does not carry, and it is what makes
       the ball read as a globe rather than as a picture of one. */
    strokeLines(ctx, GRATICULE, rotation, radius, cx, cy, '#ffffff', 1, 0.1);
  }

  /* The route travelled, drawn as far as the camera has come. */
  if (route && route.t > 0.02) {
    const samples: number[] = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * route.t;
      const p = slerp(route.from, route.to, t);
      samples.push(p.lon, p.lat);
    }
    strokeLines(ctx, [samples], rotation, radius, cx, cy, palette.brand, 1.25, 0.5);
  }

  /* Every stop, so the shape of the tour is visible, and then the one the
     panel is talking about. */
  /* A ring around every mark.
   *
   * Over Blue Marble a pin has to survive both a bright desert and a dark
   * ocean within a few hundred pixels of each other, and no single fill colour
   * does. A dark hairline around a light dot reads on either — the same reason
   * the charts here put a surface-coloured ring on overlapping marks. */
  points.forEach((p, i) => {
    if (i === activeIndex) return;
    const q = project(p.lon, p.lat, rotation, radius, cx, cy);
    if (!q.visible) return;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = earth ? '#ffffff' : palette.dot;
    ctx.globalAlpha = earth ? 0.75 : 0.55;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.globalAlpha = earth ? 0.6 : 0.3;
    ctx.stroke();
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
      ctx.arc(q.x, q.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = palette.brand;
      ctx.shadowColor = palette.brand;
      ctx.shadowBlur = 14;
      ctx.globalAlpha = 1;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(q.x, q.y, 4.5, 0, Math.PI * 2);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.globalAlpha = earth ? 0.75 : 0.35;
      ctx.stroke();
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
