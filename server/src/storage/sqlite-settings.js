export function sqliteSettings(environment = process.env) {
  const synchronous = String(environment.SQLITE_SYNCHRONOUS || "FULL").toUpperCase();
  if (!["FULL", "NORMAL"].includes(synchronous)) throw new Error("SQLITE_SYNCHRONOUS must be FULL or NORMAL.");
  return { synchronous, walAutoCheckpoint: 1000 };
}
