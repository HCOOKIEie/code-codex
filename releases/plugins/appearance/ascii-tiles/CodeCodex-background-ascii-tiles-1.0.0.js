(()=>{var se=`#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform sampler2D uAtlas;
uniform sampler2D uWaveGrid;
uniform ivec2 uWaveOrigin;
uniform float uWaveHeight;
uniform vec3 uGlyphColor, uRecessColor, uBackgroundColor;
uniform float uGlyphSize, uTileDensity, uTileShear, uBevelWidth, uBevelSoftness;
uniform float uTileGap, uOutlineWidth, uOutlineStrength;
uniform float uRefraction, uChromatic, uSpecularExp, uSpecularStrength;
uniform vec3 uFrequency;
uniform vec2 uPointer;
uniform float uReducedHover, uRadius, uIntensity, uOpacity;
in vec2 vUV;
out vec4 outColor;

// An independently constructed interference field, not the Pro source shader.
float field(vec2 pixel) {
  vec2 p = (pixel - uResolution * 0.5) / max(uResolution.x, uResolution.y);
  float t = uTime * 0.34;
  float wave = sin(p.x * uFrequency.x * 3.14159 + t)
    + sin(p.y * uFrequency.y * 3.14159 - t * 1.25)
    + sin(p.x * p.y * uFrequency.z * 12.0 + t * 0.7);
  return clamp(0.48 + wave * 0.24, 0.0, 1.0);
}

float ascii(vec2 pixel) {
  vec2 cell = floor(pixel / uGlyphSize);
  float density = field((cell + 0.5) * uGlyphSize);
  float glyph = floor(clamp(density, 0.0, 0.9999) * 10.0);
  vec2 local = fract(pixel / uGlyphSize);
  // Ten equally spaced slots in a one-row monospace atlas; no font work per frame.
  vec2 atlasUV = vec2((glyph + local.x) / 10.0, local.y);
  return texture(uAtlas, atlasUV).r * mix(0.3, 1.0, density);
}

vec4 brickWave(ivec2 id) {
  ivec2 cell = id - uWaveOrigin;
  if (any(lessThan(cell, ivec2(0))) || any(greaterThanEqual(cell, textureSize(uWaveGrid, 0)))) return vec4(0);
  return texelFetch(uWaveGrid, cell, 0);
}

void main() {
  // All dimensions are CSS pixels, independent of device pixel ratio.
  vec2 pixel = vUV * uResolution;
  float edge = max(uResolution.x, uResolution.y);
  vec2 p = (pixel - uResolution * 0.5) / edge;
  mat2 lattice = mat2(1.0, uTileShear, -uTileShear, 1.0);
  vec2 latticePoint = lattice * p * uTileDensity + vec2(0.42, 0.35);
  ivec2 brickID = ivec2(floor(latticePoint));
  vec4 wave = brickWave(brickID);
  vec2 restQ = fract(latticePoint);
  vec2 restDistances = 0.5 - abs(restQ - 0.5);
  float restNearest = min(restDistances.x, restDistances.y);
  // Keep gaps and outlines in CSS pixels, even when density, shear or DPR changes.
  float pixelToTile = uTileDensity * sqrt(1.0 + uTileShear * uTileShear) / edge;
  // Very dense grids must still leave some visible glass instead of overlapping.
  float seam = min(uTileGap * 0.5 * pixelToTile, 0.44);
  float aa = max(fwidth(restNearest) * 0.5, 0.00001);
  float rim = max(min(uBevelWidth + uBevelSoftness * 0.25, 0.48 - seam), 0.001);
  // Outer frames and black gaps are anchors; the raised face moves INSIDE them.
  float tile = uTileGap > 0.0 ? smoothstep(seam - aa, seam + aa, restNearest) : 1.0;
  float pitch = 1.0 / pixelToTile;
  float lift = clamp(wave.x, -1.5, 1.5) * min(uWaveHeight, pitch * 0.12);
  float faceBlend = smoothstep(seam, seam + rim * 0.8, restNearest);
  vec2 faceShift = vec2(0.22, 0.7) * lift;
  vec2 shiftInGrid = lattice * faceShift * uTileDensity / edge;
  float faceScale = clamp(1.0 + lift / pitch * 0.65, 0.85, 1.15);
  vec2 q = 0.5 + (restQ - 0.5 - shiftInGrid * faceBlend) / mix(1.0, faceScale, faceBlend);
  vec2 signedEdge = q - 0.5;
  vec2 distances = 0.5 - abs(signedEdge);
  float nearest = min(distances.x, distances.y);
  float slope = 1.0 - smoothstep(seam, seam + rim, nearest);
  vec2 gradient = distances.x < distances.y ? vec2(sign(signedEdge.x), 0.0) : vec2(0.0, sign(signedEdge.y));
  gradient = transpose(lattice) * gradient;
  vec2 offset = gradient * slope * uRefraction;
  vec2 centerGrid = (vec2(brickID) + 0.5 - vec2(0.42, 0.35)) / uTileDensity;
  vec2 centerPixel = uResolution * 0.5 + inverse(lattice) * centerGrid * edge;
  vec2 refracted = centerPixel + (pixel - centerPixel - faceShift * faceBlend)
    / mix(1.0, faceScale, faceBlend) + offset;
  float r = ascii(refracted + offset * uChromatic);
  float g = ascii(refracted);
  float b = ascii(refracted - offset * uChromatic);
  vec2 coupledTilt = transpose(lattice) * wave.yz * min(uWaveHeight / pitch, 0.12) * 2.8;
  vec3 normal = normalize(vec3(-gradient * slope * 2.4 - coupledTilt, 1.0));
  vec3 light = normalize(vec3(-0.6, 0.8, 0.65));
  float highlight = pow(max(dot(normal, normalize(light + vec3(0, 0, 1))), 0.0), uSpecularExp);
  float bevelLight = 0.45 + max(dot(normal, light), 0.0) * 0.65;
  float rimFacing = max(dot(normal.xy, normalize(light.xy)), 0.0);
  float rimReflection = slope * pow(rimFacing, mix(1.2, 3.5, uSpecularExp / 256.0));
  vec3 glyphs = vec3(r, g, b) * uGlyphColor * mix(0.9, bevelLight, slope);
  // Glass catches white light on the upper bevel while glyphs retain dispersion.
  glyphs += vec3(highlight * uSpecularStrength) * (0.08 + vec3(r,g,b) * 0.92);
  glyphs += vec3(r,g,b) * rimReflection * uSpecularStrength * 4.5;
  float energy = clamp(abs(wave.x) + abs(wave.w) * 0.02, 0.0, 1.5);
  // Reduced motion retains a static material cue instead of a moving wave.
  energy += uReducedHover * uIntensity * 0.18 * (1.0 - smoothstep(0.0, uRadius, length(pixel - uPointer)));
  glyphs *= 1.0 + energy * (0.45 + slope * 0.35) + clamp(wave.x, -1.0, 1.0) * 0.08;
  vec3 color = mix(uRecessColor, mix(uBackgroundColor, glyphs, clamp(max(max(r,g),b) * 3.0,0.0,1.0)), tile);
  if (uOutlineWidth > 0.0 && uOutlineStrength > 0.0) {
    // Material transition at the INSIDE of the bevel, not a painted line.
    // Modulate existing glyph light so empty/dark areas never grow a wireframe.
    float faceEdge = seam + rim;
    float halfWidth = uOutlineWidth * pixelToTile * 0.5;
    float transitionWidth = max(halfWidth + aa, aa * 2.0);
    float lip = exp(-2.0 * pow((nearest - faceEdge) / transitionWidth, 2.0));
    float shadow = exp(-2.0 * pow((nearest - (faceEdge - halfWidth * 1.5)) / transitionWidth, 2.0));
    float facing = max(dot(normalize(gradient), normalize(light.xy)), 0.0);
    color *= 1.0 - shadow * uOutlineStrength * tile * 0.22;
    color *= 1.0 + lip * uOutlineStrength * tile * (facing * 0.28 - 0.08);
  }
  outColor = vec4(clamp(color, 0.0, 1.0), uOpacity);
}
`;var le=Object.freeze({speed:1,glyphSize:8,tileDensity:3.3,tileShear:-.22,tileGap:12,outlineWidth:1.25,outlineStrength:.45,bevelWidth:.02,bevelSoftness:.1,refractionStrength:100,chromaticSpread:.2,specularExponent:150,specularStrength:1,patternFreqX:6,patternFreqY:4,patternFreqXY:10,glyphColor:"#ffffff",recessColor:"#000000",backgroundColor:"#000000",opacity:1,dpr:1.5,cursorInteraction:!0,cursorRadius:160,cursorIntensity:1,cursorRecovery:1.8,waveSpeed:5.5,waveHeight:36,clickStrength:1.5}),ce=Object.freeze({speed:[0,3,.01],glyphSize:[4,24,1],tileDensity:[1,12,.1],tileShear:[-.5,.5,.01],bevelWidth:[0,.5,.005],tileGap:[0,40,.5],outlineWidth:[0,6,.25],outlineStrength:[0,1,.01],bevelSoftness:[.01,.4,.005],refractionStrength:[0,120,1],chromaticSpread:[0,1,.01],specularExponent:[1,256,1],specularStrength:[0,3,.01],patternFreqX:[0,20,.1],patternFreqY:[0,20,.1],patternFreqXY:[0,20,.1],opacity:[0,1,.01],dpr:[1,3,.1],cursorRadius:[20,400,1],cursorIntensity:[0,3,.01],cursorRecovery:[.4,4,.05],waveSpeed:[1,12,.1],waveHeight:[0,80,1],clickStrength:[0,3,.01]});function O(e={}){let n={...le};for(let o of Object.keys(ce)){let[r,i]=ce[o],s=e[o];typeof s=="number"&&Number.isFinite(s)&&(n[o]=Math.min(i,Math.max(r,s)))}for(let o of["glyphColor","recessColor","backgroundColor"])typeof e[o]=="string"&&/^#[\da-f]{6}$/i.test(e[o])&&(n[o]=e[o]);return typeof e.cursorInteraction=="boolean"&&(n.cursorInteraction=e.cursorInteraction),n}function _e(e){return[1,3,5].map(n=>parseInt(e.slice(n,n+2),16)/255)}function Ie(e,n,o,r,i,s){let d=Math.max(e,n,1),p=(i-e*.5)/d,g=(n*.5-s)/d;return[(p-r*g)*o+.42,(r*p+g)*o+.35]}function ue(e,n,o,r){let i=[[0,0],[e,0],[0,n],[e,n]].map(([f,t])=>Ie(e,n,o,r,f,t)),s=Math.floor(Math.min(...i.map(f=>f[0])))-2,d=Math.floor(Math.min(...i.map(f=>f[1])))-2,p=Math.floor(Math.max(...i.map(f=>f[0])))+3-s,g=Math.floor(Math.max(...i.map(f=>f[1])))+3-d,v=p*g;return{width:e,height:n,density:o,shear:r,columns:p,rows:g,originX:s,originY:d,layoutKey:`${e}:${n}:${o}:${r}`,heights:new Float32Array(v),velocities:new Float32Array(v),accelerations:new Float32Array(v),data:new Float32Array(v*4),active:!1,dirty:!0,quietFor:0}}function P(e){e.heights.fill(0),e.velocities.fill(0),e.data.fill(0),e.active=!1,e.dirty=!0,e.quietFor=0}function de(e,n,o,r,i){if(!Number.isFinite(r)||r===0)return;let[s,d]=Ie(e.width,e.height,e.density,e.shear,n,o),p=Math.max(e.width,e.height)/(e.density*Math.sqrt(1+e.shear*e.shear)),g=Math.max(.42,i/p),v=s-(Math.floor(s)+.5),f=d-(Math.floor(d)+.5),t=v*v+f*f;for(let c=0;c<e.rows;c++)for(let m=0;m<e.columns;m++){let E=e.originX+m+.5-s,x=e.originY+c+.5-d,b=E*E+x*x;if(b>g*g*9)continue;let C=Math.exp(-(b-t)/(2*g*g)),A=c*e.columns+m;e.velocities[A]=Math.max(-36,Math.min(36,e.velocities[A]+r*C))}e.active=!0,e.quietFor=0}function Me(e,n,o,r,i,s,d,p){let g=Math.hypot(r-n,i-o);if(g<.5||p<=0)return;let v=g/Math.max(s,.004),f=.7+Math.min(2,v/1e3),t=Math.max(e.width,e.height)/e.density,c=Math.min(64,Math.max(1,Math.ceil(g/Math.min(24,t*.22)))),m=-Math.min(g,120)*.08*p*f/c;for(let E=1;E<=c;E++){let x=E/c;de(e,n+(r-n)*x,o+(i-o)*x,m,d)}}function L(e,n,o){return n<0||n>=e.columns||o<0||o>=e.rows?0:e.heights[o*e.columns+n]}function pe(e){for(let n=0;n<e.rows;n++)for(let o=0;o<e.columns;o++){let r=n*e.columns+o;e.data[r*4]=e.heights[r],e.data[r*4+1]=(L(e,o+1,n)-L(e,o-1,n))*.5,e.data[r*4+2]=(L(e,o,n+1)-L(e,o,n-1))*.5,e.data[r*4+3]=e.velocities[r]}e.dirty=!0}function Fe(e,n,o,r){if(!e.active||n<=0)return;if(e.quietFor+=n,e.quietFor>=r){P(e);return}let i=Math.min(n,.05),s=Math.ceil(i*120),d=i/s,p=o*o,g=12/Math.max(r,.4);for(let t=0;t<s;t++){for(let c=0;c<e.rows;c++)for(let m=0;m<e.columns;m++){let E=c*e.columns+m,x=e.heights[E],b=L(e,m-1,c)+L(e,m+1,c)+L(e,m,c-1)+L(e,m,c+1)-x*4,C=m<2||c<2||m>=e.columns-2||c>=e.rows-2?1.6:1;e.accelerations[E]=p*b-36*x-g*C*e.velocities[E]}for(let c=0;c<e.heights.length;c++)e.velocities[c]+=e.accelerations[c]*d,e.heights[c]+=e.velocities[c]*d}let v=0,f=0;for(let t=0;t<e.heights.length;t++)v=Math.max(v,Math.abs(e.heights[t])),f=Math.max(f,Math.abs(e.velocities[t]));v<2e-4&&f<.002?P(e):pe(e)}var Xe=/(token|cookie|password|secret|credential|authorization|apikey)/i,Be=/^(content|text|body|prompt|messages|title|filename|name|raw|data|database64|commandline|sessionid|accountid|threadid|projectid)$|(?:path|url|uri)$/i;function D(e){return e.slice(0,8e3).replace(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>]+/g,o=>{try{let r=new URL(o);if(["127.0.0.1","localhost","[::1]"].includes(r.hostname)&&!r.username&&!r.password&&["/json/version","/json/list","/"].includes(r.pathname))return`${r.origin}${r.pathname}`}catch{}return"[url]"}).replace(/(?:\b[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|etc|opt|mnt)\/|~\/)[^\r\n"'<>]*/g,"[path]").replace(/\b(?:Bearer\s+\S+|(?:authorization|password|secret|(?:access[_-]?|refresh[_-]?)?token|api[_-]?key|cookie)\s*[:=]\s*[^,;\r\n]+)/gi,"[credential]").replace(/\bsk-[A-Za-z0-9_-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[credential]").replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,"[email]").slice(0,4e3)+(e.length>8e3?" [truncated]":"")}function Le(e){let n=256,o=new WeakSet,r=(i,s)=>{if(--n<0||s>6)return"[truncated]";if(typeof i=="string")return D(i);if(i===null||typeof i=="boolean"||typeof i=="number")return i;if(typeof i!="object")return"[unsupported]";if(o.has(i))return"[circular]";if(o.add(i),i instanceof Error)return{name:D(i.name),message:D(i.message)};if(Array.isArray(i))return i.slice(0,128).map(p=>r(p,s+1));let d=Object.create(null);for(let[p,g]of Object.entries(i).slice(0,128)){let v=p.replace(/[^a-z0-9]/gi,"");d[D(p).slice(0,160)]=Xe.test(v)||Be.test(v)?"[redacted]":r(g,s+1)}return d};try{return r(e,0)}catch{return{redactionFailed:!0}}}var Ne=Symbol.for("code-codex:runtime-events:v1"),qe=window,j=qe[Ne]??={events:[],dropped:0};function z(e,n,o,r={}){let i={source:D(e).slice(0,160),action:D(n).slice(0,160),outcome:D(o).slice(0,160),details:{...Le(r),observedAt:Date.now(),documentElapsedMs:Math.round(performance.now())}},s=new TextEncoder().encode(JSON.stringify(i)).length;s>7e3&&(i.details={truncated:!0,originalBytes:s,observedAt:Date.now(),documentElapsedMs:Math.round(performance.now())}),j.events.push(i),j.events.length>1e3&&(j.events.splice(0,200),j.dropped+=200)}var Ye=Symbol.for("code-codex:background-startup-hold:v1");function fe(){let e=window;return e[Ye]??={active:!1,layers:new Set,next:-1,pending:new Map,painted:new WeakSet,openings:new WeakMap}}function He(e){return e.closest("[data-code-codex-particle-layer]")}function Ve(e,n){n.native=requestAnimationFrame(o=>{let r=fe();n.native=void 0,r.pending.has(e)&&(r.active&&r.painted.has(n.layer)||(r.pending.delete(e),r.active&&(r.painted.add(n.layer),r.layers.add(n.layer),z("background-opening","initial frame","prepared")),n.callback(o)))})}function De(e,n){let o=He(e);if(!o)return requestAnimationFrame(n);let r=fe(),i=r.next--,s={layer:o,callback:n};return r.pending.set(i,s),Ve(i,s),i}function Ce(e){if(e>=0){cancelAnimationFrame(e);return}let n=fe(),o=n.pending.get(e);o?.native!==void 0&&cancelAnimationFrame(o.native),n.pending.delete(e)}var $e=`#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;function je(){let e=document.createElement("canvas");e.width=480,e.height=48;let n=e.getContext("2d");if(!n)throw new Error("Cannot create the ASCII glyph atlas.");return n.fillStyle="black",n.fillRect(0,0,e.width,e.height),n.fillStyle="white",[[0,0,0,0,0],[0,0,0,0,4],[0,4,0,4,0],[0,0,14,0,0],[0,14,0,14,0],[4,4,31,4,4],[21,14,31,14,21],[10,31,10,31,10],[25,26,4,11,19],[31,17,29,21,31]].forEach((r,i)=>r.forEach((s,d)=>{for(let p=0;p<5;p++)s&1<<4-p&&n.fillRect(i*48+4+p*8,4+d*8,8,8)})),e}function We(e,n,o){let r=e.createShader(n);if(!r)throw new Error("Cannot create shader.");if(e.shaderSource(r,o),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS)){let i=e.getShaderInfoLog(r);throw e.deleteShader(r),new Error(i||"Shader compilation failed.")}return r}var X=class{constructor(n,o,r,i=()=>{}){let s={current:r},d={current:null},p=null,g=!0,v=f=>{f&&g&&(p=f),g||i(f??void 0)};this.dispose=(()=>{let f=o.getContext("webgl2",{alpha:!0,antialias:!1,premultipliedAlpha:!1,depth:!1,stencil:!1});if(!f){let l="WebGL 2 不可用，请开启浏览器硬件加速 / Enable browser hardware acceleration.";throw new Error("ASCII_WEBGL_UNAVAILABLE: WebGL 2 is required. Enable hardware acceleration and retry.")}let t=f,c=null,m=null,E=null,x=null,b=0,C=!1,A=!1,Z=!document.hidden,J=!0,W=1,F=1,T=n.getBoundingClientRect(),me=0,_=0,B=-1e3,N=-1e3,q=!1,a=O(s.current),u=ue(1,1,a.tileDensity,a.tileShear),R=null,Q=0,w={},I=window.matchMedia("(prefers-reduced-motion: reduce)"),Ue=l=>{let h=l instanceof Error?l.message:String(l);v(h),s.current.onError?.(h)},ee=()=>{c&&t.deleteProgram(c),m&&t.deleteTexture(m),E&&t.deleteTexture(E),x&&t.deleteVertexArray(x),c=null,m=null,E=null,x=null};function k(){!b&&!C&&!A&&Z&&J&&c&&(b=De(n,Oe))}let he=()=>{if(a=O(s.current),(!a.cursorInteraction||I.matches)&&u.active&&P(u),!c||A)return;t.useProgram(c);let l={uGlyphSize:a.glyphSize,uTileDensity:a.tileDensity,uTileShear:a.tileShear,uBevelWidth:a.bevelWidth,uTileGap:a.tileGap,uOutlineWidth:a.outlineWidth,uOutlineStrength:a.outlineStrength,uBevelSoftness:a.bevelSoftness,uRefraction:a.refractionStrength,uChromatic:a.chromaticSpread,uSpecularExp:a.specularExponent,uSpecularStrength:a.specularStrength,uRadius:a.cursorRadius,uIntensity:a.cursorIntensity,uOpacity:a.opacity,uWaveHeight:a.waveHeight};for(let[h,y]of Object.entries(l))t.uniform1f(w[h],y);t.uniform3f(w.uFrequency,a.patternFreqX,a.patternFreqY,a.patternFreqXY);for(let[h,y]of[["uGlyphColor",a.glyphColor],["uRecessColor",a.recessColor],["uBackgroundColor",a.backgroundColor]]){let[M,H,S]=_e(y);t.uniform3f(w[h],M,H,S)}Y(),_=0,k()};function Y(){T=n.getBoundingClientRect(),W=Math.max(1,T.width),F=Math.max(1,T.height);let l=t.getParameter(t.MAX_RENDERBUFFER_SIZE),h=Math.min(window.devicePixelRatio||1,a.dpr,l/W,l/F),y=Math.max(1,Math.round(W*h)),M=Math.max(1,Math.round(F*h));if((o.width!==y||o.height!==M)&&(o.width=y,o.height=M),t.viewport(0,0,y,M),c){t.useProgram(c),t.uniform2f(w.uResolution,W,F);let H=`${W}:${F}:${a.tileDensity}:${a.tileShear}`;if(u.layoutKey!==H){let S=u;if(u=ue(W,F,a.tileDensity,a.tileShear),S.active&&S.density===u.density&&S.shear===u.shear){for(let V=0;V<u.rows;V++)for(let $=0;$<u.columns;$++){let ie=$+u.originX-S.originX,ae=V+u.originY-S.originY;if(ie>=0&&ae>=0&&ie<S.columns&&ae<S.rows){let ke=V*u.columns+$,Ae=ae*S.columns+ie;u.heights[ke]=S.heights[Ae],u.velocities[ke]=S.velocities[Ae]}}u.active=!0,u.quietFor=S.quietFor,pe(u)}t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,E),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,u.columns,u.rows,0,t.RGBA,t.FLOAT,u.data),u.dirty=!1}t.uniform2i(w.uWaveOrigin,u.originX,u.originY)}k()}function Oe(l){if(b=0,C||A||!Z||!J||!c)return;let h=!s.current.paused&&a.speed>0&&!I.matches,y=_?Math.min((l-_)/1e3,.05):1/60;a.cursorInteraction&&!I.matches&&Fe(u,y,a.waveSpeed,a.cursorRecovery),h&&_&&(me+=Math.min((l-_)/1e3,.05)*a.speed),_=l,t.useProgram(c),t.bindVertexArray(x),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,m),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,E),u.dirty&&(t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1),t.texSubImage2D(t.TEXTURE_2D,0,0,0,u.columns,u.rows,t.RGBA,t.FLOAT,u.data),u.dirty=!1),t.uniform1f(w.uTime,me),t.uniform2f(w.uPointer,B,N),t.uniform1f(w.uReducedHover,I.matches&&q&&a.cursorInteraction?1:0),t.drawArrays(t.TRIANGLES,0,3),(h||u.active)&&k()}let ge=()=>{let l=null,h=null;try{if(l=We(t,t.VERTEX_SHADER,$e),h=We(t,t.FRAGMENT_SHADER,se),c=t.createProgram(),!c)throw new Error("Cannot create shader program.");if(t.attachShader(c,l),t.attachShader(c,h),t.linkProgram(c),!t.getProgramParameter(c,t.LINK_STATUS))throw new Error(t.getProgramInfoLog(c)||"Shader linking failed.");w={};for(let y of se.matchAll(/\bu[A-Z]\w*/g))w[y[0]]=t.getUniformLocation(c,y[0]);if(x=t.createVertexArray(),t.activeTexture(t.TEXTURE0),m=t.createTexture(),E=t.createTexture(),!m||!E||!x)throw new Error("Cannot allocate WebGL resources.");t.bindTexture(t.TEXTURE_2D,m),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!0),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,je()),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.useProgram(c),t.uniform1i(w.uAtlas,0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,E),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,u.columns,u.rows,0,t.RGBA,t.FLOAT,u.data),t.uniform1i(w.uWaveGrid,1),v(null),he()}catch(y){ee(),Ue(y)}finally{l&&t.deleteShader(l),h&&t.deleteShader(h)}},G=()=>{Ce(b),b=0,_=0},te=()=>{R=null,u.active&&performance.now()/1e3-Q>=a.cursorRecovery&&P(u)},ve=()=>{Z=!document.hidden,te(),G(),k()},Ee=()=>{T=n.getBoundingClientRect()},ye=l=>{B=l.clientX-T.left,N=F-(l.clientY-T.top),q=B>=0&&B<=W&&N>=0&&N<=F},ne=l=>{ye(l),R={x:l.clientX-T.left,y:l.clientY-T.top,time:performance.now()/1e3},a.cursorInteraction&&k()},xe=l=>{ye(l);let h=performance.now()/1e3,y=l.clientX-T.left,M=l.clientY-T.top;a.cursorInteraction&&!I.matches&&q&&R&&Math.hypot(y-R.x,M-R.y)>=.5&&a.cursorIntensity>0&&(u.active||(_=0),Me(u,R.x,R.y,y,M,h-R.time,a.cursorRadius,a.cursorIntensity),Q=h),R={x:y,y:M,time:h},a.cursorInteraction&&k()},U=()=>{q=!1,R=null,k()},we=l=>{l.button!==0||l.composedPath().some(h=>h instanceof Element&&h.matches("button,input,select,a,textarea,[contenteditable=true],[role=dialog]"))||(ne(l),a.cursorInteraction&&!I.matches&&a.clickStrength>0&&(u.active||(_=0),de(u,l.clientX-T.left,l.clientY-T.top,-14*a.clickStrength,a.cursorRadius),Q=performance.now()/1e3,k()))},Se=l=>{l.pointerType==="touch"&&U()},Te=l=>{l.preventDefault(),A=!0,G(),c=null,m=null,E=null,x=null,w={},v("ASCII_CONTEXT_LOST: Waiting for graphics context restoration.")},be=()=>{A=!1,te(),ge()},Re=()=>{I.matches&&P(u),G(),k()},re=new ResizeObserver(()=>{A||Y()}),oe=new IntersectionObserver(([l])=>{J=l.isIntersecting,te(),G(),k()});if(ge(),p)throw re.disconnect(),oe.disconnect(),ee(),new Error(p);return re.observe(n),oe.observe(n),d.current=he,window.addEventListener("pointermove",xe),window.addEventListener("pointerenter",ne),window.addEventListener("pointerdown",we),window.addEventListener("pointerleave",U),window.addEventListener("pointercancel",U),window.addEventListener("pointerup",Se),document.addEventListener("visibilitychange",ve),window.addEventListener("scroll",Ee,{passive:!0,capture:!0}),window.addEventListener("resize",Y),I.addEventListener("change",Re),o.addEventListener("webglcontextlost",Te),o.addEventListener("webglcontextrestored",be),()=>{C=!0,G(),d.current=null,re.disconnect(),oe.disconnect(),window.removeEventListener("pointermove",xe),window.removeEventListener("pointerenter",ne),window.removeEventListener("pointerdown",we),window.removeEventListener("pointerleave",U),window.removeEventListener("pointercancel",U),window.removeEventListener("pointerup",Se),document.removeEventListener("visibilitychange",ve),window.removeEventListener("scroll",Ee,!0),window.removeEventListener("resize",Y),I.removeEventListener("change",Re),o.removeEventListener("webglcontextlost",Te),o.removeEventListener("webglcontextrestored",be),ee()}})(),g=!1,this.setSettings=f=>{s.current=f,d.current?.()},this.replay=()=>d.current?.(),this.ready=Promise.resolve()}};function Ke(e){try{let n=[],o=new Set,r=e;for(;r!=null&&n.length<8&&!o.has(r);)if(o.add(r),r instanceof Error)n.push(`${r.name}: ${r.message}`),r=r.cause;else{n.push(typeof r=="string"?r:"Non-Error rejection");break}let i=e&&typeof e=="object"&&"code"in e?e.code:void 0,s={errorChain:n,...typeof i=="string"||typeof i=="number"?{errorCode:typeof i=="string"?i.slice(0,160):i}:{},...e instanceof Error&&e.stack?{exceptionStack:e.stack.slice(0,3e3)}:{},chainTruncated:r!=null&&n.length>=8},d=new TextEncoder().encode(JSON.stringify(s)).length;return d>5800&&(s.errorChain=n.map(p=>p.slice(0,80)),typeof s.exceptionStack=="string"&&(s.exceptionStack=s.exceptionStack.slice(0,200)),s.detailsTruncated=!0,s.originalDetailBytes=d),s}catch{return{errorChain:["Exception details could not be inspected safely."]}}}var K=new Map;function Pe(e,n){try{let o=performance.now(),r=K.has(e)||K.size<256?e:"other handlers",i=K.get(r);if(i||(i={start:o,count:0,suppressed:0},K.set(r,i)),o-i.start>1e4&&(i.suppressed&&z("handled-exception",r,"throttled",{suppressedCount:i.suppressed}),i.start=o,i.count=0,i.suppressed=0),++i.count>3){i.suppressed++;return}let s=Ke(n),d=(n instanceof Error||n instanceof DOMException)&&n.name==="AbortError";z("handled-exception",r,d?"cancelled":"failed",{...s,recovery:"Existing handler continues; recording does not retry, reset settings or prove recovery succeeded."})}catch{}}var Ze="code-codex:ascii-tiles-background:v1",Je={...le,paused:!1};function Qe(e){let n=e&&typeof e=="object"?e:{};return{...O(n),paused:n.paused===!0}}function Ge(){try{return Qe(JSON.parse(localStorage.getItem(Ze)??"{}"))}catch(e){return Pe("ASCII settings read",e),{...Je}}}var et=Symbol.for("code-codex:background-modules:v1");(window[et]??=new Map).set("ascii-tiles",{id:"ascii-tiles",api:1,version:"1.0.0",exports:{AsciiTilesRenderer:X},startup(e,n){let o=document.createElement("canvas");return o.style.cssText="width:100%;height:100%;display:block",e.append(o),new X(e,o,Ge(),n)}});})();
