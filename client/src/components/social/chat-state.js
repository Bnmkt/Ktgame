export function chatRevision(value) {
  return Number.isSafeInteger(value?.revision) && value.revision >= 0 ? value.revision : 0;
}

export function mergeChatSnapshot(rows, payload, knownRevision = 0) {
  const global = payload.channel?.type === "global";
  const revision = chatRevision(payload);
  if (global && revision < knownRevision) return null;
  const fetched = payload.messages ?? [];
  if (global && revision > knownRevision) return fetched.slice(-100);
  const ids = new Set(fetched.map(row => row.id));
  return [...fetched, ...rows.filter(row => row.channelId === payload.channel?.id && row.channelType === payload.channel?.type && typeof payload.readAt === "string" && row.createdAt >= payload.readAt && !ids.has(row.id))].slice(-100);
}
