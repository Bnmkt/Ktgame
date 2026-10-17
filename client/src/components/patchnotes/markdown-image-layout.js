export function markdownImageLayout(title = "") {
  const match = /^float:(left|right)(?:\s+width:(\d{1,2})%)?$/.exec(title.trim());
  return match ? { side: match[1], width: Math.max(20, Math.min(60, Number(match[2] || 40))) } : null;
}
