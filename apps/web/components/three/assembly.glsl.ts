/**
 * The Assembly's vertex and fragment programs — journey spec § 4, § 5.1.
 *
 * Plain strings so no loader is needed. Injected through
 * three-custom-shader-material on top of `MeshStandardMaterial`: the base
 * material keeps its lighting, we own position and colour.
 *
 * Per instance, two attribute slots (A/B) hold the formation the visitor is
 * leaving and the one they are heading to; `uSwap` says which is which, so a
 * formation change writes one slot and never touches the one holding `from`.
 */

/** Ashima's 3D simplex noise (MIT), the standard one every curl field uses. */
const SIMPLEX = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
/** Curl of a three-component potential built from offset simplex samples. */
vec3 curl(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  float x = snoise(p + dy + vec3(31.4)) - snoise(p - dy + vec3(31.4)) - snoise(p + dz + vec3(71.3)) + snoise(p - dz + vec3(71.3));
  float y = snoise(p + dz) - snoise(p - dz) - snoise(p + dx + vec3(31.4)) + snoise(p - dx + vec3(31.4));
  float z = snoise(p + dx + vec3(71.3)) - snoise(p - dx + vec3(71.3)) - snoise(p + dy) + snoise(p - dy);
  return vec3(x, y, z) / (2.0 * e);
}
`

import { BOUNCE, GRAVITY, GROUND_Y } from '@/lib/assembly/motion'

export const STAGGER = 0.35

/** The stream's river speed, model units/s, and its wrap half-width (§ 3.2). */
export const FLOW_SPEED = 0.35
export const FLOW_HALF = 3.2

export const VERTEX = /* glsl */ `
attribute vec3 aPosA;
attribute vec3 aPosB;
attribute float aLiveA;
attribute float aLiveB;
attribute float aColTA;
attribute float aColTB;
attribute vec4 aSpinA;
attribute vec4 aSpinB;
attribute float aFlowA;
attribute float aFlowB;
attribute float aFallA;
attribute float aFallB;
attribute float aSeed;

uniform float uMix;
uniform float uSwap;
uniform float uTime;
uniform float uNoiseAmp;
uniform float uUnitA;
uniform float uUnitB;
uniform float uEdgeA;
uniform float uEdgeB;
uniform float uBob;
uniform vec3 uPointerOrigin;
uniform vec3 uPointerDir;
uniform float uRepel;
uniform float uRepelRadius;
uniform vec3 uPalette[3];
uniform float uBias;
uniform float uDropAt;
uniform float uCalm;
uniform vec2 uShiver;
uniform float uStaggerByT;
uniform vec4 uAttractors[8];
uniform float uAttractRadius;
uniform float uAttractPull;
uniform int uAttractCount;

varying vec3 vInstanceColor;

${SIMPLEX}

vec3 srgbToLinear(vec3 c) {
  return pow(c, vec3(2.2));
}

/** shade(t) from lib/formations/render.ts: violet -> fuchsia -> cyan, linear in sRGB. */
vec3 shade(float t) {
  float u = clamp(t + uBias, 0.0, 1.0);
  vec3 c = u < 0.5 ? mix(uPalette[0], uPalette[1], u * 2.0) : mix(uPalette[1], uPalette[2], (u - 0.5) * 2.0);
  return srgbToLinear(c);
}

vec3 hashAxis(float s) {
  vec3 a = fract(sin(s * vec3(12.9898, 78.233, 37.719)) * 43758.5453) * 2.0 - 1.0;
  return normalize(a + vec3(0.001, 0.002, 0.003));
}

vec3 rotateAxis(vec3 v, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

/** The stream generator's river, z flipped like the bundle: y = sin(1.15x)·0.18, z = -cos(0.75x)·0.3. */
vec3 river(float x) {
  return vec3(x, sin(x * 1.15) * 0.18, -cos(x * 0.75) * 0.3);
}

/** Free fall from rest at y0, one damped bounce, then rest on the ground (motion.ts fallHeight). */
float fallY(float y0, float elapsed) {
  const float ground = ${GROUND_Y};
  const float g = ${GRAVITY};
  if (elapsed <= 0.0 || y0 <= ground) return max(y0, ground);
  float land = sqrt(2.0 * (y0 - ground) / g);
  if (elapsed < land) return y0 - 0.5 * g * elapsed * elapsed;
  float v = g * land * ${BOUNCE};
  float u = elapsed - land;
  if (u < 2.0 * v / g) return ground + v * u - 0.5 * g * u * u;
  return ground;
}

/**
 * A slot's model-space position after its formation's own motion: the
 * stream's flow and wrap (colour t travels with it), the scatter's fall and
 * the pile's shiver, the spin about the formation's origin.
 */
vec3 formationPos(vec3 p, inout float t, vec4 spin, float flowFlag, float fallFlag, float shiver) {
  if (flowFlag > 0.5) {
    vec3 residual = p - river(p.x);
    float x = mod(p.x + uTime * ${FLOW_SPEED} + ${FLOW_HALF}, ${FLOW_HALF * 2}) - ${FLOW_HALF};
    p = river(x) + residual;
    t = (x + ${FLOW_HALF}) / ${FLOW_HALF * 2};
  }
  if (fallFlag > 0.5 && uDropAt >= 0.0) p.y = fallY(p.y, uTime - uDropAt);
  p.y += shiver * (1.0 - fallFlag) * sin(uTime * 40.0 + aSeed * 60.0);
  if (spin.w != 0.0) p = rotateAxis(p, spin.xyz, spin.w * uTime);
  return p;
}

void main() {
  // Which slot is "from": uSwap = 0 -> A, 1 -> B.
  float fromUnit = mix(uUnitA, uUnitB, uSwap);
  float toUnit = mix(uUnitB, uUnitA, uSwap);
  float fromEdge = mix(aLiveA * uEdgeA, aLiveB * uEdgeB, uSwap);
  float toEdge = mix(aLiveB * uEdgeB, aLiveA * uEdgeA, uSwap);
  float fromT = mix(aColTA, aColTB, uSwap);
  float toT = mix(aColTB, aColTA, uSwap);
  float fromFall = mix(aFallA, aFallB, uSwap);
  float toFall = mix(aFallB, aFallA, uSwap);
  vec3 fromModel = formationPos(mix(aPosA, aPosB, uSwap), fromT, mix(aSpinA, aSpinB, uSwap), mix(aFlowA, aFlowB, uSwap), fromFall, uShiver.x);
  vec3 toModel = formationPos(mix(aPosB, aPosA, uSwap), toT, mix(aSpinB, aSpinA, uSwap), mix(aFlowB, aFlowA, uSwap), toFall, uShiver.y);
  vec3 fromPos = fromModel * fromUnit;
  vec3 toPos = toModel * toUnit;

  // Staggered local progress: the first cubes leave at uMix = 0, the last at uMix = ${STAGGER}.
  // The contact ring staggers by its angle instead of its seed, so it draws itself around (§ 3.7).
  float key = mix(aSeed, toT, uStaggerByT);
  float m = smoothstep(0.0, 1.0, (uMix - key * ${STAGGER}) / (1.0 - ${STAGGER}));
  float envelope = sin(3.14159265 * m);

  vec3 centre = mix(fromPos, toPos, m);
  // Curl-noise swirl mid-morph, sampled in model space so the amplitude is
  // uNoiseAmp model units and the frequency is viewport-independent; zero at
  // both ends so formations land exactly. Idle frames skip the simplex taps.
  float swirl = uNoiseAmp * (1.0 - 0.7 * uCalm) * envelope * mix(fromUnit, toUnit, m);
  if (swirl > 1e-4) centre += curl(fromModel * 0.6 + uTime * 0.2) * swirl;
  // Idle bob, calmed on the contact ring.
  centre.y += uBob * (1.0 - 0.7 * uCalm) * sin(uTime * 1.1 + aSeed * 20.0);

  // Attractors: the hovered card pulls cubes within uAttractRadius toward it (§ 3.3).
  if (uAttractPull > 0.0) {
    for (int i = 0; i < 8; i++) {
      if (i >= uAttractCount) break;
      vec4 a = uAttractors[i];
      if (a.w <= 0.0) continue;
      vec3 d = a.xyz - centre;
      float dist = length(d);
      if (dist < uAttractRadius && dist > 1e-6) {
        float falloff = 1.0 - dist / uAttractRadius;
        centre += d * (falloff * falloff * uAttractPull * a.w / dist);
      }
    }
  }

  // Pointer: perpendicular distance to the camera ray in group space, pushed stateless.
  vec3 w = centre - uPointerOrigin;
  float along = dot(w, uPointerDir);
  vec3 q = w - along * uPointerDir;
  float dist = length(q);
  if (uRepel > 0.0 && dist < uRepelRadius && dist > 1e-6) {
    float falloff = 1.0 - dist / uRepelRadius;
    centre += q * (falloff * falloff * uRepelRadius * uRepel / dist);
  }

  float edge = mix(fromEdge, toEdge, m) * (1.0 + 0.25 * envelope);
  // Self-rotation: half a turn across the morph plus a faint idle twist.
  vec3 axis = hashAxis(aSeed);
  float angle = m * 3.14159265 + uTime * 0.15 * aSeed;
  vec3 local = rotateAxis(position * edge, axis, angle);

  csm_Position = centre + local;
  csm_Normal = rotateAxis(normal, axis, angle);
  vInstanceColor = mix(shade(fromT), shade(toT), m);
}
`

export const FRAGMENT = /* glsl */ `
varying vec3 vInstanceColor;
void main() {
  csm_DiffuseColor = vec4(vInstanceColor, 1.0);
}
`
