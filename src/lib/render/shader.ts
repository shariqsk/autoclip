// The whole look of an AutoClip edit is one fragment shader: framing (smart crop or blurred fill),
// transitions between two shots, beat punches and shakes, chromatic aberration, color grade, grain,
// vignette, letterbox, and the caption layer on top.

export const VERTEX = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

export const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uOut;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uCaption;
uniform vec2 uSizeA;
uniform vec2 uSizeB;
uniform vec2 uFocusA;
uniform vec2 uFocusB;
uniform float uZoomA;
uniform float uZoomB;
uniform bool uHasA;
uniform bool uHasB;
uniform bool uHasCaption;
uniform int uTrans;      // 0 none, 1 fade, 2 flash, 3 zoom, 4 whip, 5 glitch, 6 dip, 7 spin
uniform float uProg;
uniform vec2 uShake;
uniform float uRot;
uniform float uZoom;
uniform float uFlash;
uniform float uRgb;
uniform float uMonoMix;
uniform float uDim;
uniform int uFit;        // 0 fill (smart crop), 1 blurred background
uniform float uTime;
// Grade
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uLift;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform bool uMono;
uniform float uGrain;
uniform float uVignette;
uniform float uLetterbox;

const float PI = 3.14159265;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Where output point p (0–1, y up) lands in a source of the given size, framed to cover the output,
// centered on the action and kept inside the frame.
vec2 coverUV(vec2 p, vec2 size, vec2 focus, float zoom) {
  float outAspect = uOut.x / uOut.y;
  float srcAspect = size.x / size.y;
  vec2 vis = srcAspect > outAspect ? vec2(outAspect / srcAspect, 1.0) : vec2(1.0, srcAspect / outAspect);
  vis /= zoom;
  vec2 f = vec2(focus.x, 1.0 - focus.y);
  vec2 c = clamp(f, vis * 0.5, 1.0 - vis * 0.5);
  return c + (p - 0.5) * vis;
}

// Fit the whole source inside the output; returns uv and whether p is inside the picture.
vec2 containUV(vec2 p, vec2 size, float zoom, out bool inside) {
  float outAspect = uOut.x / uOut.y;
  float srcAspect = size.x / size.y;
  vec2 box = srcAspect > outAspect ? vec2(1.0, outAspect / srcAspect) : vec2(srcAspect / outAspect, 1.0);
  box *= zoom;
  vec2 uv = (p - 0.5) / box + 0.5;
  inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  return uv;
}

vec3 tapBlur(sampler2D tex, vec2 uv, float r) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.3998;
    float d = sqrt(float(i) + 0.5) / sqrt(12.0);
    s += texture(tex, clamp(uv + vec2(cos(a), sin(a)) * d * r, 0.0, 1.0)).rgb;
  }
  return s / 12.0;
}

vec3 sampleLayer(sampler2D tex, vec2 p, vec2 size, vec2 focus, float zoom) {
  if (uFit == 1) {
    bool inside;
    vec2 uv = containUV(p, size, zoom, inside);
    if (inside) return texture(tex, uv).rgb;
    vec2 bg = coverUV(p, size, vec2(0.5), 1.15);
    return tapBlur(tex, bg, 0.06) * 0.55;
  }
  vec2 uv = coverUV(p, size, focus, zoom);
  return texture(tex, clamp(uv, 0.0, 1.0)).rgb;
}

vec3 sampleRgb(sampler2D tex, vec2 p, vec2 size, vec2 focus, float zoom, float amount) {
  if (amount < 0.002) return sampleLayer(tex, p, size, focus, zoom);
  vec2 dir = (p - 0.5) * amount * 0.035 + vec2(amount * 0.006, 0.0);
  return vec3(
    sampleLayer(tex, p + dir, size, focus, zoom).r,
    sampleLayer(tex, p, size, focus, zoom).g,
    sampleLayer(tex, p - dir, size, focus, zoom).b
  );
}

vec3 layerA(vec2 p, float zoom, float rgb) {
  if (!uHasA) return vec3(0.0);
  return sampleRgb(uA, p, uSizeA, uFocusA, uZoomA * zoom, rgb);
}
vec3 layerB(vec2 p, float zoom, float rgb) {
  if (!uHasB) return layerA(p, zoom, rgb);
  return sampleRgb(uB, p, uSizeB, uFocusB, uZoomB * zoom, rgb);
}

float easeInOut(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }

vec3 radialBlur(vec2 p, float zoom, float amount, bool useB) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float k = 1.0 - amount * float(i) / 10.0;
    vec2 q = 0.5 + (p - 0.5) * k;
    s += useB ? layerB(q, zoom, uRgb) : layerA(q, zoom, uRgb);
  }
  return s / 10.0;
}

vec2 rotateAround(vec2 p, float a) {
  float aspect = uOut.x / uOut.y;
  vec2 d = p - 0.5;
  d.x *= aspect;
  d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
  d.x /= aspect;
  return d + 0.5;
}

vec3 composite(vec2 p) {
  float z = 1.0 + uZoom;
  if (uTrans == 0 || !uHasB) return layerA(p, z, uRgb);
  float t = clamp(uProg, 0.0, 1.0);
  if (uTrans == 1) return mix(layerA(p, z, uRgb), layerB(p, z, uRgb), smoothstep(0.0, 1.0, t));
  if (uTrans == 2 || uTrans == 6) {
    vec3 c = t < 0.5 ? layerA(p, z, uRgb) : layerB(p, z, uRgb);
    float w = pow(1.0 - abs(t - 0.5) * 2.0, 1.6);
    return mix(c, uTrans == 2 ? vec3(1.0) : vec3(0.0), w);
  }
  if (uTrans == 3) {
    // Punch into the outgoing shot, land on the incoming one zoomed and settle.
    if (t < 0.5) {
      float k = easeInOut(t * 2.0);
      return radialBlur(p, z * (1.0 + 0.9 * k), 0.25 * k, false);
    }
    float k = 1.0 - easeInOut((t - 0.5) * 2.0);
    return radialBlur(p, z * (1.0 + 0.9 * k), 0.25 * k, true);
  }
  if (uTrans == 4) {
    float e = easeInOut(t);
    float blur = sin(PI * t) * 0.12;
    vec3 s = vec3(0.0);
    for (int i = 0; i < 9; i++) {
      float o = (float(i) / 8.0 - 0.5) * blur;
      float x = p.x + o;
      s += x < 1.0 - e ? layerA(vec2(x + e, p.y), z, uRgb) : layerB(vec2(x - (1.0 - e), p.y), z, uRgb);
    }
    return s / 9.0;
  }
  if (uTrans == 5) {
    float slice = floor(p.y * 18.0);
    float r = hash(vec2(slice, floor(uTime * 24.0)));
    float strength = sin(PI * t);
    vec2 q = p + vec2((r - 0.5) * 0.25 * strength, 0.0);
    bool showB = t > 0.35 + 0.3 * r;
    float split = 0.6 * strength;
    return showB ? layerB(q, z, uRgb + split) : layerA(q, z, uRgb + split);
  }
  if (uTrans == 7) {
    float e = easeInOut(t);
    float a = t < 0.5 ? e * 1.2 : -(1.0 - e) * 1.2;
    vec2 q = rotateAround(p, a);
    float zz = z * (1.0 + sin(PI * t) * 0.6);
    return t < 0.5 ? layerA(q, zz, uRgb) : layerB(q, zz, uRgb);
  }
  return layerA(p, z, uRgb);
}

vec3 grade(vec3 c) {
  c = c + uLift * (1.0 - c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (uMono) c = vec3(l);
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  float lum = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  c += uShadowTint * (1.0 - lum) * (1.0 - lum) + uHighlightTint * lum * lum;
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 p = gl_FragCoord.xy / uOut;
  vec2 q = rotateAround(p, uRot) + uShake;
  vec3 c = composite(q);
  c = grade(c);
  // Per-shot black and white, with a little extra contrast so it reads as a choice, not a fault.
  float mono = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(clamp((mono - 0.5) * 1.15 + 0.5, 0.0, 1.0)), clamp(uMonoMix, 0.0, 1.0));
  c *= 1.0 - clamp(uDim, 0.0, 1.0);
  c = mix(c, vec3(1.0), clamp(uFlash, 0.0, 1.0) * 0.85);

  vec2 d = p - 0.5;
  d.x *= uOut.x / uOut.y;
  float v = smoothstep(0.85, 0.2, length(d) * (uOut.x > uOut.y ? 0.9 : 1.15));
  c *= mix(1.0, v, uVignette);

  float g = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 100.0) - 0.5;
  c += g * uGrain * 0.22;

  if (p.y < uLetterbox || p.y > 1.0 - uLetterbox) c = vec3(0.0);

  if (uHasCaption) {
    vec4 cap = texture(uCaption, vec2(p.x, 1.0 - p.y));
    c = c * (1.0 - cap.a) + cap.rgb;
  }
  outColor = vec4(c, 1.0);
}
`
