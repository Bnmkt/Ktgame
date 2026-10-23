import assert from "node:assert/strict";
import test from "node:test";
import { publicResourceManifest, registerResourceManifest } from "../src/services/resource-manifest.js";

test("public manifest extracts references without disclosing configuration or private data",()=>{
  const image=`/api/media/${"a".repeat(64)}.png`, rank=`/api/ranked/insignia-images/${"b".repeat(64)}`;
  const manifest=publicResourceManifest([{css:`background:url(${image})`,image,items:[rank],secret:"do not expose",private:"/api/bugs/images/secret.png"}],[{image,bytes:800,createdBy:"private"}]);
  assert.equal(manifest.assets.length,2);assert.equal(manifest.assets[0].bytes,800);
  assert.ok(!JSON.stringify(manifest).includes("private"));assert.ok(!JSON.stringify(manifest).includes("do not expose"));
});
test("public manifest caches its catalog rather than rescanning on every request",()=>{
  let handler,calls=0,body;
  registerResourceManifest({app:{get:(_path,callback)=>{handler=callback;}},sources:()=>{calls++;return[];},media:()=>[]});
  const response={set:()=>response,json:value=>{body=value;}};
  handler({},response);handler({},response);assert.equal(calls,1);assert.deepEqual(body,{version:1,assets:[]});
});
