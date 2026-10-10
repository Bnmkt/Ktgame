import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const directory=path.resolve(process.argv[2]);
fs.mkdirSync(directory,{recursive:true});
const now=new Date('2026-10-09T18:00:00Z');
const rows=Array.from({length:90},(_,i)=>({at:new Date(+now-(89-i)*5000).toISOString(),cpuSystem:12+Math.sin(i/5)*7,cpuProcess:4,memoryRss:280*1048576+Math.sin(i/8)*10*1048576,memoryHeap:160*1048576,eventLoopP95:12+Math.abs(Math.sin(i/8))*6,eventLoopMax:i===40?100:20,requestsPerSecond:20+Math.sin(i/8)*15,workerQueued:0,readingWorkerQueued:i%12===0?2:0}));
const names=['Interface','Tables','Comptes','Transactions','Historique','Succès','Classements','Chat','Événements'];
const overview={schemaVersion:1,version:'0.2.1',generatedAt:now.toISOString(),viewer:{name:'Compte de démonstration',role:'editor'},connectedUsers:126,health:{status:'healthy',process:{memory:{rss:280*1048576},uptimeSeconds:42000},system:{cpuCount:2,cpuPercent:18,totalMemory:4*1073741824,freeMemory:2.1*1073741824},eventLoop:{p95Ms:18,maxMs:30},traffic:{requestsPerSecond:32},realtime:{playingRooms:14,waitingRooms:5,sockets:140},history:rows,services:Object.fromEntries(names.map((name,i)=>[i,{name,completed:1220+i*340,queued:0,processing:{p95Ms:2+i}}]))}};
const metrics={days:30,summary:{accounts:842,activeAccounts:816,games:1340,activePlayers:294},activity:{daily:Array.from({length:30},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,games:32+i%7*12,activePlayers:24+i%8*7,signups:i%9+2}))},games:['Belote',"Texas Hold’em",'Blackjack','Bataille','Président','Yahtzee','421','Cul de Chouette','Farkle',"Liar’s Dice",'Shut the Box','Golf Solitaire','Accordion','Dés de Minuit','Velvet Ruse'].map((name,i)=>({name,games:200-i*10,uniquePlayers:60-i*2,botRate:0.15})),achievements:{catalog:280,unlocked:1420},shop:{catalogItems:268,purchases:340},communityEvents:{summary:{actions:820,active:2}}};
const status={components:['Site web','API et comptes','Temps réel','Tables de jeu','Données','Emails'].map(name=>({name,status:'operational',uptime:99.92,days:Array.from({length:7},(_,i)=>({date:`2026-10-${i+3}`,status:i===3?'degraded':'operational'}))})),incidents:[],history:[{title:'Perturbation du service email',state:'completed',createdAt:'2026-10-08T08:00:00Z',message:'La connexion au fournisseur a été rétablie.',updates:[{state:'in_progress',createdAt:'2026-10-08T08:05:00Z',message:'Vérification de la connexion SMTP.'},{state:'completed',createdAt:'2026-10-08T08:20:00Z',message:'Le service fonctionne normalement.'}]}]};
fs.writeFileSync(path.join(directory,'preview.json'),JSON.stringify({overview,metrics,status}));
let revoked=false; const counts={};
const server=http.createServer(async(req,res)=>{
  let input='';for await(const chunk of req) input+=chunk;const body=input?JSON.parse(input):{};
  const route=req.url.split('?')[0];counts[route]=(counts[route]??0)+1;
  let code=200,data={};
  if(route==='/test/revoke') revoked=true;
  else if(route==='/test/counts') data=counts;
  else if(route==='/api/auth/login') {
    revoked=false;
    if(body.password!=='FixturePassword!') {code=401;data={error:'Identifiants incorrects.'};}
    else if(body.login==='admin@example.test') {code=202;data={mfaRequired:true,challengeId:'fixture-challenge',methods:['totp','email','recovery'],emailCodeSent:false};}
    else data={token:'fixture-session',user:{pseudo:'Éditeur de test',editor:body.login==='editor@example.test',admin:false}};
  } else if(route==='/api/auth/mfa/email') data={sent:true};
  else if(route==='/api/auth/mfa/verify') {
    if(body.challengeId!=='fixture-challenge'||body.login!=='admin@example.test'||body.code!=='123456') {code=400;data={error:'Code invalide.'};}
    else data={token:'fixture-admin-session',user:{pseudo:'Administrateur de test',admin:true}};
  } else if(route.startsWith('/api/desktop/')) {
    if(revoked||!['Bearer fixture-session','Bearer fixture-admin-session'].includes(req.headers.authorization)) {code=403;data={error:'Accès retiré.'};}
    else if(route.endsWith('overview')) data={...overview,viewer:{name:req.headers.authorization.includes('admin')?'Administrateur de test':'Éditeur de test',role:req.headers.authorization.includes('admin')?'admin':'editor'}};
    else if(route.endsWith('metrics')) data=metrics;
    else data=status;
  } else code=404;
  res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
});
server.listen(0,'127.0.0.1',()=>fs.writeFileSync(path.join(directory,'port.txt'),String(server.address().port)));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
