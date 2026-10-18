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

// Make a built-in material use the world's fog instead of three's.
export function patchFog(material) {
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
      .replace('#include <common>', '#include <common>\nvarying vec3 vFogWorld;\n' + SKY_GLSL)
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = applyFog(gl_FragColor.rgb, vFogWorld);');
  };
  material.customProgramCacheKey = () => 'worldfog';
  return material;
}

// Convenience constructors for prop materials.
export function stdMat(color, opts = {}) {
  return patchFog(new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, ...opts }));
}

export function glowMat(color, intensity = 3) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return patchFog(new THREE.MeshBasicMaterial({ color: c }));
}

// Keyframes over sun elevation (sin of the angle above the horizon).
const KEYS = [
  { e: -1.0, zen: [0.004, 0.006, 0.02], hor: [0.1, 0.05, 0.08], glow: [0.55, 0.24, 0.1], sun: [0.12, 0.15, 0.25], amb: [0.07, 0.07, 0.12] },
  { e: -0.18, zen: [0.01, 0.012, 0.04], hor: [0.16, 0.08, 0.12], glow: [0.6, 0.27, 0.12], sun: [0.15, 0.17, 0.28], amb: [0.08, 0.08, 0.13] },
  { e: -0.04, zen: [0.06, 0.06, 0.18], hor: [0.75, 0.3, 0.2], glow: [0.6, 0.3, 0.15], sun: [0.9, 0.35, 0.15], amb: [0.18, 0.14, 0.2] },
  { e: 0.06, zen: [0.14, 0.17, 0.4], hor: [1.15, 0.55, 0.28], glow: [0.6, 0.38, 0.22], sun: [1.6, 0.75, 0.38], amb: [0.32, 0.26, 0.3] },
  { e: 0.3, zen: [0.18, 0.34, 0.72], hor: [0.66, 0.68, 0.7], glow: [0.5, 0.44, 0.38], sun: [2.0, 1.85, 1.6], amb: [0.42, 0.44, 0.52] },
  { e: 1.0, zen: [0.14, 0.3, 0.72], hor: [0.58, 0.66, 0.76], glow: [0.46, 0.44, 0.42], sun: [2.3, 2.2, 2.0], amb: [0.46, 0.5, 0.58] },
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
