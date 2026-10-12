import assert from "node:assert/strict";
import test from "node:test";
import { rankedCompletion } from "../src/features/games/ranked-completion.js";
test("rank recap distinguishes gains, promotions, demotions and placements", () => {
  const result={before:1090,after:1110,delta:20,beforeRank:{order:11},afterRank:{order:12},beforeProgression:{progress:90},progression:{progress:10}};
  assert.deepEqual(rankedCompletion(result),{direction:"promotion",changed:true,start:90,end:10,boundary:100,ranked:true,rank:result.afterRank});
  assert.equal(rankedCompletion({...result,beforeRank:{order:12},afterRank:{order:11},delta:-20}).direction,"demotion");
  assert.equal(rankedCompletion({...result,beforeRank:{order:12}}).direction,"gain");
  assert.equal(rankedCompletion({...result,beforeRank:{order:12},delta:-5}).direction,"loss");
  assert.equal(rankedCompletion({...result,cancelled:true}).direction,"unchanged");
  assert.equal(rankedCompletion({...result,beforeRank:{id:"unranked"},placement:{completed:true,required:5,games:5}}).direction,"reveal");
  const placing=rankedCompletion({...result,placement:{completed:false,required:5,games:2}});
  assert.equal(placing.direction,"placement");assert.equal(placing.start,20);assert.equal(placing.end,40);assert.equal(placing.ranked,false);
  assert.equal(rankedCompletion(null),null);
});
