import { db, getRoom, now, uid } from "./db";
import { FOODS, PLAYS, formatTime, mealOf, playOf } from "../shared/domain";
import type { Brief, MemberPreference, Plan, PlanLocks, Preference } from "../shared/domain";
import { negotiatePlan } from "../shared/planner";

type PollOption={id:string;label:string;value:string|number};
type PollRow={id:string;room_id:string;proposal_id:string|null;facet:string;question:string;options_json:string;status:string;created_at:string};
const timers=new Map<string,NodeJS.Timeout>();
const planSignature=(plan:Plan)=>JSON.stringify({area:plan.area,segments:plan.segments.map(s=>({kind:s.kind,category:s.category,start:s.start,end:s.end,budgetCap:s.budgetCap}))});

export function getMembers(roomId:string):MemberPreference[]{
  const rows=db.prepare("SELECT m.user_id AS userId,u.display_name AS name,p.data_json AS dataJson FROM members m JOIN users u ON u.id=m.user_id JOIN preferences p ON p.room_id=m.room_id AND p.user_id=m.user_id WHERE m.room_id=? ORDER BY m.joined_at").all(roomId) as {userId:string;name:string;dataJson:string}[];
  return rows.map(r=>({userId:r.userId,name:r.name,preference:JSON.parse(r.dataJson) as Preference}));
}
export function currentPlan(roomId:string):{id:string;version:number;plan:Plan;kind:string}|null{
  const row=db.prepare("SELECT p.id,p.version,p.plan_json AS planJson,p.kind FROM rooms r JOIN proposals p ON p.id=r.current_proposal_id WHERE r.id=?").get(roomId) as {id:string;version:number;planJson:string;kind:string}|undefined;
  return row?{id:row.id,version:row.version,plan:JSON.parse(row.planJson) as Plan,kind:row.kind}:null;
}
export function activePoll(roomId:string):PollRow|null{
  return db.prepare("SELECT * FROM polls WHERE room_id=? AND status='open' ORDER BY created_at DESC LIMIT 1").get(roomId) as PollRow|undefined??null;
}
export function emitEvent(roomId:string,type:string,text:string){db.prepare("INSERT INTO room_events(id,room_id,event_type,public_text,created_at) VALUES(?,?,?,?,?)").run(uid(),roomId,type,text,now());}
export function scheduleRoom(roomId:string,delay=450){
  const old=timers.get(roomId);if(old)clearTimeout(old);
  timers.set(roomId,setTimeout(()=>{timers.delete(roomId);try{coordinateRoom(roomId);}catch(error){console.error("Coordination failed",error);}},delay));
}
export function coordinateRoom(roomId:string){
  const room=getRoom(roomId);if(!room||activePoll(roomId))return;
  const brief=JSON.parse(room.brief_json) as Brief,locks=JSON.parse(room.locks_json) as PlanLocks;
  const members=getMembers(roomId);
  const candidate=negotiatePlan(brief,members,locks);
  const current=currentPlan(roomId);
  if(!candidate){
    db.prepare("UPDATE rooms SET phase='blocked',updated_at=? WHERE id=? AND revision=?").run(now(),roomId,room.revision);
    if(room.phase!=="blocked")emitEvent(roomId,"blocked","目前还没有满足已知时间条件的全员安排，主持人正在私下寻找可调整的部分。");
    return;
  }
  if(current&&planSignature(current.plan)===planSignature(candidate)){
    if(room.phase==="blocked")db.prepare("UPDATE rooms SET phase='discussing',updated_at=? WHERE id=?").run(now(),roomId);
    maybeAutoPoll(roomId,brief,members,locks,candidate);
    return;
  }
  const version=(current?.version??0)+1,proposalId=uid(),stamp=now();
  const updated=db.transaction(()=>{
    const result=db.prepare("UPDATE rooms SET current_proposal_id=?,phase='discussing',updated_at=? WHERE id=? AND revision=?").run(proposalId,stamp,roomId,room.revision);
    if(!result.changes)return false;
    db.prepare("INSERT INTO proposals(id,room_id,version,plan_json,kind,created_at) VALUES(?,?,?,?,?,?)").run(proposalId,roomId,version,JSON.stringify(candidate),"candidate",stamp);
    emitEvent(roomId,"proposal",`主持人更新了第 ${version} 版讨论方案。请查看时间、活动和每项预算，再决定是否接受。`);
    return true;
  })();
  if(updated)maybeAutoPoll(roomId,brief,members,locks,candidate);
  else scheduleRoom(roomId,100);
}

function maybeAutoPoll(roomId:string,brief:Brief,members:MemberPreference[],locks:PlanLocks,plan:Plan){
  if(members.length<3||activePoll(roomId))return;
  const foodVotes=[...new Set(members.map(m=>m.preference.food).filter((v):v is string=>!!v&&v!=="any"))];
  const playVotes=[...new Set(members.map(m=>m.preference.play).filter((v):v is string=>!!v&&v!=="any"))];
  if(!locks.food&&foodVotes.length>=2){createPoll(roomId,"food",[brief.food,...foodVotes].filter((v,i,a)=>a.indexOf(v)===i).slice(0,3).map(v=>({id:v,label:v,value:v})),`吃什么还没有一致意见，投一票决定聚餐类别？`,"auto");return;}
  if(!locks.play&&playVotes.length>=2){createPoll(roomId,"play",[brief.play,...playVotes].filter((v,i,a)=>a.indexOf(v)===i).slice(0,3).map(v=>({id:v,label:v,value:v})),`第一场玩什么更合适？`,"auto");return;}
  void plan;
}

export function pollOptions(facet:string,plan:Plan,brief:Brief,members:MemberPreference[]):{question:string;options:PollOption[]} {
  const meal=mealOf(plan),play=playOf(plan),start=plan.segments[0].start;
  if(facet==="food")return {question:"这次聚餐吃什么？",options:[brief.food,...members.map(m=>m.preference.food).filter((v):v is string=>!!v&&v!=="any"),...FOODS].filter((v,i,a)=>a.indexOf(v)===i).slice(0,4).map(v=>({id:v,label:v,value:v}))};
  if(facet==="play")return {question:"第一场玩什么？",options:[brief.play,...members.map(m=>m.preference.play).filter((v):v is string=>!!v&&v!=="any"),...PLAYS].filter((v,i,a)=>a.indexOf(v)===i).slice(0,4).map(v=>({id:v,label:v,value:v}))};
  if(facet==="time")return {question:"几点开始最方便？",options:[Math.max(9,start-1),start,Math.min(21,start+1)].filter((v,i,a)=>a.indexOf(v)===i).map(v=>({id:String(v),label:formatTime(v),value:v}))};
  if(facet==="order")return {question:"先吃再玩，还是先玩再吃？",options:[{id:"eat",label:"先吃再玩",value:"eat"},{id:"play",label:"先玩再吃",value:"play"}]};
  if(facet==="rounds")return {question:"这次玩几场？",options:[{id:"1",label:"一场刚好",value:1},{id:"2",label:"想玩两场",value:2}]};
  if(facet==="area"){
    const areas=[brief.area,...members.map(m=>m.preference.area).filter((v):v is string=>!!v&&v!=="any")].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).slice(0,3);
    if(areas.length<2)areas.push("区域待定");
    return {question:"大致在哪片区域活动？",options:areas.map(v=>({id:v,label:v,value:v}))};
  }
  const moneyFacet=facet==="budgetMeal"?meal:facet==="budgetPlay1"?play:facet==="budgetPlay2"?plan.segments.find(s=>s.id==="play2"):plan.segments.find(s=>s.id==="after");
  const base=moneyFacet?.budgetCap??100;
  const low=Math.max(20,base-50),high=base+50;
  return {question:`${moneyFacet?.label??"这项活动"}的人均预算上限定多少？`,options:[low,base,high].filter((v,i,a)=>a.indexOf(v)===i).map(v=>({id:String(v),label:`¥${v}`,value:v}))};
}

export function createPoll(roomId:string,facet:string,options:PollOption[],question:string,source:"auto"|"manual"){
  if(activePoll(roomId))return null;
  const pollId=uid(),proposal=currentPlan(roomId);
  db.prepare("INSERT INTO polls(id,room_id,proposal_id,facet,question,options_json,status,created_at) VALUES(?,?,?,?,?,?,'open',?)").run(pollId,roomId,proposal?.id??null,facet,question,JSON.stringify(options),now());
  emitEvent(roomId,"poll",source==="auto"?"大家的想法出现分歧，主持人发起了一轮匿名投票。":"发起人发起了一轮匿名投票。");
  return pollId;
}

export function vote(pollId:string,userId:string,optionId:string){
  const row=db.prepare("SELECT * FROM polls WHERE id=? AND status='open'").get(pollId) as PollRow|undefined;
  if(!row)return false;
  const options=JSON.parse(row.options_json) as PollOption[];
  if(!options.some(o=>o.id===optionId))return false;
  db.prepare("INSERT INTO poll_votes(poll_id,user_id,option_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(poll_id,user_id) DO UPDATE SET option_id=excluded.option_id,updated_at=excluded.updated_at").run(pollId,userId,optionId,now());
  const n=(db.prepare("SELECT COUNT(*) AS n FROM poll_votes WHERE poll_id=?").get(pollId) as {n:number}).n;
  const total=(db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").get(row.room_id) as {n:number}).n;
  if(n>=total)closePoll(row.room_id,pollId);
  return true;
}

export function closePoll(roomId:string,pollId:string){
  const row=db.prepare("SELECT * FROM polls WHERE id=? AND room_id=? AND status='open'").get(pollId,roomId) as PollRow|undefined;
  if(!row)return false;
  const votes=db.prepare("SELECT option_id,COUNT(*) AS n FROM poll_votes WHERE poll_id=? GROUP BY option_id ORDER BY n DESC").all(pollId) as {option_id:string;n:number}[];
  if(!votes.length)return false;
  const options=JSON.parse(row.options_json) as PollOption[];
  const current=currentPlan(roomId);
  const preferred=row.facet==="food"?mealOf(current!.plan)?.category:row.facet==="play"?playOf(current!.plan)?.category:null;
  const max=votes[0].n;
  const winnerId=votes.filter(v=>v.n===max).sort((a,b)=>Number(b.option_id===preferred)-Number(a.option_id===preferred))[0].option_id;
  const winner=options.find(o=>o.id===winnerId)!;
  const room=getRoom(roomId)!;
  const locks=JSON.parse(room.locks_json) as Record<string,unknown>;
  const key=row.facet==="time"?"start":row.facet;
  locks[key]=winner.value;
  db.transaction(()=>{
    db.prepare("UPDATE polls SET status='closed',closed_at=? WHERE id=?").run(now(),pollId);
    db.prepare("UPDATE rooms SET locks_json=?,revision=revision+1,phase='discussing',updated_at=? WHERE id=?").run(JSON.stringify(locks),now(),roomId);
    emitEvent(roomId,"poll_result",`匿名投票结束：「${winner.label}」获得最多支持，主持人正在检查新安排。`);
  })();
  scheduleRoom(roomId,50);
  return true;
}
