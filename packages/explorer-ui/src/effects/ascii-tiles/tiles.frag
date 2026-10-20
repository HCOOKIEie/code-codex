#version 300 es
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
