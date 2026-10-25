// Pure geometry & formatting helpers shared by the radar and the target cards.
// Coordinates are metres in a local ENU frame centred on the ARP: x = East, y = North.

export const D = Math.PI / 180;

// Bearing FROM the ARP TO a point (dx, dy = point − ARP), 0° = North, clockwise
export const bearing = (dx, dy) => (Math.atan2(dx, dy) / D + 360) % 360;

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const u = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  return Math.hypot(px - (ax + u * vx), py - (ay + u * vy));
}

// 0 when the point is inside the polygon, otherwise the distance to its nearest edge
export function distToPolygon(x, y, poly) {
  if (pointInPolygon(x, y, poly)) return 0;
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    m = Math.min(m, distToSegment(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  }
  return m;
}

// Time (s) until a point moving at (vx, vy) m/s first crosses an edge of the polygon.
// 0 when already inside, null when the ray never meets the polygon.
export function rayEta(x, y, vx, vy, poly) {
  if (pointInPolygon(x, y, poly)) return 0;
  let best = null;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const ex = bx - ax, ey = by - ay;
    const den = vx * ey - vy * ex;
    if (Math.abs(den) < 1e-12) continue; // parallel to this edge
    const t = ((ax - x) * ey - (ay - y) * ex) / den;
    const u = ((ax - x) * vy - (ay - y) * vx) / den;
    if (t >= 0 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}

// Status: 3 = intruded (inside prohibited), 2 = inside restricted, 1 = heading into a zone within warnT, 0 = safe
export function classify({ inP, inR, etaP, etaR }, warnT) {
  if (inP) return 3;
  if (inR) return 2;
  if ((etaP != null && etaP <= warnT) || (etaR != null && etaR <= warnT)) return 1;
  return 0;
}

export const fmtDist = m => m == null || !isFinite(m) ? '—' : m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), mm = String(Math.floor(s / 60) % 60).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
