import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { games } from "../../server/src/games/shared.js";
import { normalizeGameModifiers, normalizeBattleModifiers } from "../../server/src/games/modifiers.js";

const root=fileURLToPath(new URL("../../",import.meta.url)),dependencies=path.join(os.tmpdir(),"ktga-chat-browser-tools/node_modules");
const {chromium}=await import(pathToFileURL(path.join(dependencies,"playwright/index.mjs")));
const {PlaywrightBlocker}=await import(pathToFileURL(path.join(dependencies,"@ghostery/adblocker-playwright/dist/esm/index.js")));
const directory=path.join(root,"docs/previews/editor-safety-20261016",String(Date.now()));fs.mkdirSync(directory,{recursive:true});
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,"127.0.0.1",resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const origin=`http://127.0.0.1:${port}`,child=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port",String(port),"--strictPort"],{cwd:path.join(root,"client"),windowsHide:true,env:{...process.env,VITE_API_URL:origin,VITE_BASE_PATH:"/"},stdio:["ignore","pipe","pipe"]});
let browser,output="";const errors=[],checks=[];child.stdout.on("data",data=>output+=data);child.stderr.on("data",data=>output+=data);
const fixtures=games.map((game,index)=>({...game,description:"Des parties entre amis, des décisions et un peu de chance.",position:index+1,entryPot:10,enabled:true,coverImage:"/ktga-preview.png",descriptiveImage:"/ktga-preview.png",discordIconImage:"/pwa/icon-512.png",defaultModifiers:game.id==="bataille"?normalizeBattleModifiers():normalizeGameModifiers(game.id),...(game.id==="texas-holdem"?{minPokerBuyIn:1000,pokerDefaultBigBlind:100,pokerTurnSeconds:30}:{})}));
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import '/src/styles.css';
const {LocaleProvider}=await import('/src/locales/LocaleProvider.jsx'),{GameEditor}=await import('/src/components/admin/GameEditor.jsx');
const {ShopCatalog}=await import('/src/components/shop/ShopCatalog.jsx'),{DisplayName}=await import('/src/components/cosmetics/Cosmetics.jsx'),{AccountWorkspace}=await import('/src/components/profile/AccountWorkspace.jsx');
const {CasinoSettings}=await import('/src/components/admin/CasinoSettings.jsx');
const {AdminAccountWorkspace}=await import('/src/components/admin/AdminAccountWorkspace.jsx'),{defaultSoftBanRestrictions}=await import('/src/features/accounts/softban.js');
const h=React.createElement,root=ReactDOM.createRoot(document.getElementById('root'));let sequence=0;
const player={id:'preview-player',pseudo:'PreviewPlayer',tokens:10000,profile:{birthDate:'1990-01-01'},cosmetics:{equipped:{}},gameProgression:[]};
window.profileOpens=0;window.addEventListener('ktga-public-profile',()=>window.profileOpens++);
window.mountCatalog=()=>root.render(h(LocaleProvider,{key:++sequence},h('main',{className:'app-shell'},h(ShopCatalog,{user:player,items:[{id:'effect',value:'gold',name:'Gold name',price:100,type:'nameEffects',category:'classic',description:'Test',packs:['test']},{id:'frame',value:'default',name:'Frame',price:200,type:'memberCards',category:'classic',description:'Test',packs:['test']}],stats:[],onPurchaseItem:()=>{},onPurchasePack:()=>{}}),h('div',{id:'outside-preview'},h(DisplayName,{user:player})))));
function AccountDemo(){const[form,setForm]=React.useState({displayName:'PreviewPlayer',bio:'',birthDate:'1990-01-01',gender:'',rankedBadgeGameId:''}),[stats,setStats]=React.useState({visibleProfileStats:[],memberCardStats:['hidden','hidden'],customAchievementIds:[]});return h(AccountWorkspace,{user:player,form,setForm,favorites:[],games:[],toggleFavorite:()=>{},statForm:stats,setStatForm:setStats,milestones:[],onPreview:()=>{},onSave:()=>{},onSaveEmail:()=>{},onSavePassword:()=>{},onUser:()=>{},onError:()=>{},onMessage:()=>{}})}
window.mountAccount=()=>root.render(h(LocaleProvider,{key:++sequence},h('main',{className:'app-shell'},h(AccountDemo))));
function SettingsDemo(){const[draft,setDraft]=React.useState({editorDuplicationUserIds:[],siteName:'KTGA.ME',siteSubtitle:'Test'});return h(CasinoSettings,{draft,setDraft,games:${JSON.stringify(fixtures)},users:[{id:'editor',displayName:'PreviewPlayer'}],onSubmit:event=>{event.preventDefault();window.settingsSaved=draft}})}
window.mountSettings=()=>root.render(h(LocaleProvider,{key:++sequence},h('main',{className:'app-shell'},h(SettingsDemo))));
function ModerationDemo(){const[draft,setDraft]=React.useState({id:'player',displayName:'PreviewPlayer',login:'player@example.test',moderation:{softBan:{active:true,reason:'Test',restrictions:null}}});window.moderationDraft=draft;return h(AdminAccountWorkspace,{draft,detail:{user:{login:'player@example.test'},security:{},inventory:{cosmetics:{equipped:{}}},statistics:{},history:[],tribunal:{behavior:{score:95,sanctions:1},reports:{total:2}}},currentUser:{id:'admin'},games:${JSON.stringify(fixtures)},settings:{softBanRestrictions:defaultSoftBanRestrictions},achievements:[],initialSection:'moderation',updateDraft:(key,value)=>setDraft(current=>({...current,[key]:value})),updateProfileStats:()=>{}})}
window.mountModeration=()=>root.render(h(LocaleProvider,{key:++sequence},h('main',{className:'app-shell'},h(ModerationDemo))));
function Demo({game,games}){const[draft,setDraft]=React.useState(game);window.draft=draft;return h(GameEditor,{game:draft,games,saving:false,onChange:(key,value)=>setDraft(current=>({...current,[key]:value})),onSave:()=>window.saved=structuredClone(draft),onClose:()=>{window.wasClosed=true;root.render(null)},onEditImage:()=>{}})}
window.mountGame=(game,games,locale='fr')=>{localStorage.setItem('ktga-locale',locale);window.saved=null;window.wasClosed=false;root.render(h(LocaleProvider,{key:++sequence},h(Demo,{game,games})))};window.ready=true;
</script></body></html>`;
try{
  for(let attempt=0;attempt<100;attempt++){try{if((await fetch(origin)).ok)break;}catch{}if(attempt===99)throw Error(output);await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({channel:"msedge",headless:true});const blocker=await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  for(const viewport of [{width:1440,height:900},{width:900,height:650},{width:390,height:844},{width:320,height:740}]){
    const context=await browser.newContext({viewport}),page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));await blocker.enableBlockingInPage(page);
    await page.route("**/__game-editor",route=>route.fulfill({contentType:"text/html",body:html}));await page.route("**/api/locales/**",route=>route.fulfill({contentType:"application/json",body:'{"messages":{}}'}));
    await page.route("**/api/me/data-requests",route=>route.fulfill({contentType:"application/json",body:'{"requests":[],"emailReady":true}'}));
    await page.goto(`${origin}/__game-editor`);await page.waitForFunction(()=>window.ready);
    const selected=viewport.width===1440?fixtures:fixtures.filter(game=>["texas-holdem","midnight-dice","blackjack"].includes(game.id));
    for(const game of selected){
      await page.evaluate(([game,games])=>window.mountGame(game,games),[game,fixtures]);const dialog=page.getByRole("dialog");await dialog.waitFor();
      assert.equal(await page.getByRole("tab").count(),5);const box=await dialog.boundingBox();assert.ok(box.width>Math.min(1000,viewport.width-64),JSON.stringify({box,viewport}));
      await page.getByLabel("Nom du jeu",{exact:true}).fill(`${game.name} test`);
      for(const section of ["Règles","Visuels","Économie","Publication","Présentation"]){await page.getByRole("tab",{name:section,exact:true}).click();assert.equal(await page.getByRole("tabpanel").count(),1);}
      assert.equal(await page.getByLabel("Nom du jeu",{exact:true}).inputValue(),`${game.name} test`);
      if(game.id==="texas-holdem"){
        await page.getByRole("tab",{name:"Économie",exact:true}).click();await page.getByLabel("Grosse blinde par défaut",{exact:true}).fill("101");await page.getByRole("tab",{name:"Présentation",exact:true}).click();await page.getByRole("button",{name:"Enregistrer",exact:true}).click();assert.equal(await page.evaluate(()=>window.saved),null);assert.equal(await page.getByRole("tab",{name:"Économie",exact:true}).getAttribute("aria-selected"),"true");await page.getByLabel("Grosse blinde par défaut",{exact:true}).fill("200");
      }
      if(game.id==="blackjack"){
        await page.getByRole("tab",{name:"Règles",exact:true}).click();await page.getByLabel("Mise minimale",{exact:true}).fill("200");await page.getByRole("tab",{name:"Publication",exact:true}).click();await page.getByRole("button",{name:"Enregistrer",exact:true}).click();assert.equal(await page.evaluate(()=>window.saved),null);await page.getByLabel("Mise maximale",{exact:true}).fill("300");
      }
      if(viewport.width<=700)await page.getByRole("button",{name:"Voir l’aperçu",exact:true}).click();
      const preview=page.getByRole("complementary",{name:"Aperçu du jeu",exact:true});assert.equal(await preview.isVisible(),true);
      for(const view of ["À l’affiche","Discord","Catalogue"]) {await preview.getByRole("button",{name:view,exact:true}).click();assert.equal(await preview.getByText(`${game.name} test`,{exact:true}).count(),1);}
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const actions=await page.getByRole("button",{name:"Enregistrer",exact:true}).boundingBox();assert.ok(actions.y>=0&&actions.y+actions.height<=viewport.height);
      if(game.id==="midnight-dice"){await page.waitForTimeout(200);await page.screenshot({path:path.join(directory,`${viewport.width}-preview.png`)});}
      if(viewport.width<=700)await page.getByRole("button",{name:"Revenir aux réglages",exact:true}).click();
      await page.getByRole("tab",{name:"Visuels",exact:true}).click();if(game.id==="midnight-dice"){await page.waitForTimeout(200);await page.screenshot({path:path.join(directory,`${viewport.width}-images.png`)});}
      await page.getByRole("button",{name:"Enregistrer",exact:true}).click();await page.waitForFunction(()=>window.saved);
      const saved=await page.evaluate(()=>window.saved);assert.equal(saved.name,`${game.name} test`);assert.equal(saved.coverImage,game.coverImage);assert.equal(saved.discordIconImage,game.discordIconImage);assert.equal(saved.position,game.position);
      if(game.id==="texas-holdem")assert.equal(saved.pokerDefaultBigBlind,200);else if(game.id!=="blackjack")assert.deepEqual(saved.defaultModifiers,game.defaultModifiers);
      checks.push({game:game.id,width:viewport.width});
    }
    const midnight=fixtures.find(game=>game.id==="midnight-dice");await page.evaluate(([game,games])=>window.mountGame(game,games),[midnight,fixtures]);await page.getByRole("dialog").waitFor();
    const bounds=await page.getByRole("dialog").boundingBox();await page.mouse.move(bounds.x+15,bounds.y+15);await page.mouse.down();await page.mouse.move(1,1,{steps:4});await page.mouse.up();assert.equal(await page.getByRole("dialog").count(),1);
    await page.getByRole("tab",{name:"Présentation",exact:true}).focus();await page.keyboard.press("ArrowRight");assert.equal(await page.getByRole("tab",{name:"Règles",exact:true}).getAttribute("aria-selected"),"true");
    await page.getByRole("button",{name:"Annuler",exact:true}).click();assert.equal(await page.evaluate(()=>window.wasClosed),true);
    await page.evaluate(([game,games])=>window.mountGame(game,games,'en'),[midnight,fixtures]);await page.getByRole("tab",{name:"Presentation",exact:true}).waitFor();await page.getByRole("tab",{name:"Visuals",exact:true}).click();assert.equal(await page.getByText("Discord icon",{exact:true}).isVisible(),true);
    await page.evaluate(([game,games])=>window.mountGame({...game,coverImage:'',descriptiveImage:'',discordIconImage:''},games),[midnight,fixtures]);await page.getByRole("tab",{name:"Visuels",exact:true}).click();assert.equal(await page.locator('.game-settings-media-empty').count(),3);
    if(viewport.width<=700)await page.getByRole("button",{name:"Voir l’aperçu",exact:true}).click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.evaluate(()=>window.mountCatalog());await page.locator('.catalog-workspace').waitFor();
    await page.locator('.catalog-visual .display-name-text').first().click();assert.equal(await page.evaluate(()=>window.profileOpens),0);assert.equal(await page.locator('.catalog-visual .display-name[role="button"]').count(),0);
    await page.locator('#outside-preview .display-name').click();assert.equal(await page.evaluate(()=>window.profileOpens),1);
    await page.getByRole('button',{name:'Packs',exact:true}).click();assert.equal(await page.locator('.catalog-visual .display-name[role="button"]').count(),0);
    await page.evaluate(()=>window.mountAccount());await page.getByRole('heading',{name:'Mon compte',exact:true}).waitFor();
    assert.equal(await page.locator('.account-workspace-form > :first-child').getAttribute('class'),'account-workspace-actions');
    await page.screenshot({path:path.join(directory,`${viewport.width}-profile-actions.png`)});
    await page.getByRole('button',{name:'Carte et confidentialité',exact:true}).click();assert.equal(await page.locator('form.account-workspace-form > :first-child').getAttribute('class'),'account-workspace-actions');
    await page.evaluate(()=>window.mountSettings());await page.getByRole('button',{name:'Édition',exact:true}).click();
    await page.getByLabel('Ajouter un utilisateur',{exact:true}).selectOption('editor');await page.getByRole('button',{name:'Ajouter',exact:true}).click();
    assert.equal(await page.locator('.editor-copy-list li').count(),1);await page.getByRole('button',{name:'Enregistrer',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.settingsSaved.editorDuplicationUserIds),['editor']);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(directory,`${viewport.width}-copy-settings.png`)});
    await page.getByRole('button',{name:'Retirer PreviewPlayer de la limitation',exact:true}).click();await page.getByRole('button',{name:'Enregistrer',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.settingsSaved.editorDuplicationUserIds),[]);
    await page.getByRole('button',{name:'Softbans',exact:true}).click();assert.equal(await page.locator('.account-limit-options fieldset').count(),5);
    await page.getByRole('checkbox',{name:'Acheter des objets et des packs',exact:true}).check();await page.getByRole('checkbox',{name:'Yahtzee',exact:true}).check();await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
    assert.ok((await page.evaluate(()=>window.settingsSaved.softBanRestrictions)).includes('game:yahtzee'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(directory,`${viewport.width}-softban-settings.png`)});
    await page.evaluate(()=>window.mountModeration());const inherit=page.getByRole('checkbox',{name:'Utiliser les restrictions générales',exact:false});await inherit.waitFor();assert.equal(await page.getByRole('checkbox',{name:'Acheter des objets et des packs',exact:true}).isDisabled(),true);
    await inherit.uncheck();await page.getByRole('checkbox',{name:'Acheter des objets et des packs',exact:true}).check();assert.ok((await page.evaluate(()=>window.moderationDraft.moderation.softBan.restrictions)).includes('shop'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(directory,`${viewport.width}-player-softban.png`)});await inherit.check();assert.equal(await page.evaluate(()=>window.moderationDraft.moderation.softBan.restrictions),null);
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:checks.length,directory}));
}finally{await browser?.close();if(child.exitCode===null){const exit=new Promise(resolve=>child.once("exit",resolve));child.kill();await exit;}}
