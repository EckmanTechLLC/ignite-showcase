import { Filter, GlProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform vec4 uCam;      // world->screen: scale, offsetX, offsetY, time (s)
uniform vec4 uSky;      // screen w, h (css px), cloudiness 0..1, daylight 0..1
uniform vec2 uDrift;    // world units / s

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
void main(void) {
  vec2 screen = vTextureCoord * uSky.xy;
  vec2 world = (screen - uCam.yz) / uCam.x;
  vec2 p = (world - uDrift * uCam.w) / 380.0;
  float n = fbm(p);
  float cl = clamp(uSky.z, 0.0, 1.0);
  float thr = mix(0.80, 0.34, cl);
  float c = smoothstep(thr - 0.07, thr + 0.07, n);
  float a = c * (0.30 + 0.38 * cl) * uSky.w;
  finalColor = vec4(vec3(0.02, 0.04, 0.09) * a, a);
}
`;

/** Full-screen cloud-shadow pass: fbm noise anchored in world space (so it pans and zooms with the map), drifting with time. */
export function makeCloudFilter(): { filter: Filter; set: (zoom: number, ox: number, oy: number, t: number, w: number, h: number, cloud: number, day: number, driftX: number, driftY: number) => void } {
  const glProgram = GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'cloud-shadow' });
  const group = new UniformGroup({
    uCam: { value: new Float32Array(4), type: 'vec4<f32>' },
    uSky: { value: new Float32Array(4), type: 'vec4<f32>' },
    uDrift: { value: new Float32Array(2), type: 'vec2<f32>' },
  });
  // Cloud shadows are soft: half resolution quarters the fill cost.
  const filter = new Filter({ glProgram, resolution: 0.5, resources: { cloudUniforms: group } });
  const u = group.uniforms as { uCam: Float32Array; uSky: Float32Array; uDrift: Float32Array };
  return {
    filter,
    set: (zoom, ox, oy, t, w, h, cloud, day, driftX, driftY) => {
      u.uCam[0] = zoom;
      u.uCam[1] = ox;
      u.uCam[2] = oy;
      u.uCam[3] = t;
      u.uSky[0] = w;
      u.uSky[1] = h;
      u.uSky[2] = cloud;
      u.uSky[3] = day;
      u.uDrift[0] = driftX;
      u.uDrift[1] = driftY;
    },
  };
}
