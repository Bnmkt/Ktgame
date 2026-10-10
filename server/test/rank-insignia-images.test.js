import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { createRankInsigniaStore } from "../src/services/rank-insignia-images.js";

function chunk(type, data) {
  const bytes=Buffer.concat([Buffer.from(type),data]);
  let crc=0xffffffff;
  for(const byte of bytes) {crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const output=Buffer.alloc(data.length+12);output.writeUInt32BE(data.length);bytes.copy(output,4);output.writeUInt32BE((crc^0xffffffff)>>>0,output.length-4);return output;
}
function png(width=1,height=1,metadata=false) {
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),...(metadata?[chunk("tEXt",Buffer.from("Author\0private@example.com"))]:[]),chunk("IDAT",deflateSync(Buffer.alloc((width*4+1)*height))),chunk("IEND",Buffer.alloc(0))]);
}
test("insignia assets are sanitized, content-addressed and stored outside the catalog",()=> {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ktga-rank-images-"));
  try {
    const store=createRankInsigniaStore(directory),image=store.save(png(512,512,true));
    assert.match(image.id,/^[a-f0-9]{64}$/);assert.equal(image.width,512);assert.ok(store.has(image.id));
    assert.deepEqual(fs.readFileSync(store.targetFor(image.id)),png(512,512));
    assert.equal(store.save(png(512,512)).id,image.id);assert.equal(fs.readdirSync(directory).length,1);
    assert.equal(store.has("../test"),false);assert.equal(store.targetFor("../test"),null);
    for(const data of [png(2,1),png(513,513),Buffer.from("<svg onload='alert(1)'/>"),Buffer.alloc(2*1024*1024+1)]) assert.throws(()=>store.save(data));
    const damaged=png();damaged[32]^=1;assert.throws(()=>store.save(damaged));
  } finally {
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("ktga-rank-images-"));
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
