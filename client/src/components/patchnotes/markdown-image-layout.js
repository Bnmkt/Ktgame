
export function markdownImageLayout(title = "") {
  const tokens = String(title).trim().split(/\s+/);
  const match = /^float:(left|right)$/.exec(tokens.shift() || "");
  if (!match) return null;

  let width;
  let height;

  for (const token of tokens) {
    const size = /^(width|height):([1-9]\d{0,3})(%|px)$/.exec(token);
    if (!size || (size[1] === "height" && size[3] !== "px")) return null;

    const value = Number(size[2]);
    const dimension = size[3] === "%"
      ? `${Math.max(20, Math.min(60, value))}%`
      : `${Math.min(2000, value)}px`;

    if (size[1] === "width") width = dimension;
    else height = dimension;
  }

  return {
    side: match[1],
    width: width || (height ? "auto" : "40%"),
    height: height || "auto"
  };
}
