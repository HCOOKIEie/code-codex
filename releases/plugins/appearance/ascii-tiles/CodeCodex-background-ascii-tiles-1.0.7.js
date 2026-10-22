(()=>{var le=`#version 300 es
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
uniform float uIntroProgress, uIntroStrength;
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
  // Subpixel spring tails must not shimmer the distant character grid. Keep
  // the physical spring state continuous; fade only its rendered displacement.
  wave *= smoothstep(0.04, 0.12, abs(wave.x));
  vec2 restQ = fract(latticePoint);
  vec2 restDistances = 0.5 - abs(restQ - 0.5);
  float restNearest = min(restDistances.x, restDistances.y);
  // Keep gaps and outlines in CSS pixels, even when density, shear or DPR changes.
  float pixelToTile = uTileDensity * sqrt(1.0 + uTileShear * uTileShear) / edge;
  // Very dense grids must still leave some visible glass instead of overlapping.
  float seam = min(uTileGap * 0.5 * pixelToTile, 0.44);
  float aa = max(fwidth(restNearest) * 0.5, 0.00001);
  float rim = max(min(uBevelWidth + uBevelSoftness * 0.25, 0.48 - seam), 0.001);
  // The frame has ONE stationary bevel/outline, not a second shifted wire grid.
  // The face inside it retains the original spring-driven press and rebound.
  float tile = uTileGap > 0.0 ? smoothstep(seam - aa, seam + aa, restNearest) : 1.0;
  vec2 q = restQ;
  vec2 signedEdge = q - 0.5;
  vec2 distances = 0.5 - abs(signedEdge);
  float nearest = min(distances.x, distances.y);
  float slope = 1.0 - smoothstep(seam, seam + rim, nearest);
  vec2 gradient = distances.x < distances.y ? vec2(sign(signedEdge.x), 0.0) : vec2(0.0, sign(signedEdge.y));
  gradient = transpose(lattice) * gradient;
  vec2 offset = gradient * slope * uRefraction;
  float pitch = 1.0 / pixelToTile;
  vec2 centerGrid = (vec2(brickID) + 0.5 - vec2(0.42, 0.35)) / uTileDensity;
  vec2 centerPixel = uResolution * 0.5 + inverse(lattice) * centerGrid * edge;
  float entrance = 1.0;
  float entranceLift = 0.0;
  float entranceLight = 0.0;
  if (uIntroProgress < 1.0) {
    // Tile-sized phases: a diagonal cascade with small, stable timing offsets.
    float seed = fract(sin(dot(vec2(brickID), vec2(127.1, 311.7))) * 43758.5453);
    float order = dot(clamp(centerPixel / uResolution, 0.0, 1.0), vec2(0.48, 0.52));
    float delay = order * 0.46 + seed * 0.12;
    float local = clamp((uIntroProgress - delay) / 0.42, 0.0, 1.0);
    entrance = smoothstep(0.0, 0.36, local);
    float settle = (1.0 - local) * (1.0 - local);
    entranceLift = cos(local * 8.0) * settle * min(pitch * 0.22, 80.0) * uIntroStrength;
    entranceLight = sin(local * 3.14159265) * settle * uIntroStrength;
  }
  float lift = clamp(wave.x, -1.5, 1.5) * min(uWaveHeight, pitch * 0.12);
  lift += entranceLift;
  float faceBlend = smoothstep(seam, seam + rim * 0.8, restNearest);
  vec2 faceShift = vec2(0.22, 0.7) * lift;
  float faceScale = clamp(1.0 + lift / pitch * 0.65, 0.85, 1.15);
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
  float energy = clamp((abs(wave.x) + abs(wave.w) * 0.02) * uWaveHeight / 36.0, 0.0, 0.35);
  // Reduced motion retains a static material cue instead of a moving wave.
  energy += uReducedHover * uIntensity * 0.18 * (1.0 - smoothstep(0.0, uRadius, length(pixel - uPointer)));
  // Geometric pressing supplies interaction; never add a dark cursor veil.
  glyphs *= 1.0 + energy * slope * 0.12;
  glyphs *= 1.0 + entranceLight * (0.4 + slope * 0.8);
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
  color = mix(uBackgroundColor, color, entrance);
  outColor = vec4(clamp(color, 0.0, 1.0), uOpacity);
}
`;var de=Object.freeze({speed:.87,glyphSize:9,tileDensity:6.7,tileShear:-.31,tileGap:18.5,outlineWidth:1.25,outlineStrength:.6,bevelWidth:.13,bevelSoftness:.1,refractionStrength:46,chromaticSpread:.66,specularExponent:256,specularStrength:1,patternFreqX:9.4,patternFreqY:4,patternFreqXY:10,glyphColor:"#ffffff",recessColor:"#000000",backgroundColor:"#000000",opacity:.6,dpr:1.5,cursorInteraction:!0,cursorRadius:110,cursorIntensity:1,cursorRecovery:.95,waveSpeed:5.5,waveHeight:36,clickStrength:1.5}),ue=Object.freeze({speed:[0,3,.01],glyphSize:[4,24,1],tileDensity:[1,12,.1],tileShear:[-.5,.5,.01],bevelWidth:[0,.5,.005],tileGap:[0,40,.5],outlineWidth:[0,6,.25],outlineStrength:[0,1,.01],bevelSoftness:[.01,.4,.005],refractionStrength:[0,120,1],chromaticSpread:[0,1,.01],specularExponent:[1,256,1],specularStrength:[0,3,.01],patternFreqX:[0,20,.1],patternFreqY:[0,20,.1],patternFreqXY:[0,20,.1],opacity:[0,1,.01],dpr:[1,3,.1],cursorRadius:[20,400,1],cursorIntensity:[0,3,.01],cursorRecovery:[.4,4,.05],waveSpeed:[1,12,.1],waveHeight:[0,80,1],clickStrength:[0,3,.01]});function B(e={}){let n={...de};for(let o of Object.keys(ue)){let[r,i]=ue[o],s=e[o];typeof s=="number"&&Number.isFinite(s)&&(n[o]=Math.min(i,Math.max(r,s)))}for(let o of["glyphColor","recessColor","backgroundColor"])typeof e[o]=="string"&&/^#[\da-f]{6}$/i.test(e[o])&&(n[o]=e[o]);return typeof e.cursorInteraction=="boolean"&&(n.cursorInteraction=e.cursorInteraction),n}function Le(e){return[1,3,5].map(n=>parseInt(e.slice(n,n+2),16)/255)}function Me(e,n,o,r,i,s){let p=Math.max(e,n,1),d=(i-e*.5)/p,h=(n*.5-s)/p;return[(d-r*h)*o+.42,(r*d+h)*o+.35]}function pe(e,n,o,r){let i=[[0,0],[e,0],[0,n],[e,n]].map(([f,g])=>Me(e,n,o,r,f,g)),s=Math.floor(Math.min(...i.map(f=>f[0])))-2,p=Math.floor(Math.min(...i.map(f=>f[1])))-2,d=Math.floor(Math.max(...i.map(f=>f[0])))+3-s,h=Math.floor(Math.max(...i.map(f=>f[1])))+3-p,v=d*h;return{width:e,height:n,density:o,shear:r,columns:d,rows:h,originX:s,originY:p,layoutKey:`${e}:${n}:${o}:${r}`,heights:new Float32Array(v),velocities:new Float32Array(v),accelerations:new Float32Array(v),data:new Float32Array(v*4),active:!1,dirty:!0,quietFor:0}}function U(e){e.heights.fill(0),e.velocities.fill(0),e.data.fill(0),e.active=!1,e.dirty=!0,e.quietFor=0}function fe(e,n,o,r,i){if(!Number.isFinite(r)||r===0)return;let[s,p]=Me(e.width,e.height,e.density,e.shear,n,o),d=Math.max(e.width,e.height)/(e.density*Math.sqrt(1+e.shear*e.shear)),h=Math.max(1e-4,i/(3*d));for(let v=0;v<e.rows;v++)for(let f=0;f<e.columns;f++){let g=Math.max(Math.abs(e.originX+f+.5-s)-.5,0),t=Math.max(Math.abs(e.originY+v+.5-p)-.5,0),u=g*g+t*t;if(u>h*h*9)continue;let x=Math.exp(-u/(2*h*h)),E=v*e.columns+f;e.velocities[E]=Math.max(-36,Math.min(36,e.velocities[E]+r*x))}e.active=!0,e.quietFor=0}function Pe(e,n,o,r,i,s,p,d){let h=Math.hypot(r-n,i-o);if(h<.5||d<=0)return;let v=h/Math.max(s,.004),f=.7+Math.min(2,v/1e3),g=Math.max(e.width,e.height)/e.density,t=Math.min(64,Math.max(1,Math.ceil(h/Math.min(24,g*.22)))),u=-Math.min(h,120)*.08*d*f/t;for(let x=1;x<=t;x++){let E=x/t;fe(e,n+(r-n)*E,o+(i-o)*E,u,p)}}function P(e,n,o){return n<0||n>=e.columns||o<0||o>=e.rows?0:e.heights[o*e.columns+n]}function me(e){for(let n=0;n<e.rows;n++)for(let o=0;o<e.columns;o++){let r=n*e.columns+o;e.data[r*4]=e.heights[r],e.data[r*4+1]=(P(e,o+1,n)-P(e,o-1,n))*.5,e.data[r*4+2]=(P(e,o,n+1)-P(e,o,n-1))*.5,e.data[r*4+3]=e.velocities[r]}e.dirty=!0}function De(e,n,o,r){if(!e.active||n<=0)return;if(e.quietFor+=n,e.quietFor>=r){U(e);return}let i=Math.min(n,.05),s=Math.ceil(i*120),p=i/s,d=o*o,h=12/Math.max(r,.4);for(let g=0;g<s;g++){for(let t=0;t<e.rows;t++)for(let u=0;u<e.columns;u++){let x=t*e.columns+u,E=e.heights[x],_=P(e,u-1,t)+P(e,u+1,t)+P(e,u,t-1)+P(e,u,t+1)-E*4,C=u<2||t<2||u>=e.columns-2||t>=e.rows-2?1.6:1;e.accelerations[x]=d*_-36*E-h*C*e.velocities[x]}for(let t=0;t<e.heights.length;t++)e.velocities[t]+=e.accelerations[t]*p,e.heights[t]+=e.velocities[t]*p}let v=0,f=0;for(let g=0;g<e.heights.length;g++)v=Math.max(v,Math.abs(e.heights[g])),f=Math.max(f,Math.abs(e.velocities[g]));v<2e-4&&f<.002?U(e):me(e)}var Ne=/(token|cookie|password|secret|credential|authorization|apikey)/i,Ye=/^(content|text|body|prompt|messages|title|filename|name|raw|data|database64|commandline|sessionid|accountid|threadid|projectid)$|(?:path|url|uri)$/i;function D(e){return e.slice(0,8e3).replace(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>]+/g,o=>{try{let r=new URL(o);if(["127.0.0.1","localhost","[::1]"].includes(r.hostname)&&!r.username&&!r.password&&["/json/version","/json/list","/"].includes(r.pathname))return`${r.origin}${r.pathname}`}catch{}return"[url]"}).replace(/(?:\b[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|etc|opt|mnt)\/|~\/)[^\r\n"'<>]*/g,"[path]").replace(/\b(?:Bearer\s+\S+|(?:authorization|password|secret|(?:access[_-]?|refresh[_-]?)?token|api[_-]?key|cookie)\s*[:=]\s*[^,;\r\n]+)/gi,"[credential]").replace(/\bsk-[A-Za-z0-9_-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[credential]").replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,"[email]").slice(0,4e3)+(e.length>8e3?" [truncated]":"")}function Ce(e){let n=256,o=new WeakSet,r=(i,s)=>{if(--n<0||s>6)return"[truncated]";if(typeof i=="string")return D(i);if(i===null||typeof i=="boolean"||typeof i=="number")return i;if(typeof i!="object")return"[unsupported]";if(o.has(i))return"[circular]";if(o.add(i),i instanceof Error)return{name:D(i.name),message:D(i.message)};if(Array.isArray(i))return i.slice(0,128).map(d=>r(d,s+1));let p=Object.create(null);for(let[d,h]of Object.entries(i).slice(0,128)){let v=d.replace(/[^a-z0-9]/gi,"");p[D(d).slice(0,160)]=Ne.test(v)||Ye.test(v)?"[redacted]":r(h,s+1)}return p};try{return r(e,0)}catch{return{redactionFailed:!0}}}var He=Symbol.for("code-codex:runtime-events:v1"),Ve=window,K=Ve[He]??={events:[],dropped:0};function q(e,n,o,r={}){let i={source:D(e).slice(0,160),action:D(n).slice(0,160),outcome:D(o).slice(0,160),details:{...Ce(r),observedAt:Date.now(),documentElapsedMs:Math.round(performance.now())}},s=new TextEncoder().encode(JSON.stringify(i)).length;s>7e3&&(i.details={truncated:!0,originalBytes:s,observedAt:Date.now(),documentElapsedMs:Math.round(performance.now())}),K.events.push(i),K.events.length>1e3&&(K.events.splice(0,200),K.dropped+=200)}var $e=Symbol.for("code-codex:background-startup-hold:v1");function he(){let e=window;return e[$e]??={active:!1,layers:new Set,next:-1,pending:new Map,painted:new WeakSet,openings:new WeakMap}}function je(e){return e.closest("[data-code-codex-particle-layer]")}function Ke(e,n){n.native=requestAnimationFrame(o=>{let r=he();n.native=void 0,r.pending.has(e)&&(r.active&&r.painted.has(n.layer)||(r.pending.delete(e),r.active&&(r.painted.add(n.layer),r.layers.add(n.layer),q("background-opening","initial frame","prepared")),n.callback(o)))})}function We(e,n){let o=je(e);if(!o)return requestAnimationFrame(n);let r=he(),i=r.next--,s={layer:o,callback:n};return r.pending.set(i,s),Ke(i,s),i}function Fe(e){if(e>=0){cancelAnimationFrame(e);return}let n=he(),o=n.pending.get(e);o?.native!==void 0&&cancelAnimationFrame(o.native),n.pending.delete(e)}var Ze=`#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;function Je(){let e=document.createElement("canvas");e.width=480,e.height=48;let n=e.getContext("2d");if(!n)throw new Error("Cannot create the ASCII glyph atlas.");return n.fillStyle="black",n.fillRect(0,0,e.width,e.height),n.fillStyle="white",[[0,0,0,0,0],[0,0,0,0,4],[0,4,0,4,0],[0,0,14,0,0],[0,14,0,14,0],[4,4,31,4,4],[21,14,31,14,21],[10,31,10,31,10],[25,26,4,11,19],[31,17,29,21,31]].forEach((r,i)=>r.forEach((s,p)=>{for(let d=0;d<5;d++)s&1<<4-d&&n.fillRect(i*48+4+d*8,4+p*8,8,8)})),e}function Ge(e,n,o){let r=e.createShader(n);if(!r)throw new Error("Cannot create shader.");if(e.shaderSource(r,o),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS)){let i=e.getShaderInfoLog(r);throw e.deleteShader(r),new Error(i||"Shader compilation failed.")}return r}var N=class{constructor(n,o,r,i=()=>{}){let s={current:r},p={current:null},d={current:null},h=null,v=!0,f=g=>{g&&v&&(h=g),v||i(g??void 0)};this.dispose=(()=>{let g=o.getContext("webgl2",{alpha:!0,antialias:!1,premultipliedAlpha:!1,depth:!1,stencil:!1});if(!g)throw new Error("ASCII_WEBGL_UNAVAILABLE: WebGL 2 is required. Enable hardware acceleration and retry.");let t=g,u=null,x=null,E=null,_=null,C=0,J=!1,G=!1,Q=!document.hidden,ee=!0,W=1,M=1,T=n.getBoundingClientRect(),ge=0,A=0,Y=-1e3,H=-1e3,O=!1,a=B(s.current),l=pe(1,1,a.tileDensity,a.tileShear),b=null,te=0,w={},R=window.matchMedia("(prefers-reduced-motion: reduce)"),I=R.matches?1:0,ze=2.4,Xe=c=>{let m=c instanceof Error?c.message:String(c);f(m),s.current.onError?.(m)},ne=()=>{u&&t.deleteProgram(u),x&&t.deleteTexture(x),E&&t.deleteTexture(E),_&&t.deleteVertexArray(_),u=null,x=null,E=null,_=null};function k(){!C&&!J&&!G&&Q&&ee&&u&&(C=We(n,Be))}let ve=()=>{if(a=B(s.current),(!a.cursorInteraction||R.matches)&&l.active&&U(l),!u||G)return;t.useProgram(u);let c={uGlyphSize:a.glyphSize,uTileDensity:a.tileDensity,uTileShear:a.tileShear,uBevelWidth:a.bevelWidth,uTileGap:a.tileGap,uOutlineWidth:a.outlineWidth,uOutlineStrength:a.outlineStrength,uBevelSoftness:a.bevelSoftness,uRefraction:a.refractionStrength,uChromatic:a.chromaticSpread,uSpecularExp:a.specularExponent,uSpecularStrength:a.specularStrength,uRadius:a.cursorRadius,uIntensity:a.cursorIntensity,uOpacity:a.opacity,uWaveHeight:a.waveHeight,uIntroStrength:1};for(let[m,y]of Object.entries(c))t.uniform1f(w[m],y);t.uniform3f(w.uFrequency,a.patternFreqX,a.patternFreqY,a.patternFreqXY);for(let[m,y]of[["uGlyphColor",a.glyphColor],["uRecessColor",a.recessColor],["uBackgroundColor",a.backgroundColor]]){let[L,F,S]=Le(y);t.uniform3f(w[m],L,F,S)}V(),A=0,k()};function V(){T=n.getBoundingClientRect(),W=Math.max(1,T.width),M=Math.max(1,T.height);let c=t.getParameter(t.MAX_RENDERBUFFER_SIZE),m=Math.min(window.devicePixelRatio||1,a.dpr,c/W,c/M),y=Math.max(1,Math.round(W*m)),L=Math.max(1,Math.round(M*m));if((o.width!==y||o.height!==L)&&(o.width=y,o.height=L),t.viewport(0,0,y,L),u){t.useProgram(u),t.uniform2f(w.uResolution,W,M);let F=`${W}:${M}:${a.tileDensity}:${a.tileShear}`;if(l.layoutKey!==F){let S=l;if(l=pe(W,M,a.tileDensity,a.tileShear),S.active&&S.density===l.density&&S.shear===l.shear){for(let $=0;$<l.rows;$++)for(let j=0;j<l.columns;j++){let se=j+l.originX-S.originX,ce=$+l.originY-S.originY;if(se>=0&&ce>=0&&se<S.columns&&ce<S.rows){let _e=$*l.columns+j,Ie=ce*S.columns+se;l.heights[_e]=S.heights[Ie],l.velocities[_e]=S.velocities[Ie]}}l.active=!0,l.quietFor=S.quietFor,me(l)}t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,E),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,l.columns,l.rows,0,t.RGBA,t.FLOAT,l.data),l.dirty=!1}t.uniform2i(w.uWaveOrigin,l.originX,l.originY)}k()}function Be(c){if(C=0,J||G||!Q||!ee||!u)return;let m=!s.current.paused&&a.speed>0&&!R.matches,y=A?Math.min((c-A)/1e3,.05):1/60;I<1&&(I=Math.min(1,I+y/ze)),a.cursorInteraction&&!R.matches&&De(l,y,a.waveSpeed,a.cursorRecovery),m&&A&&(ge+=Math.min((c-A)/1e3,.05)*a.speed),A=c,t.useProgram(u),t.bindVertexArray(_),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,x),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,E),l.dirty&&(t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1),t.texSubImage2D(t.TEXTURE_2D,0,0,0,l.columns,l.rows,t.RGBA,t.FLOAT,l.data),l.dirty=!1),t.uniform1f(w.uTime,ge),t.uniform1f(w.uIntroProgress,I),(I<1||o.dataset.introProgress!=="1.0000")&&(o.dataset.introProgress=I.toFixed(4)),t.uniform2f(w.uPointer,Y,H),t.uniform1f(w.uReducedHover,R.matches&&O&&a.cursorInteraction?1:0),t.drawArrays(t.TRIANGLES,0,3),(m||l.active||I<1)&&k()}let ye=()=>{let c=null,m=null;try{if(c=Ge(t,t.VERTEX_SHADER,Ze),m=Ge(t,t.FRAGMENT_SHADER,le),u=t.createProgram(),!u)throw new Error("Cannot create shader program.");if(t.attachShader(u,c),t.attachShader(u,m),t.linkProgram(u),!t.getProgramParameter(u,t.LINK_STATUS))throw new Error(t.getProgramInfoLog(u)||"Shader linking failed.");w={};for(let y of le.matchAll(/\bu[A-Z]\w*/g))w[y[0]]=t.getUniformLocation(u,y[0]);if(_=t.createVertexArray(),t.activeTexture(t.TEXTURE0),x=t.createTexture(),E=t.createTexture(),!x||!E||!_)throw new Error("Cannot allocate WebGL resources.");t.bindTexture(t.TEXTURE_2D,x),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!0),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,Je()),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.useProgram(u),t.uniform1i(w.uAtlas,0),t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,E),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1),t.texImage2D(t.TEXTURE_2D,0,t.RGBA32F,l.columns,l.rows,0,t.RGBA,t.FLOAT,l.data),t.uniform1i(w.uWaveGrid,1),f(null),ve()}catch(y){ne(),Xe(y)}finally{c&&t.deleteShader(c),m&&t.deleteShader(m)}},z=()=>{Fe(C),C=0,A=0},re=()=>{b=null,l.active&&performance.now()/1e3-te>=a.cursorRecovery&&U(l)},xe=()=>{Q=!document.hidden,re(),z(),k()},Ee=()=>{T=n.getBoundingClientRect()},we=c=>{Y=c.clientX-T.left,H=M-(c.clientY-T.top),O=Y>=0&&Y<=W&&H>=0&&H<=M},oe=c=>{we(c),b={x:c.clientX-T.left,y:c.clientY-T.top,time:performance.now()/1e3},a.cursorInteraction&&k()},Se=c=>{if(c.composedPath().some(F=>F instanceof Element&&F.matches("button,input,select,a,textarea,[contenteditable=true],[role=dialog],[role=menu],[role=slider]"))){b=null,O=!1;return}we(c);let m=performance.now()/1e3,y=c.clientX-T.left,L=c.clientY-T.top;a.cursorInteraction&&!R.matches&&O&&b&&Math.hypot(y-b.x,L-b.y)>=.5&&a.cursorIntensity>0&&(l.active||(A=0),Pe(l,b.x,b.y,y,L,m-b.time,a.cursorRadius,a.cursorIntensity),te=m),b={x:y,y:L,time:m},a.cursorInteraction&&k()},X=()=>{O=!1,b=null,k()},Te=c=>{c.button!==0||c.composedPath().some(m=>m instanceof Element&&m.matches("button,input,select,a,textarea,[contenteditable=true],[role=dialog]"))||(oe(c),a.cursorInteraction&&!R.matches&&a.clickStrength>0&&(l.active||(A=0),fe(l,c.clientX-T.left,c.clientY-T.top,-14*a.clickStrength,a.cursorRadius),te=performance.now()/1e3,k()))},be=c=>{c.pointerType==="touch"&&X()},Re=c=>{c.preventDefault(),G=!0,z(),u=null,x=null,E=null,_=null,w={},f("ASCII_CONTEXT_LOST: Waiting for graphics context restoration.")},ke=()=>{G=!1,re(),ye()},Ae=()=>{R.matches&&(U(l),I=1),z(),k()},ie=new ResizeObserver(()=>{G||V()}),ae=new IntersectionObserver(([c])=>{ee=c.isIntersecting,re(),z(),k()});if(ye(),h)throw ie.disconnect(),ae.disconnect(),ne(),new Error(h);return ie.observe(n),ae.observe(n),p.current=ve,d.current=()=>{I=R.matches?1:0,A=0,k()},window.addEventListener("pointermove",Se),window.addEventListener("pointerenter",oe),window.addEventListener("pointerdown",Te),window.addEventListener("pointerleave",X),window.addEventListener("pointercancel",X),window.addEventListener("pointerup",be),document.addEventListener("visibilitychange",xe),window.addEventListener("scroll",Ee,{passive:!0,capture:!0}),window.addEventListener("resize",V),R.addEventListener("change",Ae),o.addEventListener("webglcontextlost",Re),o.addEventListener("webglcontextrestored",ke),()=>{J=!0,z(),p.current=null,d.current=null,ie.disconnect(),ae.disconnect(),window.removeEventListener("pointermove",Se),window.removeEventListener("pointerenter",oe),window.removeEventListener("pointerdown",Te),window.removeEventListener("pointerleave",X),window.removeEventListener("pointercancel",X),window.removeEventListener("pointerup",be),document.removeEventListener("visibilitychange",xe),window.removeEventListener("scroll",Ee,!0),window.removeEventListener("resize",V),R.removeEventListener("change",Ae),o.removeEventListener("webglcontextlost",Re),o.removeEventListener("webglcontextrestored",ke),ne()}})(),v=!1,this.setSettings=g=>{s.current=g,p.current?.()},this.replay=()=>d.current?.(),this.ready=Promise.resolve()}};function Qe(e){try{let n=[],o=new Set,r=e;for(;r!=null&&n.length<8&&!o.has(r);)if(o.add(r),r instanceof Error)n.push(`${r.name}: ${r.message}`),r=r.cause;else{n.push(typeof r=="string"?r:"Non-Error rejection");break}let i=e&&typeof e=="object"&&"code"in e?e.code:void 0,s={errorChain:n,...typeof i=="string"||typeof i=="number"?{errorCode:typeof i=="string"?i.slice(0,160):i}:{},...e instanceof Error&&e.stack?{exceptionStack:e.stack.slice(0,3e3)}:{},chainTruncated:r!=null&&n.length>=8},p=new TextEncoder().encode(JSON.stringify(s)).length;return p>5800&&(s.errorChain=n.map(d=>d.slice(0,80)),typeof s.exceptionStack=="string"&&(s.exceptionStack=s.exceptionStack.slice(0,200)),s.detailsTruncated=!0,s.originalDetailBytes=p),s}catch{return{errorChain:["Exception details could not be inspected safely."]}}}var Z=new Map;function Ue(e,n){try{let o=performance.now(),r=Z.has(e)||Z.size<256?e:"other handlers",i=Z.get(r);if(i||(i={start:o,count:0,suppressed:0},Z.set(r,i)),o-i.start>1e4&&(i.suppressed&&q("handled-exception",r,"throttled",{suppressedCount:i.suppressed}),i.start=o,i.count=0,i.suppressed=0),++i.count>3){i.suppressed++;return}let s=Qe(n),p=(n instanceof Error||n instanceof DOMException)&&n.name==="AbortError";q("handled-exception",r,p?"cancelled":"failed",{...s,recovery:"Existing handler continues; recording does not retry, reset settings or prove recovery succeeded."})}catch{}}var et="code-codex:ascii-tiles-background:v1",tt={...de,paused:!1};function nt(e){let n=e&&typeof e=="object"?e:{};return{...B(n),paused:n.paused===!0}}function Oe(){try{return nt(JSON.parse(localStorage.getItem(et)??"{}"))}catch(e){return Ue("ASCII settings read",e),{...tt}}}var rt=Symbol.for("code-codex:background-modules:v1");(window[rt]??=new Map).set("ascii-tiles",{id:"ascii-tiles",api:1,version:"1.0.7",exports:{AsciiTilesRenderer:N},startup(e,n){let o=document.createElement("canvas");return o.style.cssText="width:100%;height:100%;display:block",e.append(o),new N(e,o,Oe(),n)}});})();
