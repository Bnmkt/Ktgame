import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { argumentsFor, assertTarget } from "../../server/scripts/capacity/common.mjs";

const args=argumentsFor(process.argv.slice(2));
const manifest=JSON.parse(fs.readFileSync(args.manifest,"utf8")),api=assertTarget(args.target || "http://127.0.0.1:4102",manifest),origin="http://127.0.0.1:4251";
const config=await(await fetch(`${api}/api/config`)).json();assert.equal(config.siteName,manifest.runId);assert.equal(config.emailVerificationAvailable,false);
const tools=path.join(os.tmpdir(),"ktga-chat-browser-tools/node_modules");
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(tools,"playwright/index.mjs")));
const {PlaywrightBlocker}=await import(pathToFileURL(process.env.BLOCKER_MODULE || path.join(tools,"@ghostery/adblocker-playwright/dist/esm/index.js")));
const output=path.resolve("../docs/previews/capacity-browser");fs.mkdirSync(output,{recursive:true});
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--config","test/capacity.vite.config.mjs"],{cwd:process.cwd(),windowsHide:true,env:{...process.env,CAPACITY_API_TARGET:api,CAPACITY_SERVER_ORIGIN:`http://127.0.0.1:${manifest.port}`,VITE_API_URL:origin,VITE_SOCKET_URL:origin,VITE_SOCKET_PATH:"/socket.io",VITE_BASE_PATH:"/",VITE_AUDIENCE_READY:"false"},stdio:["ignore","pipe","pipe"]});
let browser,logs="";vite.stdout.on("data",(data)=>logs+=data);vite.stderr.on("data",(data)=>logs+=data);
const errors=[],results=[];
try {
  for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise((r)=>setTimeout(r,100));if(i===99)throw new Error(logs);}
  browser=await chromium.launch({headless:true,channel:"msedge"});
  const blocker=await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for(const [index,viewport] of [{width:1440,height:1000},{width:390,height:844}].entries()) {
    const fixture=manifest.users[manifest.users.length-1-index];
    const response=await fetch(`${api}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({login:fixture.login,password:manifest.password})});
    const session=await response.json();assert.ok(session.token);
    const context=await browser.newContext({viewport});
    await context.addCookies([{name:"ktga_session",value:session.token,url:origin,httpOnly:true,sameSite:"Lax"}]);
    await context.addInitScript(()=>localStorage.setItem("ktga-privacy-choice",JSON.stringify({version:"2026-09-27",chosenAt:Date.now(),enabled:false})));
    await context.route(/https:\/\/[^/]*(?:google|doubleclick)[^/]*\//,(route)=>route.abort());
    const page=await context.newPage();page.on("pageerror",(e)=>errors.push(e.message));await blocker.enableBlockingInPage(page);
    page.setDefaultTimeout(30000);
    let start=performance.now();await page.goto(origin);await page.getByText("Jeux disponibles",{exact:true}).waitFor();
    results.push({viewport,page:"lobby",renderMs:Math.round(performance.now()-start)});
    await page.screenshot({path:path.join(output,`lobby-${index}.png`)});
    const headers={"Content-Type":"application/json",Authorization:`Bearer ${session.token}`};
    const room=await(await fetch(`${api}/api/rooms`,{method:"POST",headers,body:JSON.stringify({gameId:"yahtzee",name:"Capacity browser",stake:1000})})).json();
    await fetch(`${api}/api/rooms/${room.code}/start`,{method:"POST",headers,body:"{}"});
    start=performance.now();await page.goto(`${origin}/table/${room.code}`);
    const roll=page.getByRole("button",{name:/Lancer les dés|Lancer|Relancer/}).first();await roll.waitFor();
    const responsePromise=page.waitForResponse((r)=>r.request().method()==="POST" && r.url().endsWith(`/api/rooms/${room.code}/action`));
    await roll.click();const actionResponse=await responsePromise;const action=await actionResponse.json();
    assert.equal(actionResponse.status(),200,JSON.stringify(action));assert.equal(action.state.dice.length,5);assert.equal(action.state.rollsLeft,2);
    await page.waitForTimeout(1500);assert.equal(await roll.isEnabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    results.push({viewport,page:"yahtzee",renderAndRollMs:Math.round(performance.now()-start)});
    await page.screenshot({path:path.join(output,`yahtzee-${index}.png`)});
    await fetch(`${api}/api/rooms/${room.code}`,{method:"DELETE",headers});await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results,errors}));
  fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({passed:true,results,errors},null,2));
}finally {
  await browser?.close();
  if(vite.exitCode===null){const exited=new Promise((resolve)=>vite.once("exit",resolve));vite.kill();await exited;}
}
