// Milky Way as a soft brightness field.
//
// The catalog gives five nested brightness contours (the belt is the region between
// two loops around the galactic caps, with holes and islands). Those loops are simple
// closed curves in galactic coordinates, so we rasterise them there (even-odd, via
// canvas XOR), blur the result, and later sample it per pixel for any projection.

import { R2D } from './astro.js';

// J2000 equatorial -> galactic rotation
const G = [-0.0548755604, -0.8734370902, -0.4838350155, 0.4941094279, -0.44482963, 0.7469822445, -0.867666149, -0.1980763734, 0.4559837762];
export const GAL = G;

const WEIGHTS = [0.25, 0.4, 0.6, 0.85, 1.1];

function toGalactic(v) {
  const x = G[0] * v[0] + G[1] * v[1] + G[2] * v[2];
  const y = G[3] * v[0] + G[4] * v[1] + G[5] * v[2];
  const z = G[6] * v[0] + G[7] * v[1] + G[8] * v[2];
  return [((Math.atan2(y, x) * R2D) + 360) % 360, Math.asin(Math.max(-1, Math.min(1, z))) * R2D];
}

function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < H; y++) { // horizontal, wrapping in longitude
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * W + ((x + W) % W)];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = s / n;
      s += src[y * W + ((x + r + 1) % W)] - src[y * W + ((x - r + W) % W)];
    }
  }
  for (let x = 0; x < W; x++) { // vertical, clamped at the poles
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = s / n;
      s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

export function buildMilkyWayField(levels, W = 720, H = 360) {
  // Every ring is a simple closed loop in galactic (l, b). Loops that circle a galactic pole are
  // closed through that pole. Winding decides what a ring means: clockwise loops add light (islands),
  // counter-clockwise loops remove it (holes, or the caps either side of the belt). Rings are drawn
  // once each on a canvas three sheets wide and the sheets are then folded onto one 360-degree strip.
  const make = () => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(3 * W, H) : Object.assign(document.createElement('canvas'), { width: 3 * W, height: H }));
  let field = new Float32Array(W * H);
  levels.forEach((rings, li) => {
    const cvs = [make(), make()];
    const ctxs = cvs.map((c) => { const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; return x; });
    for (const ring of rings) {
      const pts = [];
      let prev = null, off = 0;
      for (const v of ring) {
        const [l, b] = toGalactic(v);
        let L = l + off;
        if (prev !== null) {
          while (L - prev > 180) { off -= 360; L -= 360; }
          while (L - prev < -180) { off += 360; L += 360; }
        }
        prev = L;
        pts.push([L, b]);
      }
      if (Math.abs(pts[pts.length - 1][0] - pts[0][0]) > 180) { // loop around a galactic pole
        const mean = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const pole = mean > 0 ? 90 : -90;
        pts.push([pts[pts.length - 1][0], pole], [pts[0][0], pole]);
      }
      let area = 0;
      for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; area += pts[i][0] * q[1] - q[0] * pts[i][1]; }
      const ctx = ctxs[area < 0 ? 0 : 1]; // 0 = clockwise (adds light), 1 = counter-clockwise (removes it)
      const meanL = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const shift = 360 * Math.round((540 - meanL) / 360);
      ctx.beginPath();
      pts.forEach(([L, b], i) => { const x = ((L + shift) / 360) * W, y = ((90 - b) / 180) * H; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.fill();
    }
    const fold = (ctx) => {
      const px = ctx.getImageData(0, 0, 3 * W, H).data, out = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * 3 * W + x) * 4 + 3;
        out[y * W + x] = (px[o] + px[o + 4 * W] + px[o + 8 * W]) / 255;
      }
      return out;
    };
    const pos = fold(ctxs[0]), neg = fold(ctxs[1]);
    const rowMean = (arr, y) => { let s = 0; for (let x = 0; x < W; x++) s += arr[y * W + x]; return s / W; };
    const wN = rowMean(pos, 0) - rowMean(neg, 0), wS = rowMean(pos, H - 1) - rowMean(neg, H - 1);
    const base = Math.max(0, -Math.min(wN, wS));
    for (let i = 0; i < W * H; i++) field[i] += WEIGHTS[li] * Math.min(1, Math.max(0, base + pos[i] - neg[i]));
  });
  field = boxBlur(boxBlur(field, W, H, 2), W, H, 2);
  return { W, H, data: field };
}

/**
 * Rasterise the field for a projection. `inverse(dx, dy)` maps a point (mm, relative to the
 * chart centre) to a horizon-frame unit vector [E,N,U], or null when outside the sky.
 */
export function renderMilkyWay(field, { box, pxPerMm, toGalMatrix, inverse, color, strength }) {
  const [x0, y0, x1, y1] = box;
  const w = Math.max(2, Math.round((x1 - x0) * pxPerMm)), h = Math.max(2, Math.round((y1 - y0) * pxPerMm));
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const { W, H, data } = field;
  const T = toGalMatrix;
  const rgb = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  for (let j = 0; j < h; j++) {
    const my = y0 + ((j + 0.5) / h) * (y1 - y0);
    for (let i = 0; i < w; i++) {
      const v = inverse(x0 + ((i + 0.5) / w) * (x1 - x0), my);
      if (!v) continue;
      const gx = T[0] * v[0] + T[1] * v[1] + T[2] * v[2];
      const gy = T[3] * v[0] + T[4] * v[1] + T[5] * v[2];
      const gz = T[6] * v[0] + T[7] * v[1] + T[8] * v[2];
      let u = (Math.atan2(gy, gx) / (2 * Math.PI)) * W;
      if (u < 0) u += W;
      const t = (0.5 - Math.asin(gz > 1 ? 1 : gz < -1 ? -1 : gz) / Math.PI) * H - 0.5;
      const u0 = Math.floor(u - 0.5), fu = u - 0.5 - u0, t0 = Math.floor(t), ft = t - t0;
      const ua = ((u0 % W) + W) % W, ub = (ua + 1) % W;
      const ta = Math.min(H - 1, Math.max(0, t0)), tb = Math.min(H - 1, Math.max(0, t0 + 1));
      const val = (data[ta * W + ua] * (1 - fu) + data[ta * W + ub] * fu) * (1 - ft) + (data[tb * W + ua] * (1 - fu) + data[tb * W + ub] * fu) * ft;
      const a = Math.min(0.85, val * 0.12 * strength);
      const o = (j * w + i) * 4;
      d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
