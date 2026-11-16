import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { createServer as createViteServer } from "vite";
import { db, getRoom, getUser, isMember, now, uid } from "./db";
import { clearSession, createSession, currentUser, register, verify } from "./auth";
import { activePoll, closePoll, createPoll, currentPlan, emitEvent, getMembers, pollOptions, recoverPendingCoordination, scheduleRoom, startBlankPlanFromPublicShares, vote } from "./coordinator";
import { initialPlan, nextQuestion, conflictQuestion, validatePreferencePatch, finalizationMissing,negotiatePlan } from "../shared/planner";
import type { Brief, Plan, PlanLocks, Preference, Question } from "../shared/domain";
import { FOODS, PLAYS, START_WINDOWS } from "../shared/domain";
import { interpret, fallback as fallbackLanguage } from "./language";
import community from "./community";
import management from "./management";
import notification,{enqueueNotification} from "./notification";
import {buildBulletin,currentBulletin,refreshBulletin} from './bulletin';
import {annotatePublicShare,recoverPublicSummaries} from './public-summary';
import {recoverPublicGuidance,updatePublicGuidance} from './public-guidance';
import {modelPlanOption,ownCoordination,recoverSemanticCoordination,scheduleSemanticCoordination} from './semantic-coordination';
import {trialAccess} from './trial-access';

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
app.use(trialAccess);
const fail=(res:express.Response,message:string,status=400)=>res.status(status).json({error:message});
const userOrFail=(req:express.Request,res:express.Response)=>{const user=currentUser(req);if(!user)fail(res,"请先登录",401);return user;};
const roomMember=(req:express.Request,res:express.Response)=>{const user=userOrFail(req,res);if(!user)return null;const room=getRoom(String(req.params.id));if(!room){fail(res,"讨论间不存在",404);return null;}if(!isMember(room.id,user.id)){fail(res,"请先加入讨论间",403);return null;}const circle=db.prepare('SELECT circle_id FROM room_circle_invites WHERE room_id=? LIMIT 1').get(room.id) as {circle_id:string}|undefined;if(circle&&!db.prepare("SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=? AND status='active'").get(circle.circle_id,user.id)){fail(res,'已离开所属熟人圈',403);return null;}return {user,room};};

function validateBrief(raw:unknown,allowUndecidedDate=false):Brief|null{
  if(!raw||typeof raw!=="object")return null;
  const x=raw as Record<string,unknown>;
  const title=String(x.title??"").trim().slice(0,60),date=String(x.date??"");
  if(!title&&!allowUndecidedDate||!/^\d{4}-\d{2}-\d{2}$/.test(date)&&!(allowUndecidedDate&&date==='待定'))return null;
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
  const question=room.phase==="blocked"&&targeted?.userId===userId?targeted.question:null;
  const messages=db.prepare("SELECT id,role,body,created_at AS createdAt FROM messages WHERE room_id=? AND user_id=? ORDER BY created_at,id LIMIT 120").all(roomId,userId);
  const events=db.prepare("SELECT id,event_type AS type,public_text AS text,created_at AS createdAt FROM room_events WHERE room_id=? ORDER BY created_at DESC LIMIT 15").all(roomId).reverse();
  const decisionRows=db.prepare("SELECT user_id,decision_status FROM members WHERE room_id=?").all(roomId) as {user_id:string;decision_status:string}[];
  const decisionStatus=(id:string)=>decisionRows.find(x=>x.user_id===id)?.decision_status??'undecided';
  const confirmations=proposal?db.prepare("SELECT c.user_id,c.decision FROM confirmations c JOIN members m ON m.room_id=? AND m.user_id=c.user_id AND m.decision_status='yes' WHERE c.proposal_id=?").all(roomId,proposal.id) as {user_id:string;decision:string}[]:[];
  const attendance=proposal?db.prepare("SELECT a.segment_id AS segmentId,a.user_id AS userId,u.display_name AS name,a.decision FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.proposal_id=?").all(proposal.id):[];
  const bulletin=currentBulletin(roomId)??(buildBulletin(roomId)?{id:null,version:0,...buildBulletin(roomId)!}:null);
  return {joined:true,room:{id:room.id,title:room.title,date:room.date,mode:room.mode,phase:room.phase,hostId:room.created_by,revision:room.revision,coordinationPending:!!room.coordination_pending},brief:room.mode==='blank'?null:brief,bulletin,
    members:members.map(m=>({id:m.userId,name:m.name,decisionStatus:decisionStatus(m.userId),hasAnswered:Object.keys(m.preference).length>0||!!db.prepare("SELECT 1 FROM messages WHERE room_id=? AND user_id=? AND role='user' LIMIT 1").get(roomId,m.userId)})),
    me:{id:userId,preference:own},messages,events,question,coordination:ownCoordination(roomId,userId),
    proposal:proposal&&room.phase!=="blocked"?{...proposal,confirmed:confirmations.filter(c=>c.decision==="accept").length,required:decisionRows.filter(x=>x.decision_status==='yes').length,undecided:decisionRows.filter(x=>x.decision_status==='undecided').length,confirmations:members.filter(m=>decisionStatus(m.userId)==='yes').map(m=>({userId:m.userId,name:m.name,decision:confirmations.find(c=>c.user_id===m.userId)?.decision??null})),myDecision:confirmations.find(c=>c.user_id===userId)?.decision??null,attendance,pendingFinal:finalizationMissing(proposal.plan)}:null,
    poll:poll?{id:poll.id,facet:poll.facet,question:poll.question,options:(JSON.parse(poll.options_json) as {id:string;label:string;value:string|number}[]).map(o=>({...o,votes:pollVotes.find(v=>v.option_id===o.id)?.n??0})),myVote}:null};
}

function finalizeIfReady(roomId:string){
  const room=getRoom(roomId),proposal=currentPlan(roomId);
  if(!room||!proposal||room.phase==='final'||room.phase==='closed'||room.phase==='blocked'||room.coordination_pending||activePoll(roomId)||finalizationMissing(proposal.plan).length)return;
  const counts=db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN decision_status='yes' THEN 1 ELSE 0 END) AS required,SUM(CASE WHEN decision_status='undecided' THEN 1 ELSE 0 END) AS undecided FROM members WHERE room_id=?").get(roomId) as {total:number;required:number;undecided:number};
  const accepted=(db.prepare("SELECT COUNT(*) AS n FROM confirmations c JOIN members m ON m.user_id=c.user_id AND m.room_id=? AND m.decision_status='yes' WHERE c.proposal_id=? AND c.decision='accept'").get(roomId,proposal.id) as {n:number}).n;
  if(counts.required<2||counts.undecided||accepted!==counts.required)return;
  const changed=db.prepare("UPDATE rooms SET phase='final',updated_at=? WHERE id=? AND current_proposal_id=? AND coordination_pending=0 AND phase!='final'").run(now(),roomId,proposal.id);
  if(!changed.changes)throw Error('confirmation_version_changed');
  db.prepare("UPDATE room_circle_invites SET status='expired',decided_at=? WHERE room_id=? AND status='pending'").run(now(),roomId);
  db.prepare("UPDATE notification_outbox SET status='expired',delivered_at=COALESCE(delivered_at,?) WHERE kind='discussion_invite' AND json_extract(payload_json,'$.roomId')=? AND status='pending'").run(now(),roomId);
  db.prepare("UPDATE room_coordination_questions SET status='obsolete' WHERE room_id=? AND status='pending'").run(roomId);
  db.prepare("UPDATE notification_outbox SET status='expired',delivered_at=COALESCE(delivered_at,?) WHERE kind='coordination_question' AND json_extract(payload_json,'$.roomId')=? AND status='pending'").run(now(),roomId);
  emitEvent(roomId,'final','所有决策参与者都确认了同一版方案，这场聚会正式定案。');
  for(const member of getMembers(roomId))enqueueNotification(member.userId,'room_final',{roomId,version:proposal.version},`final:${roomId}:${proposal.version}:${member.userId}`);
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
app.post("/api/rooms",async(req,res)=>{
  const user=userOrFail(req,res);if(!user)return;
  const circleId=String(req.body.circleId??'').trim();
  const inviteeIds=[...new Set<string>((Array.isArray(req.body.inviteeIds)?req.body.inviteeIds:[]).map((x:unknown)=>String(x)))].filter(id=>id!==user.id);
  if(circleId){
    if(!db.prepare("SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=? AND status='active'").get(circleId,user.id))return fail(res,"不在所选熟人圈中",403);
    if(inviteeIds.length>9||inviteeIds.some(id=>!db.prepare("SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=? AND status='active'").get(circleId,id)))return fail(res,"邀请对象必须是圈内成员，最多 9 人",400);
  }else if(inviteeIds.length)return fail(res,"请先选择熟人圈",400);
  const idea=String(req.body.idea??'').trim().slice(0,600),mode=req.body.mode==='blank'?'blank':'template';
  const publicText=String(req.body.publicText??'').trim();
  if(publicText&&(mode!=='blank'||req.body.explicitApproval!==true||publicText.length>300))return fail(res,'请确认准备公开的具体内容，限 300 字');
  const input=mode==='blank'?{...req.body,title:String(req.body.title??'').trim()||'周末讨论',date:req.body.date||'待定'}:req.body;
  const brief=validateBrief(input,mode==='blank');if(!brief)return fail(res,"请填写聚会名称和日期");
  const count=(db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE created_by=?").get(user.id) as {n:number}).n;
  if(count>=30)return fail(res,"账号的讨论间数量已达上限",429);
  const understanding=mode==='blank'&&idea?await interpret(idea,null,[]):null;
  const roomId=uid(),proposalId=mode==='template'?uid():null,shareId=publicText?uid():null,stamp=now(),plan=mode==='template'?initialPlan(brief):null;
  db.transaction(()=>{
    db.prepare("INSERT INTO rooms(id,title,date,mode,brief_json,phase,current_proposal_id,revision,locks_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'draft',?,0,'{}',?,?,?)").run(roomId,brief.title,brief.date,mode,JSON.stringify(brief),proposalId,user.id,stamp,stamp);
    db.prepare("INSERT INTO members(room_id,user_id,joined_at) VALUES(?,?,?)").run(roomId,user.id,stamp);
    db.prepare("INSERT INTO preferences(room_id,user_id,data_json,updated_at) VALUES(?,?,'{}',?)").run(roomId,user.id,stamp);
    if(circleId){
      db.prepare("INSERT INTO room_circle_invites(room_id,circle_id,user_id,status,invited_by,created_at) VALUES(?,?,?,'accepted',?,?)").run(roomId,circleId,user.id,user.id,stamp);
      for(const invitedId of inviteeIds){
        db.prepare("INSERT INTO room_circle_invites(room_id,circle_id,user_id,status,invited_by,created_at) VALUES(?,?,?,'pending',?,?)").run(roomId,circleId,invitedId,user.id,stamp);
        enqueueNotification(invitedId,'discussion_invite',{roomId,circleId,inviter:user.display_name,roomTitle:brief.title},`discussion_invite:${roomId}:${invitedId}`);
      }
    }
    if(understanding){const patch=validatePreferencePatch(understanding.patch);db.prepare('UPDATE preferences SET data_json=? WHERE room_id=? AND user_id=?').run(JSON.stringify(patch),roomId,user.id);db.prepare("INSERT INTO messages(id,room_id,user_id,role,body,created_at) VALUES(?,?,?,'user',?,?)").run(uid(),roomId,user.id,idea,stamp);db.prepare("INSERT INTO messages(id,room_id,user_id,role,body,created_at) VALUES(?,?,?,'assistant',?,?)").run(uid(),roomId,user.id,understanding.reply,new Date(Date.now()+1).toISOString());}
    if(shareId)db.prepare('INSERT INTO room_public_shares(id,room_id,author_id,source_message_id,public_text,created_at) VALUES(?,?,?,?,?,?)').run(shareId,roomId,user.id,null,publicText,stamp);
    if(proposalId&&plan)db.prepare("INSERT INTO proposals(id,room_id,version,plan_json,kind,created_at) VALUES(?,?,1,?,'initial',?)").run(proposalId,roomId,JSON.stringify(plan),stamp);
    emitEvent(roomId,"initial",mode==='blank'?'讨论间已建立，大家可以先说想法，再整理共同安排。':"主持人根据发起人的想法放出了第一版草案。时间、活动和预算都可以继续商量。" );
    refreshBulletin(roomId);
  })();
  if(shareId){void annotatePublicShare(shareId);void updatePublicGuidance(roomId);scheduleSemanticCoordination(roomId);}
  res.status(201).json({id:roomId});
});
app.get("/api/rooms/:id",(req,res)=>{
  const user=userOrFail(req,res);if(!user)return;
  const room=getRoom(req.params.id);if(!room)return fail(res,"讨论间不存在",404);
  const circleRoom=db.prepare("SELECT circle_id FROM room_circle_invites WHERE room_id=? LIMIT 1").get(room.id) as {circle_id:string}|undefined;
  const invite=circleRoom?db.prepare("SELECT ri.status,ri.created_at AS createdAt,u.display_name AS inviter,c.name AS circleName FROM room_circle_invites ri JOIN circle_members cm ON cm.circle_id=ri.circle_id AND cm.user_id=ri.user_id AND cm.status='active' JOIN users u ON u.id=ri.invited_by JOIN circles c ON c.id=ri.circle_id WHERE ri.room_id=? AND ri.user_id=? AND ri.status IN ('pending','accepted')").get(room.id,user.id) as {status:string;createdAt:string;inviter:string;circleName:string}|undefined:undefined;
  if(circleRoom&&!invite)return fail(res,"无权查看讨论邀请",403);
  if(!isMember(room.id,user.id)){res.json({joined:false,invite,room:{id:room.id,title:room.title,date:room.date}});return;}
  res.json(publicRoom(room.id,user.id));
});
app.get('/api/rooms/:id/bulletins',(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  const rows=db.prepare('SELECT id,version,content_json AS contentJson,source_json AS sourceJson,created_at AS createdAt FROM room_bulletins WHERE room_id=? ORDER BY version DESC LIMIT 30').all(access.room.id) as {id:string;version:number;contentJson:string;sourceJson:string;createdAt:string}[];
  res.json({bulletins:rows.map(r=>({id:r.id,version:r.version,content:JSON.parse(r.contentJson),sources:JSON.parse(r.sourceJson),createdAt:r.createdAt}))});
});
app.post('/api/rooms/:id/share',(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  if(access.room.phase==='final')return fail(res,'聚会已定案，不能再公开新意见',409);
  const publicText=String(req.body.publicText??'').trim(),sourceMessageId=String(req.body.sourceMessageId??'').trim();
  if(req.body.explicitApproval!==true||!publicText||publicText.length>300)return fail(res,'请确认将展示的具体内容，限 300 字');
  if(sourceMessageId&&!db.prepare("SELECT 1 FROM messages WHERE id=? AND room_id=? AND user_id=? AND role='user'").get(sourceMessageId,access.room.id,access.user.id))return fail(res,'只能选择自己的私人原话',403);
  const shareId=uid();
  const approvedArea=access.room.created_by===access.user.id&&/(?:在|约在|定在).{2,25}(?:附近集合|集合|附近)/.test(publicText)&&!/不想|不要|不去/.test(publicText)?fallbackLanguage(publicText).patch.area??null:null;
  let areaUpdated=false;
  db.transaction(()=>{
    db.prepare('INSERT INTO room_public_shares(id,room_id,author_id,source_message_id,public_text,created_at) VALUES(?,?,?,?,?,?)').run(shareId,access.room.id,access.user.id,sourceMessageId||null,publicText,now());
    const fresh=getRoom(access.room.id),current=currentPlan(access.room.id);
    if(approvedArea&&fresh&&current&&!current.plan.area&&!activePoll(fresh.id)&&fresh.phase!=='final'&&!fresh.coordination_pending){
      const locks=JSON.parse(fresh.locks_json) as PlanLocks;
      const updated=db.prepare("UPDATE rooms SET locks_json=?,revision=revision+1,coordination_epoch=coordination_epoch+1,coordination_pending=1,phase='discussing',updated_at=? WHERE id=? AND revision=? AND coordination_pending=0").run(JSON.stringify({...locks,area:approvedArea}),now(),fresh.id,fresh.revision);
      areaUpdated=!!updated.changes;
    }
    emitEvent(access.room.id,'share',`${access.user.display_name}主动公开分享了一条想法。`);
    refreshBulletin(access.room.id);
  })();
  if(areaUpdated)scheduleRoom(access.room.id);
  startBlankPlanFromPublicShares(access.room.id);
  void annotatePublicShare(shareId);
  void updatePublicGuidance(access.room.id);
  scheduleSemanticCoordination(access.room.id);
  res.json(publicRoom(access.room.id,access.user.id));
});
app.post("/api/rooms/:id/join",(req,res)=>{
  const user=userOrFail(req,res);if(!user)return;
  const room=getRoom(req.params.id);if(!room)return fail(res,"讨论间不存在",404);
  const circleRoom=db.prepare("SELECT circle_id FROM room_circle_invites WHERE room_id=? LIMIT 1").get(room.id) as {circle_id:string}|undefined;
  if(circleRoom&&!db.prepare("SELECT 1 FROM room_circle_invites ri JOIN circle_members cm ON cm.circle_id=ri.circle_id AND cm.user_id=ri.user_id AND cm.status='active' WHERE ri.room_id=? AND ri.user_id=? AND ri.status='pending'").get(room.id,user.id)&&!isMember(room.id,user.id))return fail(res,"你没有待接受的讨论邀请",403);
  if(!isMember(room.id,user.id)){
    if(room.phase==="final"||room.phase==="closed")return fail(res,"这场讨论已经结束",409);
    if(activePoll(room.id))return fail(res,"投票进行中，请等投票结束后加入",409);
    const count=(db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").get(room.id) as {n:number}).n;
    if(count>=10)return fail(res,"讨论间最多 10 人",409);
    db.transaction(()=>{
      db.prepare("INSERT INTO members(room_id,user_id,joined_at) VALUES(?,?,?)").run(room.id,user.id,now());
      db.prepare("INSERT INTO preferences(room_id,user_id,data_json,updated_at) VALUES(?,?,'{}',?)").run(room.id,user.id,now());
      if(circleRoom)db.prepare("UPDATE room_circle_invites SET status='accepted',decided_at=? WHERE room_id=? AND user_id=? AND status='pending'").run(now(),room.id,user.id);
      db.prepare("UPDATE notification_outbox SET status='accepted',delivered_at=COALESCE(delivered_at,?) WHERE user_id=? AND kind='discussion_invite' AND json_extract(payload_json,'$.roomId')=? AND status='pending'").run(now(),user.id,room.id);
      db.prepare("UPDATE rooms SET revision=revision+1,coordination_epoch=coordination_epoch+1,coordination_pending=CASE WHEN mode='blank' AND current_proposal_id IS NULL THEN 0 ELSE 1 END,updated_at=? WHERE id=?").run(now(),room.id);
      emitEvent(room.id,"joined","有新朋友加入了讨论间。" );
      refreshBulletin(room.id);
    })();if(getRoom(room.id)?.coordination_pending)scheduleRoom(room.id);scheduleSemanticCoordination(room.id);
  }
  res.json(publicRoom(room.id,user.id));
});
app.get('/api/rooms/:id/invites',(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  const circle=db.prepare('SELECT circle_id AS id FROM room_circle_invites WHERE room_id=? LIMIT 1').get(access.room.id) as {id:string}|undefined;
  const rows=db.prepare("SELECT ri.user_id AS userId,u.display_name AS name,ri.status,ri.invited_by AS invitedBy,ri.created_at AS createdAt,ri.decided_at AS decidedAt FROM room_circle_invites ri JOIN users u ON u.id=ri.user_id WHERE ri.room_id=? AND ri.user_id!=? ORDER BY ri.created_at DESC").all(access.room.id,access.user.id);
  res.json({circleId:circle?.id??null,invites:rows});
});
app.post('/api/rooms/:id/invites',(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  if(access.room.phase==='final'||access.room.phase==='closed')return fail(res,'这场讨论已经结束',409);
  const circle=db.prepare('SELECT circle_id AS id FROM room_circle_invites WHERE room_id=? LIMIT 1').get(access.room.id) as {id:string}|undefined;
  if(!circle)return fail(res,'请先在熟人圈内创建讨论间',409);
  const invitedId=String(req.body.userId??'');
  if(!db.prepare("SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=? AND status='active'").get(circle.id,invitedId))return fail(res,'只能邀请当前熟人圈成员',403);
  if(isMember(access.room.id,invitedId))return fail(res,'对方已加入讨论',409);
  const prior=db.prepare('SELECT status FROM room_circle_invites WHERE room_id=? AND user_id=?').get(access.room.id,invitedId) as {status:string}|undefined;
  if(prior?.status==='pending')return fail(res,'已有待处理邀请',409);
  const stamp=now();db.transaction(()=>{
    db.prepare("INSERT INTO room_circle_invites(room_id,circle_id,user_id,status,invited_by,created_at,decided_at) VALUES(?,?,?,'pending',?,?,NULL) ON CONFLICT(room_id,user_id) DO UPDATE SET status='pending',invited_by=excluded.invited_by,created_at=excluded.created_at,decided_at=NULL").run(access.room.id,circle.id,invitedId,access.user.id,stamp);
    enqueueNotification(invitedId,'discussion_invite',{roomId:access.room.id,circleId:circle.id,inviter:access.user.display_name,roomTitle:access.room.title},`discussion_invite:${access.room.id}:${invitedId}:${stamp}`);
  })();res.status(201).json({status:'pending'});
});
app.post('/api/rooms/:id/invites/respond',(req,res)=>{
  const user=userOrFail(req,res);if(!user)return;
  if(req.body.decision!=='decline')return fail(res,'请使用加入操作接受邀请');
  const changed=db.prepare("UPDATE room_circle_invites SET status='declined',decided_at=? WHERE room_id=? AND user_id=? AND status='pending'").run(now(),req.params.id,user.id);
  if(!changed.changes)return fail(res,'邀请已失效',409);
  db.prepare("UPDATE notification_outbox SET status='declined',delivered_at=COALESCE(delivered_at,?) WHERE user_id=? AND kind='discussion_invite' AND json_extract(payload_json,'$.roomId')=? AND status='pending'").run(now(),user.id,req.params.id);
  res.json({status:'declined'});
});
app.post('/api/rooms/:id/invites/:userId/revoke',(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  const changed=db.prepare("UPDATE room_circle_invites SET status='revoked',decided_at=? WHERE room_id=? AND user_id=? AND status='pending' AND invited_by=?").run(now(),access.room.id,req.params.userId,access.user.id);
  if(!changed.changes)return fail(res,'只能撤销自己发出的待处理邀请',409);
  db.prepare("UPDATE notification_outbox SET status='revoked',delivered_at=COALESCE(delivered_at,?) WHERE user_id=? AND kind='discussion_invite' AND json_extract(payload_json,'$.roomId')=? AND status='pending'").run(now(),req.params.userId,access.room.id);
  res.json({status:'revoked'});
});
app.post('/api/rooms/:id/leave',(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  const current=currentPlan(access.room.id);
  if(current&&db.prepare("SELECT 1 FROM attendance WHERE proposal_id=? AND user_id=? AND decision='yes' LIMIT 1").get(current.id,access.user.id))return fail(res,'你已报名，请先逐项取消报名再退出讨论间',409);
  if(activePoll(access.room.id))return fail(res,'投票进行中，请等投票结束再退出',409);
  const others=db.prepare('SELECT user_id AS id FROM members WHERE room_id=? AND user_id!=?').all(access.room.id,access.user.id) as {id:string}[];
  const host=access.room.created_by===access.user.id,transferTo=String(req.body.transferTo??'');
  if(host&&others.length&&!others.some(m=>m.id===transferTo))return fail(res,'创建者退出前请指定一位现有成员接管',409);
  db.transaction(()=>{
    if(host&&others.length)db.prepare('UPDATE rooms SET created_by=? WHERE id=?').run(transferTo,access.room.id);
    db.prepare('DELETE FROM preferences WHERE room_id=? AND user_id=?').run(access.room.id,access.user.id);
    db.prepare('DELETE FROM members WHERE room_id=? AND user_id=?').run(access.room.id,access.user.id);
    db.prepare("UPDATE room_circle_invites SET status='revoked',decided_at=? WHERE room_id=? AND user_id=?").run(now(),access.room.id,access.user.id);
    if(!others.length){db.prepare("UPDATE rooms SET phase='closed',coordination_pending=0,revision=revision+1,coordination_epoch=coordination_epoch+1,updated_at=? WHERE id=?").run(now(),access.room.id);db.prepare("UPDATE room_circle_invites SET status='expired',decided_at=? WHERE room_id=? AND status='pending'").run(now(),access.room.id);db.prepare("UPDATE notification_outbox SET status='expired',delivered_at=COALESCE(delivered_at,?) WHERE kind='discussion_invite' AND json_extract(payload_json,'$.roomId')=? AND status='pending'").run(now(),access.room.id);}
    else if(access.room.phase!=='final')db.prepare("UPDATE rooms SET revision=revision+1,coordination_epoch=coordination_epoch+1,coordination_pending=CASE WHEN current_proposal_id IS NULL THEN 0 ELSE 1 END,updated_at=? WHERE id=?").run(now(),access.room.id);
    emitEvent(access.room.id,'left','有成员退出讨论间，后续安排将按现有成员重新协调。');
    refreshBulletin(access.room.id);
  })();
  if(others.length&&getRoom(access.room.id)?.coordination_pending)scheduleRoom(access.room.id);
  res.json({left:true,closed:!others.length,hostId:host&&others.length?transferTo:undefined});
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
    if(Object.keys(patch).length){db.prepare("UPDATE preferences SET data_json=?,updated_at=? WHERE room_id=? AND user_id=?").run(JSON.stringify({...pref,...patch}),now(),access.room.id,access.user.id);if(latest.current_proposal_id){db.prepare("DELETE FROM confirmations WHERE proposal_id=? AND user_id=?").run(latest.current_proposal_id,access.user.id);db.prepare("UPDATE rooms SET revision=revision+1,coordination_epoch=coordination_epoch+1,coordination_pending=1,phase='discussing',updated_at=? WHERE id=?").run(now(),access.room.id);}}
  })();
  if(Object.keys(patch).length&&latest.current_proposal_id)scheduleRoom(access.room.id);
  scheduleSemanticCoordination(access.room.id);
  res.json({...publicRoom(access.room.id,access.user.id),interpretation:{source:result.source,applied:Object.keys(patch),suggestions:result.suggestions}});
});
app.post('/api/rooms/:id/coordination/:questionId/answer',async(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  if(access.room.phase==='final'||access.room.phase==='closed')return fail(res,'讨论已结束，不能再回答协商问题',409);
  const text=String(req.body.text??'').trim().slice(0,600);if(!text)return fail(res,'请说说你的想法');
  const question=db.prepare("SELECT id,analysis_signature AS signature FROM room_coordination_questions WHERE id=? AND room_id=? AND user_id=? AND status='pending'").get(req.params.questionId,access.room.id,access.user.id) as {id:string;signature:string}|undefined;
  if(!question)return fail(res,'问题已更新或已回答，请刷新',409);
  const recent=(db.prepare("SELECT body FROM messages WHERE room_id=? AND user_id=? AND role='user' ORDER BY created_at DESC LIMIT 3").all(access.room.id,access.user.id) as {body:string}[]).map(x=>x.body).reverse();
  const result=await interpret(text,currentPlan(access.room.id)?.plan??null,recent);
  const outcome=db.transaction(()=>{
    const fresh=getRoom(access.room.id),analysis=db.prepare('SELECT input_signature AS signature FROM room_semantic_analysis WHERE room_id=?').get(access.room.id) as {signature:string}|undefined;
    if(!fresh||fresh.phase==='final'||fresh.phase==='closed'||analysis?.signature!==question.signature)return {ok:false,scheduled:false};
    const marked=db.prepare("UPDATE room_coordination_questions SET status='answered',answered_at=? WHERE id=? AND status='pending'").run(now(),question.id);if(!marked.changes)return {ok:false,scheduled:false};
    const messageId=uid(),stamp=now();
    db.prepare("INSERT INTO messages(id,room_id,user_id,role,body,created_at) VALUES(?,?,?,'user',?,?)").run(messageId,access.room.id,access.user.id,text,stamp);
    db.prepare("UPDATE room_coordination_questions SET answer_message_id=? WHERE id=?").run(messageId,question.id);
    db.prepare("UPDATE notification_outbox SET status='read',delivered_at=COALESCE(delivered_at,?) WHERE kind='coordination_question' AND json_extract(payload_json,'$.questionId')=? AND user_id=? AND status='pending'").run(stamp,question.id,access.user.id);
    db.prepare("INSERT INTO messages(id,room_id,user_id,role,body,created_at) VALUES(?,?,?,'assistant',?,?)").run(uid(),access.room.id,access.user.id,result.reply,new Date(Date.now()+1).toISOString());
    const patch=validatePreferencePatch(result.patch);
    if(Object.keys(patch).length){const pref=getMembers(access.room.id).find(m=>m.userId===access.user.id)!.preference;db.prepare('UPDATE preferences SET data_json=?,updated_at=? WHERE room_id=? AND user_id=?').run(JSON.stringify({...pref,...patch}),stamp,access.room.id,access.user.id);if(fresh.current_proposal_id){db.prepare('DELETE FROM confirmations WHERE proposal_id=? AND user_id=?').run(fresh.current_proposal_id,access.user.id);db.prepare("UPDATE rooms SET revision=revision+1,coordination_epoch=coordination_epoch+1,coordination_pending=1,phase='discussing',updated_at=? WHERE id=?").run(stamp,access.room.id);}}
    return {ok:true,scheduled:!!(Object.keys(patch).length&&fresh.current_proposal_id)};
  })();
  if(!outcome.ok)return fail(res,'问题已更新，请刷新',409);
  if(outcome.scheduled)scheduleRoom(access.room.id);
  scheduleSemanticCoordination(access.room.id);
  res.json({...publicRoom(access.room.id,access.user.id),interpretation:{source:result.source,applied:Object.keys(result.patch),suggestions:result.suggestions}});
});
app.post('/api/rooms/:id/coordination/plan',(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  if(access.room.created_by!==access.user.id)return fail(res,'只有讨论发起人可以采用方案建议',403);
  const key=String(req.body.key??''),option=modelPlanOption(access.room.id,key);
  if(!option)return fail(res,'AI 建议已更新，请刷新后重试',409);
  if(!option.canDraft)return fail(res,'仍有硬性冲突或关键信息未定，请先继续协商',409);
  if(!option.date&&!option.startHour&&!option.activity&&!option.area)return fail(res,'这条建议尚不够具体，请先继续讨论',409);
  if(option.activity&&!PLAYS.includes(option.activity as typeof PLAYS[number]))return fail(res,'建议的活动类别暂不支持',409);
  if(option.date){const day=new Date(`${option.date}T00:00:00Z`).getTime(),today=Date.now();if(!Number.isFinite(day)||day<today-86400000||day>today+60*86400000)return fail(res,'建议的日期不在可安排范围内',409);}
  if(option.area&&!db.prepare("SELECT 1 FROM room_public_shares WHERE room_id=? AND instr(public_text,?)>0 LIMIT 1").get(access.room.id,option.area))return fail(res,'建议区域缺少已授权的公开依据',409);
  const outcome=db.transaction(()=>{
    const room=getRoom(access.room.id)!;
    if(room.phase==='final'||room.phase==='closed'||room.coordination_pending||activePoll(room.id)||!modelPlanOption(room.id,key))return false;
    const brief=JSON.parse(room.brief_json) as Brief,prior=JSON.parse(room.locks_json) as PlanLocks;
    const locks:PlanLocks={...prior,rounds:prior.rounds??brief.rounds,...(option.date?{date:option.date}:{}),...(option.startHour!==null?{start:option.startHour,order:'play' as const}:{}),...(option.activity?{play:option.activity}:{}),...(option.area?{area:option.area}:{})};
    if(JSON.stringify(locks)===JSON.stringify(prior))return false;
    if(!negotiatePlan(brief,getMembers(room.id),locks))return false;
    const changed=db.prepare("UPDATE rooms SET locks_json=?,date=?,revision=revision+1,coordination_epoch=coordination_epoch+1,coordination_pending=1,phase='discussing',updated_at=? WHERE id=? AND revision=? AND phase!='final' AND coordination_pending=0").run(JSON.stringify(locks),locks.date??room.date,now(),room.id,room.revision);
    if(!changed.changes)return false;
    emitEvent(room.id,'model_plan','发起人采用了 AI 提出的讨论方向，正在核对成员条件并生成新版草案。');
    refreshBulletin(room.id);return true;
  })();
  if(!outcome)return fail(res,'建议与当前条件不兼容，或讨论已更新，请继续协商',409);
  scheduleRoom(access.room.id,50);scheduleSemanticCoordination(access.room.id);
  res.json(publicRoom(access.room.id,access.user.id));
});
app.post("/api/rooms/:id/decision",(req,res)=>{
  const access=roomMember(req,res);if(!access)return;
  if(access.room.phase==='final'||access.room.phase==='closed')return fail(res,'讨论已结束，不能改变决策参与状态',409);
  if(activePoll(access.room.id))return fail(res,'投票进行中，请稍后选择',409);
  const status=String(req.body.status??'');if(!['yes','no'].includes(status))return fail(res,'请选择参与或不参与方案决策');
  db.transaction(()=>{
    db.prepare('UPDATE members SET decision_status=? WHERE room_id=? AND user_id=?').run(status,access.room.id,access.user.id);
    if(status==='no'&&access.room.current_proposal_id)db.prepare('DELETE FROM confirmations WHERE proposal_id=? AND user_id=?').run(access.room.current_proposal_id,access.user.id);
    finalizeIfReady(access.room.id);
    refreshBulletin(access.room.id);
  })();scheduleSemanticCoordination(access.room.id);res.json(publicRoom(access.room.id,access.user.id));
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
    if(room.phase==="final")return decision==='accept'&&!!db.prepare("SELECT 1 FROM confirmations WHERE proposal_id=? AND user_id=? AND decision='accept'").get(proposal.id,access.user.id)?null:"聚会已定案，不能修改方案确认";
    const missing=finalizationMissing(proposal.plan);
    if(missing.length)return `还需确定：${missing.join("、")}。可以用私聊或投票解决后再确认`;
    db.prepare("UPDATE members SET decision_status='yes' WHERE room_id=? AND user_id=?").run(access.room.id,access.user.id);
    db.prepare("INSERT INTO confirmations(proposal_id,user_id,decision,updated_at) VALUES(?,?,?,?) ON CONFLICT(proposal_id,user_id) DO UPDATE SET decision=excluded.decision,updated_at=excluded.updated_at").run(proposal.id,access.user.id,decision,now());
    if(decision==="reject")db.prepare("INSERT INTO messages(id,room_id,user_id,role,body,created_at) VALUES(?,?,?,'assistant',?,?)").run(uid(),access.room.id,access.user.id,"哪一部分不合适？可以直接说时间、区域、顺序、吃什么、玩什么或具体预算。我会先私下理解，再决定是否发起投票。",now());
    finalizeIfReady(access.room.id);
    refreshBulletin(access.room.id);
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
  if(!["date","food","play","time","order","rounds","area","budgetMeal","budgetPlay1","budgetPlay2","budgetAfter"].includes(facet))return fail(res,"无效的投票主题");
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
db.transaction(()=>{for(const row of db.prepare('SELECT id FROM rooms WHERE NOT EXISTS (SELECT 1 FROM room_bulletins WHERE room_id=rooms.id)').all() as {id:string}[])refreshBulletin(row.id);})();
recoverPublicSummaries();
recoverPublicGuidance();
recoverSemanticCoordination();
app.listen(port,"0.0.0.0",()=>{recoverPendingCoordination();console.log(`Weekend Host ready at http://localhost:${port}`);});
