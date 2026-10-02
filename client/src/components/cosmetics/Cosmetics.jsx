import { useState } from "react";
import { AlertTriangle, BadgeCheck, Bird, Bot, Cat, CheckCircle2, Club, Coins, Copy, Crown, Diamond, Dice5, Dog, Fish, Flame, Gem, Heart, Landmark, Medal, PawPrint, Rabbit, Rocket, Shield, Snail, Spade, Sparkles, Squirrel, Star, Swords, Trophy, Turtle, User, Zap } from "lucide-react";
import { DynamicIcon, iconNames } from "lucide-react/dynamic.mjs";
import { Die, PlayingCard } from "../game/GamePieces.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { memberCardOptions } from "../../config/site.js";
import { copyText } from "../../utils/presentation.jsx";

export let cosmeticCatalogItems = [];

export const lucideIconCatalog = [...new Set(iconNames)].sort((left, right) => left.localeCompare(right, "fr"));

export const lucideIconNameSet = new Set(lucideIconCatalog);

export function normalizeLucideIconName(value) {
  return String(value ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function defaultIconKey(value) {
  return String(value ?? "chip")
    .replace(/^classic-/, "")
    .replace(/^chip-.+$/, "chip")
    .replace(/^die$/, "dice")
    .replace(/^card$/, "cards")
    .replace(/^spark$/, "star")
    .replace(/^ticket$/, "badge")
    .replace(/^award$/, "medal")
    .replace(/^highroller$/, "casino")
    .replace(/^lucky$/, "star")
    .replace(/^table$/, "casino")
    .replace(/^vault$/, "shield")
    .replace(/^marker$/, "badge")
    .replace(/^token-stack$/, "chip");
}

export function sanitizedSvgIcon(source) {
  if (typeof DOMParser === "undefined" || !String(source).trim().startsWith("<svg")) return "";
  const documentNode = new DOMParser().parseFromString(String(source), "image/svg+xml");
  const svg = documentNode.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg" || documentNode.querySelector("parsererror")) return "";
  const allowedTags = new Set(["svg", "g", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);
  const allowedAttributes = new Set(["viewbox", "width", "height", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "fill", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity", "transform"]);
  [...svg.querySelectorAll("*")].forEach((node) => {
    if (!allowedTags.has(node.nodeName.toLowerCase())) {
      node.remove();
      return;
    }
    [...node.attributes].forEach((attribute) => { if (!allowedAttributes.has(attribute.name.toLowerCase())) node.removeAttribute(attribute.name); });
  });
  [...svg.attributes].forEach((attribute) => { if (!allowedAttributes.has(attribute.name.toLowerCase()) && attribute.name !== "xmlns") svg.removeAttribute(attribute.name); });
  if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  return new XMLSerializer().serializeToString(svg);
}

export function CosmeticIcon({ value, source, style }) {
  const catalogSource = cosmeticCatalogItems.find((item) => item.type === "icons" && item.value === value)?.icon;
  const configuredSource = String(source ?? catalogSource ?? "").trim();
  const iconKey = configuredSource && !configuredSource.startsWith("<svg") ? defaultIconKey(configuredSource.toLowerCase()) : defaultIconKey(value);
  const lucideName = normalizeLucideIconName(configuredSource || iconKey);
  const icons = {
    chip: <Coins size={18} />,
    crown: <Crown size={18} />,
    dice: <Dice5 size={18} />,
    cards: <Spade size={18} />,
    star: <Star size={18} />,
    flame: <Flame size={18} />,
    lightning: <Zap size={18} />,
    shield: <Shield size={18} />,
    rocket: <Rocket size={18} />,
    swords: <Swords size={18} />,
    diamond: <Diamond size={18} />,
    heart: <Heart size={18} />,
    club: <Club size={18} />,
    spade: <Spade size={18} />,
    medal: <Medal size={18} />,
    badge: <BadgeCheck size={18} />,
    casino: <Landmark size={18} />,
    orbit: <Sparkles size={18} />,
    crest: <Gem size={18} />,
    cat: <Cat size={18} />,
    dog: <Dog size={18} />,
    bird: <Bird size={18} />,
    fish: <Fish size={18} />,
    rabbit: <Rabbit size={18} />,
    turtle: <Turtle size={18} />,
    squirrel: <Squirrel size={18} />,
    snail: <Snail size={18} />,
    user: <User size={18} />,
    bot: <Bot size={18} />,
    paw: <PawPrint size={18} />,
    "fox-fire": <span className="animal-glyph" aria-hidden="true">🦊</span>,
    "phoenix-chip": <Flame size={18} />,
  };
  const svgMarkup = sanitizedSvgIcon(configuredSource);
  const content = svgMarkup
    ? <span className="custom-svg-icon" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
    : icons[iconKey] ?? (lucideIconNameSet.has(lucideName)
      ? <DynamicIcon name={lucideName} size={18} fallback={Coins} />
      : configuredSource ? <span className="custom-text-icon">{configuredSource.slice(0, 8)}</span> : icons.chip);
  return <span className={`cosmetic-icon cosmetic-icon-${value ?? "chip"}`} style={style}>{content}</span>;
}

export function LucideIconPicker({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(48);
  const normalizedQuery = normalizeLucideIconName(query);
  const selectedName = normalizeLucideIconName(value);
  const matchingIcons = normalizedQuery
    ? lucideIconCatalog.filter((name) => normalizedQuery.split("-").every((term) => name.includes(term)))
    : lucideIconCatalog;
  const visibleIcons = matchingIcons.slice(0, visibleCount);

  function search(nextQuery) {
    setQuery(nextQuery);
    setVisibleCount(48);
  }

  return <section className="lucide-icon-picker" aria-label="Catalogue des icônes Lucide">
    <div className="lucide-picker-heading">
      <div><strong>Catalogue Lucide</strong><small>{lucideIconCatalog.length.toLocaleString("fr-FR")} icônes et alias disponibles</small></div>
      {lucideIconNameSet.has(selectedName) && <span className="selected-lucide-icon"><DynamicIcon name={selectedName} size={18} fallback={Coins} /> {selectedName}</span>}
    </div>
    <label className="lucide-search">Rechercher une icône
      <input type="search" value={query} onChange={(event) => search(event.target.value)} placeholder="Ex. trophy, dice, landmark…" autoComplete="off" />
    </label>
    <div className="lucide-picker-count">{matchingIcons.length ? `${Math.min(visibleCount, matchingIcons.length)} sur ${matchingIcons.length}` : "Aucun résultat"}</div>
    {visibleIcons.length > 0 && <div className="lucide-icon-grid">{visibleIcons.map((name) => <button
      className={selectedName === name ? "lucide-icon-option active" : "lucide-icon-option"}
      key={name}
      type="button"
      title={name}
      aria-label={`Choisir l’icône ${name}`}
      onClick={() => onChange(name)}
    ><DynamicIcon name={name} size={22} fallback={Coins} /><span>{name}</span></button>)}</div>}
    {visibleCount < matchingIcons.length && <button className="secondary lucide-load-more" type="button" onClick={() => setVisibleCount((count) => count + 48)}>Afficher 48 icônes de plus</button>}
  </section>;
}

export function FriendCode({ code }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  return <button className="friend-code" type="button" title="Copier le code ami" onClick={async () => { await copyText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }}><span>{copied ? "Copié !" : "Code ami"}</span><strong>{code}</strong>{copied ? <BadgeCheck size={14} /> : <Copy size={14} />}</button>;
}

export function DisplayName({ user }) {
  const effect = user?.cosmetics?.equipped?.nameEffect ?? "none";
  const openProfile = () => {
    if (!user?.id || user.isBot) return;
    window.dispatchEvent(new CustomEvent("ktga-public-profile", { detail: user.id }));
  };
  return (
    <span className={`display-name name-${effect}`} role={user?.id && !user.isBot ? "button" : undefined} tabIndex={user?.id && !user.isBot ? 0 : undefined} onClick={openProfile} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openProfile(); } }}>
      <CosmeticIcon value={user?.cosmetics?.equipped?.icon} />
      <span className="display-name-text">{user?.pseudo}</span>
    </span>
  );
}

export function profileCosmeticClassName(user, className = "") {
  const equipped = user?.cosmetics?.equipped ?? {};
  return `profile-cosmetic-shell profile-banner-${equipped.profileBanner ?? "default"} ${className}`.trim();
}

export function ProfileCosmeticFrame({ user }) {
  const frame = user?.cosmetics?.equipped?.profileFrame ?? "none";
  return <div className={`profile-cosmetic-frame-layer profile-frame-${frame}`} aria-hidden="true" />;
}

export function ProfileCosmeticEffect({ user }) {
  const effect = user?.cosmetics?.equipped?.profileEffect ?? "none";
  return <div className="profile-cosmetic-effect-viewport" aria-hidden="true"><div className={`profile-cosmetic-effect-layer profile-effect-${effect}`} /></div>;
}

export function ProfileCosmeticShell({ user, children, className = "" }) {
  return <div className={profileCosmeticClassName(user, className)}><ProfileCosmeticEffect user={user} /><ProfileCosmeticFrame user={user} />{children}</div>;
}

export function shopTypeLabel(type) {
  return ({ icons: "Icône", nameEffects: "Pseudo", memberCards: "Member card", profileBanners: "Bannière", profileFrames: "Cadre de profil", profileEffects: "Effet de profil", diceSkins: "Dés", cardSkins: "Cartes" })[type] ?? type;
}

export function previewUserForItem(user, item) {
  if (!item) return user;
  const equipped = { ...(user.cosmetics?.equipped ?? {}) };
  if (item.type === "icons") equipped.icon = item.value;
  if (item.type === "nameEffects") equipped.nameEffect = item.value;
  if (item.type === "memberCards") equipped.memberCard = item.value;
  if (item.type === "profileBanners") equipped.profileBanner = item.value;
  if (item.type === "profileFrames") equipped.profileFrame = item.value;
  if (item.type === "profileEffects") equipped.profileEffect = item.value;
  if (item.type === "diceSkins") equipped.diceSkin = item.value;
  if (item.type === "cardSkins") equipped.cardSkin = item.value;
  return { ...user, cosmetics: { ...(user.cosmetics ?? {}), equipped } };
}

export const visualDesignerTypes = new Set(["diceSkins", "cardSkins", "memberCards", "profileBanners", "profileFrames"]);

export function defaultVisualDesign(type) {
  const common = {
    version: 1,
    type,
    borderColor: "#d6ad45",
    borderWidth: 2,
    borderStyle: "solid",
    radius: 14,
    shadowColor: "#000000",
    shadowBlur: 20,
    shadowOpacity: 42,
    glow: 8,
    animation: "none",
    animationSpeed: 3
  };
  if (type === "diceSkins") return {
    ...common,
    backgroundMode: "linear",
    primaryColor: "#fff2a9",
    secondaryColor: "#8c1020",
    angle: 145,
    shape: "rounded",
    pipColor: "#17120b",
    pipSize: 12,
    pipShape: "round",
    pipGlow: 0
  };
  if (type === "cardSkins") return {
    ...common,
    faceMode: "linear",
    facePrimary: "#fffdf8",
    faceSecondary: "#f3e3b8",
    backPrimary: "#7c1421",
    backSecondary: "#a51f33",
    backPattern: "diagonal",
    angle: 145,
    shape: "rounded",
    blackSuitColor: "#161616",
    redSuitColor: "#b11226"
  };
  if (type === "profileBanners" || type === "profileFrames") return {
    ...common,
    backgroundMode: "linear",
    primaryColor: type === "profileFrames" ? "#ffe28a" : "#17191d",
    secondaryColor: type === "profileFrames" ? "#6b4b16" : "#6b0f1a",
    tertiaryColor: type === "profileFrames" ? "#fff3d1" : "#c99a38",
    angle: 135,
    shape: "rounded",
    accentColor: "#ffe28a"
  };
  return {
    ...common,
    backgroundMode: "linear",
    primaryColor: "#17191d",
    secondaryColor: "#6b0f1a",
    tertiaryColor: "#c99a38",
    angle: 135,
    shape: "rounded",
    accentColor: "#ffe28a",
    titleColor: "#e8c777",
    textColor: "#fff3d1",
    secondaryTextColor: "#d6c29b",
    fontStyle: "casino"
  };
}

export const visualPresets = {
  diceSkins: {
    casino: { primaryColor: "#fff2a9", secondaryColor: "#8c1020", borderColor: "#ffe28a", pipColor: "#17120b", backgroundMode: "linear", shape: "rounded", glow: 8, animation: "none" },
    neon: { primaryColor: "#5dd0a6", secondaryColor: "#071015", borderColor: "#79e7ff", pipColor: "#fff7df", backgroundMode: "radial", glow: 24, animation: "pulse" },
    obsidienne: { primaryColor: "#34393f", secondaryColor: "#050607", borderColor: "#c9ad70", pipColor: "#fff3d1", backgroundMode: "linear", glow: 4, animation: "none" }
  },
  cardSkins: {
    casino: { facePrimary: "#fffdf8", faceSecondary: "#f3e3b8", backPrimary: "#7c1421", backSecondary: "#a51f33", borderColor: "#d6ad45", backPattern: "diagonal", redSuitColor: "#b11226", blackSuitColor: "#161616", glow: 4, animation: "none" },
    neon: { facePrimary: "#101a1f", faceSecondary: "#05080a", backPrimary: "#5dd0a6", backSecondary: "#081416", borderColor: "#79e7ff", backPattern: "radial", redSuitColor: "#ff8b95", blackSuitColor: "#d9fbff", glow: 20, animation: "pulse" },
    royal: { facePrimary: "#fff8e8", faceSecondary: "#efe5ff", backPrimary: "#4d236a", backSecondary: "#16091f", borderColor: "#ffe28a", backPattern: "diamond", redSuitColor: "#b11226", blackSuitColor: "#241331", glow: 10, animation: "flow" }
  },
  memberCards: {
    casino: { primaryColor: "#17191d", secondaryColor: "#6b0f1a", tertiaryColor: "#c99a38", borderColor: "#ffe28a", accentColor: "#ffe28a", titleColor: "#e8c777", textColor: "#fff3d1", secondaryTextColor: "#d6c29b", glow: 8, animation: "none" },
    neon: { primaryColor: "#05080d", secondaryColor: "#0f6f68", tertiaryColor: "#79d9ff", borderColor: "#9ee8ff", accentColor: "#79e7ff", titleColor: "#b8fff3", textColor: "#effbff", secondaryTextColor: "#a9d9d2", glow: 28, animation: "flow" },
    prestige: { primaryColor: "#090a0c", secondaryColor: "#2a1611", tertiaryColor: "#c99a38", borderColor: "#e8c777", accentColor: "#ffe28a", titleColor: "#e8c777", textColor: "#fff8e8", secondaryTextColor: "#d6c29b", glow: 16, animation: "shimmer" }
  },
  profileBanners: {
    casino: { primaryColor: "#102d24", secondaryColor: "#17110b", tertiaryColor: "#8b1c2f", borderColor: "#d6ad45", backgroundMode: "linear", angle: 135, glow: 6, animation: "none" },
    nocturne: { primaryColor: "#071019", secondaryColor: "#312254", tertiaryColor: "#12675f", borderColor: "#79d9ff", backgroundMode: "radial", glow: 14, animation: "flow" },
    velours: { primaryColor: "#24070d", secondaryColor: "#7c1421", tertiaryColor: "#c99a38", borderColor: "#ffe28a", backgroundMode: "linear", angle: 118, glow: 12, animation: "shimmer" }
  },
  profileFrames: {
    laiton: { primaryColor: "#fff0b0", secondaryColor: "#8b621d", tertiaryColor: "#d6ad45", borderColor: "#ffe28a", borderStyle: "double", borderWidth: 4, glow: 8, animation: "none" },
    neon: { primaryColor: "#b8fff3", secondaryColor: "#0f6f68", tertiaryColor: "#79d9ff", borderColor: "#79e7ff", borderWidth: 3, glow: 28, animation: "pulse" },
    prisme: { primaryColor: "#f18cff", secondaryColor: "#72e7ff", tertiaryColor: "#ffe27f", borderColor: "#ffffff", borderWidth: 3, glow: 22, animation: "flow" }
  }
};

export function visualPreset(type, name) {
  return { ...defaultVisualDesign(type), ...(visualPresets[type]?.[name] ?? {}) };
}

export function rgbaFromHex(color, opacity = 1) {
  const normalized = String(color ?? "").replace("#", "");
  const hex = normalized.length === 3 ? normalized.split("").map((part) => part + part).join("") : normalized;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return `rgba(0, 0, 0, ${opacity})`;
  const value = Number.parseInt(hex, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

export function designBackground(mode, primary, secondary, angle = 135, tertiary = "") {
  if (mode === "solid") return primary;
  if (mode === "radial") return `radial-gradient(circle at 30% 24%, ${primary}, ${tertiary || secondary} 48%, ${secondary} 100%)`;
  return `linear-gradient(${angle}deg, ${primary}, ${tertiary ? `${tertiary} 52%, ` : ""}${secondary})`;
}

export const defaultCosmeticMotion = {
  version: 1,
  preset: "none",
  duration: 2.4,
  delay: 0,
  easing: "ease-in-out",
  iterations: "infinite",
  direction: "normal",
  fillMode: "both",
  distance: 10,
  scale: 8,
  rotation: 8,
  intensity: 20,
  respectReducedMotion: true,
  customKeyframes: ""
};

export const cosmeticMotionPresets = {
  none: { label: "Aucune" },
  pulse: { label: "Pulse", duration: 2.4, scale: 7, easing: "ease-in-out" },
  float: { label: "Flottement", duration: 2.8, distance: 9, easing: "ease-in-out" },
  "translate-x": { label: "Translation X", duration: 2.2, distance: 14, direction: "alternate" },
  "translate-y": { label: "Translation Y", duration: 2.2, distance: 14, direction: "alternate" },
  bounce: { label: "Rebond", duration: 0.9, distance: 13, easing: "ease-out" },
  shake: { label: "Secousse", duration: 0.55, distance: 4, rotation: 2, easing: "linear" },
  spin: { label: "Rotation", duration: 3, rotation: 360, easing: "linear" },
  swing: { label: "Balancier", duration: 1.8, rotation: 8, easing: "ease-in-out" },
  zoom: { label: "Zoom", duration: 2.1, scale: 12, easing: "ease-in-out" },
  glow: { label: "Éclat", duration: 2.2, intensity: 28, easing: "ease-in-out" },
  custom: { label: "Personnalisée" }
};

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
    const declarations = match[2].split(";").map((chunk) => {
      const separator = chunk.indexOf(":");
      if (separator < 1) return "";
      const property = chunk.slice(0, separator).trim().toLowerCase();
      const propertyValue = chunk.slice(separator + 1).trim();
      if (!allowedProperties.has(property) || !propertyValue || /[{}@<>\\]|url\s*\(|expression\s*\(|javascript:/i.test(propertyValue)) return "";
      return `${property}:${propertyValue}`;
    }).filter(Boolean);
    if (!declarations.length) return "";
    blocks.push(`${match[1].toLowerCase()}{${declarations.join(";")};}`);
    cursor = blockPattern.lastIndex;
  }
  if (source.slice(cursor).trim() || blocks.length < 2) return "";
  return blocks.join("");
}

export function cosmeticMotionSelector(item, value) {
  if (item.type === "icons") return `.cosmetic-icon-${value}`;
  if (item.type === "nameEffects") return `.name-${value} .display-name-text`;
  if (item.type === "memberCards") return `.vip-card.member-${value},.member-swatch.member-${value}`;
  if (item.type === "profileBanners") return `.profile-cosmetic-shell.profile-banner-${value}`;
  if (item.type === "profileFrames") return `.profile-cosmetic-frame-layer.profile-frame-${value}`;
  if (item.type === "profileEffects") return `.profile-cosmetic-effect-layer.profile-effect-${value}`;
  if (item.type === "diceSkins") return `.die-skin-${value}`;
  if (item.type === "cardSkins") return `.card-skin-${value}:not(.card-back),.card-back.card-skin-${value}`;
  return "";
}

export function cosmeticMotionCssRules(item) {
  const value = String(item?.value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  const selector = cosmeticMotionSelector(item ?? {}, value);
  const motion = item?.motion ? { ...defaultCosmeticMotion, ...item.motion } : null;
  if (!value || !selector || !motion || motion.preset === "none") return "";
  const customFrames = motion.preset === "custom" ? normalizeCustomKeyframes(motion.customKeyframes) : "";
  if (motion.preset === "custom" && !customFrames) return "";
  const presetNames = {
    pulse: "cosmetic-motion-pulse", float: "cosmetic-motion-float", "translate-x": "cosmetic-motion-translate-x", "translate-y": "cosmetic-motion-translate-y",
    bounce: "cosmetic-motion-bounce", shake: "cosmetic-motion-shake", spin: "cosmetic-motion-spin", swing: "cosmetic-motion-swing", zoom: "cosmetic-motion-zoom", glow: "cosmetic-motion-glow"
  };
  const animationName = motion.preset === "custom" ? `cosmetic-custom-${value}` : presetNames[motion.preset];
  if (!animationName) return "";
  const distance = Math.max(0, Number(motion.distance) || 0);
  const scale = Math.max(0, Number(motion.scale) || 0);
  const rotation = Math.max(0, Number(motion.rotation) || 0);
  const intensity = Math.max(0, Number(motion.intensity) || 0);
  const duration = Math.max(0.2, Number(motion.duration) || 2.4);
  const delay = Math.max(0, Number(motion.delay) || 0);
  const declarations = `--motion-distance:var(--custom-motion-distance,${distance}px);--motion-negative-distance:var(--custom-motion-negative-distance,-${distance}px);--motion-scale:${1 + scale / 100};--motion-small-scale:${Math.max(0.1, 1 - scale / 100)};--motion-rotation:${rotation}deg;--motion-negative-rotation:-${rotation}deg;--motion-brightness:${1 + intensity / 100};animation:${animationName} ${duration}s ${motion.easing} ${delay}s ${motion.iterations} ${motion.direction} ${motion.fillMode};`;
  const keyframes = customFrames ? `@keyframes ${animationName}{${customFrames}}\n` : "";
  const reducedMotion = motion.respectReducedMotion ? `\n@media (prefers-reduced-motion:reduce){${selector}{animation:none!important;}}` : "";
  return `${keyframes}${selector}{${declarations}}${reducedMotion}`;
}

export function designAnimation(design) {
  const speed = Math.max(0.6, Number(design.animationSpeed) || 3);
  if (design.animation === "flow") return `animation: aurora-flow ${speed}s ease-in-out infinite; background-size: 280% 280%;`;
  if (design.animation === "pulse") return `animation: cosmetic-visual-pulse ${speed}s ease-in-out infinite;`;
  if (design.animation === "shimmer") return `animation: shine-sweep ${speed}s linear infinite; background-size: 260% 100%;`;
  return "";
}

export function designShadow(design, accentColor = design.borderColor) {
  const opacity = Math.max(0, Math.min(100, Number(design.shadowOpacity) || 0)) / 100;
  const blur = Math.max(0, Number(design.shadowBlur) || 0);
  const glow = Math.max(0, Number(design.glow) || 0);
  return `0 var(--custom-shadow-y,12px) var(--custom-shadow-blur,${blur}px) ${rgbaFromHex(design.shadowColor, opacity)}, 0 0 var(--custom-glow,${glow}px) ${rgbaFromHex(accentColor, 0.42)}`;
}

export function rootShapeCss(shape, radius) {
  const scaledRadius = `var(--custom-radius,${radius}px)`;
  if (shape === "cut") return `border-radius:${scaledRadius};clip-path:polygon(var(--custom-cut,12px) 0,100% 0,100% calc(100% - var(--custom-cut,12px)),calc(100% - var(--custom-cut,12px)) 100%,0 100%,0 var(--custom-cut,12px));`;
  if (shape === "beveled") return `border-radius:var(--custom-small-radius,${Math.max(2, radius / 2)}px) ${scaledRadius};clip-path:polygon(var(--custom-bevel,8px) 0,calc(100% - var(--custom-bevel,8px)) 0,100% var(--custom-bevel,8px),100% calc(100% - var(--custom-bevel,8px)),calc(100% - var(--custom-bevel,8px)) 100%,var(--custom-bevel,8px) 100%,0 calc(100% - var(--custom-bevel,8px)),0 var(--custom-bevel,8px));`;
  return `border-radius:${scaledRadius};clip-path:none;`;
}

export function cardBackBackground(design) {
  const first = design.backPrimary;
  const second = design.backSecondary;
  if (design.backPattern === "solid") return first;
  if (design.backPattern === "checker") return `conic-gradient(from 45deg, ${first} 0 25%, ${second} 0 50%, ${first} 0 75%, ${second} 0) 0 0 / 18px 18px`;
  if (design.backPattern === "radial") return `radial-gradient(circle at 50% 35%, ${first}, ${second} 72%)`;
  if (design.backPattern === "diamond") return `repeating-linear-gradient(45deg, ${first} 0 9px, ${second} 9px 18px), repeating-linear-gradient(-45deg, transparent 0 9px, ${rgbaFromHex(design.borderColor, 0.18)} 9px 18px)`;
  return `repeating-linear-gradient(${design.angle || 45}deg, ${first} 0 8px, ${second} 8px 16px)`;
}

export function visualDesignCssRules(item) {
  const design = item?.design;
  const value = String(item?.value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!value || !design || !visualDesignerTypes.has(item.type)) return "";
  const border = `var(--custom-border-width,${design.borderWidth}px) ${design.borderStyle} ${design.borderColor}`;
  const shape = rootShapeCss(design.shape, design.radius);
  const animation = designAnimation(design);
  if (item.type === "diceSkins") {
    const selector = `.die-skin-${value}`;
    const pipRadius = design.pipShape === "round" ? "999px" : design.pipShape === "soft" ? "3px" : "0";
    const pipTransform = design.pipShape === "diamond" ? "rotate(45deg)" : "none";
    return `${selector}{background:${designBackground(design.backgroundMode, design.primaryColor, design.secondaryColor, design.angle)};border:${border};${shape}box-shadow:${designShadow(design)};${animation}}\n${selector} .pip{background:${design.pipColor};border-radius:${pipRadius};height:var(--custom-pip-size,${design.pipSize}px);width:var(--custom-pip-size,${design.pipSize}px);transform:${pipTransform};box-shadow:0 0 var(--custom-pip-glow,${design.pipGlow}px) ${rgbaFromHex(design.pipColor, 0.65)};}`;
  }
  if (item.type === "cardSkins") {
    const selector = `.card-skin-${value}`;
    const common = `border:${border};${shape}box-shadow:${designShadow(design)};${animation}`;
    return `${selector}:not(.card-back){background:${designBackground(design.faceMode, design.facePrimary, design.faceSecondary, design.angle)};${common}color:${design.blackSuitColor};}\n${selector}:not(.card-back).red-suit{color:${design.redSuitColor};}\n.card-back${selector}{background:${cardBackBackground(design)};${common}color:${design.facePrimary};}`;
  }
  if (item.type === "profileBanners") {
    const selector = `.profile-cosmetic-shell.profile-banner-${value}`;
    return `${selector}{background:${designBackground(design.backgroundMode, design.primaryColor, design.secondaryColor, design.angle, design.tertiaryColor)};border:${border};${shape}box-shadow:${designShadow(design, design.accentColor)};${animation}}`;
  }
  if (item.type === "profileFrames") {
    const selector = `.profile-cosmetic-frame-layer.profile-frame-${value}`;
    return `${selector}{background:${designBackground(design.backgroundMode, design.primaryColor, design.secondaryColor, design.angle, design.tertiaryColor)};border:${border};${shape}box-shadow:${designShadow(design, design.accentColor)};${animation}}`;
  }
  const selector = `.member-${value}`;
  const roots = `.vip-card${selector},.member-swatch${selector}`;
  const fontFamilies = { casino: "inherit", serif: "Georgia, serif", modern: "Inter, Arial, sans-serif", mono: '"Cascadia Code", Consolas, monospace' };
  return `${roots}{background:${designBackground(design.backgroundMode, design.primaryColor, design.secondaryColor, design.angle, design.tertiaryColor)};border:${border};${shape}box-shadow:${designShadow(design, design.accentColor)};font-family:${fontFamilies[design.fontStyle] ?? "inherit"};${animation}}\n.vip-card${selector}::before{background:linear-gradient(90deg,transparent,${design.accentColor},transparent);}\n.vip-card${selector} .vip-label{color:${design.titleColor};}\n.vip-card${selector} .display-name-text{color:${design.textColor};}\n.vip-card${selector}>small{color:${design.secondaryTextColor};}`;
}

export function cosmeticCssRules(items = []) {
  const prefixes = { icons: "cosmetic-icon", nameEffects: "name", memberCards: "member", profileBanners: "profile-banner", profileFrames: "profile-frame", profileEffects: "profile-effect", diceSkins: "die-skin", cardSkins: "card-skin" };
  return items.map((item) => {
    const generatedDesign = visualDesignCssRules(item);
    const generatedMotion = cosmeticMotionCssRules(item);
    if (!item.css || !prefixes[item.type]) return [generatedDesign, generatedMotion].filter(Boolean).join("\n");
    const value = String(item.value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const declarations = String(item.css).replace(/[{}@]/g, "");
    if (!value) return generatedDesign;
    let advancedRule;
    if (item.type === "nameEffects") advancedRule = `.name-${value} .display-name-text{${declarations}}`;
    else if (item.type === "memberCards") advancedRule = `.vip-card.member-${value},.member-swatch.member-${value}{${declarations}}`;
    else if (item.type === "cardSkins") advancedRule = /^Dos\b/i.test(String(item.name ?? ""))
      ? `.card-back.card-skin-${value}{${declarations}}`
      : `.card-skin-${value}:not(.card-back){${declarations}}`;
    else advancedRule = `.${prefixes[item.type]}-${value}{${declarations}}`;
    return [generatedDesign, advancedRule, generatedMotion].filter(Boolean).join("\n");
  }).filter(Boolean).join("\n");
}

export function currentCosmeticCss(item) {
  if (item?.css?.trim() || typeof document === "undefined") return item?.css ?? "";
  const prefixes = { icons: "cosmetic-icon", nameEffects: "name", memberCards: "member", profileBanners: "profile-banner", profileFrames: "profile-frame", profileEffects: "profile-effect", diceSkins: "die-skin", cardSkins: "card-skin" };
  const bases = { icons: ".cosmetic-icon", nameEffects: ".display-name", memberCards: ".vip-card", profileBanners: ".profile-cosmetic-shell", profileFrames: ".profile-cosmetic-frame-layer", profileEffects: ".profile-cosmetic-effect-layer", diceSkins: ".die", cardSkins: ".playing-card" };
  const prefix = prefixes[item?.type];
  if (!prefix) return "";
  const value = String(item.value ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  const specificSelector = `.${prefix}-${value}`;
  const rules = [];
  const visitRules = (ruleList) => {
    for (const rule of [...(ruleList ?? [])]) {
      // CSSStyleRule expose aussi cssRules dans les navigateurs qui prennent en
      // charge le CSS imbriqué. Il faut donc enregistrer la règle avant de
      // parcourir ses éventuels enfants, sinon toutes les règles simples sont
      // silencieusement ignorées.
      if (rule.selectorText && rule.style) rules.push(rule);
      if (rule.cssRules?.length) visitRules(rule.cssRules);
    }
  };
  for (const sheet of [...document.styleSheets]) {
    try { visitRules(sheet.cssRules); } catch { /* Une feuille externe peut refuser l'inspection. */ }
  }
  const targetsSpecificStyle = (selector) => {
    const normalized = selector.trim();
    if (item.type === "memberCards") return normalized.includes(`.vip-card${specificSelector}`) && !normalized.includes("::");
    if (item.type === "nameEffects") return (normalized === specificSelector || normalized.startsWith(`${specificSelector}:`) || normalized.startsWith(`${specificSelector} .display-name-text`)) && !normalized.includes("::");
    if (item.type === "cardSkins") {
      const isBackDesign = /^Dos\b/i.test(String(item.name ?? ""));
      return isBackDesign
        ? normalized.includes(`.card-back${specificSelector}`)
        : normalized.includes(specificSelector) && normalized.includes(":not(.card-back)");
    }
    return (normalized === specificSelector || normalized.startsWith(`${specificSelector}:`)) && !normalized.includes("::");
  };
  const targetsBaseStyle = (selector) => selector.trim() === bases[item.type];
  const specificRules = rules.filter((rule) => rule.selectorText.split(",").some(targetsSpecificStyle));
  const matching = specificRules.length
    ? specificRules
    : rules.filter((rule) => rule.selectorText.split(",").some(targetsBaseStyle));
  const declarations = new Map();
  matching.forEach((rule) => Array.from(rule.style).forEach((property) => declarations.set(property, rule.style.getPropertyValue(property).trim())));
  return [...declarations].map(([property, propertyValue]) => `${property}: ${propertyValue};`).join("\n");
}

export function DesignerColor({ label, value, onChange }) {
  return <label className="designer-control designer-color-control"><span>{label}<output>{value}</output></span><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function DesignerRange({ label, value, min, max, step = 1, suffix = "", onChange }) {
  return <label className="designer-control designer-range-control"><span>{label}<output>{value}{suffix}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function DesignerSelect({ label, value, options, onChange }) {
  return <label className="designer-control"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}</select></label>;
}

export function MotionDesigner({ motion, onChange }) {
  const activeMotion = { ...defaultCosmeticMotion, ...(motion ?? {}) };
  const set = (field, value) => onChange({ ...activeMotion, [field]: value });
  const applyPreset = (preset) => {
    const { label: _label, ...defaults } = cosmeticMotionPresets[preset];
    onChange({ ...activeMotion, preset, ...defaults });
  };
  const customFrames = normalizeCustomKeyframes(activeMotion.customKeyframes);
  const animationName = activeMotion.preset === "custom" ? "cosmetic-custom-[objet]" : `cosmetic-motion-${activeMotion.preset}`;
  const animationProperty = activeMotion.preset === "none" ? "none" : `${animationName} ${activeMotion.duration}s ${activeMotion.easing} ${activeMotion.delay}s ${activeMotion.iterations} ${activeMotion.direction} ${activeMotion.fillMode}`;
  const usesDistance = ["float", "translate-x", "translate-y", "bounce", "shake"].includes(activeMotion.preset);
  const usesScale = ["pulse", "zoom"].includes(activeMotion.preset);
  const usesRotation = ["spin", "swing", "shake"].includes(activeMotion.preset);
  const usesIntensity = activeMotion.preset === "glow";
  const exampleFrames = "0%, 100% { transform: translateY(0) rotate(0deg); opacity: 1; }\n50% { transform: translateY(var(--motion-negative-distance)) rotate(var(--motion-rotation)); opacity: .82; }";

  return <section className="motion-designer">
    <div className="visual-designer-heading"><div><small>Animation réutilisable</small><h3>Mouvement de l’objet</h3></div><span className={activeMotion.preset !== "none" ? "designer-active-status" : ""}>{activeMotion.preset !== "none" ? "Active" : "Aucune"}</span></div>
    <p className="motion-designer-intro">Choisis un effet, puis personnalise son rythme et son amplitude. L’animation s’applique au rendu final, quel que soit le type d’objet.</p>
    <div className="motion-preset-grid">{Object.entries(cosmeticMotionPresets).map(([preset, config]) => <button type="button" key={preset} className={`motion-preset ${activeMotion.preset === preset ? "active" : ""}`} onClick={() => applyPreset(preset)}><span className={`motion-preset-demo motion-demo-${preset}`}><Sparkles size={15} /></span><span>{config.label}</span></button>)}</div>

    {activeMotion.preset !== "none" && <>
      <div className="designer-section"><h4>Propriété animation</h4><code className="animation-property-preview">animation: {animationProperty};</code><div className="designer-control-grid">
        <DesignerRange label="Durée" value={activeMotion.duration} min={0.2} max={20} step={0.1} suffix=" s" onChange={(value) => set("duration", value)} />
        <DesignerRange label="Délai" value={activeMotion.delay} min={0} max={10} step={0.1} suffix=" s" onChange={(value) => set("delay", value)} />
        <DesignerSelect label="Courbe d’accélération" value={activeMotion.easing} onChange={(value) => set("easing", value)} options={[["linear", "Linéaire"], ["ease", "Naturelle"], ["ease-in", "Accélération"], ["ease-out", "Décélération"], ["ease-in-out", "Douce"], ["steps(2,end)", "Saccadée · 2 étapes"], ["steps(4,end)", "Saccadée · 4 étapes"]]} />
        <DesignerSelect label="Répétition" value={activeMotion.iterations} onChange={(value) => set("iterations", value)} options={[["1", "Une fois"], ["2", "Deux fois"], ["3", "Trois fois"], ["infinite", "En boucle"]]} />
        <DesignerSelect label="Direction" value={activeMotion.direction} onChange={(value) => set("direction", value)} options={[["normal", "Normale"], ["reverse", "Inversée"], ["alternate", "Aller-retour"], ["alternate-reverse", "Aller-retour inversé"]]} />
        <DesignerSelect label="État avant/après" value={activeMotion.fillMode} onChange={(value) => set("fillMode", value)} options={[["none", "Aucun"], ["forwards", "Conserver la fin"], ["backwards", "Appliquer le départ"], ["both", "Les deux"]]} />
      </div></div>
      {(usesDistance || usesScale || usesRotation || usesIntensity) && <div className="designer-section"><h4>Amplitude de l’effet</h4><div className="designer-control-grid">
        {usesDistance && <DesignerRange label="Distance" value={activeMotion.distance} min={0} max={60} suffix=" px" onChange={(value) => set("distance", value)} />}
        {usesScale && <DesignerRange label="Variation d’échelle" value={activeMotion.scale} min={0} max={40} suffix=" %" onChange={(value) => set("scale", value)} />}
        {usesRotation && <DesignerRange label="Rotation" value={activeMotion.rotation} min={0} max={360} suffix="°" onChange={(value) => set("rotation", value)} />}
        {usesIntensity && <DesignerRange label="Intensité lumineuse" value={activeMotion.intensity} min={0} max={100} suffix=" %" onChange={(value) => set("intensity", value)} />}
      </div></div>}
      {activeMotion.preset === "custom" && <div className="designer-section custom-keyframes-section">
        <div className="custom-keyframes-heading"><div><h4>Keyframes personnalisées</h4><small>Colle les étapes seules ou une règle @keyframes complète. Son nom sera isolé automatiquement pour cet objet.</small></div><button type="button" className="secondary" onClick={() => set("customKeyframes", exampleFrames)}>Charger un exemple</button></div>
        <label>Étapes de l’animation<textarea className="keyframes-editor" spellCheck="false" value={activeMotion.customKeyframes} onChange={(event) => set("customKeyframes", event.target.value)} placeholder={exampleFrames} /></label>
        <div className={`keyframes-validation ${customFrames ? "valid" : "invalid"}`}>{customFrames ? <><CheckCircle2 size={16} /> Keyframes valides et prêtes à être utilisées.</> : <><AlertTriangle size={16} /> Ajoute au moins deux étapes valides, par exemple 0% et 100%.</>}</div>
        <small className="field-help">Propriétés acceptées : transform, opacity, filter, box-shadow, background-position, background-color, border-color, color et letter-spacing. Variables disponibles : --motion-distance, --motion-negative-distance, --motion-scale et --motion-rotation.</small>
      </div>}
      <label className="motion-reduced-toggle"><span><strong>Respecter la réduction des animations</strong><small>Désactive cet effet pour les joueurs ayant activé ce réglage d’accessibilité.</small></span><input type="checkbox" checked={activeMotion.respectReducedMotion} onChange={(event) => set("respectReducedMotion", event.target.checked)} /></label>
    </>}
    <div className="designer-footer"><ConfirmActionButton className="secondary" dialogTitle="Réinitialiser l’animation ?" message="Les réglages actuels seront remplacés par les réglages par défaut." confirmLabel="Réinitialiser" danger onConfirm={() => onChange({ ...defaultCosmeticMotion })}>Réinitialiser l’animation</ConfirmActionButton>{motion && <ConfirmActionButton className="danger-button" dialogTitle="Supprimer la configuration d’animation ?" message="Les réglages de mouvement seront retirés de cet objet. Enregistre ensuite l’objet pour appliquer ce changement." confirmLabel="Supprimer la configuration" danger onConfirm={() => onChange(null)}>Supprimer la configuration</ConfirmActionButton>}</div>
  </section>;
}

export function VisualDesigner({ type, design, onChange, onActivate, onDisable }) {
  const [panel, setPanel] = useState("surface");
  if (!visualDesignerTypes.has(type)) return null;
  const activeDesign = design?.type === type ? { ...defaultVisualDesign(type), ...design } : null;
  if (!activeDesign) return <section className="visual-designer visual-designer-inactive">
    <div className="visual-designer-heading"><div><small>Studio visuel</small><h3>Conception assistée</h3></div><span>Désactivé</span></div>
    <p>Active le studio pour construire cet objet avec des couleurs, formes, motifs, ombres et animations sans écrire de CSS.</p>
    <button type="button" onClick={onActivate}>Activer le studio visuel</button>
    <small>L’activation remplace le CSS avancé actuellement chargé. Tu peux annuler le modal pour revenir en arrière.</small>
  </section>;

  const set = (field, value) => onChange({ ...activeDesign, [field]: value });
  const presets = Object.keys(visualPresets[type] ?? {});
  const commonShapeOptions = [["rounded", "Arrondie"], ["cut", "Coins coupés"], ["beveled", "Biseautée"]];
  return <section className="visual-designer">
    <div className="visual-designer-heading"><div><small>Studio visuel</small><h3>Conception assistée</h3></div><span className="designer-active-status">Actif</span></div>
    <div className="designer-presets"><span>Préréglages</span>{presets.map((preset) => <button type="button" className="secondary" key={preset} onClick={() => onChange(visualPreset(type, preset))}>{preset}</button>)}</div>
    <nav className="designer-subtabs" aria-label="Réglages du studio visuel">
      {[['surface', 'Couleurs et matière'], ['shape', 'Forme et bordure'], ['effects', 'Ombre et effets']].map(([value, label]) => <button type="button" key={value} className={panel === value ? "active" : ""} onClick={() => setPanel(value)}>{label}</button>)}
    </nav>

    {panel === "surface" && <>{type === "diceSkins" && <>
      <div className="designer-section"><h4>Corps du dé</h4><div className="designer-control-grid">
        <DesignerSelect label="Fond" value={activeDesign.backgroundMode} onChange={(value) => set("backgroundMode", value)} options={[["solid", "Uni"], ["linear", "Dégradé linéaire"], ["radial", "Dégradé radial"]]} />
        <DesignerColor label="Couleur principale" value={activeDesign.primaryColor} onChange={(value) => set("primaryColor", value)} />
        <DesignerColor label="Couleur secondaire" value={activeDesign.secondaryColor} onChange={(value) => set("secondaryColor", value)} />
        <DesignerRange label="Angle" value={activeDesign.angle} min={0} max={360} suffix="°" onChange={(value) => set("angle", value)} />
      </div></div>
      <div className="designer-section"><h4>Points</h4><div className="designer-control-grid">
        <DesignerColor label="Couleur des points" value={activeDesign.pipColor} onChange={(value) => set("pipColor", value)} />
        <DesignerRange label="Taille" value={activeDesign.pipSize} min={6} max={16} suffix=" px" onChange={(value) => set("pipSize", value)} />
        <DesignerSelect label="Forme" value={activeDesign.pipShape} onChange={(value) => set("pipShape", value)} options={[["round", "Ronds"], ["soft", "Carrés doux"], ["square", "Carrés"], ["diamond", "Diamants"]]} />
        <DesignerRange label="Halo des points" value={activeDesign.pipGlow} min={0} max={24} suffix=" px" onChange={(value) => set("pipGlow", value)} />
      </div></div>
    </>}

    {type === "cardSkins" && <>
      <div className="designer-section"><h4>Face des cartes</h4><div className="designer-control-grid">
        <DesignerSelect label="Fond" value={activeDesign.faceMode} onChange={(value) => set("faceMode", value)} options={[["solid", "Uni"], ["linear", "Dégradé linéaire"], ["radial", "Dégradé radial"]]} />
        <DesignerColor label="Face principale" value={activeDesign.facePrimary} onChange={(value) => set("facePrimary", value)} />
        <DesignerColor label="Face secondaire" value={activeDesign.faceSecondary} onChange={(value) => set("faceSecondary", value)} />
        <DesignerColor label="Piques et trèfles" value={activeDesign.blackSuitColor} onChange={(value) => set("blackSuitColor", value)} />
        <DesignerColor label="Cœurs et carreaux" value={activeDesign.redSuitColor} onChange={(value) => set("redSuitColor", value)} />
      </div></div>
      <div className="designer-section"><h4>Dos des cartes</h4><div className="designer-control-grid">
        <DesignerSelect label="Motif" value={activeDesign.backPattern} onChange={(value) => set("backPattern", value)} options={[["solid", "Uni"], ["diagonal", "Rayures diagonales"], ["checker", "Damier"], ["radial", "Médaillon"], ["diamond", "Losanges"]]} />
        <DesignerColor label="Dos principal" value={activeDesign.backPrimary} onChange={(value) => set("backPrimary", value)} />
        <DesignerColor label="Dos secondaire" value={activeDesign.backSecondary} onChange={(value) => set("backSecondary", value)} />
        <DesignerRange label="Angle" value={activeDesign.angle} min={0} max={360} suffix="°" onChange={(value) => set("angle", value)} />
      </div></div>
    </>}

    {["memberCards", "profileBanners", "profileFrames"].includes(type) && <>
      <div className="designer-section"><h4>{type === "memberCards" ? "Fond de la carte" : type === "profileBanners" ? "Fond de la bannière" : "Matière du cadre"}</h4><div className="designer-control-grid">
        <DesignerSelect label="Fond" value={activeDesign.backgroundMode} onChange={(value) => set("backgroundMode", value)} options={[["solid", "Uni"], ["linear", "Dégradé linéaire"], ["radial", "Dégradé radial"]]} />
        <DesignerColor label="Couleur principale" value={activeDesign.primaryColor} onChange={(value) => set("primaryColor", value)} />
        <DesignerColor label="Couleur secondaire" value={activeDesign.secondaryColor} onChange={(value) => set("secondaryColor", value)} />
        <DesignerColor label="Reflet central" value={activeDesign.tertiaryColor} onChange={(value) => set("tertiaryColor", value)} />
        <DesignerRange label="Angle" value={activeDesign.angle} min={0} max={360} suffix="°" onChange={(value) => set("angle", value)} />
      </div></div>
    </>}
    {type === "memberCards" && <>
      <div className="designer-section"><h4>Identité et textes</h4><div className="designer-control-grid">
        <DesignerColor label="Accent" value={activeDesign.accentColor} onChange={(value) => set("accentColor", value)} />
        <DesignerColor label="Titre" value={activeDesign.titleColor} onChange={(value) => set("titleColor", value)} />
        <DesignerColor label="Pseudo" value={activeDesign.textColor} onChange={(value) => set("textColor", value)} />
        <DesignerColor label="Texte secondaire" value={activeDesign.secondaryTextColor} onChange={(value) => set("secondaryTextColor", value)} />
        <DesignerSelect label="Typographie" value={activeDesign.fontStyle} onChange={(value) => set("fontStyle", value)} options={[["casino", "Casino du site"], ["serif", "Élégante avec empattements"], ["modern", "Moderne"], ["mono", "Monospace"]]} />
      </div></div>
    </>}</>}

    {panel === "shape" && <div className="designer-section"><h4>Forme et finition</h4><div className="designer-control-grid">
      <DesignerSelect label="Silhouette" value={activeDesign.shape} onChange={(value) => set("shape", value)} options={commonShapeOptions} />
      <DesignerRange label="Arrondi" value={activeDesign.radius} min={0} max={30} suffix=" px" onChange={(value) => set("radius", value)} />
      <DesignerColor label="Bordure" value={activeDesign.borderColor} onChange={(value) => set("borderColor", value)} />
      <DesignerRange label="Épaisseur" value={activeDesign.borderWidth} min={0} max={8} suffix=" px" onChange={(value) => set("borderWidth", value)} />
      <DesignerSelect label="Style de bordure" value={activeDesign.borderStyle} onChange={(value) => set("borderStyle", value)} options={[["solid", "Continue"], ["double", "Double"], ["dashed", "Tirets"]]} />
    </div></div>}

    {panel === "effects" && <div className="designer-section"><h4>Ombre et animation</h4><div className="designer-control-grid">
      <DesignerColor label="Couleur de l’ombre" value={activeDesign.shadowColor} onChange={(value) => set("shadowColor", value)} />
      <DesignerRange label="Flou" value={activeDesign.shadowBlur} min={0} max={60} suffix=" px" onChange={(value) => set("shadowBlur", value)} />
      <DesignerRange label="Opacité" value={activeDesign.shadowOpacity} min={0} max={100} suffix=" %" onChange={(value) => set("shadowOpacity", value)} />
      <DesignerRange label="Halo" value={activeDesign.glow} min={0} max={50} suffix=" px" onChange={(value) => set("glow", value)} />
      <DesignerSelect label="Animation" value={activeDesign.animation} onChange={(value) => set("animation", value)} options={[["none", "Aucune"], ["flow", "Dégradé mouvant"], ["pulse", "Pulsation"], ["shimmer", "Reflet traversant"]]} />
      <DesignerRange label="Durée" value={activeDesign.animationSpeed} min={0.6} max={10} step={0.2} suffix=" s" onChange={(value) => set("animationSpeed", value)} />
    </div></div>}
    <div className="designer-footer"><ConfirmActionButton className="secondary" dialogTitle="Réinitialiser le style ?" message="Les réglages visuels actuels seront remplacés par les réglages par défaut." confirmLabel="Réinitialiser" danger onConfirm={() => onChange(defaultVisualDesign(type))}>Réinitialiser</ConfirmActionButton><ConfirmActionButton className="danger-button" dialogTitle="Désactiver le studio visuel ?" message="La configuration visuelle assistée sera retirée de cet objet." confirmLabel="Désactiver" danger onConfirm={onDisable}>Désactiver le studio</ConfirmActionButton></div>
  </section>;
}

export function CosmeticPreview({ user, item, stats = [] }) {
  const previewItem = item?.value ? item : { ...item, value: "admin-preview" };
  const previewUser = previewUserForItem(user, previewItem);
  const cardTier = previewUser.cosmetics?.equipped?.memberCard ?? "default";
  const previewStats = stats.length ? stats : [{ icon: <Trophy size={18} />, label: "Winrate", value: "0%" }, { icon: <BadgeCheck size={18} />, label: "Succès", value: "0/0" }];
  const previewType = item?.type ?? "memberCards";
  const showMemberCard = ["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects"].includes(previewType);
  return (
    <div className={`shop-preview preview-type-${previewType}`}>
      {(previewItem?.design || previewItem?.motion || previewItem?.css) && <style>{cosmeticCssRules([previewItem])}</style>}
      <span>Aperçu · {shopTypeLabel(previewType)}</span>
      {showMemberCard && <ProfileCosmeticShell user={previewUser} className="profile-cosmetic-preview"><div className={`vip-card preview-card member-${cardTier}`}>
        <span className="vip-label">{memberCardOptions[cardTier] ?? item?.name ?? "Carte membre"} · KTGA.ME</span>
        <strong className={`display-name name-${previewUser.cosmetics?.equipped?.nameEffect ?? "none"}`}>
          <CosmeticIcon value={previewUser.cosmetics?.equipped?.icon} source={previewType === "icons" ? item?.icon : undefined} />
          <span className="display-name-text">{previewUser.profile?.displayName ?? previewUser.pseudo}</span>
        </strong>
        <small>{previewUser.friendCode ? `Code ami · ${previewUser.friendCode}` : "MEMBRE · APERÇU"}</small>
        <div className="vip-stats">{previewStats.map((stat, index) => <div className="vip-ratio" key={`${stat.label}-${index}`}>{stat.icon}<span>{stat.label}</span><strong>{stat.value}</strong></div>)}</div>
      </div></ProfileCosmeticShell>}
      {previewType === "diceSkins" && <div className="admin-dice-preview">{[1, 2, 3, 4, 5, 6].map((value) => <Die key={value} value={value} kept={false} skin={previewUser.cosmetics?.equipped?.diceSkin} animate={false} />)}</div>}
      {previewType === "cardSkins" && <div className="skin-preview-row admin-card-preview">
        <PlayingCard card={{ rank: "A", suit: "H" }} skin={previewUser.cosmetics?.equipped?.cardSkin} />
        <PlayingCard card={{ rank: "K", suit: "S" }} skin={previewUser.cosmetics?.equipped?.cardSkin} />
        <PlayingCard hidden skin={previewUser.cosmetics?.equipped?.cardSkin} />
      </div>}
      {!item && <small>Sélectionne un article pour afficher son rendu.</small>}
    </div>
  );
}

export function setCosmeticCatalogItems(items) {
  cosmeticCatalogItems = items;
}
