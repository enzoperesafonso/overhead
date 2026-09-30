// Loads the catalogs from /data and prepares them (unit vectors, magnitude-sorted).
import { eqToVec } from './astro.js';
import { buildMilkyWayField } from './milkyway.js';

const defaultGet = (f) => fetch(new URL(`../data/${f}`, import.meta.url)).then((r) => {
  if (!r.ok) throw new Error(`Failed to load ${f}: ${r.status}`);
  return r.json();
});

function buildCatalog(parts) {
  const n = parts.reduce((s, p) => s + p.mag.length, 0);
  const rows = new Array(n);
  let k = 0;
  for (const p of parts) for (let i = 0; i < p.mag.length; i++) rows[k++] = [p.ra[i], p.dec[i], p.mag[i], p.bv[i], p.hip[i]];
  rows.sort((a, b) => b[2] - a[2]); // faintest first, so bright stars are drawn on top
  const cat = { n, x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n), mag: new Float32Array(n), bv: new Float32Array(n), hip: new Int32Array(n) };
  rows.forEach((r, i) => {
    const v = eqToVec(r[0], r[1]);
    cat.x[i] = v[0]; cat.y[i] = v[1]; cat.z[i] = v[2];
    cat.mag[i] = r[2]; cat.bv[i] = r[3]; cat.hip[i] = r[4];
  });
  return cat;
}

export class SkyData {
  /** @param {(file: string) => Promise<any>} [get] how to fetch a data file (default: fetch from /data) */
  constructor(get = defaultGet) { this.get = get; this.faintLoaded = false; this._faintPromise = null; }

  async load() {
    const [stars, names, cons, borders, mw, dsos] = await Promise.all([
      this.get('stars.json'), this.get('names.json'), this.get('constellations.json'), this.get('borders.json'), this.get('milkyway.json'), this.get('dsos.json'),
    ]);
    this.parts = [stars];
    this.catalog = buildCatalog(this.parts);
    this.names = names.map(([name, ra, dec, mag, con]) => ({ name, vec: eqToVec(ra, dec), mag, con }));
    this.constellations = cons.map((c) => ({
      id: c.id, la: c.la, en: c.en, vec: eqToVec(c.ra, c.dec),
      lines: c.lines.map((l) => l.map(([ra, dec]) => eqToVec(ra, dec))),
    }));
    this.borders = borders.map((l) => l.map(([ra, dec]) => eqToVec(ra, dec)));
    this.milkyWay = mw.map((rings) => rings.map((ring) => ring.map(([ra, dec]) => eqToVec(ra, dec))));
    this.dsos = dsos.map(([name, alt, type, mag, ra, dec, dim]) => ({ name, alt, type, mag, vec: eqToVec(ra, dec), dim }));
    return this;
  }

  /** Soft Milky Way brightness field (built on first use). */
  get mwField() { return (this._mw ||= buildMilkyWayField(this.milkyWay)); }

  /** Lazy-load the mag 6-8 stars (1 MB) the first time the limit goes above 6. */
  ensureFaint() {
    if (this.faintLoaded) return Promise.resolve(false);
    if (!this._faintPromise) {
      this._faintPromise = this.get('stars-faint.json').then((f) => {
        this.parts.push(f);
        this.catalog = buildCatalog(this.parts);
        this.faintLoaded = true;
        return true;
      });
    }
    return this._faintPromise;
  }
}
