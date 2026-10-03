// The Overhead logo, used on stargazing charts unless it is replaced or removed.
// Pure black on transparent so it prints cleanly on any printer.

export const DEFAULT_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1290" height="360" viewBox="0 0 430 120">
  <g fill="none" stroke="#000" stroke-linecap="round">
    <circle cx="60" cy="60" r="52" stroke-width="4"/>
    <circle cx="60" cy="60" r="34" stroke-width="2" stroke-dasharray="1 7"/>
    <circle cx="60" cy="60" r="16" stroke-width="2"/>
  </g>
  <path d="M60 34 L65.5 54.5 L86 60 L65.5 65.5 L60 86 L54.5 65.5 L34 60 L54.5 54.5 Z" fill="#000"/>
  <circle cx="99" cy="29" r="3" fill="#000"/><circle cx="21" cy="80" r="2.5" fill="#000"/><circle cx="90" cy="94" r="2" fill="#000"/>
  <text x="134" y="73" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="38" font-weight="700" letter-spacing="7" fill="#000">OVERHEAD</text>
</svg>`;

/** Draws an image URL (data URL or SVG) onto a canvas of at most 900 px wide, or resolves null. */
export function rasterise(url) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      const k = Math.min(1, 900 / w0);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c);
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

export const defaultLogoUrl = () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_LOGO_SVG)}`;
