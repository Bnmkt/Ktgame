import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import {spawn} from "node:child_process";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import bcrypt from "bcryptjs";
import {encryptTotpSecret,totpCode} from "../src/services/account-security.js";

test("real desktop authentication keeps administrator MFA and player/editor permission boundaries", async () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ktga-desktop-api-"));
  const secret="isolated-desktop-api-secret-for-tests-only",totp="JBSWY3DPEHPK3PXP",password="FixturePassword1!";
  const db=new DatabaseSync(path.join(directory,"main.sqlite"));
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
  for(const id of ["player","editor","admin"]) {
    const user={id,pseudo:id,email:`${id}@example.test`,active:true,admin:id==="admin",editor:id==="editor",tokens:1000,passwordHash:bcrypt.hashSync(password,4),passwordPolicyVersion:1,emailVerifiedAt:new Date().toISOString(),profile:{birthDate:"1990-01-01"},createdAt:new Date().toISOString(),...(id==="admin"?{mfa:{totpSecret:encryptTotpSecret(totp,secret)}}:{})};
    db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(id,JSON.stringify(user),id,user.email);
  }
  db.close();
  const listener=net.createServer();await new Promise(resolve=>listener.listen(0,"127.0.0.1",resolve)); const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const url=`http://127.0.0.1:${port}`;let output="";
  const server=spawn(process.execPath,["src/index.js"],{cwd:new URL("../",import.meta.url),windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,NODE_ENV:"production",PORT:String(port),HOST:"127.0.0.1",TLS_TERMINATION:"proxy",TRUST_PROXY:"loopback",APP_BASE_PATH:"",JWT_SECRET:secret,CLIENT_DIST:"",CLIENT_ORIGIN:"https://www.ktga.me",PUBLIC_APP_URL:"https://www.ktga.me",CONTACT_EMAIL:"contact@example.test",HTTPS_KEY_PATH:"",HTTPS_CERT_PATH:"",HTTPS_PFX_PATH:"",SMTP_HOST:"",SMTP_USER:"",SMTP_PASS:"",EMAIL_FROM:"",SQLITE_PATH:path.join(directory,"main.sqlite"),PATCHNOTES_UPLOAD_DIR:path.join(directory,"images"),BUG_REPORT_UPLOAD_DIR:path.join(directory,"bugs"),...Object.fromEntries(["PARENTAL_DB_PATH","TRIBUNAL_DB_PATH","CHAT_DB_PATH","STATUS_DB_PATH","REQUEST_LOG_PATH","HELP_DB_PATH","DATA_REQUEST_DB_PATH","BUG_REPORT_DB_PATH","PATCHNOTES_DB_PATH","CONTACT_NOTICE_DB_PATH"].map(key=>[key,path.join(directory,`${key}.sqlite`)]))}});
  server.stdout.on("data",chunk=>output+=chunk);server.stderr.on("data",chunk=>output+=chunk);
  const request=async(route,method="GET",body,token)=>{
    const result=await fetch(url+route,{method,headers:{Origin:"https://www.ktga.me","User-Agent":"KTGAConsole/0.1.0","Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:result.status,data:result.headers.get("content-type")?.includes("json")?await result.json():await result.text(),headers:result.headers};
  };
  try {
    let ready=false;
    for(let i=0;i<150;i++){try{if((await fetch(url+"/api/health")).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(ready,output.slice(-1000));
    const editor=await request("/api/auth/login","POST",{login:"editor@example.test",password});assert.equal(editor.status,200);
    const player=await request("/api/auth/login","POST",{login:"player@example.test",password});assert.equal(player.status,200);
    const challenge=await request("/api/auth/login","POST",{login:"admin@example.test",password});assert.equal(challenge.status,202);assert.deepEqual(challenge.data.methods,["totp"]);assert.equal(challenge.data.token,undefined);
    const body={challengeId:challenge.data.challengeId,login:"admin@example.test",method:"totp",code:"invalid"};
    assert.equal((await request("/api/auth/mfa/verify","POST",body)).status,401);
    body.code=totpCode(totp);const admin=await request("/api/auth/mfa/verify","POST",body);assert.equal(admin.status,200);
    for(const route of ["/api/desktop/overview","/api/desktop/metrics?days=90","/api/desktop/status?days=7"]) {
      assert.equal((await request(route)).status,401);assert.equal((await request(route,"GET",null,player.data.token)).status,403);
      for(const token of [editor.data.token,admin.data.token]) {const result=await request(route,"GET",null,token);assert.equal(result.status,200);assert.equal(result.headers.get("cache-control"),"no-store");assert.ok(!JSON.stringify(result.data).includes(secret));assert.ok(!JSON.stringify(result.data).includes("@example.test"));if(route.endsWith("overview"))assert.equal(typeof result.data.connectedUsers,"number");}
    }
    assert.equal((await request("/api/admin/health","GET",null,editor.data.token)).status,403);
    assert.equal((await request("/api/desktop/overview","POST",{},admin.data.token)).status,404);
  } finally {
    if(server.exitCode===null){const ended=new Promise(resolve=>server.once("exit",resolve));server.kill();await ended;}
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith("ktga-desktop-api-"));fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
