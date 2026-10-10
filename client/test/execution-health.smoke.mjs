import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "../../server/node_modules/bcryptjs/index.js";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";
import { isolatedEnvironment } from "../../server/scripts/capacity/common.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-capacity-"));
const runId = `capacity-${randomBytes(6).toString("hex")}`, secret = randomBytes(32).toString("hex");
const port = 4106, api = `http://127.0.0.1:${port}`, origin = "http://127.0.0.1:4251";
const environment = isolatedEnvironment(directory, port, runId, secret);
const db = new DatabaseSync(environment.SQLITE_PATH);
db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
const password = "Private-Worker-Test!", passwordHash = bcrypt.hashSync(password, 10);
for (const id of ["admin", "player"]) {
  const user = { id, pseudo:id, email:`${id}@loadtest.invalid`, admin:id === "admin", active:true, guest:false, emailVerifiedAt:new Date().toISOString(),
    passwordHash, passwordPolicyVersion:1, sessionVersion:0, tokens:1000, profile:{birthDate:"1990-01-01"}, createdAt:new Date().toISOString() };
  db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id, JSON.stringify(user), id, user.email);
}
db.prepare("INSERT INTO meta VALUES('admin-settings',?)").run(JSON.stringify({platform:{siteName:runId}}));
db.close();
const tools = path.join(os.tmpdir(), "ktga-chat-browser-tools/node_modules");
const { chromium } = await import(pathToFileURL(path.join(tools,"playwright/index.mjs")));
const { PlaywrightBlocker } = await import(pathToFileURL(path.join(tools,"@ghostery/adblocker-playwright/dist/esm/index.js")));
const previews = path.join(root,"docs/previews/accounts-process-20261010"); fs.mkdirSync(previews,{recursive:true});
const processes = [], errors = [], checks = [];
let browser;
function start(cwd, args, env) {
  const child = spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  child.stdout.on("data",()=>{}); child.stderr.on("data",()=>{}); processes.push(child); return child;
}
async function ready(url, child) {
  for (let i=0;i<150;i++) {
    if (child.exitCode !== null) throw new Error("Private test process exited before becoming ready.");
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve)=>setTimeout(resolve,100));
  }
  throw new Error("Private test process readiness timed out.");
}
try {
  const server = start(path.join(root,"server"),["src/index.js"],environment); await ready(`${api}/api/health`,server);
  const vite = start(path.join(root,"client"),["node_modules/vite/bin/vite.js","--config","test/capacity.vite.config.mjs"],{
    ...process.env,CAPACITY_API_TARGET:api,CAPACITY_SERVER_ORIGIN:api,VITE_API_URL:origin,VITE_SOCKET_URL:origin,VITE_SOCKET_PATH:"/socket.io",VITE_BASE_PATH:"/",VITE_AUDIENCE_READY:"false"
  });
  await ready(origin,vite);
  const token = jwt.sign({id:"admin",sessionVersion:0},secret,{expiresIn:"10m"});
  const headers = {Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  // Real password work feeds the gauges; no production accounts or email are involved.
  for (let i=0;i<4;i++) {
    const response = await fetch(`${api}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({login:"player@loadtest.invalid",password})});
    assert.equal(response.status,200);
  }
  for (const route of ["/api/history?paged=1", "/api/transactions?paged=1", "/api/me/statistics"]) {
    assert.equal((await fetch(`${api}${route}`, { headers })).status, 200);
  }
  await browserReady();
  async function browserReady() {
    browser = await chromium.launch({headless:true,channel:"msedge"});
    const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
    for (const [name,viewport] of [["desktop",{width:1440,height:1000}],["mobile",{width:390,height:844}]]) {
      const context = await browser.newContext({viewport,timezoneId:"Europe/Brussels"});
      await context.addCookies([{name:"ktga_session",value:token,url:origin,httpOnly:true,sameSite:"Lax"}]);
      await context.addInitScript(()=>localStorage.setItem("ktga-privacy-choice",JSON.stringify({version:"2026-09-27",chosenAt:Date.now(),enabled:false})));
      await context.route(/https:\/\/[^/]*(?:google|doubleclick)[^/]*\//,(route)=>route.abort());
      const page = await context.newPage(); page.setDefaultTimeout(30000); page.on("pageerror",(error)=>errors.push(error.message));
      await blocker.enableBlockingInPage(page);
      await page.goto(`${origin}/admin`);
      if (name === "mobile") await page.locator(".admin-mobile-nav select").selectOption("health");
      else await page.getByRole("button",{name:"Supervision",exact:true}).click();
      await page.getByRole("button",{name:"Workers et caches",exact:true}).click();
      await page.getByRole("heading",{name:"Caches applicatifs",exact:true}).waitFor();
      await page.locator(".health-cache-table tbody tr").first().waitFor();
      assert.equal(await page.locator(".health-cache-table").first().locator("tbody tr").count(),4);
      assert.equal(await page.locator(".health-service-table tbody tr").count(),15);
      assert.equal(await page.locator(".health-processes tbody tr").count(),2);
      assert.ok(await page.getByRole("heading",{name:"Processus du casino",exact:true}).isVisible());
      assert.ok(await page.getByRole("heading", { name:"Services applicatifs", exact:true }).isVisible());
      assert.equal(await page.locator(".health-execution .health-kpi").count(),4);
      assert.ok(await page.getByRole("heading",{name:"Mots de passe",exact:true}).isVisible());
      const pause = page.getByRole("button",{name:"Temps réel actif",exact:true}); await pause.click();
      await page.getByRole("button", {name:"30 jours", exact:true}).click();
      await page.getByText("Aucun relevé sur cette période.", {exact:true}).waitFor();
      await page.getByRole("button", {name:"24 h", exact:true}).click();
      await page.locator(".health-service-choice select").selectOption("rooms");
      assert.equal(await page.getByRole("img", {name:"Traitement et attente du service",exact:true}).locator("polyline").count(), 0);
      await page.locator(".health-service-choice select").selectOption("history");
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:path.join(previews,`${name}.png`),fullPage:true});
      let noRecent = false;
      await page.route("**/api/admin/health?**",async (route)=>{
        const response = await route.fetch(), data = await response.json();
        Object.assign(data.workers.password,{status:"warning",queued:120,busy:data.workers.password.capacity,oldestWaitMs:1500,rejected:3,lastIssueAt:new Date().toISOString()});
        data.status = "warning";
        if (noRecent) {
          data.workers.password.wait.p95Ms = null; data.workers.password.processing.p95Ms = null;
          data.history = data.history.map((row)=>({...row,workerWaitP95:null,workerProcessingP95:null}));
        }
        await route.fulfill({response,json:data});
      });
      await page.locator(".server-health-page").getByRole("button",{name:"Actualiser",exact:true}).click();
      await page.getByText("Authentification à surveiller",{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:path.join(previews,`${name}-warning.png`),fullPage:true});
      noRecent = true;
      await page.locator(".server-health-page").getByRole("button",{name:"Actualiser",exact:true}).click();
      await page.locator(".health-execution .health-kpi").nth(2).getByText("\u2014",{exact:true}).waitFor();
      assert.equal(await page.getByRole("img",{name:"Délais d’authentification",exact:true}).locator("polyline").count(),1);
      checks.push({viewport:name,caches:4,processes:2,gauges:4,warningVisible:true,missingDurationsNotZero:true,overflow:false}); await context.close();
    }
  }
  const health = await (await fetch(`${api}/api/admin/health`,{headers})).json();
  assert.equal(health.workers.password.completed,4); assert.ok(health.workers.password.processing.count>0);
  assert.equal(health.workers.reading.started, 1); assert.equal(health.services.history.completed, 1);
  assert.equal(health.services.statistics.mode, "accounts-process");
  assert.notEqual(health.processes.site.pid,health.processes.accounts.pid);
  assert.deepEqual(errors,[]); console.log(JSON.stringify({passed:true,checks,errors,previews}));
} finally {
  await browser?.close();
  for (const child of processes.reverse()) if (child.exitCode === null) { const exited = new Promise((resolve)=>child.once("exit",resolve)); child.kill(); await exited; }
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
  assert.match(path.basename(directory),/^ktga-capacity-[A-Za-z0-9]{6}$/);
  fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
