const forbidden = /(?:password|secret|hash|verificationCode|recoveryCode|parentEmail|reviewedBy|approvedBy|updatedBy)|^(?:token|accessToken|refreshToken|emailVerification|mfaChallenges|totpSetup|reviewerId|createdById|approvedById)$/i;

export function removePersonalSecrets(value) {
  if (Array.isArray(value)) return value.map(removePersonalSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => !forbidden.test(key) || key === "secret" && typeof entry === "boolean").map(([key, entry]) => [key, removePersonalSecrets(entry)]));
}

export function personalGame(row, userId) {
  return {
    id: row.id, roomId: row.roomId, gameId: row.gameId, name: row.name, code: row.code,
    finishedAt: row.finishedAt, pot: row.pot, won: row.winners?.includes(userId) ?? false,
    ...(Object.hasOwn(row.xpAwards ?? {}, userId) ? { xpEarned: row.xpAwards[userId] } : {}),
    participantCount: row.participantCount ?? row.players?.length ?? 0,
    player: removePersonalSecrets(row.players?.find((entry) => entry.id === userId) ?? null)
  };
}
