import assert from "node:assert/strict";
import test from "node:test";
import { appPath, readRoute } from "../src/navigation/routes.js";
import { pageMetadata } from "../src/seo/metadata.js";

test("public game routes are absolute and respect installations in a subdirectory", () => {
  assert.equal(appPath("games", "yahtzee"), "/jeux/yahtzee");
  assert.equal(appPath("games", "421", "/ktga/"), "/ktga/jeux/421");
  assert.deepEqual(readRoute({ pathname: "/jeux/yahtzee", search: "" }), { view: "games", id: "yahtzee" });
  assert.deepEqual(readRoute({ pathname: "/ktga/jeux/421", search: "" }, "/ktga/"), { view: "games", id: "421" });
  assert.deepEqual(readRoute({ pathname: "/jeux/invalid/extra", search: "" }), { view: "not-found" });
});
test("patchnote paths preserve version identity while metadata uses one canonical URL", () => {
  assert.deepEqual(readRoute({ pathname: "/patchnotes/0.2.1a", search: "" }), { view: "patchnotes", id: "0.2.1a" });
  const meta = pageMetadata({ pathname: "/patchnotes/0.2.1a", notes: [{ version: "0.2.1a", title: "Correctifs", status: "published" }] });
  assert.equal(meta.canonicalPath, "/patchnotes?version=0.2.1a"); assert.equal(meta.indexable, true);
});
test("private routes and verification links stay out of search results", () => {
  for (const pathname of ["/profil", "/admin", "/shop", "/table/ABC123", "/observer/ABC123", "/evenement/test", "/bugs/1842"]) assert.equal(pageMetadata({ pathname }).indexable, false, pathname);
  assert.equal(pageMetadata({ pathname: "/", search: "?verify-email=sensitive" }).indexable, false);
  assert.equal(pageMetadata({ pathname: "/parents", search: "?parental-access=sensitive" }).indexable, false);
});
