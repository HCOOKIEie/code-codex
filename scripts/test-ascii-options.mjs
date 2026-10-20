import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, RANGES, normalizeOptions, rgb } from '../packages/explorer-ui/src/effects/ascii-tiles/options.mjs';

test('defaults are stable and fresh objects are returned', () => {
  const options = normalizeOptions();
  assert.deepEqual(options, DEFAULTS);
  options.speed = 2;
  assert.equal(DEFAULTS.speed, 1);
});
test('all numeric controls clamp safely at both extremes', () => {
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    assert.equal(normalizeOptions({ [key]: -1e8 })[key], min);
    assert.equal(normalizeOptions({ [key]: 1e8 })[key], max);
    assert.equal(normalizeOptions({ [key]: NaN })[key], DEFAULTS[key]);
    assert.equal(normalizeOptions({ [key]: Infinity })[key], DEFAULTS[key]);
  }
});
test('speed zero is preserved; invalid colors never reach uniforms', () => {
  assert.equal(normalizeOptions({ speed: 0 }).speed, 0);
  assert.equal(normalizeOptions({ glyphColor: 'red' }).glyphColor, DEFAULTS.glyphColor);
  assert.deepEqual(rgb('#ff8000'), [1, 128 / 255, 0]);
  assert.equal(normalizeOptions({ cursorInteraction: false }).cursorInteraction, false);
});

test('tile spacing and outlines have useful defaults and can be disabled', () => {
  assert.equal(DEFAULTS.tileGap, 12);
  assert.equal(DEFAULTS.recessColor, '#000000');
  assert.ok(DEFAULTS.outlineWidth > 0);
  assert.ok(DEFAULTS.outlineStrength > 0);
  const disabled = normalizeOptions({ tileGap: 0, outlineWidth: 0, outlineStrength: 0 });
  assert.equal(disabled.tileGap, 0);
  assert.equal(disabled.outlineWidth, 0);
  assert.equal(disabled.outlineStrength, 0);
});
