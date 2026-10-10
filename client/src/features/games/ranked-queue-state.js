export function rankedPreparation(proposal, now) {
  const startsIn = Math.max(0, Math.ceil((proposal.startsAfter-now)/1000));
  const expiresIn = Math.max(0, Math.ceil((proposal.expiresAt-now)/1000));
  const ready = proposal.players.filter((player)=>player.ready).length;
  const remaining = proposal.players.length-ready;
  const phase = !remaining && !startsIn ? "creating" : !expiresIn ? "expired" : startsIn ? "preparing" : "confirming";
  return { phase, startsIn, expiresIn, remaining };
}
