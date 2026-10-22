export const GUEST_TOKENS = 10000;

export function isFundedPlayer(player) {
  return Boolean(player && !player.isBot && !player.guest);
}

export function walletTokens(user) {
  return user?.guest && !user.isBot ? GUEST_TOKENS : Math.max(0, Number(user?.tokens) || 0);
}
