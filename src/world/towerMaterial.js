import * as THREE from 'three';
import { ENV, SKY_GLSL } from './env.js';

// One material for every tower segment in the city. Windows, light bands and
// roof lights are procedural from world position, so ten thousand towers cost
// a handful of draw calls.
//
// Per instance:
//   aSize  = segment size in metres (x, y, z)
//   aStyle = (seed, lit fraction, tint 0..1, band style)
// Band style: 0 none, 1 amber bands, 2 pale bands, 3 red bands, 4 ledge (no windows, glowing edge), 5 halo (glows all over),
// 6 plain (rooftop machinery: weathered metal, no windows, no glow)
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
        vec3 sand = vec3(0.76, 0.64, 0.48);
        vec3 ivory = vec3(0.84, 0.8, 0.72);
        vec3 steel = vec3(0.56, 0.54, 0.52);
        vec3 dark = vec3(0.27, 0.24, 0.22);
        vec3 bronze = vec3(0.6, 0.44, 0.3);
        if (t < 0.25) return mix(sand, ivory, t / 0.25);
        if (t < 0.5) return mix(ivory, steel, (t - 0.25) / 0.25);
        if (t < 0.75) return mix(steel, dark, (t - 0.5) / 0.25);
        return mix(dark, bronze, (t - 0.75) / 0.25);
      }

      vec3 windowColor(float h) {
        if (h < 0.66) return vec3(1.0, 0.64, 0.34);      // warm interiors
        if (h < 0.93) return vec3(0.82, 0.8, 0.74);      // office white
        return vec3(0.55, 0.68, 0.85);                   // the odd cool one
      }

      vec3 bandColor(float s) {
        if (s < 1.5) return vec3(1.0, 0.6, 0.25);
        if (s < 2.5) return vec3(0.7, 0.8, 0.9);
        return vec3(0.95, 0.4, 0.28);
      }

      // Weathering: value noise for grime and the streaks rain leaves.
      float h31(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float vn(vec3 x) {
        vec3 i = floor(x), f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      float weather(vec3 wp, vec2 wall, float seed) {
        float blot = vn(wp * 0.02 + seed * 13.0) * 0.6 + vn(wp * 0.11) * 0.4;
        float streak = vn(vec3(wall.x * 0.45, wp.y * 0.012, seed * 7.0));
        return 0.8 + blot * 0.42 - streak * 0.28;
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

        float wth = weather(vWp, vWall, seed);
        if (vTop > 0.5) {
          // Roofs: plating in big panels, grime, and the odd lit hatch.
          vec2 rg = vWp.xz / 6.0;
          vec2 rf = fract(rg);
          float seamR = step(0.04, rf.x) * step(0.04, rf.y);
          float pfw = clamp(1.4 - length(fwidth(rg)) * 3.0, 0.0, 1.0);
          col = base * 0.5 * light * wth * mix(1.0, mix(0.7, 1.0, seamR) * (0.9 + 0.2 * h21(floor(rg) + seed)), pfw);
          vec2 g = vWp.xz / 7.0;
          float spot = step(0.95, h21(floor(g) + seed * 91.0)) * step(length(fract(g) - 0.5), 0.12);
          col += vec3(1.0, 0.65, 0.35) * spot * (0.2 + night * 1.0);
        } else if (band > 5.5) {
          // Machinery on the roofs: weathered metal with ribs and seams.
          float rib = step(0.5, fract(vWall.x / 1.2));
          float seamY = step(0.06, fract(vWall.y / 2.5));
          col = base * 0.62 * light * wth * (0.85 + 0.15 * rib) * mix(0.7, 1.0, seamY);
        } else if (band > 4.5) {
          // Halo: a ring that glows all over, softly, brighter at night.
          col = mix(bandColor(1.0 + mod(seed * 7.0, 3.0)), vec3(1.0, 0.85, 0.62), 0.5) * (0.25 + 1.0 * night);
        } else if (band > 3.5) {
          // Ledge: dark trim with a lit lip along the top edge.
          col = base * 0.4 * light * wth;
          float lip = smoothstep(0.7, 0.95, vRel);
          col += mix(bandColor(1.0 + mod(seed * 7.0, 3.0)), vec3(1.0, 0.8, 0.55), 0.4) * lip * (0.25 + 0.9 * night);
        } else {
          // Each tower has its own facade: a window grid, ribbon windows,
          // narrow slits between deep piers, or tall double-height panes.
          float pat = floor(fract(seed * 3.7) * 4.0);
          vec2 cell = vec2(3.2, 4.0);
          vec4 wr = vec4(0.12, 0.88, 0.22, 0.86);
          if (pat == 1.0) { cell = vec2(6.0, 4.0); wr = vec4(0.0, 1.0, 0.34, 0.84); }
          else if (pat == 2.0) { cell = vec2(2.4, 4.0); wr = vec4(0.34, 0.66, 0.1, 0.92); }
          else if (pat == 3.0) { cell = vec2(4.8, 8.0); wr = vec4(0.08, 0.92, 0.08, 0.94); }
          vec2 g = vWall / cell;
          vec2 id = floor(g);
          vec2 f = fract(g);
          float win = step(wr.x, f.x) * step(f.x, wr.y) * step(wr.z, f.y) * step(f.y, wr.w);
          vec2 fw = fwidth(g);
          float detail = clamp(1.6 - max(fw.x, fw.y) * 2.2, 0.0, 1.0);
          float winM = mix((wr.y - wr.x) * (wr.w - wr.z), win, detail);

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
          // Walls weather: grime, streaks, and a seam at every floor.
          float floorSeam = smoothstep(0.0, 0.06, f.y) * smoothstep(0.0, 0.06, 1.0 - f.y);
          vec3 wall = base * light * wth * mix(1.0, mix(0.75, 1.0, floorSeam), detail);
          col = mix(wall, glass, winM);
          float emit = mix(0.03, 1.15, night);
          // Up close a lit window has an interior: brighter ceiling light,
          // blinds in some, a silhouette in a few.
          vec2 wl = clamp((f - wr.xz) / (wr.yw - wr.xz), 0.0, 1.0);
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
            col = mix(col, bandColor(band) * (0.12 + 0.45 * night), b * 0.6);
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
