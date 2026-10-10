process.on("message", (message) => {
  if (message.type === "initialize") return;
  process.send({ id: message.id, result: { configuration: message.payload?.configuration?.id ?? null,
    configId: message.payload?.configId, inheritedSecret: Boolean(process.env.SMTP_PASS || process.env.JWT_SECRET || process.env.NODE_OPTIONS),
    timeZone: process.env.CASINO_TIME_ZONE, pid: process.pid } });
});
process.on("disconnect", () => process.exit(0));
