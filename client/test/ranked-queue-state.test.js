import test from "node:test";
import assert from "node:assert/strict";
import { rankedPreparation } from "../src/features/games/ranked-queue-state.js";

const proposal={startsAfter:30000,expiresAt:90000,players:[{ready:true},{ready:true}]};
test("preparation never switches to a second countdown when all players are ready",()=> {
  assert.deepEqual(rankedPreparation(proposal,29000),{phase:"preparing",startsIn:1,expiresIn:61,remaining:0});
  assert.deepEqual(rankedPreparation(proposal,30000),{phase:"creating",startsIn:0,expiresIn:60,remaining:0});
  assert.equal(rankedPreparation(proposal,31000).phase,"creating");
});
test("missing confirmations and expired offers have distinct non-numeric transition states",()=> {
  const pending={...proposal,players:[{ready:true},{ready:false}]};
  assert.equal(rankedPreparation(pending,30000).phase,"confirming");
  assert.equal(rankedPreparation(pending,90000).phase,"expired");
  assert.equal(rankedPreparation(pending,10000).remaining,1);
});
