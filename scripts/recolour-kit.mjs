/**
 * Repaint the splash figure into club colours, once, as a build step.
 *
 * ── Why a browser is doing image processing ────────────────────────────────
 * The runtime here has five dependencies and none of them decode images, and
 * adding a codec to repaint two files once would be a strange trade. Chrome is
 * already on this machine and already decodes WebP, so the pass runs there over
 * the DevTools protocol and what ships is a finished picture. Nothing in the
 * app does per-pixel work at runtime.
 *
 * ── What it actually changes ───────────────────────────────────────────────
 * A hue band, not the whole image. Only pixels that are genuinely BLUE and
 * genuinely saturated are moved to red; skin, the white shorts, the red socks
 * and the boots all sit outside the band and are untouched. Lightness and
 * saturation are preserved per pixel, so the fabric keeps its folds, its
 * highlights and its shadow — a flat fill would turn a photograph into a
 * cut-out.
 *
 * The national crest is REMOVED rather than recoloured. A red shirt carrying
 * another country's badge is worse than either, and this is a stylised figure
 * for an intro, not a claim about who anybody plays for.
 *
 * Usage: node scripts/recolour-kit.mjs   (needs the dev server on :3010)
 */
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PORT = 9444;
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3010';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/cfi-recolour', 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('chrome did not start');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const n = ++id;
  pending.set(n, resolve);
  ws.send(JSON.stringify({ id: n, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `${ORIGIN}/` });
await new Promise((r) => setTimeout(r, 3500));

/**
 * The pass itself, run in the page so the image is same-origin and the canvas
 * is not tainted.
 *
 * `fromHue`/`toHue` are in degrees on the colour wheel. The crest box is in
 * source pixels and is filled with the median colour of a ring drawn just
 * outside it, which leaves fabric rather than a patch.
 */
const RECOLOUR = `
async (src, opts) => {
  const img = new Image();
  img.src = src;
  await img.decode();

  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const p = data.data;

  const rgbToHsl = (r, gg, b) => {
    r /= 255; gg /= 255; b /= 255;
    const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((gg - b) / d + (gg < b ? 6 : 0));
    else if (max === gg) h = (b - r) / d + 2;
    else h = (r - gg) / d + 4;
    return [h * 60, s, l];
  };
  const hslToRgb = (h, s, l) => {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const pp = 2 * l - q;
    const hue = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return pp + (q - pp) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6;
      return pp;
    };
    return [
      Math.round(hue(h + 1 / 3) * 255),
      Math.round(hue(h) * 255),
      Math.round(hue(h - 1 / 3) * 255),
    ];
  };

  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 8) continue;
    const [h, s, l] = rgbToHsl(p[i], p[i + 1], p[i + 2]);
    if (h >= opts.fromHue[0] && h <= opts.fromHue[1] && s >= opts.minSat && l <= opts.maxLight) {
      const [r, gg, b] = hslToRgb(opts.toHue, Math.min(1, s * opts.satGain), l);
      p[i] = r; p[i + 1] = gg; p[i + 2] = b;
    }
  }
  g.putImageData(data, 0, 0);

  // Erase the crest: sample a ring just outside the box and fill with its
  // median, so what is left reads as fabric rather than as a rectangle.
  if (opts.erase) {
    const [x0, y0, x1, y1] = opts.erase;
    const pad = 6;
    const ring = g.getImageData(x0 - pad, y0 - pad, (x1 - x0) + pad * 2, (y1 - y0) + pad * 2);
    const rs = [], gs = [], bs = [];
    const rw = (x1 - x0) + pad * 2;
    for (let y = 0; y < ring.height; y++) {
      for (let x = 0; x < rw; x++) {
        const inner = x >= pad && x < rw - pad && y >= pad && y < ring.height - pad;
        if (inner) continue;
        const k = (y * rw + x) * 4;
        if (ring.data[k + 3] < 8) continue;
        rs.push(ring.data[k]); gs.push(ring.data[k + 1]); bs.push(ring.data[k + 2]);
      }
    }
    const med = (a) => { a.sort((m, n) => m - n); return a[Math.floor(a.length / 2)] ?? 0; };
    g.save();
    g.filter = 'blur(6px)';
    g.fillStyle = \`rgb(\${med(rs)}, \${med(gs)}, \${med(bs)})\`;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.restore();
  }

  return c.toDataURL('image/webp', 0.86);
}`;

async function run(src, opts, dest) {
  const res = await send('Runtime.evaluate', {
    expression: `(${RECOLOUR})(${JSON.stringify(src)}, ${JSON.stringify(opts)})`,
    awaitPromise: true,
    returnByValue: true,
  });
  const url = res.result?.result?.value;
  if (typeof url !== 'string' || !url.startsWith('data:image/webp')) {
    throw new Error(`recolour failed for ${src}: ${JSON.stringify(res.result).slice(0, 300)}`);
  }
  const buf = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(dest, buf);
  console.log(`${dest}: ${(buf.length / 1024).toFixed(1)}KB`);
}

/* The shirt. France blue sits around 215-225 degrees; the band is widened to
   catch the shaded folds without reaching the boots. Arsenal red is hue 0. */
await run('/intro/striker.webp', {
  fromHue: [190, 270],
  minSat: 0.16,
  maxLight: 0.92,
  toHue: 2,
  satGain: 1.06,
  // The national crest, in source pixels.
  erase: [346, 252, 416, 336],
}, 'public/intro/striker-club.webp');

/* The ball, from purple to the product's own colour. */
await run('/intro/ball.webp', {
  fromHue: [250, 320],
  minSat: 0.12,
  maxLight: 0.98,
  toHue: 74,
  satGain: 1.15,
}, 'public/intro/ball-club.webp');

ws.close();
chrome.kill();
process.exit(0);
