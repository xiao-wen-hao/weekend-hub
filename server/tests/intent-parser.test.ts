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
