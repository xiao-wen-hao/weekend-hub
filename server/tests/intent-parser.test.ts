import test from "node:test";
import assert from "node:assert/strict";
import {fallbackIntent,validateIntentOutput} from "../server/intent-parser";

test("explicit Chinese intent keeps evidence",()=>{
  const value=fallbackIntent("周六下午想玩桌游");
  assert.equal(value.category,"桌游");assert.equal(value.windowId,"afternoon");assert.equal(value.evidence.time,"下午");
});
test("model field without verbatim evidence is discarded",()=>{
  const value=validateIntentOutput("周末想聚聚",{category:"桌游",windowId:"evening",evidence:{category:"桌游",time:"晚上"}});
  assert.equal(value.category,null);assert.equal(value.windowId,null);
});
test("time evidence must agree with the extracted window",()=>{
  const value=validateIntentOutput("周六下午玩桌游",{category:"桌游",windowId:"evening",evidence:{category:"桌游",time:"下午"}});
  assert.equal(value.category,"桌游");assert.equal(value.windowId,null);
});
test('hiking expressions share one category without inventing a time',()=>{
  const climb=fallbackIntent('周末想去爬山，预算100元以内');
  const walk=fallbackIntent('想约大家郊外徒步');
  assert.equal(climb.category,'徒步');assert.equal(walk.category,'徒步');
  assert.equal(climb.windowId,null);assert.equal(climb.budgetCap,100);
  assert.equal(validateIntentOutput('周末想去爬山',{category:'徒步',windowId:null,evidence:{category:'爬山',time:null}}).category,'徒步');
});
test('negative activity evidence is not treated as a positive wish',()=>{
  assert.equal(fallbackIntent('周末不想去爬山').category,null);
  assert.equal(validateIntentOutput('周末不想去爬山',{category:'徒步',evidence:{category:'爬山'}}).category,null);
});
