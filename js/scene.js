// The poster renderer: draws a complete star map onto any Surface (canvas, PDF, SVG).
// All coordinates are millimetres; the page origin is offset by the bleed.

import * as A from './astro.js';
import { PAGE_SIZES } from './config.js';
import { lerpColor } from './surfaces.js';
import { GAL, renderMilkyWay } from './milkyway.js';
import { loreFor } from './lore.js';

const PT = 25.4 / 72;
const { D2R, R2D } = A;


// ---------- comet and shooting star
const rad = (deg) => deg * D2R;
const dirVec = (deg) => [Math.sin(rad(deg)), -Math.cos(rad(deg))]; // 0° is up, clockwise, in page coordinates (y down)

/** A tapering, fading streak from p0 along unit vector t. w(s) is the half-width and a(s) the opacity at s = 0..1 along the length.
 *  It is built from nested shapes, each reaching a little farther than the last, so the fade along the length is smooth and has no seams;
 *  `layers` stacks narrower copies so the edges feather out instead of ending in a hard line. */
function streak(S, [x, y], t, len, w, a, color, { bend = 0, levels = 44, layers = 1 } = {}) {
  const n = [-t[1], t[0]];
  const at = (s) => {
    const d = len * s, off = bend * len * s * s;
    return [x + t[0] * d + n[0] * off, y + t[1] * d + n[1] * off];
  };
  const clampA = (v) => Math.min(0.97, Math.max(0, v));
  for (let k = 0; k < layers; k++) {
    const f = layers === 1 ? 1 : 1 - (k / layers) * 0.9; // width of this layer relative to the full width
    const share = layers === 1 ? 1 : 1.5 / layers; // so the stacked layers add up to roughly the intended opacity at the centre
    for (let j = 1; j <= levels; j++) {
      const aIn = clampA(a((j - 1) / levels) * share), aOut = clampA(a(j / levels) * share);
      const al = 1 - (1 - aIn) / (1 - aOut); // opacity this level must add so the total at each point matches a(s)
      if (al <= 0.002) continue;
      const upper = [], lower = [];
      const m = Math.max(3, Math.round((j / levels) * 14));
      for (let i = 0; i <= m; i++) {
        const sv = (j / levels) * (i / m), c = at(sv), c2 = at(Math.min(1, sv + 0.01));
        const tl = [c2[0] - c[0], c2[1] - c[1]], tn = Math.hypot(tl[0], tl[1]) || 1;
        const nn = [-tl[1] / tn, tl[0] / tn], ww = w(sv) * f;
        upper.push([c[0] + nn[0] * ww, c[1] + nn[1] * ww]);
        lower.push([c[0] - nn[0] * ww, c[1] - nn[1] * ww]);
      }
      S.poly([[...upper, ...lower.reverse()]], { fill: color, alpha: al }, { closed: true });
    }
  }
}

/** A comet: a compact bright head in a soft coma, a broad curved dust tail with feathered edges, and a thin, straight ion tail with fine streamers. */
function drawComet(S, x, y, { size, tailAngle, tailLen, color, mono, bg }) {
  const rc = size;
  const ion = color;
  const dust = mono ? color : lerpColor(color, '#ffe6b0', 0.72);
  const glow = mono ? color : lerpColor(color, '#ffffff', 0.62);
  const ramp = (s) => Math.min(1, s * 10); // tails build up from the coma rather than starting at full strength
  const tdir = (off) => dirVec(tailAngle + off);
  // dust: broad, curved, and warm
  streak(S, [x, y], tdir(0), tailLen * 0.62, (s) => rc * (0.8 + 3.4 * s), (s) => (mono ? 0.55 : 0.95) * ramp(s) * (1 - s) ** 1.2, dust, { bend: 0.3, layers: 8 });
  streak(S, [x, y], tdir(0), tailLen * 0.9, (s) => rc * (0.6 + 2.0 * s), (s) => (mono ? 0.3 : 0.5) * ramp(s) * (1 - s) ** 1.5, dust, { bend: 0.18, layers: 6 });
  // ion: narrow, straight, bluish, with a few fine streamers
  streak(S, [x, y], tdir(0), tailLen, (s) => rc * (0.2 + 0.32 * s), (s) => (mono ? 0.7 : 0.9) * ramp(s) * (1 - s) ** 1.25, ion, { layers: 5 });
  [[-7, 0.78, 0.05], [-3.5, 0.95, -0.02], [3, 0.86, 0.03], [7.5, 0.62, -0.05]].forEach(([off, ln, bend]) => {
    streak(S, [x, y], tdir(off), tailLen * ln, (s) => rc * (0.06 + 0.1 * s), (s) => (mono ? 0.3 : 0.4) * ramp(s) * (1 - s) ** 1.5, ion, { bend, layers: 2 });
  });
  // coma: a halo that falls away smoothly, a brighter inner coma, then a small hard nucleus
  for (let j = 30; j >= 1; j--) {
    const q = j / 30;
    S.circle(x, y, rc * (0.3 + 2.1 * q), { fill: glow, alpha: (mono ? 0.025 : 0.035) + (mono ? 0.07 : 0.11) * (1 - q) ** 2.5 });
  }
  for (let j = 10; j >= 1; j--) S.circle(x, y, rc * (0.2 + 0.7 * (j / 10)), { fill: glow, alpha: mono ? 0.05 : 0.12 });
  if (mono) S.circle(x, y, rc * 0.42, { fill: bg });
  S.circle(x, y, rc * (mono ? 0.3 : 0.24), { fill: mono ? color : '#ffffff' });
}

/** A shooting star: a bright head with a tail that tapers away behind it as it moves along `dir`. */
function drawShootingStar(S, x, y, { size, dir, len, color }) {
  const back = dirVec(dir + 180);
  const w0 = size * 0.5;
  streak(S, [x, y], back, len, (s) => w0 * (1 - s) ** 0.8 + 0.02, (s) => 0.9 * (1 - s) ** 1.6, color, { levels: 36 });
  streak(S, [x, y], back, len * 0.35, (s) => w0 * 2.2 * (1 - s) + 0.02, (s) => 0.22 * (1 - s) ** 1.2, color, { levels: 12 });
  for (let j = 8; j >= 1; j--) S.circle(x, y, w0 * (1.1 + 3.2 * (j / 8)), { fill: color, alpha: 0.05 + 0.3 * (1 - j / 8) ** 2 });
  S.circle(x, y, w0 * 1.05, { fill: '#ffffff' });
}

export function pageDims(cfg) {
  let [w, h] = cfg.pageSize === 'Custom' ? [cfg.customW, cfg.customH] : PAGE_SIZES[cfg.pageSize] || PAGE_SIZES.A4;
  if (cfg.pageSize !== 'Custom') {
    const lo = Math.min(w, h), hi = Math.max(w, h);
    [w, h] = cfg.orientation === 'landscape' ? [hi, lo] : [lo, hi];
  }
  return { W: Math.max(50, w), H: Math.max(50, h) };
}

/** The moment as a UTC Date + Julian date. */
export function resolveMoment(cfg) {
  const [y, m, d] = (cfg.date || '2000-01-01').split('-').map(Number);
  const [hh, mm] = (cfg.time || '00:00').split(':').map(Number);
  const off = A.guessOffsetHours(cfg.lon);
  const tz = cfg.tz === 'auto' || !cfg.tz ? `UTC${off >= 0 ? '+' : ''}${off}` : cfg.tz;
  const date = A.wallToUtc(y, m, d, hh || 0, mm || 0, tz);
  return { date, jd: A.julianDate(date), tz };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDate(cfg) {
  const [y, m, d] = (cfg.date || '').split('-').map(Number);
  if (!y) return '';
  let s;
  switch (cfg.dateFormat) {
    case 'eu': s = `${d} ${MONTHS[m - 1]} ${y}`; break;
    case 'short': s = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`; break;
    case 'us': s = `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`; break;
    case 'iso': s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; break;
    default: s = `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  if (cfg.showTime && cfg.time) s += ` · ${cfg.time}`;
  return s;
}

/**
 * Fixed frame centred on a celestial pole (stars only, independent of time): used for planispheres.
 * Rows are the screen-east, screen-north and 'up' (towards the pole) axes; RA 0h points up the page.
 */
export function poleMatrix(south) {
  return south ? [0, 1, 0, 1, 0, 0, 0, 0, -1] : [0, -1, 0, 1, 0, 0, 0, 0, 1];
}

// ------------------------------------------------------------- shapes

function shapeInfo(shape, D) {
  const pts = [];
  const arc = (cx, cy, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * D2R; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  const h = D / 2;
  switch (shape) {
    case 'square': pts.push([-h, -h], [h, -h], [h, h], [-h, h]); break;
    case 'rounded': {
      const r = D * 0.16, o = h - r;
      arc(o, -o, r, -90, 0, 14); arc(o, o, r, 0, 90, 14); arc(-o, o, r, 90, 180, 14); arc(-o, -o, r, 180, 270, 14);
      break;
    }
    case 'arch': {
      const H = D * 1.35, top = -H / 2;
      arc(0, top + h, h, 180, 360, 90);
      pts.push([h, H / 2], [-h, H / 2]);
      break;
    }
    case 'hexagon': for (let i = 0; i < 6; i++) { const a = i * 60 * D2R; pts.push([h * Math.cos(a), h * Math.sin(a)]); } break;
    case 'heart': {
      for (let i = 0; i < 240; i++) {
        const t = (i / 240) * Math.PI * 2;
        pts.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
      }
      const k = D / 32;
      const ys = pts.map((p) => p[1]);
      const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
      for (const p of pts) { p[0] *= k; p[1] = (p[1] - mid) * k; }
      break;
    }
    default: arc(0, 0, h, 0, 360, 180); pts.pop();
  }
  const ys = pts.map((p) => p[1]);
  const height = Math.max(...ys) - Math.min(...ys);
  const rc = Math.max(...pts.map((p) => Math.hypot(p[0], p[1])));
  return { pts, height, rc };
}

function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------- helpers

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function slerp(a, b, t) {
  const d = clamp(dot3(a, b), -1, 1);
  const w = Math.acos(d);
  if (w < 1e-6) return a;
  const s = Math.sin(w), k1 = Math.sin((1 - t) * w) / s, k2 = Math.sin(t * w) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}

class Labels {
  constructor() { this.boxes = []; }
  free(b, pad = 0.5) {
    for (const q of this.boxes) if (!(b[2] + pad < q[0] || b[0] - pad > q[2] || b[3] + pad < q[1] || b[1] - pad > q[3])) return false;
    return true;
  }
  add(b) { this.boxes.push(b); }
}

const PLANET_COLORS = { Mercury: '#b8b1a8', Venus: '#f7e9b7', Mars: '#ff7a4d', Jupiter: '#e8c9a0', Saturn: '#e8d28a', Uranus: '#9be7ea', Neptune: '#6f8dff' };

// ------------------------------------------------------------- main

export function renderPoster(S, cfg, data, opts = {}) {
  const { W, H } = pageDims(cfg);
  const b = cfg.bleed || 0;
  const PW = W + 2 * b, PH = H + 2 * b;
  const sc0 = Math.min(W, H) / 210; // text scale: identical look at every page size
  const meta = { W, H, moon: null, planets: [], stars: 0 };

  // ---------- page background
  S.rect(0, 0, PW, PH, { fill: cfg.pageBg });

  // ---------- text content (laid out first: its height limits the chart)
  const up = (s) => (cfg.uppercase ? s.toUpperCase() : s);
  const lines = [];
  const bodyO = { font: cfg.bodyFont, size: cfg.bodySize * sc0, tracking: cfg.bodyTracking, color: cfg.textColor };
  const titleLines = cfg.title.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 3);
  titleLines.forEach((t, i) => lines.push({ t: up(t), o: { font: cfg.titleFont, size: cfg.titleSize * sc0, tracking: cfg.titleTracking, bold: cfg.titleBold, color: cfg.textColor }, after: i < titleLines.length - 1 ? 0.5 : 1.5 }));
  if (cfg.subtitle) lines.push({ t: up(cfg.subtitle), o: { ...bodyO, size: cfg.bodySize * sc0 * 1.25, font: cfg.titleFont }, after: 1 });
  if (lines.length) lines[lines.length - 1].after = 2.3;
  const bodyLines = [];
  if (cfg.showDate) bodyLines.push(up(formatDate(cfg)));
  if (cfg.showPlace && cfg.placeName) bodyLines.push(up(cfg.placeName));
  if (cfg.showCoords) {
    const c = A.formatCoord(cfg.lat, cfg.lon, cfg.coordFormat);
    bodyLines.push(`${c.lat} | ${c.lon}`);
  }
  if (cfg.footer) for (const f of cfg.footer.split('\n')) bodyLines.push(up(f));
  for (const t of bodyLines) lines.push({ t, o: bodyO, after: 1 });
  const lg = cfg.lineGap * sc0;
  const heights = lines.map((l) => l.o.size * PT);
  const total = lines.reduce((s, l, i) => s + heights[i] + (i < lines.length - 1 ? lg * l.after : 0), 0);
  const tg = cfg.textGap * sc0;

  // ---------- chart geometry
  const isPage = cfg.shape === 'page';
  const ringMode = cfg.ring;
  const circleShape = cfg.shape === 'circle';
  const gap = cfg.ringGap * (W / 210);
  let D = Math.min(W * (cfg.chartSize / 100), H * 0.96);
  if (cfg.shape !== 'page' && cfg.textPos === 'below') D = Math.min(D, H * (1 - cfg.chartTop / 100) - total - tg - H * 0.04);
  D = Math.max(D, 30);
  const sc = D / 150;
  const tickLen = { ticks: 2.2, degrees: 2.2, compass: 2.6 }[ringMode] || 0;
  const labelH = { degrees: 3.4, compass: 4.6 }[ringMode] || 0;
  const wantsFurniture = ringMode !== 'none';
  const tickRing = circleShape && tickLen > 0;
  const furn = !wantsFurniture ? 0 : gap + (tickRing ? (tickLen + labelH) * sc : 0) + (ringMode === 'double' ? 1.4 * sc + cfg.ringWidth * 3 : 0) + cfg.ringWidth;
  const Dshape = isPage ? Math.min(W, H) * (cfg.chartSize / 100) : Math.max(20, D - 2 * furn);
  const info = shapeInfo(isPage ? 'circle' : cfg.shape, Dshape);
  const top = b + H * (cfg.chartTop / 100);
  const cx = b + W / 2;
  const cy = isPage ? b + H / 2 : top + furn + info.height / 2;
  const R = Dshape / 2; // radius the field of view maps to
  const shapePts = isPage ? [[0, 0], [PW, 0], [PW, PH], [0, PH]] : info.pts.map(([x, y]) => [x + cx, y + cy]);
  const Rc = isPage ? Math.hypot(Math.max(cx, PW - cx), Math.max(cy, PH - cy)) : info.rc;
  const shapeBottom = isPage ? b + H : cy + info.height / 2 + furn;

  // ---------- sky frame
  const { jd } = resolveMoment(cfg);
  const M = cfg.frame === 'pole' ? poleMatrix(cfg.lat < 0) : A.horizonMatrix(jd, cfg.lat, cfg.lon);
  const lst = (A.gmst(jd) + cfg.lon + 720) % 360;
  const Mdate = A.ofDateToHorizon(lst, cfg.lat);

  const proj = cfg.projection;
  const F = { stereo: (z) => Math.tan(z / 2), equidistant: (z) => z, equalarea: (z) => 2 * Math.sin(z / 2), ortho: (z) => Math.sin(z) }[proj] || ((z) => Math.tan(z / 2));
  const Finv = { stereo: (u) => 2 * Math.atan(u), equidistant: (u) => u, equalarea: (u) => 2 * Math.asin(clamp(u / 2, -1, 1)), ortho: (u) => Math.asin(clamp(u, -1, 1)) }[proj] || ((u) => 2 * Math.atan(u));
  const fov = clamp(cfg.fov, 20, proj === 'ortho' ? 90 : 170) * D2R;
  const k = R / F(fov);
  const radius = (z) => F(z) * k;
  let zLimit = Finv(Rc * 1.02 / k);
  zLimit = Math.min(zLimit, proj === 'ortho' ? Math.PI / 2 : 170 * D2R);
  if (!cfg.belowHorizon) zLimit = Math.min(zLimit, Math.PI / 2);
  const uMin = Math.cos(zLimit);
  const rBoundary = radius(zLimit);
  const rot = cfg.rotation * D2R, cosR = Math.cos(rot), sinR = Math.sin(rot);
  const mir = cfg.mirror ? -1 : 1;

  const screen = (sx, sy) => [cx + sx * cosR - sy * sinR, cy + sx * sinR + sy * cosR];
  const P = {
    vis: (v) => v[2] >= uMin,
    xy(v) {
      const h = Math.hypot(v[0], v[1]);
      const r = radius(Math.atan2(h, v[2]));
      return h < 1e-12 ? [cx, cy] : screen((-v[0] / h) * r * mir, (-v[1] / h) * r);
    },
    xyClamped(v) {
      if (v[2] >= uMin) return P.xy(v);
      const h = Math.hypot(v[0], v[1]) || 1;
      return screen((-v[0] / h) * rBoundary * mir, (-v[1] / h) * rBoundary);
    },
  };
  const project = (vec) => apply(M, vec);
  const apply = A.apply;

  const inShape = (x, y, shrink = 0.985) => {
    if (isPage) return x > 0 && y > 0 && x < PW && y < PH;
    if (circleShape) return Math.hypot(x - cx, y - cy) <= R * shrink;
    return pointInPoly(shapePts, x, y);
  };
  const boxInside = (bx) => inShape(bx[0], bx[1]) && inShape(bx[2], bx[1]) && inShape(bx[0], bx[3]) && inShape(bx[2], bx[3]);

  /** Split a J2000/horizon polyline into visible runs of screen points (great-circle accurate). */
  function runsOf(hvecs, subdivide = 2.5) {
    const runs = [];
    let run = null;
    const end = () => { if (run && run.length > 1) runs.push(run); run = null; };
    const cross = (a, bb) => {
      let lo = a, hi = bb; // lo visible, hi not
      for (let i = 0; i < 9; i++) { const mid = norm3([lo[0] + hi[0], lo[1] + hi[1], lo[2] + hi[2]]); if (P.vis(mid)) lo = mid; else hi = mid; }
      return lo;
    };
    let prev = hvecs[0], pv = P.vis(prev);
    if (pv) (run = []).push(P.xy(prev));
    for (let i = 1; i < hvecs.length; i++) {
      const cur = hvecs[i];
      const ang = Math.acos(clamp(dot3(prev, cur), -1, 1)) * R2D;
      const n = Math.max(1, Math.ceil(ang / subdivide));
      let a = prev, av = pv;
      for (let s = 1; s <= n; s++) {
        const c = s === n ? cur : slerp(prev, cur, s / n);
        const cv = P.vis(c);
        if (av && cv) run.push(P.xy(c));
        else if (av && !cv) { run.push(P.xy(cross(a, c))); end(); }
        else if (!av && cv) { run = [P.xy(cross(c, a)), P.xy(c)]; }
        a = c; av = cv;
      }
      prev = cur; pv = av;
    }
    end();
    return runs;
  }

  // ---------- background
  S.save();
  S.clipPolygon(shapePts);
  if (cfg.bgMode === 'radial') S.radial(cx, cy, Rc * 1.05, [[0, cfg.bg1], [1, cfg.bg2]]);
  else if (cfg.bgMode === 'vertical') S.vertical(0, cy - Rc, PW, Rc * 2, [[0, cfg.bg1], [1, cfg.bg2]]);
  else S.poly([shapePts], { fill: cfg.bg1 });

  // speckle / dust
  if (cfg.dust && !cfg.nakedEye) {
    const rnd = mulberry32(cfg.seed || 1);
    const n = Math.round(Math.PI * Rc * Rc * 0.16 * cfg.dustAmount);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * Rc;
      const rr = (0.025 + rnd() * rnd() * 0.07) * Math.max(0.7, sc);
      S.circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rr, { fill: cfg.starColor, alpha: 0.05 + rnd() * 0.2 });
    }
  }

  // ---------- Milky Way (soft raster, sampled per pixel for any projection)
  if (cfg.milkyWay && data.milkyWay) {
    const xs = shapePts.map((p) => p[0]), ys = shapePts.map((p) => p[1]);
    const box = [Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys)), Math.min(PW, Math.max(...xs)), Math.min(PH, Math.max(...ys))];
    const Mt = [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
    const img = renderMilkyWay(data.mwField, {
      box, pxPerMm: S.rasterScale(Math.max(box[2] - box[0], box[3] - box[1])), toGalMatrix: A.matMul(GAL, Mt), color: cfg.mwColor, strength: cfg.mwOpacity,
      inverse(x, y) {
        const dx = x - cx, dy = y - cy;
        const sx = dx * cosR + dy * sinR, sy = -dx * sinR + dy * cosR;
        const r = Math.hypot(sx, sy);
        if (r > rBoundary) return null;
        if (r < 1e-9) return [0, 0, 1];
        const z = Finv(r / k), s = Math.sin(z);
        return [(-sx / (r * mir)) * s, (-sy / r) * s, Math.cos(z)];
      },
    });
    S.image(img, box[0], box[1], box[2] - box[0], box[3] - box[1]);
  }

  // ---------- grid & reference circles
  const gridStyle = { stroke: cfg.gridColor, lw: 0.12 * Math.max(0.7, sc), alpha: cfg.gridAlpha };
  const lineSc = Math.max(0.7, sc);
  const gridAz = cfg.grid === 'altaz' || cfg.grid === 'both';
  const gridEq = cfg.grid === 'equatorial' || cfg.grid === 'both';
  const step = cfg.gridStep;
  if (gridAz) {
    const zEdge = Math.min(zLimit, cfg.belowHorizon ? zLimit : Math.PI / 2);
    for (let alt = -85; alt < 90; alt += step) {
      const z = (90 - alt) * D2R;
      if (z > zEdge + 1e-6) continue;
      S.circle(cx, cy, radius(z), { ...gridStyle, alpha: alt === 0 ? Math.min(1, cfg.gridAlpha * 1.8) : cfg.gridAlpha });
    }
    for (let az = 0; az < 360; az += step) {
      const a = az * D2R;
      const [x2, y2] = screen(-Math.sin(a) * radius(zEdge) * mir, -Math.cos(a) * radius(zEdge));
      S.line(cx, cy, x2, y2, gridStyle);
    }
    // altitude labels along the northern axis
    const fs = 4.2 * sc;
    for (let alt = step; alt < 90; alt += step) {
      const r = radius((90 - alt) * D2R);
      const [lx, ly] = screen(0, -r);
      S.text(`${alt}°`, lx + 0.8, ly - 0.6, { size: fs, font: 'sans', color: cfg.gridColor, alpha: Math.min(1, cfg.gridAlpha * 2.4), align: 'left' });
    }
  }
  if (gridEq) {
    const runs = [];
    for (let dec = -90 + step; dec < 90; dec += step) {
      const pts = [];
      for (let ra = 0; ra <= 360; ra += 3) pts.push(project(A.eqToVec(ra, dec)));
      runs.push(...runsOf(pts, 3));
    }
    for (let ra = 0; ra < 360; ra += step) {
      const pts = [];
      for (let dec = -90; dec <= 90; dec += 3) pts.push(project(A.eqToVec(ra, dec)));
      runs.push(...runsOf(pts, 3));
    }
    S.poly(runs, gridStyle);
  }
  const OBL = 23.4392911;
  if (cfg.celestialEquator) {
    const pts = [];
    for (let a = 0; a <= 360; a += 2) pts.push(project(A.eqToVec(a, 0)));
    S.poly(runsOf(pts, 3), { stroke: cfg.gridColor, lw: 0.2 * lineSc, alpha: Math.min(1, cfg.gridAlpha * 2.2), dash: [2 * lineSc, 1 * lineSc] });
  }
  if (cfg.ecliptic) {
    const pts = [];
    for (let l = 0; l <= 360; l += 2) {
      const c = Math.cos(OBL * D2R), s = Math.sin(OBL * D2R);
      pts.push(project([Math.cos(l * D2R), Math.sin(l * D2R) * c, Math.sin(l * D2R) * s]));
    }
    S.poly(runsOf(pts, 3), { stroke: cfg.mono ? cfg.lineColor : '#f2c14e', lw: 0.22 * lineSc, alpha: 0.8, dash: [3 * lineSc, 1.4 * lineSc] });
  }
  if (cfg.belowHorizon && zLimit > Math.PI / 2 + 0.01 && !gridAz && cfg.frame !== 'pole') {
    S.circle(cx, cy, radius(Math.PI / 2), { stroke: cfg.lineColor, lw: 0.2 * lineSc, alpha: 0.6, dash: [1.5 * lineSc, 1 * lineSc] });
  }

  // ---------- constellations
  const dashFor = { solid: [], dashed: [1.6 * lineSc, 0.9 * lineSc], dotted: [0.05, 0.9 * lineSc] }[cfg.lineStyle] || [];
  if (cfg.constBorders) {
    const runs = [];
    for (const l of data.borders) runs.push(...runsOf(l.map(project), 4));
    S.poly(runs, { stroke: cfg.lineColor, lw: 0.1 * lineSc, alpha: cfg.lineAlpha * 0.4, dash: [1.2 * lineSc, 0.8 * lineSc] });
  }
  if (cfg.showConst) {
    const runs = [];
    for (const c of data.constellations) for (const l of c.lines) runs.push(...runsOf(l.map(project), 3));
    S.poly(runs, { stroke: cfg.lineColor, lw: cfg.lineWidth * lineSc, alpha: cfg.lineAlpha, dash: dashFor, cap: cfg.lineStyle === 'dotted' ? 'round' : 'butt' });
  }

  // ---------- deep-sky objects
  const labels = new Labels();
  const labelPt = 5.2 * sc;
  const labelFont = { size: labelPt, font: 'sans', color: cfg.labelColor, align: 'left' };
  const dsoDraw = [];
  if (cfg.dsos) {
    const st = { stroke: cfg.lineColor, lw: 0.13 * lineSc, alpha: 0.9 };
    for (const o of data.dsos) {
      if (o.mag > (cfg.nakedEye ? Math.min(cfg.dsoMag, 6) : cfg.dsoMag)) continue;
      const v = project(o.vec);
      if (!P.vis(v)) continue;
      const [x, y] = P.xy(v);
      if (!inShape(x, y)) continue;
      const r = 1.2 * sc;
      if (o.type === 'gx') {
        const pts = [];
        for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const ex = Math.cos(a) * r * 1.5, ey = Math.sin(a) * r * 0.65; pts.push([x + ex * 0.87 - ey * 0.5, y + ex * 0.5 + ey * 0.87]); }
        S.poly([pts], st, { closed: true });
      } else if (o.type === 'oc' || o.type === 'sd') {
        S.circle(x, y, r, { ...st, dash: [0.5 * sc, 0.5 * sc] });
      } else if (o.type === 'gc') {
        S.circle(x, y, r, st); S.line(x - r, y, x + r, y, st); S.line(x, y - r, x, y + r, st);
      } else if (o.type === 'pn') {
        S.circle(x, y, r * 0.6, st);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) S.line(x + dx * r * 0.6, y + dy * r * 0.6, x + dx * r * 1.3, y + dy * r * 1.3, st);
      } else {
        S.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8, st);
      }
      if (cfg.dsoLabels && /^M\d+$/.test(o.name)) dsoDraw.push({ x: x + r + 0.7, y: y + labelPt * PT * 0.3, t: o.name });
    }
  }

  // ---------- stars
  const cat = data.catalog;
  const lim = cfg.nakedEye ? Math.min(cfg.limMag, 6) : cfg.limMag;
  const p = 0.6 + 0.4 * cfg.sizeContrast;
  const starR = (mag) => sc * cfg.starSize * (0.05 + 0.062 * Math.pow(Math.max(0, 7.6 - mag), p));
  const bins = [];
  for (let i = 0; i < 40; i++) {
    const bv = -0.4 + (i / 39) * 2.4;
    const c = A.bvToColor(bv).map((v) => Math.round(255 - (255 - v) * cfg.starSat));
    bins.push('#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''));
  }
  const realistic = cfg.starMode === 'realistic';
  const rc2 = (Rc * 1.02) ** 2;
  const spikes = [];
  const starBoxes = []; // bright stars keep labels off them (print-friendly charts)
  let drawn = 0;
  for (let i = 0; i < cat.n; i++) {
    let mag = cat.mag[i];
    if (mag > lim + 0.01) continue;
    const x0 = cat.x[i], y0 = cat.y[i], z0 = cat.z[i];
    const U = M[6] * x0 + M[7] * y0 + M[8] * z0;
    if (U < uMin) continue;
    const E = M[0] * x0 + M[1] * y0 + M[2] * z0;
    const N = M[3] * x0 + M[4] * y0 + M[5] * z0;
    if (cfg.extinction && U > 0) {
      const air = 1 / (U + 0.025 * Math.exp(-11 * U));
      mag += 0.22 * (air - 1);
      if (mag > lim) continue;
    }
    const h = Math.hypot(E, N);
    const r = radius(Math.atan2(h, U));
    const sx = h < 1e-12 ? 0 : (-E / h) * r * mir, sy = h < 1e-12 ? 0 : (-N / h) * r;
    const x = cx + sx * cosR - sy * sinR, y = cy + sx * sinR + sy * cosR;
    if ((x - cx) ** 2 + (y - cy) ** 2 > rc2) continue;
    const rr = starR(mag);
    const alpha = cfg.fadeFaint ? clamp(0.4 + 0.6 * ((lim - mag) / 2.5), 0.4, 1) : 1;
    const fill = realistic ? bins[clamp(Math.round(((cat.bv[i] + 0.4) / 2.4) * 39), 0, 39)] : cfg.starColor;
    if (cfg.starStyle === 'glow' && mag < 3.6) {
      const g = clamp((3.6 - mag) / 4, 0.1, 1);
      S.circle(x, y, rr * 3, { fill, alpha: 0.05 * g + 0.02 });
      S.circle(x, y, rr * 1.9, { fill, alpha: 0.1 * g + 0.03 });
    }
    S.circle(x, y, rr, { fill, alpha });
    if (cfg.starStyle === 'spikes' && mag < 2.2) spikes.push([x, y, rr, fill]);
    if (cfg.mono && mag < 4.6) starBoxes.push([x - rr - 0.2, y - rr - 0.2, x + rr + 0.2, y + rr + 0.2]);
    drawn++;
  }
  for (const [x, y, rr, fill] of spikes) {
    const L = rr * 5.5;
    const st = { stroke: fill, lw: 0.1 * lineSc, alpha: 0.75, cap: 'round' };
    S.line(x - L, y, x + L, y, st); S.line(x, y - L, x, y + L, st);
  }
  meta.stars = drawn;

  // ---------- Sun, Moon, planets
  const bodies = [];
  if (cfg.planets || cfg.sun || cfg.moon) {
    for (const bd of A.solarSystem(jd)) {
      if (bd.kind === 'planet' && !cfg.planets) continue;
      if (cfg.nakedEye && (bd.name === 'Uranus' || bd.name === 'Neptune')) continue;
      if (bd.kind === 'sun' && !cfg.sun) continue;
      if (bd.kind === 'moon' && !cfg.moon) continue;
      const hv = apply(Mdate, A.eqToVec(bd.ra, bd.dec));
      if (!P.vis(hv)) continue;
      const [x, y] = P.xy(hv);
      if (!inShape(x, y, 1)) continue;
      bodies.push({ ...bd, hv, x, y });
    }
    for (const bd of bodies) {
      if (bd.kind === 'planet') {
        const col = cfg.planetColors ? PLANET_COLORS[bd.name] : cfg.starColor;
        const r = Math.max(starR(bd.mag) * 0.9, 0.7 * sc);
        S.circle(bd.x, bd.y, r * 2.3, { stroke: col, lw: 0.14 * lineSc, alpha: 0.9 });
        S.circle(bd.x, bd.y, r, { fill: col });
        meta.planets.push(bd.name);
        if (cfg.planetLabels) dsoDraw.push({ x: bd.x + r * 2.3 + 0.8, y: bd.y + labelPt * PT * 0.3, t: bd.name.toUpperCase(), planet: true });
      } else if (bd.kind === 'sun') {
        const r = 2.4 * sc * cfg.sunSize;
        const st = { stroke: '#ffcf4a', lw: 0.2 * lineSc, cap: 'round' };
        for (let i = 0; i < 12; i++) { const a = (i * 30) * D2R; S.line(bd.x + Math.cos(a) * r * 1.35, bd.y + Math.sin(a) * r * 1.35, bd.x + Math.cos(a) * r * 2, bd.y + Math.sin(a) * r * 2, st); }
        S.circle(bd.x, bd.y, r, { fill: '#ffd85e' });
        if (cfg.planetLabels) dsoDraw.push({ x: bd.x + r * 2.2, y: bd.y + labelPt * PT * 0.3, t: 'SUN', planet: true });
      } else if (bd.kind === 'moon') {
        const r = 3.4 * sc * cfg.moonSize;
        const sunV = apply(Mdate, A.eqToVec(bd.sunRa, bd.sunDec));
        const t = norm3([sunV[0] - dot3(sunV, bd.hv) * bd.hv[0], sunV[1] - dot3(sunV, bd.hv) * bd.hv[1], sunV[2] - dot3(sunV, bd.hv) * bd.hv[2]]);
        const near = P.xy(norm3([bd.hv[0] + 0.02 * t[0], bd.hv[1] + 0.02 * t[1], bd.hv[2] + 0.02 * t[2]]));
        const ang = Math.atan2(near[1] - bd.y, near[0] - bd.x);
        const dark = cfg.moonDark || lerpColor(cfg.bg1, cfg.moonColor, 0.16);
        S.circle(bd.x, bd.y, r, { fill: dark, stroke: cfg.moonStroke || cfg.moonColor, lw: 0.14 * lineSc, alpha: 1 });
        const k2 = 2 * bd.illum - 1;
        const poly = [];
        for (let a = -90; a <= 90; a += 6) poly.push([r * Math.cos(a * D2R), r * Math.sin(a * D2R)]);
        for (let a = 90; a >= -90; a -= 6) poly.push([-r * Math.cos(a * D2R) * k2, r * Math.sin(a * D2R)]);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        if (bd.illum > 0.01) S.poly([poly.map(([px, py]) => [bd.x + px * ca - py * sa, bd.y + px * sa + py * ca])], { fill: cfg.moonColor }, { closed: true });
        meta.moon = { name: A.moonPhaseName(bd.illum, bd.waxing), illum: bd.illum };
        if (cfg.planetLabels) dsoDraw.push({ x: bd.x + r + 0.9, y: bd.y + labelPt * PT * 0.3, t: 'MOON', planet: true });
      }
    }
  }

  // ---------- comet and shooting star
  const polar = (angDeg, distPct) => [cx + (distPct / 100) * R * Math.sin(angDeg * D2R), cy - (distPct / 100) * R * Math.cos(angDeg * D2R)];
  if (cfg.comet) {
    const [x, y] = polar(cfg.cometAngle, cfg.cometDist);
    const col = cfg.mono ? '#000000' : cfg.cometColor || cfg.starColor;
    const size = 2.1 * sc * cfg.cometSize;
    drawComet(S, x, y, { size, tailAngle: cfg.cometTailAngle, tailLen: 40 * sc * cfg.cometSize * cfg.cometTail, color: col, mono: cfg.mono, bg: cfg.pageBg });
    meta.comet = { x, y };
    if (cfg.cometName) dsoDraw.push({ x: x + size * 2.6, y: y + labelPt * PT * 0.3, t: cfg.cometName.toUpperCase(), planet: true });
  }
  if (cfg.shootingStar && !cfg.mono) {
    const [x, y] = polar(cfg.ssAngle, cfg.ssDist);
    drawShootingStar(S, x, y, { size: 0.55 * sc * cfg.ssSize, dir: cfg.ssDir, len: 30 * sc * cfg.ssSize, color: cfg.ssColor || cfg.starColor });
  }

  // ---------- labels
  for (const bx of starBoxes) labels.add(bx);
  // white knock-out behind labels so lines and stars never run through the lettering (monochrome charts)
  const knock = (bx) => { if (cfg.mono) S.rect(bx[0] - 0.4, bx[1] - 0.15, bx[2] - bx[0] + 0.8, bx[3] - bx[1] + 0.35, { fill: cfg.pageBg, alpha: 0.9 }); };
  const textStyle = (o) => ({ ...labelFont, ...o });
  if (cfg.mono) { // planets, Sun and Moon get their labels first
    for (let i = dsoDraw.length - 1; i >= 0; i--) {
      const d = dsoDraw[i];
      if (!d.planet) continue;
      dsoDraw.splice(i, 1);
      const o = textStyle({ tracking: 0.08 });
      const w = S.textWidth(d.t, o);
      for (const [ox, oy] of [[0, 0], [-w - 6 * sc, 0], [0, -3.2 * sc], [0, 3.2 * sc]]) {
        const bx = [d.x + ox, d.y + oy - labelPt * PT * 1.1, d.x + ox + w, d.y + oy + labelPt * PT * 0.2];
        if (!boxInside(bx) || !labels.free(bx, 0.3)) continue;
        labels.add(bx); knock(bx); S.text(d.t, d.x + ox, d.y + oy, o);
        break;
      }
    }
  }
  if (cfg.lore) {
    const dot = { stroke: cfg.labelColor, lw: 0.14 * lineSc, alpha: 0.75, dash: [0.05, 0.85 * lineSc], cap: 'round' };
    const nameO = textStyle({ size: labelPt * 1.3, italic: true, tracking: 0.05, align: 'center' });
    const subO = textStyle({ size: labelPt * 1.05, italic: true, tracking: 0.04, align: 'center', alpha: 0.85 });
    const line = labelPt * PT * 1.5;
    for (const e of loreFor(cfg.loreTradition, data)) {
      let pts = [], anchor;
      if (e.milky) { // walk along the galactic plane until a spot on the chart takes the label
        const cand = [];
        for (let l = 0; l < 360; l += 15) {
          const c = Math.cos(l * D2R), sn = Math.sin(l * D2R);
          const eq = [GAL[0] * c + GAL[3] * sn, GAL[1] * c + GAL[4] * sn, GAL[2] * c + GAL[5] * sn];
          const v = project(eq);
          if (P.vis(v)) { const [x, y] = P.xy(v); if (inShape(x, y, 0.8)) cand.push([x, y]); }
        }
        cand.sort((a, b2) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b2[0] - cx, b2[1] - cy));
        anchor = { cands: cand.slice(0, 6), center: true };
      } else {
        const groups = e.groups.map((g) => g.map(project));
        if (groups.flat().some((v) => !P.vis(v))) continue;
        pts = groups.map((g) => g.map((v) => P.xy(v)));
        if (pts.flat().some((q) => !inShape(q[0], q[1]))) continue;
        const xs = pts.flat().map((q) => q[0]), ys = pts.flat().map((q) => q[1]);
        const single = pts.flat().length === 1;
        anchor = single
          ? { cands: [[xs[0] + 2.6 * sc, ys[0] + 0.4 * sc, 'left'], [xs[0] - 2.6 * sc, ys[0] + 0.4 * sc, 'right']] }
          : { cands: [[(Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...ys) + 4.4 * sc, 'center'], [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...ys) - 3.4 * sc - (e.meaning ? line : 0), 'center']] };
      }
      const lines2 = e.meaning ? 2 : 1;
      let placed = false;
      for (const cnd of anchor.cands) {
        const align = anchor.center ? 'center' : cnd[2];
        const w = Math.max(S.textWidth(e.name, { ...nameO, align }), e.meaning ? S.textWidth(e.meaning, subO) : 0);
        const x0 = align === 'left' ? cnd[0] : align === 'right' ? cnd[0] - w : cnd[0] - w / 2;
        const bx = [x0, cnd[1] - labelPt * PT * 0.85, x0 + w, cnd[1] + line * (lines2 - 1) + labelPt * PT * 0.3];
        if (!boxInside(bx) || !labels.free(bx, 0.6)) continue;
        labels.add(bx);
        knock(bx);
        const tx = align === 'left' ? x0 : align === 'right' ? x0 + w : x0 + w / 2;
        S.text(e.name, tx, cnd[1], { ...nameO, align });
        if (e.meaning) S.text(e.meaning, tx, cnd[1] + line, { ...subO, align });
        placed = true;
        break;
      }
      if (!placed) continue;
      for (const g of pts) {
        if (g.length > 1) S.poly([g], dot);
        else S.circle(g[0][0], g[0][1], 1.5 * sc, { stroke: cfg.labelColor, lw: 0.14 * lineSc, alpha: 0.75 });
      }
    }
  }
  if (cfg.starNames > 0) {
    let count = 0;
    for (const n of data.names) {
      if (count >= cfg.starNames) break;
      if (n.mag > lim) continue;
      const v = project(n.vec);
      if (!P.vis(v)) continue;
      const [x, y] = P.xy(v);
      const rr = starR(n.mag);
      const o = textStyle({ tracking: 0.05 });
      const w = S.textWidth(n.name, o);
      const bx = [x + rr + 0.9, y - labelPt * PT * 0.8, x + rr + 0.9 + w, y + labelPt * PT * 0.35];
      if (!boxInside(bx) || !labels.free(bx)) continue;
      labels.add(bx);
      knock(bx);
      S.text(n.name, bx[0], y + labelPt * PT * 0.3, o);
      count++;
    }
  }
  if (cfg.constNames !== 'off') {
    for (const c of data.constellations) {
      if (!c.lines.length) continue;
      const v = project(c.vec);
      if (!P.vis(v)) continue;
      const [x, y] = P.xy(v);
      const str = (cfg.constNames === 'abbr' ? c.id : c.la).toUpperCase();
      const o = textStyle({ size: labelPt * 0.95, tracking: cfg.constNames === 'abbr' ? 0.2 : 0.26, align: 'center', alpha: 0.85 });
      const w = S.textWidth(str, o);
      // monochrome charts try nearby spots when the first one is crowded
      const tries = cfg.mono ? [[0, 0], [0, -3.6], [0, 3.6], [-7, 0], [7, 0], [0, -7], [0, 7], [-9, -3.6], [9, 3.6]] : [[0, 0]];
      for (const [ox, oy] of tries) {
        const tx = x + ox * sc, ty = y + oy * sc;
        const bx = [tx - w / 2, ty - labelPt * PT * 0.8, tx + w / 2, ty + labelPt * PT * 0.3];
        if (!boxInside(bx) || !labels.free(bx, 1.2)) continue;
        labels.add(bx);
        knock(bx);
        S.text(str, tx, ty, o);
        break;
      }
    }
  }
  for (const d of dsoDraw) {
    const o = textStyle({ tracking: 0.08, color: d.planet ? cfg.labelColor : cfg.labelColor });
    const w = S.textWidth(d.t, o);
    const bx = [d.x, d.y - labelPt * PT * 1.1, d.x + w, d.y + labelPt * PT * 0.2];
    if (!boxInside(bx) || !labels.free(bx, 0.3)) continue;
    labels.add(bx);
    knock(bx);
    S.text(d.t, d.x, d.y, o);
  }
  S.restore();

  // ---------- ring / outline / compass
  const rw = cfg.ringWidth * Math.max(0.7, sc);
  if (wantsFurniture) {
    const stR = { stroke: cfg.ringColor, lw: rw };
    const g0 = gap;
    if (circleShape) {
      const r0 = R + g0;
      S.circle(cx, cy, r0, stR);
      if (ringMode === 'double') S.circle(cx, cy, r0 + 1.4 * sc + rw * 2, { ...stR, lw: rw * 0.5 });
      if (tickRing) {
        const az2xy = (deg, r) => { const a = deg * D2R; return screen(-Math.sin(a) * r * mir, -Math.cos(a) * r); };
        const segs = [];
        const segs2 = [];
        for (let d = 0; d < 360; d += 1) {
          const len = (d % 45 === 0 ? 1 : d % 15 === 0 ? 0.68 : d % 5 === 0 ? 0.42 : 0.2) * tickLen * sc;
          (d % 5 === 0 ? segs2 : segs).push([az2xy(d, r0), az2xy(d, r0 + len)]);
        }
        S.poly(segs, { stroke: cfg.ringColor, lw: rw * 0.45 });
        S.poly(segs2, { stroke: cfg.ringColor, lw: rw * 0.8 });
        const rl = r0 + tickLen * sc + 1.1 * sc;
        if (ringMode === 'degrees') {
          for (let d = 0; d < 360; d += 30) {
            const [x, y] = az2xy(d, rl + 1.0 * sc);
            S.text(`${d}°`, x, y + 1.2 * sc, { size: 4.4 * sc, font: 'sans', color: cfg.ringColor, align: 'center', tracking: 0.05 });
          }
        } else if (ringMode === 'compass') {
          const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
          names.forEach((nm, i) => {
            const big = i % 2 === 0;
            const [x, y] = az2xy(i * 45, rl + (big ? 1.7 : 1.1) * sc);
            S.text(nm, x, y + (big ? 1.7 : 1.2) * sc, { size: (big ? 7 : 4.2) * sc, font: 'sans', bold: big, color: cfg.ringColor, align: 'center', tracking: 0.05 });
          });
        }
      }
    } else if (!isPage) {
      const outline = shapeInfo(cfg.shape, Dshape + 2 * g0).pts.map(([x, y]) => [x + cx, y + cy]);
      S.poly([outline], stR, { closed: true });
      if (ringMode === 'double') {
        const o2 = shapeInfo(cfg.shape, Dshape + 2 * g0 + 2 * (1.4 * sc + rw * 2)).pts.map(([x, y]) => [x + cx, y + cy]);
        S.poly([o2], { ...stR, lw: rw * 0.5 }, { closed: true });
      }
    }
  }

  // ---------- page border
  if (cfg.pageBorder !== 'none') {
    const i0 = b + cfg.borderInset * sc0;
    const bs = { stroke: cfg.textColor, lw: 0.35 * sc0 };
    S.rect(i0, i0, PW - 2 * i0, PH - 2 * i0, bs);
    if (cfg.pageBorder === 'double') S.rect(i0 + 1.6 * sc0, i0 + 1.6 * sc0, PW - 2 * i0 - 3.2 * sc0, PH - 2 * i0 - 3.2 * sc0, { ...bs, lw: 0.15 * sc0 });
  }

  // ---------- text block
  let yTop;
  if (cfg.textPos === 'above') yTop = top - tg - total;
  else if (cfg.textPos === 'overlay') yTop = b + H - H * 0.07 - total;
  else yTop = shapeBottom + tg;
  const align = cfg.textAlign;
  const tx = align === 'left' ? cx - Dshape / 2 - (furn || 0) : cx;
  let y = yTop;
  lines.forEach((l, i) => {
    y += heights[i] * 0.78;
    S.text(l.t, tx, y, { ...l.o, align });
    y += heights[i] * 0.22 + (i < lines.length - 1 ? lg * l.after : 0);
  });
  meta.textBottom = y;
  meta.chart = { cx, cy, R, D: Dshape };
  return meta;
}
