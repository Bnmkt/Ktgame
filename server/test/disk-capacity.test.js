import test from "node:test";
import assert from "node:assert/strict";
import { createDiskCapacity } from "../src/services/disk-capacity.js";

test("disk capacity distinguishes total, used, available and reserved space",async()=>{
  const capacity=createDiskCapacity("/test",{read:async()=>({bsize:1024n,blocks:100n,bfree:40n,bavail:30n}),now:()=>1000});
  const result=await capacity.refresh();
  assert.equal(result.totalBytes,102400);assert.equal(result.usedBytes,61440);assert.equal(result.availableBytes,30720);assert.equal(result.reservedBytes,10240);assert.equal(result.usedPercent,60);
  result.totalBytes=1;assert.equal(capacity.snapshot().totalBytes,102400);
});
test("disk probes are asynchronous, coalesced and cached for 30 seconds",async()=>{
  let count=0,now=1000,resolve;
  const capacity=createDiskCapacity("/test",{now:()=>now,read:()=>{count++;return new Promise(done=>{resolve=done;});}});
  const first=capacity.refresh(),second=capacity.refresh();assert.equal(first,second);assert.equal(count,1);
  resolve({bsize:1,blocks:100,bfree:40,bavail:30});await first;
  capacity.snapshot();assert.equal(count,1);now+=30001;capacity.snapshot();assert.equal(count,2);
  resolve({bsize:1,blocks:100,bfree:30,bavail:20});await capacity.refresh();assert.equal(capacity.snapshot().availableBytes,20);
});
test("unsupported probes retain the last measurement without inventing zero capacity",async()=>{
  let fails=true;
  const capacity=createDiskCapacity("/test",{read:async()=>{if(fails)throw Error("private filesystem detail");return{bsize:1,blocks:100,bfree:40,bavail:30};}});
  assert.equal(await capacity.refresh(),null);fails=false;await capacity.refresh();fails=true;
  const result=await capacity.refresh();assert.equal(result.totalBytes,100);assert.equal(result.unavailable,true);assert.ok(!JSON.stringify(result).includes("private"));
});
