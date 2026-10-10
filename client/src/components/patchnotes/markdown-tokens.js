export function parseMarkdownToken(value) {
  const die = /^@!ktga-dice-([1-6])$/i.exec(value);
  if (die) return { kind: "dice", value: Number(die[1]) };
  const card = /^@!ktga-card-(10|[2-9AJQK])-?([SHDC])$/i.exec(value);
  if (card) return { kind: "card", card: { rank: card[1].toUpperCase(), suit: card[2].toUpperCase() } };
  if (/^@!ktga-card-back$/i.test(value)) return { kind: "card", card: null };
  const rank = /^@!ktga-rank-([a-z]+(?:-[a-z]+)*)(10|[1-9])?$/i.exec(value);
  if (rank) return { kind: "rank", name: rank[1].toLowerCase(), division: Number(rank[2] || 0) };
  return null;
}

export function resolveMarkdownRank(token, ranks) {
  const normalized = (value) => String(value).normalize("NFKD").replace(/[\u0300-\u036f\s-]/g, "").toLowerCase();
  const rank = ranks.find((row) => normalized(row.id) === normalized(token.name) || normalized(row.name) === normalized(token.name));
  if (!rank || token.division > rank.divisions || token.division && rank.divisions === 1) return null;
  const division = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][token.division];
  return { ...rank, ...(rank.divisionInsignia?.[division] || {}), division, label: `${rank.name}${division ? ` ${division}` : ""}` };
}

export function remarkKtgaTokens() {
  return (tree) => {
    let count = 0;
    function visit(node) {
      if (["code", "inlineCode", "html", "image", "link", "linkReference"].includes(node.type) || !node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text") { visit(child); return [child]; }
        const rows = [], pattern = /@!ktga-(?:dice|card|rank)-[a-z0-9-]+/gi;
        let cursor = 0;
        for (const match of child.value.matchAll(pattern)) {
          if (count >= 128 || !parseMarkdownToken(match[0])) continue;
          if (match.index > cursor) rows.push({ type: "text", value: child.value.slice(cursor, match.index) });
          rows.push({ type: "ktgaToken", data: { hName: "span", hProperties: { "data-ktga-token": match[0] } }, children: [{ type: "text", value: match[0] }] });
          cursor = match.index + match[0].length;
          count++;
        }
        if (!rows.length) return [child];
        if (cursor < child.value.length) rows.push({ type: "text", value: child.value.slice(cursor) });
        return rows;
      });
    }
    visit(tree);
  };
}
