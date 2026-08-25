'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The Earth, from NASA's Blue Marble, projected per pixel.
 *
 * Harvested from the atlas built for The Bag and re-fitted here: same shader,
 * same two-texture load, driven by this product's tour instead of a job search.
 *
 * ── Why this is a shader and not a canvas ──────────────────────────────────
 * Drawing a TEXTURED globe means running the projection backwards: for every
 * pixel inside the disc, work out which point on the sphere it is looking at,
 * convert that to a longitude and latitude, and sample the flat map there. At
 * 24rem on a retina display that is roughly a million inverse projections per
 * frame. In canvas that is `getImageData`, a loop and a dropped frame rate; on
 * a GPU it is one pass and free.
 *
 * The FORWARD projection in `projection.ts` is still the truth for anything
 * that has to agree with a pointer — pins, the route line, hit-testing. This
 * only draws the ball. Two implementations of one geometry is a real risk, so
 * the split is deliberate and narrow: the shader owns pixels, `project()` owns
 * positions, and nothing else crosses over.
 *
 * ── The rotation, written out because it is the part that goes wrong ───────
 * A fragment at (px, py) inside the unit disc is looking at the sphere point
 * `v = (px, py, √(1 − px² − py²))` in VIEW space, where +z points at the camera
 * and +y is up the screen. To find out what is actually there, rotate that
 * vector into WORLD space by the viewing angle: Rx(−lat0), then Ry(lon0).
 *
 * Checked at the trivial case: v = (0,0,1) with lon0 = lat0 = 0 must come back
 * as longitude 0, latitude 0 — the Gulf of Guinea. It does.
 *
 * ── Failure costs the picture, not the page ────────────────────────────────
 * `onReady(false)` on no WebGL, a failed compile or a missing texture, and the
 * caller keeps drawing its own line globe. A device without WebGL still gets a
 * world with pins on it.
 */

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform vec2  uCentre;   // disc centre, pixels
uniform float uRadius;   // disc radius, pixels
uniform float uLon0;     // radians
uniform float uLat0;     // radians
uniform vec2  uSun;      // sun lon/lat, radians
uniform vec3  uAir;      // atmosphere tint
uniform sampler2D uMap;

const float PI = 3.141592653589793;

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 d = (frag - uCentre) / uRadius;
  float rr = dot(d, d);

  /* Outside the sphere: atmosphere, then nothing. Two falloffs — a tight
     bright ring on the limb and a wide soft bloom — because one alone reads as
     a blur rather than as an edge. */
  if (rr > 1.0) {
    float t = sqrt(rr);
    float ring  = exp(-pow((t - 1.0) / 0.045, 2.0));
    float bloom = exp(-pow((t - 1.0) / 0.30, 2.0));
    vec3 air = uAir * ring * 0.80 + uAir * bloom * 0.30;
    gl_FragColor = vec4(air, ring * 0.9 + bloom * 0.35);
    return;
  }

  /* Inverse projection: the sphere point this pixel is looking at, in view
     space, with +z toward the camera. */
  vec3 v = vec3(d.x, d.y, sqrt(max(0.0, 1.0 - rr)));

  /* View -> world. Rx(-lat0) then Ry(lon0). See the note above. */
  float sla = sin(uLat0), cla = cos(uLat0);
  float slo = sin(uLon0), clo = cos(uLon0);
  vec3 a = vec3(v.x,  v.y * cla + v.z * sla, -v.y * sla + v.z * cla);
  vec3 w = vec3(a.x * clo + a.z * slo, a.y, -a.x * slo + a.z * clo);

  float lat = asin(clamp(w.y, -1.0, 1.0));
  float lon = atan(w.x, w.z);

  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  vec3 col = texture2D(uMap, uv).rgb;

  /* Daylight. Lambert against the surface normal, which in world space is the
     point itself. */
  vec3 sun = vec3(cos(uSun.y) * sin(uSun.x), sin(uSun.y), cos(uSun.y) * cos(uSun.x));
  float lambert = max(0.0, dot(normalize(w), sun));

  /* Night is not black — cities and moonlight — but it is close, and the
     terminator is soft over about ten degrees rather than a hard line. */
  float day = smoothstep(-0.08, 0.34, lambert);
  vec3 lit  = col * (0.16 + 1.05 * day);

  /* Air seen through the limb: the atmosphere is thicker at a glancing angle,
     which is why the edge of the earth is bluer than the middle. */
  float glance = 1.0 - v.z;
  lit += uAir * pow(glance, 2.6) * (0.30 + 0.55 * day);

  /* A specular sheen on the ocean only — sampled darkness stands in for water
     well enough at this size. */
  float sea = 1.0 - smoothstep(0.10, 0.26, dot(col, vec3(0.33)));
  lit += vec3(0.55, 0.70, 0.85) * pow(max(0.0, lambert), 22.0) * sea * 0.5;

  gl_FragColor = vec4(lit, 1.0);
}`;

const UNIFORMS = ['uRes', 'uCentre', 'uRadius', 'uLon0', 'uLat0', 'uSun', 'uAir', 'uMap'] as const;

export interface EarthView {
  lon: number;
  lat: number;
  /** 1 fills the shorter side; the caller shrinks it to leave room for pins. */
  radiusScale: number;
}

/**
 * The view is a REF, and drawing is a callback the parent calls.
 *
 * The obvious shape — lon/lat as props — re-renders this component sixty times
 * a second while the camera is moving, to change two numbers that only the GPU
 * reads. The overlay above already owns a frame clock for the pin's pulse, so
 * it owns this one too: it advances the shared view and calls `draw`. One rAF
 * loop, one source of truth for where the globe is pointing, and no React work
 * per frame at all.
 */
export function EarthGL({
  viewRef, className, onReady, register,
}: {
  viewRef: React.MutableRefObject<EarthView>;
  className?: string;
  onReady?: (ok: boolean) => void;
  register?: (draw: (() => void) | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const gl = useRef<WebGLRenderingContext | null>(null);
  const uni = useRef<Partial<Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>>>({});
  const [ok, setOk] = useState(false);
  /* Bumped when the detailed texture lands, purely to re-run the draw effect —
     an uploaded texture changes nothing React can see on its own. */
  const [detail, setDetail] = useState(0);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!ctx) { onReady?.(false); return; }

    const compile = (type: number, src: string) => {
      const s = ctx.createShader(type);
      if (!s) return null;
      ctx.shaderSource(s, src);
      ctx.compileShader(s);
      if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) return null;
      return s;
    };
    const v = compile(ctx.VERTEX_SHADER, VERT);
    const f = compile(ctx.FRAGMENT_SHADER, FRAG);
    if (!v || !f) { onReady?.(false); return; }

    const prog = ctx.createProgram();
    if (!prog) { onReady?.(false); return; }
    ctx.attachShader(prog, v);
    ctx.attachShader(prog, f);
    ctx.linkProgram(prog);
    if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) { onReady?.(false); return; }
    ctx.useProgram(prog);

    // One triangle large enough to cover the clip volume. A full-screen quad is
    // two triangles with a seam down the diagonal for no benefit.
    const buf = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
    const loc = ctx.getAttribLocation(prog, 'p');
    ctx.enableVertexAttribArray(loc);
    ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);

    ctx.enable(ctx.BLEND);
    ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA);

    uni.current = Object.fromEntries(
      UNIFORMS.map((n) => [n, ctx.getUniformLocation(prog, n)]),
    );

    /**
     * Two textures, small first.
     *
     * The detailed Earth is 3 MB. A globe that appears three seconds after the
     * rest of the page is a worse globe than a soft one that is there
     * immediately, so the 233 KB copy paints first and the large one replaces
     * it in the same texture object once decoded — no flash, no second draw
     * path, and on a slow connection the page keeps the soft one.
     *
     * `LINEAR_MIPMAP_LINEAR` matters at 8192: without mipmaps the ocean
     * shimmers when the globe is small, because each screen pixel samples one
     * texel out of sixteen.
     */
    const tex = ctx.createTexture();
    let disposed = false;

    const upload = (image: HTMLImageElement, first: boolean) => {
      if (disposed) return;
      ctx.bindTexture(ctx.TEXTURE_2D, tex);
      ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGB, ctx.RGB, ctx.UNSIGNED_BYTE, image);
      /* Wrap in x so longitude is continuous across the antimeridian; clamp in
         y so the poles do not sample from the opposite pole. */
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.REPEAT);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR_MIPMAP_LINEAR);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
      ctx.generateMipmap(ctx.TEXTURE_2D);
      const map = uni.current.uMap;
      if (map) ctx.uniform1i(map, 0);
      gl.current = ctx;
      if (first) { setOk(true); onReady?.(true); }
      else setDetail((n) => n + 1);
    };

    const small = new Image();
    small.onload = () => {
      upload(small, true);
      const large = new Image();
      // A failure here is not worth reporting: the small texture is already on
      // screen and the page is entirely usable without the upgrade.
      large.onload = () => upload(large, false);
      large.src = '/earth/blue-marble-8192.jpg';
    };
    small.onerror = () => onReady?.(false);
    small.src = '/earth/blue-marble-2048.jpg';

    return () => { disposed = true; };
  }, [onReady]);

  const draw = useCallback(() => {
    const ctx = gl.current;
    const cv = canvas.current;
    if (!ctx || !cv) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (w === 0 || h === 0) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    ctx.viewport(0, 0, cv.width, cv.height);
    ctx.clearColor(0, 0, 0, 0);
    ctx.clear(ctx.COLOR_BUFFER_BIT);

    const { lon, lat, radiusScale } = viewRef.current;
    const radius = (Math.min(cv.width, cv.height) / 2) * radiusScale;
    ctx.uniform2f(uni.current.uRes as WebGLUniformLocation, cv.width, cv.height);
    ctx.uniform2f(uni.current.uCentre as WebGLUniformLocation, cv.width / 2, cv.height / 2);
    ctx.uniform1f(uni.current.uRadius as WebGLUniformLocation, radius);
    ctx.uniform1f(uni.current.uLon0 as WebGLUniformLocation, (lon * Math.PI) / 180);
    ctx.uniform1f(uni.current.uLat0 as WebGLUniformLocation, (lat * Math.PI) / 180);
    ctx.uniform3f(uni.current.uAir as WebGLUniformLocation, 0.42, 0.62, 0.98);
    /* The sun is kept off to one side of the view so there is always a
       terminator on screen. A globe lit flat-on from the camera has no shape. */
    ctx.uniform2f(
      uni.current.uSun as WebGLUniformLocation,
      ((lon - 38) * Math.PI) / 180,
      (14 * Math.PI) / 180,
    );
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
  }, [viewRef]);

  /* Hand the draw function up once the texture is on the GPU, and take it back
     on unmount so a stale closure cannot be called against a dead context. */
  useEffect(() => {
    if (!ok) return;
    register?.(draw);
    draw();
    return () => register?.(null);
  }, [ok, draw, register, detail]);

  return <canvas ref={canvas} className={className} aria-hidden="true" />;
}
