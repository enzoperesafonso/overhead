// Converts the d3-celestial catalogs (BSD-3, Olaf Frohn) into the compact
// JSON files the app loads from /data. Run:  npm run build:data
//
// Usage: node tools/build-data.mjs [path/to/d3-celestial/data]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] || join(here, 'raw/celestial/data');
const out = join(here, '..', 'data');
mkdirSync(out, { recursive: true });

const read = (f) => JSON.parse(readFileSync(join(src, f), 'utf8'));
const write = (f, o) => {
  const s = JSON.stringify(o);
  writeFileSync(join(out, f), s);
  console.log(f.padEnd(24), (s.length / 1024).toFixed(0).padStart(6), 'KB');
};
const ra360 = (lon) => ((lon % 360) + 360) % 360;
const r = (v, n) => +v.toFixed(n);
const ascii = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');

// ---- stars (columnar: ra, dec in deg; mag; B-V) ----
const s6 = read('stars.6.json').features;
const s8 = read('stars.8.json').features;
const have = new Set(s6.map((f) => f.id));
const columns = (feats) => {
  const c = { ra: [], dec: [], mag: [], bv: [], hip: [] };
  for (const f of feats) {
    const [lon, lat] = f.geometry.coordinates;
    const bv = parseFloat(f.properties.bv);
    c.ra.push(r(ra360(lon), 3));
    c.dec.push(r(lat, 3));
    c.mag.push(r(f.properties.mag, 2));
    c.bv.push(Number.isFinite(bv) ? r(bv, 2) : 0.6);
    c.hip.push(f.id);
  }
  return c;
};
write('stars.json', columns(s6));
write('stars-faint.json', columns(s8.filter((f) => !have.has(f.id))));

// ---- star names ----
const names = read('starnames.json');
const byId = new Map(s6.map((f) => [f.id, f]));
const named = [];
for (const [id, n] of Object.entries(names)) {
  const f = byId.get(+id);
  if (!f || !n.name) continue;
  const [lon, lat] = f.geometry.coordinates;
  named.push([ascii(n.name), r(ra360(lon), 3), r(lat, 3), f.properties.mag, n.c || '']);
}
named.sort((a, b) => a[3] - b[3]);
write('names.json', named);

// The source data glues words together ("CanesVenatici"); put the spaces back.
const words = (s) => ascii(s).replace(/([a-z'])([A-Z])/g, '$1 $2');

// ---- constellations ----
const cons = read('constellations.json').features;
const lines = new Map(read('constellations.lines.json').features.map((f) => [f.id, f.geometry.coordinates]));
const constellations = cons.map((f) => {
  const p = f.properties;
  return {
    id: f.id,
    la: words(p.la || p.name),
    en: words(p.en || p.name),
    ra: r(ra360(f.geometry.coordinates[0]), 2),
    dec: r(f.geometry.coordinates[1], 2),
    lines: (lines.get(f.id) || []).map((l) => l.map(([lo, la]) => [r(ra360(lo), 3), r(la, 3)])),
  };
});
write('constellations.json', constellations);

// ---- IAU boundaries ----
const borders = [];
for (const f of read('constellations.borders.json').features)
  for (const l of f.geometry.coordinates) borders.push(l.map(([lo, la]) => [r(ra360(lo), 2), r(la, 2)]));
write('borders.json', borders);

// ---- Milky Way (5 nested brightness contours, each may have holes) ----
const mw = read('milkyway.json').features.map((f) =>
  f.geometry.coordinates.map((ring) => ring.map(([lo, la]) => [r(ra360(lo), 1), r(la, 1)])),
);
write('milkyway.json', mw);

// ---- deep-sky objects: Messier + brightest others ----
const dsos = [];
for (const f of read('messier.json').features) {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  dsos.push([p.name, ascii(p.alt), p.type, p.mag ?? 99, r(ra360(lon), 3), r(lat, 3), parseFloat(p.dim) || 10]);
}
for (const f of read('dsos.bright.json').features) {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  if (p.type === 'pos') continue;
  dsos.push([p.desig, '', p.type, p.mag ?? 99, r(ra360(lon), 3), r(lat, 3), parseFloat(p.dim) || 30]);
}
write('dsos.json', dsos);
