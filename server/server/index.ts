import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { createServer as createViteServer } from "vite";
import { db, getRoom, getUser, isMember, now, uid } from "./db";
import { clearSession, createSession, currentUser, register, verify } from "./auth";
import { activePoll, closePoll, createPoll, currentPlan, emitEvent, getMembers, pollOptions, recoverPendingCoordination, scheduleRoom, vote } from "./coordinator";
import { initialPlan, nextQuestion, conflictQuestion, validatePreferencePatch, finalizationMissing } from "../shared/planner";
import type { Brief, Plan, PlanLocks, Preference, Question } from "../shared/domain";
import { FOODS, PLAYS, START_WINDOWS } from "../shared/domain";
import { interpret } from "./language";
import community from "./community";
import management from "./management";
import notification,{enqueueNotification} from "./notification";

const app=express();
app.set("trust proxy",1);
app.disable("x-powered-by");
app.use(express.json({limit:"20kb"}));
const mobileOrigins=new Set(["http://localhost","https://localhost","capacitor://localhost",...(process.env.CLIENT_ORIGINS??"").split(",").map(x=>x.trim()).filter(Boolean)]);
app.use((req,res,next)=>{
  const origin=req.headers.origin;
  if(origin&&mobileOrigins.has(origin)){
    res.setHeader("Access-Control-Allow-Origin",origin);
    res.setHeader("Vary","Origin");
    res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization, X-Client-Platform");
    res.setHeader("Access-Control-Allow-Methods","GET, POST, PATCH, PUT, DELETE, OPTIONS");
  }
  if(req.method==="OPTIONS")return res.sendStatus(origin&&mobileOrigins.has(origin)?204:403);
  if(["POST","PUT","PATCH","DELETE"].includes(req.method)&&origin&&!mobileOrigins.has(origin)&&new URL(origin).host!==req.headers.host)return res.status(403).json({error:"跨站请求已拒绝"});
  next();
});
const fail=(res:express.Response,message:string,status=400)=>res.status(status).json({error:message});
const userOrFail=(req:express.Request,res:express.Response)=>{const user=currentUser(req);if(!user)fail(res,"请先登录",401);return user;};
const roomMember=(req:express.Request,res:express.Response)=>{const user=userOrFail(req,res);if(!user)return null;const room=getRoom(String(req.params.id));if(!room){fail(res,"讨论间不存在",404);return null;}if(!isMember(room.id,user.id)){fail(res,"请先加入讨论间",403);return null;}return {user,room};};

function validateBrief(raw:unknown):Brief|null{
  if(!raw||typeof raw!=="object")return null;
  const x=raw as Record<string,unknown>;
  const title=String(x.title??"").trim().slice(0,60),date=String(x.date??"");
  if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const timeWindow=START_WINDOWS.find(w=>w.id===x.timeWindow)?.id??"unsure";
  const food=FOODS.includes(x.food as typeof FOODS[number])?String(x.food):"火锅";
  const play=PLAYS.includes(x.play as typeof PLAYS[number])?String(x.play):"桌游";
  const secondPlay=PLAYS.includes(x.secondPlay as typeof PLAYS[number])?String(x.secondPlay):null;
  const budgetRaw=x.budget&&typeof x.budget==="object"?x.budget as Record<string,unknown>:{};
  const amount=(key:string)=>{const v=Number(budgetRaw[key]);return Number.isFinite(v)&&v>=20&&v<=5000?v:null;};
  return {title,date,timeWindow,food,play,secondPlay,rounds:x.rounds===2?2:1,
    order:["eat","play","either"].includes(String(x.order))?x.order as Brief["order"]:"either",
    area:String(x.area??"").trim().slice(0,50),after:x.after===true,
    budget:{meal:amount("meal"),play1:amount("play1"),play2:amount("play2"),after:amount("after")},note:String(x.note??"").trim().slice(0,300)};
}

function publicRoom(roomId:string,userId:string){
  const room=getRoom(roomId)!;
  const brief=JSON.parse(room.brief_json) as Brief;
  const members=getMembers(roomId);
  const proposal=currentPlan(roomId);
  const poll=activePoll(roomId);
  const pollVotes=poll?db.prepare("SELECT option_id,COUNT(*) AS n FROM poll_votes WHERE poll_id=? GROUP BY option_id").all(poll.id) as {option_id:string;n:number}[]:[];
  const myVote=poll?(db.prepare("SELECT option_id FROM poll_votes WHERE poll_id=? AND user_id=?").get(poll.id,userId) as {option_id:string}|undefined)?.option_id??null:null;
  const own=members.find(m=>m.userId===userId)!.preference;
  const targeted=conflictQuestion(room.phase==="blocked"?null:proposal?.plan??null,members);
  const question=room.phase==="blocked"&&targeted?.userId===userId?targeted.question:proposal?nextQuestion(proposal.plan,own):null;
  const messages=db.prepare("SELECT id,role,body,created_at AS createdAt FROM messages WHERE room_id=? AND user_id=? ORDER BY created_at,id LIMIT 120").all(roomId,userId);
  const events=db.prepare("SELECT id,event_type AS type,public_text AS text,created_at AS createdAt FROM room_events WHERE room_id=? ORDER BY created_at DESC LIMIT 15").all(roomId).reverse();
  const confirmations=proposal?db.prepare("SELECT user_id,decision FROM confirmations WHERE proposal_id=?").all(proposal.id) as {user_id:string;decision:string}[]:[];
  const attendance=proposal?db.prepare("SELECT a.segment_id AS segmentId,a.user_id AS userId,u.display_name AS name,a.decision FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.proposal_id=?").all(proposal.id):[];
  return {joined:true,room:{id:room.id,title:room.title,date:room.date,phase:room.phase,hostId:room.created_by,revision:room.revision,coordinationPending:!!room.coordination_pending},brief,
    members:members.map(m=>({id:m.userId,name:m.name,hasAnswered:Object.keys(m.preference).length>0})),
    me:{id:userId,preference:own},messages,events,question,
    proposal:proposal&&room.phase!=="blocked"?{...proposal,confirmed:confirmations.filter(c=>c.decision==="accept").length,myDecision:confirmations.find(c=>c.user_id===userId)?.decision??null,attendance,pendingFinal:finalizationMissing(proposal.plan)}:null,
    poll:poll?{id:poll.id,facet:poll.facet,question:poll.question,options:(JSON.parse(poll.options_json) as {id:string;label:string;value:string|number}[]).map(o=>({...o,votes:pollVotes.find(v=>v.option_id===o.id)?.n??0})),myVote}:null};
}

app.get("/api/health",(_req,res)=>res.json({ok:true}));
app.use("/api",community);
app.use("/api",management);
app.use("/api",notification);
app.get("/api/me",(req,res)=>{const user=currentUser(req);res.json({user:user?{id:user.id,username:user.username,name:user.display_name}:null});});
app.post("/api/register",(req,res)=>{
  const username=String(req.body.username??"").trim().toLowerCase(),name=String(req.body.name??"").trim(),password=String(req.body.password??"");
  if(!/^[a-z0-9_]{3,24}$/.test(username)||name.length<1||name.length>30||password.length<8||password.length>128)return fail(res,"用户名需 3–24 位字母/数字/下划线，昵称 1–30 字，密码至少 8 位");
  if(db.prepare("SELECT 1 FROM users WHERE username=?").get(username))return fail(res,"用户名已被使用",409);
  const id=register(username,name,password),token=createSession(req,res,id);res.status(201).json({user:{id,username,name},...(["android","wechat"].includes(String(req.headers["x-client-platform"]))?{accessToken:token}:{})});
});
app.post("/api/login",(req,res)=>{
  const id=verify(String(req.body.username??""),String(req.body.password??""));if(!id)return fail(res,"用户名或密码不正确",401);
  const token=createSession(req,res,id),user=getUser(id)!;res.json({user:{id:user.id,username:user.username,name:user.display_name},...(["android","wechat"].includes(String(req.headers["x-client-platform"]))?{accessToken:token}:{})});
});
app.post("/api/logout",(req,res)=>{clearSession(req,res);res.json({ok:true});});
app.get("/api/rooms",(req,res)=>{
  const user=userOrFail(req,res);if(!user)return;
  const rows=db.prepare("SELECT r.id,r.title,r.date,r.phase,r.updated_at AS updatedAt,(SELECT COUNT(*) FROM members m2 WHERE m2.room_id=r.id) AS memberCount FROM rooms r JOIN members m ON m.room_id=r.id WHERE m.user_id=? ORDER BY r.updated_at DESC").all(user.id);
  res.json({rooms:rows});
});
app.post("/api/rooms",(req,res)=>{
  const user=userOrFail(req,res);if(!user)return;
  const brief=validateBrief(req.body);if(!brief)return fail(res,"请填写聚会名称和日期");
  const count=(db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE created_by=?").get(user.id) as {n:number}).n;
  if(count>=30)return fail(res,"账号的讨论间数量已达上限",429);
  const roomId=uid(),proposalId=uid(),stamp=now(),plan=initialPlan(brief);
  db.transaction(()=>{
    db.prepare("INSERT INTO rooms(id,title,date,brief_json,phase,current_proposal_id,revision,locks_json,created_by,created_at,updated_at) VALUES(?,?,?,?,'draft',?,0,'{}',?,?,?)").run(roomId,brief.title,brief.date,JSON.stringify(brief),proposalId,user.id,stamp,stamp);
    db.prepare("INSERT INTO members(room_id,user_id,joined_at) VALUES(?,?,?)").run(roomId,user.id,stamp);
    db.prepare("INSERT INTO preferences(room_id,user_id,data_json,updated_at) VALUES(?,?,'{}',?)").run(roomId,user.id,stamp);
    db.prepare("INSERT INTO proposals(id,room_id,version,plan_json,kind,created_at) VALUES(?,?,1,?,'initial',?)").run(proposalId,roomId,JSON.stringify(plan),stamp);
    emitEvent(roomId,"initial","主持人根据发起人的想法放出了第一版草案。时间、活动和预算都可以继续商量。" );
  })();
  res.status(201).json({id:roomId});
});
app.get("/api/rooms/:id",(req,res)=>{
  const user=userOrFail(req,res);if(!user)return;
  const room=getRoom(req.params.id);if(!room)return fail(res,"讨论间不存在",404);
  if(!isMember(room.id,user.id)){res.json({joined:false,room:{id:room.id,title:room.title,date:room.date}});return;}
  res.json(publicRoom(room.id,user.id));
});
app.post("/api/rooms/:id/join",(req,res)=>{
  const user=userOrFail(req,res);if(!user)return;
  const room=getRoom(req.params.id);if(!room)return fail(res,"讨论间不存在",404);
  if(!isMember(room.id,user.id)){
    if(room.phase==="final")return fail(res,"这场聚会已定案",409);
    if(activePoll(room.id))return fail(res,"投票进行中，请等投票结束后加入",409);
    const count=(db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").get(room.id) as {n:number}).n;
    if(count>=5)return fail(res,"讨论间最多 5 人",409);
    db.transaction(()=>{
      db.prepare("INSERT INTO members(room_id,user_id,joined_at) VALUES(?,?,?)").run(room.id,user.id,now());
      db.prepare("INSERT INTO preferences(room_id,user_id,data_json,updated_at) VALUES(?,?,'{}',?)").run(room.id,user.id,now());
      db.prepare("UPDATE rooms SET revision=revision+1,coordination_epoch=coordination_epoch+1,coordination_pending=1,updated_at=? WHERE id=?").run(now(),room.id);
      emitEvent(room.id,"joined","有新朋友加入了讨论间。" );
    })();scheduleRoom(room.id);
  }
  res.json(publicRoom(room.id,user.id));
});
app.post("/api/rooms/:id/answer",(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  if(access.room.phase==="final")return fail(res,"聚会已定案，不能再修改方案条件",409);
  if(activePoll(access.room.id))return fail(res,"投票进行中，请先完成投票再修改条件",409);
  const current=currentPlan(access.room.id);if(!current)return fail(res,"当前没有可讨论的草案",409);
  const pref=getMembers(access.room.id).find(m=>m.userId===access.user.id)!.preference;
  const targeted=conflictQuestion(access.room.phase==="blocked"?null:current.plan,getMembers(access.room.id));
  const question=access.room.phase==="blocked"&&targeted?.userId===access.user.id?targeted.question:nextQuestion(current.plan,pref);
  if(!question||question.id!==req.body.questionId)return fail(res,"问题已更新，请查看新问题",409);
  const option=question.options.find(o=>o.value===req.body.value);if(!option)return fail(res,"无效的选项");
  const reply=option.effect?"收到，我记下了。主持人会把这个回答与大家的条件一起检查。":"好，你直接告诉我具体想法就行。我会先在私聊里理解，再决定是否需要调整草案。";
  db.transaction(()=>{
    if(option.effect){const next={...pref,...validatePreferencePatch(option.effect)};db.prepare("UPDATE preferences SET data_json=?,updated_at=? WHERE room_id=? AND user_id=?").run(JSON.stringify(next),now(),access.room.id,access.user.id);db.prepare("DELETE FROM confirmations WHERE proposal_id=? AND user_id=?").run(current.id,access.user.id);db.prepare("UPDATE rooms SET revision=revision+1,coordination_epoch=coordination_epoch+1,coordination_pending=1,phase='discussing',updated_at=? WHERE id=?").run(now(),access.room.id);}
    db.prepare("INSERT INTO messages(id,room_id,user_id,role,body,created_at) VALUES(?,?,?,'user',?,?)").run(uid(),access.room.id,access.user.id,option.label,now());
    db.prepare("INSERT INTO messages(id,room_id,user_id,role,body,created_at) VALUES(?,?,?,'assistant',?,?)").run(uid(),access.room.id,access.user.id,reply,new Date(Date.now()+1).toISOString());
  })();
  if(option.effect)scheduleRoom(access.room.id);
  res.json({...publicRoom(access.room.id,access.user.id),needsText:!option.effect});
});
app.post("/api/rooms/:id/message",async(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  if(access.room.phase==="final")return fail(res,"聚会已定案，不能再修改方案条件",409);
  if(activePoll(access.room.id))return fail(res,"投票进行中，请先完成投票再修改条件",409);
  const text=String(req.body.text??"").trim().slice(0,600);if(!text)return fail(res,"消息不能为空");
  const usage=(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE room_id=? AND user_id=? AND role='user' AND created_at>?").get(access.room.id,access.user.id,new Date(Date.now()-86400000).toISOString()) as {n:number}).n;
  if(usage>=50)return fail(res,"今天的自由输入已达上限，可继续使用快捷按钮",429);
  const current=currentPlan(access.room.id);
  const recent=(db.prepare("SELECT body FROM messages WHERE room_id=? AND user_id=? AND role='user' ORDER BY created_at DESC LIMIT 3").all(access.room.id,access.user.id) as {body:string}[]).map(x=>x.body).reverse();
  const result=await interpret(text,current?.plan??null,recent);
  const latest=getRoom(access.room.id);
  if(!latest||latest.phase==="final")return fail(res,"聚会已定案，不能再修改方案条件",409);
  if(activePoll(access.room.id))return fail(res,"投票进行中，请先完成投票再修改条件",409);
  const pref=getMembers(access.room.id).find(m=>m.userId===access.user.id)!.preference;
  const patch=validatePreferencePatch(result.patch);
  const reply=result.suggestions.length?`${result.reply}\n\n可供讨论：${result.suggestions.join("、")}。如果你想把其中一项写进草案，请直接告诉我你的选择。`:result.reply;
  db.transaction(()=>{
    db.prepare("INSERT INTO messages(id,room_id,user_id,role,body,created_at) VALUES(?,?,?,'user',?,?)").run(uid(),access.room.id,access.user.id,text,now());
    db.prepare("INSERT INTO messages(id,room_id,user_id,role,body,created_at) VALUES(?,?,?,'assistant',?,?)").run(uid(),access.room.id,access.user.id,reply,new Date(Date.now()+1).toISOString());
    if(Object.keys(patch).length){db.prepare("UPDATE preferences SET data_json=?,updated_at=? WHERE room_id=? AND user_id=?").run(JSON.stringify({...pref,...patch}),now(),access.room.id,access.user.id);if(latest.current_proposal_id)db.prepare("DELETE FROM confirmations WHERE proposal_id=? AND user_id=?").run(latest.current_proposal_id,access.user.id);db.prepare("UPDATE rooms SET revision=revision+1,coordination_epoch=coordination_epoch+1,coordination_pending=1,phase='discussing',updated_at=? WHERE id=?").run(now(),access.room.id);}
  })();
  if(Object.keys(patch).length)scheduleRoom(access.room.id);
  res.json({...publicRoom(access.room.id,access.user.id),interpretation:{source:result.source,applied:Object.keys(patch),suggestions:result.suggestions}});
});
app.post("/api/rooms/:id/confirm",(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  const decision=String(req.body.decision??"");
  if(!["accept","reject"].includes(decision))return fail(res,"无效的确认");
  const outcome=db.transaction(()=>{
    const room=getRoom(access.room.id)!;
    const proposal=currentPlan(room.id);
    if(!proposal||proposal.id!==req.body.proposalId||room.phase==="blocked")return "草案已更新或暂停，请查看最新版";
    if(room.coordination_pending)return "主持人正在根据新条件调整方案，请稍后查看最新版";
    if(activePoll(room.id))return "请先完成进行中的投票";
    if(room.phase==="final")return decision==="accept"?null:"聚会已定案，不能撤销方案确认";
    const missing=finalizationMissing(proposal.plan);
    if(missing.length)return `还需确定：${missing.join("、")}。可以用私聊或投票解决后再确认`;
    db.prepare("INSERT INTO confirmations(proposal_id,user_id,decision,updated_at) VALUES(?,?,?,?) ON CONFLICT(proposal_id,user_id) DO UPDATE SET decision=excluded.decision,updated_at=excluded.updated_at").run(proposal.id,access.user.id,decision,now());
    if(decision==="reject")db.prepare("INSERT INTO messages(id,room_id,user_id,role,body,created_at) VALUES(?,?,?,'assistant',?,?)").run(uid(),access.room.id,access.user.id,"哪一部分不合适？可以直接说时间、区域、顺序、吃什么、玩什么或具体预算。我会先私下理解，再决定是否发起投票。",now());
    const n=(db.prepare("SELECT COUNT(*) AS n FROM confirmations WHERE proposal_id=? AND decision='accept'").get(proposal.id) as {n:number}).n;
    const total=(db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").get(access.room.id) as {n:number}).n;
    if(n===total&&total>=3){const changed=db.prepare("UPDATE rooms SET phase='final',updated_at=? WHERE id=? AND current_proposal_id=? AND coordination_pending=0 AND phase!='final'").run(now(),access.room.id,proposal.id);if(!changed.changes)throw Error("confirmation_version_changed");emitEvent(access.room.id,"final","所有参与者都确认了同一版方案，这场聚会正式定案。" );for(const member of getMembers(access.room.id))enqueueNotification(member.userId,"room_final",{roomId:access.room.id,version:proposal.version},`final:${access.room.id}:${proposal.version}:${member.userId}`);}
    return null;
  })();
  if(outcome)return fail(res,outcome,409);
  res.json(publicRoom(access.room.id,access.user.id));
});
app.post("/api/rooms/:id/polls",(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  if(access.room.phase==="final"||access.room.coordination_pending)return fail(res,"方案正在调整或已定案，暂不能发起投票",409);
  if(access.room.created_by!==access.user.id)return fail(res,"只有发起人可以发起公共投票",403);
  if(activePoll(access.room.id))return fail(res,"已有进行中的投票",409);
  const facet=String(req.body.facet??"");
  if(!["food","play","time","order","rounds","area","budgetMeal","budgetPlay1","budgetPlay2","budgetAfter"].includes(facet))return fail(res,"无效的投票主题");
  const current=currentPlan(access.room.id);if(!current)return fail(res,"还没有草案",409);
  const choice=pollOptions(facet,current.plan,JSON.parse(access.room.brief_json) as Brief,getMembers(access.room.id));
  if(!createPoll(access.room.id,facet,choice.options,choice.question,"manual"))return fail(res,"方案已更新，请重试投票",409);
  res.json(publicRoom(access.room.id,access.user.id));
});
app.post("/api/rooms/:id/polls/:pollId/vote",(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  if(access.room.phase==="final")return fail(res,"聚会已定案",409);
  const poll=activePoll(access.room.id);if(!poll||poll.id!==req.params.pollId)return fail(res,"投票已结束",409);
  if(!vote(poll.id,access.user.id,String(req.body.optionId??"")))return fail(res,"无效的选项");
  res.json(publicRoom(access.room.id,access.user.id));
});
app.post("/api/rooms/:id/polls/:pollId/close",(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  if(access.room.phase==="final")return fail(res,"聚会已定案",409);
  if(access.room.created_by!==access.user.id)return fail(res,"只有发起人可以结束投票",403);
  if(!closePoll(access.room.id,req.params.pollId))return fail(res,"至少需要一人投票，或投票已结束",409);
  res.json(publicRoom(access.room.id,access.user.id));
});
app.post("/api/rooms/:id/attendance",(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  const proposal=currentPlan(access.room.id),segmentId=String(req.body.segmentId??""),decision=String(req.body.decision??"");
  if(!proposal||proposal.id!==req.body.proposalId||access.room.phase==="blocked"||!proposal.plan.segments.some(s=>s.id===segmentId))return fail(res,"活动版本已更新",409);
  if(!["yes","no"].includes(decision))return fail(res,"无效的报名");
  db.prepare("INSERT INTO attendance(proposal_id,segment_id,user_id,decision,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(proposal_id,segment_id,user_id) DO UPDATE SET decision=excluded.decision,updated_at=excluded.updated_at").run(proposal.id,segmentId,access.user.id,decision,now());
  res.json(publicRoom(access.room.id,access.user.id));
});

app.use("/api",(_req,res)=>fail(res,"未找到",404));
app.use((error:unknown,_req:express.Request,res:express.Response,next:express.NextFunction)=>{console.error("API request failed",error);if(res.headersSent)return next(error);res.status(500).json({error:"服务器暂时无法完成请求"});});
const port=Number(process.env.PORT??3000),prod=process.argv.includes("--prod");
if(prod){const dist=path.resolve("dist");app.use(express.static(dist));app.get("/{*any}",(_req,res)=>res.sendFile(path.join(dist,"index.html")));}
else{const vite=await createViteServer({server:{middlewareMode:true},appType:"spa"});app.use(vite.middlewares);}
app.listen(port,"0.0.0.0",()=>{recoverPendingCoordination();console.log(`Weekend Host ready at http://localhost:${port}`);});
