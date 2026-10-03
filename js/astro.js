// Positional astronomy: time, precession, horizon frame, planets, Sun, Moon.
// Low-precision but plenty for a print (planets ~1 arcmin, Moon ~0.3 deg).

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
const sin = (d) => Math.sin(d * D2R);
const cos = (d) => Math.cos(d * D2R);
const mod360 = (x) => ((x % 360) + 360) % 360;

export const julianDate = (date) => date.getTime() / 86400000 + 2440587.5;

export function gmst(jd) {
  const d = jd - 2451545.0;
  const T = d / 36525;
  return mod360(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38710000);
}

// ---- time zones (no tz database needed: uses Intl) ----

function tzOffsetMinutes(utcMs, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, +x.value]));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - Math.floor(utcMs / 1000) * 1000) / 60000;
}

/** Wall-clock time in an IANA zone (or fixed "UTC+5.5" style) -> UTC Date. */
export function wallToUtc(y, mo, d, h, mi, tz) {
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const fixed = /^UTC([+-]\d+(?:\.\d+)?)$/.exec(tz);
  if (fixed) return new Date(naive - parseFloat(fixed[1]) * 3600000);
  try {
    let t = naive - tzOffsetMinutes(naive, tz) * 60000;
    t = naive - tzOffsetMinutes(t, tz) * 60000;
    return new Date(t);
  } catch {
    return new Date(naive);
  }
}

/** Standard-time (no daylight saving) UTC offset of a zone, whether it observes DST, and a display name. */
export function standardOffsetHours(tz, lon) {
  const label = (h) => `UTC${h >= 0 ? '+' : '\u2212'}${Math.abs(h)}`;
  if (!tz || tz === 'auto') { const h = Math.round(lon / 15); return { hours: h, dst: false, name: label(h) }; }
  const fixed = /^UTC([+-]\d+(?:\.\d+)?)$/.exec(tz);
  if (fixed) { const h = parseFloat(fixed[1]); return { hours: h, dst: false, name: tz }; }
  try {
    const jan = tzOffsetMinutes(Date.UTC(2025, 0, 1), tz) / 60, jul = tzOffsetMinutes(Date.UTC(2025, 6, 1), tz) / 60;
    const h = Math.min(jan, jul);
    return { hours: h, dst: jan !== jul, name: `${tz.replace(/_/g, ' ')}, ${label(h)}` };
  } catch { const h = Math.round(lon / 15); return { hours: h, dst: false, name: label(h) }; }
}

/** Rough standard-time offset from longitude (used when no zone is chosen). */
export const guessOffsetHours = (lon) => Math.round(lon / 15);

// ---- vectors ----

export const eqToVec = (ra, dec) => {
  const c = cos(dec);
  return [c * cos(ra), c * sin(ra), sin(dec)];
};

export function matMul(a, b) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
}
const Rz = (a) => [cos(a), -sin(a), 0, sin(a), cos(a), 0, 0, 0, 1];
const Ry = (a) => [cos(a), 0, sin(a), 0, 1, 0, -sin(a), 0, cos(a)];

/** IAU-1976 precession matrix J2000 -> mean equator of date. */
export function precessionMatrix(jd) {
  const T = (jd - 2451545.0) / 36525;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) / 3600;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) / 3600;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) / 3600;
  return matMul(Rz(z), matMul(Ry(-theta), Rz(zeta)));
}

/**
 * Matrix taking a J2000 equatorial vector to the local horizon frame
 * (x = East, y = North, z = Up) for an observer at lat/lon at time jd.
 */
export function horizonMatrix(jd, latDeg, lonDeg) {
  const lst = mod360(gmst(jd) + lonDeg);
  const P = precessionMatrix(jd);
  const A = ofDateToHorizon(lst, latDeg);
  return matMul(A, P);
}

/** Of-date equatorial -> horizon (E,N,U). */
export function ofDateToHorizon(lstDeg, latDeg) {
  // hour-angle frame: x' = cosd cosH, y' = -cosd sinH (east), z' = sind
  const hf = [cos(lstDeg), sin(lstDeg), 0, -sin(lstDeg), cos(lstDeg), 0, 0, 0, 1];
  const sp = sin(latDeg), cp = cos(latDeg);
  // E = y', N = -x' sin(phi) + z' cos(phi), U = x' cos(phi) + z' sin(phi)
  const h = [0, 1, 0, -sp, 0, cp, cp, 0, sp];
  return matMul(h, hf);
}

export const apply = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

// ---- Sun, Moon, planets (Paul Schlyter's low-precision method) ----

const ELEMENTS = {
  Mercury: (d) => ({ N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d }),
  Venus: (d) => ({ N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d }),
  Mars: (d) => ({ N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d }),
  Jupiter: (d) => ({ N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.895 + 0.0830853001 * d }),
  Saturn: (d) => ({ N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.967 + 0.0334442282 * d }),
  Uranus: (d) => ({ N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d, w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d, e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d }),
  Neptune: (d) => ({ N: 131.7806 + 3.0173e-5 * d, i: 1.77 - 2.55e-7 * d, w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d, e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d }),
};
export const PLANET_NAMES = Object.keys(ELEMENTS);

function solveKepler(M, e) {
  let E = M + (e * R2D) * sin(M) * (1 + e * cos(M));
  for (let k = 0; k < 8; k++) {
    const dE = (E - (e * R2D) * sin(E) - M) / (1 - e * cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  return E;
}

/** Orbit position: returns {xv,yv,v,r} in the orbital plane. */
function orbit(el) {
  const M = mod360(el.M);
  const E = solveKepler(M, el.e);
  const xv = el.a * (cos(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * sin(E);
  return { v: mod360(Math.atan2(yv, xv) * R2D), r: Math.hypot(xv, yv) };
}

function sunPosition(d) {
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const M = mod360(356.047 + 0.9856002585 * d);
  const { v, r } = orbit({ M, e, a: 1 });
  const lon = mod360(v + w);
  return { lon, r, M, Ls: mod360(w + M) };
}

const eclToEq = (x, y, z, d) => {
  const ecl = 23.4393 - 3.563e-7 * d;
  const ye = y * cos(ecl) - z * sin(ecl);
  const ze = y * sin(ecl) + z * cos(ecl);
  return [x, ye, ze];
};

function vecToRaDec(v) {
  return { ra: mod360(Math.atan2(v[1], v[0]) * R2D), dec: Math.atan2(v[2], Math.hypot(v[0], v[1])) * R2D };
}

/**
 * All solar-system bodies as J2000-of-date equatorial positions.
 * Returns [{name, ra, dec, mag, kind, phase?, ...}] — coordinates are of-date.
 */
export function solarSystem(jd) {
  const d = jd - 2451543.5;
  const sun = sunPosition(d);
  const sunV = eclToEq(sun.r * cos(sun.lon), sun.r * sin(sun.lon), 0, d);
  const out = [];
  const sunEq = vecToRaDec(sunV);
  out.push({ name: 'Sun', kind: 'sun', mag: -26.7, ...sunEq });

  // Earth heliocentric ecliptic = -Sun geocentric
  const ex = -sun.r * cos(sun.lon), ey = -sun.r * sin(sun.lon);
  const Mj = mod360(19.895 + 0.0830853001 * d);
  const Ms = mod360(316.967 + 0.0334442282 * d);
  const Mu = mod360(142.5905 + 0.011725806 * d);

  for (const name of PLANET_NAMES) {
    const el = ELEMENTS[name](d);
    const { v, r } = orbit(el);
    const N = el.N, i = el.i, w = el.w;
    const vw = v + w;
    let xh = r * (cos(N) * cos(vw) - sin(N) * sin(vw) * cos(i));
    let yh = r * (sin(N) * cos(vw) + cos(N) * sin(vw) * cos(i));
    let zh = r * (sin(vw) * sin(i));
    if (name === 'Jupiter' || name === 'Saturn' || name === 'Uranus') {
      let lon = mod360(Math.atan2(yh, xh) * R2D);
      let lat = Math.asin(zh / r) * R2D;
      if (name === 'Jupiter')
        lon += -0.332 * sin(2 * Mj - 5 * Ms - 67.6) - 0.056 * sin(2 * Mj - 2 * Ms + 21) + 0.042 * sin(3 * Mj - 5 * Ms + 21) - 0.036 * sin(Mj - 2 * Ms) + 0.022 * cos(Mj - Ms) + 0.023 * sin(2 * Mj - 3 * Ms + 52) - 0.016 * sin(Mj - 5 * Ms - 69);
      if (name === 'Saturn') {
        lon += 0.812 * sin(2 * Mj - 5 * Ms - 67.6) - 0.229 * cos(2 * Mj - 4 * Ms - 2) + 0.119 * sin(Mj - 2 * Ms - 3) + 0.046 * sin(2 * Mj - 6 * Ms - 69) + 0.014 * sin(Mj - 3 * Ms + 32);
        lat += -0.02 * cos(2 * Mj - 4 * Ms - 2) + 0.018 * sin(2 * Mj - 6 * Ms - 49);
      }
      if (name === 'Uranus') lon += 0.04 * sin(Ms - 2 * Mu + 6) + 0.035 * sin(Ms - 3 * Mu + 33) - 0.015 * sin(Mj - Mu + 20);
      xh = r * cos(lat) * cos(lon);
      yh = r * cos(lat) * sin(lon);
      zh = r * sin(lat);
    }
    const gx = xh - ex, gy = yh - ey, gz = zh;
    const R = Math.hypot(gx, gy, gz);
    const eq = eclToEq(gx, gy, gz, d);
    const rd = vecToRaDec(eq);
    const FV = Math.acos(Math.max(-1, Math.min(1, (r * r + R * R - sun.r * sun.r) / (2 * r * R)))) * R2D;
    const k = 5 * Math.log10(r * R);
    const mag = {
      Mercury: -0.36 + k + 0.027 * FV + 2.2e-13 * FV ** 6,
      Venus: -4.34 + k + 0.013 * FV + 4.2e-7 * FV ** 3,
      Mars: -1.51 + k + 0.016 * FV,
      Jupiter: -9.25 + k + 0.014 * FV,
      Saturn: -8.9 + k + 0.044 * FV,
      Uranus: -7.15 + k + 0.001 * FV,
      Neptune: -6.9 + k + 0.001 * FV,
    }[name];
    out.push({ name, kind: 'planet', mag, ...rd });
  }

  // Moon
  const N = mod360(125.1228 - 0.0529538083 * d);
  const iM = 5.1454;
  const wM = mod360(318.0634 + 0.1643573223 * d);
  const MM = mod360(115.3654 + 13.0649929509 * d);
  const eM = 0.0549;
  const { r: rm, v: vm } = orbit({ M: MM, e: eM, a: 60.2666 });
  const vw = vm + wM;
  let xm = rm * (cos(N) * cos(vw) - sin(N) * sin(vw) * cos(iM));
  let ym = rm * (sin(N) * cos(vw) + cos(N) * sin(vw) * cos(iM));
  let zm = rm * (sin(vw) * sin(iM));
  let lonM = mod360(Math.atan2(ym, xm) * R2D);
  let latM = Math.asin(zm / rm) * R2D;
  const Lm = mod360(N + wM + MM);
  const D = mod360(Lm - sun.Ls);
  const F = mod360(Lm - N);
  lonM += -1.274 * sin(MM - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(sun.M) - 0.059 * sin(2 * MM - 2 * D) - 0.057 * sin(MM - 2 * D + sun.M) + 0.053 * sin(MM + 2 * D) + 0.046 * sin(2 * D - sun.M) + 0.041 * sin(MM - sun.M) - 0.035 * sin(D) - 0.031 * sin(MM + sun.M) - 0.015 * sin(2 * F - 2 * D) + 0.011 * sin(MM - 4 * D);
  latM += -0.173 * sin(F - 2 * D) - 0.055 * sin(MM - F - 2 * D) - 0.046 * sin(MM + F - 2 * D) + 0.033 * sin(F + 2 * D) + 0.017 * sin(2 * MM + F);
  const eqM = eclToEq(cos(latM) * cos(lonM), cos(latM) * sin(lonM), sin(latM), d);
  const moon = vecToRaDec(eqM);
  const elong = Math.acos(cos(latM) * cos(lonM - sun.lon)) * R2D;
  out.push({
    name: 'Moon', kind: 'moon', mag: -12.6, ...moon,
    // illuminated fraction and sign (waxing when Moon east of Sun)
    illum: (1 - cos(elong)) / 2,
    waxing: mod360(lonM - sun.lon) < 180,
    sunRa: sunEq.ra, sunDec: sunEq.dec,
  });
  return out;
}

/** Sun's equatorial position (of date) for a Julian date. */
export function sunEquatorial(jd) {
  const d = jd - 2451543.5;
  const sun = sunPosition(d);
  return vecToRaDec(eclToEq(sun.r * cos(sun.lon), sun.r * sin(sun.lon), 0, d));
}

/** Julian day -> nice Moon phase name. */
export function moonPhaseName(illum, waxing) {
  if (illum < 0.03) return 'New Moon';
  if (illum > 0.97) return 'Full Moon';
  if (Math.abs(illum - 0.5) < 0.06) return waxing ? 'First Quarter' : 'Last Quarter';
  if (illum < 0.5) return waxing ? 'Waxing Crescent' : 'Waning Crescent';
  return waxing ? 'Waxing Gibbous' : 'Waning Gibbous';
}

// ---- star colour ----

/** B-V colour index -> sRGB hex via Planckian approximation (Ballesteros). */
export function bvToColor(bv) {
  bv = Math.max(-0.4, Math.min(2.0, bv));
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  // Tanner Helland's blackbody approximation
  const t = T / 100;
  let r, g, b;
  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (x) => Math.max(0, Math.min(255, Math.round(x)));
  return [c(r), c(g), c(b)];
}

// ---- formatting ----

export function formatCoord(lat, lon, style = 'dms') {
  const f = (v, pos, neg) => {
    const h = v >= 0 ? pos : neg;
    const a = Math.abs(v);
    if (style === 'dec') return `${a.toFixed(4)}°${h}`;
    if (style === 'ddm') {
      const d = Math.floor(a);
      return `${d}° ${((a - d) * 60).toFixed(3)}'${h}`;
    }
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = Math.round(((a - d) * 60 - m) * 60);
    return s === 60 ? `${d}° ${m + 1}' 0"${h}` : `${d}° ${m}' ${s}"${h}`;
  };
  return { lat: f(lat, 'N', 'S'), lon: f(lon, 'E', 'W') };
}
