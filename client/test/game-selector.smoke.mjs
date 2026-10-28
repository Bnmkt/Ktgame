import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Server } from "../../server/node_modules/socket.io/dist/index.js";

const root=fileURLToPath(new URL('../../',import.meta.url)), dependencies=path.join(tmpdir(),'ktga-chat-browser-tools/node_modules');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE ?? path.join(dependencies,'playwright/index.mjs')).href);
const {PlaywrightBlocker}=await import(pathToFileURL(path.join(dependencies,'@ghostery/adblocker-playwright/dist/esm/index.js')).href);
const blocker=await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
const cache=path.join(root,'artifacts/selector-artwork');await fs.mkdir(cache,{recursive:true});
let games;
try {games=JSON.parse(await fs.readFile(path.join(cache,'games.json'),'utf8'));}
catch {games=await(await fetch('https://api.ktga.me/api/games')).json();await fs.writeFile(path.join(cache,'games.json'),JSON.stringify(games));}
assert.equal(games.length,15);
const images=new Map();
const downloads=await Promise.allSettled([...new Set(games.flatMap(game=>[game.coverImage,game.descriptiveImage,game.discordIconImage]).filter(Boolean))].map(async url=>{
  const local=path.join(cache,path.basename(url));let body;
  try {body=await fs.readFile(local);}catch {const response=await fetch(new URL(url,'https://api.ktga.me'));assert.ok(response.ok);body=Buffer.from(await response.arrayBuffer());await fs.writeFile(local,body);}
  images.set(url,body);
}));for(const result of downloads)if(result.status==='rejected')throw result.reason;
const rankedIds=['belote','texas-holdem','president','liars-dice','velvet-ruse','yahtzee','midnight-dice'];
const ranked={games:rankedIds.map(id=>({id,enabled:id!=='midnight-dice',players:3,maximumPlayers:6,preset:{stake:100,gameModifiers:{}},limits:{afkSeconds:90,reconnectSeconds:120,abandonPolicy:'rank',disconnectPolicy:'rank'},rank:{id:'unranked',label:'Non classé',placementGames:0,placementRequired:5}})),serverTime:Date.now()};
const rooms=[{id:'blackjack-room',code:'BJTEST',gameId:'blackjack',name:'Blackjack public',isPublic:true,players:[{id:'friend',pseudo:'Camille'}],stake:100}, {id:'president-room',code:'PRTEST',gameId:'president',name:'Président public',isPublic:true,players:[{id:'friend',pseudo:'Camille'}],stake:100}];
const requests=[],errors=[];let webOrigin;
const service=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',webOrigin ?? '*');res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Headers','authorization,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 const p=new URL(req.url,'http://localhost').pathname;
 const reply=data=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(req.method==='POST'){const chunks=[];for await(const chunk of req)chunks.push(chunk);requests.push({path:p,body:JSON.parse(Buffer.concat(chunks).toString()||'{}')});}
 if(p==='/api/games')return reply(games);
 if(p==='/api/rooms')return reply(req.method==='POST'?{code:'CREATED'}:rooms);
 if(p==='/api/friends')return reply({friends:[]});
 if(p==='/api/ranked')return reply(ranked);
 if(p==='/api/community-events/carousel')return reply({events:[],focusIndex:0});
 return reply({messages:{}});
});
const realtime=new Server(service,{cors:{origin:true,credentials:true}});
realtime.on('connection',socket=>socket.emit('rooms',rooms));
await new Promise(resolve=>service.listen(0,'127.0.0.1',resolve));const apiOrigin=`http://127.0.0.1:${service.address().port}`;
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
webOrigin=`http://127.0.0.1:${port}`;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.join(root,'client'),windowsHide:true,stdio:'ignore',env:{...process.env,VITE_BASE_PATH:'/',VITE_API_URL:apiOrigin,VITE_SOCKET_URL:apiOrigin,VITE_SOCKET_PATH:'/socket.io'}});
const output=path.join(root,'docs/previews/game-selector-20261028',String(Date.now()));await fs.mkdir(output,{recursive:true});
async function until(check,label){for(let i=0;i<120;i++){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timeout '+label);}
let browser,page;
try{
 await until(async()=>(await fetch(webOrigin)).ok,'Vite');browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1366,height:768},hasTouch:true});page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await blocker.enableBlockingInPage(page);
 await page.route('**/api/game-images/**',async route=>{const body=images.get(new URL(route.request().url()).pathname);assert.ok(body);await route.fulfill({body,contentType:'image/png'});});
 const url=webOrigin+'/test/fixtures/game-selector.html';
 await page.goto(url);await page.locator('.game-orbit-seat').first().waitFor({state:'attached'});await page.locator('.game-orbit[data-orbit-active="blackjack"]').waitFor();
 await until(async()=>await page.locator('.game-orbit-seat .game-artwork-media img').evaluateAll(nodes=>nodes.length===15&&nodes.every(node=>node.complete&&node.naturalWidth)),'existing artwork');
 await page.locator('.game-orbit img').evaluateAll(nodes=>Promise.all(nodes.map(node=>node.decode().catch(()=>{}))));
 assert.equal(await page.locator('.game-orbit-seat').count(),15);assert.equal(await page.locator('.game-grid').count(),0);
 assert.equal(await page.locator('.game-orbit-focus .game-artwork-media img').getAttribute('src'),games.find(game=>game.id==='blackjack').discordIconImage,'central artwork reuses the Discord icon');
 if(process.env.SELECTOR_DEBUG)console.log(JSON.stringify(await page.locator('.game-orbit-seat').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.orbitGame,images:[...node.querySelectorAll('img')].map(img=>({url:img.getAttribute('src'),width:img.naturalWidth,renderWidth:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height,display:getComputedStyle(img).display,opacity:getComputedStyle(img).opacity,visibility:getComputedStyle(img).visibility}))})))));
 assert.ok(await page.locator('.game-selection-tools').isVisible(),'filters survive content blocking');
 const active=()=>page.locator('.game-orbit').getAttribute('data-orbit-active');
 const settle=()=>page.waitForTimeout(1000);
 await page.screenshot({path:path.join(output,'immersive-laptop.png'),fullPage:true});
 const before=await active(), tracking=page.locator('[data-orbit-game="belote"]');
 const initial=await tracking.boundingBox();await page.getByRole('button',{name:'Jeu suivant',exact:true}).click();
 await until(async()=>await active()!==before,'arrow navigation');await settle();
 const moved=await tracking.boundingBox();assert.ok(Math.abs(moved.y-initial.y)>5,'tiles move around the ellipse vertically');assert.ok(Math.abs(moved.x-initial.x)>5,'tiles also move horizontally');
 await page.getByRole('button',{name:'Jeu précédent',exact:true}).click();await until(async()=>await active()===before,'reverse arrow');
 await page.locator('.game-orbit').focus();await page.keyboard.press('Home');assert.equal(await active(),games[0].id);
 await page.keyboard.press('ArrowLeft');assert.equal(await active(),games.at(-1).id);await page.keyboard.press('ArrowRight');assert.equal(await active(),games[0].id);
 await page.keyboard.press('End');assert.equal(await active(),games.at(-1).id);
 await settle();
 const president=page.locator('[data-orbit-game="president"]');
 const exposed=await president.evaluate(node=>{
   const rect=node.getBoundingClientRect();
   for(const [x,y]of [[.5,.5],[.25,.25],[.75,.25],[.25,.75],[.75,.75],[.1,.5],[.9,.5]]){
     const point={x:rect.x+rect.width*x,y:rect.y+rect.height*y};
     if(document.elementFromPoint(point.x,point.y)?.closest('.game-orbit-seat')===node)return point;
   }
   return null;
 });
 assert.ok(exposed,'a visible overlapping seat keeps an exposed click target');
 await page.mouse.move(exposed.x,exposed.y);await president.click();assert.equal(await active(),'president');await settle();
 const rect=await page.locator('.game-orbit-viewport').boundingBox();await page.mouse.move(rect.x+rect.width*.3,Math.min(650,rect.y+rect.height*.45));
 const scroll=await page.evaluate(()=>scrollY),wheelBefore=await active();await page.mouse.wheel(0,140);await until(async()=>await active()!==wheelBefore,'wheel');
 assert.equal(await page.evaluate(()=>scrollY),scroll,'wheel must not scroll the page simultaneously');
 await page.getByRole('button',{name:'Jeux de dés',exact:true}).click();await until(async()=>await page.locator('.game-orbit-seat').count()===games.filter(game=>game.type==='dice').length,'shared type filter');
 const diceIds=games.filter(game=>game.type==='dice').map(game=>game.id);
 const randomRequests=requests.length;await page.getByRole('button',{name:'Jeu aléatoire',exact:true}).click();
 assert.ok(diceIds.includes(await active()));await until(async()=>await page.locator('[data-orbit-spinning]').count()===0,'random alignment');
 assert.equal(requests.length,randomRequests,'random never starts or creates a game');
 await page.getByRole('searchbox',{name:'Rechercher un jeu',exact:true}).fill('aucun jeu test');await page.getByText('Aucun jeu ne correspond à ces critères.',{exact:true}).waitFor();
 assert.equal(await page.locator('.game-orbit-seat').count(),0);
 await page.getByRole('button',{name:'Effacer la recherche et les filtres',exact:true}).click();await page.locator('.game-orbit').waitFor();
 await page.getByRole('searchbox',{name:'Rechercher un jeu',exact:true}).fill('Blackjack');await until(async()=>await active()==='blackjack','search');
 await page.getByRole('button',{name:'Vue classique',exact:true}).click();assert.equal(await page.locator('.game-card').count(),1);assert.equal(await page.locator('.game-orbit').count(),0);
 await page.reload();await page.locator('.game-grid').waitFor();assert.equal(await page.locator('.game-card').count(),15,'classic preference persists');
 await page.screenshot({path:path.join(output,'classic-laptop.png'),fullPage:true});
 await page.getByRole('button',{name:'Filtres',exact:true}).click();
 await page.getByRole('combobox',{name:'Nombre de joueurs',exact:true}).selectOption('solo');
 await page.getByRole('combobox',{name:'Difficulté',exact:true}).selectOption('easy');
 const simpleSolo=games.filter(game=>game.complexity==='easy'&&['solo','solo-multi'].includes(game.audience));
 await until(async()=>await page.locator('.game-card').count()===simpleSolo.length,'classic advanced filters');
 await page.getByRole('button',{name:'Vue immersive',exact:true}).click();
 await until(async()=>await page.locator('.game-orbit-seat').count()===simpleSolo.length,'shared advanced filters');
 await page.getByRole('button',{name:'Réinitialiser',exact:true}).click();
 await page.getByRole('button',{name:'Filtres',exact:true}).click();
 await page.locator('.game-orbit').waitFor();
 await page.getByRole('searchbox',{name:'Rechercher un jeu',exact:true}).fill('Blackjack');await until(async()=>await active()==='blackjack','single game');
 await page.getByRole('button',{name:'Créer une table',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Blackjack',exact:true});await dialog.waitFor();
 assert.equal(await dialog.getByRole('tab',{name:'Créer une table',exact:true}).getAttribute('aria-selected'),'true');
 await dialog.getByRole('button',{name:'Créer la table',exact:true}).click();await until(()=>requests.some(request=>request.path==='/api/rooms'),'existing create action');
 assert.equal(requests.at(-1).body.gameId,'blackjack');assert.equal(requests.at(-1).body.stake,20);await until(async()=>(await page.locator('.selector-fixture-result').innerText()).includes('CREATED'),'creation navigation');
 await dialog.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.locator('.game-orbit-actions').getByRole('button',{name:/^Rejoindre/}).click();dialog=page.getByRole('dialog',{name:'Blackjack',exact:true});await dialog.getByRole('tabpanel').getByRole('button',{name:'Rejoindre',exact:true}).click();
 await until(async()=>(await page.locator('.selector-fixture-result').innerText()).includes('BJTEST'),'join navigation');await dialog.getByRole('button',{name:'Fermer',exact:true}).click();
 realtime.emit('rooms-patch',{remove:[],upsert:[{...rooms[1],id:'blackjack-2',code:'BJNEW',gameId:'blackjack'}]});
 await until(async()=>(await page.locator('.game-orbit-tables').innerText()).startsWith('2 '),'live table count');
 // Mode selection reuses the same ranked entry and queue dialog.
 await page.getByRole('searchbox',{name:'Rechercher un jeu',exact:true}).fill('');
 await page.getByRole('group',{name:'Mode des jeux',exact:true}).getByRole('button',{name:'Classé',exact:true}).click();
 await until(async()=>await page.locator('.game-orbit-seat').count()===rankedIds.length,'ranked shared pool');
 await page.getByRole('searchbox',{name:'Rechercher un jeu',exact:true}).fill('Yahtzee');await until(async()=>await active()==='yahtzee','ranked selection');
 await page.getByRole('button',{name:'Rejoindre le classé',exact:true}).click();await page.locator('.ranked-queue-surface').waitFor();assert.equal(requests.filter(request=>request.path==='/api/ranked/queue').length,0);
 await page.getByRole('dialog').getByRole('button',{name:'Fermer',exact:true}).click();
 await page.getByRole('searchbox',{name:'Rechercher un jeu',exact:true}).fill('Minuit');await until(async()=>await active()==='midnight-dice','unavailable ranked entry');
 assert.equal(await page.getByRole('button',{name:'Jeu aléatoire',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Rejoindre le classé',exact:true}).isDisabled(),true);
 await page.getByRole('group',{name:'Mode des jeux',exact:true}).getByRole('button',{name:'Classique',exact:true}).click();await page.getByRole('searchbox',{name:'Rechercher un jeu',exact:true}).fill('');
 await page.reload();await page.locator('.game-orbit').waitFor();assert.equal(await page.getByRole('button',{name:'Vue immersive',exact:true}).getAttribute('aria-pressed'),'true');
 for(const[name,viewport]of[['desktop',{width:1920,height:1080}],['laptop',{width:1366,height:768}],['tablet',{width:820,height:1180}],['mobile',{width:390,height:844}],['small',{width:320,height:740}]]){
  await page.setViewportSize(viewport);await settle();
  const geometry=await page.evaluate(()=>({page:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(geometry.page<=geometry.width,`${name}: no horizontal overflow ${JSON.stringify(geometry)}`);
  if(viewport.width<=700)assert.ok((await page.locator('.game-orbit-seat').all()).length===15);
  const visible=await page.locator('.game-orbit-seat').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).visibility!=='hidden').length);
  assert.equal(visible,viewport.width<=700?6:14,`${name}: mobile hides distant seats`);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(output,`immersive-${name}.png`),fullPage:true});
 }
 await page.locator('.game-orbit-viewport').scrollIntoViewIfNeeded();
 const mobileBefore=await active(),viewport=await page.locator('.game-orbit-viewport').boundingBox();
 const touch=await context.newCDPSession(page);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:250,y:viewport.y+80}]});
 for(let i=1;i<=6;i++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:250-i*18,y:viewport.y+82}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await until(async()=>await active()!==mobileBefore,'touch swipe');
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Jeu aléatoire',exact:true}).click();await page.waitForTimeout(150);assert.equal(await page.locator('[data-orbit-spinning]').count(),0);
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({ok:true,checks:['existing-15-artworks','ellipse-depth-and-motion','arrows-and-infinite-keyboard','direct-click','wheel-without-scroll','filtered-random-without-requests','search-and-empty','classic-preserved-and-persisted','immersive-persisted','existing-create-and-browse','ranked-dialog','desktop-and-mobile','touch','reduced-motion','Ghostery'],requests,errors},null,2));
 console.log(JSON.stringify({ok:true,screenshots:output,requests,errors}));
}catch(error){if(page){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText()).slice(-2200));}console.error(errors);throw error;}
finally{await browser?.close();if(vite.exitCode===null)await new Promise(resolve=>{vite.once('exit',resolve);vite.kill();});await new Promise(resolve=>realtime.close(resolve));}
