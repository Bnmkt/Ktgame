export function velvetClaimAllowed(claim, edict, rule = "suit-or-rank") {
  if (!claim || !edict) return false;
  if (rule === "suit-only") return claim.suit === edict.suit;
  if (rule === "rank-only") return claim.rank === edict.rank;
  return claim.suit === edict.suit || claim.rank === edict.rank;
}
