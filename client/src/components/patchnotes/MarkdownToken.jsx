import { useEffect, useState } from "react";
import { api } from "../../api.js";
import { Die, PlayingCard } from "../game/GamePieces.jsx";
import { RankInsignia } from "../../features/games/RankInsignia.jsx";
import { parseMarkdownToken, resolveMarkdownRank } from "./markdown-tokens.js";

let cachedRanks, rankRequest, checkedAt = 0;
function loadRanks() {
  if (cachedRanks && Date.now() - checkedAt < 60000) return Promise.resolve(cachedRanks);
  if (!rankRequest) rankRequest = api("/api/ranked/ranks", { background: true }).then((data) => { cachedRanks = data.ranks || []; checkedAt = Date.now(); return cachedRanks; }).finally(() => { rankRequest = null; });
  return rankRequest;
}

function MarkdownRank({ token, value }) {
  const [ranks, setRanks] = useState(cachedRanks || []);
  useEffect(() => { let active = true; loadRanks().then((rows) => { if (active) setRanks(rows); }).catch(() => {}); return () => { active = false; }; }, []);
  const rank = resolveMarkdownRank(token, ranks);
  return rank ? <span className="ktga-inline-piece ktga-inline-rank" role="img" aria-label={rank.label} title={rank.label}><RankInsignia rank={rank} /></span> : <>{value}</>;
}

export function MarkdownToken({ value }) {
  const token = parseMarkdownToken(value);
  if (!token) return <>{value}</>;
  if (token.kind === "rank") return <MarkdownRank token={token} value={value} />;
  return <span className={`ktga-inline-piece ktga-inline-${token.kind}`} role="img" aria-label={token.kind === "dice" ? `De ${token.value}` : token.card ? `Carte ${token.card.rank}${token.card.suit}` : "Dos de carte"}>
    {token.kind === "dice" ? <Die value={token.value} animate={false} kept={false} inline /> : <PlayingCard card={token.card} animate={false} inline />}
  </span>;
}
