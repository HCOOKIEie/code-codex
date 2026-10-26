import assert from 'node:assert/strict';
import { build } from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchFixture, delay } from './browser-fixture.mjs';
import { measureAsciiInteraction } from './ascii-interaction-probe.mjs';
import { DEFAULTS } from '../packages/explorer-ui/src/effects/ascii-tiles/options.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'artifacts/ascii-local-interaction');
mkdirSync(output, { recursive: true });
// White glyphs and the user's visual configuration; no gray-glyph workaround.
const settings = { ...DEFAULTS, paused:false };
const bundle = await build({ stdin: { contents: `import {AsciiTilesRenderer} from './packages/explorer-ui/src/effects/ascii-tiles/renderer.js';window.renderer=new AsciiTilesRenderer(document.querySelector('[data-code-codex-ascii-tiles-layer]'),document.querySelector('canvas'),${JSON.stringify(settings)});`, resolveDir:root }, bundle:true, write:false, format:'iife', target:'chrome120', loader:{'.frag':'text'} });
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/test.js' ? bundle.outputFiles[0].text : '<!doctype html><html><style>html,body{margin:0;width:100%;height:100%;background:#000}div,canvas{position:fixed;inset:0;width:100%;height:100%}</style><body><div data-code-codex-ascii-tiles-layer><canvas></canvas></div><script src="/test.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await launchFixture(`http://127.0.0.1:${server.address().port}/`);
  for(let i=0;i<200 && !(await browser.evaluate(`document.querySelector('canvas')?.dataset.introProgress==='1.0000'`));i++)await delay(50);
  assert.ok(await browser.evaluate(`document.querySelector('canvas')?.dataset.introProgress==='1.0000'`),'Entrance completes before normal interaction regression');
  const report = await measureAsciiInteraction(browser, { recovery:settings.cursorRecovery, snapshot: async name => {
    const image = await browser.command('Page.captureScreenshot', { format:'png' });
    writeFileSync(resolve(output, name+'.png'), Buffer.from(image.data, 'base64'));
  } });
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  assert.ok(report.active.changed / report.active.pixels > .02, 'White glyph response must be visible locally');
  assert.ok(report.active.introduced / report.active.pixels > .005, 'Pressed face must move visible glyph edges');
  assert.equal(report.active.farChanged, 0, 'Distant grid is anchored');
  assert.ok(report.active.farPainted > 100, 'Distant reference contains visible glyphs');
  assert.ok(report.active.minCenterBrightnessRatio > .9, 'Pressed face must not receive a broad dark veil');
  assert.equal(report.recovered.changed, 0, 'Waves recover exactly');
  assert.ok(report.active.frames > 2 && report.active.error === 0 && report.active.sameCanvas);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
