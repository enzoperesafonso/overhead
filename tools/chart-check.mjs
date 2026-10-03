// Planisphere consistency: a star's position on the rotated wheel must equal its position through the
// cover's horizon mapper, for both hemispheres and every projection.   node tools/chart-check.mjs
const root = new URL('..', import.meta.url).pathname;
const A = await import(root + '/js/astro.js');
const { poleMatrix } = await import(root + '/js/scene.js');
const { chartGeometry, horizonMapper } = await import(root + '/js/chart.js');
const { DEFAULTS } = await import(root + '/js/config.js');
for (const [lat, chartProjection] of [[-33.96,'equidistant'],[51.5,'stereo'],[-60,'equalarea'],[20,'equidistant']]) {
  const cfg = { ...DEFAULTS, lat, lon: 18, chartProjection };
  const g = chartGeometry(cfg); const F = g.F;
  const M = poleMatrix(g.south), map = horizonMapper(g);
  const LST = 123.4; // degrees, arbitrary
  const Mh = A.ofDateToHorizon(LST, lat);
  const rho = -g.s * LST * Math.PI / 180;
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const ra = (i * 53.7) % 360, dec = ((i * 37.3) % 180) - 90;
    const v = A.eqToVec(ra, dec);
    const [E, N, U] = A.apply(M, v);
    const psi = Math.acos(U); if (psi * 180 / Math.PI > g.psiMax - 1) continue;
    const h = Math.hypot(E, N), r = g.k * F(psi);
    const sx = -E / h * r, sy = -N / h * r;
    const wx = g.cx + sx * Math.cos(rho) - sy * Math.sin(rho), wy = g.cy + sx * Math.sin(rho) + sy * Math.cos(rho);
    const [mx, my] = map(A.apply(Mh, v));
    worst = Math.max(worst, Math.hypot(wx - mx, wy - my));
  }
  console.log('lat', lat, chartProjection.padEnd(11), 'max mismatch (mm):', worst.toExponential(2));
  if (worst > 1e-6) { console.error('MISMATCH'); process.exitCode = 1; }
}
