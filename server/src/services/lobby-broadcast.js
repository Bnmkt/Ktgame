export function createLobbyBroadcast({ rooms, emit, delayMs = 250 }) {
  let timer = null, previous = "", previousRows = new Map();
  function flush() {
    timer = null;
    const payload = rooms(), signature = JSON.stringify(payload);
    if (signature === previous) return;
    const nextRows = new Map(payload.map((row) => [row.id, JSON.stringify(row)]));
    const upsert = payload.filter((row) => previousRows.get(row.id) !== nextRows.get(row.id));
    const remove = [...previousRows.keys()].filter((id) => !nextRows.has(id));
    previous = signature;
    previousRows = nextRows;
    emit(payload, { upsert, remove });
  }
  return {
    schedule() { if (!timer) { timer = setTimeout(flush, delayMs); timer.unref?.(); } },
    close() { if (timer) clearTimeout(timer); timer = null; }
  };
}
