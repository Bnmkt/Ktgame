import { isFundedPlayer } from "../../../client/src/features/games/token-economy.js";

export function fundedRoomPlayers(players, account) {
  return players.filter((player) => isFundedPlayer(player) && (!account || isFundedPlayer(account(player.id))));
}

export function classicRoomPayouts(room, ranking, pot, account) {
  const eligible = new Set(fundedRoomPlayers(room.players, account).map(({ id }) => id));
  const players = ranking.filter((player) => eligible.has(player.id));
  const rates = players.length <= 1 ? [1] : players.length === 2 ? [0.7, 0.3] : [0.6, 0.3, 0.1];
  return Object.fromEntries(players.slice(0, rates.length).map((player, index) => [player.id, Math.floor(Math.max(0, pot) * rates[index])]));
}

export function pokerAvailableFunds(room, account) {
  const state = room.state;
  const seated = new Map(room.players.map((player) => [player.id, player]));
  const original = (state.players ?? room.players).map((player) => seated.get(player.id) ?? player);
  const funded = Math.max(0, Number(room.stake) || 0) * fundedRoomPlayers(original, account).length;
  // Older checkpoints may include virtual buy-ins. Never redeem more than the
  // registered players actually committed, even when virtual stacks have grown.
  const bankroll = Math.min(funded, Math.max(0, Number(state.realBankroll ?? funded) || 0));
  const recovered = Object.values(state.departedPayouts ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return Math.max(0, bankroll - recovered);
}

export function pokerRoomPayouts(room, account) {
  const players = fundedRoomPlayers(room.players, account);
  const available = pokerAvailableFunds(room, account);
  const weights = players.map(({ id }) => Math.max(0, room.state.stacks?.[id] ?? 0));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let distributed = 0;
  return Object.fromEntries(players.map((player, index) => {
    const amount = index === players.length - 1 ? available - distributed : total ? Math.floor(available * weights[index] / total) : 0;
    distributed += amount;
    return [player.id, amount];
  }));
}
