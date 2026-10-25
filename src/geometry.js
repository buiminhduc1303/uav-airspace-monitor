// Pure geometry & formatting helpers shared by the radar and the target cards.
// Coordinates are metres in a local ENU frame centred on the ARP: x = East, y = North.

export const D = Math.PI / 180;

// Bearing FROM the ARP TO a point (dx, dy = point − ARP), 0° = North, clockwise
export const bearing = (dx, dy) => (Math.atan2(dx, dy) / D + 360) % 360;

export const fmtDist = m => m == null || !isFinite(m) ? '—' : m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), mm = String(Math.floor(s / 60) % 60).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
