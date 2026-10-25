import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearing, fmtDist, fmtClock, D } from './geometry.js';

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

test('formatters', () => {
  assert.equal(fmtDist(7224), '7.22 km');
  assert.equal(fmtDist(183.4), '183 m');
  assert.equal(fmtClock(135), '02:15');
  assert.equal(fmtClock(3725), '1:02:05');
});
