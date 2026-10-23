import {
  AmbientLight, CanvasTexture, DirectionalLight, Mesh, MeshStandardMaterial,
  OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer, ACESFilmicToneMapping
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createDieThrowVisual, dieMaterialFaces, diePips, dieThrowPose } from "../../features/games/dice-solid.js";

const materialFaces = dieMaterialFaces;
const entries = new Set();
let engine, frame = 0, idleTimer, lastFrame = 0, renderedFrames = 0;

function getEngine() {
  clearTimeout(idleTimer);
  if (engine) return engine;
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new Scene();
  const camera = new OrthographicCamera(-1.55, 1.55, 1.55, -1.55, .1, 40);
  camera.position.set(1.4, 9, 2.3);
  camera.lookAt(0, 0, 0);
  const geometry = new RoundedBoxGeometry(2, 2, 2, 4, .24);
  const cube = new Mesh(geometry);
  scene.add(cube, new AmbientLight(0xffffff, 2));
  const light = new DirectionalLight(0xffffff, 3);
  light.position.set(-3, 8, 5);
  scene.add(light);
  const instance = { renderer, scene, camera, cube, geometry, width: 0, height: 0 };
  engine = instance;
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    if (engine !== instance) return;
    event.preventDefault();
    engine.lost = true;
    for (const entry of entries) delete entry.control.dataset.diceSolid;
    cancelAnimationFrame(frame); frame = 0;
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    if (engine !== instance) return;
    engine.lost = false;
    for (const entry of entries) entry.dirty = true;
    schedule();
  });
  return engine;
}

function paintTexture(value, palette, image) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = palette.radial
    ? context.createRadialGradient(85, 65, 0, 128, 128, 240)
    : context.createLinearGradient(0, 0, 256, 256);
  palette.colors.forEach((color, i) => gradient.addColorStop(i / Math.max(1, palette.colors.length - 1), color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  if (image) {
    const scale = Math.max(256 / image.width, 256 / image.height);
    context.drawImage(image, (256 - image.width * scale) / 2, (256 - image.height * scale) / 2, image.width * scale, image.height * scale);
  }
  for (const dot of diePips[value]) {
    const x = 128 + ((dot - 1) % 3 - 1) * 59;
    const y = 128 + (Math.floor((dot - 1) / 3) - 1) * 59;
    const radius = palette.pipSize;
    // A small inset lip gives pips depth without multiplying meshes/draw calls.
    context.beginPath(); context.arc(x, y + 1.4, radius + 1.5, 0, Math.PI * 2);
    context.fillStyle = "rgba(255,255,255,.25)"; context.fill();
    context.fillStyle = palette.pip;
    context.beginPath();
    if (palette.squarePips) context.roundRect(x - radius, y - radius, radius * 2, radius * 2, 3);
    else context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function disposeMaterials(entry) {
  for (const material of entry.materials ?? []) { material.map.dispose(); material.dispose(); }
}

function applyPalette(entry, props) {
  const { probe } = entry;
  probe.className = `die die-skin-${props.skin} dice-solid-palette`;
  probe.removeAttribute("style");
  for (const [key, value] of Object.entries(props.faceStyle ?? {})) {
    if (key.startsWith("--")) probe.style.setProperty(key, value);
    else if (["background", "backgroundColor", "backgroundImage", "backgroundSize", "borderColor", "color"].includes(key)) probe.style[key] = value;
  }
  const body = getComputedStyle(probe), pip = getComputedStyle(probe.firstChild);
  const colors = body.backgroundImage.match(/rgba?\([^)]*\)/g) ?? [body.backgroundColor];
  const palette = {
    colors: colors.length > 1 ? colors : [colors[0] === "rgba(0, 0, 0, 0)" ? "#f4edda" : colors[0], colors[0] === "rgba(0, 0, 0, 0)" ? "#e1d7bd" : colors[0]],
    radial: body.backgroundImage.startsWith("radial-gradient"), pip: pip.backgroundColor,
    pipSize: Math.max(18, Math.min(24, parseFloat(pip.width) / (probe.offsetWidth || 76) * 128)),
    squarePips: parseFloat(pip.borderRadius) < 3
  };
  const key = JSON.stringify([palette, body.backgroundImage]);
  if (entry.paletteKey === key) return;
  entry.paletteKey = key;
  const build = (image) => {
    if (!entries.has(entry) || entry.paletteKey !== key) return;
    disposeMaterials(entry);
    entry.materials = materialFaces.map((face) => new MeshStandardMaterial({
      map: paintTexture(face, palette, image), roughness: .48, metalness: .06
    }));
    entry.dirty = true;
    schedule();
  };
  build();
  const imageUrl = /url\(["']?([^"')]+)["']?\)/.exec(body.backgroundImage)?.[1];
  if (imageUrl) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => build(image);
    image.src = imageUrl;
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(draw);
}

function draw(now) {
  frame = 0;
  if (!engine || engine.lost) return;
  const active = [...entries].some((entry) => entry.visible && entry.duration && now < entry.started + entry.duration);
  if (active && now - lastFrame < 30) { schedule(); return; }
  lastFrame = now;
  for (const entry of entries) {
    if (!entry.visible || !entry.width || !entry.height || !entry.materials || (!entry.dirty && !entry.duration)) continue;
    const progress = entry.duration ? Math.min(1, (now - entry.started) / entry.duration) : 1;
    const pose = dieThrowPose(entry.value, progress, entry.index, entry.visual);
    const { renderer, scene, camera, cube } = engine;
    if (engine.width !== entry.width || engine.height !== entry.height) {
      renderer.setSize(entry.width, entry.height, false);
      engine.width = entry.width; engine.height = entry.height;
    }
    const half = 1.58 + (1 - progress) * .65;
    const aspect = entry.width / entry.height;
    camera.left = -half * aspect; camera.right = half * aspect;
    camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
    cube.material = entry.materials;
    cube.material.forEach((material, i) => material.color.setScalar(materialFaces[i] === entry.value ? 1 : .83));
    cube.quaternion.copy(pose.quaternion);
    cube.position.set(pose.offset / 100, pose.height / 100, pose.depth / 100);
    renderer.render(scene, camera);
    entry.context.clearRect(0, 0, entry.width, entry.height);
    entry.context.drawImage(renderer.domElement, 0, 0);
    entry.control.dataset.diceSolid = "ready";
    entry.host.dataset.dicePose = cube.quaternion.toArray().map((value) => value.toFixed(5)).join(",");
    entry.host.dataset.diceMotion = progress === 1 ? "settled" : "rolling";
    if (progress === 1) { entry.duration = 0; entry.host.dataset.diceResult = String(entry.value); }
    entry.dirty = false;
    renderedFrames += 1;
  }
  if (active) schedule();
}

export function diceRendererStats() {
  return { contexts: engine ? 1 : 0, dice: entries.size, scheduled: Boolean(frame), renderedFrames };
}

export function mountDie(host, initial) {
  try { getEngine(); } catch { return { update() {}, destroy() {} }; }
  const canvas = document.createElement("canvas");
  const probe = document.createElement("span"), pip = document.createElement("span");
  pip.className = "pip"; probe.append(pip);
  const control = host.closest(".die");
  host.append(canvas, probe);
  const slot = host.closest(".dice-throw-slot");
  const index = slot ? Array.prototype.indexOf.call(slot.parentElement.children, slot) : 0;
  const entry = { host, control, canvas, probe, context: canvas.getContext("2d"), index, visible: true, dirty: true, duration: 0 };
  entries.add(entry);
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let previous;
  const update = (props) => {
    applyPalette(entry, props);
    if (!previous || props.value !== previous.value || props.rollKey !== previous.rollKey) {
      if (!previous || props.animate) entry.visual = createDieThrowVisual();
      entry.value = props.value;
      entry.started = performance.now();
      entry.duration = props.animate && !motion.matches && !document.hidden ? 760 + index * 25 : 0;
      entry.dirty = true;
      host.dataset.diceMotion = entry.duration ? "rolling" : "pending";
    }
    previous = props;
    schedule();
  };
  const resize = () => {
    const ratio = Math.min(Math.max(devicePixelRatio || 1, 1.5), 2);
    entry.width = Math.min(320, Math.round(host.clientWidth * ratio));
    entry.height = Math.min(320, Math.round(host.clientHeight * ratio));
    if (canvas.width !== entry.width || canvas.height !== entry.height) {
      canvas.width = entry.width; canvas.height = entry.height;
      entry.dirty = true;
      schedule();
    }
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([record]) => {
    entry.visible = record.isIntersecting;
    if (entry.visible) { entry.dirty = true; schedule(); }
  });
  intersection.observe(host);
  const settle = () => {
    if (document.hidden || motion.matches) { entry.duration = 0; entry.dirty = true; schedule(); }
  };
  document.addEventListener("visibilitychange", settle);
  motion.addEventListener("change", settle);
  update(initial); resize();
  return {
    update,
    destroy() {
      entries.delete(entry); resizeObserver.disconnect(); intersection.disconnect();
      document.removeEventListener("visibilitychange", settle); motion.removeEventListener("change", settle);
      disposeMaterials(entry); canvas.remove(); probe.remove(); delete control.dataset.diceSolid;
      if (!entries.size) {
        cancelAnimationFrame(frame); frame = 0;
        idleTimer = setTimeout(() => {
          engine.geometry.dispose(); engine.renderer.dispose(); engine.renderer.forceContextLoss(); engine = null;
        }, 1000);
      }
    }
  };
}
