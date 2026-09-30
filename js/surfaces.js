// Drawing back-ends. The chart renderer draws in millimetres on a Surface; the
// same drawing code produces the live canvas preview, the vector PDF, the SVG
// and the high-resolution PNG.
//
// Style object:  { fill, stroke, lw (mm), alpha, dash: [mm...], cap, join }
// Text options:  { size (pt), font, bold, italic, color, align, tracking (em), alpha, rotate (deg cw) }

const PT = 25.4 / 72; // mm per point

export const FONT_STACKS = {
  sans: { css: '"Helvetica Neue", Helvetica, Arial, sans-serif', pdf: 'helvetica' },
  serif: { css: '"Times New Roman", Times, Georgia, serif', pdf: 'times' },
  mono: { css: '"Courier New", Courier, monospace', pdf: 'courier' },
  custom: { css: '"StarMapCustom", sans-serif', pdf: 'StarMapCustom' },
};

/** Standard PDF fonts are Latin-1 only: fold anything else to something printable. */
const latin = (s) =>
  s.normalize('NFC')
    .replace(/[\u2018\u2019\u2032]/g, "'").replace(/[\u201c\u201d\u2033]/g, '"').replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, '?');

const hexToRgb = (h) => {
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const lerpColor = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = (i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  return '#' + c(0) + c(1) + c(2);
};

/** Sample a [[t,color],...] gradient at t. */
export function sampleStops(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) return lerpColor(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0] || 1));
  }
  return stops[stops.length - 1][1];
}

class Surface {
  /** Radial gradient centred on (cx,cy) out to r. Fallback: concentric discs. */
  radial(cx, cy, r, stops, steps = 64) {
    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      this.circle(cx, cy, r * t, { fill: sampleStops(stops, t - 0.5 / steps) });
    }
  }
  /** Top-to-bottom linear gradient over a box. Fallback: strips. */
  vertical(x, y, w, h, stops, steps = 80) {
    for (let i = 0; i < steps; i++) {
      this.rect(x, y + (h * i) / steps, w, h / steps + 0.05, { fill: sampleStops(stops, (i + 0.5) / steps) });
    }
  }
  rasterScale(boxMm) { return Math.min(4, 1400 / boxMm); }
  textWidth(str, o) {
    return this.measureRaw(str, o) + (o.tracking || 0) * o.size * PT * Math.max(0, [...str].length - 1);
  }
  /** Resolve align/rotation to a left-baseline anchor. */
  anchor(str, x, y, o) {
    const w = this.textWidth(str, o);
    const ax = o.align === 'center' ? 0.5 : o.align === 'right' ? 1 : 0;
    const r = ((o.rotate || 0) * Math.PI) / 180;
    return { w, x: x - w * ax * Math.cos(r), y: y - w * ax * Math.sin(r) };
  }
}

// ---------------------------------------------------------------- Canvas

export class CanvasSurface extends Surface {
  /** @param {HTMLCanvasElement|OffscreenCanvas} canvas @param {number} w mm @param {number} h mm @param {number} pxPerMm */
  constructor(canvas, w, h, pxPerMm) {
    super();
    this.w = w; this.h = h;
    canvas.width = Math.max(1, Math.round(w * pxPerMm));
    canvas.height = Math.max(1, Math.round(h * pxPerMm));
    this.ctx = canvas.getContext('2d');
    this.pxPerMm = canvas.width / w;
    this.ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    this.ctx.lineJoin = 'round';
  }
  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }
  _style(st) {
    const c = this.ctx;
    c.globalAlpha = st.alpha ?? 1;
    if (st.fill) c.fillStyle = st.fill;
    if (st.stroke) {
      c.strokeStyle = st.stroke;
      c.lineWidth = st.lw ?? 0.2;
      c.setLineDash(st.dash || []);
      c.lineCap = st.cap || 'butt';
      c.lineJoin = st.join || 'round';
    }
  }
  _paint(st, evenodd) {
    const c = this.ctx;
    if (st.fill) c.fill(evenodd ? 'evenodd' : 'nonzero');
    if (st.stroke) c.stroke();
  }
  _trace(rings, closed) {
    const c = this.ctx;
    c.beginPath();
    for (const pts of rings) {
      if (pts.length < 2) continue;
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      if (closed) c.closePath();
    }
  }
  clipPolygon(pts) { this._trace([pts], true); this.ctx.clip(); }
  rect(x, y, w, h, st, r = 0) {
    this._style(st);
    const c = this.ctx;
    c.beginPath();
    if (r > 0 && c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
    this._paint(st);
  }
  circle(x, y, r, st) {
    this._style(st);
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this._paint(st);
  }
  line(x1, y1, x2, y2, st) {
    this._style({ ...st, fill: null });
    const c = this.ctx;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  /** rings: array of point arrays. */
  poly(rings, st, { closed = false, evenodd = false } = {}) {
    this._style(st);
    this._trace(rings, closed || !!st.fill);
    this._paint(st, evenodd);
  }
  rasterScale(boxMm) { return Math.min(this.pxPerMm * 0.8, 1800 / boxMm); }
  image(img, x, y, w, h) {
    this.ctx.globalAlpha = 1;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(img, x, y, w, h);
  }
  radial(cx, cy, r, stops) {
    const g = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [t, col] of stops) g.addColorStop(t, col);
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = g;
    this.ctx.beginPath(); this.ctx.arc(cx, cy, r, 0, Math.PI * 2); this.ctx.fill();
  }
  vertical(x, y, w, h, stops) {
    const g = this.ctx.createLinearGradient(0, y, 0, y + h);
    for (const [t, col] of stops) g.addColorStop(t, col);
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = g;
    this.ctx.fillRect(x, y, w, h);
  }
  _font(o) {
    const fam = FONT_STACKS[o.font] || FONT_STACKS.sans;
    return `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.size * PT}px ${fam.css}`;
  }
  measureRaw(str, o) {
    this.ctx.font = this._font(o);
    return this.ctx.measureText(str).width;
  }
  text(str, x, y, o) {
    const c = this.ctx;
    const a = this.anchor(str, x, y, o);
    c.save();
    c.globalAlpha = o.alpha ?? 1;
    c.fillStyle = o.color;
    c.font = this._font(o);
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.translate(a.x, a.y);
    if (o.rotate) c.rotate((o.rotate * Math.PI) / 180);
    const tr = (o.tracking || 0) * o.size * PT;
    if (!tr) c.fillText(str, 0, 0);
    else {
      let px = 0;
      for (const ch of str) { c.fillText(ch, px, 0); px += c.measureText(ch).width + tr; }
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- PDF

export class PdfSurface extends Surface {
  /** @param {any} jsPDF the jsPDF constructor @param {number} w mm @param {number} h mm */
  constructor(jsPDF, w, h, { title = 'Star map', customFont = null } = {}) {
    super();
    this.w = w; this.h = h;
    this.doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
    this.doc.setProperties({ title, creator: 'Overhead' });
    this.stack = [];
    this.cache = {};
    this.gs = new Map();
    this.hasCustom = false;
    if (customFont) {
      try {
        this.doc.addFileToVFS('StarMapCustom.ttf', customFont);
        this.doc.addFont('StarMapCustom.ttf', 'StarMapCustom', 'normal');
        this.hasCustom = true;
      } catch (e) { console.warn('custom font rejected by PDF writer', e); }
    }
  }
  save() { this.doc.saveGraphicsState(); this.stack.push(this.cache); this.cache = { ...this.cache }; }
  restore() { this.doc.restoreGraphicsState(); this.cache = this.stack.pop() || {}; }
  _alpha(a) {
    a = Math.round(a * 50) / 50;
    if (this.cache.alpha === a) return;
    this.cache.alpha = a;
    if (!this.gs.has(a)) this.gs.set(a, new this.doc.GState({ opacity: a, 'stroke-opacity': a }));
    this.doc.setGState(this.gs.get(a));
  }
  _style(st) {
    const d = this.doc, c = this.cache;
    this._alpha(st.alpha ?? 1);
    if (st.fill && c.fill !== st.fill) { d.setFillColor(...hexToRgb(st.fill)); c.fill = st.fill; }
    if (st.stroke) {
      if (c.stroke !== st.stroke) { d.setDrawColor(...hexToRgb(st.stroke)); c.stroke = st.stroke; }
      const lw = st.lw ?? 0.2;
      if (c.lw !== lw) { d.setLineWidth(lw); c.lw = lw; }
      const dash = st.dash && st.dash.length ? st.dash.join(',') : '';
      if (c.dash !== dash) { d.setLineDashPattern(st.dash || [], 0); c.dash = dash; }
      const cap = st.cap || 'butt';
      if (c.cap !== cap) { d.setLineCap(cap); c.cap = cap; }
      const join = st.join || 'round';
      if (c.join !== join) { d.setLineJoin(join); c.join = join; }
    }
  }
  _op(st, evenodd) {
    const d = this.doc;
    if (st.fill && st.stroke) evenodd ? d.fillStrokeEvenOdd() : d.fillStroke();
    else if (st.fill) evenodd ? d.fillEvenOdd() : d.fill();
    else if (st.stroke) d.stroke();
    else d.discardPath();
  }
  _trace(rings, closed) {
    const d = this.doc;
    for (const pts of rings) {
      if (pts.length < 2) continue;
      d.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) d.lineTo(pts[i][0], pts[i][1]);
      if (closed) d.close();
    }
  }
  clipPolygon(pts) { this._trace([pts], true); this.doc.clip(); this.doc.discardPath(); }
  rect(x, y, w, h, st, r = 0) {
    this._style(st);
    const style = st.fill && st.stroke ? 'DF' : st.fill ? 'F' : 'S';
    if (r > 0) this.doc.roundedRect(x, y, w, h, r, r, style); else this.doc.rect(x, y, w, h, style);
  }
  circle(x, y, r, st) {
    this._style(st);
    this.doc.circle(x, y, r, st.fill && st.stroke ? 'DF' : st.fill ? 'F' : 'S');
  }
  line(x1, y1, x2, y2, st) {
    this._style({ ...st, fill: null });
    this.doc.line(x1, y1, x2, y2);
  }
  poly(rings, st, { closed = false, evenodd = false } = {}) {
    this._style(st);
    this._trace(rings, closed || !!st.fill);
    this._op(st, evenodd);
  }
  rasterScale(boxMm) { return Math.min(6, 1800 / boxMm); }
  image(img, x, y, w, h) {
    this._alpha(1);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    this.doc.addImage(c.toDataURL('image/png'), 'PNG', x, y, w, h, undefined, 'FAST');
  }
  _face(o) {
    const fam = FONT_STACKS[o.font] || FONT_STACKS.sans;
    if (o.font === 'custom' && this.hasCustom) return ['StarMapCustom', 'normal'];
    const name = o.font === 'custom' ? 'helvetica' : fam.pdf;
    return [name, o.bold && o.italic ? 'bolditalic' : o.bold ? 'bold' : o.italic ? 'italic' : 'normal'];
  }
  measureRaw(str, o) {
    const [f, s] = this._face(o);
    if (f !== 'StarMapCustom') str = latin(str);
    this.doc.setFont(f, s);
    this.doc.setFontSize(o.size);
    return this.doc.getTextWidth(str);
  }
  text(str, x, y, o) {
    const d = this.doc;
    const a = this.anchor(str, x, y, o);
    const [f, s] = this._face(o);
    if (f !== 'StarMapCustom') str = latin(str);
    d.setFont(f, s);
    d.setFontSize(o.size);
    d.setTextColor(...hexToRgb(o.color));
    this.cache.fill = null; // setTextColor shares the fill colour slot
    this._alpha(o.alpha ?? 1);
    const tr = (o.tracking || 0) * o.size * PT;
    const opts = { baseline: 'alphabetic' };
    if (tr) opts.charSpace = tr;
    if (o.rotate) opts.angle = -o.rotate;
    d.text(str, a.x, a.y, opts);
  }
  blob() { return this.doc.output('blob'); }
}

// ---------------------------------------------------------------- SVG

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f3 = (n) => +n.toFixed(3);

export class SvgSurface extends Surface {
  constructor(w, h, { title = 'Star map' } = {}) {
    super();
    this.w = w; this.h = h;
    this.out = [];
    this.defs = [];
    this.open = 0;
    this.id = 0;
    this.title = title;
    this.measurer = null;
  }
  save() { this.out.push('<g>'); this.open++; this.groupStack = (this.groupStack || []).concat(0); }
  restore() { this.out.push('</g>'.repeat(1 + this.groupStack.pop())); }
  clipPolygon(pts) {
    const id = 'c' + this.id++;
    this.defs.push(`<clipPath id="${id}"><path d="${this._d([pts], true)}"/></clipPath>`);
    // clip applies to the group opened by the last save(): wrap nested content
    this.out.push(`<g clip-path="url(#${id})">`);
    this.groupStack[this.groupStack.length - 1]++;
  }
  _attrs(st) {
    let a = st.fill ? ` fill="${st.fill}"` : ' fill="none"';
    if (st.stroke) {
      a += ` stroke="${st.stroke}" stroke-width="${f3(st.lw ?? 0.2)}" stroke-linejoin="${st.join || 'round'}"`;
      if (st.cap) a += ` stroke-linecap="${st.cap}"`;
      if (st.dash && st.dash.length) a += ` stroke-dasharray="${st.dash.map(f3).join(' ')}"`;
    }
    if (st.alpha != null && st.alpha < 1) a += ` opacity="${f3(st.alpha)}"`;
    return a;
  }
  _d(rings, closed) {
    return rings.filter((p) => p.length > 1).map((p) => 'M' + p.map(([x, y]) => `${f3(x)} ${f3(y)}`).join('L') + (closed ? 'Z' : '')).join('');
  }
  rect(x, y, w, h, st, r = 0) {
    this.out.push(`<rect x="${f3(x)}" y="${f3(y)}" width="${f3(w)}" height="${f3(h)}"${r ? ` rx="${f3(r)}"` : ''}${this._attrs(st)}/>`);
  }
  circle(x, y, r, st) { this.out.push(`<circle cx="${f3(x)}" cy="${f3(y)}" r="${f3(r)}"${this._attrs(st)}/>`); }
  line(x1, y1, x2, y2, st) {
    this.out.push(`<line x1="${f3(x1)}" y1="${f3(y1)}" x2="${f3(x2)}" y2="${f3(y2)}"${this._attrs({ ...st, fill: null })}/>`);
  }
  poly(rings, st, { closed = false, evenodd = false } = {}) {
    const cl = closed || !!st.fill;
    this.out.push(`<path d="${this._d(rings, cl)}"${evenodd ? ' fill-rule="evenodd"' : ''}${this._attrs(st)}/>`);
  }
  radial(cx, cy, r, stops) {
    const id = 'g' + this.id++;
    this.defs.push(`<radialGradient id="${id}" cx="${f3(cx)}" cy="${f3(cy)}" r="${f3(r)}" gradientUnits="userSpaceOnUse">${stops.map(([t, c]) => `<stop offset="${t}" stop-color="${c}"/>`).join('')}</radialGradient>`);
    this.out.push(`<circle cx="${f3(cx)}" cy="${f3(cy)}" r="${f3(r)}" fill="url(#${id})"/>`);
  }
  vertical(x, y, w, h, stops) {
    const id = 'g' + this.id++;
    this.defs.push(`<linearGradient id="${id}" x1="0" y1="${f3(y)}" x2="0" y2="${f3(y + h)}" gradientUnits="userSpaceOnUse">${stops.map(([t, c]) => `<stop offset="${t}" stop-color="${c}"/>`).join('')}</linearGradient>`);
    this.out.push(`<rect x="${f3(x)}" y="${f3(y)}" width="${f3(w)}" height="${f3(h)}" fill="url(#${id})"/>`);
  }
  image(img, x, y, w, h) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    this.out.push(`<image x="${f3(x)}" y="${f3(y)}" width="${f3(w)}" height="${f3(h)}" preserveAspectRatio="none" href="${c.toDataURL('image/png')}"/>`);
  }
  measureRaw(str, o) {
    if (!this.measurer) {
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 4) : typeof document !== 'undefined' ? document.createElement('canvas') : null;
      this.measurer = c ? c.getContext('2d') : { measureText: (t) => ({ width: t.length * 5.2 }), font: '' }; // rough fallback without a canvas (Node)
    }
    const fam = FONT_STACKS[o.font] || FONT_STACKS.sans;
    this.measurer.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.size * PT * 10}px ${fam.css}`;
    return this.measurer.measureText(str).width / 10;
  }
  text(str, x, y, o) {
    const fam = FONT_STACKS[o.font] || FONT_STACKS.sans;
    const a = this.anchor(str, x, y, o);
    const tr = (o.tracking || 0) * o.size * PT;
    const rot = o.rotate ? ` transform="rotate(${f3(o.rotate)} ${f3(a.x)} ${f3(a.y)})"` : '';
    this.out.push(
      `<text x="${f3(a.x)}" y="${f3(a.y)}" font-family='${fam.css.replace(/'/g, '')}' font-size="${f3(o.size * PT)}"` +
        `${o.bold ? ' font-weight="bold"' : ''}${o.italic ? ' font-style="italic"' : ''} fill="${o.color}"` +
        `${tr ? ` letter-spacing="${f3(tr)}"` : ''}${o.alpha != null && o.alpha < 1 ? ` opacity="${f3(o.alpha)}"` : ''}${rot}>${esc(str)}</text>`,
    );
  }
  toString() {
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}mm" height="${this.h}mm" viewBox="0 0 ${this.w} ${this.h}">` +
      `<title>${esc(this.title)}</title><defs>${this.defs.join('')}</defs>${this.out.join('')}</svg>`
    );
  }
}
