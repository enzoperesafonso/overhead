// UI: state, controls, live preview and exports.
import { DEFAULTS, THEMES, PAGE_SIZES, EXAMPLES, themeFields } from './config.js';
import { SkyData } from './data.js';
import { CanvasSurface, PdfSurface, SvgSurface } from './surfaces.js';
import { renderPoster, pageDims, resolveMoment } from './scene.js';
import * as A from './astro.js';
import { LORE_TRADITIONS } from './lore.js';

const $ = (s, r = document) => r.querySelector(s);
const STORE = 'overhead.v1';

// ------------------------------------------------------------------ state

const THEME_KEYS = new Set(['pageBg', 'bgMode', 'bg1', 'bg2', 'dust', 'starMode', 'starColor', 'starSat', 'starStyle', 'lineColor', 'lineAlpha', 'lineWidth', 'labelColor', 'gridColor', 'ringColor', 'textColor', 'mwColor', 'mwOpacity', 'moonColor']);

function decodeHash() {
  try {
    const m = /[#&]c=([^&]+)/.exec(location.hash);
    if (!m) return null;
    return JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
  } catch { return null; }
}
function encodeState(cfg) {
  const diff = {};
  for (const k in DEFAULTS) if (JSON.stringify(cfg[k]) !== JSON.stringify(DEFAULTS[k])) diff[k] = cfg[k];
  return btoa(unescape(encodeURIComponent(JSON.stringify(diff)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function sanitize(o) {
  const out = {};
  if (o && typeof o === 'object') for (const k in DEFAULTS) if (k in o && typeof o[k] === typeof DEFAULTS[k]) out[k] = o[k];
  return out;
}
let saved = null;
try { saved = JSON.parse(localStorage.getItem(STORE)); } catch { /* private mode */ }
const cfg = { ...DEFAULTS, ...sanitize(saved), ...sanitize(decodeHash()) };

const sky = new SkyData();
let customFont = null; // base64 TTF for the PDF; the preview uses a FontFace
const bindings = [];
let sizeHint = null;

function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* ignore */ }
}

function set(key, value, { silent = false } = {}) {
  cfg[key] = value;
  if (THEME_KEYS.has(key) && cfg.theme !== 'custom') { cfg.theme = 'custom'; syncAll(); }
  if (!silent) { persist(); schedule(); refreshVisibility(); }
}
function setMany(obj) {
  Object.assign(cfg, obj);
  persist(); syncAll(); schedule();
}
function syncAll() { for (const b of bindings) b.sync?.(); refreshVisibility(); }
function refreshVisibility() { for (const b of bindings) if (b.show) b.el.hidden = !b.show(cfg); }

// ------------------------------------------------------------------ tiny DOM helpers

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
const reg = (el, sync, show) => { bindings.push({ el, sync, show }); return el; };

let uid = 0;
const C = {
  text(key, label, { show, area = false, placeholder = '' } = {}) {
    const id = 'f' + uid++;
    const inp = area ? h('textarea', { id, rows: 3, placeholder }) : h('input', { id, type: 'text', placeholder, autocomplete: 'off' });
    inp.addEventListener('input', () => set(key, inp.value));
    return reg(h('div', { class: 'row' }, h('label', { for: id }, label), inp), () => (inp.value = cfg[key]), show);
  },
  num(key, label, { min, max, step = 'any', show } = {}) {
    const id = 'f' + uid++;
    const inp = h('input', { id, type: 'number', min, max, step, inputmode: 'decimal' });
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) set(key, v); });
    return reg(h('div', { class: 'row' }, h('label', { for: id }, label), inp), () => (inp.value = +(+cfg[key]).toFixed(5)), show);
  },
  input(key, label, type, { show } = {}) {
    const id = 'f' + uid++;
    const inp = h('input', { id, type });
    inp.addEventListener('input', () => inp.value && set(key, inp.value));
    return reg(h('div', { class: 'row' }, h('label', { for: id }, label), inp), () => (inp.value = cfg[key]), show);
  },
  range(key, label, min, max, step, { fmt = (v) => v, show } = {}) {
    const id = 'f' + uid++;
    const out = h('output', { for: id });
    const inp = h('input', { id, type: 'range', min, max, step });
    inp.addEventListener('input', () => { set(key, parseFloat(inp.value)); out.textContent = fmt(cfg[key]); });
    return reg(h('div', { class: 'row' }, h('label', { for: id }, label, out), inp), () => { inp.value = cfg[key]; out.textContent = fmt(cfg[key]); }, show);
  },
  toggle(key, label, { show } = {}) {
    const id = 'f' + uid++;
    const inp = h('input', { id, type: 'checkbox', class: 'switch', role: 'switch' });
    inp.addEventListener('change', () => set(key, inp.checked));
    return reg(h('div', { class: 'row inline' }, h('label', { for: id, class: 'lab' }, label), inp), () => (inp.checked = !!cfg[key]), show);
  },
  select(key, label, options, { show, onchange } = {}) {
    const id = 'f' + uid++;
    const sel = h('select', { id });
    const fill = (opts) => { sel.replaceChildren(...opts.map(([v, t]) => h('option', { value: v }, t))); };
    fill(typeof options === 'function' ? options() : options);
    sel.addEventListener('change', () => { set(key, sel.value); onchange?.(); });
    return reg(h('div', { class: 'row' }, h('label', { for: id }, label), sel), () => {
      if (typeof options === 'function') fill(options());
      sel.value = cfg[key];
    }, show);
  },
  seg(key, label, options, { show } = {}) {
    const btns = options.map(([v, t]) => h('button', { type: 'button', onclick: () => { set(key, v); sync(); } }, t));
    const sync = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(cfg[key] === options[i][0])));
    return reg(h('div', { class: 'row' }, h('div', { class: 'lab' }, label), h('div', { class: 'seg' }, btns)), sync, show);
  },
  color(key, label, { show } = {}) {
    const id = 'f' + uid++;
    const inp = h('input', { id, type: 'color' });
    inp.addEventListener('input', () => set(key, inp.value));
    return reg(h('div', { class: 'row' }, h('label', { for: id }, label), inp), () => (inp.value = cfg[key]), show);
  },
  sub: (t, show) => reg(h('div', { class: 'sub' }, t), null, show),
  hint: (t, show) => reg(h('p', { class: 'hint' }, t), null, show),
};

function section(title, open, ...kids) {
  return h('details', { class: 'sec', open }, h('summary', {}, title), h('div', { class: 'body' }, kids));
}

// ------------------------------------------------------------------ specialised controls

const FONTS = () => [['sans', 'Sans-serif'], ['serif', 'Serif'], ['mono', 'Monospace'], ...(customFont ? [['custom', 'Uploaded font']] : [])];

function timezoneOptions() {
  let zones = [];
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney']; }
  if (!zones.includes(cfg.tz) && cfg.tz !== 'auto') zones = [cfg.tz, ...zones];
  return [['auto', 'Automatic (from longitude)'], ...zones.map((z) => [z, z.replace(/_/g, ' ')])];
}

function placeControl() {
  const q = h('input', { type: 'search', placeholder: 'Search a city or place…', autocomplete: 'off', 'aria-label': 'Search place' });
  const go = h('button', { type: 'button', title: 'Search' }, 'Find');
  const here = h('button', { type: 'button', title: 'Use my current location' }, '⌖');
  const results = h('div', { class: 'results', hidden: true });
  const wrap = h('div', { class: 'row' }, h('div', { class: 'lab' }, 'Location'), h('div', { class: 'place' }, q, go, here), results);
  async function search() {
    const term = q.value.trim();
    if (!term) return;
    go.disabled = true;
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=6&language=en&format=json`);
      const j = await r.json();
      const hits = j.results || [];
      results.replaceChildren(...(hits.length ? hits.map((p) => h('button', {
        type: 'button',
        onclick: () => {
          setMany({ lat: +p.latitude.toFixed(4), lon: +p.longitude.toFixed(4), placeName: [p.name, p.admin1 && p.country_code === 'US' ? p.admin1 : p.country].filter(Boolean).join(', ').toUpperCase(), ...(p.timezone ? { tz: p.timezone } : {}) });
          results.hidden = true;
        },
      }, p.name, h('small', {}, [p.admin1, p.country].filter(Boolean).join(', ')))) : [h('div', { class: 'hint', style: 'padding:8px' }, 'No matches — enter coordinates below.')]));
      results.hidden = false;
    } catch {
      toast('Place search needs an internet connection — enter coordinates instead.');
    } finally { go.disabled = false; }
  }
  go.addEventListener('click', search);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  here.addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Geolocation is not available in this browser.');
    navigator.geolocation.getCurrentPosition(
      (pos) => setMany({ lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4), placeName: 'MY LOCATION', tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto' }),
      () => toast('Could not get your location.'),
    );
  });
  return wrap;
}

function themeGrid() {
  const btns = Object.keys(THEMES).map((name) => {
    const t = THEMES[name];
    const bg = t.bgMode === 'radial' ? `radial-gradient(circle, ${t.bg1}, ${t.bg2})` : t.bgMode === 'vertical' ? `linear-gradient(${t.bg1}, ${t.bg2})` : t.bg1;
    return h('button', { type: 'button', class: 'theme', title: name, onclick: () => setMany({ theme: name, ...themeFields(name) }), 'data-theme': name },
      h('div', { class: 'chip', style: `background:${t.pageBg}` }, h('i', { style: `background:${bg};--dot:${t.starColor}` })),
      h('span', {}, name));
  });
  return reg(h('div', { class: 'themes' }, btns), () => btns.forEach((b) => b.setAttribute('aria-pressed', String(cfg.theme === b.dataset.theme))));
}

function examplesControl() {
  const sel = h('select', { 'aria-label': 'Load an example' }, h('option', { value: '' }, 'Start from an example…'), EXAMPLES.map((e, i) => h('option', { value: i }, e.name)));
  sel.addEventListener('change', () => {
    if (sel.value === '') return;
    const e = EXAMPLES[+sel.value];
    setMany({ ...DEFAULTS, ...themeFields(e.set.theme || 'Midnight'), ...e.set, theme: e.set.theme || 'Midnight' });
    sel.value = '';
  });
  return h('div', { class: 'row' }, sel);
}

function fontUpload() {
  const inp = h('input', { type: 'file', accept: '.ttf,.otf,font/ttf', hidden: true });
  const btn = h('button', { type: 'button', onclick: () => inp.click() }, 'Upload a .ttf font…');
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const face = new FontFace('StarMapCustom', buf);
      await face.load();
      document.fonts.add(face);
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      customFont = btoa(bin);
      syncAll();
      setMany({ titleFont: 'custom', bodyFont: 'custom' });
      toast(`Using ${f.name}`);
    } catch { toast('That font could not be loaded (TrueType .ttf works best).'); }
  });
  return h('div', { class: 'row' }, btn, inp, h('p', { class: 'hint' }, 'Fonts stay on your device. The PDF embeds the file you upload.'));
}

// ------------------------------------------------------------------ panel

const panel = $('#panel');
panel.replaceChildren(
  section('Moment', true,
    examplesControl(),
    C.text('title', 'Title'),
    C.text('subtitle', 'Subtitle (optional)'),
    placeControl(),
    C.text('placeName', 'Location label'),
    h('div', { class: 'pair' }, C.num('lat', 'Latitude °', { min: -90, max: 90, step: 0.0001 }), C.num('lon', 'Longitude °', { min: -180, max: 180, step: 0.0001 })),
    h('div', { class: 'pair' }, C.input('date', 'Date', 'date'), C.input('time', 'Local time', 'time')),
    C.select('tz', 'Time zone', timezoneOptions),
    C.sub('Text on the poster'),
    C.toggle('showDate', 'Show date'),
    C.select('dateFormat', 'Date format', [['long', 'August 5, 2021'], ['eu', '5 August 2021'], ['short', '05.08.2021'], ['us', '08/05/2021'], ['iso', '2021-08-05']], { show: (c) => c.showDate }),
    C.toggle('showTime', 'Include time', { show: (c) => c.showDate }),
    C.toggle('showPlace', 'Show location'),
    C.toggle('showCoords', 'Show coordinates'),
    C.select('coordFormat', 'Coordinate format', [['dec', '39.0885°N'], ['ddm', "39° 5.310'N"], ['dms', '39° 5\' 19"N']], { show: (c) => c.showCoords }),
    C.text('footer', 'Extra lines', { area: true, placeholder: 'A quote, names, a note…' }),
  ),
  section('Style', false,
    themeGrid(),
    C.sub('Background'),
    C.seg('bgMode', 'Sky fill', [['solid', 'Solid'], ['radial', 'Radial'], ['vertical', 'Vertical']]),
    h('div', { class: 'colors' }, C.color('bg1', 'Sky'), C.color('bg2', 'Sky edge', { show: (c) => c.bgMode !== 'solid' }), C.color('pageBg', 'Paper')),
    C.toggle('dust', 'Fine star dust'),
    C.range('dustAmount', 'Dust amount', 0.2, 3, 0.1, { show: (c) => c.dust, fmt: (v) => v.toFixed(1) }),
    C.sub('Stars'),
    C.seg('starMode', 'Star colour', [['single', 'One colour'], ['realistic', 'Realistic']]),
    h('div', { class: 'colors' }, C.color('starColor', 'Stars', { show: (c) => c.starMode === 'single' })),
    C.range('starSat', 'Colour strength', 0, 1, 0.05, { show: (c) => c.starMode === 'realistic', fmt: (v) => Math.round(v * 100) + '%' }),
    C.seg('starStyle', 'Star style', [['dot', 'Dot'], ['glow', 'Glow'], ['spikes', 'Spikes']]),
    C.toggle('fadeFaint', 'Dim the faintest stars'),
    C.sub('Lines & labels'),
    C.seg('lineStyle', 'Constellation lines', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]),
    C.range('lineWidth', 'Line width', 0.05, 0.6, 0.01, { fmt: (v) => v.toFixed(2) + ' mm' }),
    C.range('lineAlpha', 'Line opacity', 0.1, 1, 0.05, { fmt: (v) => Math.round(v * 100) + '%' }),
    h('div', { class: 'colors' }, C.color('lineColor', 'Lines'), C.color('labelColor', 'Labels'), C.color('gridColor', 'Grid'), C.color('ringColor', 'Ring'), C.color('textColor', 'Text'), C.color('mwColor', 'Milky Way'), C.color('moonColor', 'Moon')),
    C.toggle('planetColors', 'Colour the planets'),
  ),
  section('Sky', false,
    C.range('limMag', 'Limiting magnitude', 2, 8, 0.1, { fmt: (v) => v.toFixed(1) }),
    C.hint('Higher shows fainter stars (6 ≈ naked eye under dark skies).'),
    C.range('starSize', 'Star size', 0.4, 3, 0.05, { fmt: (v) => v.toFixed(2) + '×' }),
    C.range('sizeContrast', 'Bright vs faint contrast', 0.2, 2, 0.05, { fmt: (v) => v.toFixed(2) }),
    C.toggle('extinction', 'Atmospheric dimming near horizon'),
    C.sub('Constellations'),
    C.toggle('showConst', 'Constellation lines'),
    C.select('constNames', 'Constellation names', [['off', 'Off'], ['latin', 'Latin (Ursa Major)'], ['abbr', 'Abbreviation (UMa)']]),
    C.toggle('constBorders', 'Constellation boundaries'),
    C.sub('Objects'),
    C.toggle('lore', 'Southern African star lore'),
    C.select('loreTradition', 'Lore tradition', LORE_TRADITIONS, { show: (c) => c.lore }),
    C.hint('Local names and stories from published ethnoastronomy. Spellings and meanings vary between communities.', (c) => c.lore),
    C.toggle('milkyWay', 'Milky Way'),
    C.range('mwOpacity', 'Milky Way strength', 0.2, 3, 0.1, { show: (c) => c.milkyWay, fmt: (v) => v.toFixed(1) }),
    C.toggle('planets', 'Planets'),
    C.toggle('moon', 'Moon with phase'),
    C.toggle('sun', 'Sun'),
    C.toggle('planetLabels', 'Label planets, Sun & Moon', { show: (c) => c.planets || c.moon || c.sun }),
    C.toggle('dsos', 'Deep-sky objects (Messier)'),
    C.range('dsoMag', 'Object magnitude limit', 4, 12, 0.5, { show: (c) => c.dsos, fmt: (v) => v.toFixed(1) }),
    C.toggle('dsoLabels', 'Label Messier numbers', { show: (c) => c.dsos }),
    C.range('starNames', 'Named stars', 0, 60, 1, { fmt: (v) => (v ? v + ' brightest' : 'Off') }),
    C.sub('Grid & reference lines'),
    C.select('grid', 'Coordinate grid', [['off', 'Off'], ['altaz', 'Altitude / azimuth'], ['equatorial', 'RA / Dec'], ['both', 'Both']]),
    C.select('gridStep', 'Grid spacing', [[10, '10°'], [15, '15°'], [30, '30°'], [45, '45°']].map(([v, t]) => [String(v), t]), { show: (c) => c.grid !== 'off', onchange: () => set('gridStep', +cfg.gridStep) }),
    C.range('gridAlpha', 'Grid opacity', 0.05, 1, 0.05, { show: (c) => c.grid !== 'off' || c.ecliptic || c.celestialEquator, fmt: (v) => Math.round(v * 100) + '%' }),
    C.toggle('ecliptic', 'Ecliptic (path of the Sun)'),
    C.toggle('celestialEquator', 'Celestial equator'),
    C.sub('Projection'),
    C.select('projection', 'Projection', [['stereo', 'Stereographic'], ['equidistant', 'Equidistant'], ['equalarea', 'Equal-area'], ['ortho', 'Orthographic (dome)']]),
    C.range('fov', 'Field of view (from zenith)', 30, 170, 1, { fmt: (v) => v + '°' }),
    C.toggle('belowHorizon', 'Show sky below the horizon'),
    C.range('rotation', 'Rotate chart', -180, 180, 1, { fmt: (v) => v + '°' }),
    C.toggle('mirror', 'Mirror (view from outside the sphere)'),
  ),
  section('Layout', false,
    C.select('pageSize', 'Paper size', Object.keys(PAGE_SIZES).map((k) => [k, k])),
    C.seg('orientation', 'Orientation', [['portrait', 'Portrait'], ['landscape', 'Landscape']], { show: (c) => c.pageSize !== 'Custom' }),
    h('div', { class: 'pair' }, C.num('customW', 'Width mm', { min: 50, max: 2000, step: 1, show: (c) => c.pageSize === 'Custom' }), C.num('customH', 'Height mm', { min: 50, max: 2000, step: 1, show: (c) => c.pageSize === 'Custom' })),
    C.range('bleed', 'Print bleed', 0, 10, 0.5, { fmt: (v) => (v ? v + ' mm' : 'None') }),
    C.sub('Chart'),
    C.select('shape', 'Shape', [['circle', 'Circle'], ['rounded', 'Rounded square'], ['square', 'Square'], ['arch', 'Arch'], ['hexagon', 'Hexagon'], ['heart', 'Heart'], ['page', 'Full page']]),
    C.range('chartSize', 'Chart size', 30, 100, 1, { fmt: (v) => v + '%' }),
    C.range('chartTop', 'Distance from top', 0, 45, 0.5, { show: (c) => c.shape !== 'page', fmt: (v) => v + '%' }),
    C.select('ring', 'Border', [['none', 'None'], ['line', 'Thin line'], ['double', 'Double line'], ['ticks', 'Tick marks'], ['degrees', 'Degree scale'], ['compass', 'Compass points']]),
    C.range('ringGap', 'Border gap', 0, 10, 0.5, { show: (c) => c.ring !== 'none', fmt: (v) => v + ' mm' }),
    C.range('ringWidth', 'Border weight', 0.1, 2, 0.05, { show: (c) => c.ring !== 'none', fmt: (v) => v.toFixed(2) + ' mm' }),
    C.select('pageBorder', 'Page frame', [['none', 'None'], ['line', 'Single line'], ['double', 'Double line']]),
    C.range('borderInset', 'Frame inset', 3, 30, 0.5, { show: (c) => c.pageBorder !== 'none', fmt: (v) => v + ' mm' }),
    C.sub('Typography'),
    C.select('titleFont', 'Title font', FONTS),
    C.select('bodyFont', 'Details font', FONTS),
    fontUpload(),
    C.range('titleSize', 'Title size', 6, 40, 0.5, { fmt: (v) => v + ' pt' }),
    C.range('bodySize', 'Details size', 4, 20, 0.25, { fmt: (v) => v + ' pt' }),
    C.range('titleTracking', 'Title letter spacing', 0, 0.6, 0.01, { fmt: (v) => v.toFixed(2) }),
    C.range('bodyTracking', 'Details letter spacing', 0, 0.6, 0.01, { fmt: (v) => v.toFixed(2) }),
    C.toggle('titleBold', 'Bold title'),
    C.toggle('uppercase', 'Uppercase'),
    C.seg('textAlign', 'Alignment', [['center', 'Centre'], ['left', 'Left']]),
    C.select('textPos', 'Text position', [['below', 'Below chart'], ['above', 'Above chart'], ['overlay', 'Over the bottom']]),
    C.range('textGap', 'Gap to chart', 0, 40, 0.5, { show: (c) => c.textPos !== 'overlay', fmt: (v) => v + ' mm' }),
    C.range('lineGap', 'Line spacing', 0, 10, 0.1, { fmt: (v) => v.toFixed(1) }),
  ),
  section('Export', true,
    h('div', { class: 'btns' },
      h('button', { type: 'button', class: 'primary', onclick: () => exportPdf(), id: 'btn-pdf2' }, 'Download PDF'),
      h('button', { type: 'button', onclick: () => exportPng() }, 'PNG'),
      h('button', { type: 'button', onclick: () => exportSvg() }, 'SVG')),
    C.select('pngDpi', 'PNG resolution', [['150', '150 dpi'], ['300', '300 dpi (print)'], ['600', '600 dpi']], {}),
    C.hint('The PDF is fully vector: every star is a crisp shape at any size, ready for a print shop or your home printer.'),
    h('div', { class: 'btns' },
      h('button', { type: 'button', onclick: () => saveDesign() }, 'Save design'),
      h('button', { type: 'button', onclick: () => $('#load-file').click() }, 'Open design'),
      h('button', { type: 'button', onclick: () => { if (confirm('Reset everything to the defaults?')) setMany({ ...DEFAULTS }); } }, 'Reset'),
      h('input', { id: 'load-file', type: 'file', accept: '.json,application/json', hidden: true })),
  ),
);
// pngDpi is UI-only: keep it out of the saved design
cfg.pngDpi = '300';

// ------------------------------------------------------------------ about dialog

const about = $('#about');
about.querySelector('.about-body').replaceChildren(
    h('p', { class: 'hint' }, 'Overhead turns any moment into a print-ready map of the sky above it: the night you met, a wedding, a birth. It is free and open source. It runs entirely in your browser, so nothing you enter is stored or uploaded, and the PDF is yours to print however you like.'),
    h('p', { class: 'hint' }, 'I built it because these posters are essentially a bit of astronomy and a nice layout, and I didn\'t think they should cost money. If you make something you love, that\'s the whole point.'),
    h('p', { class: 'hint' }, 'Made by ', h('a', { href: 'https://github.com/enzoperesafonso', target: '_blank', rel: 'noopener' }, 'Enzo Afonso'), ' · ', h('a', { href: 'https://github.com/enzoperesafonso/overhead', target: '_blank', rel: 'noopener' }, 'source on GitHub')),
    h('p', { class: 'hint' }, 'Overhead runs entirely in your browser: your designs and fonts never leave your device. The only network call is the optional place search, which sends just the text you type to the Open-Meteo geocoding service.'),
    h('p', { class: 'hint' }, 'Planet, Sun and Moon positions are calculated (Paul Schlyter\'s low-precision method, good to about an arcminute for planets). Stars are shown at their J2000 positions, corrected for precession.'),
    h('p', { class: 'hint' }, 'Star lore names are compiled from published ethnoastronomy, chiefly the ', h('a', { href: 'https://assa.saao.ac.za/astronomy-in-south-africa/ethnoastronomy/', target: '_blank', rel: 'noopener' }, 'ASSA African Ethnoastronomy page'), ' and Royal Museums Greenwich\'s ', h('a', { href: 'https://www.rmg.co.uk/stories/space-astronomy/south-african-star-myths', target: '_blank', rel: 'noopener' }, 'South African star myths'), '. Traditions differ widely; corrections are welcome.'),
    h('p', { class: 'hint' }, 'Star, constellation, Milky Way and deep-sky data: d3-celestial by Olaf Frohn (BSD-3-Clause), derived from the Hipparcos catalogue. PDF export: jsPDF (MIT). Place search: Open-Meteo. Overhead is MIT licensed.'),
);
$('#btn-about').addEventListener('click', () => about.showModal());
about.addEventListener('click', (e) => { if (e.target === about || e.target.closest('[data-close]')) about.close(); });

// ------------------------------------------------------------------ preview

const canvas = $('#preview');
const view = { zoom: 1, fit: 1, dims: [210, 297] };
const stage = $('#sheet');
let raf = 0, drawToken = 0;
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }

function setBusy(v) { $('#busy').hidden = !v; }

async function draw() {
  const token = ++drawToken;
  if (!sky.catalog) return;
  if (cfg.limMag > 6 && !sky.faintLoaded) {
    setBusy(true);
    try { await sky.ensureFaint(); } catch { toast('Could not load the faint-star catalog.'); }
    setBusy(false);
    if (token !== drawToken) return;
  }
  const { W, H } = pageDims(cfg);
  const b = cfg.bleed, PW = W + 2 * b, PH = H + 2 * b;
  view.dims = [PW, PH];
  const avail = { w: Math.max(80, stage.clientWidth - (innerWidth < 820 ? 24 : 56)), h: Math.max(80, stage.clientHeight - (innerWidth < 820 ? 24 : 56)) };
  const fit = Math.min(avail.w / PW, avail.h / PH);
  const cssScale = fit * view.zoom;
  view.fit = fit;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const t0 = performance.now();
  const S = new CanvasSurface(canvas, PW, PH, Math.min(cssScale * dpr, 9000 / Math.max(PW, PH)));
  canvas.style.width = PW * cssScale + 'px';
  canvas.style.height = PH * cssScale + 'px';
  let meta;
  try { meta = renderPoster(S, cfg, sky); } catch (e) { console.error(e); toast('Something went wrong drawing the chart: ' + e.message); return; }
  meta.ms = performance.now() - t0;
  updateStatus(meta);
}

function updateStatus(meta) {
  const { jd, date } = resolveMoment(cfg);
  const sun = A.solarSystem(jd).find((x) => x.kind === 'sun');
  const lst = (A.gmst(jd) + cfg.lon + 720) % 360;
  const v = A.apply(A.ofDateToHorizon(lst, cfg.lat), A.eqToVec(sun.ra, sun.dec));
  const alt = Math.asin(v[2]) * A.R2D;
  const bits = [`${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`];
  if (alt > -0.8) bits.push('☀ the Sun is up — this was a daytime sky');
  else if (alt > -18) bits.push(`twilight (Sun ${Math.abs(alt).toFixed(0)}° below the horizon)`);
  else bits.push('full darkness');
  const moon = A.solarSystem(jd).find((x) => x.kind === 'moon');
  bits.push(`Moon: ${A.moonPhaseName(moon.illum, moon.waxing)}, ${Math.round(moon.illum * 100)}% lit`);
  bits.push(`${meta.stars.toLocaleString()} stars`);
  $('#status').textContent = bits.join(' · ');
}

new ResizeObserver(() => schedule()).observe(stage);

// zoom: buttons, ctrl/cmd + wheel (and trackpad pinch) toward the cursor, drag to pan, double-click to toggle
function setZoom(z, cx, cy) {
  z = Math.min(8, Math.max(1, z));
  const r = canvas.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  if (cx == null) { cx = sr.left + sr.width / 2; cy = sr.top + sr.height / 2; }
  const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
  view.zoom = z;
  const k = view.fit * z;
  canvas.style.width = view.dims[0] * k + 'px';
  canvas.style.height = view.dims[1] * k + 'px';
  const n = canvas.getBoundingClientRect();
  stage.scrollLeft += n.left + fx * n.width - cx;
  stage.scrollTop += n.top + fy * n.height - cy;
  $('#zoom-level').textContent = Math.round(z * 100) + '%';
  schedule();
}
$('#zoom-in').addEventListener('click', () => setZoom(view.zoom * 1.4));
$('#zoom-out').addEventListener('click', () => setZoom(view.zoom / 1.4));
$('#zoom-fit').addEventListener('click', () => setZoom(1));
stage.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  setZoom(view.zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
}, { passive: false });
canvas.addEventListener('dblclick', (e) => setZoom(view.zoom > 1.05 ? 1 : 3, e.clientX, e.clientY));
let drag = null;
stage.addEventListener('pointerdown', (e) => { if (e.button === 0 && view.zoom > 1 && e.target === canvas) { drag = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop }; stage.setPointerCapture(e.pointerId); } });
stage.addEventListener('pointermove', (e) => { if (drag) { stage.scrollLeft = drag.l - (e.clientX - drag.x); stage.scrollTop = drag.t - (e.clientY - drag.y); } });
stage.addEventListener('pointerup', () => { drag = null; });

// ------------------------------------------------------------------ exports

const slug = (s) => (s || 'star-map').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'star-map';
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
let jspdfPromise = null;
function loadPdfLib() {
  if (window.jspdf) return Promise.resolve();
  jspdfPromise ||= new Promise((res, rej) => {
    const s = h('script', { src: new URL('../vendor/jspdf.umd.min.js', import.meta.url).href });
    s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF library'));
    document.head.append(s);
  });
  return jspdfPromise;
}
async function withBusy(label, fn) {
  const btns = [...document.querySelectorAll('#btn-pdf, #btn-pdf2')];
  btns.forEach((b) => { b.disabled = true; b.dataset.t = b.textContent; b.textContent = label; });
  setBusy(true);
  await new Promise((r) => setTimeout(r, 30)); // let the UI paint
  try { await fn(); } catch (e) { console.error(e); toast('Export failed: ' + e.message); } finally {
    btns.forEach((b) => { b.disabled = false; b.textContent = b.dataset.t; });
    setBusy(false);
  }
}
async function prep() { if (cfg.limMag > 6) await sky.ensureFaint(); }

const exportPdf = () => withBusy('Building PDF…', async () => {
  await Promise.all([loadPdfLib(), prep()]);
  const { W, H } = pageDims(cfg);
  const b = cfg.bleed;
  const S = new PdfSurface(window.jspdf.jsPDF, W + 2 * b, H + 2 * b, { title: cfg.title || 'Star map', customFont });
  renderPoster(S, cfg, sky);
  download(S.blob(), `${slug(cfg.title)}-star-map.pdf`);
});
const exportSvg = () => withBusy('Building SVG…', async () => {
  await prep();
  const { W, H } = pageDims(cfg);
  const b = cfg.bleed;
  const S = new SvgSurface(W + 2 * b, H + 2 * b, { title: cfg.title || 'Star map' });
  renderPoster(S, cfg, sky);
  download(new Blob([S.toString()], { type: 'image/svg+xml' }), `${slug(cfg.title)}-star-map.svg`);
});
const exportPng = () => withBusy('Rendering…', async () => {
  await prep();
  const { W, H } = pageDims(cfg);
  const b = cfg.bleed, PW = W + 2 * b, PH = H + 2 * b;
  let ppmm = (+cfg.pngDpi || 300) / 25.4;
  const maxSide = 14000;
  ppmm = Math.min(ppmm, maxSide / Math.max(PW, PH), Math.sqrt(120e6 / (PW * PH)));
  const c = document.createElement('canvas');
  const S = new CanvasSurface(c, PW, PH, ppmm);
  renderPoster(S, cfg, sky);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('image too large for this browser');
  download(blob, `${slug(cfg.title)}-star-map.png`);
});

function saveDesign() {
  const o = { app: 'overhead', version: 1, settings: {} };
  for (const k in DEFAULTS) o.settings[k] = cfg[k];
  download(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' }), `${slug(cfg.title)}.overhead.json`);
}
$('#load-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { setMany({ ...DEFAULTS, ...sanitize(JSON.parse(await f.text()).settings) }); toast('Design loaded'); } catch { toast('That file is not an Overhead design.'); }
  e.target.value = '';
});

$('#btn-pdf').addEventListener('click', exportPdf);
$('#btn-share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#c=${encodeState(cfg)}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Link is in the address bar'); }
});

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ------------------------------------------------------------------ boot

// Phones: the sections become tabs under the preview (one at a time); desktop keeps the accordion.
const sections = [...panel.querySelectorAll('details.sec')];
const tabBar = h('div', { id: 'tabs', role: 'tablist' }, sections.map((d, i) => h('button', { type: 'button', role: 'tab', onclick: () => { selectTab(i); window.scrollTo({ top: 0 }); } }, d.querySelector('summary').textContent)));
panel.prepend(tabBar);
const phone = matchMedia('(max-width: 820px)');
function selectTab(i) {
  sections.forEach((d, j) => { d.open = j === i; });
  [...tabBar.children].forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
}
function layoutForWidth() {
  if (phone.matches) selectTab(Math.max(0, sections.findIndex((d) => d.open)));
  else sections.forEach((d, j) => { d.open = j === 0 || j === sections.length - 1; });
}
phone.addEventListener('change', () => { layoutForWidth(); schedule(); });
layoutForWidth();

syncAll();
sky.load().then(() => { schedule(); }).catch((e) => {
  console.error(e);
  $('#status').textContent = 'Could not load the star catalog. Serve this folder over http(s) — see the README.';
});
window.__starmap = { cfg, sky, set, setMany };
