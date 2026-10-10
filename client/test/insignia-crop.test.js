import test from "node:test";
import assert from "node:assert/strict";
import { insigniaCropBounds } from "../src/features/games/insignia-crop.js";

test("insignia crop keeps a centered square without distorting wide or tall images", () => {
  assert.deepEqual(insigniaCropBounds(800,400),{zoom:1,x:0.5,y:0.5,side:400,left:200,top:0});
  assert.deepEqual(insigniaCropBounds(400,800),{zoom:1,x:0.5,y:0.5,side:400,left:0,top:200});
  assert.deepEqual(insigniaCropBounds(512,512),{zoom:1,x:0.5,y:0.5,side:512,left:0,top:0});
});
test("zoom and movement allow transparent margins within bounded coordinates", () => {
  for (const [width,height] of [[800,400],[400,800],[512,512]]) {
    for (const zoom of [0,1,2,5,999,NaN]) for (const x of [-10,0,0.5,1,10,NaN]) for (const y of [-10,0,0.5,1,10,NaN]) {
      const crop=insigniaCropBounds(width,height,{zoom,x,y});
      assert.ok(crop.zoom>=0.25 && crop.zoom<=5);
      assert.ok(crop.x>=-crop.side/(2*width) && crop.x<=1+crop.side/(2*width));
      assert.ok(crop.y>=-crop.side/(2*height) && crop.y<=1+crop.side/(2*height));
    }
  }
  assert.throws(()=>insigniaCropBounds(0,100));
  assert.throws(()=>insigniaCropBounds(Infinity,100));
});

test("an existing square insignia can move at default zoom and shrink with transparent margins", () => {
  assert.ok(Math.abs(insigniaCropBounds(512,512,{x:0.6}).left-51.2)<0.000001);
  assert.deepEqual(insigniaCropBounds(512,512,{zoom:0.5}),{zoom:0.5,x:0.5,y:0.5,side:1024,left:-256,top:-256});
});
