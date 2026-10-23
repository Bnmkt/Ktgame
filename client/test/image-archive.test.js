import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { zipSync } from "fflate";
import { extractImageArchive, IMAGE_ARCHIVE_LIMITS } from "../src/features/media/image-archive.js";
const png=new Uint8Array(fs.readFileSync(new URL("../public/pwa/icon-180.png",import.meta.url)));

test("ZIP imports preserve filenames and directory context without uploading or re-encoding",async()=>{
  const zipped=zipSync({"mascottes/Équipe chanceuse.png":png,"fonds/casino.png":png,"README.txt":new TextEncoder().encode("ignored")});
  const result=extractImageArchive(zipped,3);
  assert.equal(result.skipped,1);assert.equal(result.rows.length,2);
  assert.equal(result.rows[0].name,"Équipe chanceuse.png");assert.equal(result.rows[0].path,"mascottes/Équipe chanceuse.png");
  assert.deepEqual(new Uint8Array(await result.rows[0].blob.arrayBuffer()),png);
  assert.equal(result.rows[0].mime,"image/png");assert.equal(result.rows[0].problem,"");
});
test("unsafe paths, disguised files and oversized images cannot be selected",()=>{
  const large=new Uint8Array(2*1024*1024);large.set(png);
  const result=extractImageArchive(zipSync({"../escape.png":png,"file.png":new TextEncoder().encode("not an image but longer than twenty bytes"),"large.png":large,"photo.constructor":png}),1);
  assert.equal(result.skipped,1);
  assert.ok(result.rows.every(row=>row.problem && row.blob===null));
  assert.ok(result.rows.find(row=>row.filename==="large.png").problem.includes("1 Mo"));
});
test("macOS metadata and non-images are skipped; stored and compressed ZIPs both work",()=>{
  for(const level of [0,6]){
    const result=extractImageArchive(zipSync({"__MACOSX/._cover.png":png,"nested/.hidden.png":png,"cover.PNG":png,"vector.svg":png},{level}));
    assert.equal(result.rows.length,1);assert.equal(result.skipped,3);assert.equal(result.rows[0].problem,"");
  }
});
test("GIF imports remain animated originals and WebP/JPEG signatures are checked",async()=>{
  const gif=Uint8Array.from(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7","base64"));
  const result=extractImageArchive(zipSync({"animation.gif":gif,"fake.webp":png,"fake.jpg":png}));
  assert.deepEqual(new Uint8Array(await result.rows[0].blob.arrayBuffer()),gif);
  assert.ok(result.rows.slice(1).every(row=>row.problem));
});
test("corrupt, excessive and nested-only archives are rejected before image decompression",()=>{
  assert.throws(()=>extractImageArchive(new Uint8Array(50)));
  assert.throws(()=>extractImageArchive(zipSync({"another.zip":png})),/Aucune image/);
  assert.throws(()=>extractImageArchive(zipSync(Object.fromEntries(Array.from({length:IMAGE_ARCHIVE_LIMITS.images+1},(_,n)=>[`${n}.png`,png])))),/200 images/);
});
