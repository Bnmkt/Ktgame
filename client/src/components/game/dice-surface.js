export function splitCssList(value) {
  const parts = [];
  let depth = 0, quote = "", start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "\\") { i += 1; continue; }
    if (quote) { if (char === quote) quote = ""; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

export function gradientStops(layer) {
  const args = splitCssList(layer.slice(layer.indexOf("(") + 1, -1));
  const stops = args.map((arg) => {
    const match = /^(rgba?\([^)]*\)|hsla?\([^)]*\)|(?:oklch|oklab|lab|lch|color)\([^)]*\)|transparent)(?:\s+(-?[\d.]+)%)?/i.exec(arg);
    return match ? { color: match[1], offset: match[2] === undefined ? null : Math.max(0, Math.min(1, Number(match[2]) / 100)) } : null;
  }).filter(Boolean);
  if (!stops.length) return [];
  stops[0].offset ??= 0;
  stops[stops.length - 1].offset ??= 1;
  for (let i = 0; i < stops.length - 1; i += 1) {
    let end = i + 1;
    while (end < stops.length && stops[end].offset === null) end += 1;
    if (end >= stops.length) break;
    stops[end].offset = Math.max(stops[i].offset, stops[end].offset);
    for (let j = i + 1; j < end; j += 1) stops[j].offset = stops[i].offset + (stops[end].offset - stops[i].offset) * (j - i) / (end - i);
  }
  return stops;
}

export function shadowFilter(value, scale = 1) {
  return splitCssList(value).filter((part) => !part.includes("inset")).slice(0, 3).map((part) => {
    const color = /(?:rgba?|color|oklab|oklch)\([^)]*\)/.exec(part)?.[0];
    const lengths = part.replace(color ?? "", "").match(/-?[\d.]+px/g)?.map(parseFloat);
    if (!color || !lengths || lengths.length < 2) return "";
    return `drop-shadow(${lengths[0] * scale}px ${lengths[1] * scale}px ${Math.min(28, Math.max(0, (lengths[2] ?? 0) * scale / 2))}px ${color})`;
  }).filter(Boolean).join(" ") || "none";
}

function dimension(value, size, fallback = size) {
  return value?.endsWith("%") ? parseFloat(value) * size / 100 : value?.endsWith("px") ? parseFloat(value) * size / 76 : fallback;
}

export function paintDiceSurface(canvas, value, palette, image, pips) {
  const size = canvas.width;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, size, size);
  context.fillStyle = palette.backgroundColor === "rgba(0, 0, 0, 0)" ? "#f4edda" : palette.backgroundColor;
  context.fillRect(0, 0, size, size);
  const width = dimension(palette.backgroundSize.split(" ")[0], size);
  const height = dimension(palette.backgroundSize.split(" ")[1], size, width);
  const position = palette.backgroundPosition.split(" ");
  const left = (size - width) * (parseFloat(position[0]) || 0) / 100;
  const top = (size - height) * (parseFloat(position[1]) || 0) / 100;
  for (const layer of splitCssList(palette.backgroundImage).reverse()) {
    if (!layer.includes("gradient(")) continue;
    const stops = gradientStops(layer);
    if (!stops.length) continue;
    const angle = (Number(/\(\s*(-?[\d.]+)deg/.exec(layer)?.[1] ?? 180) * Math.PI) / 180;
    const dx = Math.sin(angle), dy = -Math.cos(angle);
    const length = Math.abs(width * dx) + Math.abs(height * dy);
    const cx = left + width / 2, cy = top + height / 2;
    const radial = layer.startsWith("radial-gradient");
    const gradient = radial
      ? context.createRadialGradient(left + width * .3, top + height * .25, 0, cx, cy, Math.max(width, height) * .8)
      : context.createLinearGradient(cx - dx * length / 2, cy - dy * length / 2, cx + dx * length / 2, cy + dy * length / 2);
    stops.forEach(({ color, offset }) => gradient.addColorStop(offset, color));
    context.fillStyle = gradient; context.fillRect(0, 0, size, size);
  }
  if (image) {
    const scale = Math.max(size / image.width, size / image.height);
    context.drawImage(image, (size - image.width * scale) / 2, (size - image.height * scale) / 2, image.width * scale, image.height * scale);
  }
  const borderWidth = Math.min(24, palette.borderWidth * size / 76);
  if (borderWidth > 0 && !["none", "hidden"].includes(palette.borderStyle)) {
    context.save();
    context.strokeStyle = palette.borderColor; context.lineWidth = borderWidth;
    if (palette.borderStyle === "dashed") context.setLineDash([borderWidth * 3, borderWidth * 2]);
    if (palette.borderStyle === "dotted") { context.setLineDash([.1, borderWidth * 2]); context.lineCap = "round"; }
    const path = (inset, width) => {
      context.lineWidth = width; context.beginPath();
      context.roundRect(inset, inset, size - inset * 2, size - inset * 2, 22);
      context.stroke();
    };
    if (palette.borderStyle === "double") {
      path(8 + borderWidth / 6, borderWidth / 3);
      path(8 + borderWidth * 5 / 6, borderWidth / 3);
    } else path(8 + borderWidth / 2, borderWidth);
    context.restore();
  }
  for (const dot of pips[value]) {
    const x = size / 2 + ((dot - 1) % 3 - 1) * size * .23;
    const y = size / 2 + (Math.floor((dot - 1) / 3) - 1) * size * .23;
    const radius = palette.pipSize;
    context.save(); context.translate(x, y);
    context.transform(...palette.pipTransform);
    context.fillStyle = palette.pip;
    context.shadowColor = palette.pip; context.shadowBlur = palette.pipGlow;
    context.beginPath();
    context.roundRect(-radius, -radius, radius * 2, radius * 2, Math.min(radius, palette.pipRadius));
    context.fill(); context.restore();
  }
}
