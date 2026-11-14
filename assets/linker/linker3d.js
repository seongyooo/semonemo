// The Linker, alive: the game's own model and Idle clip (linker.glb), its stone and marks (scene.json), drawn with
// the game's Stylized shading and Grade1 colour, as the poster's render is. The head follows the pointer and the
// scroll; left alone it looks about by itself; it breathes and blinks; clicked, it hops. Picked up (pressed and
// dragged), it hangs limp from the hood and swings after the pointer; let go, it falls away, drops back onto its
// stone from above, topples over and gets up again. Two of them share the files: the one at the foot of the page,
// and a small one in the corner that keeps the reader company until then.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = new URL('./', import.meta.url);

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uBlink;
uniform float uEyeY;
uniform float uObjY;
varying vec3 vN;
varying vec3 vWP;
varying float vObjY;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  transformed.y = mix(transformed.y, uEyeY, uBlink);
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vWP = wp.xyz;
  vObjY = wp.y + uObjY;
  vN = normalize(mat3(modelMatrix) * objectNormal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform bool uUnlit;
uniform vec3 uBase, uTop, uLit, uShade, uFade, uLight, uView;
uniform float uEdge, uRim, uFadeTop, uFadeBottom, uMini;
varying vec3 vN;
varying vec3 vWP;
varying float vObjY;

vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 logc(vec3 x) { return mix(5.301883 * x + 0.092819, 0.244161 * log(max(5.555556 * x + 0.047996, 1e-9)) / log(10.0) + 0.386036, step(0.011361, x)); }
vec3 unlogc(vec3 x) { return mix((x - 0.092819) / 5.301883, (pow(vec3(10.0), (x - 0.386036) / 0.244161) - 0.047996) / 5.555556, step(5.301883 * 0.011361 + 0.092819, x)); }
// The game's Grade1 (exposure -0.08, white balance +9, contrast 12, saturation 14), as the poster's grade1.py.
vec3 grade(vec3 srgb) {
  vec3 c = toLin(srgb) * pow(2.0, -0.08);
  vec3 lms = vec3(dot(vec3(0.390405, 0.549941, 0.00892632), c), dot(vec3(0.0708416, 0.963172, 0.00135775), c),
                  dot(vec3(0.0231082, 0.128021, 0.936245), c)) * vec3(1.0122154, 0.9990822, 0.9428170);
  c = vec3(dot(vec3(2.8584705, -1.6287886, -0.0248911), lms), dot(vec3(-0.2101825, 1.1582006, 0.0003243), lms),
           dot(vec3(-0.0418121, -0.1181695, 1.0686665), lms));
  c = max(unlogc((logc(max(c, 0.0)) - 0.4135884) * 1.12 + 0.4135884), 0.0);
  float l = dot(c, vec3(0.2126729, 0.7151522, 0.0721750));
  return toSrgb(l + 1.14 * (c - l));
}

void main() {
  vec3 c;
  if (uUnlit) {
    c = toLin(min(uBase, vec3(1.0)));
  } else {
    // Residual/Stylized: side tone from the horizontal normal against the light's, top tone, undersides in shade.
    vec3 n = normalize(vN);
    vec2 nh = n.xz;
    float nhLen = length(nh);
    vec2 lh = normalize(uLight.xz + vec2(1e-5, 0.0));
    float facing = nhLen > 1e-3 ? dot(nh / nhLen, lh) * 0.5 + 0.5 : 0.5;
    vec3 side = mix(toLin(uShade), toLin(uLit), smoothstep(0.25, 0.75, facing));
    float up = clamp(n.y, 0.0, 1.0);
    float down = clamp(-n.y, 0.0, 1.0);
    c = mix(side, toLin(uTop), smoothstep(0.4, 0.92, up));
    c = mix(c, toLin(uShade) * 0.85, down);
    if (uFadeTop > -100.0) {
      float sideness = (1.0 - up) * (1.0 - down);
      float low = clamp(-vObjY / max(1e-3, -uFadeTop), 0.0, 1.0);
      c *= 1.0 - 0.2 * sideness * low * low;
    }
    c += uEdge * clamp(up * (1.0 - up) * 4.0, 0.0, 1.0);
    if (uRim > 0.0) {
      float rim = pow(1.0 - clamp(dot(n, uView), 0.0, 1.0), 3.0);
      c += uRim * rim * vec3(1.0, 0.93, 0.82);
    }
    if (uFadeTop > -100.0) {
      float fade = clamp((uFadeTop - vObjY) / max(1e-3, uFadeTop - uFadeBottom), 0.0, 1.0);
      c = mix(c, toLin(uFade), fade * fade * (3.0 - 2.0 * fade));
    }
  }
  // The miniature view's colour (a model's: a little fuller, a little more contrast), then Grade1.
  vec3 s = toSrgb(c);
  float luma = dot(s, vec3(0.299, 0.587, 0.114));
  s = mix(vec3(luma), s, 1.0 + 0.16 * uMini);
  s = clamp((s - 0.5) * (1.0 + 0.06 * uMini) + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(grade(s), 1.0);
}`;

function material(m, shared, extra = {}) {
  const col = (k, d) => new THREE.Color().fromArray(m[k] || d);
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uUnlit: { value: m.shader === 'unlit' },
      uBase: { value: col('BaseColor', [1, 1, 1]) },
      uTop: { value: col('TopColor', [1, 1, 1]) },
      uLit: { value: col('LitColor', [1, 1, 1]) },
      uShade: { value: col('ShadeColor', [1, 1, 1]) },
      uFade: { value: col('FadeColor', [1, 1, 1]) },
      uEdge: { value: m.EdgeLight || 0 },
      uRim: { value: m.Rim || 0 },
      uFadeTop: { value: m.FadeTop === undefined ? -1000 : m.FadeTop },
      uFadeBottom: { value: m.FadeBottom === undefined ? -1001 : m.FadeBottom },
      uObjY: { value: extra.objY || 0 },
      uBlink: extra.blink || { value: 0 },
      uEyeY: { value: extra.eyeY || 0 },
      uLight: shared.light,
      uView: shared.view,
      uMini: shared.mini,
    },
  });
}

function geometry(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.v, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.n, 3));
  g.setIndex(mesh.t);
  return g;
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);

// What every Linker on the page reads: where the pointer is, and which way the page last scrolled.
const input = { x: 0, y: 0, at: -1e9, scrollDir: 0, scrollAt: -1e9, lastY: 0 };
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  const move = (e) => { input.x = e.clientX; input.y = e.clientY; input.at = performance.now(); };
  addEventListener('pointermove', move, { passive: true });
  addEventListener('pointerdown', move, { passive: true });
  input.lastY = scrollY;
  addEventListener('scroll', () => {
    const dy = scrollY - input.lastY;
    input.lastY = scrollY;
    if (Math.abs(dy) > 1) { input.scrollDir = Math.sign(dy); input.scrollAt = performance.now(); }
  }, { passive: true });
}

let files;
function load() {
  files = files || Promise.all([
    fetch(new URL('scene.json', BASE)).then((r) => r.json()),
    fetch(new URL('linker.glb', BASE)).then((r) => r.arrayBuffer()),
  ]);
  return files;
}

// While a Linker is out of its picture (held, falling, dropping back), it is drawn on a canvas over the whole
// window, one for the page, lent to one Linker at a time.
let overlay = null;
let overlayOwner = null;
function borrowOverlay(owner) {
  if (overlayOwner && overlayOwner !== owner) return null;
  if (!overlay) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '40' });
    renderer.domElement.setAttribute('aria-hidden', 'true');
    overlay = { renderer, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60) };
  }
  if (!overlay.renderer.domElement.isConnected) document.body.append(overlay.renderer.domElement);
  overlay.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  overlay.renderer.setSize(innerWidth, innerHeight, false);
  overlayOwner = owner;
  return overlay;
}
function returnOverlay(owner) {
  if (overlayOwner !== owner) return;
  overlayOwner = null;
  overlay.renderer.clear();
  overlay.renderer.domElement.remove();
}

/** One live Linker drawn into `box` (its canvas fills it). Returns { run(on) }. */
async function make(box, { onFirstFrame, onTouch, fade = [0.5, 0.88] } = {}) {
  listen();
  const [scene3, glb] = await load();
  const gltf = await new GLTFLoader().parseAsync(glb.slice(0), BASE.href);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the shader writes the graded sRGB itself
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  // The canvas reaches ROOM of the box's height above it (the head at the top of a hop), the box's own picture
  // unchanged below; it fades out from fade[0] to fade[1] of the box's height, as the picture does.
  const ROOM = 0.16;
  const at = (f) => `${((ROOM + f) / (1 + ROOM) * 100).toFixed(1)}%`;
  const mask = `linear-gradient(#000 ${at(fade[0])}, transparent ${at(fade[1])})`;
  Object.assign(canvas.style, {
    position: 'absolute', left: '0', width: '100%', top: `${-ROOM * 100}%`, height: `${(1 + ROOM) * 100}%`,
    webkitMaskImage: mask, maskImage: mask, touchAction: 'none', cursor: 'grab',
  });

  const shared = {
    light: { value: new THREE.Vector3().fromArray(scene3.light).normalize() },
    view: { value: new THREE.Vector3() },
    mini: { value: scene3.miniature },
  };
  const blink = { value: 0 };
  const world = new THREE.Scene();
  const stone = new THREE.Group();
  world.add(stone);
  for (const p of scene3.parts) {
    stone.add(new THREE.Mesh(geometry(p.mesh), material({ ...p.mat, shader: p.shader }, shared, { objY: 0.5 })));
  }

  // The Linker, as the poster stands it on the stone.
  const L = scene3.linker;
  const S = L.scale;
  const H = 0.73 * S;                                      // feet to the top of the hood
  const home = new THREE.Vector3().fromArray(L.position);
  const homeYaw = THREE.MathUtils.degToRad(L.yaw);
  const holder = new THREE.Group();
  holder.position.copy(home);
  holder.rotation.y = homeYaw;
  holder.scale.setScalar(S);
  world.add(holder);
  const model = gltf.scene;
  holder.add(model);
  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      const m = L.mats[o.material.name] || L.mats.Body;
      o.material = material(m, shared, o.material.name === 'Eyes' ? { blink, eyeY: 0.5147 } : {});
      o.frustumCulled = false;
    }
  });
  model.updateMatrixWorld(true);
  const emblem = new THREE.Mesh(geometry(scene3.emblem.mesh), material({ shader: 'unlit', ...scene3.emblem.mat }, shared));
  model.add(emblem);
  bones.Body.attach(emblem);

  const rest = {};
  for (const name of ['Head', 'Body', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg']) rest[name] = bones[name].quaternion.clone();
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(gltf.animations.find((a) => a.name === 'Idle') || gltf.animations[0]).play();

  // The camera: the poster's (pitch 13 degrees, turned 45), orthographic, framed as linker.webp: the Linker about
  // 60% of the picture's height from just below its top, its stone under it fading out.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  const fwd = new THREE.Vector3(Math.sin(Math.PI / 4) * Math.cos(0.2269), -Math.sin(0.2269), -Math.cos(Math.PI / 4) * Math.cos(0.2269)).normalize();
  shared.view.value.copy(fwd).negate();
  const centre = new THREE.Vector3(0, 0.4, 0);
  camera.position.copy(centre).addScaledVector(fwd, -20);
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  const rightV = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const upV = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  // (The skinned mesh's own bounds are loose; the Linker is about 0.72 high and 0.3 across before its scale.)
  const lo = new THREE.Vector3(-0.16, 0, -0.16).multiplyScalar(S).add(home);
  const hi = new THREE.Vector3(0.16, 0.73, 0.16).multiplyScalar(S).add(home);
  let minU = Infinity, maxU = -Infinity;
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Vector3(i & 1 ? hi.x : lo.x, i & 2 ? hi.y : lo.y, i & 4 ? hi.z : lo.z);
    const u = c.sub(centre).dot(upV);
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
  }
  const frameH = (maxU - minU) / 0.6;
  const topU = maxU + 0.05 * frameH;
  const botU = topU - frameH;

  function frame() {
    const w = Math.max(1, box.clientWidth);
    const h = Math.max(1, Math.round(w * 1069 / 720 * (1 + ROOM)));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const half = frameH * (1 + ROOM) * (w / h) / 2;
    camera.left = -half; camera.right = half;
    camera.top = topU + ROOM * frameH; camera.bottom = botU;
    camera.updateProjectionMatrix();
  }
  frame();
  new ResizeObserver(frame).observe(box);

  // Screen and world: the page's canvas maps the camera's frustum onto its rectangle, whatever part of it is on
  // screen; the window's canvas carries the same mapping over the whole window.
  const pxPerUnit = () => canvas.getBoundingClientRect().width / (camera.right - camera.left);
  const toScreen = (v) => {
    const r = canvas.getBoundingClientRect();
    const p = v.clone().project(camera);
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  };
  const toWorld = (x, y, through) => {
    const r = canvas.getBoundingClientRect();
    const p = new THREE.Vector3((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0).unproject(camera);
    return p.addScaledVector(fwd, fwd.dot(through.clone().sub(p)));   // onto the screen-facing plane through `through`
  };
  function fitOverlay(o) {
    const r = canvas.getBoundingClientRect();
    const k = pxPerUnit();
    const cam = o.camera;
    cam.position.copy(camera.position);
    cam.quaternion.copy(camera.quaternion);
    cam.left = camera.left - r.left / k;
    cam.right = cam.left + innerWidth / k;
    cam.top = camera.top + r.top / k;
    cam.bottom = cam.top - innerHeight / k;
    cam.near = camera.near; cam.far = camera.far;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    if (o.renderer.getPixelRatio() !== pr) o.renderer.setPixelRatio(pr);
    const size = o.renderer.getSize(new THREE.Vector2());
    if (size.x !== innerWidth || size.y !== innerHeight) o.renderer.setSize(innerWidth, innerHeight, false);
  }

  // Where to look: the pointer, seen as a point in front of the page the Linker looks out at; down or up after a
  // scroll, as if watching the page go by; left alone a while, about by itself: up at the world above, to one
  // side, back at whoever is there.
  const look = { yaw: 0, pitch: 0.55, tyaw: 0, tpitch: 0.55 };
  let nextWander = 0;
  const headPos = new THREE.Vector3();
  function aim(now) {
    if (now - input.scrollAt < 900 && input.scrollAt > input.at) {
      look.tyaw = 0.12;
      look.tpitch = input.scrollDir > 0 ? -0.42 : 0.68;
    } else if (now - input.at < 3200) {
      bones.Head.getWorldPosition(headPos);
      const h = toScreen(headPos);
      const depth = Math.max(260, canvas.getBoundingClientRect().width * 0.9);
      const dx = input.x - h.x;
      const dy = input.y - h.y;
      look.tyaw = clamp(Math.atan2(dx, depth), -1.05, 1.05);
      look.tpitch = clamp(Math.atan2(-dy, Math.hypot(depth, dx)), -0.45, 0.7);
    } else if (now > nextWander) {
      const spots = [[0, 0.55], [-0.7, 0.35], [0.75, 0.3], [0.15, 0.05], [-0.3, 0.62], [0.5, 0.6]];
      const s = spots[Math.floor(Math.random() * spots.length)];
      look.tyaw = s[0]; look.tpitch = s[1];
      nextWander = now + 2200 + Math.random() * 2600;
    }
  }

  // Blinks: now and then, sometimes twice.
  let blinkAt = performance.now() + 2500;
  let blinkTwice = false;
  function blinkAmount(now) {
    const t = now - blinkAt;
    if (t > 170) {
      blinkAt = now + (blinkTwice ? 260 : 2400 + Math.random() * 3600);
      blinkTwice = !blinkTwice && Math.random() < 0.25;
      return 0;
    }
    return t < 0 ? 0 : Math.sin(Math.PI * t / 170) ** 0.6;
  }

  // A hop when clicked: a crouch, up and down again, landing with a little give.
  const HOP = 640;
  let hopAt = -1e9;
  function hop(now) {
    const t = (now - hopAt) / HOP;
    if (t < 0 || t > 1) return [0, 1];
    if (t < 0.16) return [0, 1 - 0.12 * Math.sin(Math.PI / 2 * t / 0.16)];
    if (t < 0.8) {
      const k = (t - 0.16) / 0.64;
      return [0.17 * Math.sin(Math.PI * k), 1 + 0.08 * Math.sin(Math.PI * k) * (1 - k)];
    }
    return [0, 1 - 0.08 * Math.sin(Math.PI * (t - 0.8) / 0.2)];
  }

  // Picked up and let go. mode: 'stand' on its stone, 'held' by the hood, 'fall' after being let go (out of sight
  // below the window), 'drop' back onto the stone from above, landing on its feet.
  let mode = 'stand';
  let modeAt = 0;
  const anchor = new THREE.Vector3();       // where it is held (the top of the hood), or flies (falling)
  const anchorVel = new THREE.Vector3();
  const lastAnchorVel = new THREE.Vector3();
  let swing = 0, swingVel = 0;              // the hanging body's swing in the screen's plane (0 = straight down)
  const GRAVITY = 14;                       // world units a second a second (the Linker is 1.4 high)
  let landAt = -1e9;
  const press = { on: false, x: 0, y: 0, at: 0, id: 0 };
  const samples = [];
  const setMode = (m, now) => { mode = m; modeAt = now; };

  function onLinker(x, y) {
    // The pointer over the Linker itself (not the stone): within its standing outline on screen.
    const f = toScreen(home);
    const t = toScreen(home.clone().add(new THREE.Vector3(0, H, 0)));
    const half = 0.2 * S * pxPerUnit();
    return x > f.x - half && x < f.x + half && y > t.y - 6 && y < f.y + 6;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'stand' || !onLinker(e.clientX, e.clientY)) return;
    if (onTouch) onTouch();
    Object.assign(press, { on: true, x: e.clientX, y: e.clientY, at: performance.now(), id: e.pointerId });
    e.preventDefault();
  });
  // (Followed on the window, so the pointer may go anywhere while it holds the Linker.)
  addEventListener('pointermove', (e) => {
    if (!press.on || e.pointerId !== press.id) return;
    const now = performance.now();
    if (mode === 'stand' && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6 && borrowOverlay(api)) {
      // Lifted by the hood: it starts from where it stands, the hood's top under the pointer.
      anchor.copy(home).add(new THREE.Vector3(0, H, 0));
      anchorVel.set(0, 0, 0); lastAnchorVel.set(0, 0, 0);
      swing = 0; swingVel = 0;
      samples.length = 0;
      setMode('held', now);
      canvas.style.cursor = 'grabbing';
      document.documentElement.style.cursor = 'grabbing';
    }
    if (mode === 'held') {
      samples.push({ x: e.clientX, y: e.clientY, t: now });
      while (samples.length > 6) samples.shift();
    }
  });
  const letGo = (e) => {
    if (!press.on || e.pointerId !== press.id) return;
    press.on = false;
    const now = performance.now();
    if (mode === 'stand') {
      if (now - hopAt > HOP) { hopAt = now; blinkAt = now + 90; }
    } else if (mode === 'held') {
      setMode('fall', now);
      canvas.style.cursor = 'grab';
      document.documentElement.style.cursor = '';
    }
  };
  addEventListener('pointerup', letGo);
  addEventListener('pointercancel', letGo);

  const qParent = new THREE.Quaternion();
  const qLook = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const qPitch = new THREE.Quaternion();
  const qBody = new THREE.Quaternion();
  const qHome = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), homeYaw);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const rightAxis = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const hang = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const clock = new THREE.Clock();
  let running = false;
  let shown = false;

  // A bone turned by a world rotation, after the clip has set it.
  function turnBone(bone, q) {
    bone.parent.getWorldQuaternion(qParent);
    bone.quaternion.premultiply(qParent.clone().invert().multiply(q).multiply(qParent));
  }

  function place(now, dt) {
    const t = (now - modeAt) / 1000;
    if (mode === 'stand') {
      aim(now);
      look.yaw = damp(look.yaw, look.tyaw, 6, dt);
      look.pitch = damp(look.pitch, look.tpitch, 6, dt);
      // The body turns a little after a far look; the head does the rest.
      holder.quaternion.setFromAxisAngle(yAxis, homeYaw + look.yaw * 0.22);
      const [lift, hopSquash] = hop(now);
      const lt = (now - landAt) / 1000;
      // (Landing: down and back in 0.16 s, then a little stretch.)
      const land = lt >= 0 && lt < 0.16 ? 1 - 0.24 * Math.sin(Math.PI * lt / 0.16)
        : lt >= 0.16 && lt < 0.42 ? 1 + 0.06 * Math.sin(Math.PI * (lt - 0.16) / 0.26) : 1;
      const squash = hopSquash * land;
      holder.position.copy(home).addScaledVector(yAxis, lift * S);
      holder.scale.set(S / Math.sqrt(squash), S * squash, S / Math.sqrt(squash));
      return;
    }
    holder.scale.setScalar(S);
    if (mode === 'held' || mode === 'fall') {
      if (mode === 'held') {
        // The hood follows the pointer, a touch behind; the body hangs from it and swings after it.
        const want = toWorld(input.x, input.y, home);
        tmp.copy(anchor);
        anchor.lerp(want, 1 - Math.exp(-22 * dt));
        anchorVel.copy(anchor).sub(tmp).divideScalar(Math.max(dt, 1e-3));
      } else {
        // Let go: it keeps the throw (the pointer's last speed, softened), falls, and tumbles on as it swung.
        if (t < dt * 1.5 && samples.length > 1) {
          const a = samples[0], b = samples[samples.length - 1];
          const span = Math.max(16, b.t - a.t) / 1000;
          const k = 1 / pxPerUnit();
          anchorVel.copy(rightV).multiplyScalar((b.x - a.x) / span * k * 0.6).addScaledVector(upV, -(b.y - a.y) / span * k * 0.6);
        }
        anchorVel.y -= GRAVITY * dt;
        anchor.addScaledVector(anchorVel, dt);
      }
      const accel = tmp.copy(anchorVel).sub(lastAnchorVel).divideScalar(Math.max(dt, 1e-3)).dot(rightV);
      lastAnchorVel.copy(anchorVel);
      const len = H * 0.6;
      if (mode === 'held') {
        swingVel += (-(GRAVITY / len) * Math.sin(swing) - clamp(accel, -60, 60) / len * Math.cos(swing) - 2.6 * swingVel) * dt;
      } else {
        swingVel *= Math.exp(-0.6 * dt);
      }
      swing = clamp(swing + swingVel * dt, -2.6, 2.6);
      // Hanging: from the hood's top down to the feet, turned by the swing in the screen's plane.
      hang.copy(rightV).multiplyScalar(Math.sin(swing)).addScaledVector(yAxis, -Math.cos(swing)).normalize();
      qBody.setFromUnitVectors(tmp.set(0, -1, 0), hang);
      holder.quaternion.copy(qBody).multiply(qHome);
      holder.position.copy(anchor).addScaledVector(hang, H);
      // Out of sight below the window: back onto its stone, from above.
      const top = toScreen(anchor);
      if (mode === 'fall' && (top.y > innerHeight + 40 || t > 1.8)) {
        const k = pxPerUnit() * upV.y;
        const feet = toScreen(home);
        const above = Math.max(1.2, (feet.y - Math.min(canvas.getBoundingClientRect().top, 0) + 60) / k);
        anchor.copy(home).addScaledVector(yAxis, above);
        anchorVel.set(0, 0, 0);
        swing = 0; swingVel = 0;
        setMode('drop', now);
      }
      return;
    }
    // Dropping back: upright, feet first, straight down onto the stone; it lands on its feet and stands.
    anchorVel.y -= GRAVITY * dt;
    anchor.addScaledVector(anchorVel, dt);
    holder.quaternion.copy(qHome);
    if (anchor.y <= home.y) {
      anchor.copy(home);
      landAt = now;
      blinkAt = now + 40;
      setMode('stand', now);
      returnOverlay(api);
    }
    holder.position.copy(anchor);
  }

  function pose(now) {
    if (mode === 'stand') {
      holder.getWorldDirection(facing);
      rightAxis.crossVectors(facing, yAxis).normalize();
      qYaw.setFromAxisAngle(yAxis, look.yaw * 0.78);
      qPitch.setFromAxisAngle(rightAxis, look.pitch);
      qLook.multiplyQuaternions(qYaw, qPitch);
      turnBone(bones.Head, qLook);
      blink.value = blinkAmount(now);
      return;
    }
    if (mode === 'drop') {
      // Coming down: looking down at where it will land, eyes open.
      rightAxis.set(-1, 0, 0).applyQuaternion(holder.quaternion);
      turnBone(bones.Head, qPitch.setFromAxisAngle(rightAxis, -0.3));
      blink.value = 0;
      return;
    }
    // Limp: the head drooped forward, the arms and legs left behind by the swing, the eyes half shut.
    rightAxis.set(-1, 0, 0).applyQuaternion(holder.quaternion);   // its own right, however it hangs
    turnBone(bones.Head, qPitch.setFromAxisAngle(rightAxis, -0.5));
    // (The arms only a touch, staying under the cloak, which here does not move with them; the legs dangle freely.)
    const lag = clamp(-swingVel * 0.12, -0.5, 0.5);
    tmp.copy(fwd);
    for (const name of ['LeftLeg', 'RightLeg']) turnBone(bones[name], qYaw.setFromAxisAngle(tmp, lag));
    for (const name of ['LeftArm', 'RightArm']) turnBone(bones[name], qYaw.setFromAxisAngle(tmp, lag * 0.2));
    blink.value = 0.55;
  }

  const api = {};
  function tick() {
    if (!running && mode === 'stand') return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();
    for (const name in rest) bones[name].quaternion.copy(rest[name]);
    mixer.update(dt);
    place(now, dt);
    model.updateMatrixWorld(true);
    pose(now);
    if (mode === 'stand') {
      holder.visible = true;
      renderer.render(world, camera);
    } else if (overlayOwner === api) {
      // The stone stays in the page; the Linker is drawn over the window.
      holder.visible = false;
      renderer.render(world, camera);
      holder.visible = true;
      stone.visible = false;
      fitOverlay(overlay);
      overlay.renderer.render(world, overlay.camera);
      stone.visible = true;
    }
    if (!shown) { shown = true; if (onFirstFrame) onFirstFrame(); }
    requestAnimationFrame(tick);
  }

  box.appendChild(canvas);
  api.run = (on) => {
    if (on && !running) { running = true; clock.getDelta(); requestAnimationFrame(tick); }
    if (!on) running = false;
  };
  return api;
}

/** The Linker at the foot of the page (`figure`, its picture inside until the first frame) and, if given, the
 *  small one in `companion`, shown once the reader has left `hero` and until the one at the foot comes into view. */
export async function start(figure, { companion = null, hero = null, hint = null } = {}) {
  // The hint, over each Linker once per visitor (the small one in the corner and the one at the foot, each its own
  // time): a moment after it shows, for a few seconds. It counts as seen (remembered in this browser) once it has
  // been up its whole time or that Linker has been touched; until then it comes again. ?hint in the address forgets
  // both (to look at them again).
  const forget = (() => { try { return new URLSearchParams(location.search).has('hint'); } catch (e) { return false; } })();
  function makeHint(box, key, el, visible) {
    if (!el) return { show() {}, touched() {} };
    const remember = () => { try { localStorage.setItem(key, '1'); } catch (e) { /* no storage: fine */ } };
    let due = true, up = false, timer = 0;
    try {
      if (forget) localStorage.removeItem(key);
      if (localStorage.getItem(key)) due = false;
    } catch (e) { /* no storage: show it this once */ }
    const hide = () => { el.classList.remove('on'); up = false; };
    return {
      show() {
        if (!due || up || timer) return;
        timer = setTimeout(() => {
          timer = 0;
          if (!due || !visible()) return;
          if (el.parentNode !== box) box.append(el);
          up = true;
          requestAnimationFrame(() => el.classList.add('on'));
          setTimeout(() => { if (!up) return; hide(); due = false; remember(); }, 6000);
        }, 1200);
      },
      touched() { due = false; remember(); hide(); },
    };
  }
  const seen = { hero: !!hero, figure: false };
  const bigHint = makeHint(figure, 'semonemo.linkerHint.foot', hint, () => seen.figure);
  const smallHint = companion
    ? makeHint(companion, 'semonemo.linkerHint.corner', hint && hint.cloneNode(true), () => companion.classList.contains('on'))
    : null;

  const big = await make(figure, { onFirstFrame: () => figure.classList.add('is-live'), onTouch: () => bigHint.touched() });
  const small = companion ? await make(companion, { fade: [0.56, 0.86], onTouch: () => smallHint.touched() }) : null;
  const update = () => {
    const awake = !document.hidden;
    big.run(awake && seen.figure);
    if (seen.figure) bigHint.show();
    if (small) {
      const show = !seen.hero && !seen.figure;
      companion.classList.toggle('on', show);
      small.run(awake && show);
      if (show) smallHint.show();
    }
  };
  new IntersectionObserver(([e]) => { seen.figure = e.isIntersecting; update(); }, { threshold: 0.12 }).observe(figure);
  if (hero) new IntersectionObserver(([e]) => { seen.hero = e.intersectionRatio > 0.3; update(); }, { threshold: [0, 0.3, 0.6] }).observe(hero);
  document.addEventListener('visibilitychange', update);
  update();
}
