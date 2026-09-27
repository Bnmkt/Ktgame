export function normalizeCosmeticCss(value) {
  return String(value ?? "").replace(/[{}@]/g, "").trim().slice(0, 2000);
}

export function normalizeCustomKeyframes(value) {
  let source = String(value ?? "").trim().slice(0, 4000);
  const completeRule = source.match(/^@keyframes\s+[a-z_][a-z0-9_-]*\s*\{([\s\S]*)\}$/i);
  if (completeRule) source = completeRule[1].trim();
  if (!source || /@|url\s*\(|expression\s*\(|javascript:|behavior\s*:|-moz-binding|[<>\\]/i.test(source)) return "";
  const allowedProperties = new Set(["transform", "opacity", "filter", "box-shadow", "background-position", "background-color", "border-color", "color", "letter-spacing"]);
  const selectorPart = "(?:from|to|(?:100|\\d{1,2})(?:\\.\\d+)?%)";
  const blockPattern = new RegExp(`((?:${selectorPart})(?:\\s*,\\s*(?:${selectorPart}))*)\\s*\\{([^{}]*)\\}`, "gi");
  const blocks = [];
  let cursor = 0;
  let match;
  while ((match = blockPattern.exec(source))) {
    if (source.slice(cursor, match.index).trim()) return "";
    const declarations = [];
    for (const chunk of match[2].split(";")) {
      const separator = chunk.indexOf(":");
      if (separator < 1) continue;
      const property = chunk.slice(0, separator).trim().toLowerCase();
      const propertyValue = chunk.slice(separator + 1).trim();
      if (!allowedProperties.has(property) || !propertyValue || /[{}@<>\\]|url\s*\(|expression\s*\(|javascript:/i.test(propertyValue)) continue;
      declarations.push(`${property}:${propertyValue}`);
    }
    if (!declarations.length) return "";
    blocks.push(`${match[1].toLowerCase()}{${declarations.join(";")};}`);
    cursor = blockPattern.lastIndex;
  }
  if (source.slice(cursor).trim() || blocks.length < 2) return "";
  return blocks.join("");
}

export function normalizeCosmeticMotion(value) {
  if (!value || typeof value !== "object") return null;
  const number = (key, fallback, min, max) => {
    const parsed = Number(value[key]);
    return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
  };
  const option = (key, fallback, choices) => choices.includes(String(value[key])) ? String(value[key]) : fallback;
  return {
    version: 1,
    preset: option("preset", "none", ["none", "pulse", "float", "translate-x", "translate-y", "bounce", "shake", "spin", "swing", "zoom", "glow", "custom"]),
    duration: number("duration", 2.4, 0.2, 20),
    delay: number("delay", 0, 0, 10),
    easing: option("easing", "ease-in-out", ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "steps(2,end)", "steps(4,end)"]),
    iterations: option("iterations", "infinite", ["1", "2", "3", "infinite"]),
    direction: option("direction", "normal", ["normal", "reverse", "alternate", "alternate-reverse"]),
    fillMode: option("fillMode", "both", ["none", "forwards", "backwards", "both"]),
    distance: number("distance", 10, 0, 60),
    scale: number("scale", 8, 0, 40),
    rotation: number("rotation", 8, 0, 360),
    intensity: number("intensity", 20, 0, 100),
    respectReducedMotion: value.respectReducedMotion !== false,
    customKeyframes: normalizeCustomKeyframes(value.customKeyframes)
  };
}

export function normalizeCosmeticDesign(value, type) {
  if (!value || typeof value !== "object" || !["diceSkins", "cardSkins", "memberCards", "profileBanners", "profileFrames"].includes(type)) return null;
  const number = (key, fallback, min, max) => Math.max(min, Math.min(max, Number(value[key] ?? fallback) || 0));
  const color = (key, fallback) => /^#[0-9a-f]{6}$/i.test(String(value[key] ?? "")) ? String(value[key]).toLowerCase() : fallback;
  const option = (key, fallback, choices) => choices.includes(value[key]) ? value[key] : fallback;
  const common = {
    version: 1,
    type,
    borderColor: color("borderColor", "#d6ad45"),
    borderWidth: number("borderWidth", 2, 0, 8),
    borderStyle: option("borderStyle", "solid", ["solid", "double", "dashed"]),
    radius: number("radius", 14, 0, 30),
    shadowColor: color("shadowColor", "#000000"),
    shadowBlur: number("shadowBlur", 20, 0, 60),
    shadowOpacity: number("shadowOpacity", 42, 0, 100),
    glow: number("glow", 8, 0, 50),
    animation: option("animation", "none", ["none", "flow", "pulse", "shimmer"]),
    animationSpeed: number("animationSpeed", 3, 0.6, 10),
    shape: option("shape", "rounded", ["rounded", "cut", "beveled"])
  };
  if (type === "diceSkins") return {
    ...common,
    backgroundMode: option("backgroundMode", "linear", ["solid", "linear", "radial"]),
    primaryColor: color("primaryColor", "#fff2a9"),
    secondaryColor: color("secondaryColor", "#8c1020"),
    angle: number("angle", 145, 0, 360),
    pipColor: color("pipColor", "#17120b"),
    pipSize: number("pipSize", 12, 6, 16),
    pipShape: option("pipShape", "round", ["round", "soft", "square", "diamond"]),
    pipGlow: number("pipGlow", 0, 0, 24)
  };
  if (type === "cardSkins") return {
    ...common,
    faceMode: option("faceMode", "linear", ["solid", "linear", "radial"]),
    facePrimary: color("facePrimary", "#fffdf8"),
    faceSecondary: color("faceSecondary", "#f3e3b8"),
    backPrimary: color("backPrimary", "#7c1421"),
    backSecondary: color("backSecondary", "#a51f33"),
    backPattern: option("backPattern", "diagonal", ["solid", "diagonal", "checker", "radial", "diamond"]),
    angle: number("angle", 145, 0, 360),
    blackSuitColor: color("blackSuitColor", "#161616"),
    redSuitColor: color("redSuitColor", "#b11226")
  };
  if (type === "profileBanners" || type === "profileFrames") return {
    ...common,
    backgroundMode: option("backgroundMode", "linear", ["solid", "linear", "radial"]),
    primaryColor: color("primaryColor", type === "profileFrames" ? "#ffe28a" : "#17191d"),
    secondaryColor: color("secondaryColor", type === "profileFrames" ? "#6b4b16" : "#6b0f1a"),
    tertiaryColor: color("tertiaryColor", type === "profileFrames" ? "#fff3d1" : "#c99a38"),
    angle: number("angle", 135, 0, 360),
    accentColor: color("accentColor", "#ffe28a")
  };
  return {
    ...common,
    backgroundMode: option("backgroundMode", "linear", ["solid", "linear", "radial"]),
    primaryColor: color("primaryColor", "#17191d"),
    secondaryColor: color("secondaryColor", "#6b0f1a"),
    tertiaryColor: color("tertiaryColor", "#c99a38"),
    angle: number("angle", 135, 0, 360),
    accentColor: color("accentColor", "#ffe28a"),
    titleColor: color("titleColor", "#e8c777"),
    textColor: color("textColor", "#fff3d1"),
    secondaryTextColor: color("secondaryTextColor", "#d6c29b"),
    fontStyle: option("fontStyle", "casino", ["casino", "serif", "modern", "mono"])
  };
}
