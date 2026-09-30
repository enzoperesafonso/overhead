// Default settings, colour themes, page sizes and example moments.

export const PAGE_SIZES = {
  'A5': [148, 210],
  'A4': [210, 297],
  'A3': [297, 420],
  'A2': [420, 594],
  'A1': [594, 841],
  'US Letter': [215.9, 279.4],
  'Tabloid 11×17"': [279.4, 431.8],
  '8×10"': [203.2, 254],
  '11×14"': [279.4, 355.6],
  '12×16"': [304.8, 406.4],
  '16×20"': [406.4, 508],
  '18×24"': [457.2, 609.6],
  '24×36"': [609.6, 914.4],
  '30×40 cm': [300, 400],
  '40×50 cm': [400, 500],
  '50×70 cm': [500, 700],
  'Square 20 cm': [200, 200],
  'Square 30 cm': [300, 300],
  'Custom': null,
};

export const THEMES = {
  'Midnight': {
    pageBg: '#ffffff', bgMode: 'solid', bg1: '#191a1c', bg2: '#191a1c', dust: true, starMode: 'single', starColor: '#ffffff',
    starSat: 0.7, glow: false, lineColor: '#e6e6e6', lineAlpha: 0.7, lineWidth: 0.16, labelColor: '#d8d8d8', gridColor: '#ffffff',
    ringColor: '#191a1c', textColor: '#1a1a1a', mwColor: '#ffffff', mwOpacity: 0.5, moonColor: '#f4f1e6',
  },
  'Deep Space': {
    pageBg: '#070b16', bgMode: 'radial', bg1: '#1a2a55', bg2: '#04060d', dust: true, starMode: 'realistic', starColor: '#ffffff',
    starSat: 0.85, glow: true, lineColor: '#8fb2ff', lineAlpha: 0.55, lineWidth: 0.16, labelColor: '#b9ccff', gridColor: '#7aa2ff',
    ringColor: '#8fb2ff', textColor: '#dfe8ff', mwColor: '#a8c0ff', mwOpacity: 1, moonColor: '#f4f1e6',
  },
  'Ink on Paper': {
    pageBg: '#fbf8f1', bgMode: 'solid', bg1: '#fbf8f1', bg2: '#fbf8f1', dust: false, starMode: 'single', starColor: '#161616',
    starSat: 0, glow: false, lineColor: '#161616', lineAlpha: 0.55, lineWidth: 0.14, labelColor: '#3a3a3a', gridColor: '#161616',
    ringColor: '#161616', textColor: '#161616', mwColor: '#000000', mwOpacity: 0.7, moonColor: '#161616',
  },
  'Blueprint': {
    pageBg: '#0c3a63', bgMode: 'solid', bg1: '#0f4c81', bg2: '#0f4c81', dust: false, starMode: 'single', starColor: '#ffffff',
    starSat: 0, glow: false, lineColor: '#ffffff', lineAlpha: 0.75, lineWidth: 0.16, labelColor: '#dcecff', gridColor: '#ffffff',
    ringColor: '#ffffff', textColor: '#ffffff', mwColor: '#ffffff', mwOpacity: 0.5, moonColor: '#ffffff',
  },
  'Vintage': {
    pageBg: '#efe3c8', bgMode: 'radial', bg1: '#f3e8cb', bg2: '#d8c294', dust: false, starMode: 'single', starColor: '#3a2a1a',
    starSat: 0, glow: false, lineColor: '#7a5b3a', lineAlpha: 0.75, lineWidth: 0.16, labelColor: '#5a4128', gridColor: '#7a5b3a',
    ringColor: '#5a4128', textColor: '#3a2a1a', mwColor: '#6b4f2e', mwOpacity: 0.8, moonColor: '#3a2a1a',
  },
  'Rose Gold': {
    pageBg: '#1b1416', bgMode: 'solid', bg1: '#241a1d', bg2: '#241a1d', dust: true, starMode: 'single', starColor: '#f6d3c4',
    starSat: 0.5, glow: true, lineColor: '#d99b86', lineAlpha: 0.75, lineWidth: 0.16, labelColor: '#e8b9a8', gridColor: '#d99b86',
    ringColor: '#d99b86', textColor: '#f0c6b6', mwColor: '#f6d3c4', mwOpacity: 0.7, moonColor: '#f6d3c4',
  },
  'Noir Gold': {
    pageBg: '#0a0a0a', bgMode: 'radial', bg1: '#1c1a14', bg2: '#050505', dust: true, starMode: 'single', starColor: '#f7e7b4',
    starSat: 0.6, glow: true, lineColor: '#c9a24b', lineAlpha: 0.8, lineWidth: 0.16, labelColor: '#d8b866', gridColor: '#c9a24b',
    ringColor: '#c9a24b', textColor: '#d8b866', mwColor: '#f7e7b4', mwOpacity: 0.7, moonColor: '#f7e7b4',
  },
  'Aurora': {
    pageBg: '#04121a', bgMode: 'vertical', bg1: '#06121f', bg2: '#0f4b48', dust: true, starMode: 'realistic', starColor: '#eafff7',
    starSat: 0.7, glow: true, lineColor: '#5be3c1', lineAlpha: 0.65, lineWidth: 0.16, labelColor: '#a5f0da', gridColor: '#5be3c1',
    ringColor: '#5be3c1', textColor: '#d5fff2', mwColor: '#b9ffe9', mwOpacity: 1, moonColor: '#f4f1e6',
  },
  'Sunset': {
    pageBg: '#1a0f2e', bgMode: 'vertical', bg1: '#1b1040', bg2: '#d2566e', dust: true, starMode: 'single', starColor: '#fff2dc',
    starSat: 0.4, glow: true, lineColor: '#ffd9b3', lineAlpha: 0.7, lineWidth: 0.16, labelColor: '#ffe6cc', gridColor: '#ffd9b3',
    ringColor: '#ffd9b3', textColor: '#ffe6cc', mwColor: '#ffe6cc', mwOpacity: 0.7, moonColor: '#fff2dc',
  },
  'Neon': {
    pageBg: '#08000f', bgMode: 'radial', bg1: '#1d0736', bg2: '#08000f', dust: false, starMode: 'single', starColor: '#ffffff',
    starSat: 0, glow: true, lineColor: '#ff2bd6', lineAlpha: 0.9, lineWidth: 0.18, labelColor: '#7df9ff', gridColor: '#00f0ff',
    ringColor: '#00f0ff', textColor: '#7df9ff', mwColor: '#7d5bff', mwOpacity: 0.9, moonColor: '#ffffff',
  },
  'Cyanotype': {
    pageBg: '#f1f5f7', bgMode: 'solid', bg1: '#0b3a5b', bg2: '#0b3a5b', dust: false, starMode: 'single', starColor: '#eaf5ff',
    starSat: 0, glow: false, lineColor: '#a8d4ff', lineAlpha: 0.8, lineWidth: 0.16, labelColor: '#cfe7ff', gridColor: '#a8d4ff',
    ringColor: '#0b3a5b', textColor: '#0b3a5b', mwColor: '#ffffff', mwOpacity: 0.6, moonColor: '#eaf5ff',
  },
};

/** Theme -> plain settings (the theme's `glow` flag becomes the star style). */
export function themeFields(name) {
  const { glow, ...t } = THEMES[name];
  return { ...t, starStyle: glow ? 'glow' : 'dot' };
}

export const DEFAULTS = {
  // Moment
  title: 'THE NIGHT WE MET',
  subtitle: '',
  date: '2021-08-05',
  time: '22:00',
  tz: 'Africa/Johannesburg',
  placeName: 'TABLE MOUNTAIN, CAPE TOWN',
  lat: -33.9628,
  lon: 18.4098,
  showDate: true,
  showTime: false,
  dateFormat: 'long',
  showPlace: true,
  showCoords: true,
  coordFormat: 'dec',
  footer: '',

  // Style
  theme: 'Midnight',
  ...themeFields('Midnight'),
  dustAmount: 1,
  lineStyle: 'solid',
  lineDots: false,
  fadeFaint: true,
  planetColors: true,

  // Sky
  limMag: 6,
  starSize: 1.2,
  sizeContrast: 1,
  showConst: true,
  constNames: 'off',
  constBorders: false,
  milkyWay: false,
  planets: false,
  planetLabels: true,
  sun: false,
  moon: false,
  dsos: false,
  dsoMag: 8,
  dsoLabels: true,
  starNames: 0,
  lore: false,
  loreTradition: 'all',
  grid: 'off',
  gridStep: 30,
  gridAlpha: 0.25,
  ecliptic: false,
  celestialEquator: false,
  projection: 'stereo',
  fov: 90,
  belowHorizon: false,
  rotation: 0,
  mirror: false,
  extinction: false,

  // Layout
  pageSize: 'A4',
  orientation: 'portrait',
  customW: 210,
  customH: 297,
  bleed: 0,
  shape: 'circle',
  chartSize: 78,
  chartTop: 13,
  ring: 'none',
  ringGap: 2,
  ringWidth: 0.3,
  pageBorder: 'none',
  borderInset: 8,
  titleFont: 'sans',
  bodyFont: 'sans',
  titleSize: 15,
  bodySize: 7.5,
  titleTracking: 0.16,
  bodyTracking: 0.14,
  titleBold: false,
  uppercase: true,
  textAlign: 'center',
  textPos: 'below',
  textGap: 9,
  lineGap: 1.9,
  seed: 7,
};

export const EXAMPLES = [
  { name: 'The night we met', set: { title: 'THE NIGHT WE MET', date: '2021-08-05', time: '22:00', tz: 'Africa/Johannesburg', placeName: 'SIGNAL HILL, CAPE TOWN', lat: -33.9166, lon: 18.3985, theme: 'Midnight', lore: true, loreTradition: 'san', starNames: 0 } },
  { name: 'Wedding day', set: { title: 'THE DAY WE SAID YES', subtitle: 'Anna & Marco', date: '2019-06-15', time: '18:30', tz: 'Africa/Johannesburg', placeName: 'CAMPS BAY, CAPE TOWN', lat: -33.95, lon: 18.3772, theme: 'Noir Gold', ring: 'degrees', constNames: 'latin', milkyWay: true, moon: true, planets: true } },
  { name: 'Welcome, little one', set: { title: 'THE NIGHT YOU ARRIVED', subtitle: 'Emma Rose', date: '2023-03-09', time: '04:12', tz: 'Africa/Johannesburg', placeName: 'GROOT SCHUUR, CAPE TOWN', lat: -33.9419, lon: 18.4741, theme: 'Deep Space', milkyWay: true, moon: true, planets: true, ring: 'compass' } },
  { name: 'Moon landing', set: { title: 'ONE SMALL STEP', subtitle: 'Apollo 11 · 20 July 1969', date: '1969-07-20', time: '22:17', tz: 'Africa/Johannesburg', placeName: 'CAPE POINT, CAPE TOWN', lat: -34.3568, lon: 18.4974, theme: 'Blueprint', moon: true, planets: true, constNames: 'latin', grid: 'altaz', ring: 'degrees' } },
  { name: 'Millennium eve', set: { title: 'NEW YEAR 2000', date: '1999-12-31', time: '23:59', tz: 'Africa/Johannesburg', placeName: 'V&A WATERFRONT, CAPE TOWN', lat: -33.9036, lon: 18.4207, theme: 'Neon', milkyWay: true, moon: true, planets: true } },

  // ---- showing off the customisations
  { name: 'Left-aligned, serif, rounded', set: { title: 'Home', subtitle: 'Where it all began', date: '2016-09-24', time: '19:15', tz: 'Africa/Johannesburg', placeName: 'KALK BAY, CAPE TOWN', lat: -34.1287, lon: 18.4496, theme: 'Ink on Paper', shape: 'rounded', chartSize: 82, chartTop: 9, textAlign: 'left', titleFont: 'serif', bodyFont: 'serif', titleSize: 26, bodySize: 9, titleTracking: 0.02, bodyTracking: 0.06, uppercase: false, dateFormat: 'eu', coordFormat: 'dms', footer: 'Every light in the sky\nwas already on its way.', textGap: 12 } },
  { name: 'Heart, rose gold', set: { title: 'FOREVER STARTS HERE', subtitle: 'Thandi & Liam', date: '2022-02-14', time: '20:00', tz: 'Africa/Johannesburg', placeName: 'LIONS HEAD, CAPE TOWN', lat: -33.9352, lon: 18.3892, theme: 'Rose Gold', shape: 'heart', chartSize: 84, chartTop: 10, belowHorizon: true, fov: 125, starStyle: 'glow', limMag: 7, ring: 'line', ringGap: 3, dateFormat: 'us' } },
  { name: 'Arch, sunset gradient', set: { title: 'Welcome, Noah', subtitle: 'Born at 06:42', date: '2024-05-03', time: '06:42', tz: 'Africa/Johannesburg', placeName: 'GROOTE SCHUUR HOSPITAL, CAPE TOWN', lat: -33.9419, lon: 18.4741, theme: 'Sunset', shape: 'arch', chartSize: 72, chartTop: 8, titleFont: 'serif', bodyFont: 'sans', titleSize: 22, titleTracking: 0.05, uppercase: false, titleBold: true, ring: 'double', showCoords: false, limMag: 5.5 } },
  { name: 'Blueprint landscape', set: { title: 'SKY OVER THE CAPE', subtitle: 'Planets, grid and Messier objects', date: '2024-09-22', time: '21:30', tz: 'Africa/Johannesburg', placeName: 'SUTHERLAND ROAD, WESTERN CAPE', lat: -32.3806, lon: 20.6597, theme: 'Blueprint', orientation: 'landscape', pageSize: 'A3', chartSize: 92, chartTop: 5, grid: 'both', gridStep: 30, ecliptic: true, celestialEquator: true, planets: true, moon: true, dsos: true, constNames: 'abbr', starNames: 25, ring: 'degrees', textAlign: 'left', textPos: 'below', titleFont: 'mono', bodyFont: 'mono', bodyTracking: 0.05, titleTracking: 0.08 } },
  { name: 'Full-page aurora', set: { title: 'WE WATCHED THE MILKY WAY', date: '2023-07-15', time: '22:45', tz: 'Africa/Johannesburg', placeName: 'CEDERBERG, WESTERN CAPE', lat: -32.3667, lon: 19.0667, theme: 'Aurora', shape: 'page', chartSize: 100, milkyWay: true, mwOpacity: 1.6, showConst: false, limMag: 7, starStyle: 'glow', textPos: 'overlay', dateFormat: 'iso', bodySize: 8 } },
  { name: 'Hexagon, vintage map', set: { title: 'Our First Flat', date: '2015-03-07', time: '21:00', tz: 'Africa/Johannesburg', placeName: 'WOODSTOCK, CAPE TOWN', lat: -33.9284, lon: 18.4573, theme: 'Vintage', shape: 'hexagon', chartSize: 76, chartTop: 12, ring: 'double', ringGap: 3, constNames: 'latin', constBorders: true, titleFont: 'serif', titleBold: true, titleSize: 20, titleTracking: 0.08, bodyFont: 'serif', pageBorder: 'double', borderInset: 10 } },
  { name: 'Khoikhoi & San sky lore', set: { title: 'THE SKY BEFORE US', subtitle: 'Names from the first peoples of the Cape', date: '2024-06-21', time: '19:30', tz: 'Africa/Johannesburg', placeName: 'CAPE POINT, CAPE TOWN', lat: -34.3568, lon: 18.4974, theme: 'Deep Space', lore: true, loreTradition: 'all', milkyWay: true, mwOpacity: 1.4, showConst: false, limMag: 5.8, starStyle: 'glow', ring: 'compass' } },
  { name: 'Square, big bold type', set: { title: 'GOLDEN HOUR', subtitle: 'Sunset on the Atlantic', date: '2021-12-18', time: '20:45', tz: 'Africa/Johannesburg', placeName: 'SEA POINT PROMENADE, CAPE TOWN', lat: -33.9174, lon: 18.3846, theme: 'Noir Gold', shape: 'square', belowHorizon: true, fov: 112, starStyle: 'glow', chartSize: 86, chartTop: 7, ring: 'line', ringGap: 2.5, titleSize: 34, titleBold: true, titleTracking: 0.02, textAlign: 'left', bodySize: 8.5, showTime: true, pageSize: 'A3' } },
];
