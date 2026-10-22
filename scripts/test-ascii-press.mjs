import assert from 'node:assert/strict';
import { build } from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { launchFixture, delay } from './browser-fixture.mjs';

// Instrument only the final fragment output. Production press coordinates and
// frame geometry execute unchanged on WebGL; this is not a visual screenshot test.
const root=resolve(import.meta.dirname,'..'), output=resolve(root,'artifacts/ascii-press-contract');
mkdirSync(output,{recursive:true});
const bundles={};
for(const mode of ['face','frame']){
  const result=await build({stdin:{contents:`import {AsciiTilesRenderer} from './packages/explorer-ui/src/effects/ascii-tiles/renderer.js';new AsciiTilesRenderer(document.querySelector('div'),document.querySelector('canvas'),{speed:1,tileDensity:6,tileShear:-.31,glyphSize:9});`,resolveDir:root},bundle:true,write:false,format:'iife',target:'chrome120',plugins:[{name:'inspect-production-press',setup(b){b.onLoad({filter:/tiles\.frag$/},args=>{
    const source=readFileSync(args.path,'utf8');
    const last='outColor = vec4(clamp(color, 0.0, 1.0), uOpacity);';
    assert.ok(source.includes(last));
    return {loader:'text',contents:source.replace(last,mode==='face'?'outColor = vec4(faceScale - 0.5, faceShift.y / 64.0 + 0.5, abs(lift) > 0.001 ? 1.0 : 0.0, 1.0);':'outColor = vec4(vec3(slope), 1.0);')};
  });}}]});bundles[mode]=result.outputFiles[0].text;
}
const server=createServer((req,res)=>{const mode=req.url?.includes('frame')?'frame':'face';res.setHeader('Content-Type',req.url?.endsWith('.js')?'text/javascript':'text/html');res.end(req.url?.endsWith('.js')?bundles[mode]:`<!doctype html><style>html,body{margin:0;height:100%;background:#000}div,canvas{position:fixed;inset:0;width:100%;height:100%}</style><div><canvas></canvas></div><script src="/${mode}.js"></script>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const results=[];
try{
 for(const mode of ['face','frame']){
  let browser;
  try{
   browser=await launchFixture(`http://127.0.0.1:${server.address().port}/${mode}`);for(let i=0;i<200 && !(await browser.evaluate(`document.querySelector('canvas')?.dataset.introProgress==='1.0000'`));i++)await delay(50);
   await browser.evaluate(`(()=>{const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2'),program=gl.getParameter(gl.CURRENT_PROGRAM);const res=gl.getUniform(program,gl.getUniformLocation(program,'uResolution')),origin=gl.getUniform(program,gl.getUniformLocation(program,'uWaveOrigin'));gl.activeTexture(gl.TEXTURE1);const tex=gl.getParameter(gl.TEXTURE_BINDING_2D);window.pressProbe={height:0,gl,program,canvas,tex,origin,res,original:gl.drawArrays,frames:0};const p=pressProbe;gl.drawArrays=function(...args){const x=-origin[0],y=-origin[1];gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,1,1,gl.RGBA,gl.FLOAT,new Float32Array([p.height,0,0,0]));p.original.apply(gl,args);const width=res[0],height=res[1],edge=Math.max(width,height),sh=-.31;const cx=width/2+(.08+sh*.15)/(1+sh*sh)*edge/6,cy=height/2+(-sh*.08+.15)/(1+sh*sh)*edge/6;const read=(sx,sy)=>{const b=new Uint8Array(4);gl.readPixels(Math.round(sx*canvas.width/width),Math.round(sy*canvas.height/height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);return [...b];};p.samples=[read(cx-20,cy),read(cx+20,cy),read(8,8)];const patch=new Uint8Array(512*512*4);gl.readPixels(Math.floor(canvas.width/2)-256,Math.floor(canvas.height/2)-256,512,512,gl.RGBA,gl.UNSIGNED_BYTE,patch);p.patch=patch;p.error=gl.getError();p.frames++;};})()`);
   const sample=async height=>{await browser.evaluate(`pressProbe.height=${height};pressProbe.frames=0`);for(let i=0;i<60;i++){if(await browser.evaluate('pressProbe.frames>=2'))break;await delay(25);}return browser.evaluate('({samples:pressProbe.samples,error:pressProbe.error})');};
   const rest=await sample(0);await browser.evaluate('pressProbe.base=pressProbe.patch.slice()');
   const down=await sample(-.8);const frameChanges=await browser.evaluate('pressProbe.patch.reduce((n,v,i)=>n+(v!==pressProbe.base[i]),0)');
   const up=await sample(.8), recovered=await sample(0);
   assert.equal(rest.error,0);assert.equal(down.error,0);assert.equal(up.error,0);
   if(mode==='face'){
    assert.ok(down.samples[0][0]<rest.samples[0][0]&&down.samples[0][1]<rest.samples[0][1],'Press contracts and lowers the face');
    assert.ok(up.samples[0][0]>rest.samples[0][0]&&up.samples[0][1]>rest.samples[0][1],'Rebound expands and raises the face');
    assert.deepEqual(down.samples[0],down.samples[1],'Separated points of one brick share one press transform');
    assert.deepEqual(down.samples[2],rest.samples[2],'Unpressed distant brick stays fixed');
   }else assert.equal(frameChanges,0,'Bevel geometry is stationary during face pressing; no second moving grid');
   assert.deepEqual(recovered,rest,'Restoring the height restores the original face');
   results.push({mode,rest,down,up,recovered,frameChanges,passed:true});
  }finally{await browser?.close();}
 }
 writeFileSync(resolve(output,'report.json'),JSON.stringify({mode:'Production shader coordinate/geometry inspection with final-output instrumentation',results},null,2));console.log(JSON.stringify(results));
}finally{await new Promise(r=>server.close(r));}
