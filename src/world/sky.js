import * as THREE from 'three';
import { ENV, SKY_GLSL } from './env.js';

// The sky dome follows the camera. It carries the gradient, the sun, thin
// cloud streaks, stars and two distant moons.
export function createSky() {
  const geo = new THREE.SphereGeometry(14000, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...ENV },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${SKY_GLSL}
      varying vec3 vDir;
      float h21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
        return s;
      }
      vec3 moon(vec3 d, vec3 c, float size, vec3 tint) {
        float m = dot(d, normalize(c));
        float disc = smoothstep(1.0 - size, 1.0 - size * 0.8, m);
        return tint * disc;
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(d);
        // High, slow cloud streaks.
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.15);
          float c = fbm(uv * vec2(0.6, 2.2) + vec2(uTime * 0.004, 0.0));
          c = smoothstep(0.52, 0.85, c) * smoothstep(0.0, 0.25, d.y);
          vec3 cloudLit = mix(uHorizon * 1.1, uSunColor * 0.6 + uHorizon * 0.4, 0.5);
          cloudLit = mix(cloudLit, uGlow * 0.35, uNight);
          col = mix(col, cloudLit, c * 0.55);
          // Stars, hidden by cloud and by day.
          vec2 sp = floor(d.xz / (d.y + 0.3) * 260.0);
          float s = step(0.9975, h21(sp)) * smoothstep(0.08, 0.4, d.y);
          col += vec3(0.9, 0.95, 1.0) * s * uNight * (1.0 - c) * (0.6 + 0.4 * sin(uTime * 3.0 + h21(sp + 1.0) * 30.0));
        }
        col += moon(d, vec3(-0.5, 0.38, 0.7), 0.0016, vec3(0.9, 0.85, 0.75)) * (0.25 + uNight * 0.9);
        col += moon(d, vec3(-0.35, 0.22, 0.8), 0.0005, vec3(0.7, 0.75, 0.9)) * (0.2 + uNight * 0.8);
        gl_FragColor = vec4(col, 1.0);
        #include <logdepthbuf_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
