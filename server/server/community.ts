import { Router } from "express";
import crypto from "node:crypto";
import { db, now, uid } from "./db";
import { currentUser } from "./auth";
import { initialPlan } from "../shared/planner";
import { FOODS, PLAYS } from "../shared/domain";
import type { Brief } from "../shared/domain";
import { interpretIntent } from "./intent-parser";
import { nextSaturdayShanghai } from "../shared/calendar";
import { enqueueNotification } from "./notification";
import {refreshBulletin} from "./bulletin";
import {assessMatch} from './semantic-match';

const router=Router();

const auth=(req:any,res:any)=>{const u=currentUser(req);if(!u)res.status(401).json({error:"请先登录"});return u;};
const inCircle=(circleId:string,userId:string)=>!!db.prepare("SELECT 1 FROM circle_members WHERE circle_id=? AND user_id=? AND status='active'").get(circleId,userId);
router.post("/intents/preview",async (req,res)=>{const u=auth(req,res);if(!u)return;const raw=String(req.body.text??"").trim().slice(0,500);if(!raw)return res.status(400).json({error:"请输入想做的事"});res.json({...await interpretIntent(raw),pending:true});});
function expireCandidates(circleId?:string){
  if(circleId)db.prepare("UPDATE candidates SET status='expired' WHERE circle_id=? AND status='probing' AND expires_at<=?").run(circleId,now());
  else db.prepare("UPDATE candidates SET status='expired' WHERE status='probing' AND expires_at<=?").run(now());
}
async function discover(circleId:string){
  expireCandidates(circleId);
  const rows=db.prepare("SELECT i.* FROM intents i JOIN circle_members cm ON cm.circle_id=i.circle_id AND cm.user_id=i.owner_id AND cm.status='active' WHERE i.circle_id=? AND i.status='active' AND i.confirmed_at IS NOT NULL AND i.match_allowed=1 AND i.contact_allowed=1 AND i.expires_at>? ORDER BY i.created_at DESC").all(circleId,now()) as any[];
  const byCategory=new Map<string,any[]>();for(const row of rows){if(!row.category)continue;byCategory.set(row.category,[...(byCategory.get(row.category)??[]),row]);}
  for(const [category,items] of byCategory){
    const windows=[...new Set(items.map(i=>i.window_id).filter(Boolean))] as string[];
    if(!windows.length)windows.push('unsure');
    let chosen:{windowId:string;members:any[];explicit:number}|null=null;
    for(const windowId of windows){const unique=[...new Map(items.filter(i=>!i.window_id||i.window_id===windowId).reverse().map(i=>[i.owner_id,i])).values()].slice(0,10);const explicit=unique.filter(i=>i.window_id===windowId).length;if(unique.length>=2&&(!chosen||unique.length>chosen.members.length||unique.length===chosen.members.length&&explicit>chosen.explicit))chosen={windowId,members:unique,explicit};}
    if(!chosen)continue;
    const assessment=await assessMatch(chosen.members.map(i=>String(i.raw_text)));
    if(!assessment.related)continue;
    // The model may take seconds. Never publish a candidate based on revoked
    // consent, changed category, or a member who left during that call.
    const stillEligible=chosen.members.every(i=>db.prepare("SELECT 1 FROM intents i JOIN circle_members m ON m.circle_id=i.circle_id AND m.user_id=i.owner_id AND m.status='active' WHERE i.id=? AND i.circle_id=? AND i.status='active' AND i.confirmed_at IS NOT NULL AND i.match_allowed=1 AND i.contact_allowed=1 AND i.category=? AND (i.window_id IS NULL OR i.window_id=?) AND i.expires_at>?").get(i.id,circleId,category,chosen.windowId,now()));
    if(!stillEligible)continue;
    const users=chosen.members.map(x=>x.owner_id).sort();
    const memberKey=crypto.createHash('sha256').update(`${circleId}|${category}|${chosen.windowId}|${users.join(',')}|${Math.floor(Date.now()/(7*86400000))}`).digest('hex');
    const areas=[...new Set(chosen.members.map(i=>{try{return JSON.parse(i.parsed_json||'{}').area as string|null}catch{return null}}).filter(Boolean))];
    const reason={activity:category,time:chosen.windowId==='unsure'?'时间待商量':chosen.windowId,source:assessment.source,summary:`圈内 ${users.length} 位成员的活动意愿相近${chosen.windowId==='unsure'?'，具体时段待商量':'，时间范围可协调'}${areas.length>1?'；区域尚需商量':''}。只有明确回应后才会开局。`};
    db.transaction(()=>{const id=uid();const result=db.prepare("INSERT OR IGNORE INTO candidates(id,circle_id,category,window_id,status,member_key,created_at,expires_at,match_reason_json) VALUES(?,?,?,?,'probing',?,?,?,?)").run(id,circleId,category,chosen.windowId,memberKey,now(),new Date(Date.now()+48*3600000).toISOString(),JSON.stringify(reason));if(result.changes)for(const userId of users){db.prepare("INSERT INTO candidate_members(candidate_id,user_id,response) VALUES(?,?,'pending')").run(id,userId);enqueueNotification(userId,'candidate',{circleId,candidateId:id,category,windowId:chosen.windowId},`candidate:${id}:${userId}`);}})();
  }
}
router.get("/circles",(req,res)=>{const u=auth(req,res);if(!u)return;res.json({circles:db.prepare("SELECT c.id,c.name,c.join_code AS joinCode,m.role FROM circles c JOIN circle_members m ON m.circle_id=c.id WHERE m.user_id=? AND m.status='active' ORDER BY c.created_at DESC").all(u.id)});});
router.get('/circles/:id/discussions',(req,res)=>{const u=auth(req,res);if(!u)return;if(!inCircle(req.params.id,u.id))return res.status(403).json({error:'无权访问'});const rooms=db.prepare("SELECT r.id,r.title,r.date,r.phase,r.updated_at AS updatedAt,(SELECT COUNT(*) FROM members WHERE room_id=r.id) AS memberCount FROM candidates c JOIN rooms r ON r.id=c.room_id JOIN members m ON m.room_id=r.id AND m.user_id=? WHERE c.circle_id=? AND c.status='opened' ORDER BY r.updated_at DESC").all(u.id,req.params.id);res.json({rooms});});
router.post("/circles",(req,res)=>{const u=auth(req,res);if(!u)return;const name=String(req.body.name??"").trim().slice(0,40);if(!name)return res.status(400).json({error:"请填写圈子名称"});const id=uid(),code=crypto.randomBytes(4).toString("hex");db.transaction(()=>{db.prepare("INSERT INTO circles(id,name,owner_id,join_code,created_at,invite_expires_at) VALUES(?,?,?,?,?,?)").run(id,name,u.id,code,now(),new Date(Date.now()+7*86400000).toISOString());db.prepare("INSERT INTO circle_members(circle_id,user_id,role) VALUES(?,?,'owner')").run(id,u.id);})();res.status(201).json({id,joinCode:code});});
router.post("/circles/join",(req,res)=>{const u=auth(req,res);if(!u)return;const circle=db.prepare("SELECT id FROM circles WHERE join_code=? AND invite_expires_at>?").get(String(req.body.code??"").trim(),now()) as {id:string}|undefined;if(!circle)return res.status(404).json({error:"邀请码无效或已过期"});db.prepare("INSERT INTO circle_members(circle_id,user_id,role,status) VALUES(?,?,'member','active') ON CONFLICT(circle_id,user_id) DO UPDATE SET status='active'").run(circle.id,u.id);res.json({id:circle.id});});
router.get("/circles/:id/intents",(req,res)=>{const u=auth(req,res);if(!u)return;if(!inCircle(req.params.id,u.id))return res.status(403).json({error:"无权访问"});res.json({intents:db.prepare("SELECT id,raw_text AS rawText,category,window_id AS windowId,status,match_allowed AS matchAllowed,contact_allowed AS contactAllowed,expires_at AS expiresAt,parsed_json AS parsedJson,confirmed_at AS confirmedAt FROM intents WHERE circle_id=? AND owner_id=? ORDER BY created_at DESC").all(req.params.id,u.id)});});
router.post("/circles/:id/intents",async (req,res)=>{const u=auth(req,res);if(!u)return;if(!inCircle(req.params.id,u.id))return res.status(403).json({error:"无权访问"});const rawText=String(req.body.text??"").trim().slice(0,500);if(!rawText)return res.status(400).json({error:"请输入想做的事"});const parsed=await interpretIntent(rawText);const category=req.body.category===null?null:([ ...FOODS,...PLAYS] as string[]).includes(req.body.category)?req.body.category:parsed.category;const windowId=req.body.windowId===null?null:["morning","noon","afternoon","evening"].includes(req.body.windowId)?req.body.windowId:parsed.windowId;const matchAllowed=req.body.matchAllowed===true?1:0,contactAllowed=req.body.contactAllowed===true?1:0;if(contactAllowed&&!matchAllowed)return res.status(400).json({error:"允许试探前需先允许匹配"});const confirmed=req.body.confirmed===true;
if(confirmed&&!category)return res.status(400).json({error:"请确认想做的活动后再投递"});
const id=uid(),stamp=now(),expiresAt=new Date(Date.now()+14*86400000).toISOString();
db.prepare("INSERT INTO intents(id,circle_id,owner_id,raw_text,category,window_id,status,match_allowed,contact_allowed,expires_at,created_at,parsed_json,confirmed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,req.params.id,u.id,rawText,category,windowId,confirmed?"active":"paused",matchAllowed,contactAllowed,expiresAt,stamp,JSON.stringify(parsed),confirmed?stamp:null);
if(confirmed)await discover(req.params.id);
res.status(201).json({id,rawText,category,windowId,status:confirmed?"active":"paused",confirmedAt:confirmed?stamp:null,evidence:parsed.evidence,source:parsed.source,matchAllowed:!!matchAllowed,contactAllowed:!!contactAllowed,expiresAt});});
router.patch("/intents/:id",async (req,res)=>{
  const u=auth(req,res);if(!u)return;
  const row=db.prepare("SELECT * FROM intents WHERE id=? AND owner_id=?").get(req.params.id,u.id) as any;
  if(!row)return res.status(404).json({error:"意愿不存在"});
  if(row.status==="withdrawn")return res.status(409).json({error:"已撤回的意愿不可重新投递，请新建"});
  if(!inCircle(row.circle_id,u.id))return res.status(403).json({error:"已退出熟人圈"});
  const rawText=req.body.text===undefined?row.raw_text:String(req.body.text??"").trim().slice(0,500);
  if(!rawText)return res.status(400).json({error:"请输入想做的事"});
  const textChanged=rawText!==row.raw_text;
  const parsed=textChanged?await interpretIntent(rawText):null;
  const validCategory=(v:unknown)=>v===null||([ ...FOODS,...PLAYS] as string[]).includes(String(v));
  const validWindow=(v:unknown)=>v===null||["morning","noon","afternoon","evening"].includes(String(v));
  if((req.body.category!==undefined&&!validCategory(req.body.category))||(req.body.windowId!==undefined&&!validWindow(req.body.windowId)))return res.status(400).json({error:"无效的活动或时段"});
  const category=req.body.category===undefined?(textChanged?parsed!.category:row.category):req.body.category;
  const windowId=req.body.windowId===undefined?(textChanged?parsed!.windowId:row.window_id):req.body.windowId;
  const fieldsChanged=textChanged||category!==row.category||windowId!==row.window_id;
  const confirmedAt=req.body.confirmed===true?now():fieldsChanged?null:row.confirmed_at;
  const requestedStatus=["active","paused"].includes(req.body.status)?req.body.status:row.status;
  const status=fieldsChanged&&!confirmedAt?"paused":requestedStatus;
  if(status==="active"&&(!confirmedAt||!category))return res.status(409).json({error:"请确认活动后再启用"});
  const matchAllowed=req.body.matchAllowed===undefined?row.match_allowed:Number(req.body.matchAllowed===true);
  const contactAllowed=req.body.contactAllowed===undefined?row.contact_allowed:Number(req.body.contactAllowed===true);
  if(contactAllowed&&!matchAllowed)return res.status(400).json({error:"允许试探前需先允许匹配"});
  db.transaction(()=>{
    db.prepare("UPDATE intents SET raw_text=?,category=?,window_id=?,status=?,match_allowed=?,contact_allowed=?,confirmed_at=?,parsed_json=? WHERE id=?").run(rawText,category,windowId,status,matchAllowed,contactAllowed,confirmedAt,parsed?JSON.stringify(parsed):row.parsed_json,row.id);
    const affected=db.prepare("SELECT c.id,c.category,c.window_id FROM candidates c JOIN candidate_members cm ON cm.candidate_id=c.id WHERE c.circle_id=? AND c.status='probing' AND cm.user_id=? AND cm.response!='withdrawn'").all(row.circle_id,u.id) as {id:string;category:string;window_id:string}[];
    for(const c of affected){
      const eligible=db.prepare("SELECT 1 FROM intents WHERE circle_id=? AND owner_id=? AND category=? AND (window_id IS NULL OR window_id=?) AND status='active' AND confirmed_at IS NOT NULL AND match_allowed=1 AND contact_allowed=1 AND expires_at>? LIMIT 1").get(row.circle_id,u.id,c.category,c.window_id,now());
      if(!eligible)db.prepare("UPDATE candidate_members SET response='withdrawn' WHERE candidate_id=? AND user_id=?").run(c.id,u.id);
      const possible=db.prepare("SELECT COUNT(*) AS count FROM candidate_members WHERE candidate_id=? AND response IN ('pending','yes','later')").get(c.id) as {count:number};
      if(possible.count<2)db.prepare("UPDATE candidates SET status='closed' WHERE id=? AND status='probing'").run(c.id);
    }
  })();
  await discover(row.circle_id);
  res.json({id:row.id,rawText,category,windowId,status,confirmedAt,matchAllowed:!!matchAllowed,contactAllowed:!!contactAllowed});
});
router.post("/intents/:id/withdraw",(req,res)=>{const u=auth(req,res);if(!u)return;const row=db.prepare("SELECT circle_id FROM intents WHERE id=? AND owner_id=?").get(req.params.id,u.id) as {circle_id:string}|undefined;if(!row)return res.status(404).json({error:"意愿不存在"});db.transaction(()=>{db.prepare("UPDATE intents SET status='withdrawn' WHERE id=?").run(req.params.id);db.prepare("UPDATE candidate_members SET response='withdrawn' WHERE user_id=? AND candidate_id IN (SELECT id FROM candidates WHERE circle_id=? AND status='probing')").run(u.id,row.circle_id);db.prepare("UPDATE candidates SET status='closed' WHERE circle_id=? AND status='probing' AND (SELECT COUNT(*) FROM candidate_members WHERE candidate_id=candidates.id AND response IN ('pending','yes','later'))<2").run(row.circle_id);})();res.json({ok:true});});
router.get("/circles/:id/candidates",(req,res)=>{const u=auth(req,res);if(!u)return;if(!inCircle(req.params.id,u.id))return res.status(403).json({error:"无权访问"});expireCandidates(req.params.id);res.json({candidates:db.prepare("SELECT c.id,c.category,c.window_id AS windowId,c.status,c.expires_at AS expiresAt,c.room_id AS roomId,c.match_reason_json AS matchReasonJson,cm.response,(SELECT COUNT(*) FROM candidate_members x WHERE x.candidate_id=c.id) AS memberCount,(SELECT COUNT(*) FROM candidate_members x WHERE x.candidate_id=c.id AND x.response='yes') AS yesCount FROM candidates c JOIN candidate_members cm ON cm.candidate_id=c.id WHERE c.circle_id=? AND cm.user_id=? ORDER BY c.created_at DESC").all(req.params.id,u.id)});});
router.post("/candidates/:id/respond",(req,res)=>{const u=auth(req,res);if(!u)return;expireCandidates();const decision=String(req.body.decision??"");if(!["yes","no","later"].includes(decision))return res.status(400).json({error:"无效回应"});const c=db.prepare("SELECT * FROM candidates WHERE id=?").get(req.params.id) as any;if(!c||c.status!=="probing")return res.status(409).json({error:"候选局已关闭"});if(!db.prepare("SELECT 1 FROM candidate_members WHERE candidate_id=? AND user_id=?").get(c.id,u.id))return res.status(403).json({error:"不在候选成员中"});if(!inCircle(c.circle_id,u.id))return res.status(403).json({error:"已退出熟人圈"});if(decision==="yes"&&!db.prepare("SELECT 1 FROM intents WHERE circle_id=? AND owner_id=? AND category=? AND (window_id IS NULL OR window_id=?) AND status='active' AND confirmed_at IS NOT NULL AND match_allowed=1 AND contact_allowed=1 AND expires_at>?").get(c.circle_id,u.id,c.category,c.window_id,now()))return res.status(409).json({error:"意愿已撤回或授权已失效"});db.transaction(()=>{
  db.prepare("UPDATE candidate_members SET response=? WHERE candidate_id=? AND user_id=?").run(decision,c.id,u.id);
  const possible=db.prepare("SELECT COUNT(*) AS count FROM candidate_members cm JOIN circle_members m ON m.user_id=cm.user_id AND m.circle_id=? AND m.status='active' WHERE cm.candidate_id=? AND cm.response IN ('pending','yes','later')").get(c.circle_id,c.id) as {count:number};
  if(possible.count<2)db.prepare("UPDATE candidates SET status='closed' WHERE id=? AND status='probing'").run(c.id);
})();res.json({ok:true});});
router.post("/candidates/:id/open",(req,res)=>{
  const u=auth(req,res);if(!u)return;expireCandidates();
  const c=db.prepare("SELECT * FROM candidates WHERE id=?").get(req.params.id) as any;
  if(!c||c.status!=="probing")return res.status(409).json({error:"候选局不可开启"});
  const own=db.prepare("SELECT response FROM candidate_members WHERE candidate_id=? AND user_id=?").get(c.id,u.id) as {response:string}|undefined;
  if(!own||!inCircle(c.circle_id,u.id))return res.status(403).json({error:"不在候选成员中"});
  if(own.response!=="yes")return res.status(409).json({error:"请先明确表示愿意讨论"});
  const eligible=db.prepare("SELECT 1 FROM intents WHERE circle_id=? AND owner_id=? AND category=? AND (window_id IS NULL OR window_id=?) AND status='active' AND confirmed_at IS NOT NULL AND match_allowed=1 AND contact_allowed=1 AND expires_at>? LIMIT 1").get(c.circle_id,u.id,c.category,c.window_id,now());
  if(!eligible)return res.status(409).json({error:"意愿或授权已失效"});
  const invitees=db.prepare("SELECT cm.user_id AS userId FROM candidate_members cm JOIN circle_members m ON m.circle_id=? AND m.user_id=cm.user_id AND m.status='active' WHERE cm.candidate_id=? AND cm.user_id!=? AND cm.response IN ('pending','yes','later')").all(c.circle_id,c.id,u.id) as {userId:string}[];
  if(!invitees.length)return res.status(409).json({error:"需要至少一位可邀请的圈内成员"});
  const brief:Brief={title:`${c.category}讨论`,date:'待定',timeWindow:'unsure',area:'',food:'简餐',play:PLAYS.includes(c.category)?c.category:'散步聊天',secondPlay:null,rounds:1,order:'either',after:false,budget:{meal:null,play1:null,play2:null,after:null},note:''};
  const roomId=uid(),stamp=now();
  db.transaction(()=>{
    db.prepare("INSERT INTO rooms(id,title,date,mode,brief_json,phase,current_proposal_id,revision,locks_json,created_by,created_at,updated_at) VALUES(?,?,?,'blank',?,'draft',NULL,0,'{}',?,?,?)").run(roomId,brief.title,brief.date,JSON.stringify(brief),u.id,stamp,stamp);
    const claimed=db.prepare("UPDATE candidates SET status='opened',room_id=? WHERE id=? AND status='probing'").run(roomId,c.id);
    if(!claimed.changes)throw Error('candidate_already_opened');
    db.prepare("INSERT INTO members(room_id,user_id,joined_at) VALUES(?,?,?)").run(roomId,u.id,stamp);
    db.prepare("INSERT INTO preferences(room_id,user_id,data_json,updated_at) VALUES(?,?,'{}',?)").run(roomId,u.id,stamp);
    for(const x of invitees)enqueueNotification(x.userId,'discussion_invite',{roomId,candidateId:c.id,circleId:c.circle_id,category:c.category},`discussion_invite:${roomId}:${x.userId}`);
  })();refreshBulletin(roomId);res.status(201).json({roomId,invited:invitees.length});
});
export default router;
