import {
  AmbientLight, CanvasTexture, DirectionalLight, Mesh, MeshStandardMaterial,
  OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer, ACESFilmicToneMapping
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createDieThrowVisual, dieMaterialFaces, diePips, dieThrowPose, dieShowcaseQuaternion } from "../../features/games/dice-solid.js";
import { paintDiceSurface, shadowFilter } from "./dice-surface.js";

const materialFaces = dieMaterialFaces;
const entries = new Set();
let engine, frame = 0, idleTimer, cosmeticTimer = 0, styleObserver, lastFrame = 0, renderedFrames = 0;

function refreshStyles() {
  for (const entry of entries) entry.refreshCss = true;
  schedule();
}

function stylesheetLoaded(event) {
  if (event.target.matches?.('link[rel="stylesheet"]')) refreshStyles();
}

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

function disposeMaterials(entry) {
  for (const material of entry.materials ?? []) { material.map.dispose(); material.dispose(); }
}

function cosmeticPlayback(entry) {
  const active = entry.visible && !document.hidden && !entry.motion.matches;
  for (const animation of [...(entry.sources ?? []), ...(entry.nativeAnimations ?? [])]) {
    if (!active) { animation.pause(); if (entry.motion.matches) animation.currentTime = 0; }
    else if (animation.playState === "paused") animation.play();
  }
}

function syncAnimations(entry) {
  const sources = [...entry.probe.getAnimations({ subtree: true }), ...entry.oneProbe.getAnimations({ subtree: true })];
  const info = sources.map((animation) => ({ frames: animation.effect.getKeyframes(), timing: animation.effect.getTiming() }));
  const signature = JSON.stringify(info);
  if (entry.animationKey === signature && sources.every((source, i) => source === entry.sources?.[i])) return;
  for (const animation of entry.nativeAnimations ?? []) animation.cancel();
  entry.sources = sources; entry.animationKey = signature; entry.nativeAnimations = [];
  entry.sampleCosmetics = false;
  info.forEach(({ frames, timing }, i) => {
    const paletteOnly = sources[i].effect.target === entry.oneProbe;
    const pipAnimation = sources[i].effect.target !== entry.probe && !paletteOnly;
    if (pipAnimation || frames.some((keyframe) => Object.keys(keyframe).some((key) => /^(background|border|boxShadow|color|width|height)/.test(key)))) entry.sampleCosmetics = true;
    if (pipAnimation || paletteOnly) return;
    const allowed = new Set(["offset", "easing", "composite", "transform", "filter", "opacity"]);
    const nativeFrames = frames.map((keyframe) => Object.fromEntries(Object.entries(keyframe).filter(([key]) => allowed.has(key))));
    if (!nativeFrames.some((keyframe) => ["transform", "filter", "opacity"].some((key) => key in keyframe))) return;
    const animation = entry.canvas.animate(nativeFrames, timing);
    animation.currentTime = sources[i].currentTime;
    entry.nativeAnimations.push(animation);
  });
  cosmeticPlayback(entry);
}

function samplePalette(entry) {
  const body = getComputedStyle(entry.probe), pip = getComputedStyle(entry.probe.firstChild);
  const transform = new DOMMatrixReadOnly(pip.transform === "none" ? undefined : pip.transform);
  const palette = {
    backgroundColor: body.backgroundColor, backgroundImage: body.backgroundImage,
    backgroundSize: body.backgroundSize, backgroundPosition: body.backgroundPosition,
    borderWidth: parseFloat(body.borderTopWidth) || 0, borderStyle: body.borderTopStyle, borderColor: body.borderTopColor,
    pip: pip.backgroundColor, pipSize: Math.max(14, Math.min(27, (parseFloat(pip.width) || 12) / 76 * 128)),
    pipRadius: Math.max(0, (parseFloat(pip.borderTopLeftRadius) || 0) / 76 * 256),
    pipTransform: [transform.a, transform.b, transform.c, transform.d, 0, 0],
    pipGlow: Math.min(30, parseFloat(/\)\s+[^,]*?(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/.exec(pip.boxShadow)?.[3]) || 0)
  };
  const oneBody = getComputedStyle(entry.oneProbe), onePip = getComputedStyle(entry.oneProbe.firstChild);
  const onePalette = {
    ...palette,
    backgroundColor: oneBody.backgroundColor, backgroundImage: oneBody.backgroundImage,
    backgroundSize: oneBody.backgroundSize, backgroundPosition: oneBody.backgroundPosition,
    pip: onePip.backgroundColor, hidePips: onePip.display === "none"
  };
  entry.host.style.filter = shadowFilter(body.boxShadow, entry.control.clientWidth / 76);
  entry.canvas.style.filter = body.filter;
  entry.canvas.style.opacity = body.opacity;
  entry.canvas.style.transform = body.transform;
  const key = JSON.stringify([palette, onePalette, entry.imageUrl, entry.oneImageUrl, Boolean(entry.image), Boolean(entry.oneImage)]);
  if (entry.paletteKey === key) return;
  entry.paletteKey = key;
  if (!entry.materials) entry.materials = materialFaces.map(() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    return new MeshStandardMaterial({ map: texture, roughness: .48, metalness: .06 });
  });
  entry.materials.forEach((material, i) => {
    const one = materialFaces[i] === 1;
    paintDiceSurface(material.map.image, materialFaces[i], one ? onePalette : palette, one ? entry.oneImage : entry.image, diePips);
    material.map.needsUpdate = true;
  });
  entry.dirty = true;
}

function paletteImage(entry, probe, field) {
  const imageUrl = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(probe).backgroundImage)?.[1];
  if (entry[`${field}Url`] !== imageUrl) {
    entry[field] = null; entry[`${field}Url`] = imageUrl;
  }
  if (imageUrl && !entry[field] && entry[`${field}Loading`] !== imageUrl) {
    entry[`${field}Loading`] = imageUrl;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (entries.has(entry) && entry[`${field}Url`] === imageUrl) { entry[field] = image; samplePalette(entry); schedule(); }
    };
    image.src = imageUrl;
  }
}

function applyPalette(entry, props) {
  for (const probe of [entry.probe, entry.oneProbe]) {
    probe.className = `die die-skin-${props.skin} dice-solid-palette`;
    probe.removeAttribute("style");
    for (const [key, value] of Object.entries(props.faceStyle ?? {})) {
      if (key.startsWith("--")) probe.style.setProperty(key, value);
      else if (["background", "backgroundColor", "backgroundImage", "backgroundSize", "backgroundPosition", "border", "borderColor", "borderWidth", "borderStyle", "borderRadius", "boxShadow", "color", "filter", "opacity", "animation", "transform"].includes(key)) probe.style[key] = value;
    }
  }
  paletteImage(entry, entry.probe, "image");
  paletteImage(entry, entry.oneProbe, "oneImage");
  syncAnimations(entry);
  samplePalette(entry);
  schedule();
}

function schedule() {
  clearTimeout(cosmeticTimer); cosmeticTimer = 0;
  if (!frame) frame = requestAnimationFrame(draw);
}

function draw(now) {
  frame = 0;
  if (!engine || engine.lost) return;
  for (const entry of entries) {
    if (entry.refreshCss) { entry.refreshCss = false; applyPalette(entry, entry.props); }
  }
  const throwing = [...entries].some((entry) => entry.visible && !document.hidden && entry.duration && now < entry.started + entry.duration);
  const active = throwing || [...entries].some((entry) => entry.visible && !document.hidden && !entry.motion.matches && entry.props.showcase);
  if (active && now - lastFrame < (throwing ? 30 : 50)) { schedule(); return; }
  lastFrame = now;
  for (const entry of entries) {
    if (entry.visible && !document.hidden && !entry.motion.matches && entry.sampleCosmetics && now - (entry.sampledAt ?? 0) >= 80) {
      samplePalette(entry); entry.sampledAt = now;
    }
    const spinning = entry.props.showcase && !entry.motion.matches && !document.hidden;
    if (!entry.visible || !entry.width || !entry.height || !entry.materials || (!entry.dirty && !entry.duration && !spinning)) continue;
    const progress = entry.duration ? Math.min(1, (now - entry.started) / entry.duration) : 1;
    const pose = dieThrowPose(entry.value, progress, entry.index, entry.visual);
    const { renderer, scene, camera, cube } = engine;
    if (engine.width !== entry.width || engine.height !== entry.height) {
      renderer.setSize(entry.width, entry.height, false);
      engine.width = entry.width; engine.height = entry.height;
    }
    const half = entry.props.showcase ? 1.95 : 1.58 + (1 - progress) * .65;
    const aspect = entry.width / entry.height;
    camera.left = -half * aspect; camera.right = half * aspect;
    camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
    cube.material = entry.materials;
    cube.material.forEach((material, i) => material.color.setScalar(entry.props.showcase || materialFaces[i] === entry.value ? 1 : .83));
    if (entry.props.showcase) {
      entry.showcaseTime = (entry.showcaseTime ?? 0) + (spinning ? Math.min(.1, (now - (entry.showcaseAt ?? now)) / 1000) : 0);
      entry.showcaseAt = now;
      cube.quaternion.copy(dieShowcaseQuaternion(entry.value, entry.showcaseTime));
    } else cube.quaternion.copy(pose.quaternion);
    if (entry.props.showcase) cube.position.set(0, 0, 0);
    else cube.position.set(pose.offset / 100, pose.height / 100, pose.depth / 100);
    renderer.render(scene, camera);
    entry.context.clearRect(0, 0, entry.width, entry.height);
    entry.context.drawImage(renderer.domElement, 0, 0);
    entry.control.dataset.diceSolid = "ready";
    entry.host.dataset.dicePose = cube.quaternion.toArray().map((value) => value.toFixed(5)).join(",");
    entry.host.dataset.diceMotion = spinning ? "showcase" : progress === 1 ? "settled" : "rolling";
    if (progress === 1) { entry.duration = 0; entry.host.dataset.diceResult = String(entry.value); }
    entry.dirty = false;
    renderedFrames += 1;
  }
  if (active) schedule();
  else if (!document.hidden && [...entries].some((entry) => entry.visible && !entry.motion.matches && entry.sampleCosmetics && entry.sources.some((animation) => animation.playState === "running"))) {
    cosmeticTimer = setTimeout(() => { cosmeticTimer = 0; schedule(); }, 80);
  }
}

export function diceRendererStats() {
  return { contexts: engine ? 1 : 0, dice: entries.size, scheduled: Boolean(frame || cosmeticTimer), renderedFrames };
}

export function mountDie(host, initial) {
  try { getEngine(); } catch { return { update() {}, destroy() {} }; }
  const canvas = document.createElement("canvas");
  const probe = document.createElement("span"), pip = document.createElement("span");
  pip.className = "pip"; probe.append(pip);
  const oneProbe = probe.cloneNode(true);
  oneProbe.dataset.dieFace = "1";
  const control = host.closest(".die");
  probe.setAttribute("aria-hidden", "true"); oneProbe.setAttribute("aria-hidden", "true");
  host.append(canvas); document.body.append(probe, oneProbe);
  const slot = host.closest(".dice-throw-slot");
  const index = slot ? Array.prototype.indexOf.call(slot.parentElement.children, slot) : 0;
  const entry = { host, control, canvas, probe, oneProbe, context: canvas.getContext("2d"), index, visible: true, dirty: true, duration: 0 };
  entries.add(entry);
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  entry.motion = motion;
  if (!styleObserver) {
    styleObserver = new MutationObserver((records) => {
      if (records.some((record) => record.type === "attributes" || record.target.nodeName === "STYLE" || record.target.parentElement?.closest("style") || [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeName === "STYLE" || node.nodeName === "LINK"))) refreshStyles();
    });
    styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
    styleObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    document.addEventListener("load", stylesheetLoaded, true);
  }
  let previous;
  const update = (props) => {
    entry.props = props;
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
    if (entry.materials) samplePalette(entry);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([record]) => {
    entry.visible = record.isIntersecting;
    cosmeticPlayback(entry);
    if (entry.visible) { entry.dirty = true; schedule(); }
  });
  intersection.observe(host);
  const settle = () => {
    syncAnimations(entry);
    cosmeticPlayback(entry);
    if (document.hidden || motion.matches) { entry.duration = 0; entry.dirty = true; }
    samplePalette(entry);
    schedule();
  };
  document.addEventListener("visibilitychange", settle);
  motion.addEventListener("change", settle);
  update(initial); resize();
  return {
    update,
    destroy() {
      entries.delete(entry); resizeObserver.disconnect(); intersection.disconnect();
      document.removeEventListener("visibilitychange", settle); motion.removeEventListener("change", settle);
      for (const animation of entry.nativeAnimations ?? []) animation.cancel();
      disposeMaterials(entry); canvas.remove(); probe.remove(); oneProbe.remove(); delete control.dataset.diceSolid;
      if (!entries.size) {
        cancelAnimationFrame(frame); frame = 0;
        clearTimeout(cosmeticTimer); cosmeticTimer = 0;
        styleObserver.disconnect(); styleObserver = null;
        document.removeEventListener("load", stylesheetLoaded, true);
        idleTimer = setTimeout(() => {
          engine.geometry.dispose(); engine.renderer.dispose(); engine.renderer.forceContextLoss(); engine = null;
        }, 1000);
      }
    }
  };
}
