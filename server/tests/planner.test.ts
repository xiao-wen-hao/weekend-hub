import test from "node:test";
import assert from "node:assert/strict";
import { initialPlan, negotiatePlan, nextQuestion, validatePreferencePatch } from "../shared/planner";
import type { Brief, MemberPreference } from "../shared/domain";

const brief:Brief={title:"周六白天局",date:"2026-11-14",timeWindow:"morning",area:"学校附近",food:"火锅",play:"桌游",secondPlay:null,rounds:1,order:"either",after:false,budget:{meal:120,play1:80,play2:null,after:null},note:""};

test("上午聚会立即给出白天草案和分项预算",()=>{
  const plan=initialPlan(brief);
  assert.equal(plan.segments[0].start,10);
  assert.equal(plan.segments[0].category,"桌游");
  assert.equal(plan.segments[0].budgetCap,80);
  assert.equal(plan.segments[1].category,"火锅");
  assert.equal(plan.segments[1].budgetCap,120);
  assert.ok(plan.assumptions.some(x=>x.includes("确认")));
});

test("两场玩乐各有预算，第二场玩法可待商量",()=>{
  const members:MemberPreference[]=[{userId:"a",name:"A",preference:{rounds:2,budgetPlay2:50}},{userId:"b",name:"B",preference:{rounds:2,budgetMeal:100}}];
  const plan=negotiatePlan(brief,members);
  assert.ok(plan);
  assert.equal(plan.segments.filter(s=>s.kind==="play").length,2);
  assert.equal(plan.segments.find(s=>s.id==="play2")?.budgetCap,50);
  assert.equal(plan.segments.find(s=>s.kind==="meal")?.budgetCap,100);
  assert.equal(plan.segments.find(s=>s.id==="play2")?.category,"玩法待商量");
});

test("时间冲突时不伪造可行方案",()=>{
  const members:MemberPreference[]=[{userId:"a",name:"A",preference:{from:19,until:20}},{userId:"b",name:"B",preference:{from:9,until:12}}];
  assert.equal(negotiatePlan(brief,members),null);
});

test("14 点一场徒步后可安排 16:30 用餐，不凭空增加第二场",()=>{
  const plan=negotiatePlan({...brief,rounds:1,order:"either"},[{userId:"a",name:"A",preference:{}},{userId:"b",name:"B",preference:{}}],{start:14,order:"play",rounds:1});
  assert.ok(plan);
  assert.deepEqual(plan.segments.map(s=>s.id),["play1","meal"]);
  assert.equal(plan.segments[0].start,14);
  assert.equal(plan.segments[1].start,16.5);
});

test("追问跟随当前草案，不预设晚上",()=>{
  const q=nextQuestion(initialPlan(brief),{});
  assert.match(q?.prompt??"",/10:00/);
  assert.ok(q?.options.some(o=>o.label.includes("具体时间")));
});

test("拒绝模型输出的越界类别和预算",()=>{
  assert.deepEqual(validatePreferencePatch({food:"不存在的餐厅",budgetMeal:5,play:"桌游",until:21.5}),{until:21.5,play:"桌游"});
});
