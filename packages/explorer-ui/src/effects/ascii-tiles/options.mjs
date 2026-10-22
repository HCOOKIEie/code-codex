export const DEFAULTS = Object.freeze({
  speed: 0.87, glyphSize: 9, tileDensity: 6.7, tileShear: -0.31,
  tileGap: 18.5, outlineWidth: 1.25, outlineStrength: 0.6,
  bevelWidth: 0.13, bevelSoftness: 0.1, refractionStrength: 46,
  chromaticSpread: 0.66, specularExponent: 256, specularStrength: 1,
  patternFreqX: 9.4, patternFreqY: 4, patternFreqXY: 10,
  glyphColor: "#ffffff", recessColor: "#000000", backgroundColor: "#000000",
  opacity: 0.6, dpr: 1.5, cursorInteraction: true, cursorRadius: 110, cursorIntensity: 1, cursorRecovery: 0.95,
  waveSpeed: 5.5, waveHeight: 36, clickStrength: 1.5,
});

// Shared by the renderer, controls, and dependency-free unit tests.
export const RANGES = Object.freeze({
  speed: [0, 3, 0.01], glyphSize: [4, 24, 1], tileDensity: [1, 12, 0.1],
  tileShear: [-0.5, 0.5, 0.01], bevelWidth: [0, 0.5, 0.005],
  tileGap: [0, 40, 0.5], outlineWidth: [0, 6, 0.25], outlineStrength: [0, 1, 0.01],
  bevelSoftness: [0.01, 0.4, 0.005], refractionStrength: [0, 120, 1],
  chromaticSpread: [0, 1, 0.01], specularExponent: [1, 256, 1],
  specularStrength: [0, 3, 0.01], patternFreqX: [0, 20, 0.1],
  patternFreqY: [0, 20, 0.1], patternFreqXY: [0, 20, 0.1],
  opacity: [0, 1, 0.01], dpr: [1, 3, 0.1], cursorRadius: [20, 400, 1],
  cursorIntensity: [0, 3, 0.01], cursorRecovery: [0.4, 4, 0.05],
  waveSpeed: [1, 12, 0.1], waveHeight: [0, 80, 1], clickStrength: [0, 3, 0.01],
});

export function normalizeOptions(input = {}) {
  const result = { ...DEFAULTS };
  for (const key of Object.keys(RANGES)) {
    const [min, max] = RANGES[key];
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) result[key] = Math.min(max, Math.max(min, value));
  }
  for (const key of ["glyphColor", "recessColor", "backgroundColor"]) {
    if (typeof input[key] === "string" && /^#[\da-f]{6}$/i.test(input[key])) result[key] = input[key];
  }
  if (typeof input.cursorInteraction === "boolean") result.cursorInteraction = input.cursorInteraction;
  return result;
}

export function rgb(hex) {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
}
