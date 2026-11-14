import test from "node:test";
import assert from "node:assert/strict";
import {fallback} from "../server/language";

test("private assistant extracts multiple conditions without reading budget as a clock",()=>{
  const result=fallback("周六下午想玩桌游，先吃饭再玩，吃饭 100 元以内，玩乐 80 元以内，晚上 9 点前回家");
  assert.equal(result.patch.play,"桌游");
  assert.equal(result.patch.order,"eat");
  assert.equal(result.patch.budgetMeal,100);
  assert.equal(result.patch.budgetPlay1,80);
  assert.equal(result.patch.until,21);
});

test("negation about lateness does not veto the named activity",()=>{
  const result=fallback("想去徒步，但不想玩太晚");
  assert.equal(result.patch.play,"徒步");
  assert.equal(result.patch.vetoPlay,undefined);
});
