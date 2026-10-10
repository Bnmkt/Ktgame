import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { contactNoticeEmail, createContactNoticeQueue } from "../src/services/contact-notices.js";

const environment = { CONTACT_EMAIL: "contact@example.com", PUBLIC_APP_URL: "https://example.com/ktga", SMTP_HOST: "fixture", EMAIL_FROM: "fixture@example.com" };
const notice = { kind: "bug-received", reference: 1842, at: "2026-10-04T12:00:00Z" };
test("contact emails use configured recipients and absolute app links without diagnostic or account contents", () => {
  const bug = contactNoticeEmail({ ...notice, description: "PRIVATE", diagnostics: { token: "PRIVATE" }, images: ["PRIVATE"] }, environment, "<KTGA>");
  assert.equal(bug.to, "contact@example.com"); assert.match(bug.text, /https:\/\/example.com\/ktga\/bugs\/1842/);
  assert.match(bug.text, /14:00/); assert.match(bug.subject, /BUG 1842/); assert.ok(!JSON.stringify(bug).includes("PRIVATE"));
  assert.match(bug.html, /&lt;KTGA&gt;/); assert.equal(bug.attachments, undefined);
  const rights = contactNoticeEmail({ kind: "data-request", reference: "request-id", at: notice.at, dueAt: "2026-11-04T22:59:59.999Z" }, environment);
  assert.match(rights.text, /https:\/\/example.com\/ktga\/admin/); assert.match(rights.text, /Échéance de réponse/);
  assert.throws(() => contactNoticeEmail(notice, { ...environment, CONTACT_EMAIL: "invalid" }), /contact invalide/);
  assert.throws(() => contactNoticeEmail(notice, { ...environment, PUBLIC_APP_URL: "javascript:alert(1)" }), /publique invalide/);
  assert.equal(contactNoticeEmail(notice, { CLIENT_ORIGIN: "https://example.com", APP_BASE_PATH: "/ktga" }).to, "contact@netdis.org");
});

test("contact queue deduplicates notifications, drains concurrent additions, and never changes recipients from user input", async () => {
  const sent = []; let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const queue = createContactNoticeQueue({ filename: ":memory:", intervalMs: 0, environment, sendEmail: async (mail) => { sent.push(mail); if (sent.length === 1) await wait; } });
  try {
    assert.equal(queue.enqueue("received:1842", { ...notice, to: "attacker@example.com" }), true);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(queue.enqueue("received:1842", notice), false);
    queue.enqueue("published:1842", { ...notice, kind: "bug-published" });
    release(); await queue.flush();
    assert.equal(sent.length, 2); assert.equal(queue.pendingCount(), 0);
    assert.ok(sent.every((mail) => mail.to === environment.CONTACT_EMAIL)); assert.notEqual(sent[0].messageId, sent[1].messageId);
    queue.enqueue("received:1842", notice); await queue.flush(); assert.equal(sent.length, 2);
  } finally { release(); queue.close(); }
});

test("SMTP failures remain persisted across restarts and retry with backoff; missing SMTP configuration keeps alerts queued", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ktga-contact-notices-")), filename = path.join(directory, "notices.sqlite");
  let time = Date.now(), attempts = 0, configured = true;
  const first = createContactNoticeQueue({ filename, environment, intervalMs: 0, now: () => time, configured: () => configured, sendEmail: async () => { attempts++; throw new Error("secret SMTP error"); } });
  first.enqueue("received:1842", notice); await first.flush(); assert.equal(first.pendingCount(), 1); assert.equal(attempts, 1);
  await first.flush(); assert.equal(attempts, 1); first.close();
  const sent = [], second = createContactNoticeQueue({ filename, environment, intervalMs: 0, now: () => time, configured: () => configured, sendEmail: async (mail) => sent.push(mail) });
  try {
    time += 60001; configured = false; await second.flush(); assert.equal(second.pendingCount(), 1); assert.equal(sent.length, 0);
    configured = true; await second.flush(); assert.equal(second.pendingCount(), 0); assert.equal(sent.length, 1);
  } finally {
    second.close(); assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir())); assert.ok(path.basename(directory).startsWith("ktga-contact-notices-")); rmSync(directory, { recursive: true, force: true });
  }
});

test("pending alerts resolve the current administrator contact on each retry without changing SMTP identity", async () => {
  let contact = "first@example.com", available = false;
  const sent = [];
  const queue = createContactNoticeQueue({ filename: ":memory:", environment, intervalMs: 0, configured: () => available, contactEmail: () => contact, sendEmail: async (mail, smtp) => sent.push({ mail, smtp }) });
  try {
    queue.enqueue("received:1842", notice);
    await queue.flush(); assert.equal(sent.length, 0);
    contact = "updated@example.com"; available = true;
    await queue.flush(); assert.equal(sent[0].mail.to, contact);
    assert.equal(sent[0].smtp, environment);
    assert.equal(environment.CONTACT_EMAIL, "contact@example.com");
  } finally { queue.close(); }
});
