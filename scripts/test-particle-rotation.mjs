import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { buildSync } from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import { installedBackgroundFixture } from './background-package-fixture.mjs';
import { openBrowser, root, sleep } from './fixtures/browser-fixture.mjs';

// Real controller, coordinator, IDB, image preparation and published renderer.
// The barrier extends asynchronous preparation without replacing its result.
// Only the official appearance ports and the other background are test doubles.
const label = process.argv[2] ?? String(Date.now());
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const directory = join(root, 'artifacts', `particle-rotation-${label}`);
assert.ok(!existsSync(join(directory, 'results.json')), 'use a new evidence label');
mkdirSync(directory, { recursive: true });
const version = JSON.parse(readFileSync(join(root, 'packages/explorer-ui/package.json'), 'utf8')).version;
const catalog = readFileSync(join(root, 'packages/explorer-ui/dist/plugins/catalog.json'), 'utf8');
const seam = installedBackgroundFixture(root, ['particle-image']) + '\n' + buildSync({
  stdin: {
    contents: `import {ParticleBackgroundController} from './plugin-host/backgrounds/particle';
      import {BackgroundActions} from './core/appearance/background-actions';
      import {AppearanceCoordinator} from './core/lifecycle/appearance-coordinator';
      import * as media from './particle-image-startup';
      import {backgroundModule,connectBackgroundPackages} from './background-plugin-runtime';
      window.fixture={ParticleBackgroundController,BackgroundActions,AppearanceCoordinator,...media,backgroundModule,connectBackgroundPackages};`,
    resolveDir: join(root, 'packages/explorer-ui/src'), loader: 'ts',
  },
  bundle: true, write: false, format: 'iife', target: 'chrome120',
  define: { __CODE_CODEX_VERSION__: JSON.stringify(version), __CODE_CODEX_PLUGIN_CATALOG__: catalog },
}).outputFiles[0].text;
const report = {
  version, at: new Date().toISOString(),
  controllerSha256: createHash('sha256').update(readFileSync(join(root, 'packages/explorer-ui/src/plugin-host/backgrounds/particle.ts'))).digest('hex'),
  checks: [], failures: [],
  limitations: ['Isolated browser/software WebGL fixture; not a live official Codex session or installer test',
    'Controlled preparation barriers are not performance benchmarks'],
};
const check = (name, passed, value) => {
  report.checks.push({ name, passed: Boolean(passed), value });
  assert.ok(passed, name);
};
const server = createServer((req, res) => {
  if (req.url === '/seam.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(seam); }
  else if (req.url === '/photo.png') { res.setHeader('Content-Type', 'image/png'); res.end(readFileSync(join(root, 'packages/explorer-ui/src/pixel-sculpt-default.png'))); }
  else if (req.url === '/app-initial-particle-rotation.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(`export const adapter={appActions:{runInPrimaryWindow:async({action})=>({mode:action.mode??'dark'})},clientCoordination:{invalidateQueryCache:async()=>({})}};`);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html data-theme="dark"><head><link rel="modulepreload" href="/app-initial-particle-rotation.js"><style>html,body{margin:0;width:100%;height:100%;background:#111}</style></head><body><script>window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));</script><script src="/seam.js"></script></body></html>`);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await openBrowser('<!doctype html><title>Particle rotation regression</title>');
  const { ev, cmd, wait } = browser;
  await cmd('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await wait('!!window.fixture', 'fixture ready');
  await ev(`(async()=>{
    window.blob=await(await fetch('/photo.png')).blob();
    const db=await fixture.openParticleImageDatabase(()=>{});
    await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite'),store=tx.objectStore('images');
      for(const [i,id] of ['a','b','c'].entries())store.put({id,name:id+'.png',type:'image/png',size:blob.size,createdAt:i+1,blob,thumbnail:blob,...fixture.DEFAULT_PARTICLE_IMAGE_TRANSFORM});
      tx.oncomplete=resolve;tx.onerror=reject;});db.close();
    fixture.writeParticleBackgroundSettings(fixture.normalizeParticleSettings({selectedImageIds:['a','b','c'],activeImageId:'a',autoSwitch:true,imageDurationSeconds:1,morphIntervalSeconds:0.2,introEnabled:false,particleCount:10000,speed:0,noiseStrength:0}));
    fixture.connectBackgroundPackages(async()=>({loaded:true}));
    window.hold=true;window.hits=0;window.releases=[];window.prewarming=false;
    const cache=fixture.ParticleImagePreparationCache.prototype,prepare=cache.prepare,prewarm=cache.prewarm;
    cache.prepare=function(...args){if(!hold||prewarming)return prepare.apply(this,args);hits++;return new Promise(r=>releases.push(r)).then(()=>prepare.apply(this,args));};
    cache.prewarm=function(...args){prewarming=true;try{return prewarm.apply(this,args);}finally{prewarming=false;}};
    const renderer=fixture.backgroundModule('particle-image').exports.ParticleImageRenderer.prototype,setImage=renderer.setPreparedImage,replay=renderer.replayOpening;
    window.replays=0;renderer.setPreparedImage=function(...args){window.realRenderer=this;return setImage.apply(this,args);};
    renderer.replayOpening=function(...args){replays++;return replay.apply(this,args);};
    window.controller=new fixture.ParticleBackgroundController();await controller.initialize();
    window.coordinator=new fixture.AppearanceCoordinator();window.enabled=new Set(['particle']);window.issues=[];
    window.other={enabled:false,pending:false,error:undefined,initialize:async()=>{},enable:async()=>{other.enabled=true;},disable:async()=>{other.enabled=false;}};
    window.actions=new fixture.BackgroundActions({coordinator,entries:[{id:'particle',label:'Particle',runtime:controller},{id:'other',label:'Other',runtime:other}],enabled,connected:()=>true,initializationCurrent:()=>true,prepare:async()=>{},ready:async()=>true,leaveNativeTransparency:async()=>{},reconcileNative:async()=>{},transferTheme:()=>{},committed:()=>{},changed:()=>{},suspendHealth:()=>{},resumeHealth:()=>{},failed:(op,e)=>issues.push(op+': '+e),announce:()=>{}});
    window.enabling=controller.enable();
  })()`);
  const release = () => ev('hold=false;releases.splice(0).forEach(resolve=>resolve());');
  const gate = async (name, expression) => {
    await ev('window.startHits=hits;hold=true;');
    if (expression) await ev(`(()=>{${expression}})()`);
    await wait('hits>startHits', name + ' image preparation', 8000);
  };
  await wait('hits===1', 'first image preparation');
  check('initial enable retains the appearance lock', await ev('controller.pending&&actions.busy'));
  await release(); await ev('enabling');
  const initialRecordCount = await ev('controller.records.length');
  check('first image uses the real particle renderer', await ev('realRenderer.count>0&&!controller.error'));
  check('enable releases its appearance lock', await ev('controller.enabled&&!controller.pending&&!actions.busy'));
  await gate('first automatic rotation');
  check('initial enable schedules automatic rotation without setting edits', true);
  check('routine rotation does not lock other appearance actions', await ev('!controller.pending&&!actions.busy'));
  await ev('controller.updateSettings({...controller.settings,introEnabled:true});');
  await ev('window.replayCount=replays;controller.replayOpening();');
  check('opening replay cannot interrupt an in-flight image swap', await ev('replays===replayCount'));
  await ev('controller.updateSettings({...controller.settings,introEnabled:false});');
  await release(); await wait("controller.activeImageId==='b'", 'automatic second image');
  check('automatic rotation commits the next selected image', true);

  await ev('controller.updateSettings({...controller.settings,autoSwitch:false});');
  await gate('import', `window.importing=controller.addImages([new File([blob],'imported.png',{type:'image/png'})]);`);
  check('image import retains the appearance lock', await ev('controller.pending&&actions.busy'));
  await ev('controller.updateSettings({...controller.settings,autoSwitch:true});');
  await release(); await ev('importing');
  const imported = await ev('({records:controller.records.map(r=>({id:r.id,name:r.name})),pending:controller.pending,active:controller.activeImageId})');
  check('import commits the new image and releases its lock', imported.records.length === initialRecordCount + 1 && !imported.pending && imported.records.find(r => r.id === imported.active)?.name === 'imported.png', imported);
  await gate('automatic rotation after import');
  check('import completion restarts automatic rotation', true);
  await ev('actions.toggle("other")');
  check('first click switches backgrounds during a routine swap', await ev('other.enabled&&!controller.enabled&&!actions.busy'));
  await release(); await sleep(500);
  check('late preparation cannot revive the excluded background', await ev('other.enabled&&!controller.enabled&&!controller.pending&&!document.querySelector("[data-code-codex-particle-layer]")'));

  await ev(`(async()=>{await other.disable();enabled.clear();enabled.add('particle');await controller.enable();await controller.updateSettings({...controller.settings,autoSwitch:false});})()`);
  await gate('active image deletion', 'window.deleting=controller.deleteImage(controller.activeImageId);');
  check('active image deletion retains the appearance lock', await ev('controller.pending&&actions.busy'));
  await ev('controller.updateSettings({...controller.settings,autoSwitch:true});');
  await release(); await ev('deleting');
  check('active deletion selects a remaining image and releases its lock', await ev(`controller.records.length===${initialRecordCount}&&!controller.pending&&controller.records.some(r=>r.id===controller.activeImageId)`));
  await gate('automatic rotation after active deletion');
  check('active deletion completion restarts automatic rotation', true);
  await ev('controller.disable(true)'); await release(); await sleep(400);
  check('disable cancels in-flight rotation without leaving a busy state', await ev('!controller.enabled&&!controller.pending&&!actions.busy'));

  await ev(`(async()=>{await controller.enable();await controller.updateSettings({...controller.settings,autoSwitch:false});})()`);
  await ev(`(async()=>{const inactive=controller.records.find(r=>r.id!==controller.activeImageId).id;await controller.updateSettings({...controller.settings,autoSwitch:true});await controller.deleteImage(inactive);})()`);
  await gate('automatic rotation after inactive deletion');
  check('inactive deletion also restarts automatic rotation', await ev(`controller.records.length===${initialRecordCount - 1}&&controller.settings.selectedImageIds.length===2&&!controller.pending&&!actions.busy`));
  await ev('controller.clearOrder()'); await release(); await sleep(400);
  check('clearing selection order does not leave an appearance lock', await ev('controller.settings.selectedImageIds.length===0&&!controller.pending&&!actions.busy'));

  await ev(`(async()=>{await controller.disable(true);await controller.updateSettings({...controller.settings,selectedImageIds:controller.records.map(r=>r.id),activeImageId:controller.records[0].id,autoSwitch:false});await controller.enable();})()`);
  await gate('dispose', 'window.editing=controller.beginImageTransformEditing(controller.records.find(r=>r.id!==controller.activeImageId).id);');
  await ev('controller.dispose()'); await release(); await ev('editing');
  check('dispose cancels a prepared image without reactivation or busy state', await ev('!controller.enabled&&!controller.pending&&!actions.busy'));
  check('fixture has no unhandled or background-action errors', await ev('errors.length===0&&issues.length===0'), await ev('({errors,issues})'));
} catch (error) {
  report.failures.push(String(error.stack ?? error));
  if (browser) report.observation = await browser.ev('({errors:window.errors,issues:window.issues,pending:window.controller?.pending,enabled:window.controller?.enabled,hits:window.hits,settings:window.controller?.settings})').catch(() => null);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  report.passed = report.failures.length === 0;
  writeFileSync(join(directory, 'results.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.failures }, null, 2));
if (!report.passed) process.exitCode = 1;
