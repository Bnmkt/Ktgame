import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { normalizeResources, prepareResources, resourceAllowed, resourceCacheKey, retainResourceGenerations } from "../src/pwa/resources.js";

const origin = "https://www.ktga.me";
const asset = (name, revision = "v1") => ({ url:`${origin}/assets/${name}.js`, revision, bytes:12, category:"interface" });
function memoryCache(entries = []) {
  const values = new Map(entries.map(row => [resourceCacheKey(row), new Response("cached")]));
  return { values, keys:async () => [...values.keys()].map(url => ({ url })), put:async (key, value) => { values.set(key, value); }, match:async key => values.get(key), delete:async key => values.delete(typeof key === "string" ? key : key.url) };
}
test("only explicit public resources qualify, never account requests or private captures", () => {
  const hash = "a".repeat(64);
  for (const url of [`${origin}/assets/Room-x.js`, `${origin}/audio/dice.wav`, `${origin}/api/media/${hash}.gif`, `https://api.ktga.me/api/ranked/insignia-images/${hash}`]) assert.equal(resourceAllowed(url, origin), true, url);
  for (const url of ["/api/me", "/api/rooms/123", "/api/bugs/captures/123.png", "/api/site-theme.css", "/profil", "/assets/a.js?token=secret", "/audio/../api/me", "https://example.org/assets/a.js", "https://user:secret@www.ktga.me/audio/a.wav"]) assert.equal(resourceAllowed(url, origin), false, url);
});
test("manifests deduplicate and ignore malformed or external URLs", () => {
  const rows = normalizeResources([{ assets:[asset("a"), asset("a"), { ...asset("bad"), url:"https://evil.example/assets/a.js" }, { url:"http://[", revision:"a" }, { ...asset("no"), revision:"<script>" }] }], origin);
  assert.equal(rows.length, 1);
});
test("second startup reuses downloaded files without requests", async () => {
  const assets = [asset("a"), asset("b"), asset("c")], cache = memoryCache();
  let calls = 0;
  const fetcher = async (_url, options) => { calls++; assert.equal(options.credentials,"omit"); assert.equal(options.redirect,"error"); assert.equal(options.cache,"reload"); return new Response("js", { headers:{"content-type":"application/javascript"} }); };
  assert.equal((await prepareResources({ assets, cache, fetcher })).downloaded,3);
  assert.equal((await prepareResources({ assets, cache, fetcher })).cached,3); assert.equal(calls,3);
});
test("updates download, concurrency stays bounded, failed files do not block the rest", async () => {
  const assets = Array.from({length:9},(_,n) => asset(String(n),"v2")), cache = memoryCache([asset("0")]);
  let active = 0, peak = 0;
  const result = await prepareResources({ assets, cache, concurrency:100, fetcher:async url => {
    active++; peak = Math.max(active,peak);
    await new Promise(resolve => setTimeout(resolve,5)); active--;
    return new Response("data",{status:new URL(url).pathname.endsWith("3.js")?404:200});
  }});
  assert.equal(peak,3); assert.equal(result.downloaded,8); assert.equal(result.failed,1); assert.equal(result.completed,9);
});
test("quota exhaustion and cancellation stop safely", async () => {
  const cache = memoryCache(); cache.put = async () => { throw new DOMException("Full","QuotaExceededError"); };
  const result = await prepareResources({assets:[asset("a"),asset("b")],cache,concurrency:1,fetcher:async()=>new Response("data")});
  assert.equal(result.storageFull,true); assert.equal(result.completed,1);
  const controller = new AbortController(); controller.abort();
  assert.equal((await prepareResources({assets:[asset("a")],cache,signal:controller.signal})).completed,0);
});
test("HTML error pages never enter the resource cache", async () => {
  const cache=memoryCache();
  const result=await prepareResources({assets:[asset("a")],cache,fetcher:async()=>new Response("<html>login</html>",{headers:{"content-type":"text/html"}})});
  assert.equal(result.failed,1); assert.equal(cache.values.size,0);
});
test("cache retains the current and preceding resource generations, not every deployment", async () => {
  const cache=memoryCache();
  for(const version of ["v1","v2","v3"]) {
    const row=asset(version,version);await cache.put(resourceCacheKey(row),new Response(version));
    await retainResourceGenerations(cache,[row]);
  }
  assert.equal(Boolean(await cache.match(resourceCacheKey(asset("v1","v1")))),false);
  assert.ok(await cache.match(resourceCacheKey(asset("v2","v2"))));
  assert.ok(await cache.match(resourceCacheKey(asset("v3","v3"))));
});
test("worker serves cached public files but bypasses private requests and explicit refreshes",async()=>{
  const handlers={}; let reads=0, result;
  const context={URL,Response,importScripts:()=>{},self:{location:{origin},registration:{scope:origin+"/"},addEventListener:(name,callback)=>handlers[name]=callback},caches:{open:async()=>({match:async()=>{reads++;return new Response("local resource");}})},fetch:async()=>new Response("network")};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL("../public/resource-cache-policy.js",import.meta.url),"utf8"),context);
  vm.runInContext(fs.readFileSync(new URL("../public/sw.js",import.meta.url),"utf8"),context);
  handlers.fetch({request:{url:origin+"/assets/a.js",method:"GET",mode:"cors"},respondWith:task=>{result=task;}});
  assert.equal(await(await result).text(),"local resource"); assert.equal(reads,1);
  for(const request of [{url:origin+"/api/me",method:"GET",mode:"cors"},{url:origin+"/assets/a.js?ktga_resource_fill=v2",method:"GET",mode:"cors",cache:"reload"}]){
    let intercepted=false;handlers.fetch({request,respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
  }
});
