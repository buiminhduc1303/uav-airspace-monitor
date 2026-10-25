import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearing, pointInPolygon, distToPolygon, rayEta, classify, fmtDist, fmtClock, D } from './geometry.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('bearing from ARP: cardinal points', () => {
  near(bearing(0, 10000), 0);
  near(bearing(10000, 0), 90);
  near(bearing(0, -10000), 180);
  near(bearing(-10000, 0), 270);
});

test('bearing of seeded UAV-X1 (265°, 30 km) is ~265°', () => {
  const b = 265 * D;
  near(bearing(30000 * Math.sin(b), 30000 * Math.cos(b)), 265, 1e-9);
});

const sq = [[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]];

test('pointInPolygon / distToPolygon', () => {
  assert.equal(pointInPolygon(0, 0, sq), true);
  assert.equal(pointInPolygon(2000, 0, sq), false);
  near(distToPolygon(0, 0, sq), 0);
  near(distToPolygon(3000, 0, sq), 2000);
  near(distToPolygon(4000, 5000, sq), 5000);
});

test('rayEta: approaching, receding, parallel, inside', () => {
  near(rayEta(-5000, 0, 100, 0, sq), 40);      // 4 km at 100 m/s
  assert.equal(rayEta(-5000, 0, -100, 0, sq), null); // flying away
  assert.equal(rayEta(-5000, 3000, 100, 0, sq), null); // parallel, passes north of it
  assert.equal(rayEta(0, 0, 100, 0, sq), 0);
});

test('classify', () => {
  assert.equal(classify({ inP: true, inR: true, etaP: 0, etaR: 0 }, 300), 3);
  assert.equal(classify({ inP: false, inR: true, etaP: null, etaR: 0 }, 300), 2);
  assert.equal(classify({ inP: false, inR: false, etaP: 500, etaR: 200 }, 300), 1);
  assert.equal(classify({ inP: false, inR: false, etaP: null, etaR: null }, 300), 0);
  assert.equal(classify({ inP: false, inR: false, etaP: 900, etaR: 400 }, 300), 0);
});

test('formatters', () => {
  assert.equal(fmtDist(7224), '7.22 km');
  assert.equal(fmtDist(183.4), '183 m');
  assert.equal(fmtClock(135), '02:15');
  assert.equal(fmtClock(3725), '1:02:05');
});
