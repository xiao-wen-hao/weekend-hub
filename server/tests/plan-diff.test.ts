import test from "node:test";
import assert from "node:assert/strict";
import {describePlanChanges} from "../shared/plan-diff";
import type {Plan} from "../shared/domain";

test("plan revisions explain changed fields without revealing private preferences",()=>{
  const before:Plan={date:"2026-11-21",area:"城西",segments:[{id:"meal",kind:"meal",label:"吃饭",category:"火锅",start:12,end:13.5,budgetCap:100}],assumptions:[],provisional:true};
  const after:Plan={...before,segments:[{...before.segments[0],category:"烤肉",budgetCap:120}]};
  assert.deepEqual(describePlanChanges(before,after),["聚餐类别","聚餐预算"]);
  assert.deepEqual(describePlanChanges(after,after),[]);
});
