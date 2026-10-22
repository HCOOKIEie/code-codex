# ASCII Tiles Background

Framework-free WebGL2 adaptation of the local independently implemented `ascii-tiles-background-effect`. The original effect's README identifies React Bits Pro ASCII Tiles public demonstrations as visual inspiration; no paid source was supplied, copied or claimed identical. Glyph masks, option keys/ranges and validation are preserved; defaults use the values captured from the current live panel. The integrated shader restores the original per-brick spring press: one rigid face shifts and scales down, propagates to neighbors and rebounds. Frame/bevel decoration is stationary, not a second shifted grid; no cursor-shaped dark veil or fine-field lens is added. No React runtime, network asset, external font or media library is required.

- `renderer.js`: instance-owned GPU handles, input, resize/visibility/context lifecycle and existing startup frame scheduling.
- `options.mjs`: single source for live-panel-derived defaults, ranges and validation.
- `tile-waves.mjs`: original per-brick additive spring lattice with bounded contact-footprint correction; a CSS-pixel contact disk excites intersecting bricks, then neighbors propagate.
- `tiles.frag`: original face lift/shift/scale and per-brick sampling; a single stationary bevel/outline, smooth rendering threshold for weak distant spring tails, and no dark press veil.
- `model.ts`: normalized persisted preferences. Key `code-codex:ascii-tiles-background:v1`.
- Host runtime: `src/plugin-host/backgrounds/ascii-tiles.ts`; settings: `src/features/plugin-settings/ascii-tiles.ts`.

The normal background registers with BackgroundActions and the existing dark-theme lease. It shares the existing Particle surface marker, native Settings and host tree/file-preview backing rules. UI Surface Opacity remains an independent overlay. The compact settings panel uses common card/button/group/range/popover styles, four scoped Reset buttons and global Chinese/English UI. Names remain English; diagnostics remain English. Opening settings never recreates the renderer. Startup Transition can select ASCII via the already available package startup factory; its copy owns independent GPU and timing state without enabling or restarting the normal background.

Context loss parks the loop until context restoration; initialization failure rejects activation. Hidden/offscreen rendering suspends, reduced motion suppresses wave propagation, pause stops flow while deliberate interaction can continue. Parameter changes update the same instance. Disposal unregisters input, observers, frame scheduling and GPU resources.

## Defaults and ranges

The table follows the shared options after promoting the current live-panel values; `paused` is host-owned and defaults to false. Values outside the range clamp; invalid numeric/color/boolean inputs retain defaults. Three colors accept six-digit hex. Reset affects only its own group.

| Parameter | Default | Min / max / step |
|---|---|---|
| speed | 0.87 | 0 / 3 / 0.01 |
| glyphSize | 9 | 4 / 24 / 1 |
| tileDensity | 6.7 | 1 / 12 / 0.1 |
| tileShear | -0.31 | -0.5 / 0.5 / 0.01 |
| tileGap | 18.5 | 0 / 40 / 0.5 |
| outlineWidth | 1.25 | 0 / 6 / 0.25 |
| outlineStrength | 0.6 | 0 / 1 / 0.01 |
| bevelWidth | 0.13 | 0 / 0.5 / 0.005 |
| bevelSoftness | 0.1 | 0.01 / 0.4 / 0.005 |
| refractionStrength | 46 | 0 / 120 / 1 |
| chromaticSpread | 0.66 | 0 / 1 / 0.01 |
| specularExponent | 256 | 1 / 256 / 1 |
| specularStrength | 1 | 0 / 3 / 0.01 |
| patternFreqX | 9.4 | 0 / 20 / 0.1 |
| patternFreqY | 4 | 0 / 20 / 0.1 |
| patternFreqXY | 10 | 0 / 20 / 0.1 |
| glyphColor | #ffffff | validated color or boolean |
| recessColor | #000000 | validated color or boolean |
| backgroundColor | #000000 | validated color or boolean |
| opacity | 0.6 | 0 / 1 / 0.01 |
| dpr | 1.5 | 1 / 3 / 0.1 |
| cursorInteraction | true | validated color or boolean |
| cursorRadius | 110 | 20 / 400 / 1 |
| cursorIntensity | 1 | 0 / 3 / 0.01 |
| cursorRecovery | 0.95 | 0.4 / 4 / 0.05 |
| waveSpeed | 5.5 | 1 / 12 / 0.1 |
| waveHeight | 36 | 0 / 80 / 1 |
| clickStrength | 1.5 | 0 / 3 / 0.01 |

## Interaction identity and stability

The original independent source folder is unchanged. The integrated face uses the original lift limit min(waveHeight,pitch*0.12), shift vector(0.22,0.7), and face scale clamp(1+lift/pitch*0.65,0.85,1.15). The face transform is uniform within a brick, tapered only near the stationary frame; it is not a cursor-local lens. Static restQ owns the only bevel/outline geometry, removing the second moving frame from the original transformed-q material. No multiplicative depression shadow is added.

The physical field has one spring per visual brick. Contact distance is measured to the brick rectangle in lattice coordinates, converted to CSS pixels; sigma=radius/3 and cutoff=radius. A contact still presses its touched brick when the center is outside the disk. Whole touched faces and subsequent neighbor propagation may extend beyond the disk. Rendering smoothly suppresses tiny tails: abs(height)<=0.04 contributes no wave material/transform, with full response at0.12; physical displacement and velocity remain continuous. Density/shear/window changes regrid; radius changes do not. Stored keys/ranges remain unchanged. Defaults match the explicitly captured live tuning; saved settings are not migrated or overwritten. Cold initialization and each group Reset use the same DEFAULTS source. Controls/editable fields/dialogs do not inject new strokes. Existing waves decay.

Regression: production-shader final-output inspection verifies coherent same-brick press/raise/restore and stationary bevel geometry; this instrumentation is distinct from the actual visual output. White-glyph GPU tests with representative and current user settings separately verify visible pressing, distant anchors, no broad dark veil and complete recovery. Pixel differences alone cannot establish whether pressing has been preserved. Actual application/package identities and device limitations belong to the local state record.

## Web entrance adaptation

The original Web effect's diagonal per-tile seed/delay, reveal, settling lift and highlight are ported with fixed defaults of 2.4 seconds and strength1. Normal and startup-copy instances use this entrance without copying Web controls/settings. All29 existing controls, ranges, tuned defaults and group resets stay unchanged. Progress runs independently of flow speed/pause, suspends while hidden/offscreen/held, and skips under reduced motion. Normal parameter updates and panel reopening do not replay it. Existing replay restarts only the entrance on the same GPU instance; wave state and flow time are retained. Context restoration retains entrance progress. At progress1, entrance lift/light vanish and reveal equals1, restoring the previous normal shader output.

The normal renderer keeps the corrected stationary frame, weak-tail threshold and no-dark-veil interaction; the Web shader is not copied wholesale. The standalone source project is read-only during this adaptation. `scripts/test-ascii-opening.mjs` checks deterministic lifecycle timing and pixel equality with a frozen public pre-entrance shader fixture; actual normal-motion and host rendering are verified separately.
