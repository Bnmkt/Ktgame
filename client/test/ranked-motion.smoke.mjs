import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
const {chromium}=await import(pathToFileURL(path.join(os.tmpdir(),"ktga-chat-browser-tools/node_modules/playwright/index.mjs")));
const {PlaywrightBlocker}=await import(pathToFileURL(path.join(os.tmpdir(),"ktga-chat-browser-tools/node_modules/@ghostery/adblocker-playwright/dist/esm/index.js")));
const listener=net.createServer();await new Promise(r=>listener.listen(0,"127.0.0.1",r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const origin=`http://127.0.0.1:${port}`;
const directory=path.join(root,"docs/previews/ranked-motion-20261012",String(Date.now()));fs.mkdirSync(directory,{recursive:true});
const child=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port",String(port),"--strictPort"],{cwd:path.join(root,"client"),windowsHide:true,env:{...process.env,VITE_BASE_PATH:"/",VITE_API_URL:origin},stdio:["ignore","pipe","pipe"]});
let output="",browser;const errors=[],checks=[];child.stdout.on("data",d=>output+=d);child.stderr.on("data",d=>output+=d);
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from'/node_modules/.vite/deps/react-dom_client.js';const createRoot=ReactDOM.createRoot;
import '/src/styles.css';import '/src/navigation/casino.css';
const{LocaleProvider}=await import('/src/locales/LocaleProvider.jsx'),{RankedCompletion}=await import('/src/features/games/RankedCompletion.jsx'),{RankedCoordinator}=await import('/src/features/games/RankedPlay.jsx');
const{CardMotionSurface}=await import('/src/components/game/CardMotionSurface.jsx'),{PlayingCard}=await import('/src/components/game/GamePieces.jsx');
const{BeloteBoard}=await import('/src/components/game/BeloteBoard.jsx');
const h=React.createElement,root=createRoot(document.getElementById('root'));
window.recap=(result)=>root.render(h(LocaleProvider,null,h(RankedCompletion,{key:result.matchId,result,matchId:result.matchId,userId:'self',gameId:'yahtzee'})));
window.queue=(admin)=>root.render(h(LocaleProvider,null,h(RankedCoordinator,{user:{id:'self',admin},onOpenRoom:()=>{}})));
function Cards({mode}){const[step,setStep]=React.useState(0);window.moveCard=()=>setStep(1);const card={rank:'A',suit:'H'},covered=mode==='covered';return h(CardMotionSurface,{version:step,actorId:'other'},h('div',{style:{position:'relative',height:480,margin:16}},
h('div',{'data-card-owner':'other',style:{position:'absolute',left:10,top:300,width:80,height:100}},!step?h(PlayingCard,{card,hidden:mode==='opponent',animate:false,motionKey:covered?'public-track':undefined}):null),
h('div',{'data-card-arrival':'played',style:{position:'absolute',right:10,top:70}},step?h(PlayingCard,{card,hidden:covered,playerId:'other',animate:true,motionKey:covered?'public-track':undefined}):null)))}
function Belote({spectator}){const[step,setStep]=React.useState(0),players=['self','other','partner','fourth'].map(id=>({id,pseudo:id})),card={rank:'A',suit:'H'},actor=spectator?'other':'self';window.playBelote=()=>setStep(1);const state={gameId:'belote',players,currentPlayerIndex:step?2:spectator?1:0,phase:'play',round:1,modifiers:{},trump:'H',trickNumber:1,teamScores:[0,0],cardPoints:[0,0],trickCounts:[0,0],targetScore:1000,trick:step?[{playerId:actor,card}]:[],hands:{self:spectator?[]:step?[{rank:'K',suit:'S'}]:[card,{rank:'K',suit:'S'}],other:step?[null]:[null,null],partner:[null,null],fourth:[null,null]},legalCards:[card]};return h(LocaleProvider,null,h(CardMotionSurface,{version:state,actorId:actor,attachToChild:true},h('div',{className:'board-felt'},h(BeloteBoard,{state,user:players[0],spectator,onAction:async()=>setStep(1)}))))}
window.belote=(spectator)=>root.render(h(Belote,{key:String(spectator),spectator}));window.cards=(mode)=>root.render(h(Cards,{key:mode,mode}));window.ready=true;
</script></body></html>`;
try {
  for(let i=0;i<300;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===299)throw new Error(output);}
  browser=await chromium.launch({channel:"msedge",headless:true});
  const blocker=await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for(const [name,viewport]of[["desktop",{width:1440,height:1000}],["mobile",{width:390,height:844}]]){
    const context=await browser.newContext({viewport});const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));await blocker.enableBlockingInPage(page);
    await page.route("**/__motion",route=>route.fulfill({contentType:"text/html",body:html}));
    let queued={games:[{id:"yahtzee",rank:{id:"gold",name:"Or",division:"III",insignia:"shield",order:14}}],queue:{gameId:"yahtzee",joinedAt:Date.now(),players:4,waiting:1,remaining:3,canFillBots:true},serverTime:Date.now()};let fills=0;
    await page.route("**/api/**",route=>{const key=new URL(route.request().url()).pathname;let data={messages:{}};
      if(key==="/api/ranked")data=queued;
      if(key==="/api/ranked/queue/fill-bots"){fills++;queued={...queued,queue:{...queued.queue,canFillBots:false},proposal:{id:"offer",gameId:"yahtzee",startsAfter:Date.now()+30000,expiresAt:Date.now()+90000,players:[{id:"self",rank:queued.games[0].rank,ready:false},...[1,2,3].map(i=>({id:`bot${i}`,isBot:true,ready:true}))]}};data=queued;}
      return route.fulfill({contentType:"application/json",body:JSON.stringify(data)});
    });
    await page.goto(`${origin}/__motion`);await page.waitForFunction(()=>window.ready).catch(error=>{throw new Error(error.message+" "+JSON.stringify(errors)+" "+output.slice(-1000));});
    const base={userId:"self",before:1395,after:1415,delta:20,beforeRank:{id:"gold",name:"Or",division:"III",order:14,insignia:"shield"},afterRank:{id:"platinum",name:"Platine",division:"I",order:15,insignia:"crown"},beforeProgression:{progress:95},progression:{progress:15}};
    for(const direction of["promotion","demotion","reveal","placement"]){
      const result={...base,matchId:`${name}-${direction}`};
      if(direction==="demotion"){[result.beforeRank,result.afterRank]=[result.afterRank,result.beforeRank];result.before=1415;result.after=1395;result.delta=-20;}
      if(direction==="reveal"){result.beforeRank={id:"unranked",name:"Non classé",order:null};result.placement={completed:true,games:5,required:5};}
      if(direction==="placement"){result.beforeRank=result.afterRank={id:"unranked",name:"Non classé",order:null};result.placement={completed:false,games:2,required:5};delete result.before;delete result.after;delete result.delta;}
      await page.evaluate(r=>window.recap(r),result);await page.getByRole("dialog",{name:"Ta progression classée"}).waitFor();
      await page.waitForTimeout(direction==="placement"?2300:1900);
      assert.ok(await page.locator(`.recap-${direction}`).isVisible());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:path.join(directory,`${name}-${direction}.png`)});
      if(direction!=="placement")await page.waitForFunction(()=>document.querySelector('.ranked-recap-modal')?.classList.contains('recap-settled'));
      await page.getByRole("button",{name:"Continuer",exact:true}).click();assert.equal(await page.getByRole("dialog").count(),0);
      await page.evaluate(r=>window.recap(r),{...result});assert.equal(await page.getByRole("dialog").count(),0,"Repeated room snapshots cannot reopen a dismissed recap");
    }
    await page.evaluate(()=>window.queue(true));await page.getByRole("button",{name:"Compléter avec des bots",exact:true}).click();assert.equal(fills,0);
    const confirm=page.getByRole("dialog",{name:"Compléter la classée avec des bots ?"});await confirm.getByRole("button",{name:"Compléter avec des bots",exact:true}).click();
    await page.getByText("Bot 4",{exact:true}).waitFor();assert.equal(fills,1);assert.equal(await page.locator('.ranked-ready-seats .is-ready').count(),3);
    await page.screenshot({path:path.join(directory,`${name}-admin-bots.png`)});
    for(const mode of["self","opponent","covered"]){
      await page.evaluate(m=>window.cards(m),mode);await page.locator('[data-card-piece]').waitFor();
      if(mode==="opponent")assert.equal(await page.locator('[data-card-covered][data-card-face]').count(),0);
      await page.evaluate(()=>window.moveCard());await page.locator('[data-card-flight]').waitFor();
      assert.ok((await page.locator('[data-card-flight]').boundingBox()).width>20);
      if(mode==="covered")assert.equal(await page.locator('[data-card-flight] strong').count(),0,"A hidden destination never shows the old private face");
      await page.screenshot({path:path.join(directory,`${name}-card-${mode}.png`)});
      await page.locator('[data-card-flight]').waitFor({state:'detached'});assert.equal(await page.locator('[data-card-arrival] [data-card-piece]').evaluate(n=>n.style.visibility),"");
    }
    for(const spectator of[false,true]){
      await page.evaluate(value=>window.belote(value),spectator);await page.locator('.belote-table').waitFor();
      if(name==='desktop' && !spectator){await page.locator('.board-felt').evaluate(node=>node.requestFullscreen());assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),true);}
      if(!spectator)await page.getByRole('button',{name:'Jouer A de Coeur',exact:true}).click();else await page.evaluate(()=>window.playBelote());
      await page.locator('[data-card-flight]').waitFor();
      assert.equal(await page.locator('[data-card-flight]').count(),1,'Only the played card moves, not the remaining hand');
      assert.equal(await page.locator('[data-card-flight]').evaluate(node=>getComputedStyle(node).visibility),'visible');
      if(name==='desktop' && !spectator)assert.equal(await page.locator('[data-card-flight]').evaluate(node=>document.fullscreenElement.contains(node)),true,'The moving card remains visible in native fullscreen');
      await page.screenshot({path:path.join(directory,`${name}-belote-${spectator?'spectator':'player'}.png`)});
      await page.locator('[data-card-flight]').waitFor({state:'detached'});
      assert.equal(await page.locator('.belote-trick-grid [data-card-piece]').evaluate(node=>node.style.visibility),'');
      if(name==='desktop' && !spectator)await page.evaluate(()=>document.exitFullscreen());
    }
    await page.emulateMedia({reducedMotion:"reduce"});await page.evaluate(r=>window.recap(r),{...base,matchId:`${name}-reduced`});await page.locator('.recap-settled').waitFor();
    await page.getByRole("button",{name:"Continuer",exact:true}).click();await page.evaluate(()=>window.cards('reduced'));await page.locator('[data-card-piece]').waitFor();await page.evaluate(()=>window.moveCard());assert.equal(await page.locator('[data-card-flight]').count(),0);
    checks.push(`${name}: personal ranked promotion/demotion/placements, admin bot confirmation, visible and hidden card flights, reduced motion`);await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors,directory}));
}finally{await browser?.close();if(child.exitCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}}
