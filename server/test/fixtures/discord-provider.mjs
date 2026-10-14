if (process.env.NODE_ENV !== "test") throw new Error("Discord fixture must never run outside tests");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url) === "https://discord.com/api/oauth2/token") {
    const body = new URLSearchParams(options.body);
    const id = body.get("code");
    if (!/^\d{18}$/.test(id)) return Response.json({ error: "invalid_grant" }, { status: 400 });
    return Response.json({ access_token: `fixture:${id}`, token_type: "Bearer" });
  }
  if (String(url) === "https://discord.com/api/v10/users/@me") return Response.json({ id: String(options.headers.Authorization).split(":").at(-1), username: "FixtureDiscord", email: "player@example.test" });
  return originalFetch(url, options);
};
