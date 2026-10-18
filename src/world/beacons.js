import * as THREE from 'three';
import { ENV } from './env.js';

// Blinking aviation lights on roofs, antennas and spires.
export function createBeacons(points) {
  const n = points.length;
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const kind = new Float32Array(n);
  points.forEach((p, i) => {
    pos.set(p, i * 3);
    phase[i] = Math.random() * 10;
    kind[i] = Math.random() < 0.8 ? 0 : 1;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: ENV.uTime, uNight: ENV.uNight, uPix: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aPhase;
      attribute float aKind;
      uniform float uTime;
      uniform float uPix;
      varying float vOn;
      varying float vKind;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        float blink = step(0.55, fract(uTime * 0.6 + aPhase));
        vOn = mix(blink, 0.6 + 0.4 * sin(uTime * 2.0 + aPhase * 5.0), aKind);
        vKind = aKind;
        gl_PointSize = clamp(9000.0 / d, 2.5, 14.0) * uPix;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uNight;
      varying float vOn;
      varying float vKind;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, r);
        vec3 c = mix(vec3(3.0, 0.25, 0.15), vec3(2.2, 2.0, 1.6), vKind);
        gl_FragColor = vec4(c * a * vOn * (0.5 + 0.8 * uNight), a * vOn);
        #include <logdepthbuf_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
