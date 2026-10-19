import * as THREE from 'three';
import { ENV, SKY_GLSL } from './env.js';

// One material for every tower segment in the city. Windows, light bands and
// roof lights are procedural from world position, so ten thousand towers cost
// a handful of draw calls.
//
// Per instance:
//   aSize  = segment size in metres (x, y, z)
//   aStyle = (seed, lit fraction, tint 0..1, band style)
// Band style: 0 none, 1 amber bands, 2 cyan bands, 3 magenta bands, 4 ledge (no windows, glowing edge), 5 halo (glows all over)
export function createTowerMaterial(isCylinder) {
  return new THREE.ShaderMaterial({
    uniforms: { ...ENV, uCyl: { value: isCylinder ? 1 : 0 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 aSize;
      attribute vec4 aStyle;
      uniform float uCyl;
      varying vec3 vWp;
      varying vec3 vN;
      varying vec2 vWall;
      flat varying vec4 vStyle;
      varying float vTop;
      varying float vRel;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWp = wp.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        float perim = uCyl > 0.5 ? 3.14159 * aSize.x : (abs(normal.x) > 0.5 ? aSize.z : aSize.x);
        vWall = vec2(uv.x * perim, wp.y);
        vTop = abs(normal.y);
        vStyle = aStyle;
        vRel = position.y + 0.5;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${SKY_GLSL}
      varying vec3 vWp;
      varying vec3 vN;
      varying vec2 vWall;
      flat varying vec4 vStyle;
      varying float vTop;
      varying float vRel;

      float h21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      vec3 baseTint(float t) {
        vec3 sand = vec3(0.74, 0.64, 0.5);
        vec3 ivory = vec3(0.82, 0.8, 0.75);
        vec3 steel = vec3(0.48, 0.52, 0.58);
        vec3 dark = vec3(0.2, 0.21, 0.25);
        vec3 bronze = vec3(0.58, 0.43, 0.3);
        if (t < 0.25) return mix(sand, ivory, t / 0.25);
        if (t < 0.5) return mix(ivory, steel, (t - 0.25) / 0.25);
        if (t < 0.75) return mix(steel, dark, (t - 0.5) / 0.25);
        return mix(dark, bronze, (t - 0.75) / 0.25);
      }

      vec3 windowColor(float h) {
        if (h < 0.62) return vec3(1.0, 0.62, 0.3);       // warm interiors
        if (h < 0.84) return vec3(0.75, 0.78, 0.85);     // office white
        if (h < 0.95) return vec3(0.3, 0.7, 1.0);        // cyan
        return vec3(1.0, 0.3, 0.6);                      // magenta
      }

      vec3 bandColor(float s) {
        if (s < 1.5) return vec3(1.0, 0.55, 0.15);
        if (s < 2.5) return vec3(0.2, 0.85, 1.0);
        return vec3(1.0, 0.25, 0.65);
      }

      void main() {
        vec3 n = normalize(vN);
        float seed = vStyle.x;
        float band = vStyle.w;
        vec3 base = baseTint(vStyle.z);
        float sunD = max(dot(n, uSunDir), 0.0);
        // Sky light from above, a little bounce from the city below.
        float skyD = 0.55 + 0.45 * n.y;
        vec3 light = uAmbient * skyD * 0.85 + uSunColor * sunD * 0.42;
        // Lower levels sit in shadow and smog.
        float depth = smoothstep(0.0, 260.0, vWp.y);
        light *= mix(0.35, 1.0, depth);
        vec3 col;
        float night = uNight;

        if (vTop > 0.5) {
          col = base * 0.55 * light;
          vec2 g = vWp.xz / 7.0;
          float spot = step(0.93, h21(floor(g) + seed * 91.0)) * step(length(fract(g) - 0.5), 0.12);
          col += vec3(1.0, 0.6, 0.3) * spot * (0.4 + night * 2.0);
        } else if (band > 4.5) {
          // Halo: a ring that glows all over, brighter at night.
          col = bandColor(1.0 + mod(seed * 7.0, 3.0)) * (0.55 + 2.4 * night);
        } else if (band > 3.5) {
          // Ledge: dark trim with a glowing lip on the top edge.
          col = base * 0.4 * light;
          float lip = smoothstep(0.7, 0.95, vRel);
          col += bandColor(1.0 + mod(seed * 7.0, 3.0)) * lip * (0.6 + 2.2 * night);
        } else {
          vec2 cell = vec2(3.2, 4.0);
          vec2 g = vWall / cell;
          vec2 id = floor(g);
          vec2 f = fract(g);
          float win = step(0.12, f.x) * step(f.x, 0.88) * step(0.22, f.y) * step(f.y, 0.86);
          vec2 fw = fwidth(g);
          float detail = clamp(1.6 - max(fw.x, fw.y) * 2.2, 0.0, 1.0);
          float winM = mix(0.76 * 0.64, win, detail);

          float lit = vStyle.y;
          float hh = h21(id + vec2(seed * 173.0, seed * 59.0));
          // Lights go on and off slowly through the night.
          float flick = h21(id.yx + floor(uTime / 40.0 + hh * 9.0));
          float on = step(hh, lit) * step(0.04, flick);
          // Three levels of detail: single windows up close, blocks of 2 x 2
          // windows lit or dark further out (and on faces seen edge-on), and
          // a flat average only once even those blocks are under a pixel.
          vec2 idc = floor(g / 2.0);
          float onC = step(h21(idc + vec2(seed * 31.0, seed * 17.0)), lit);
          float mid = clamp(1.6 - max(fw.x, fw.y) * 1.1, 0.0, 1.0);
          float onM = mix(mix(lit, onC, mid), on, detail);
          vec3 wc = mix(vec3(0.95, 0.66, 0.38), windowColor(h21(id * 1.7 + seed)), detail);

          // By day glass reflects the sky; by night it shows the lights inside.
          vec3 refl = skyColor(reflect(normalize(vWp - cameraPosition), n));
          vec3 glass = mix(vec3(0.02, 0.025, 0.04), refl * 0.4, 0.6) * (1.0 - night * 0.8);
          vec3 wall = base * light;
          col = mix(wall, glass, winM);
          float emit = mix(0.03, 1.15, night);
          // Up close a lit window has an interior: brighter ceiling light,
          // blinds in some, a silhouette in a few.
          vec2 wl = clamp((f - vec2(0.12, 0.22)) / vec2(0.76, 0.64), 0.0, 1.0);
          float interior = 0.7 + 0.45 * wl.y;
          float hb = h21(id * 3.1 + seed * 7.0);
          if (hb > 0.62) interior *= 0.55 + 0.45 * step(0.45, fract(wl.y * 9.0));
          if (hb < 0.14) {
            float cx = 0.3 + hb * 3.0;
            float body = step(abs(wl.x - cx), 0.09) * step(wl.y, 0.62);
            float headS = step(length((wl - vec2(cx, 0.72)) * vec2(1.0, 1.6)), 0.08);
            interior *= 1.0 - 0.8 * max(body, headS);
          }
          interior = mix(1.0, interior, detail);
          // Far away a facade averages to a glow; keep it dimmer than up close
          // so distant towers stay dark silhouettes dotted with light.
          col += winM * onM * wc * emit * interior * mix(0.5, 1.0, detail);

          if (band > 0.5) {
            float period = 36.0 + floor(seed * 4.0) * 12.0;
            float b = smoothstep(0.0, 0.5, 1.0 - abs(mod(vWp.y, period) - 1.0) / 0.6);
            col = mix(col, bandColor(band) * (0.25 + 0.9 * night), b * 0.8);
          }
        }

        // The whole city is lit from underneath at night.
        col += base * uGlow * night * 0.22 * (1.0 - depth * 0.6);
        col = applyFog(col, vWp);
        gl_FragColor = vec4(col, 1.0);
        #include <logdepthbuf_fragment>
      }`,
  });
}
