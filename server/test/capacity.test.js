import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { assertTarget, isolatedEnvironment, STORE_KEYS, Histogram } from "../scripts/capacity/common.mjs";
import { actionFor, actorFor } from "../scripts/capacity/actions.mjs";
import { createGameState, applyAction } from "../src/games/engines.js";
import { games } from "../src/games/shared.js";

test("capacity harness rejects production/public targets and missing fixture markers",()=>{
  const manifest={runId:"capacity-abcdef123456"};
  assert.equal(assertTarget("http://127.0.0.1:4101",manifest),"http://127.0.0.1:4101");
  for(const url of ["https://api.ktga.me","https://www.ktga.me","http://127.0.0.1:4000","http://localhost:4101/private","http://user:pass@localhost:4101","http://localhost:4101/?x=1"])assert.throws(()=>assertTarget(url,manifest));
  assert.throws(()=>assertTarget("http://localhost:4101",{}));
});
test("every store is isolated and SMTP/TLS/env defaults cannot escape the fixture",()=>{
  const directory=path.join(os.tmpdir(),"ktga-capacity-test"),env=isolatedEnvironment(directory,4101,"capacity-abcdef123456","isolated-secret");
  for(const key of [...STORE_KEYS,"SQLITE_PATH","PATCHNOTES_UPLOAD_DIR","BUG_REPORT_UPLOAD_DIR","RANK_INSIGNIA_UPLOAD_DIR"])assert.ok(env[key].startsWith(directory+path.sep));
  for(const key of ["SMTP_HOST","SMTP_USER","SMTP_PASS","EMAIL_FROM","CLIENT_DIST","HTTPS_KEY_PATH","HTTPS_CERT_PATH","HTTPS_PFX_PATH"])assert.equal(env[key],"");
  assert.equal(env.NODE_ENV,"production");assert.equal(env.HOST,"127.0.0.1");
  assert.throws(()=>isolatedEnvironment(path.resolve("server/data"),4101,"test","secret"));
  assert.throws(()=>isolatedEnvironment(directory,4000,"test","secret"));
});
test("bounded histogram computes approximate percentiles",()=>{const h=new Histogram();for(const value of [1,10,20,100])h.add(value);assert.equal(h.summary().p50Ms,10);assert.equal(h.summary().p95Ms,100);});
for(const game of games){
  test(`capacity adapter sends valid moves: ${game.id}`,()=>{
    const players=Array.from({length:Math.max(1,game.minPlayers)},(_,i)=>({id:`p${i}`,pseudo:`Player${i}`,tokens:100000}));
    let state=createGameState(game.id,players,{stake:1000,pokerBlinds:{smallBlind:10,bigBlind:20,maximumBet:1000}});
    let actions=0;
    for(let step=0;step<40 && !state.finished;step++){
      const id=actorFor(state),action=actionFor(state,id);
      if(!action)break;
      state=applyAction(state,id,action);actions++;
    }
    assert.ok(actions>0);
  });
}
