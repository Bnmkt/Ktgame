import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createEditorDuplicationLimit, EDITOR_DUPLICATION_INTERVAL, isEditorDuplication, validateEditorDuplicationUsers } from "../src/services/editor-duplication.js";

const limitedId = "limited-editor";
const limitedUserIds = () => [limitedId];
function invoke(guard, id = limitedId, status = 201, finish = true) {
  const res = new EventEmitter(); res.statusCode = status; res.headers = {}; res.setHeader = (key, value) => res.headers[key] = value;
  res.status = value => { res.statusCode = value; return res; }; res.json = value => res.body = value;
  guard({ backOfficeUser: { id, pseudo: "Changed name" } }, res, () => { res.allowed = true; if (finish) res.emit("finish"); });
  return res;
}
test("duplication paths include legacy shop copies, new tools, casing and trailing slashes", () => {
  for (const path of ["/community-events/one/duplicate", "/achievements/two/duplicate/", "/PATCHNOTES/three/DUPLICATE", "/future-tool/item/duplicate"]) assert.equal(isEditorDuplication({method:"POST",path}),true);
  assert.equal(isEditorDuplication({method:"POST",path:"/SHOP/",body:{id:"source"}}),true);
  assert.equal(isEditorDuplication({method:"POST",path:"/shop",body:{name:"New object"}}),false);
  assert.equal(isEditorDuplication({method:"GET",path:"/item/duplicate"}),false);
});
test("the five-minute cooldown is global, atomic across connections, durable and identity-bound", () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ktga-editor-limit-")), filename=path.join(directory,"limits.sqlite");
  let time=1000000, first=createEditorDuplicationLimit({filename,limitedUserIds,now:()=>time}), second=createEditorDuplicationLimit({filename,limitedUserIds,now:()=>time});
  try {
    const inFlight=invoke(first,limitedId,201,false);assert.equal(inFlight.allowed,true);
    const blocked=invoke(second);assert.equal(blocked.statusCode,429);assert.equal(blocked.body.retryAfterSeconds,300);assert.equal(blocked.headers["Retry-After"],"300");
    inFlight.emit("finish");assert.equal(invoke(second,"another-editor").allowed,true);
    first.close();first=createEditorDuplicationLimit({filename,limitedUserIds,now:()=>time});assert.equal(invoke(first).statusCode,429);
    time+=EDITOR_DUPLICATION_INTERVAL-1;assert.equal(invoke(second).statusCode,429);
    time++;assert.equal(invoke(first).allowed,true);assert.equal(invoke(second).statusCode,429);
  } finally {first.close();second.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test("failed copies release their reservation and cannot clear a newer cooldown", () => {
  let time=1000000;const guard=createEditorDuplicationLimit({filename:":memory:",limitedUserIds,now:()=>time});
  try {
    assert.equal(invoke(guard,limitedId,404).allowed,true);const previous=invoke(guard,limitedId,400,false);assert.equal(previous.allowed,true);
    time+=EDITOR_DUPLICATION_INTERVAL;assert.equal(invoke(guard).allowed,true);previous.emit("finish");assert.equal(invoke(guard).statusCode,429);
  } finally {guard.close();}
});

test("configured users can be added and removed without restarting", () => {
  let ids = [];
  const guard = createEditorDuplicationLimit({ filename: ":memory:", limitedUserIds: () => ids });
  try {
    assert.equal(invoke(guard).allowed, true);
    ids = [limitedId]; assert.equal(invoke(guard).allowed, true); assert.equal(invoke(guard).statusCode, 429);
    ids = []; assert.equal(invoke(guard).allowed, true);
    ids = [limitedId]; assert.equal(invoke(guard).statusCode, 429);
    assert.deepEqual(validateEditorDuplicationUsers([limitedId, limitedId], [{ id: limitedId }]), [limitedId]);
    for (const invalid of [null, "all", ["unknown"], [{}], ["guest"]]) assert.throws(() => validateEditorDuplicationUsers(invalid, [{ id: "guest", guest: true }]));
  } finally { guard.close(); }
});
