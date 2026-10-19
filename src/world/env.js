import * as THREE from 'three';

// Uniforms shared by every shader in the world, so the sky, the fog on the
// towers and the fog on the props are one colour and never disagree.
export const ENV = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.2, -0.9).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.6, 0.3) },
  uZenith: { value: new THREE.Color(0.1, 0.12, 0.3) },
  uHorizon: { value: new THREE.Color(1, 0.5, 0.3) },
  uGlow: { value: new THREE.Color(0.7, 0.35, 0.15) },
  uAmbient: { value: new THREE.Color(0.3, 0.3, 0.35) },
  uNight: { value: 0.5 },
  uFogDensity: { value: 0.00016 },
};

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uAmbient;
uniform float uNight;
uniform float uFogDensity;
uniform float uTime;

vec3 skyColor(vec3 d) {
  float h = d.y;
  float t = pow(1.0 - clamp(h, 0.0, 1.0), 4.0);
  vec3 col = mix(uZenith, uHorizon, t);
  // Below the horizon is the city's own haze, lit from underneath.
  float below = clamp(-h * 4.0, 0.0, 1.0);
  col = mix(col, mix(uHorizon, uGlow, 0.55 + 0.25 * uNight) * 0.72, below);
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 48.0) * 0.5) * (1.0 - uNight * 0.85);
  return col;
}

vec3 applyFog(vec3 col, vec3 wp) {
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-3);
  float low = exp(-max(wp.y, 0.0) / 140.0);
  float density = uFogDensity * (1.0 + 5.0 * low);
  float f = 1.0 - exp(-dist * density);
  vec3 fc = skyColor(dir);
  fc = mix(fc, uGlow * (0.38 + 0.2 * uNight), low * 0.7);
  return mix(col, fc, f);
}
`;

// Weathering for every solid surface, from its world position alone, so no
// prop needs UVs or a texture: plating seams in staggered rows, each plate a
// slightly different shade, grime in blotches and grain, rain streaks down the
// walls. Seams fade out with distance so they never shimmer.
export const DETAIL_GLSL = /* glsl */ `
float dHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float dNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1, 0, 0)), f.x), mix(dHash(i + vec3(0, 1, 0)), dHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0, 0, 1)), dHash(i + vec3(1, 0, 1)), f.x), mix(dHash(i + vec3(0, 1, 1)), dHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float surfaceDetail(vec3 wp, float k) {
  vec3 n = normalize(cross(dFdx(wp), dFdy(wp)));
  vec3 a = abs(n);
  vec2 uv = a.y > 0.6 ? wp.xz : (a.x > a.z ? wp.zy : wp.xy);
  vec2 pg = uv / vec2(1.8, 0.9);
  pg.x += floor(pg.y) * 0.5;
  vec2 pf = fract(pg);
  float seam = smoothstep(0.0, 0.025, pf.x) * smoothstep(0.0, 0.025, 1.0 - pf.x) * smoothstep(0.0, 0.05, pf.y) * smoothstep(0.0, 0.05, 1.0 - pf.y);
  float aa = clamp(1.4 - length(fwidth(pg)) * 3.0, 0.0, 1.0);
  seam = mix(1.0, seam, aa);
  float tone = (dHash(vec3(floor(pg), 7.0)) - 0.5) * 0.14 * aa;
  float grime = dNoise(wp * 0.3) * 0.65 + dNoise(wp * 2.3) * 0.35;
  float streak = a.y < 0.6 ? dNoise(vec3(uv.x * 2.5, wp.y * 0.06, 0.0)) : 0.4;
  float f = 1.02 + tone + (grime - 0.5) * 0.3 - streak * 0.12;
  f *= mix(0.62, 1.0, seam);
  return mix(1.0, f, k);
}
`;

// Make a built-in material use the world's fog instead of three's. detail:
// how strongly to weather it (0 for glass, glows and signs).
export function patchFog(material, detail = 0) {
  material.fog = false;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    for (const k in ENV) shader.uniforms[k] = ENV[k];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFogWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 fogWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fogWp = instanceMatrix * fogWp;
        #endif
        vFogWorld = (modelMatrix * fogWp).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFogWorld;\n' + SKY_GLSL + (detail ? DETAIL_GLSL : ''))
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = applyFog(gl_FragColor.rgb, vFogWorld);');
    if (detail) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n  diffuseColor.rgb *= surfaceDetail(vFogWorld, ${detail.toFixed(2)});`);
    }
  };
  material.customProgramCacheKey = () => (detail ? `worldfog-d${detail.toFixed(2)}` : 'worldfog');
  return material;
}

// Convenience constructors for prop materials.
// Solid materials are weathered unless opts.detail says otherwise.
export function stdMat(color, opts = {}) {
  const { detail = 1, ...rest } = opts;
  return patchFog(new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, ...rest }), detail);
}

// Lights and glowing trim. The city's light is mostly warm and practical, so
// every glow is pulled a third of the way toward warm white and dimmed: colour
// is an accent, not the whole look.
const WARM = new THREE.Color(1, 0.86, 0.68);
export function glowMat(color, intensity = 3) {
  const c = new THREE.Color(color);
  const lum = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
  c.lerp(WARM.clone().multiplyScalar(Math.max(0.4, lum)), 0.35).multiplyScalar(intensity * 0.65);
  return patchFog(new THREE.MeshBasicMaterial({ color: c }));
}

// Keyframes over sun elevation (sin of the angle above the horizon).
const KEYS = [
  { e: -1.0, zen: [0.004, 0.006, 0.02], hor: [0.1, 0.05, 0.08], glow: [0.55, 0.24, 0.1], sun: [0.12, 0.15, 0.25], amb: [0.07, 0.07, 0.12] },
  { e: -0.18, zen: [0.01, 0.012, 0.04], hor: [0.16, 0.08, 0.12], glow: [0.6, 0.27, 0.12], sun: [0.15, 0.17, 0.28], amb: [0.08, 0.08, 0.13] },
  { e: -0.04, zen: [0.06, 0.06, 0.18], hor: [0.75, 0.3, 0.2], glow: [0.6, 0.3, 0.15], sun: [0.9, 0.35, 0.15], amb: [0.18, 0.14, 0.2] },
  { e: 0.06, zen: [0.14, 0.17, 0.4], hor: [1.15, 0.55, 0.28], glow: [0.6, 0.38, 0.22], sun: [1.6, 0.75, 0.38], amb: [0.32, 0.26, 0.3] },
  { e: 0.3, zen: [0.2, 0.34, 0.66], hor: [0.82, 0.72, 0.6], glow: [0.56, 0.46, 0.36], sun: [2.1, 1.85, 1.5], amb: [0.46, 0.44, 0.44] },
  { e: 1.0, zen: [0.17, 0.32, 0.66], hor: [0.76, 0.72, 0.66], glow: [0.52, 0.46, 0.4], sun: [2.35, 2.15, 1.8], amb: [0.5, 0.49, 0.5] },
];

function lerpKey(e, field, out) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (e >= KEYS[i].e && e <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const t = b.e === a.e ? 0 : THREE.MathUtils.clamp((e - a.e) / (b.e - a.e), 0, 1);
  out.setRGB(
    a[field][0] + (b[field][0] - a[field][0]) * t,
    a[field][1] + (b[field][1] - a[field][1]) * t,
    a[field][2] + (b[field][2] - a[field][2]) * t
  );
  return out;
}

// minutes: 0..1440 game time of day.
export function updateEnvironment(minutes, sunLight, hemi) {
  const a = (minutes / 1440) * Math.PI * 2 - Math.PI / 2; // sunrise at 06:00
  const elev = Math.sin(a);
  const sun = ENV.uSunDir.value.set(Math.cos(a) * 0.82, elev, -0.45 + Math.cos(a) * 0.1).normalize();
  lerpKey(elev, 'zen', ENV.uZenith.value);
  lerpKey(elev, 'hor', ENV.uHorizon.value);
  lerpKey(elev, 'glow', ENV.uGlow.value);
  lerpKey(elev, 'sun', ENV.uSunColor.value);
  lerpKey(elev, 'amb', ENV.uAmbient.value);
  ENV.uNight.value = THREE.MathUtils.smoothstep(-elev, -0.12, 0.12);

  if (sunLight) {
    // By night the key light is the moon, opposite the sun.
    const night = ENV.uNight.value;
    const dir = night > 0.5 ? sun.clone().negate() : sun;
    if (dir.y < 0.05) dir.y = 0.05;
    sunLight.position.copy(dir).multiplyScalar(1000);
    // The shader colours carry intensity; the light gets a normalised colour.
    const c = ENV.uSunColor.value;
    const peak = Math.max(c.r, c.g, c.b, 1e-3);
    sunLight.color.setRGB(c.r / peak, c.g / peak, c.b / peak);
    sunLight.intensity = night > 0.5 ? 0.25 : Math.min(peak, 2.2) * 0.75;
  }
  if (hemi) {
    hemi.color.copy(ENV.uZenith.value).lerp(ENV.uHorizon.value, 0.4);
    hemi.groundColor.copy(ENV.uGlow.value).multiplyScalar(0.6);
    hemi.intensity = 1.1 + ENV.uNight.value * 1.2;
  }
  return elev;
}
