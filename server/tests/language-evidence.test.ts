import test from "node:test";
import assert from "node:assert/strict";
import {fallback,requireEvidence} from "../server/language";

test("Chinese numeral time can support model extraction",()=>{
  assert.equal(requireEvidence("晚上九点前要回家",{until:21}).until,21);
  assert.equal(requireEvidence("我还没说结束时间",{until:21}).until,undefined);
  assert.deepEqual(requireEvidence("晚上九点前要回家，火锅不太合适，烤肉可以",{until:10,food:"火锅"}),{until:21,vetoFood:"火锅"});
  assert.equal(fallback("我最晚21点要离开，聚餐最多100元").patch.until,21);
  assert.equal(fallback("第一场玩桌游，聚餐预算120元").patch.budgetPlay1,undefined);
  assert.deepEqual(requireEvidence("第一场玩桌游，聚餐预算120元",{budgetMeal:120,budgetPlay1:120}),{budgetMeal:120});
});
