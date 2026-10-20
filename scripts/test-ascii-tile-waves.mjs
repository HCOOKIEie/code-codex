import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaveGrid, gridPoint, kickWave, strokeWave, advanceWaves, clearWaves } from '../packages/explorer-ui/src/effects/ascii-tiles/tile-waves.mjs';

const setup = () => createWaveGrid(1200, 800, 6, -0.22);
const step = (g, time, speed = 5.5, duration = 1.8) => { for (let t = 0; t < time; t += 1 / 120) advanceWaves(g, 1 / 120, speed, duration); };

test('screen mapping agrees with the sheared shader lattice', () => {
  assert.deepEqual(gridPoint(1200, 800, 6, -0.22, 600, 400), [0.42, 0.35]);
  for (const [w, h] of [[1200, 800], [390, 844]]) {
    const g = createWaveGrid(w, h, 12, 0.5);
    for (const [x, y] of [[0, 0], [w, h], [w, 0], [0, h]]) {
      const [gx, gy] = gridPoint(w, h, 12, 0.5, x, y);
      assert.ok(gx >= g.originX && gx < g.originX + g.columns);
      assert.ok(gy >= g.originY && gy < g.originY + g.rows);
    }
  }
});

test('a source transmits into adjacent cells instead of staying a local mask', () => {
  const g = setup(), x = Math.floor(g.columns / 2), y = Math.floor(g.rows / 2), i = y * g.columns + x;
  g.velocities[i] = -12; g.active = true;
  step(g, 0.04);
  const early = Math.abs(g.heights[i + 2]);
  step(g, 0.22);
  assert.ok(Math.abs(g.heights[i + 1]) > 0.01);
  assert.ok(Math.abs(g.heights[i + 2]) > early * 10);
});

test('pressing is followed by rebound, and disappears within the configured lifetime', () => {
  const g = setup(), i = Math.floor(g.heights.length / 2);
  g.velocities[i] = -12; g.active = true;
  let negative = false, positive = false;
  for (let t = 0; t < 1.8; t += 1 / 120) {
    advanceWaves(g, 1 / 120, 5.5, 1.8);
    negative ||= g.heights[i] < -0.01;
    positive ||= g.heights[i] > 0.005;
  }
  assert.ok(negative); assert.ok(positive);
  advanceWaves(g, 0.1, 5.5, 1.8);
  assert.equal(g.active, false);
  assert.ok(g.data.every(v => v === 0));
});

test('consecutive impulses add to existing waves; faster strokes add more energy', () => {
  const g = setup(); kickWave(g, 600, 400, -5, 120); step(g, 0.1);
  const heights = g.heights.slice(), velocity = g.velocities.slice();
  kickWave(g, 600, 400, -5, 120);
  assert.deepEqual(g.heights, heights);
  assert.ok(g.velocities.some((v, i) => v < velocity[i]));
  const slow = setup(), fast = setup();
  strokeWave(slow, 300, 400, 450, 400, 0.5, 160, 1);
  strokeWave(fast, 300, 400, 450, 400, 0.04, 160, 1);
  const energy = grid => grid.velocities.reduce((sum, v) => sum + v * v, 0);
  assert.ok(energy(fast) > energy(slow));
});

test('high speeds and repeated inputs remain finite; clear returns exact zeros', () => {
  for (const duration of [0.4, 4]) {
    const g = createWaveGrid(390, 844, 12, 0.5);
    for (let i = 0; i < 100; i++) { kickWave(g, 195, 422, -42, 400); advanceWaves(g, 1 / 30, 12, duration); }
    assert.ok(g.data.every(Number.isFinite));
    clearWaves(g); assert.equal(g.active, false); assert.ok(g.data.every(v => v === 0));
  }
});

test('30, 60 and 120 Hz advance the same spring state', () => {
  const states = [30, 60, 120].map(fps => {
    const g = setup(); kickWave(g, 600, 400, -14, 160);
    for (let i = 0; i < fps * 0.4; i++) advanceWaves(g, 1 / fps, 5.5, 1.8);
    return g.heights;
  });
  assert.deepEqual(states[0], states[1]);
  assert.deepEqual(states[1], states[2]);
});
