import { statfs } from "node:fs/promises";

export function createDiskCapacity(directory, { read = statfs, now = Date.now, ttlMs = 30000 } = {}) {
  let latest = null, expires = 0, pending = null;
  function refresh() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const stats = await read(directory, { bigint:true });
        const block = Number(stats.bsize), totalBytes = Number(stats.blocks) * block;
        const freeBytes = Math.min(totalBytes,Math.max(0,Number(stats.bfree) * block));
        const availableBytes = Math.min(freeBytes,Math.max(0,Number(stats.bavail) * block));
        if (![totalBytes,freeBytes,availableBytes].every(Number.isSafeInteger) || totalBytes <= 0) throw Error("Invalid capacity");
        latest = { totalBytes,freeBytes,availableBytes,usedBytes:totalBytes-freeBytes,reservedBytes:freeBytes-availableBytes,usedPercent:(totalBytes-freeBytes)/totalBytes*100,sampledAt:new Date(now()).toISOString(),unavailable:false };
      } catch { latest = latest ? { ...latest,unavailable:true } : null; }
      finally { expires=now()+ttlMs;pending=null; }
      return latest ? { ...latest } : null;
    })();
    return pending;
  }
  return { refresh, snapshot() { if(now()>=expires)void refresh();return latest ? { ...latest } : null; } };
}
