// Inline stroke icons (24x24 grid). `icon(name)` returns a fresh <svg> element.
const P = {
  explore: '<path d="M7 3c0 4.5 10 5 10 9s-10 4.5-10 9"/><path d="M17 3c0 4.5-10 5-10 9s10 4.5 10 9"/><path d="M8.6 6.4h6.8M8.6 17.6h6.8"/>',
  pairs: '<circle cx="5.5" cy="12" r="3"/><circle cx="18.5" cy="12" r="3"/><path d="M10 9.6h4M10 12h4M10 14.4h4"/>',
  melt: '<path d="M10 14.2V5.5a2 2 0 0 1 4 0v8.7a4 4 0 1 1-4 0z"/><path d="M12 9.5v6"/><path d="M17.5 5.5h2.5M17.5 9h2.5"/>',
  replicate: '<path d="M12 21v-6.5"/><path d="M12 14.5 6.2 8.6M12 14.5l5.8-5.9"/><path d="M6 4.5v4.6h4.6M18 4.5v4.6h-4.6"/>',
  xray: '<circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="4.6" r="1.1"/><circle cx="12" cy="19.4" r="1.1"/><circle cx="5.6" cy="8.3" r="1.1"/><circle cx="18.4" cy="8.3" r="1.1"/><circle cx="5.6" cy="15.7" r="1.1"/><circle cx="18.4" cy="15.7" r="1.1"/><circle cx="12" cy="12" r="5.2" stroke-dasharray="1.5 2.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.7" r=".6" fill="currentColor"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="3.2"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4.2h4.2"/>',
  left: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  right: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  chevR: '<path d="M9 5.5 15.5 12 9 18.5"/>',
  chevL: '<path d="M15 5.5 8.5 12l6.5 6.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  ruler: '<path d="M3.5 16.5 16.5 3.5l4 4-13 13z"/><path d="M7.5 12.5l2 2M10.5 9.5l1.5 1.5M13.5 6.5l2 2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v6L5 19a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 19l-5.5-9.5v-6"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.3a6 6 0 0 1-12 0c0-3.900 6-10.300 6-10.300z"/>',
};
export function icon(name, size = 22) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
  return t.content.firstChild;
}
export const LOGO_SVG = '<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" focusable="false"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#a99bff"/></linearGradient></defs><path d="M9 3c0 7 14 7 14 13S9 22 9 29" fill="none" stroke="url(#lg)" stroke-width="2.6" stroke-linecap="round"/><path d="M23 3c0 7-14 7-14 13s14 6 14 13" fill="none" stroke="url(#lg)" stroke-width="2.6" stroke-linecap="round" opacity=".6"/><path d="M12 8.5h8M10.500 16h11M12 23.500h8" stroke="#ffc233" stroke-width="1.800" stroke-linecap="round" opacity=".85"/></svg>';
