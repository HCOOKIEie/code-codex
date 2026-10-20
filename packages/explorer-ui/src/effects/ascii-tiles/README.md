# ASCII Tiles Background

Framework-free WebGL2 adaptation of the local independently implemented `ascii-tiles-background-effect`. The original effect's README identifies React Bits Pro ASCII Tiles public demonstrations as visual inspiration; no paid source was supplied, copied or claimed identical. The original shader, glyph masks, normalized options and neighbor-coupled spring simulation are preserved. No React runtime, network asset, external font or media library is required.

- `renderer.js`: instance-owned GPU handles, input, resize/visibility/context lifecycle and existing startup frame scheduling.
- `options.mjs`: original defaults/ranges/validation, copied byte-for-byte.
- `tile-waves.mjs`: original additive spring lattice, copied byte-for-byte.
- `tiles.frag`: original shader, copied byte-for-byte.
- `model.ts`: normalized persisted preferences. Key `code-codex:ascii-tiles-background:v1`.
- Host runtime: `src/plugin-host/backgrounds/ascii-tiles.ts`; settings: `src/features/plugin-settings/ascii-tiles.ts`.

The normal background registers with BackgroundActions and the existing dark-theme lease. It shares the existing Particle surface marker, native Settings and host tree/file-preview backing rules. UI Surface Opacity remains an independent overlay. The compact settings panel uses common card/button/group/range/popover styles, four scoped Reset buttons and global Chinese/English UI. Names remain English; diagnostics remain English. Opening settings never recreates the renderer. This first integration does not change Startup Transition's existing source list or package bytes.

Context loss parks the loop until context restoration; initialization failure rejects activation. Hidden/offscreen rendering suspends, reduced motion suppresses wave propagation, pause stops flow while deliberate interaction can continue. Parameter changes update the same instance. Disposal unregisters input, observers, frame scheduling and GPU resources.

## Defaults and ranges

The table is generated from the original shared options; `paused` is host-owned and defaults to false. Values outside the range clamp; invalid numeric/color/boolean inputs retain defaults. Three colors accept six-digit hex. Reset affects only its own group.

| Parameter | Default | Min / max / step |
|---|---|---|
| speed | 1 | 0 / 3 / 0.01 |
| glyphSize | 8 | 4 / 24 / 1 |
| tileDensity | 3.3 | 1 / 12 / 0.1 |
| tileShear | -0.22 | -0.5 / 0.5 / 0.01 |
| tileGap | 12 | 0 / 40 / 0.5 |
| outlineWidth | 1.25 | 0 / 6 / 0.25 |
| outlineStrength | 0.45 | 0 / 1 / 0.01 |
| bevelWidth | 0.02 | 0 / 0.5 / 0.005 |
| bevelSoftness | 0.1 | 0.01 / 0.4 / 0.005 |
| refractionStrength | 100 | 0 / 120 / 1 |
| chromaticSpread | 0.2 | 0 / 1 / 0.01 |
| specularExponent | 150 | 1 / 256 / 1 |
| specularStrength | 1 | 0 / 3 / 0.01 |
| patternFreqX | 6 | 0 / 20 / 0.1 |
| patternFreqY | 4 | 0 / 20 / 0.1 |
| patternFreqXY | 10 | 0 / 20 / 0.1 |
| glyphColor | #ffffff | validated color or boolean |
| recessColor | #000000 | validated color or boolean |
| backgroundColor | #000000 | validated color or boolean |
| opacity | 1 | 0 / 1 / 0.01 |
| dpr | 1.5 | 1 / 3 / 0.1 |
| cursorInteraction | true | validated color or boolean |
| cursorRadius | 160 | 20 / 400 / 1 |
| cursorIntensity | 1 | 0 / 3 / 0.01 |
| cursorRecovery | 1.8 | 0.4 / 4 / 0.05 |
| waveSpeed | 5.5 | 1 / 12 / 0.1 |
| waveHeight | 36 | 0 / 80 / 1 |
| clickStrength | 1.5 | 0 / 3 / 0.01 |
