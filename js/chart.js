// Stargazing charts, printed in black and white so any printer will do.
//
//  * Planisphere: a star wheel (page 1) and a horizon-window cover (page 2). Pin them together, turn the
//    wheel until the date meets the time, and the window shows the sky.
//  * Sky overhead: a single zenith chart for one date, time and place, like the poster but built for use
//    outside: compass ring, altitude circles, the visible planets and the Moon, and a short how-to.

import * as A from './astro.js';
import { renderPoster, pageDims, resolveMoment } from './scene.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const PT = 25.4 / 72;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const CHART_KINDS = ['planisphere', 'zenith'];
export const chartParts = (cfg) => (cfg.chartKind === 'zenith' ? ['sky'] : ['wheel', 'cover']);

/** Everything on a chart is black on white: no tints to waste ink, nothing that depends on colour. */
const MONO = {
  pageBg: '#ffffff', bgMode: 'solid', bg1: '#ffffff', bg2: '#ffffff', starMode: 'single', starColor: '#000000', starSat: 0, starStyle: 'dot',
  fadeFaint: false, lineColor: '#000000', lineAlpha: 0.7, lineWidth: 0.12, labelColor: '#000000', gridColor: '#000000', gridAlpha: 0.35,
  ringColor: '#000000', textColor: '#000000', mwColor: '#000000', moonColor: '#ffffff', moonDark: '#000000', moonStroke: '#000000',
  credit: true, // the small Overhead credit is always printed on charts
  dust: false, planetColors: false, mono: true, // the Milky Way stays available, as a soft grey wash
};
export const monoCfg = (cfg) => ({ ...cfg, ...MONO });

export function chartPageDims(cfg) {
  return pageDims({ ...cfg, orientation: 'portrait' });
}

// Radial functions of the angle from the pole: the wheel and the cover must use the same one.
const PROJ = {
  equidistant: { F: (z) => z, Finv: (u) => u },
  stereo: { F: (z) => Math.tan(z / 2), Finv: (u) => 2 * Math.atan(u) },
  equalarea: { F: (z) => 2 * Math.sin(z / 2), Finv: (u) => 2 * Math.asin(Math.min(1, u / 2)) },
};

export function chartGeometry(cfg) {
  const { W, H } = chartPageDims(cfg);
  const b = cfg.bleed || 0;
  const sc = Math.min(W, H) / 210;
  const margin = 10 * sc, band = 9 * sc;
  const pocket = !!cfg.chartPocket && cfg.chartKind !== 'zenith'; // pocket cover instead of a pin
  const Rw = W / 2 - margin; // outer edge of the wheel (date scale)
  const Rs = Rw - band; // edge of the star map
  const phi = Math.abs(cfg.lat), south = cfg.lat < 0;
  const proj = PROJ[cfg.chartProjection] || PROJ.equidistant;
  const projection = PROJ[cfg.chartProjection] ? cfg.chartProjection : 'equidistant';
  // The farthest horizon point (180 - latitude from the pole) lands just inside the hour scale.
  const Rh = Rs - 8 * sc;
  const psiH = (180 - phi) * D2R;
  const psiMax = Math.min(170, proj.Finv((proj.F(psiH) * Rs) / (Rh - 7 * sc)) / D2R); // 7 mm spare for the N/E/S/W labels
  const cy = b + W / 2, Wp = Rw + 3 * sc, yF = cy + Rw + 3 * sc; // pocket: half-width, fold line, flap height
  const Hf = Math.min(0.92 * Rw, b + H - 19 * sc - yF); // the flap stops above the footer logo
  return { W, H, b, sc, margin, band, Rw, Rs, Rh, cx: b + W / 2, cy, Wp, yF, Hf, phi, pocket, south, s: south ? -1 : 1, psiMax, projection, F: proj.F, k: Rs / proj.F(psiMax * D2R) };
}

/** Maps a horizon-frame unit vector (E, N, Up) to a point on the cover, same scale as the wheel. */
export function horizonMapper(g) {
  const p = g.phi * D2R;
  const P = g.south ? [0, -Math.cos(p), Math.sin(p)] : [0, Math.cos(p), Math.sin(p)];
  const up = g.south ? [0, Math.sin(p), Math.cos(p)] : [0, -Math.sin(p), Math.cos(p)];
  const right = [g.south ? -1 : 1, 0, 0];
  return (v) => {
    const c = dot(v, P);
    const vp = [v[0] - c * P[0], v[1] - c * P[1], v[2] - c * P[2]];
    const n = Math.hypot(vp[0], vp[1], vp[2]);
    if (n < 1e-9) return [g.cx, g.cy];
    const r = g.k * g.F(Math.acos(Math.max(-1, Math.min(1, c))));
    return [g.cx + (r * dot(vp, right)) / n, g.cy - (r * dot(vp, up)) / n];
  };
}

const fmtMag = (m) => (m < 0 ? '-' : '') + Math.abs(m).toFixed(1);

/** Where the Sun, Moon and planets are, for the zenith chart's notes. */
export function skyNotes(cfg) {
  const { jd, date } = resolveMoment(cfg);
  const lst = (A.gmst(jd) + cfg.lon + 720) % 360;
  const Mh = A.ofDateToHorizon(lst, cfg.lat);
  const where = (b) => {
    const v = A.apply(Mh, A.eqToVec(b.ra, b.dec));
    const alt = Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D;
    const az = (Math.atan2(v[0], v[1]) * R2D + 360) % 360;
    return { alt, dir: COMPASS[Math.round(az / 22.5) % 16] };
  };
  const bodies = A.solarSystem(jd);
  const sun = bodies.find((x) => x.kind === 'sun');
  const sunAlt = where(sun).alt;
  const moon = bodies.find((x) => x.kind === 'moon');
  const mw = where(moon);
  const planets = bodies
    .filter((x) => x.kind === 'planet' && !(cfg.nakedEye && (x.name === 'Uranus' || x.name === 'Neptune')))
    .map((x) => ({ name: x.name, mag: x.mag, ...where(x) }))
    .filter((x) => x.alt > 3)
    .sort((a, b) => a.mag - b.mag);
  const light = sunAlt > -0.8 ? 'The Sun is up: this is a daytime sky, so few stars would really be visible.' : sunAlt > -18 ? `Twilight: the Sun is ${Math.abs(sunAlt).toFixed(0)}° below the horizon, so only the brightest stars show yet.` : 'Fully dark.';
  return {
    when: `${cfg.date} ${cfg.time} local · ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    light,
    moon: `${A.moonPhaseName(moon.illum, moon.waxing)}, ${Math.round(moon.illum * 100)}% lit · ${mw.alt > 0 ? `${mw.dir}, ${mw.alt.toFixed(0)}° up` : 'below the horizon'}`,
    planets: planets.map((p) => `${p.name}: ${p.dir}, ${p.alt.toFixed(0)}° up (mag ${fmtMag(p.mag)})`),
  };
}

export function chartNotes(cfg) {
  const g = chartGeometry(cfg);
  const hemi = g.south ? 'S' : 'N';
  const std = A.standardOffsetHours(cfg.tz, cfg.lon);
  const corr = Math.round(4 * (cfg.lon - 15 * std.hours)); // mean solar time = standard time + corr (minutes)
  const lat = `${g.phi.toFixed(2)}°${hemi}`;
  const lon = `${Math.abs(cfg.lon).toFixed(2)}°${cfg.lon >= 0 ? 'E' : 'W'}`;
  const lo = Math.max(0, g.phi - 6), hi = Math.min(90, g.phi + 6);
  const clock = Math.abs(corr) < 2 ? 'Clock time and chart time agree to within a couple of minutes.' : `Clock time = chart time ${corr < 0 ? '+' : '-'} ${Math.abs(corr)} min.`;
  const zenith = cfg.chartKind === 'zenith';
  return {
    title: cfg.chartTitle || (zenith ? 'Sky Overhead' : `${g.south ? 'Southern' : 'Northern'} Sky Planisphere`),
    place: [cfg.placeName, `${lat}, ${lon}`].filter(Boolean).join('  ·  '),
    range: `Best between ${lo.toFixed(0)}°${hemi} and ${hi.toFixed(0)}°${hemi}.`,
    clock,
    time: `Hours on the cover are local mean solar time. ${clock}${std.dst ? ' Add 1 hour during daylight saving time.' : ''}`,
    zone: std.name,
    hemi,
    far: g.south ? 'N' : 'S', // the compass point opposite the elevated pole
    howTo: [
      cfg.chartPocket
        ? 'Cut out the star wheel (page 1) and the cover (page 2). Cut away the window, fold the cover flap up, slide the wheel into the pocket and tape the flap to the front.'
        : 'Cut out the star wheel (page 1) and the cover (page 2). Cut away the window, then join them at the centre with a paper fastener. Laminating both pieces first keeps the hole from tearing.',
      "Turn the wheel until today's date meets the time you are observing, read from the hour scale on the cover.",
      `Hold it overhead and turn so the compass direction you face (${hemi}, E, ${g.south ? 'N' : 'S'} or W) is at the bottom. The window shows the sky.`,
      'Stars near the window edge are low in the sky; the centre is straight overhead.',
    ],
    howToZenith: [
      'Let your eyes adapt for 10 to 15 minutes away from bright lights. A red torch keeps your night vision.',
      'Hold the chart above your head with the compass direction you are facing at the bottom. The centre is straight up; the outer circle is the horizon.',
      "The inner circles mark 30° and 60° of height. A fist at arm's length is about 10°.",
      'Planets are ringed and named; the Moon shows its phase. Stars are drawn larger the brighter they are.',
    ],
  };
}

const pt = (cx, cy, theta, r) => [cx + r * Math.sin(theta * D2R), cy - r * Math.cos(theta * D2R)];

function wrap(S, str, maxW, o) {
  const out = [];
  let cur = '';
  for (const w of str.split(/\s+/)) {
    const t = cur ? `${cur} ${w}` : w;
    if (S.textWidth(t, o) > maxW && cur) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Lays out paragraphs in a column starting at y; returns the y below the last line.
 * `center` centres the lines on x. With `dry` nothing is drawn, the height is only measured.
 */
function column(S, x, y, width, blocks, sc, color, { center = false, dry = false, font = 'sans' } = {}) {
  for (const b of blocks) {
    const o = { font, size: (b.size || 6.8) * sc, color, bold: b.bold, tracking: b.tracking || 0, align: center ? 'center' : 'left', alpha: b.alpha };
    const prefix = b.bullet ? `${b.bullet}  ` : '';
    const indent = b.bullet && !center ? S.textWidth(prefix, o) : 0;
    const w = typeof width === 'function' ? width(y + 7 * sc) : width; // a function lets text follow a curved edge
    const lines = wrap(S, (center ? prefix : '') + b.text, w - indent, o);
    lines.forEach((ln, i) => {
      y += o.size * PT * (i === 0 ? 0.95 : 1.28);
      if (dry) return;
      if (i === 0 && prefix && !center) S.text(prefix, x, y, { ...o, align: 'left' });
      S.text(ln, x + indent, y, o);
    });
    y += (b.gap ?? 2.2) * sc;
  }
  return y;
}

function drawLogo(S, g, logo, x, y, maxH, align) {
  const h = Math.min(maxH, 40 * g.sc * (logo.height / logo.width));
  const w = (h * logo.width) / logo.height;
  S.image(logo, align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, y, w, h);
  return { w, h };
}

/** Footer on the sheet itself: logo on one side, credit on the other. */
function footer(S, cfg, g, opts) {
  const y = g.b + g.H - 8 * g.sc;
  const o = { font: cfg.bodyFont, size: 5.8 * g.sc, color: cfg.textColor, alpha: 0.7, tracking: 0.04 };
  const left = g.b + g.margin, right = g.b + g.W - g.margin;
  const logo = opts.logo;
  const side = cfg.logoPos || 'left';
  if (logo) {
    const h = 11 * g.sc;
    const w = Math.min(40 * g.sc, (h * logo.width) / logo.height), hh = (w * logo.height) / logo.width;
    const x = side === 'right' ? right - w : side === 'center' ? g.b + g.W / 2 - w / 2 : left;
    S.image(logo, x, y - hh + 2 * g.sc, w, hh);
  }
  if (cfg.credit) {
    const creditSide = logo && side === 'right' ? 'left' : 'right';
    S.text('Made with Overhead · github.com/enzoperesafonso/overhead', creditSide === 'left' ? left : right, y, { ...o, align: creditSide });
  }
}

/** Shrinks two text columns together until they fit above the footer, then draws them. */
function twoColumns(S, cfg, g, y0, left, right) {
  const sc = g.sc;
  const colW = g.W / 2 - g.margin - 4 * sc;
  const avail = g.b + g.H - 16 * sc - y0;
  let k = 1;
  const scaled = (blocks) => blocks.map((b) => ({ ...b, size: (b.size || 6.8) * k }));
  const height = (blocks) => (blocks.length ? column(S, 0, 0, colW, scaled(blocks), sc, cfg.textColor, { dry: true, font: cfg.bodyFont }) : 0);
  while (k > 0.6 && Math.max(height(left), height(right)) > avail) k -= 0.05;
  if (left.length) column(S, g.b + g.margin, y0, colW, scaled(left), sc, cfg.textColor, { font: cfg.bodyFont });
  if (right.length) column(S, g.b + g.W / 2 + 4 * sc, y0, colW, scaled(right), sc, cfg.textColor, { font: cfg.bodyFont });
}

export function renderChart(S, cfgIn, data, part, opts = {}) {
  const cfg = monoCfg(cfgIn);
  const g = chartGeometry(cfg);
  const notes = chartNotes(cfg);
  if (cfg.chartKind === 'zenith') return drawZenith(S, cfg, g, notes, data, opts);
  if (part === 'cover') drawCover(S, cfg, g, notes, opts);
  else drawWheel(S, cfg, g, notes, data, opts);
  return { W: g.W, H: g.H, stars: 0, chart: { cx: g.cx, cy: g.cy, R: g.Rs, D: 2 * g.Rs } };
}

// ------------------------------------------------------------------ sky overhead (zenith chart)

function drawZenith(S, cfg, g, notes, data, opts) {
  const D = g.W - 2 * g.margin - 8 * g.sc; // overall diameter including the compass ring
  const zc = {
    ...cfg, frame: undefined, shape: 'circle', ring: 'compass', ringGap: 2, ringWidth: 0.35, grid: 'altaz', gridStep: 30, gridAlpha: 0.3,
    planets: true, moon: true, sun: false, planetLabels: true, showConst: true, projection: 'stereo', fov: 90, belowHorizon: false,
    rotation: 0, mirror: false, extinction: false, title: '', subtitle: '', footer: '', showDate: false, showPlace: false, showCoords: false,
    pageBorder: 'none', orientation: 'portrait', textPos: 'below', textGap: 0, chartSize: (D / g.W) * 100, chartTop: (g.margin / g.H) * 100,
  };
  if (zc.constNames === 'off') zc.constNames = 'latin';
  renderPoster(S, zc, data);
  const sky = skyNotes(cfg);
  const y0 = g.b + g.margin + D + 8 * g.sc;
  const left = cfg.howTo ? [{ text: 'HOW TO USE', size: 7.2, bold: true, tracking: 0.14, gap: 1.6 }, ...notes.howToZenith.map((t, i) => ({ text: t, bullet: `${i + 1}.`, gap: 1.3 }))] : [];
  const right = cfg.details ? [
    { text: notes.title.toUpperCase(), size: 8.6, bold: true, tracking: 0.12, gap: 1.6 },
    { text: notes.place, size: 6.8, gap: 1 },
    { text: sky.when, size: 6.8, gap: 1.8 },
    { text: 'MOON', size: 6.4, bold: true, tracking: 0.14, gap: 0.6 },
    { text: sky.moon, size: 6.4, gap: 1.6 },
    { text: 'PLANETS ABOVE THE HORIZON', size: 6.4, bold: true, tracking: 0.14, gap: 0.6 },
    ...(sky.planets.length ? sky.planets.map((t) => ({ text: t, size: 6.4, gap: 0.5 })) : [{ text: 'None bright enough to see right now.', size: 6.4, gap: 0.5 }]),
    { text: sky.light, size: 6, gap: 1, alpha: 0.75 },
  ] : [];
  twoColumns(S, cfg, g, y0, left, right);
  footer(S, cfg, g, opts);
  return { W: g.W, H: g.H, stars: 0, chart: { cx: g.b + g.W / 2, cy: g.b + g.margin + D / 2, R: D / 2, D } };
}

// ------------------------------------------------------------------ star wheel

function drawWheel(S, cfg, g, notes, data, opts) {
  const wcfg = {
    ...cfg, frame: 'pole', fov: g.psiMax, projection: g.projection, belowHorizon: true, rotation: 0, mirror: false, extinction: false,
    shape: 'circle', ring: 'none', pageBorder: 'none', orientation: 'portrait', title: '', subtitle: '', footer: '',
    showDate: false, showPlace: false, showCoords: false, planets: false, sun: false, moon: false,
    chartSize: ((2 * g.Rs) / g.W) * 100, chartTop: ((g.cy - g.b - g.Rs) / g.H) * 100, textPos: 'below', textGap: 0,
  };
  renderPoster(S, wcfg, data);
  const { cx, cy, Rs, Rw, band, sc, s } = g;
  const col = cfg.textColor;

  // date scale
  S.circle(cx, cy, Rw, { stroke: col, lw: 0.35 * sc });
  S.circle(cx, cy, Rs, { stroke: col, lw: 0.25 * sc });
  const jd0 = Date.UTC(2025, 0, 1, 12) / 86400000 + 2440587.5;
  const theta = (n) => s * A.sunEquatorial(jd0 + n).ra;
  const minor = [], mid = [], long = [];
  for (let n = 0; n < 365; n++) {
    const m = MONTH_START.filter((st) => st <= n).length - 1;
    const day = n - MONTH_START[m] + 1;
    const th = theta(n);
    if (day === 1) long.push([pt(cx, cy, th, Rs), pt(cx, cy, th, Rw)]);
    else if (day % 5 === 0) mid.push([pt(cx, cy, th, Rs), pt(cx, cy, th, Rs + 0.42 * band)]);
    else minor.push([pt(cx, cy, th, Rs), pt(cx, cy, th, Rs + 0.24 * band)]);
  }
  S.poly(minor, { stroke: col, lw: 0.12 * sc });
  S.poly(mid, { stroke: col, lw: 0.2 * sc });
  S.poly(long, { stroke: col, lw: 0.3 * sc });
  MONTHS.forEach((name, m) => {
    const th = theta(MONTH_START[m] + 14);
    const top = Math.cos(th * D2R) >= 0;
    const fs = 6.2 * sc;
    const h = fs * PT * 0.72;
    const r = Rs + 0.7 * band + (top ? -0.5 : 0.5) * h;
    const [x, y] = pt(cx, cy, th, r);
    S.text(name, x, y, { font: 'sans', size: fs, color: col, bold: true, tracking: 0.12, align: 'center', rotate: top ? th : th + 180 });
  });
  if (!g.pocket) S.circle(cx, cy, 0.9 * sc, { fill: col }); // pivot
  stepLabel(S, g, col, 1, 'Cut out along the outer circle', g.b + 7 * sc, g.b + 13 * sc, { maxW: 56 * sc });
  stepLabel(S, g, col, 2, g.pocket ? 'Slide it into the cover pocket (page 2)' : 'Join it to the cover (page 2) at the centre dot', g.b + g.W - 7 * sc - 56 * sc, g.b + 13 * sc, { maxW: 56 * sc });

  // text under the wheel
  const left = cfg.howTo ? [{ text: 'HOW TO USE', size: 7.2, bold: true, tracking: 0.14, gap: 1.6 }, ...notes.howTo.map((t, i) => ({ text: t, bullet: `${i + 1}.`, gap: 1.3 }))] : [];
  const right = cfg.details ? [
    { text: notes.title.toUpperCase(), size: 8.6, bold: true, tracking: 0.12, gap: 1.6 },
    { text: notes.place, size: 6.8, gap: 1.2 },
    { text: notes.range, size: 6.8, gap: 1.8, alpha: 0.85 },
    { text: 'TIME', size: 6.4, bold: true, tracking: 0.14, gap: 0.8 },
    { text: `${notes.time} Time zone: ${notes.zone}.`, size: 6.4, gap: 1.6, alpha: 0.9 },
    { text: 'Accuracy is roughly ±15 minutes through the year. Planets move, so they are not printed; look for steady, non-twinkling points.', size: 6, gap: 1, alpha: 0.75 },
  ] : [];
  twoColumns(S, cfg, g, cy + Rw + 7 * sc, left, right);
  footer(S, cfg, g, opts);
}

// ------------------------------------------------------------------ cover with the horizon window

/** A numbered step marker with a short caption, wrapped to maxW. The badge sits on the first line; `center` centres it on x. */
function stepLabel(S, g, ink, n, str, x, y, { size = 4.6, maxW = 1e9, center = false } = {}) {
  const sc = g.sc;
  const o = { font: 'sans', size: size * sc, color: ink, bold: true, tracking: 0.1 };
  const d = size * sc * PT * 1.65, gap = 1.8 * sc;
  const lines = wrap(S, str.toUpperCase(), maxW - d - gap, o);
  const wide = Math.max(...lines.map((l) => S.textWidth(l, o)));
  const x0 = center ? x - (d + gap + wide) / 2 : x;
  const cyb = y - size * sc * PT * 0.36;
  S.circle(x0 + d / 2, cyb, d / 2, { stroke: ink, lw: 0.3 * sc });
  S.text(String(n), x0 + d / 2, cyb + size * sc * PT * 0.36, { ...o, size: size * sc * 0.95, align: 'center', tracking: 0 });
  lines.forEach((ln, i) => S.text(ln, x0 + d + gap, y + i * size * sc * PT * 1.35, { ...o, align: 'left' }));
}

/** A view of S that draws everything rigidly turned half a turn about (cx, cy). */
function rotated(S, cx, cy) {
  const P = ([x, y]) => [2 * cx - x, 2 * cy - y];
  const over = {
    rect: (x, y, w, h, st, r) => S.rect(2 * cx - x - w, 2 * cy - y - h, w, h, st, r),
    circle: (x, y, r, st) => S.circle(2 * cx - x, 2 * cy - y, r, st),
    line: (x1, y1, x2, y2, st) => S.line(2 * cx - x1, 2 * cy - y1, 2 * cx - x2, 2 * cy - y2, st),
    poly: (rings, st, o) => S.poly(rings.map((r) => r.map(P)), st, o),
    clipPolygon: (pts) => S.clipPolygon(pts.map(P)),
    text: (str, x, y, o = {}) => S.text(str, 2 * cx - x, 2 * cy - y, { ...o, rotate: (o.rotate || 0) + 180 }),
  };
  return new Proxy(S, { get: (t, k) => (k in over ? over[k] : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
}

/** The pocket plate (after the ASSA Star Pocket): a hood a little smaller than the wheel, so the date ring shows round it, a plain
 *  rectangle over the lower part of the wheel, and one flap that folds up behind it. Drawn with the night hours at the top. */
function drawPocket(S, g, ink) {
  const { cx, cy, Rs, Wp, yF, Hf, sc } = g;
  const hood = Array.from({ length: 91 }, (_, i) => { const a = -Math.PI / 2 + (Math.PI * i) / 90; return [cx + Rs * Math.sin(a), cy - Rs * Math.cos(a)]; });
  S.poly([[...hood, [cx + Wp, cy], [cx + Wp, yF + Hf], [cx - Wp, yF + Hf], [cx - Wp, cy]]], { fill: '#ffffff', stroke: ink, lw: 0.45 * sc }, { closed: true });
  S.line(cx - Wp, yF, cx + Wp, yF, { stroke: ink, lw: 0.2 * sc, dash: [0.8 * sc, 1.1 * sc], alpha: 0.8 });
  stepLabel(S, g, ink, 3, 'Fold up behind the wheel', cx, yF + 5 * sc, { center: true });
  stepLabel(S, g, ink, 4, 'Slide the wheel in from the top, then tape the flap to the front', cx, yF - 8 * sc, { center: true, maxW: 2 * Wp - 30 * sc });
  stepLabel(S, g, ink, 1, 'Cut out along the solid line', g.b + 7 * sc, g.b + 13 * sc, { maxW: 62 * sc });
  const yLow = g.b + 32 * sc, edge = Math.sqrt(Math.max(0, Rs * Rs - (cy - yLow) ** 2)), wR = g.b + g.W - 7 * sc - (cx + edge) - 4 * sc;
  if (wR > 26 * sc) {
    const o = { font: 'sans', size: 4.6 * sc, color: ink, alpha: 0.75, tracking: 0.04 };
    wrap(S, "Off-cut. The wheel's date ring shows round the hood.", wR, o).forEach((ln, i) => S.text(ln, cx + edge + 4 * sc, g.b + 13 * sc + i * 4.6 * sc * PT * 1.35, { ...o, align: 'left' }));
  }
  for (const sx of [-1, 1]) { // glue or tape the flap to the front along these strips
    const x0 = sx < 0 ? cx - Wp : cx + Wp - 7 * sc;
    S.rect(x0, cy + 6 * sc, 7 * sc, yF - cy - 6 * sc, { stroke: ink, lw: 0.15 * sc, dash: [0.8 * sc, 1.1 * sc], alpha: 0.6 });
    S.text('TAPE', x0 + 3.5 * sc + 1.5 * sc, yF - 8 * sc, { font: 'sans', size: 4 * sc, color: ink, bold: true, tracking: 0.14, alpha: 0.8, rotate: -90 });
  }
}

function drawCover(S, cfg, g, notes, opts) {
  const { cx, cy, Rs, sc, s } = g;
  const S0 = S;
  S.rect(0, 0, g.W + 2 * g.b, g.H + 2 * g.b, { fill: cfg.pageBg });
  const ink = '#000000';
  const Rh = g.Rh;
  const ring = (r, n = 180) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);
  if (g.pocket) drawPocket(S, g, ink);
  else S.poly([ring(Rs)], { fill: '#ffffff', stroke: ink, lw: 0.45 * sc }, { closed: true });
  const G = g.pocket ? rotated(S, cx, cy) : S; // the hood is the top of the page, so the scale is turned to put the night hours there

  // hour scale
  G.circle(cx, cy, Rh, { stroke: ink, lw: 0.25 * sc });
  const beta = (T) => -s * 15 * (T - 12);
  const ticks = [], halves = [];
  for (let T = 0; T < 24; T += 0.5) if (!g.pocket || T <= 9 || T >= 15) (Number.isInteger(T) ? ticks : halves).push([pt(cx, cy, beta(T), Rh), pt(cx, cy, beta(T), Rh + (Number.isInteger(T) ? 2.4 : 1.2) * sc)]);
  G.poly(ticks, { stroke: ink, lw: 0.25 * sc });
  G.poly(halves, { stroke: ink, lw: 0.15 * sc });
  for (let T = 0; T < 24; T++) {
    if (g.pocket && T > 9 && T < 15) continue; // daytime hours sit under the rectangle, where the date ring is hidden
    const th = beta(T);
    const top = Math.cos(th * D2R) >= 0;
    const fs = 5.6 * sc, h = fs * PT * 0.72;
    const r = Rh + 4.3 * sc + (top ? -0.5 : 0.5) * h;
    const [x, y] = pt(cx, cy, th, r);
    const night = T >= 18 || T <= 6;
    G.text(String(T), x, y, { font: 'sans', size: fs, color: ink, bold: night, align: 'center', rotate: top ? th : th + 180 });
  }

  // horizon window
  const map = horizonMapper(g);
  // labels inside the window stay the right way up even though the window itself is turned; x, y is the label's centre, dy the baseline drop
  const upright = (str, x, y, dy, o) => (g.pocket ? S.text(str, 2 * cx - x + (o.align === 'center' ? 0 : 4.4 * sc), 2 * cy - y + dy, o) : S.text(str, x, y + dy, o));
  const win = Array.from({ length: 180 }, (_, i) => { const a = (i / 180) * 2 * Math.PI; return map([Math.sin(a), Math.cos(a), 0]); });
  G.save();
  G.clipPolygon(ring(Rh - 0.2 * sc));
  G.poly([win], { fill: '#ffffff', stroke: ink, lw: 0.35 * sc, dash: [1.6 * sc, 1 * sc] }, { closed: true });
  const tk = [];
  for (let az = 0; az < 360; az += 10) {
    const a = az * D2R, alt = (az % 30 === 0 ? 5 : 3) * D2R;
    tk.push([map([Math.sin(a), Math.cos(a), 0]), map([Math.cos(alt) * Math.sin(a), Math.cos(alt) * Math.cos(a), Math.sin(alt)])]);
  }
  G.poly(tk, { stroke: ink, lw: 0.2 * sc });
  const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let az = 0; az < 360; az += 30) {
    const a = az * D2R;
    const e = map([Math.sin(a), Math.cos(a), 0]);
    const i = map([Math.cos(5 * D2R) * Math.sin(a), Math.cos(5 * D2R) * Math.cos(a), Math.sin(5 * D2R)]);
    const dx = e[0] - i[0], dy = e[1] - i[1], len = Math.hypot(dx, dy) || 1;
    const card = names[az];
    const off = (card ? 5.2 : 3.6) * sc;
    upright(card || `${az}°`, e[0] + (dx / len) * off, e[1] + (dy / len) * off, (card ? 1.7 : 1.1) * sc, { font: 'sans', size: (card ? 7.5 : 4.6) * sc, color: ink, bold: !!card, align: 'center' });
  }
  const z = map([0, 0, 1]);
  G.line(z[0] - 1.6 * sc, z[1], z[0] + 1.6 * sc, z[1], { stroke: ink, lw: 0.2 * sc });
  G.line(z[0], z[1] - 1.6 * sc, z[0], z[1] + 1.6 * sc, { stroke: ink, lw: 0.2 * sc });
  upright('overhead', z[0] + 2.2 * sc, z[1], 1.2 * sc, { font: 'sans', size: 4.6 * sc, color: ink, italic: true });
  if (g.pocket) { // cut-away instruction inside the window itself
    const wy = win.reduce((a, p) => a + p[1], 0) / win.length;
    stepLabel(S, g, ink, 2, 'Cut out the window along the dashed line', cx, 2 * cy - wy + 14 * sc, { center: true, maxW: 90 * sc });
  }
  G.restore();
  if (!g.pocket) {
    G.circle(cx, cy, 0.9 * sc, { fill: ink });
    G.text('pin', cx + 1.6 * sc, cy - 1 * sc, { font: 'sans', size: 4.4 * sc, color: ink, italic: true });
  }

  // title, how-to, credit and logo
  const logo = opts.logo;
  const logoH = logo ? Math.min(9 * sc, 36 * sc * (logo.height / logo.width)) : 0;
  const chord = (y) => 2 * Math.sqrt(Math.max(0, (Rh - 3 * sc) ** 2 - (y - cy) ** 2));
  const widthAt = (y) => chord(y) - 4 * sc; // lines are as wide as the disc allows at their own height
  const winBottom = Math.max(...win.map((p) => p[1]));
  const title = (k) => (cfg.details ? [
    { text: notes.title.toUpperCase(), size: 8.4 * k, bold: true, tracking: 0.12, gap: 1 },
    { text: notes.place, size: 6.2 * k, gap: 2 },
  ] : []);
  const howTo = (k) => (cfg.howTo ? [
    { text: 'HOW TO USE', size: 6.2 * k, bold: true, tracking: 0.14, gap: 0.7 },
    { text: 'Turn the wheel so the date meets the time on this scale.', size: 6 * k, gap: 0.5 },
    { text: `Hold overhead, face a direction (${notes.hemi}, E, ${notes.far} or W) and turn the chart so its label is at the bottom.`, size: 6 * k, gap: 0.5 },
    { text: 'The centre of the window is straight up.', size: 6 * k, gap: 2 },
  ] : []);
  const credit = (k) => (cfg.credit ? [{ text: 'Made with Overhead · github.com/enzoperesafonso/overhead', size: 5 * k, gap: 0, alpha: 0.8 }] : []);
  if (g.pocket) {
    // the solid part of the hood above the window holds the title; the rest goes on the back flap
    const yL = cy - Rh + 9 * sc, yE = 2 * cy - winBottom - 4 * sc;
    const yS = yL + (logo ? logoH + 3 * sc : 0); // the logo sits on the face of the hood, above the title
    let k = 1;
    while (k > 0.5 && column(S, cx, yS, widthAt, title(k), sc, ink, { center: true, dry: true, font: cfg.bodyFont }) > yE) k -= 0.05;
    if (logo && yE - yL > logoH + 12 * sc) drawLogo(S, g, logo, cx, yL, logoH, 'center');
    if (yE - yS > 6 * sc) column(S, cx, yS, widthAt, title(k), sc, ink, { center: true, font: cfg.bodyFont });
    const fw = 2 * g.Wp - 16 * sc, fy = g.yF + 8 * sc, fyMax = g.yF + g.Hf - 3 * sc;
    const flapLines = (kk) => [
      { text: 'COVER WITH POCKET', size: 7.2 * kk, bold: true, tracking: 0.14, gap: 1.4 },
      { text: 'Cut out along the solid line.', bullet: '1.', size: 6.4 * kk, gap: 0.6 },
      { text: 'Cut out the horizon window along its dashed line.', bullet: '2.', size: 6.4 * kk, gap: 0.6 },
      { text: 'Lay the cover face down and fold the flap up along the dotted line.', bullet: '3.', size: 6.4 * kk, gap: 0.6 },
      { text: 'Slide the star wheel in from the top, date ring outwards, then tape or glue the flap to the front along the two strips. The wheel now turns freely and no pin is needed.', bullet: '4.', size: 6.4 * kk, gap: 1.8 },
      ...howTo(kk).map((b) => ({ ...b, size: b.size * 1.05 })),
      { text: `${notes.title} for latitude ${g.phi.toFixed(2)}°${notes.hemi}. ${notes.range} ${notes.time}`, size: 6 * kk, alpha: 0.85, gap: 1.4 },
    ];
    let kf = 1;
    while (kf > 0.5 && column(S, 0, 0, fw, flapLines(kf), sc, cfg.textColor, { dry: true, font: cfg.bodyFont }) > fyMax - fy) kf -= 0.05;
    column(S, cx - fw / 2, fy, fw, flapLines(kf), sc, cfg.textColor, { font: cfg.bodyFont });
    footer(S, cfg, g, opts);
    return;
  }
  const yTop = winBottom + 9 * sc;
  const yMax = cy + Rh - 4 * sc;
  const build = (k) => [...title(k), ...howTo(k), ...credit(k)];
  const yLogo = yTop + (logo ? logoH + 2 * sc : 0);
  let k = 1;
  const bottom = (kk) => column(S, cx, yLogo, widthAt, build(kk), sc, ink, { center: true, dry: true, font: cfg.bodyFont });
  while (k > 0.55 && bottom(k) > yMax) k -= 0.05;
  if (logo) drawLogo(S, g, logo, cx, yTop, logoH, 'center');
  column(S, cx, yLogo, widthAt, build(k), sc, ink, { center: true, font: cfg.bodyFont });

  // assembly note and footer on the sheet around the disc (cut away afterwards)
  const y0 = cy + g.Rw + 7 * sc;
  column(S, g.b + g.margin, y0, g.W - 2 * g.margin, [
    { text: 'COVER', size: 7.2, bold: true, tracking: 0.14, gap: 1.6 },
    { text: 'Cut around the outer circle, then cut away the window along the dashed line. If you can, laminate the wheel and the cover first. Make a small hole at the centre dot of each and fasten the cover over the wheel with a paper fastener. The cover is slightly smaller than the wheel so the date scale shows around the edge.', gap: 1.6 },
    { text: `${notes.title} for latitude ${g.phi.toFixed(2)}°${notes.hemi}. ${notes.range} ${notes.time}`, alpha: 0.85, gap: 1 },
  ], sc, cfg.textColor, { font: cfg.bodyFont });
  footer(S, cfg, g, opts);
}
