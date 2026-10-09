// UI: state, controls, live preview and exports.
import { DEFAULTS, chartDefaultsFor, CHART_EXAMPLES, THEMES, PAGE_SIZES, EXAMPLES, themeFields } from './config.js';
import { SkyData } from './data.js';
import { CanvasSurface, PdfSurface, SvgSurface } from './surfaces.js';
import { renderPoster, pageDims, resolveMoment } from './scene.js';
import * as A from './astro.js';
import { LORE_TRADITIONS } from './lore.js';
import { rasterise, defaultLogoUrl } from './logo.js';
import { renderChart, chartPageDims, chartNotes, chartGeometry, skyNotes } from './chart.js';

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

// Undo: snapshots before each change (slider drags are grouped), so a preset or a slip is never final.
const history = [];
let lastPush = 0;
function updateUndo() { const b = document.querySelector('#btn-undo'); if (b) b.disabled = !history.length; }
function pushHistory(force) {
  const now = Date.now();
  if (!force && now - lastPush < 700) return;
  lastPush = now;
  history.push(JSON.stringify(cfg));
  if (history.length > 60) history.shift();
  updateUndo();
}
function undo() {
  const prev = history.pop();
  updateUndo();
  if (!prev) { toast('Nothing to undo'); return; }
  lastPush = Date.now();
  Object.assign(cfg, JSON.parse(prev));
  persist(); syncAll(); layoutForWidth(); schedule();
}
function tipOnce() {
  try {
    if (localStorage.getItem('overhead.tip')) return;
    localStorage.setItem('overhead.tip', '1');
    toast(matchMedia('(max-width: 820px)').matches ? 'Changes appear live in the preview above' : 'Changes appear live in the preview on the right');
  } catch { /* ignore */ }
}

function set(key, value, { silent = false } = {}) {
  if (!silent) { pushHistory(false); tipOnce(); }
  cfg[key] = value;
  if (key === 'chartKind') {
    if (cfg.chartDefaultsFor !== value) Object.assign(cfg, chartDefaultsFor(value), { chartDefaultsFor: value });
    queueMicrotask(syncAll);
  }
  if (THEME_KEYS.has(key) && cfg.theme !== 'custom') { cfg.theme = 'custom'; syncAll(); }
  if (!silent) { persist(); schedule(); refreshVisibility(); }
}
function setMany(obj) {
  pushHistory(true);
  Object.assign(cfg, obj);
  persist(); syncAll(); schedule();
}
function syncAll() { for (const b of bindings) b.sync?.(); refreshVisibility(); }
function refreshVisibility() { for (const b of bindings) if (b.show) b.el.hidden = !b.show(cfg); try { syncTabs(); } catch { /* tabs not built yet */ } }

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

// A "?" next to a setting explains it in one sentence; every control also records its key so sections can show an "edited" dot.
const HELP = {
  limMag: 'Magnitude is brightness: smaller numbers are brighter. 6 is about the faintest star you can see from a dark site; 3 to 4 shows the main shapes without clutter.',
  nakedEye: 'Keeps only what you can really see without a telescope: stars to magnitude 6, bright deep-sky objects and the five visible planets.',
  starSize: 'Scales every star dot up or down.',
  sizeContrast: 'Higher values make bright stars much bigger than faint ones.',
  extinction: 'Stars near the horizon look dimmer because you see them through more air. This mimics that.',
  constNames: 'Names for each constellation: the full Latin name, or the short three-letter abbreviation.',
  constBorders: 'The official boundaries that divide the whole sky into 88 constellations.',
  milkyWay: 'A soft glow along the galaxy. On the charts it prints as a light grey wash.',
  mwOpacity: 'How strong the Milky Way glow is.',
  dsos: 'Showpiece objects beyond the stars: galaxies, clusters and nebulae from the Messier list.',
  starNames: 'Labels the brightest stars with their traditional names.',
  lore: 'Adds local names and stories for stars from San, Khoikhoi, Xhosa, Zulu and Sotho-Tswana sky traditions.',
  grid: 'Coordinate lines. Altitude/azimuth is height above the horizon and compass bearing; RA/Dec is the sky\'s fixed grid.',
  ecliptic: 'The path the Sun and planets follow across the sky.',
  celestialEquator: 'The sky\'s equator, the line above the Earth\'s equator.',
  projection: 'How the curved sky is flattened onto paper. Stereographic is the classic choice; orthographic looks like a dome; equal-area keeps areas honest.',
  fov: 'How far from straight overhead the map reaches. 90 degrees is the whole visible sky down to the horizon.',
  belowHorizon: 'Also draws stars below the horizon so shapes like squares and hearts are completely filled.',
  rotation: 'Turns the whole map around its centre.',
  mirror: 'Flips the map to show the sky as if seen from outside the sphere, like a globe.',
  chartProjection: 'Even spacing keeps the south celestial pole region readable. Stereographic gives a round horizon window but squashes the middle.',
  bleed: 'Extra margin around the page that a print shop trims off. Use 3 mm if you are sending it to a printer.',
  tz: 'The time zone of the place, so the right clock time is used (including daylight saving on that date).',
  shape: 'The outline of the star map. Full page fills the whole sheet.',
  ring: 'A border around the map: plain lines, tick marks, a degree scale or compass points.',
  starMode: 'One colour for every star, or the real colours of the stars (blue-white to orange).',
  starStyle: 'Plain dots, soft glows, or little spikes on the brightest stars.',
  dust: 'A fine speckle of tiny faint stars for a deep-sky look. It is decoration, not real stars.',
};
function decorate(key, el) {
  el.dataset.key = key;
  const text = HELP[key];
  const lab = text && el.querySelector('.lab, label');
  if (!lab) return el;
  const tip = h('p', { class: 'hint help', hidden: true }, text);
  const btn = h('button', { type: 'button', class: 'qm', 'aria-label': 'What does this do?', 'aria-expanded': 'false', onclick: () => { tip.hidden = !tip.hidden; btn.setAttribute('aria-expanded', String(!tip.hidden)); } }, '?');
  lab.append(btn);
  el.append(tip);
  return el;
}
for (const n of ['text', 'num', 'input', 'range', 'toggle', 'select', 'seg', 'color']) { const f = C[n]; C[n] = (key, ...a) => decorate(key, f(key, ...a)); }

const POSTER = (c) => c.mode !== 'chart';
const CHART = (c) => c.mode === 'chart';
/** Show an element in one mode only. */
const only = (visible, el) => reg(el, null, visible);
const grp = (...kids) => h('div', { class: 'grp' }, kids);

// Logo for the stargazing charts: the Overhead logo by default; people can replace it or remove it.
// A replacement stays on the device (localStorage) and is never uploaded.
let customLogo = null, defaultLogo = null;
const LOGO_KEY = 'overhead.logo';
const currentLogo = () => (cfg.logoMode === 'none' ? null : cfg.logoMode === 'custom' && customLogo ? customLogo : defaultLogo);
function logoControl() {
  const inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml,image/webp', hidden: true });
  const state = h('output', { class: 'logo-state' });
  const up = h('button', { type: 'button', onclick: () => inp.click() }, 'Replace logo…');
  const rm = h('button', { type: 'button', onclick: () => setMany({ logoMode: 'none' }) }, 'Remove');
  const back = h('button', { type: 'button', onclick: () => setMany({ logoMode: 'default' }) }, 'Use Overhead logo');
  const sync = () => {
    state.textContent = cfg.logoMode === 'none' ? 'No logo' : cfg.logoMode === 'custom' && customLogo ? 'Your logo' : 'Overhead logo';
    rm.hidden = cfg.logoMode === 'none';
    back.hidden = cfg.logoMode === 'default';
    up.textContent = cfg.logoMode === 'custom' ? 'Replace logo…' : 'Use your own logo…';
  };
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    const c = await rasterise(url);
    inp.value = '';
    if (!c) { toast('That image could not be read.'); return; }
    customLogo = c;
    try { localStorage.setItem(LOGO_KEY, c.toDataURL('image/png')); } catch { toast('Logo loaded, but it is too big to remember for next time.'); }
    setMany({ logoMode: 'custom' });
  });
  return reg(h('div', { class: 'row' }, h('div', { class: 'lab' }, 'Logo', state), h('div', { class: 'btns' }, up, rm, back), inp, h('p', { class: 'hint' }, 'Printed on the chart. A PNG or SVG with a transparent background works best. Your own logo never leaves your device.')), sync);
}

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

// ---- example gallery with live thumbnails (rendered once, a few at a time, from the real chart code)
function exampleList() {
  if (cfg.mode === 'chart') return CHART_EXAMPLES.filter((e) => e.set.chartKind === (cfg.chartKind || 'planisphere'));
  return EXAMPLES;
}
function exampleCfg(e) {
  if (e.set.chartKind) return { ...DEFAULTS, ...chartDefaultsFor(e.set.chartKind), chartDefaultsFor: e.set.chartKind, mode: 'chart', ...e.set };
  const theme = e.set.theme || 'Midnight';
  return { ...DEFAULTS, ...themeFields(theme), ...e.set, theme, mode: 'poster' };
}
function applyExample(e) { setMany(exampleCfg(e)); }

const thumbCache = new Map(), thumbQueue = [];
let pumping = false;
function pumpThumbs() {
  if (pumping || !sky.catalog) return;
  pumping = true;
  const step = () => {
    const job = thumbQueue.shift();
    if (!job) { pumping = false; return; }
    try { job(); } catch (err) { console.warn('thumbnail failed', err); }
    setTimeout(step, 20);
  };
  setTimeout(step, 30);
}
function thumb(e) {
  if (thumbCache.has(e.name)) return thumbCache.get(e.name);
  const c = document.createElement('canvas');
  c.className = 'thumb';
  thumbCache.set(e.name, c);
  thumbQueue.push(() => {
    const t = { ...exampleCfg(e), limMag: Math.min(exampleCfg(e).limMag, 6), milkyWay: false, bleed: 0 };
    const chart = t.mode === 'chart';
    const { W, H } = chart ? chartPageDims(t) : pageDims(t);
    const S = new CanvasSurface(c, W, H, 260 / W);
    if (chart) renderChart(S, t, sky, 'wheel', { logo: null }); else renderPoster(S, t, sky);
  });
  pumpThumbs();
  return c;
}
function galleryControl() {
  const box = h('div', { class: 'gallery', role: 'list' });
  const sync = () => {
    const list = exampleList();
    box.replaceChildren(...list.map((e) => h('button', { type: 'button', class: 'tile', role: 'listitem', title: e.name, onclick: () => applyExample(e) }, thumb(e), h('span', {}, e.name.replace(/^(Planisphere|Sky overhead) · /, '')))));
  };
  const count = h('output', { class: 'count' });
  const sync2 = () => { sync(); count.textContent = `${exampleList().length} to choose from`; };
  return reg(h('div', { class: 'row' }, h('div', { class: 'lab' }, 'Tap one to load it, then change anything', count), box), sync2);
}

/** One line saying what the chosen type makes (the type itself is switched in the top bar). */
function typeNote() {
  const p = h('p', { class: 'hint type-note' });
  const text = {
    poster: 'Poster: a keepsake of a special night to frame. Fully styled.',
    planisphere: 'Planisphere: a black-and-white star wheel to cut out and use all year. Turn it to any date and time.',
    zenith: 'Sky overhead: a black-and-white chart of the sky straight up, for one date, time and place.',
  };
  return reg(p, () => { p.textContent = text[cfg.mode === 'chart' ? cfg.chartKind || 'planisphere' : 'poster']; });
}

/** Plain-language time zone summary, so a wrong zone does not silently shift the sky. */
function tzNote() {
  const p = h('p', { class: 'hint tznote' });
  return reg(p, () => {
    const std = A.standardOffsetHours(cfg.tz, cfg.lon);
    p.textContent = cfg.tz === 'auto' || !cfg.tz
      ? `Estimated from longitude (${std.name}). Search for the place or pick its time zone for exact results.`
      : `Using ${std.name}${std.dst ? ': daylight saving is applied automatically for the date' : ': no daylight saving'}.`;
  });
}

const printTip = () => h('p', { class: 'hint' }, 'Print at 100% ("actual size"), never "fit to page", so the scales stay true.');

/** The starting panel: choose, set the place and moment, pick an example, optionally recolour. Download lives at the very end. */
function startSection() {
  return section('Start', true,
    typeNote(),
    C.sub('1 · Place and moment'),
    only(POSTER, C.text('title', 'Title (up to 3 lines)', { area: true, placeholder: 'Press Enter to start a new line' })),
    only(CHART, C.text('chartTitle', 'Title', { placeholder: 'Leave blank for the default title' })),
    placeControl(),
    C.text('placeName', 'Location label'),
    h('div', { class: 'pair' }, C.input('date', 'Date', 'date', { show: (c) => POSTER(c) || c.chartKind === 'zenith' }), C.input('time', 'Local time', 'time', { show: (c) => POSTER(c) || c.chartKind === 'zenith' })),
    C.select('tz', 'Time zone', timezoneOptions),
    tzNote(),
    h('div', { class: 'divider' }),
    C.sub('2 · Start from an example'),
    galleryControl(),
    only(POSTER, grp(
      h('div', { class: 'divider' }),
      C.sub('3 · Or just change the colours'),
      C.hint('Examples change the whole design. Colour themes change only the colours and keep everything else.'),
      themeGrid(),
    )),
    h('div', { class: 'divider' }),
    h('p', { class: 'hint next-hint' }, 'Everything is editable: use the tabs below (Style, Sky, Layout…) to fine-tune, and download from the last tab when you are happy.'),
  );
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
  startSection(),
  only(POSTER, section('Details', false,
    C.text('subtitle', 'Subtitle (optional)'),
    C.sub('Exact coordinates'),
    h('div', { class: 'pair' }, C.num('lat', 'Latitude °', { min: -90, max: 90, step: 0.0001 }), C.num('lon', 'Longitude °', { min: -180, max: 180, step: 0.0001 })),
    C.hint('Place, date, time and time zone are on the Start tab.'),
    C.sub('Text on the poster'),
    C.toggle('showDate', 'Show date'),
    C.select('dateFormat', 'Date format', [['long', 'August 5, 2021'], ['eu', '5 August 2021'], ['short', '05.08.2021'], ['us', '08/05/2021'], ['iso', '2021-08-05']], { show: (c) => c.showDate }),
    C.toggle('showTime', 'Include time', { show: (c) => c.showDate }),
    C.toggle('showPlace', 'Show location'),
    C.toggle('showCoords', 'Show coordinates'),
    C.select('coordFormat', 'Coordinate format', [['dec', '39.0885°N'], ['ddm', "39° 5.310'N"], ['dms', '39° 5\' 19"N']], { show: (c) => c.showCoords }),
    C.text('footer', 'Extra lines', { area: true, placeholder: 'A quote, names, a note…' }),
  )),
  only(CHART, section('Details', false,
    C.sub('Exact coordinates'),
    h('div', { class: 'pair' }, C.num('lat', 'Latitude °', { min: -90, max: 90, step: 0.0001 }), C.num('lon', 'Longitude °', { min: -180, max: 180, step: 0.0001 })),
    C.hint('Latitude sets the window; longitude and time zone set the clock correction printed on the chart.', (c) => c.chartKind !== 'zenith'),
    C.select('chartProjection', 'Star wheel projection', [['equidistant', 'Even spacing (recommended)'], ['stereo', 'Stereographic (round window)'], ['equalarea', 'Equal-area']], { show: (c) => c.chartKind !== 'zenith' }),
    C.toggle('chartPocket', 'Pocket cover (no pin needed)', { show: (c) => c.chartKind !== 'zenith' }),
    C.hint('The cover folds into a pocket that holds the wheel, so it turns without a paper fastener or lamination. Turn off to use a pin instead.', (c) => c.chartKind !== 'zenith'),
    C.hint('Charts always print in black and white, so they work on any printer.'),
    C.sub('On the page'),
    C.toggle('howTo', 'Show "how to use"'),
    C.toggle('details', 'Show location and time details'),
    C.sub('Credit & logo'),
    C.toggle('credit', 'Small credit to Overhead'),
    logoControl(),
    C.seg('logoPos', 'Logo position', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]),
  )),
  only(POSTER, section('Style', false,
    C.hint('Ready-made colour themes are on the Start tab; fine-tune the colours here.'),
    C.sub('Background'),
    C.seg('bgMode', 'Sky fill', [['solid', 'Solid'], ['radial', 'Radial'], ['vertical', 'Vertical']]),
    h('div', { class: 'colors' }, C.color('bg1', 'Sky'), C.color('bg2', 'Sky edge', { show: (c) => c.bgMode !== 'solid' }), C.color('pageBg', 'Paper')),
    C.toggle('dust', 'Fine star dust', { show: (c) => !c.nakedEye }),
    C.range('dustAmount', 'Dust amount', 0.2, 3, 0.1, { show: (c) => c.dust && !c.nakedEye, fmt: (v) => v.toFixed(1) }),
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
  )),
  section('Sky', false,
    C.toggle('nakedEye', 'Naked-eye only'),
    C.hint('Stars to magnitude 6, bright deep-sky objects and the five visible planets: what you can really see without a telescope.', (c) => c.nakedEye),
    C.range('limMag', 'Limiting magnitude', 2, 8, 0.1, { fmt: (v) => v.toFixed(1) }),
    C.hint('Higher shows fainter stars (6 ≈ naked eye under dark skies).'),
    C.range('starSize', 'Star size', 0.4, 3, 0.05, { fmt: (v) => v.toFixed(2) + '×' }),
    C.range('sizeContrast', 'Bright vs faint contrast', 0.2, 2, 0.05, { fmt: (v) => v.toFixed(2) }),
    only(POSTER, C.toggle('extinction', 'Atmospheric dimming near horizon')),
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
    C.toggle('planets', 'Planets', { show: POSTER }),
    C.toggle('moon', 'Moon with phase', { show: POSTER }),
    C.range('moonSize', 'Moon size', 0.5, 4, 0.1, { show: (c) => POSTER(c) && c.moon, fmt: (v) => v.toFixed(1) + '×' }),
    C.toggle('sun', 'Sun', { show: POSTER }),
    C.range('sunSize', 'Sun size', 0.5, 4, 0.1, { show: (c) => POSTER(c) && c.sun, fmt: (v) => v.toFixed(1) + '×' }),
    C.toggle('planetLabels', 'Label planets, Sun & Moon', { show: (c) => POSTER(c) && (c.planets || c.moon || c.sun) }),
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
    only(POSTER, C.sub('Projection')),
    only(POSTER, C.select('projection', 'Projection', [['stereo', 'Stereographic'], ['equidistant', 'Equidistant'], ['equalarea', 'Equal-area'], ['ortho', 'Orthographic (dome)']])),
    only(POSTER, C.range('fov', 'Field of view (from zenith)', 30, 170, 1, { fmt: (v) => v + '°' })),
    only(POSTER, C.toggle('belowHorizon', 'Show sky below the horizon')),
    only(POSTER, C.range('rotation', 'Rotate chart', -180, 180, 1, { fmt: (v) => v + '°' })),
    only(POSTER, C.toggle('mirror', 'Mirror (view from outside the sphere)')),
  ),
  section('Layout', false,
    C.select('pageSize', 'Paper size', Object.keys(PAGE_SIZES).map((k) => [k, k])),
    C.hint('A3 prints a planisphere best: a bigger wheel with easier-to-read stars. A4 works too.', (c) => CHART(c) && c.chartKind !== 'zenith'),
    C.seg('orientation', 'Orientation', [['portrait', 'Portrait'], ['landscape', 'Landscape']], { show: (c) => POSTER(c) && c.pageSize !== 'Custom' }),
    h('div', { class: 'pair' }, C.num('customW', 'Width mm', { min: 50, max: 2000, step: 1, show: (c) => c.pageSize === 'Custom' }), C.num('customH', 'Height mm', { min: 50, max: 2000, step: 1, show: (c) => c.pageSize === 'Custom' })),
    C.range('bleed', 'Print bleed', 0, 10, 0.5, { fmt: (v) => (v ? v + ' mm' : 'None') }),
    only(POSTER, grp(
      C.sub('Chart'),
      C.select('shape', 'Shape', [['circle', 'Circle'], ['rounded', 'Rounded square'], ['square', 'Square'], ['arch', 'Arch'], ['hexagon', 'Hexagon'], ['heart', 'Heart'], ['page', 'Full page']]),
      C.range('chartSize', 'Chart size', 30, 100, 1, { fmt: (v) => v + '%' }),
      C.range('chartTop', 'Distance from top', 0, 45, 0.5, { show: (c) => c.shape !== 'page', fmt: (v) => v + '%' }),
      C.select('ring', 'Border', [['none', 'None'], ['line', 'Thin line'], ['double', 'Double line'], ['ticks', 'Tick marks'], ['degrees', 'Degree scale'], ['compass', 'Compass points']]),
      C.range('ringGap', 'Border gap', 0, 10, 0.5, { show: (c) => c.ring !== 'none', fmt: (v) => v + ' mm' }),
      C.range('ringWidth', 'Border weight', 0.1, 2, 0.05, { show: (c) => c.ring !== 'none', fmt: (v) => v.toFixed(2) + ' mm' }),
      C.select('pageBorder', 'Page frame', [['none', 'None'], ['line', 'Single line'], ['double', 'Double line']]),
      C.range('borderInset', 'Frame inset', 3, 30, 0.5, { show: (c) => c.pageBorder !== 'none', fmt: (v) => v + ' mm' }),
    )),
    C.sub('Typography'),
    only(POSTER, C.select('titleFont', 'Title font', FONTS)),
    C.select('bodyFont', 'Details font', FONTS),
    fontUpload(),
    only(POSTER, grp(
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
    )),
  ),
  section('Download', true,
    C.select('pageSize', 'Paper size', Object.keys(PAGE_SIZES).map((k) => [k, k])),
    C.hint('A3 prints a planisphere best: a bigger wheel with easier-to-read stars. A4 works too.', (c) => CHART(c) && c.chartKind !== 'zenith'),
    h('button', { type: 'button', class: 'primary wide', onclick: () => exportPdf(), id: 'btn-pdf2' }, 'Download PDF'),
    printTip(),
    h('div', { class: 'btns' },
      h('button', { type: 'button', onclick: () => exportPng() }, 'PNG image'),
      h('button', { type: 'button', onclick: () => exportSvg() }, 'SVG')),
    C.select('pngDpi', 'PNG resolution', [['150', '150 dpi'], ['300', '300 dpi (print)'], ['600', '600 dpi']], {}),
    C.hint('The PDF is fully vector: every star is a crisp shape at any size, ready for a print shop or your home printer.', POSTER),
    C.hint('The PDF has two pages: the star wheel and the cover. PNG and SVG export the page you are previewing. Print at 100% (no "fit to page") so the scales stay true.', CHART),
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
const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
const sect = (title, ...kids) => h('section', { class: 'about-sec' }, h('h3', {}, title), ...kids);
about.querySelector('.about-body').replaceChildren(
  h('p', { class: 'lead' }, 'Overhead draws the sky as it looked from any place at any moment, then gives you a print-ready PDF. It is free, needs no account, and runs entirely in your browser.'),
  sect('What you can make',
    h('ul', {},
      h('li', {}, h('strong', {}, 'Poster'), ': a keepsake of a special night to frame. Fully styled, with your own title.'),
      h('li', {}, h('strong', {}, 'Planisphere'), ': a black-and-white star wheel and horizon cover to cut out and fold together (or pin, if you prefer). Turn it to any date and time and it shows what is up.'),
      h('li', {}, h('strong', {}, 'Sky overhead'), ': a black-and-white chart of the sky straight above you for one date, time and place, with the visible planets and the Moon.'))),
  sect('How to use it',
    h('ol', {},
      h('li', {}, 'Pick what you are making in the top bar, then set the place and moment on the Start tab.'),
      h('li', {}, 'Choose an example or colour theme, then fine-tune anything in the other tabs. The preview updates live, and Undo (Ctrl or Cmd + Z) steps back.'),
      h('li', {}, 'Open the Download tab, choose the paper size and download the PDF. Print at 100% ("actual size") so the scales stay true.'))),
  sect('Why I made it',
    h('p', {}, 'These posters are really a bit of astronomy and a nice layout, and I did not think they should cost money. When I wanted one for my parents\' anniversary, some sites wanted nearly R500 just for the PDF to print. So I built this. If you make something you love, that is the whole point.'),
    h('p', {}, 'Made by ', link('https://github.com/enzoperesafonso', 'Enzo Afonso'), ' \u00b7 ', link('https://github.com/enzoperesafonso/overhead', 'source on GitHub'))),
  sect('How accurate is it?',
    h('ul', {},
      h('li', {}, 'Stars use real catalogue positions (to magnitude 8), corrected for precession, shown for the date you choose.'),
      h('li', {}, 'The Sun, Moon and planets are calculated with a low-precision method: planets are good to about an arcminute, the Moon to a fraction of a degree. That is plenty for a poster or a chart, not for telescope pointing.'),
      h('li', {}, 'A planisphere is accurate to roughly 15 minutes through the year, works best within about 6\u00b0 of the latitude it was made for, and its hours are local mean solar time (the chart prints your clock correction).'),
      h('li', {}, '"Naked-eye only" keeps stars to magnitude 6, bright deep-sky objects and the five planets you can see without a telescope.'))),
  sect('Privacy',
    h('p', {}, 'Your designs, fonts and logo never leave your device. The only network call is the optional place search, which sends just the text you type to the Open-Meteo geocoding service.')),
  sect('Credits',
    h('ul', {},
      h('li', {}, 'Stars, constellations, Milky Way and deep-sky data: ', link('https://github.com/ofrohn/d3-celestial', 'd3-celestial'), ' by Olaf Frohn (BSD-3-Clause), derived from the Hipparcos catalogue.'),
      h('li', {}, 'Southern African star names: compiled from published ethnoastronomy, chiefly the ', link('https://assa.saao.ac.za/astronomy-in-south-africa/ethnoastronomy/', 'ASSA African Ethnoastronomy page'), ' and Royal Museums Greenwich\'s ', link('https://www.rmg.co.uk/stories/space-astronomy/south-african-star-myths', 'South African star myths'), '. Traditions differ widely; corrections are welcome.'),
      h('li', {}, 'PDF export: ', link('https://github.com/parallax/jsPDF', 'jsPDF'), ' (MIT). Place search: ', link('https://open-meteo.com/', 'Open-Meteo'), '. Planet positions: Paul Schlyter\'s method.'),
      h('li', {}, 'Overhead itself is free for non-commercial use (PolyForm Noncommercial 1.0.0).'))),
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
  const chart = cfg.mode === 'chart';
  const { W, H } = chart ? chartPageDims(cfg) : pageDims(cfg);
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
  try { meta = chart ? renderChart(S, cfg, sky, cfg.chartPart, { logo: currentLogo() }) : renderPoster(S, cfg, sky); } catch (e) { console.error(e); toast('Something went wrong drawing the chart: ' + e.message); return; }
  meta.ms = performance.now() - t0;
  updateStatus(meta);
}

function updateStatus(meta) {
  if (cfg.mode === 'chart' && cfg.chartKind === 'zenith') {
    const sk = skyNotes(cfg);
    $('#status').textContent = `Sky overhead · ${sk.when.split(' \u00b7 ')[0]} · Moon: ${sk.moon.split(' \u00b7 ')[0]} · ${sk.planets.length} planet${sk.planets.length === 1 ? '' : 's'} above the horizon`;
    return;
  }
  if (cfg.mode === 'chart') {
    const n = chartNotes(cfg);
    $('#status').textContent = `${cfg.chartPart === 'cover' ? 'Cover with horizon window' : 'Star wheel'} · latitude ${chartGeometry(cfg).phi.toFixed(2)}°${n.hemi} · ${n.range.replace(/\.$/, '')} · ${n.clock.replace(/\.$/, '')}`;
    return;
  }
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

const isChart = () => cfg.mode === 'chart';
const pageFor = () => (isChart() ? chartPageDims(cfg) : pageDims(cfg));
const paint = (S, part) => (isChart() ? renderChart(S, cfg, sky, part, { logo: currentLogo() }) : renderPoster(S, cfg, sky));
const twoPage = () => isChart() && cfg.chartKind !== 'zenith';
const fileBase = () => (isChart() ? (cfg.chartKind === 'zenith' ? `overhead-sky-${slug(cfg.placeName || 'chart')}-${cfg.date}` : `overhead-planisphere-${slug(cfg.placeName || 'chart')}`) : `${slug(cfg.title)}-star-map`);

const exportPdf = () => withBusy('Building PDF…', async () => {
  await Promise.all([loadPdfLib(), prep()]);
  const { W, H } = pageFor();
  const b = cfg.bleed;
  const S = new PdfSurface(window.jspdf.jsPDF, W + 2 * b, H + 2 * b, { title: isChart() ? 'Planisphere' : cfg.title.replace(/\s*\n\s*/g, ' ') || 'Star map', customFont });
  paint(S, 'wheel');
  if (twoPage()) { S.newPage(); paint(S, 'cover'); }
  download(S.blob(), `${fileBase()}.pdf`);
});
const exportSvg = () => withBusy('Building SVG…', async () => {
  await prep();
  const { W, H } = pageFor();
  const b = cfg.bleed;
  const S = new SvgSurface(W + 2 * b, H + 2 * b, { title: cfg.title.replace(/\s*\n\s*/g, ' ') || 'Star map' });
  paint(S, cfg.chartPart);
  download(new Blob([S.toString()], { type: 'image/svg+xml' }), `${fileBase()}${twoPage() ? '-' + cfg.chartPart : ''}.svg`);
});
const exportPng = () => withBusy('Rendering…', async () => {
  await prep();
  const { W, H } = pageFor();
  const b = cfg.bleed, PW = W + 2 * b, PH = H + 2 * b;
  let ppmm = (+cfg.pngDpi || 300) / 25.4;
  const maxSide = 14000;
  ppmm = Math.min(ppmm, maxSide / Math.max(PW, PH), Math.sqrt(120e6 / (PW * PH)));
  const c = document.createElement('canvas');
  const S = new CanvasSurface(c, PW, PH, ppmm);
  paint(S, cfg.chartPart);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('image too large for this browser');
  download(blob, `${fileBase()}${twoPage() ? '-' + cfg.chartPart : ''}.png`);
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
$('#btn-undo').addEventListener('click', undo);
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) { e.preventDefault(); undo(); }
});
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
const TAB_ICON = { Start: '\u2605', Details: '\u270e', Style: '\u25d0', Sky: '\u2726', Layout: '\u25ad', Download: '\u2193' };
const tabBar = h('div', { id: 'tabs', role: 'tablist' }, sections.map((d, i) => h('button', { type: 'button', role: 'tab', 'data-icon': TAB_ICON[d.querySelector('summary').textContent] || '', onclick: () => { selectTab(i); window.scrollTo({ top: 0 }); } }, d.querySelector('summary').textContent)));
panel.prepend(tabBar);
sections.forEach((d) => d.querySelector('.body').append(h('button', { type: 'button', class: 'next-btn', onclick: () => { const vis = visibleIdx(); const n = vis[vis.indexOf(sections.indexOf(d)) + 1]; if (n != null) { selectTab(n); window.scrollTo({ top: 0 }); } } }, 'Next')));
const phone = matchMedia('(max-width: 820px)');
function selectTab(i) {
  sections.forEach((d, j) => { d.open = j === i; });
  [...tabBar.children].forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
}
function visibleIdx() { return sections.map((d, i) => (d.hidden ? -1 : i)).filter((i) => i >= 0); }
const sectionKeys = (d) => (d._keys ||= [...d.querySelectorAll('[data-key]')].map((e) => e.dataset.key));
/** A dot on every tab whose settings differ from the defaults. */
function syncEdited() {
  const base = { ...DEFAULTS, ...(cfg.mode === 'chart' ? chartDefaultsFor(cfg.chartKind || 'planisphere') : {}) };
  sections.forEach((d, i) => {
    if (i === 0) return;
    const ed = sectionKeys(d).some((k) => k in base && JSON.stringify(cfg[k]) !== JSON.stringify(base[k]));
    d.classList.toggle('edited', ed);
    tabBar.children[i].classList.toggle('edited', ed);
  });
}
function syncNext() {
  const vis = visibleIdx();
  sections.forEach((d, i) => {
    const btn = d.querySelector('.next-btn');
    const pos = vis.indexOf(i);
    if (!btn) return;
    btn.hidden = pos < 0 || pos === vis.length - 1;
    if (!btn.hidden) btn.textContent = `Next: ${sections[vis[pos + 1]].querySelector('summary').textContent} \u2192`;
  });
}
function syncTabs() {
  syncEdited();
  syncNext();
  sections.forEach((d, i) => { tabBar.children[i].hidden = d.hidden; });
  if (phone.matches) { const cur = sections.findIndex((d) => d.open && !d.hidden); if (cur < 0) selectTab(visibleIdx()[0] ?? 0); }
  else { const v = visibleIdx(); sections.forEach((d, j) => { if (d.hidden) d.open = false; else if (!sections.some((x) => x.open && !x.hidden)) d.open = j === v[0] || j === v[v.length - 1]; }); }
}
function layoutForWidth() {
  const v = visibleIdx();
  if (phone.matches) selectTab(sections.findIndex((d) => d.open && !d.hidden) >= 0 ? sections.findIndex((d) => d.open && !d.hidden) : (v[0] ?? 0));
  else sections.forEach((d, j) => { d.open = !d.hidden && (j === v[0] || j === v[v.length - 1]); });
}
phone.addEventListener('change', () => { layoutForWidth(); schedule(); });

// Two kinds of output: a keepsake poster, or a stargazing planisphere.
const modeButtons = [...document.querySelectorAll('#modes button')];
const partButtons = [...document.querySelectorAll('#parts button')];
function setMode(m, kind) {
  const o = { mode: m };
  if (m === 'chart') {
    const k = kind || cfg.chartKind || 'planisphere';
    o.chartKind = k;
    if (cfg.chartDefaultsFor !== k) Object.assign(o, chartDefaultsFor(k), { chartDefaultsFor: k });
  }
  setMany(o);
  layoutForWidth();
  if (matchMedia('(max-width: 820px)').matches) window.scrollTo({ top: 0 });
}
modeButtons.forEach((b) => b.addEventListener('click', () => (b.dataset.type === 'poster' ? setMode('poster') : setMode('chart', b.dataset.type))));
partButtons.forEach((b) => b.addEventListener('click', () => setMany({ chartPart: b.dataset.part })));
reg(h('span'), () => {
  const m = cfg.mode === 'chart' ? 'chart' : 'poster';
  document.body.dataset.mode = m;
  const cur = m === 'chart' ? cfg.chartKind || 'planisphere' : 'poster';
  modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === cur)));
  partButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.part === cfg.chartPart)));
  $('#parts').hidden = !(m === 'chart' && cfg.chartKind !== 'zenith');
  for (const id of ['#btn-pdf2']) { const b = $(id); if (b && !b.disabled) b.textContent = m === 'chart' && cfg.chartKind !== 'zenith' ? 'Download PDF (2 pages)' : 'Download PDF'; }
});
const welcome = $('#welcome');
welcome.addEventListener('click', (e) => { const c = e.target.closest('[data-choose]'); if (c) welcome.close(c.dataset.choose); });
welcome.addEventListener('close', () => {
  const v = welcome.returnValue;
  if (v === 'planisphere' || v === 'zenith') setMode('chart', v);
  else if (v === 'poster') setMode('poster');
  else if (!cfg.mode) setMany({ mode: 'poster' });
});
rasterise(defaultLogoUrl()).then((c) => { defaultLogo = c; schedule(); });
try { const saved = localStorage.getItem(LOGO_KEY); if (saved) rasterise(saved).then((c) => { customLogo = c; if (!c && cfg.logoMode === 'custom') setMany({ logoMode: 'default' }); else { syncAll(); schedule(); } }); else if (cfg.logoMode === 'custom') cfg.logoMode = 'default'; } catch { /* ignore */ }
layoutForWidth();

syncAll();
if (!cfg.mode) welcome.showModal();
sky.load().then(() => { schedule(); pumpThumbs(); }).catch((e) => {
  console.error(e);
  $('#status').textContent = 'Could not load the star catalog. Serve this folder over http(s) — see the README.';
});
window.__starmap = { cfg, sky, set, setMany };
