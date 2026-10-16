import assert from "node:assert/strict";
import test from "node:test";
import { activityBrowserUrl, isDiscordActivityLocation } from "../src/features/discord/context.js";

test("only exact application proxy hosts activate the Discord transport", () => {
  assert.equal(isDiscordActivityLocation(new URL("https://123456789012345678.discordsays.com/")), true);
  for (const url of ["https://www.ktga.me/?frame_id=spoof", "https://discordsays.com/", "https://123456789012345678.discordsays.com.evil.test/", "https://evil.discordsays.com/", "http://123456789012345678.discordsays.com/"]) assert.equal(isDiscordActivityLocation(new URL(url)), false, url);
});
test("external browser links preserve the table but never propagate Discord context, credentials or fragments", () => {
  assert.equal(activityBrowserUrl(new URL("https://123456789012345678.discordsays.com/table/ABC123?frame_id=private&token=secret#password"), "https://www.ktga.me/"), "https://www.ktga.me/table/ABC123");
  assert.equal(activityBrowserUrl({ pathname: "//evil.test/table" }, "https://www.ktga.me/"), "https://www.ktga.me//evil.test/table");
  assert.equal(activityBrowserUrl({ pathname: "/discord-activity/" }, "https://www.ktga.me/"), "https://www.ktga.me/");
  for (const base of ["javascript:alert(1)", "https://user:secret@example.test", "http://www.ktga.me/"]) assert.throws(() => activityBrowserUrl({ pathname: "/" }, base));
});
