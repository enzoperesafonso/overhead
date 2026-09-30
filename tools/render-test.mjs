// Headless smoke test: renders posters with the real scene code into PDF and SVG (no browser).
// The soft Milky Way raster needs a canvas, so it is skipped here.
//   node tools/render-test.mjs [outDir]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = process.argv[2] || join(here, 'out');
mkdirSync(out, { recursive: true });

// package.json says "type": "module", so evaluate the UMD bundle by hand.
const mod = { exports: {} };
new Function('module', 'exports', readFileSync(join(root, 'vendor/jspdf.umd.min.js'), 'utf8')).call(globalThis, mod, mod.exports);
const { jsPDF } = mod.exports;

const { SkyData } = await import('../js/data.js');
const { PdfSurface, SvgSurface } = await import('../js/surfaces.js');
const { renderPoster, pageDims } = await import('../js/scene.js');
const { DEFAULTS, EXAMPLES, themeFields } = await import('../js/config.js');

const sky = new SkyData(async (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8')));
await sky.load();
await sky.ensureFaint();

const variants = {
  reference: {},
  wedding: { ...themeFields('Noir Gold'), ...EXAMPLES[1].set, theme: 'Noir Gold', milkyWay: false },
  heart: { shape: 'heart', ...themeFields('Rose Gold'), theme: 'Rose Gold', belowHorizon: true, fov: 120, starStyle: 'glow', limMag: 7, ring: 'line' },
  landscape_grid: { orientation: 'landscape', ...themeFields('Blueprint'), theme: 'Blueprint', grid: 'both', ecliptic: true, celestialEquator: true, constNames: 'abbr', dsos: true, planets: true, moon: true, sun: true, starNames: 20, ring: 'degrees' },
};
for (const [name, over] of Object.entries(variants)) {
  const cfg = { ...DEFAULTS, ...over };
  const { W, H } = pageDims(cfg);
  const t0 = performance.now();
  const pdf = new PdfSurface(jsPDF, W + 2 * cfg.bleed, H + 2 * cfg.bleed, { title: name });
  const meta = renderPoster(pdf, cfg, sky);
  const bytes = Buffer.from(pdf.doc.output('arraybuffer'));
  writeFileSync(join(out, `${name}.pdf`), bytes);
  const svg = new SvgSurface(W + 2 * cfg.bleed, H + 2 * cfg.bleed, { title: name });
  renderPoster(svg, cfg, sky);
  writeFileSync(join(out, `${name}.svg`), svg.toString());
  console.log(name.padEnd(16), `${(bytes.length / 1024).toFixed(0)} KB pdf`, `${meta.stars} stars`, `${(performance.now() - t0).toFixed(0)} ms`);
}
