import * as THREE from 'three';
import { ENV, SKY_GLSL } from './env.js';
import { makeRng } from '../core/rng.js';

// Cloud decks that wrap the towers, so the lower city sinks into weather,
// and searchlight beams that sweep the sky at night.

const NOISE = /* glsl */ `
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
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.07 + 13.1; a *= 0.5; }
    return s;
  }
`;

// One cloud sheet: a large plane that follows the camera, with noise in world
// space so it does not slide. cover: 0..1 how much of the sky it fills.
function cloudSheet(y, scale, cover, opacity, drift) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...ENV, uY: { value: y }, uScale: { value: scale }, uCover: { value: cover }, uOpacity: { value: opacity }, uDrift: { value: drift } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWp;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWp = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${SKY_GLSL}
      ${NOISE}
      uniform float uY, uScale, uCover, uOpacity;
      uniform vec2 uDrift;
      varying vec3 vWp;
      void main() {
        vec2 uv = (vWp.xz + uDrift * uTime) / uScale;
        float n = fbm(uv) * 0.75 + fbm(uv * 3.1 + 7.0) * 0.25;
        float d = smoothstep(1.0 - uCover, 1.0 - uCover + 0.28, n);
        if (d < 0.01) discard;
        // Lit by the sun from above and by the city glow from below.
        float above = step(uY, cameraPosition.y);
        vec3 lit = uSunColor * 0.45 + uAmbient * 0.9;
        vec3 under = uGlow * (0.4 + 0.45 * uNight) + uAmbient * 0.3;
        vec3 col = mix(under, lit, mix(0.35, 0.85, above) * (1.0 - uNight * 0.7));
        col = mix(col, uGlow * 0.8, uNight * 0.25);
        // Thin edges are brighter, cores denser.
        col *= 0.8 + 0.35 * (1.0 - d);
        float dist = length(vWp - cameraPosition);
        float a = d * uOpacity * (1.0 - 0.35 * uNight) * smoothstep(9000.0, 3000.0, dist);
        // Fade near the camera so flying through a cloud is not a wall.
        a *= smoothstep(4.0, 60.0, abs(vWp.y - cameraPosition.y) + dist * 0.05);
        col = applyFog(col, vWp);
        gl_FragColor = vec4(col, a);
        #include <logdepthbuf_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000, 1, 1).rotateX(-Math.PI / 2), mat);
  mesh.position.y = y;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

function searchlights(towerTops) {
  const rng = makeRng(77);
  const group = new THREE.Group();
  const len = 1400;
  // A cone opening upward, its apex at the origin.
  const geo = new THREE.ConeGeometry(70, len, 24, 1, true).translate(0, -len / 2, 0).rotateX(Math.PI);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: ENV.uNight, uLen: { value: len } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vAlong = position.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uNight, uLen;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float t = clamp(vAlong / uLen, 0.0, 1.0);
        // Brightest at the lamp, fading up the beam; soft at its silhouette.
        float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.5);
        float a = (1.0 - t) * (1.0 - t) * edge * 0.22 * uNight;
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.75) * a, a);
        #include <logdepthbuf_fragment>
      }`,
  });
  const beams = [];
  for (let i = 0; i < 14; i++) {
    const p = towerTops[Math.floor(rng.next() * towerTops.length)];
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(p[0], p[1], p[2]);
    beam.frustumCulled = false;
    beam.renderOrder = 3;
    group.add(beam);
    beams.push({ mesh: beam, speed: rng.range(0.08, 0.2) * (rng.chance(0.5) ? 1 : -1), phase: rng.range(0, 6.28), tilt: rng.range(0.25, 0.55) });
  }
  const update = (t) => {
    group.visible = ENV.uNight.value > 0.05;
    for (const b of beams) {
      const a = b.phase + t * b.speed;
      b.mesh.rotation.set(Math.sin(a * 1.3) * b.tilt, a, Math.cos(a) * b.tilt, 'YXZ');
    }
  };
  return { group, update };
}

export function createAtmosphere(segs) {
  const group = new THREE.Group();
  // A thick low deck in three sheets. (A high layer was tried: seen at a
  // grazing angle its wisps stack into a veil over the whole skyline.)
  group.add(cloudSheet(92, 900, 0.62, 0.55, new THREE.Vector2(3, 1)));
  group.add(cloudSheet(112, 700, 0.5, 0.45, new THREE.Vector2(4, 1.5)));
  group.add(cloudSheet(135, 1100, 0.38, 0.35, new THREE.Vector2(5, 2)));
  const sheets = [...group.children];

  // Searchlights stand on roofs of tall towers near the hub.
  const tops = segs
    .filter((s) => s.kind === 'box' && s.style[3] !== 4 && s.sx > 30 && Math.hypot(s.x, s.z) > 250 && Math.hypot(s.x, s.z) < 1800 && s.y + s.sy / 2 > 250)
    .map((s) => [s.x, s.y + s.sy / 2 + 1, s.z]);
  const lights = searchlights(tops);
  group.add(lights.group);

  const update = (t, camera) => {
    for (const s of sheets) {
      s.position.x = camera.position.x;
      s.position.z = camera.position.z;
    }
    lights.update(t);
  };
  return { group, update };
}
