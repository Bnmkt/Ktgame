import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import jwt from "../../server/node_modules/jsonwebtoken/index.js";
import { normalizeProgressionConfig, progressionCurve } from "../../server/src/services/game-progression.js";
import { progressionGuideEntries } from "../../server/src/content/help-ranked.js";

const root=fileURLToPath(new URL("../../",import.meta.url));
const temp=mkdtempSync(path.join(tmpdir(),"ktga-ranked-browser-"));
const tools=path.join(tmpdir(),"ktga-chat-browser-tools/node_modules");
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(tools,"playwright/index.mjs")));
const {PlaywrightBlocker}=await import(pathToFileURL(process.env.BLOCKER_MODULE || path.join(tools,"@ghostery/adblocker-playwright/dist/esm/index.js")));
const previews=path.join(root,process.env.RANKED_SMOKE_FOCUS==="contact" ? "docs/previews/debian-contact-20261007" : process.env.RANKED_SMOKE_FOCUS==="guide" ? "docs/previews/guide-ranked-20261007" : process.env.RANKED_SMOKE_FOCUS==="placements" ? "docs/previews/ranked-placements-20261006" : process.env.RANKED_SMOKE_FOCUS==="profile" ? "docs/previews/player-progression-admin-20261006" : process.env.RANKED_SMOKE_FOCUS==="badges" ? "docs/previews/ranked-badges-20261006" : process.env.RANKED_SMOKE_FOCUS==="queue" ? "docs/previews/ranked-pools-20261006" : process.env.RANKED_SMOKE_FOCUS==="metrics" ? "docs/previews/ranked-metrics-20261005" : "docs/previews/fullscreen-elo-20261005",String(Date.now()));mkdirSync(previews,{recursive:true});
async function port(){const server=createServer();await new Promise((resolve)=>server.listen(0,"127.0.0.1",resolve));const n=server.address().port;await new Promise((resolve)=>server.close(resolve));return n;}
const apiOrigin=`http://127.0.0.1:${await port()}`,origin=`http://127.0.0.1:${await port()}`,base="/ktga";
const secret=randomBytes(32).toString("hex"),token=(id)=>jwt.sign({id,sessionVersion:0},secret,{expiresIn:"1h"});
const db=new DatabaseSync(path.join(temp,"main.sqlite"));
db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
for(const id of ["player","opponent","admin"]){const user={id,pseudo:id,email:`${id}@example.com`,emailVerifiedAt:new Date().toISOString(),active:true,admin:id==="admin",tokens:10000,passwordHash:"unused-preview",profile:{birthDate:"1990-01-01",favoriteGames:["yahtzee"]},createdAt:"2025-01-01T00:00:00Z"};if(process.env.RANKED_SMOKE_FOCUS==="placements" && id==="player")user.gameElo={yahtzee:{elo:1000,games:4,wins:2,placement:{games:4,score:2,opponentElo:4000,wins:2,losses:2,draws:0,completed:false}}};db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id,JSON.stringify(user),id,user.email);}
if(process.env.RANKED_SMOKE_FOCUS==="metrics") {
  for(let index=0;index<40;index++) {
    const id=`metric-${index}`,user={id,pseudo:id,email:`${id}@example.com`,active:true,tokens:1000,gameElo:{yahtzee:{elo:350+index*62,games:30,wins:10},...(index%2===0?{belote:{elo:900+index*17,games:12,wins:7}}:{})}};
    db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id,JSON.stringify(user),id,user.email);
  }
  db.exec("CREATE TABLE history(id TEXT PRIMARY KEY,user_ids TEXT,finished_at TEXT,data TEXT)");
  for(let index=0;index<18;index++) {
    const finishedAt=new Date(Date.now()-index*86400000).toISOString(),gameId=index%3===0?"belote":"yahtzee",ids=gameId==="belote"?["metric-0","metric-1","metric-2","metric-3"]:["metric-0","metric-1"];
    const positions=gameId==="belote"?[1,3,1,3]:[1,2],id=`match-${index}`;
    const row={id,gameId,finishedAt,players:ids.map((id)=>({id,pseudo:id})),winners:ids.filter((_,n)=>positions[n]===1),ranked:{matchId:id,results:ids.map((userId,n)=>({userId,position:positions[n],before:1000,after:positions[n]===1?1016:984,delta:positions[n]===1?16:-16,reason:index===1&&n===1?"abandon":"result"})),participants:ids.map((id)=>({id}))}};
    db.prepare("INSERT INTO history VALUES(?,?,?,?)").run(id,JSON.stringify(ids),finishedAt,JSON.stringify(row));
  }
}
db.close();
const children=[],errors=[],checks=[];let browser,logs="";
function start(args,cwd,env){const child=spawn(process.execPath,args,{cwd,env:{...process.env,...env},windowsHide:true,stdio:["ignore","pipe","pipe"]});child.stdout.on("data",(data)=>logs+=data);child.stderr.on("data",(data)=>logs+=data);children.push(child);}
async function wait(check,label,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await check())return;}catch{}await new Promise((resolve)=>setTimeout(resolve,100));}throw new Error(`Timeout ${label}\n${logs.slice(-2000)}`);}
async function request(id,route,method="GET",body){const response=await fetch(`${apiOrigin}${base}${route}`,{method,headers:{Authorization:`Bearer ${token(id)}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
try {
  start(["src/index.js"],path.join(root,"server"),{NODE_ENV:"test",PORT:new URL(apiOrigin).port,HOST:"127.0.0.1",JWT_SECRET:secret,CLIENT_ORIGIN:origin,CLIENT_DIST:"",APP_BASE_PATH:base,HTTPS_KEY_PATH:"",HTTPS_CERT_PATH:"",HTTPS_PFX_PATH:"",SMTP_HOST:"",SMTP_USER:"",SMTP_PASS:"",EMAIL_FROM:"",SQLITE_PATH:path.join(temp,"main.sqlite"),
    ...Object.fromEntries(["PARENTAL_DB_PATH","TRIBUNAL_DB_PATH","CHAT_DB_PATH","STATUS_DB_PATH","PATCHNOTES_DB_PATH","REQUEST_LOG_PATH","HELP_DB_PATH","DATA_REQUEST_DB_PATH","BUG_REPORT_DB_PATH"].map((key)=>[key,path.join(temp,`${key}.sqlite`)])),BUG_REPORT_UPLOAD_DIR:path.join(temp,"bug-images"),PATCHNOTES_UPLOAD_DIR:path.join(temp,"note-images")});
  start(["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port",new URL(origin).port,"--strictPort"],path.join(root,"client"),{VITE_API_URL:`${apiOrigin}${base}`,VITE_SOCKET_URL:apiOrigin,VITE_SOCKET_PATH:`${base}/socket.io`,VITE_BASE_PATH:`${base}/`});
  await wait(async()=> (await fetch(`${apiOrigin}${base}/api/health`)).ok && (await fetch(`${origin}${base}/`)).ok,"servers");
  browser=await chromium.launch({headless:true,channel:"msedge"});
  const blocker=await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  async function pageFor(id,viewport={width:1440,height:1000}){const context=await browser.newContext({viewport,timezoneId:"Europe/Brussels"});context.setDefaultNavigationTimeout(90000);context.setDefaultTimeout(45000);await context.addCookies([{name:"ktga_session",value:token(id),url:apiOrigin,httpOnly:true,sameSite:"Lax"}]);await context.addInitScript(()=>localStorage.setItem("ktga-privacy-choice",JSON.stringify({version:"2026-09-27",chosenAt:Date.now(),enabled:false})));const page=await context.newPage();page.on("pageerror",(error)=>errors.push(error.message));await blocker.enableBlockingInPage(page);return page;}
  async function capture(page,name,selector){const element=page.locator(selector);await element.waitFor();await page.waitForTimeout(300);assert.ok(await element.isVisible());const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);checks.push({name,overflow});assert.equal(overflow,false,name);await page.screenshot({path:path.join(previews,`${name}.png`)});}
  const player=await pageFor("player"),opponent=await pageFor("opponent"),admin=await pageFor("admin");
  if(process.env.RANKED_SMOKE_FOCUS!=="placements") {
    const settings=(await request('admin','/api/admin/ranked')).settings;settings.placementGames=0;
    for(const game of Object.values(settings.games))game.placementGames=0;
    await request('admin','/api/admin/ranked','PUT',settings);
  }
  if(process.env.RANKED_SMOKE_FOCUS==="contact") {
    await admin.goto(`${origin}${base}/admin`);
    await admin.getByRole("button",{name:"Paramètres",exact:true}).click();
    const field=admin.getByRole("textbox",{name:/Email de contact/});
    await field.fill("support@example.com");
    await admin.getByRole("button",{name:"Enregistrer",exact:true}).click();
    await wait(async()=>(await request("player","/api/config")).contactEmail==="support@example.com","contact saved through UI");
    await capture(admin,"desktop-contact-settings",".casino-settings");
    await admin.setViewportSize({width:390,height:844});await capture(admin,"mobile-contact-settings",".casino-settings");
    await player.goto(`${origin}${base}/mentions-legales`);
    await player.locator(".legal-contact").waitFor();
    assert.equal(await player.locator(".legal-contact").getAttribute("href"),"mailto:support@example.com");
    await capture(player,"desktop-contact-legal",".legal-layout");
    await player.setViewportSize({width:390,height:844});await capture(player,"mobile-contact-legal",".legal-layout");
  } else if(process.env.RANKED_SMOKE_FOCUS==="guide") {
    const curve=progressionCurve(normalizeProgressionConfig({},["yahtzee"])),level=curve.find((row)=>row.level===10);
    const assets=path.join(root,"client/public/guides");
    async function illustration(element,name) {
      await element.waitFor();await player.waitForTimeout(200);
      assert.ok(!/\belo\b/i.test(await element.innerText()));
      await element.screenshot({path:path.join(assets,name)});
      copyFileSync(path.join(assets,name),path.join(previews,name));
    }
    let xp=level.totalXp+Math.floor(level.nextXp/2);
    await request("admin","/api/admin/users/player","PATCH",{gameXp:{yahtzee:xp},progressionExpected:{gameXp:{yahtzee:0}}});
    await player.goto(`${origin}${base}/profil`);
    await player.locator(".xp-game-list").getByText("Niveau 10",{exact:true}).waitFor();
    await illustration(player.locator(".xp-game-list article"),"game-levels.png");
    const nextXp=curve.at(-1).totalXp*10+level.totalXp*5+Math.floor(level.nextXp*5/2);
    await request("admin","/api/admin/users/player","PATCH",{gameXp:{yahtzee:nextXp},progressionExpected:{gameXp:{yahtzee:xp}}});
    await player.reload();await player.getByText("Niveau 10 · Maîtrise IV",{exact:true}).waitFor();
    await illustration(player.locator(".xp-game-list article"),"game-masteries.png");
    const settings=(await request("admin","/api/admin/ranked")).settings;
    Object.assign(settings.games.yahtzee,{players:2,maximumPlayers:2,readyWaitSeconds:60,readyTimeoutSeconds:120});
    await request("admin","/api/admin/ranked","PUT",settings);
    await request("player","/api/ranked/queue","POST",{gameId:"yahtzee"});
    await request("opponent","/api/ranked/queue","POST",{gameId:"yahtzee"});
    const proposal=(await request("player","/api/ranked")).proposal;
    await request("opponent","/api/ranked/ready","POST",{proposalId:proposal.id});
    await player.goto(`${origin}${base}/`);
    await player.getByText("Accepter et rejoindre",{exact:true}).waitFor();
    await illustration(player.locator(".ranked-ready-dialog"),"ranked-confirmation.png");
    await request("player","/api/ranked/queue","DELETE");
    await request("opponent","/api/ranked/queue","DELETE");
    const help = await request("player","/api/help");
    assert.equal(help.entries.filter((entry)=>entry.kind==="faq" && entry.category==="Mode classé").length,17);
    await player.goto(`${origin}${base}/faq`);
    await player.getByRole("combobox",{name:/Rubrique/}).selectOption("Mode classé");
    const questions=player.locator(".player-help-question");
    await wait(async()=>await questions.count()===17,"ranked questions");
    await questions.filter({hasText:"Pourquoi suis-je indiqué"}).locator("summary").click();
    assert.ok(!/\belo\b/i.test(await player.locator(".player-help-questions").innerText()));
    await capture(player,"desktop-ranked-faq",".player-help-surface");
    await player.setViewportSize({width:390,height:844});await capture(player,"mobile-ranked-faq",".player-help-surface");
    await player.goto(`${origin}${base}/guide`);
    for(const entry of progressionGuideEntries) {
      const chapter=player.locator(`#help-${entry.id}`);
      await chapter.waitFor();
      await chapter.scrollIntoViewIfNeeded();
      await wait(()=>chapter.locator("img").evaluate((image)=>image.complete && image.naturalWidth>0),entry.image);
      await chapter.getByRole("radio").nth(Number(entry.challenge.answerId)-1).check();
      await chapter.getByRole("status").getByText("Bien vu !",{exact:true}).waitFor();
      assert.ok(!/\belo\b/i.test(await chapter.innerText()));
      await capture(player,`mobile-${entry.id}`,`#help-${entry.id}`);
      await chapter.screenshot({path:path.join(previews,`mobile-${entry.id}.png`)});
      await player.setViewportSize({width:1440,height:1000});
      await capture(player,`desktop-${entry.id}`,`#help-${entry.id}`);
      await chapter.screenshot({path:path.join(previews,`desktop-${entry.id}.png`)});
      await chapter.getByRole("button",{name:"Réessayer la question",exact:true}).click();
      const wrong=entry.challenge.answerId==="1"?1:0;
      await chapter.getByRole("radio").nth(wrong).check();
      await chapter.getByRole("status").getByText("Pas dans ce cas.",{exact:true}).waitFor();
      await player.setViewportSize({width:390,height:844});
    }
  } else if(process.env.RANKED_SMOKE_FOCUS==="placements") {
    const initial=(await request("player","/api/ranked")).games.find((row)=>row.id==="yahtzee");
    assert.equal(initial.elo,undefined);assert.equal(initial.rank.id,"unranked");assert.equal(initial.placement.games,4);
    assert.equal((await request("player","/api/ranked/leaderboard/yahtzee")).rows.length,0);
    await player.goto(`${origin}${base}/profil`);
    const entry=player.locator(".ranked-profile-entry").filter({hasText:"Yahtzee"});
    await entry.getByText("4 / 5 placements",{exact:true}).waitFor();assert.ok(!(await entry.textContent()).includes("Elo"));
    await entry.scrollIntoViewIfNeeded();await capture(player,"desktop-unranked-profile",".ranked-profile:has(.ranked-profile-entry)");
    await player.setViewportSize({width:390,height:844});await capture(player,"mobile-unranked-profile",".ranked-profile:has(.ranked-profile-entry)");
    await request("player","/api/ranked/queue","POST",{gameId:"yahtzee"});
    await player.goto(`${origin}${base}/`);await player.locator(".ranked-ready-dialog").waitFor();
    assert.equal((await request("player","/api/ranked")).queue.elo,undefined);
    await player.getByText("4 / 5 placements",{exact:true}).waitFor();await capture(player,"mobile-unranked-queue",".ranked-ready-dialog");
    await player.setViewportSize({width:1440,height:1000});await capture(player,"desktop-unranked-queue",".ranked-ready-dialog");
    await request("opponent","/api/ranked/queue","POST",{gameId:"yahtzee"});
    let proposal;await wait(async()=>{proposal=(await request("player","/api/ranked")).proposal;return Boolean(proposal);},"placement proposal");
    assert.ok(proposal.players.every((row)=>row.rank.id==="unranked"));
    for(const id of ["player","opponent"])await request(id,"/api/ranked/ready","POST",{proposalId:proposal.id});
    await player.waitForURL(/\/table\//,{timeout:45000});
    const match=(await request("player","/api/ranked")).match;assert.ok(match);
    await request("opponent",`/api/rooms/${match.code}/leave`,"POST",{});
    await player.getByText("Placement terminé",{exact:true}).waitFor();
    await player.waitForTimeout(6000);
    await player.locator(".ranked-result").evaluate((element)=>element.scrollIntoView({block:"center"}));await capture(player,"desktop-final-placement",".ranked-result");
    await player.setViewportSize({width:390,height:844});
    await player.locator(".ranked-result").evaluate((element)=>element.scrollIntoView({block:"center"}));
    assert.ok(await player.locator(".ranked-result").evaluate((element)=>{const box=element.getBoundingClientRect();return box.top>=0 && box.bottom<=innerHeight;}));
    await capture(player,"mobile-final-placement",".ranked-result");
    const finished=(await request("player","/api/ranked")).games.find((row)=>row.id==="yahtzee");
    assert.equal(finished.placement.completed,true);assert.equal(finished.elo,1058.45);assert.equal(finished.rank.label,"Argent III");
    const first=(await request("opponent","/api/ranked/history")).rows[0];
    assert.equal(first.placement.games,1);assert.equal(first.placement.losses,1);assert.equal(first.before,undefined);assert.equal(first.after,undefined);assert.equal(first.delta,undefined);
    const privateRoom=await request("opponent",`/api/rooms/${match.code}`);
    assert.equal(privateRoom.ranked.results.find((row)=>row.userId==="player").after,undefined);
    assert.equal((await request("player","/api/ranked/leaderboard/yahtzee")).rows.length,1);
    assert.equal((await request("admin","/api/admin/ranked/metrics")).population.profiles,1);
    await player.goto(`${origin}${base}/profil`);await entry.getByText("1058.45 Elo · privé",{exact:true}).waitFor();
    await entry.scrollIntoViewIfNeeded();await capture(player,"mobile-placed-profile",".ranked-profile:has(.ranked-profile-entry)");
  } else if(process.env.RANKED_SMOKE_FOCUS==="divisions") {
    await admin.goto(`${origin}${base}/admin`);await admin.getByRole('button',{name:'Mode classé',exact:true}).click();
    await admin.getByRole('button',{name:'Rangs et divisions',exact:true}).click();
    assert.deepEqual(await admin.locator('.ranked-division-insignias').first().locator('button').allTextContents(),['I','II','III']);
    await capture(admin,'desktop-ascending-divisions','.ranked-tier-settings');
    await admin.setViewportSize({width:390,height:844});await capture(admin,'mobile-ascending-divisions','.ranked-tier-settings');
    await request('player','/api/me','PATCH',{rankedBadgeGameId:'yahtzee'});
    let previous=1000;
    for(const [elo,division] of [[850,'I'],[950,'II'],[1050,'III']]) {
      await request('admin','/api/admin/users/player','PATCH',{gameElo:{yahtzee:elo},progressionExpected:{gameElo:{yahtzee:previous}}});previous=elo;
      await player.goto(`${origin}${base}/profil`);
      const entry=player.locator('.ranked-profile-entry').filter({hasText:'Yahtzee'});
      await entry.getByText(`Argent ${division}`,{exact:true}).waitFor();
      assert.equal((await request('player','/api/me')).rankedBadge.rank.division,division);
    }
    await player.locator('.xp-workspace').scrollIntoViewIfNeeded();await capture(player,'desktop-division-three-profile','.xp-workspace');
    await player.setViewportSize({width:390,height:844});await capture(player,'mobile-division-three-profile','.xp-workspace');
  } else if(process.env.RANKED_SMOKE_FOCUS==="profile") {
    await admin.goto(`${origin}${base}/admin`);await admin.getByRole('button',{name:/^Comptes joueurs/}).first().click();
    await admin.locator('tr').filter({hasText:'player@example.com'}).getByRole('button',{name:'Modifier',exact:true}).click();
    await admin.getByRole('button',{name:'Profil et accès',exact:true}).click();
    await admin.getByRole('button',{name:'Progression et classé',exact:true}).click();
    await admin.getByLabel('Jeu de la progression',{exact:true}).selectOption('yahtzee');
    await admin.getByLabel('XP totale du jeu',{exact:true}).fill('12345');
    await admin.getByLabel('Elo du jeu',{exact:true}).fill('1520.25');
    await capture(admin,'desktop-elo-xp-edit','.account-admin-content');
    await admin.getByRole('button',{name:'Enregistrer la fiche',exact:true}).click();
    await wait(async()=>await admin.getByRole('button',{name:'Enregistrer la fiche',exact:true}).isDisabled(),'profile saved');
    let detail=(await request('admin','/api/admin/users/player'));
    assert.equal(detail.user.gameXp.yahtzee,12345);assert.equal(detail.user.gameElo.yahtzee,1520.25);
    assert.ok(detail.progression.find((row)=>row.gameId==='yahtzee').level>1);
    await admin.getByRole('button',{name:'Progression et classé',exact:true}).click();
    await admin.getByLabel('Jeu de la progression',{exact:true}).selectOption('yahtzee');
    await admin.getByText('Platine II',{exact:true}).waitFor();
    await capture(admin,'desktop-updated-rank','.account-admin-content');
    await admin.setViewportSize({width:390,height:844});
    await admin.getByLabel('Section du compte',{exact:true}).selectOption('progression');
    await admin.getByLabel('Jeu de la progression',{exact:true}).scrollIntoViewIfNeeded();
    await capture(admin,'mobile-elo-xp-edit','.account-admin-content');
    await admin.getByLabel('Jeu de la progression',{exact:true}).selectOption('blackjack');
    assert.equal(await admin.getByLabel('Elo du jeu',{exact:true}).count(),0);
    await admin.getByLabel('XP totale du jeu',{exact:true}).fill('300');
    await admin.getByRole('button',{name:'Enregistrer la fiche',exact:true}).click();
    await wait(async()=>await admin.getByRole('button',{name:'Enregistrer la fiche',exact:true}).isDisabled(),'non-ranked XP saved');
    detail=await request('admin','/api/admin/users/player');
    assert.equal(detail.user.gameXp.blackjack,300);assert.equal(detail.user.gameXp.yahtzee,12345);
    assert.equal(detail.user.gameElo.yahtzee,1520.25);
    await capture(admin,'mobile-unranked-xp','.account-admin-content');
  } else if(process.env.RANKED_SMOKE_FOCUS==="badges") {
    await admin.goto(`${origin}${base}/admin`);await admin.getByRole('button',{name:'Mode classé',exact:true}).click();
    await admin.getByRole('button',{name:'Rangs et divisions',exact:true}).click();
    await admin.getByRole('button',{name:'Choisir l’insigne Argent',exact:true}).click();
    const png=await admin.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
      const context=canvas.getContext('2d');context.fillStyle='#278778';context.fillRect(0,0,512,512);
      context.fillStyle='#e6bd56';context.fillRect(156,156,200,200);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await admin.getByLabel('Image de l’insigne',{exact:true}).setInputFiles({name:'rank.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await admin.getByRole('group',{name:'Zone de recadrage',exact:true}).waitFor();
    await admin.getByRole('button',{name:'Appliquer',exact:true}).click();await admin.locator('.ranked-insignia-dialog').waitFor({state:'hidden'});
    await admin.getByRole('button',{name:'Choisir l’insigne Argent I',exact:true}).click();
    await admin.getByRole('button',{name:'Recadrer',exact:true}).click();
    const stage=admin.getByRole('group',{name:'Zone de recadrage',exact:true});await stage.waitFor();
    assert.equal(await stage.locator('.ranked-crop-reference img').count(),2);
    await admin.getByLabel('Argent II',{exact:true}).uncheck();assert.equal(await stage.locator('.ranked-crop-reference').count(),1);
    await admin.getByLabel('Argent II',{exact:true}).check();
    await admin.getByLabel('Zoom du recadrage',{exact:true}).fill('0.75');
    const before=await stage.locator('img').first().getAttribute('style'),box=await stage.boundingBox();
    await admin.mouse.move(box.x+box.width-10,box.y+box.height/2);await admin.mouse.down();
    await admin.mouse.move(box.x+box.width+30,box.y+box.height/2,{steps:5});await admin.mouse.up();
    assert.notEqual(await stage.locator('img').first().getAttribute('style'),before);
    await capture(admin,'desktop-division-alignment','.ranked-insignia-dialog');
    await admin.setViewportSize({width:390,height:844});await capture(admin,'mobile-division-alignment','.ranked-insignia-dialog');
    await admin.getByRole('button',{name:'Appliquer',exact:true}).click();await admin.locator('.ranked-insignia-dialog').waitFor({state:'hidden'});
    await admin.getByRole('button',{name:'Enregistrer',exact:true}).click();
    let imageId;await wait(async()=>{imageId=(await request('admin','/api/admin/ranked')).settings.ranks.find((rank)=>rank.id==='silver').divisionInsignia?.I?.insigniaImage;return Boolean(imageId);},'aligned division persisted');
    const storedImage=await fetch(`${apiOrigin}${base}/api/ranked/insignia-images/${imageId}`);assert.equal(storedImage.status,200);
    const pixels=await admin.evaluate(async(png)=>{
      const image=new Image();image.src=`data:image/png;base64,${png}`;await image.decode();const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
      const context=canvas.getContext('2d');context.drawImage(image,0,0);return [context.getImageData(0,0,1,1).data[3],context.getImageData(256,256,1,1).data[3]];
    },Buffer.from(await storedImage.arrayBuffer()).toString('base64'));
    assert.deepEqual(pixels,[0,255]);
    await admin.getByRole('button',{name:'Choisir l’insigne Argent I',exact:true}).click();await admin.getByRole('button',{name:'Recadrer',exact:true}).click();await stage.waitFor();
    const beforeNudge=await stage.locator('img').first().getAttribute('style');await stage.focus();await stage.press('ArrowRight');
    assert.notEqual(await stage.locator('img').first().getAttribute('style'),beforeNudge);
    await admin.getByRole('button',{name:'Annuler',exact:true}).click();
    await request("player","/api/me","PATCH",{rankedBadgeGameId:"yahtzee"});
    async function checkBadges() {
      await player.locator('.player-rank-emblem img').first().waitFor();
      assert.ok(await player.locator('.display-name:has(.player-rank-emblem)').evaluateAll((names)=>names.length>0 && names.every((name)=>{
        const rank=name.querySelector('.player-rank-emblem').getBoundingClientRect();
        const cosmetic=name.querySelector('.cosmetic-icon').getBoundingClientRect();
        const text=name.querySelector('.display-name-text').getBoundingClientRect();
        return rank.width===36 && rank.height===36 && rank.width>=cosmetic.width && rank.height>=cosmetic.height && rank.right<=cosmetic.left && cosmetic.right<=text.left;
      })));
    }
    await player.goto(`${origin}${base}/profil`);
    for(const [name,viewport] of [["desktop",{width:1440,height:1000}],["mobile",{width:390,height:844}]]) {
      await player.setViewportSize(viewport);await checkBadges();
      await capture(player,`${name}-profile-badges`,'.player-rank-emblem >> nth=0');
      await player.getByRole("button",{name:"Profil public",exact:true}).click();
      await player.locator('.public-profile-modal .player-rank-emblem').waitFor();await checkBadges();
      assert.ok(await player.locator('.public-profile-modal .ranked-profile-insignia').evaluateAll((icons)=>icons.length>0 && icons.every((icon)=>icon.getBoundingClientRect().width===56)));
      await capture(player,`${name}-public-badges`,'.public-profile-modal');
      await player.getByRole('button',{name:'Fermer le profil',exact:true}).click();await player.locator('.public-profile-modal').waitFor({state:'hidden'});
    }
    const room=await request("player","/api/rooms","POST",{gameId:"yahtzee",name:"Badge sizing",stake:10});
    await player.goto(`${origin}${base}/table/${room.code}`);
    for(const [name,viewport] of [["desktop",{width:1440,height:1000}],["mobile",{width:390,height:844}]]) {
      await player.setViewportSize(viewport);await checkBadges();
      await capture(player,`${name}-waiting-badges`,'.player-rank-emblem >> nth=0');
    }
    await request("player",`/api/rooms/${room.code}`,"DELETE",{});
  } else if(process.env.RANKED_SMOKE_FOCUS==="queue") {
    const settings=(await request("admin","/api/admin/ranked")).settings;
    Object.assign(settings.games.yahtzee,{players:2,maximumPlayers:3,fillWaitSeconds:5});
    await request("admin","/api/admin/ranked","PUT",settings);
    await admin.goto(`${origin}${base}/admin`);await admin.getByRole('button',{name:'Mode classé',exact:true}).click();
    await admin.getByRole('button',{name:'Matchmaking',exact:true}).click();
    await admin.getByLabel('Configuration classée').selectOption('yahtzee');
    assert.equal(await admin.getByLabel('Délai pour remplir la table (s, 0 = immédiat)').inputValue(),'5');
    await capture(admin,'desktop-pool-settings','.ranked-admin');
    await admin.setViewportSize({width:390,height:844});await capture(admin,'mobile-pool-settings','.ranked-admin');
    await request('player','/api/ranked/queue','POST',{gameId:'yahtzee'});
    await player.goto(`${origin}${base}/`);await player.locator('.ranked-ready-dialog').waitFor();
    await request('opponent','/api/ranked/queue','POST',{gameId:'yahtzee'});
    await wait(async()=>await player.getByText(/Complétion du groupe/).count()===1,'fill pool');
    assert.equal((await request('player','/api/ranked')).proposal,null);
    assert.equal(await player.locator('.ranked-search-seats svg').count(),3);
    await capture(player,'desktop-entry-pool','.ranked-ready-dialog');
    await player.setViewportSize({width:390,height:844});await capture(player,'mobile-entry-pool','.ranked-ready-dialog');
    await player.locator('.ranked-ready-seats').waitFor();
    const offered=await request('player','/api/ranked');assert.equal(offered.proposal.players.length,2);assert.equal(offered.match,null);
    await request('player','/api/ranked/ready','POST',{proposalId:offered.proposal.id});
    await request('opponent','/api/ranked/ready','POST',{proposalId:offered.proposal.id});
    await wait(async()=>await player.locator('.ranked-ready-seats .is-ready').count()===2,'confirmed group');
    await player.route('**/api/ranked',async(route)=>{
      const response=await route.fetch(),body=await response.json();
      if(body.proposal)body.proposal.startsAfter=body.serverTime-1000;
      await route.fulfill({response,json:body});
    });
    await player.evaluate(()=>window.dispatchEvent(new Event('ktga-ranked-updated')));
    await player.getByRole('status').filter({hasText:'Création de la table…'}).waitFor();
    assert.equal(await player.locator('.ranked-ready-dialog .ranked-large-clock').count(),0);
    assert.equal(await player.getByText(/Confirmation avant/).count(),0);
    await capture(player,'mobile-table-creation','.ranked-ready-dialog');
    await player.setViewportSize({width:1440,height:1000});await capture(player,'desktop-table-creation','.ranked-ready-dialog');
    await player.unroute('**/api/ranked');
    for(const id of ['player','opponent'])await request(id,'/api/ranked/queue','DELETE');
  } else if(process.env.RANKED_SMOKE_FOCUS==="metrics") {
    await admin.goto(`${origin}${base}/admin`);await admin.getByRole("button",{name:"Mode classé",exact:true}).click();
    await admin.getByRole("button",{name:"Métriques",exact:true}).click();
    await admin.getByRole("heading",{name:"Classement actuel",exact:true}).waitFor();
    const metrics=await request("admin","/api/admin/ranked/metrics");
    assert.equal(metrics.population.profiles,60);assert.equal(metrics.population.players,40);assert.equal(metrics.summary.matches,18);
    assert.equal(await admin.locator('.ranked-metrics-bin').count(),metrics.ranks.length+metrics.divisions.length);
    await capture(admin,"desktop-overview",'.ranked-metrics-workspace');
    await admin.locator('.ranked-metrics-columns').evaluate((el)=>el.scrollIntoView({block:'start'}));await capture(admin,"desktop-distributions",'.ranked-metrics-columns');
    await admin.locator('.ranked-metrics-bin button').filter({hasText:/^Argent$/}).click();
    assert.equal(await admin.getByLabel('Rang des divisions').inputValue(),'silver');assert.equal(await admin.locator('.ranked-metrics-columns section').nth(1).locator('.ranked-metrics-bin').count(),3);
    await admin.getByLabel('Jeu',{exact:true}).selectOption('yahtzee');
    await wait(async()=>await admin.locator('.ranked-metrics-table').first().locator('tbody tr').count()===1,'game filter');
    await admin.getByLabel('Période',{exact:true}).selectOption('7');
    await wait(async()=>!await admin.locator('.ranked-metrics-workspace').getAttribute('aria-busy').then((value)=>value==='true'),'period filter');
    await admin.getByRole('button',{name:'Résultats',exact:true}).click();
    await admin.getByRole('img',{name:'Résultats classés au fil du temps'}).scrollIntoViewIfNeeded();await capture(admin,'desktop-results','.ranked-metrics-activity');
    assert.equal(await admin.getByRole('img',{name:'Résultats classés au fil du temps'}).locator('circle').count(),21);
    await admin.setViewportSize({width:390,height:844});await admin.getByRole('heading',{name:'Métriques du classé',exact:true}).scrollIntoViewIfNeeded();await capture(admin,'mobile-overview','.ranked-metrics-workspace');
    await admin.getByRole('heading',{name:'Répartition des divisions',exact:true}).scrollIntoViewIfNeeded();await capture(admin,'mobile-divisions','.ranked-metrics-columns');
    await admin.locator('.ranked-metrics-activity').evaluate((el)=>el.scrollIntoView({block:'start'}));await capture(admin,'mobile-activity','.ranked-metrics-activity');
    assert.ok(await admin.locator('.ranked-metrics-activity svg').evaluate((el)=>Math.abs(el.viewBox.baseVal.width-el.getBoundingClientRect().width)<2));
    await admin.getByRole('heading',{name:'Détail par jeu',exact:true}).scrollIntoViewIfNeeded();await capture(admin,'mobile-game-table','.ranked-metrics-table >> nth=0');
    const scrolling=admin.locator('.metrics-table-scroll').first();assert.ok(await scrolling.evaluate((el)=>el.scrollWidth>el.clientWidth));
    await scrolling.evaluate((el)=>el.scrollLeft=el.scrollWidth);await capture(admin,'mobile-game-table-scrolled','.ranked-metrics-table >> nth=0');
    await admin.getByLabel('Période',{exact:true}).selectOption('season');await admin.getByRole('heading',{name:'Classement actuel',exact:true}).waitFor();
    await admin.getByRole('button',{name:'Actualiser les métriques',exact:true}).click();await admin.getByRole('heading',{name:'Classement actuel',exact:true}).waitFor();
    await admin.getByRole('button',{name:'Elo et sanctions',exact:true}).click();await admin.getByRole('heading',{name:'Formule de calcul',exact:true}).waitFor();
  } else {
  if (process.env.RANKED_SMOKE_FOCUS!=="poker") {
  await admin.goto(`${origin}${base}/admin`);await admin.getByRole("button",{name:"Mode classé",exact:true}).click();
  await admin.getByRole("heading",{name:"Formule de calcul",exact:true}).waitFor();
  await admin.getByRole('status').filter({hasText:'Total des variations : 0.00 Elo'}).waitFor();
  await capture(admin,"desktop-elo-formula",".ranked-elo-workspace");
  await admin.getByLabel("Diviseur D",{exact:true}).fill("800");
  await wait(async()=>await admin.locator('.ranked-elo-simulator tbody tr').first().locator('td').nth(4).innerText()==='+20.48',"server Elo simulation");
  await admin.getByLabel("Diviseur D",{exact:true}).fill("400");
  await admin.setViewportSize({width:390,height:844});await capture(admin,"mobile-elo-formula",".ranked-elo-workspace");await admin.setViewportSize({width:1440,height:1000});
  await admin.getByRole("button",{name:"Rangs et divisions",exact:true}).click();
  await admin.getByRole("button",{name:"Ajouter un rang après Platine",exact:true}).click();
  await admin.getByLabel("Nom du rang 7",{exact:true}).fill("Émeraude");
  assert.equal(await admin.getByLabel("Seuil du rang 7",{exact:true}).inputValue(),"1550");
  await admin.getByRole("button",{name:"Retirer Émeraude",exact:true}).click();await admin.getByRole("button",{name:"Retirer le rang",exact:true}).click();
  await admin.getByRole("button",{name:"Choisir l’insigne Argent",exact:true}).click();
  await admin.getByRole("button",{name:"Icône",exact:true}).click();
  await admin.getByLabel("Rechercher une icône",{exact:true}).fill("crown");
  await admin.getByRole("button",{name:"Choisir l’icône crown",exact:true}).click();
  await capture(admin,"desktop-insignia-picker",".ranked-insignia-dialog");
  await admin.setViewportSize({width:390,height:844});await capture(admin,"mobile-insignia-picker",".ranked-insignia-dialog");
  await admin.getByRole("button",{name:"Appliquer",exact:true}).click();
  assert.equal(await admin.locator('.ranked-tier-insignia svg.lucide-crown').count(),1);
  await admin.getByRole("button",{name:"Enregistrer",exact:true}).click();
  await wait(async()=> (await request("admin","/api/admin/ranked")).settings.ranks.find((rank)=>rank.id==="silver").insignia==="crown","insignia persisted");
  await admin.setViewportSize({width:1440,height:1000});
  await admin.getByRole("button",{name:"Choisir l’insigne Argent",exact:true}).click();
  await admin.getByLabel("Image de l’insigne",{exact:true}).setInputFiles({name:"invalid.svg",mimeType:"image/svg+xml",buffer:Buffer.from('<svg onload="alert(1)"/>')});
  await admin.getByRole("alert").filter({hasText:"PNG, JPEG ou WebP"}).waitFor();
  const imageData=await admin.evaluate(()=>{
    const canvas=document.createElement("canvas");canvas.width=800;canvas.height=400;
    const context=canvas.getContext("2d");context.fillStyle="#288678";context.beginPath();context.arc(400,200,120,0,Math.PI*2);context.fill();
    context.strokeStyle="#f1c75f";context.lineWidth=12;context.stroke();context.fillStyle="#fff8e8";context.font="bold 110px sans-serif";context.textAlign="center";context.textBaseline="middle";context.fillText("K",400,208);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const imageBuffer=Buffer.from(imageData,"base64");
  assert.equal((await fetch(`${apiOrigin}${base}/api/admin/ranked/insignia-images`,{method:"POST",headers:{Authorization:`Bearer ${token("player")}`,"Content-Type":"image/png"},body:imageBuffer})).status,403);
  await admin.getByLabel("Image de l’insigne",{exact:true}).setInputFiles({name:"insignia.png",mimeType:"image/png",buffer:imageBuffer});
  const stage=admin.getByRole("group",{name:"Zone de recadrage",exact:true});await stage.waitFor();
  const slider=admin.getByRole("slider",{name:"Zoom du recadrage",exact:true});
  for(let i=0;i<20;i++)await slider.press("ArrowRight");assert.equal(await slider.inputValue(),"2");
  const beforeCrop=await stage.locator("img").getAttribute("style");await stage.focus();await stage.press("ArrowRight");
  assert.notEqual(await stage.locator("img").getAttribute("style"),beforeCrop);
  const box=await stage.boundingBox();await admin.mouse.move(box.x+box.width/2,box.y+box.height/2);await admin.mouse.down();await admin.mouse.move(box.x+box.width/2+30,box.y+box.height/2+10,{steps:5});await admin.mouse.up();
  await capture(admin,"desktop-image-crop",".ranked-insignia-dialog");
  await admin.setViewportSize({width:390,height:844});await capture(admin,"mobile-image-crop",".ranked-insignia-dialog");
  const expectedPixels=await stage.evaluate((element)=>{
    const image=element.querySelector("img"),side=image.naturalWidth/(parseFloat(image.style.width)/100);
    const left=(50-parseFloat(image.style.left))/100*side-side/2,top=(50-parseFloat(image.style.top))/100*side-side/2;
    const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;const context=canvas.getContext("2d");context.imageSmoothingQuality="high";context.drawImage(image,left,top,side,side,0,0,512,512);
    return [[0,0],[256,256],[511,511]].map(([x,y])=>[...context.getImageData(x,y,1,1).data]);
  });
  await admin.getByRole("button",{name:"Appliquer",exact:true}).click();await admin.locator('.ranked-tier-insignia img').waitFor();
  await admin.getByRole("button",{name:"Enregistrer",exact:true}).click();
  let imageId;await wait(async()=>{imageId=(await request("admin","/api/admin/ranked")).settings.ranks.find((rank)=>rank.id==="silver").insigniaImage;return Boolean(imageId);},"image persisted");
  const imageResponse=await fetch(`${apiOrigin}${base}/api/ranked/insignia-images/${imageId}`);assert.equal(imageResponse.status,200);assert.equal(imageResponse.headers.get("content-type"),"image/png");
  const stored=Buffer.from(await imageResponse.arrayBuffer());assert.equal(stored.readUInt32BE(16),512);assert.equal(stored.readUInt32BE(20),512);
  const pixels=await admin.evaluate(async(source)=>{
    const image=new Image();image.src=`data:image/png;base64,${source}`;await image.decode();const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;const context=canvas.getContext("2d");context.drawImage(image,0,0);
    return [[0,0],[256,256],[511,511]].map(([x,y])=>[...context.getImageData(x,y,1,1).data]);
  },stored.toString("base64"));assert.deepEqual(pixels,expectedPixels);assert.ok(pixels.some((pixel)=>pixel[3]===0));assert.ok(pixels.some((pixel)=>pixel[3]>0));
  await admin.getByRole("button",{name:"Choisir l’insigne Argent",exact:true}).click();await admin.getByRole("button",{name:"Recadrer",exact:true}).click();await stage.waitFor();
  await admin.getByRole("button",{name:"Annuler",exact:true}).click();assert.equal((await request("admin","/api/admin/ranked")).settings.ranks.find((rank)=>rank.id==="silver").insigniaImage,imageId);
  await admin.setViewportSize({width:1440,height:1000});
  await admin.getByRole("button",{name:"Choisir l’insigne Argent III",exact:true}).click();
  await admin.getByLabel("Image de l’insigne",{exact:true}).setInputFiles({name:"division-three.png",mimeType:"image/png",buffer:imageBuffer});await stage.waitFor();
  await capture(admin,"desktop-division-crop",".ranked-insignia-dialog");
  await admin.getByRole("button",{name:"Appliquer",exact:true}).click();await admin.locator('.ranked-insignia-dialog').waitFor({state:"hidden"});
  await admin.getByRole("button",{name:"Choisir l’insigne Argent II",exact:true}).click();await admin.getByRole("button",{name:"Icône",exact:true}).click();
  await admin.getByLabel("Rechercher une icône",{exact:true}).fill("gem");await admin.getByRole("button",{name:"Choisir l’icône gem",exact:true}).click();await admin.getByRole("button",{name:"Appliquer",exact:true}).click();
  await admin.getByRole("button",{name:"Enregistrer",exact:true}).click();let divisionImage;
  await wait(async()=>{const tier=(await request("admin","/api/admin/ranked")).settings.ranks.find((rank)=>rank.id==="silver");divisionImage=tier.divisionInsignia?.III?.insigniaImage;return Boolean(divisionImage) && tier.divisionInsignia?.II?.insignia==="gem";},"division insignia persisted");
  assert.notEqual(divisionImage,imageId);
  await admin.getByRole("button",{name:"Choisir l’insigne Argent II",exact:true}).click();await admin.getByRole("button",{name:"Utiliser l’insigne commun",exact:true}).click();
  assert.equal(await admin.getByRole("button",{name:"Choisir l’insigne Argent II",exact:true}).locator('img').count(),1);
  await admin.getByRole("button",{name:"Enregistrer",exact:true}).click();await wait(async()=>!(await request("admin","/api/admin/ranked")).settings.ranks.find((rank)=>rank.id==="silver").divisionInsignia.II,"division inheritance restored");
  assert.equal((await request("player","/api/ranked")).games.find((row)=>row.id==="yahtzee").rank.insigniaImage,divisionImage);
  await capture(admin,"desktop-ranks-admin",".ranked-tier-settings");
  await admin.setViewportSize({width:390,height:844});await capture(admin,"mobile-ranks-admin",".ranked-tier-settings");
  await admin.getByRole("button",{name:"Matchmaking",exact:true}).click();assert.equal(await admin.getByLabel("Fenêtre maximale (divisions, joueur inclus)").inputValue(),"9");await capture(admin,"mobile-matchmaking-admin",".ranked-admin");
  await player.goto(`${origin}${base}/profil`);await player.locator('.ranked-profile-insignia img').first().waitFor();
  await wait(async()=>player.locator('.ranked-profile-insignia img').evaluateAll((images)=>images.length===7 && images.every((image)=>image.complete && image.naturalWidth===512)),"profile images decoded");
  assert.ok((await player.locator('.ranked-profile-insignia img').first().getAttribute("src")).endsWith(divisionImage));
  assert.equal(await player.locator('.xp-game-list progress').count(),1);
  async function checkProfileLayout(page,selector) {
    const entries=page.locator(`${selector} .ranked-profile-entry`);
    assert.ok(await entries.count()>0);
    assert.ok(await entries.evaluateAll((rows)=>rows.every((row)=>{
      const icon=row.querySelector('.ranked-profile-insignia').getBoundingClientRect(),stats=row.querySelector('.ranked-profile-statistics').getBoundingClientRect();
      return icon.width===56 && icon.height===56 && icon.right<=stats.left && row.scrollWidth<=row.clientWidth+1;
    })));
  }
  await checkProfileLayout(player,'.xp-workspace');
  await player.locator('.xp-workspace').scrollIntoViewIfNeeded();await capture(player,"desktop-private-profile",".xp-workspace");
  await player.getByLabel("À côté de ton icône",{exact:true}).selectOption("yahtzee");
  await player.getByRole("button",{name:"Enregistrer le profil",exact:true}).click();
  await wait(async()=>(await request("player","/api/me")).profile.rankedBadgeGameId==="yahtzee","equipped badge persisted");
  await player.locator('.player-rank-emblem img').first().waitFor();
  assert.ok(await player.locator('.display-name').evaluateAll((elements)=>elements.filter((element)=>element.querySelector('.player-rank-emblem')).every((element)=>{
    const rank=element.querySelector('.player-rank-emblem').getBoundingClientRect(),cosmetic=element.querySelector('.cosmetic-icon').getBoundingClientRect(),name=element.querySelector('.display-name-text').getBoundingClientRect(),title=element.querySelector('.player-game-title')?.getBoundingClientRect();
    return rank.right<=cosmetic.left && (!title || title.top>=name.bottom-1);
  })));
  await player.getByRole("button",{name:"Profil public",exact:true}).click();await player.locator('.public-profile-modal .ranked-profile-insignia img').first().waitFor();
  const publicTitles=player.locator('.public-profile-modal .xp-game-list');
  assert.deepEqual(await publicTitles.locator('article header strong').allTextContents(),['Yahtzee']);
  assert.equal(await publicTitles.locator('article b').count(),1);
  assert.equal(await publicTitles.locator('progress,small').count(),0);
  assert.equal(await publicTitles.getByText(/Niveau|Maîtrise| XP/).count(),0);
  await checkProfileLayout(player,'.public-profile-modal');
  await player.locator('.public-profile-modal .xp-workspace').scrollIntoViewIfNeeded();await capture(player,"desktop-public-profile",".public-profile-modal .xp-workspace");
  await player.setViewportSize({width:390,height:844});await checkProfileLayout(player,'.public-profile-modal');await player.locator('.public-profile-modal .ranked-profile').scrollIntoViewIfNeeded();await capture(player,"mobile-public-profile",".public-profile-modal .xp-workspace");
  await player.getByRole("button",{name:"Fermer le profil",exact:true}).click();
  await checkProfileLayout(player,'.xp-workspace');await capture(player,"mobile-private-profile",".xp-workspace");
  await player.setViewportSize({width:1440,height:1000});
  await player.goto(`${origin}${base}/`);await opponent.goto(`${origin}${base}/`);
  await player.getByRole("group",{name:"Mode des jeux",exact:true}).getByRole("button",{name:"Classé",exact:true}).click();
  await wait(async()=>await player.locator('.game-card').count()===7,"seven ranked games");
  assert.ok(await player.locator('.game-card').filter({has:player.locator('h3',{hasText:'Dés de Minuit'})}).isVisible());
  await capture(player,"desktop-ranked-home",".lobby-play-modes");await player.setViewportSize({width:390,height:844});await capture(player,"mobile-ranked-home",".lobby-play-modes");await player.setViewportSize({width:1440,height:1000});
  await player.locator(".game-card").filter({has:player.locator("h3",{hasText:"Yahtzee"})}).getByRole("button",{name:"Rejoindre le classé",exact:true}).click();
  await capture(player,"desktop-queue",".ranked-queue-surface");await player.setViewportSize({width:390,height:844});await capture(player,"mobile-queue",".ranked-queue-surface");
  await player.getByRole("button",{name:"Rejoindre la file",exact:true}).click();
  await player.getByText("Encore 1 joueur à trouver",{exact:true}).waitFor();
  assert.equal(await player.locator('.ranked-ready-dialog').getByText(/Elo|division|Classement des rangs/).count(),0);
  await capture(player,"mobile-search",".ranked-ready-dialog");await player.setViewportSize({width:1440,height:1000});await capture(player,"desktop-search",".ranked-ready-dialog");await player.setViewportSize({width:390,height:844});
  await player.locator('.ranked-ready-dialog').getByRole('button',{name:'Fermer',exact:true}).click();
  assert.ok((await request('player','/api/ranked')).queue);
  await player.locator('.ranked-waiting-indicator').getByRole('button',{name:/recherche en cours/}).click();await player.getByText('Encore 1 joueur à trouver',{exact:true}).waitFor();
  await request("opponent","/api/ranked/queue","POST",{gameId:"yahtzee"});
  await player.locator(".ranked-ready-seats").waitFor();await opponent.locator(".ranked-ready-seats").waitFor();
  assert.equal(await player.locator(".ranked-ready-seats .is-ready").count(),0);await capture(player,"mobile-ready-empty",".ranked-ready-dialog");
  await player.getByRole("button",{name:"Accepter et rejoindre",exact:true}).click();await wait(async()=>await player.locator(".ranked-ready-seats .is-ready").count()===1,"one confirmation");await capture(player,"mobile-ready-one",".ranked-ready-dialog");
  await player.setViewportSize({width:1440,height:1000});await capture(player,"desktop-ready-one",".ranked-ready-dialog");
  await opponent.getByRole("button",{name:"Accepter et rejoindre",exact:true}).click();await wait(async()=>await player.locator(".ranked-ready-seats .is-ready").count()===2,"all confirmations");
  const before=await player.locator(".ranked-large-clock").innerText();await player.waitForTimeout(1100);assert.notEqual(await player.locator(".ranked-large-clock").innerText(),before);
  await player.waitForURL(/\/table\//,{timeout:45000});const match=(await request("player","/api/ranked")).match;
  await capture(player,"desktop-ranked-table",".ranked-match-heading");await player.setViewportSize({width:390,height:844});await capture(player,"mobile-ranked-table",".ranked-match-heading");
  await player.getByRole('timer').waitFor();const turnBefore=await player.getByRole('timer').innerText();await wait(async()=>await player.getByRole('timer').innerText()!==turnBefore,"turn countdown progresses",6000);
  assert.equal(await player.getByRole("heading",{name:"Mises",exact:true}).count(),0);assert.ok(await player.getByRole("heading",{name:"Rangs de la table",exact:true}).count());
  await request("opponent",`/api/rooms/${match.code}/leave`,"POST",{});await player.locator(".ranked-result").waitFor();await player.waitForTimeout(6000);
  await player.locator(".ranked-result").scrollIntoViewIfNeeded();
  const bounds=await player.locator(".ranked-result").evaluate((element)=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,viewport:window.innerWidth};});
  assert.ok(bounds.left>=0 && bounds.right<=bounds.viewport+1,JSON.stringify(bounds));await capture(player,"mobile-result",".ranked-result");
  assert.ok(await player.locator(".ranked-final-scores").evaluate((element)=>element.scrollWidth<=element.clientWidth+1));
  assert.equal(await player.locator('.ranked-final-scores tbody tr').count(),2);
  assert.equal(await player.locator('.ranked-final-scores .ranked-final-evolution>strong').count(),1);
  assert.equal(await player.locator('.ranked-final-scores').getByRole('columnheader',{name:'Gain',exact:true}).count(),0);
  const room=await request("player",`/api/rooms/${match.code}`);assert.ok(room.ranked.results.find((row)=>row.userId==="player").after);assert.equal(room.ranked.results.find((row)=>row.userId==="opponent").after,undefined);
  await player.goto(`${origin}${base}/classements?elo=yahtzee`);await capture(player,"mobile-leaderboard",".leaderboard-page-panel");
  }
  const poker=await request("player","/api/rooms","POST",{gameId:"texas-holdem",name:"Poker grand format",stake:1000});
  await request("opponent",`/api/rooms/${poker.code}/join`,"POST",{});await request("opponent",`/api/rooms/${poker.code}/ready`,"POST",{});await request("player",`/api/rooms/${poker.code}/start`,"POST",{});
  await player.setViewportSize({width:1600,height:1000});await player.goto(`${origin}${base}/table/${poker.code}`);await player.locator('.community-cards .playing-card').first().waitFor();
  await player.waitForTimeout(700);const normal=await player.locator('.community-cards .playing-card').first().boundingBox();
  await player.getByRole('button',{name:'Plein écran',exact:true}).click();await player.locator('.table-fullscreen').waitFor();
  await player.waitForTimeout(700);const expanded=await player.locator('.community-cards .playing-card').first().boundingBox();assert.ok(expanded.height>normal.height,JSON.stringify({normal,expanded}));
  assert.ok(await player.locator('.poker-seats .playing-card').first().evaluate((card)=>parseFloat(getComputedStyle(card).height)>=118));
  await capture(player,"desktop-fullscreen-poker",".poker-table");
  async function controlsFit() {const overflow=await player.locator('.poker-control-dock').evaluate((dock)=>{
    const r=dock.getBoundingClientRect();return [...dock.querySelectorAll('button,input')].filter((element)=>element.getClientRects().length).flatMap((element)=>{const b=element.getBoundingClientRect();return b.left>=r.left-1 && b.right<=r.right+1?[]:[{text:element.textContent,left:b.left,right:b.right,dockLeft:r.left,dockRight:r.right}];});
  });assert.deepEqual(overflow,[],"Poker controls must remain inside the dock");}
  await controlsFit();
  async function fullyVisible(selector) {
    const failures=await player.locator(selector).evaluateAll((elements)=>elements.flatMap((element)=>{
      if(!element.getClientRects().length)return [];
      const box=element.getBoundingClientRect();let okay=box.top>=0&&box.bottom<=innerHeight+1&&box.left>=0&&box.right<=innerWidth+1;
      for(let parent=element.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(['auto','scroll','hidden','clip'].includes(style.overflowY)){const r=parent.getBoundingClientRect();okay&&=box.top>=r.top-1&&box.bottom<=r.bottom+1;}}
      return okay?[]:[{text:element.textContent,top:box.top,bottom:box.bottom,height:innerHeight}];
    }));assert.deepEqual(failures,[],`${selector} must not be cropped`);
  }
  for(const [width,height] of [[1920,1080],[1366,768],[1280,720]]) {
    await player.setViewportSize({width,height});await player.waitForTimeout(300);
    await fullyVisible('.community-cards .playing-card, .poker-seats .playing-card');
    await fullyVisible('.poker-control-dock button, .poker-control-dock input');
    await capture(player,`poker-${width}x${height}`,'.poker-table');
  }
  const boardBounds=await player.locator('.community-cards').evaluate((row)=>{const r=row.getBoundingClientRect();return [...row.children].every((card)=>{const c=card.getBoundingClientRect();return c.left>=r.left && c.right<=r.right+1;});});assert.ok(boardBounds);
  await player.getByRole('button',{name:'Réduire',exact:true}).click();await player.setViewportSize({width:390,height:844});
  await player.getByRole('button',{name:'Plein écran',exact:true}).click();await player.locator('.poker-table').scrollIntoViewIfNeeded();await capture(player,"mobile-fullscreen-poker",".poker-table");await controlsFit();
  await player.locator('.poker-control-dock').scrollIntoViewIfNeeded();await capture(player,"mobile-poker-controls",".poker-control-dock");
  await request("opponent",`/api/rooms/${poker.code}/leave`,"POST",{});
  const midnight=await request("player","/api/rooms","POST",{gameId:"midnight-dice",name:"Mandats plein écran",stake:10});
  for(const id of ["opponent","admin"]){await request(id,`/api/rooms/${midnight.code}/join`,"POST",{});await request(id,`/api/rooms/${midnight.code}/ready`,"POST",{});}
  await player.setViewportSize({width:1366,height:768});await player.goto(`${origin}${base}/table/${midnight.code}`);await player.getByRole('button',{name:'Plein écran',exact:true}).click();
  await request("player",`/api/rooms/${midnight.code}/start`,"POST",{});
  for(let i=0;i<3;i++) {
    const pending=await request("player",`/api/rooms/${midnight.code}`);
    if(pending.pacing)await request("player",`/api/rooms/${midnight.code}/pacing/skip`,"POST",{pacingId:pending.pacing.id});
    const room=await request("player",`/api/rooms/${midnight.code}`),actor=room.state.players[room.state.currentPlayerIndex].id;
    const view=await request(actor,`/api/rooms/${midnight.code}`);
    if(actor==='player'){await player.locator('.midnight-contract-dialog').waitFor();assert.equal(await player.locator('.midnight-selection article').count(),4);assert.equal(await player.locator('.midnight-selection button').count(),4);await capture(player,'midnight-contract-1366x768','.midnight-contract-dialog');await player.locator('.midnight-contract-dialog button').filter({hasText:/^Choisir$/}).first().click();}
    else await request(actor,`/api/rooms/${midnight.code}/action`,"POST",{type:"choose-contract",contract:view.state.contractOffers[0]});
  }
  const pending=await request("player",`/api/rooms/${midnight.code}`);
  if(pending.pacing)await request("player",`/api/rooms/${midnight.code}/pacing/skip`,"POST",{pacingId:pending.pacing.id});
  await player.locator('.midnight-market-grid').waitFor();
  for(const [width,height] of [[1920,1080],[1366,768],[1280,720]]) {
    await player.setViewportSize({width,height});await player.waitForTimeout(300);
    await capture(player,`midnight-${width}x${height}`,'.midnight-table');
    await fullyVisible('.midnight-market-grid .die, .midnight-market-grid button, .midnight-current-contract');
  }
  await player.getByRole('button',{name:'Réduire',exact:true}).click();await player.setViewportSize({width:390,height:844});await player.getByRole('button',{name:'Plein écran',exact:true}).click();
  await player.locator('.midnight-market').scrollIntoViewIfNeeded();await capture(player,'mobile-midnight-market','.midnight-market');
  for(let i=0;i<9;i++) {
    let view=await request("player",`/api/rooms/${midnight.code}`);
    while(view.pacing){await request("player",`/api/rooms/${midnight.code}/pacing/skip`,"POST",{pacingId:view.pacing.id});view=await request("player",`/api/rooms/${midnight.code}`);}
    await request(view.state.players[view.state.currentPlayerIndex].id,`/api/rooms/${midnight.code}/action`,"POST",{type:"draft",index:0});
  }
  for(let i=0;i<2;i++) {
    let view=await request("player",`/api/rooms/${midnight.code}`);
    while(view.pacing){await request("player",`/api/rooms/${midnight.code}/pacing/skip`,"POST",{pacingId:view.pacing.id});view=await request("player",`/api/rooms/${midnight.code}`);}
    const actor=view.state.players[view.state.currentPlayerIndex].id,own=await request(actor,`/api/rooms/${midnight.code}`);
    await request(actor,`/api/rooms/${midnight.code}/action`,"POST",{type:"choose-contract",contract:own.state.contractOffers.find((id)=>!own.state.usedContracts[actor].includes(id))});
  }
  const waiting=await request("player",`/api/rooms/${midnight.code}`);
  if(waiting.pacing)await request("player",`/api/rooms/${midnight.code}/pacing/skip`,"POST",{pacingId:waiting.pacing.id});
  await player.setViewportSize({width:1366,height:768});await player.locator('.midnight-selection').waitFor();
  assert.equal(await player.locator('.midnight-selection article').count(),3);assert.equal(await player.locator('.midnight-selection button').count(),3);
  await capture(player,'midnight-remaining-contracts','.midnight-selection');
  await request("player",`/api/rooms/${midnight.code}`,"DELETE",{});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors,previews},null,2));
} finally {
  if(browser)await browser.close();
  for(const child of children){if(child.exitCode===null){const exit=new Promise((resolve)=>child.once("exit",resolve));child.kill();await exit;}}
  assert.equal(path.dirname(path.resolve(temp)),path.resolve(tmpdir()));assert.ok(path.basename(temp).startsWith("ktga-ranked-browser-"));
  rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
