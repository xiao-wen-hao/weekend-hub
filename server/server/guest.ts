import crypto from 'node:crypto';
import {Router,type Request,type Response} from 'express';
import {currentUser} from './auth';
import {createSession,register,verify} from './auth';
import {db,getRoom,isMember,now,uid} from './db';
import {refreshBulletin} from './bulletin';
import {scheduleSemanticCoordination} from './semantic-coordination';
import {updatePublicGuidance} from './public-guidance';
import {emitEvent,scheduleRoom} from './coordinator';

const router=Router();
const digest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
const cookie=(req:Request,name:string)=>(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)??'';
const webOnly=(req:Request,res:Response)=>{if(['android','wechat'].includes(String(req.headers['x-client-platform']??''))){res.status(403).json({error:'临时参与仅支持浏览器'});return false;}return true;};
export type Guest={id:string;display_name:string;linked_user_id:string|null};
function withdrawGuest(guestId:string){
  const affected=db.transaction(()=>{
    const seats=db.prepare("SELECT m.room_id AS roomId FROM members m JOIN guests g ON g.id=m.guest_id WHERE m.guest_id=? AND m.status='active' AND g.linked_user_id IS NULL").all(guestId) as {roomId:string}[];
    for(const seat of seats){
      db.prepare("UPDATE members SET status='left',decision_status='no' WHERE room_id=? AND guest_id=? AND status='active'").run(seat.roomId,guestId);
      db.prepare("UPDATE room_coordination_questions SET status='obsolete' WHERE room_id=? AND guest_id=? AND status='pending'").run(seat.roomId,guestId);
      db.prepare("UPDATE rooms SET revision=revision+1,coordination_epoch=coordination_epoch+1,coordination_pending=CASE WHEN current_proposal_id IS NULL THEN 0 ELSE 1 END,phase='discussing',updated_at=? WHERE id=? AND phase NOT IN ('final','closed')").run(now(),seat.roomId);
      emitEvent(seat.roomId,'guest_left','有临时参与者退出讨论，后续安排将按现有成员重新协调。');
      refreshBulletin(seat.roomId);
    }
    return seats;
  })();
  for(const seat of affected){scheduleRoom(seat.roomId);scheduleSemanticCoordination(seat.roomId);}
}
function retireExpiredGuests(){
  const guests=db.prepare("SELECT DISTINCT g.id FROM guests g JOIN members m ON m.guest_id=g.id AND m.status='active' WHERE g.linked_user_id IS NULL AND NOT EXISTS (SELECT 1 FROM guest_sessions s WHERE s.guest_id=g.id AND s.revoked_at IS NULL AND s.expires_at>?)").all(now()) as {id:string}[];
  for(const guest of guests)withdrawGuest(guest.id);
}
retireExpiredGuests();
setInterval(retireExpiredGuests,300000).unref();
export function currentGuest(req:Request):Guest|null{
  const token=cookie(req,'weekend_guest');
  if(!token)return null;
  return db.prepare("SELECT g.id,g.display_name,g.linked_user_id FROM guest_sessions s JOIN guests g ON g.id=s.guest_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND g.linked_user_id IS NULL").get(digest(token),now()) as Guest|undefined??null;
}
function session(req:Request,res:Response,guestId:string){
  const token=crypto.randomBytes(32).toString('base64url'),expires=new Date(Date.now()+7*86400000).toISOString();
  db.prepare('INSERT INTO guest_sessions(token_hash,guest_id,expires_at,created_at) VALUES(?,?,?,?)').run(digest(token),guestId,expires,now());
  const secure=req.secure||req.headers['x-forwarded-proto']==='https';
  res.setHeader('Set-Cookie',`weekend_guest=${token}; HttpOnly; Path=/api; SameSite=Lax; Max-Age=${7*86400}${secure?'; Secure':''}`);
}
const validInvite=(token:string)=>db.prepare("SELECT room_id AS roomId FROM room_invite_tokens WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL").get(digest(token),now()) as {roomId:string}|undefined;
router.get('/guest/invites/:token',(req,res)=>{
  if(!webOnly(req,res))return;
  const invite=validInvite(String(req.params.token));if(!invite)return res.status(404).json({error:'邀请已失效'});
  const room=db.prepare("SELECT r.id,r.title,r.date,r.phase,u.display_name AS hostName FROM rooms r JOIN users u ON u.id=r.created_by WHERE r.id=?").get(invite.roomId) as {id:string;title:string;date:string;phase:string;hostName:string}|undefined;
  if(!room||room.phase==='closed'||room.phase==='final')return res.status(410).json({error:'讨论已结束'});
  res.json({room});
});
router.post('/guest/invites/:token/join',(req,res)=>{
  if(!webOnly(req,res))return;
  retireExpiredGuests();
  const invite=validInvite(String(req.params.token));if(!invite)return res.status(404).json({error:'邀请已失效'});
  const room=getRoom(invite.roomId);if(!room||room.phase==='closed'||room.phase==='final')return res.status(410).json({error:'讨论已结束'});
  const prior=currentGuest(req);
  if(prior&&db.prepare("SELECT 1 FROM members WHERE room_id=? AND guest_id=? AND status='active'").get(room.id,prior.id))return res.json({guest:{id:prior.id,name:prior.display_name},roomId:room.id});
  if(prior)return res.status(409).json({error:'当前临时身份已加入另一场讨论，请先注册或登录以保存记录'});
  const name=String(req.body.name??'').trim().slice(0,30);if(!name)return res.status(400).json({error:'请填写昵称'});
  const id=uid(),stamp=now();
  const added=db.transaction(()=>{
    if((db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=? AND status='active'").get(room.id) as {n:number}).n>=10)return false;
    db.prepare('INSERT INTO guests(id,display_name,created_at) VALUES(?,?,?)').run(id,name,stamp);
    db.prepare("INSERT INTO members(room_id,guest_id,joined_at,decision_status) VALUES(?,?,?,'undecided')").run(room.id,id,stamp);
    db.prepare('INSERT INTO preferences(room_id,guest_id,data_json,updated_at) VALUES(?,?,?,?)').run(room.id,id,'{}',stamp);
    return true;
  })();
  if(!added)return res.status(409).json({error:'这场讨论的成员已满'});
  session(req,res,id);
  res.status(201).json({guest:{id,name},roomId:room.id});
});
router.get('/guest/me',(req,res)=>{
  if(!webOnly(req,res))return;
  retireExpiredGuests();
  const guest=currentGuest(req);if(!guest)return res.status(401).json({error:'临时会话已失效'});
  const rooms=db.prepare("SELECT r.id,r.title FROM rooms r JOIN members m ON m.room_id=r.id WHERE m.guest_id=? AND m.status='active'").all(guest.id);
  res.json({guest:{id:guest.id,name:guest.display_name},rooms});
});
router.post('/guest/logout',(req,res)=>{
  if(!webOnly(req,res))return;
  const visitor=currentGuest(req);
  const token=cookie(req,'weekend_guest');if(token)db.prepare('UPDATE guest_sessions SET revoked_at=? WHERE token_hash=?').run(now(),digest(token));
  if(visitor)withdrawGuest(visitor.id);
  res.setHeader('Set-Cookie','weekend_guest=; HttpOnly; Path=/api; SameSite=Lax; Max-Age=0');res.json({ok:true});
});
function claimGuest(guestId:string,userId:string){
    return db.transaction(()=>{
      const stamp=now();
      const updated=db.prepare('UPDATE guests SET linked_user_id=?,linked_at=? WHERE id=? AND linked_user_id IS NULL').run(userId,stamp,guestId);
      if(updated.changes!==1)throw Error('guest_already_linked');
      const seats=db.prepare("SELECT room_id AS roomId,decision_status AS decisionStatus,joined_at AS joinedAt FROM members WHERE guest_id=? AND status='active'").all(guestId) as {roomId:string;decisionStatus:string;joinedAt:string}[];
      for(const seat of seats){
        const existing=db.prepare("SELECT 1 FROM members WHERE room_id=? AND user_id=? AND status='active'").get(seat.roomId,userId);
        if(!existing){
          db.prepare('INSERT INTO members(room_id,user_id,joined_at,decision_status) VALUES(?,?,?,?)').run(seat.roomId,userId,seat.joinedAt,seat.decisionStatus);
          const preference=db.prepare('SELECT data_json AS dataJson,updated_at AS updatedAt FROM preferences WHERE room_id=? AND guest_id=?').get(seat.roomId,guestId) as {dataJson:string;updatedAt:string}|undefined;
          db.prepare('INSERT OR IGNORE INTO preferences(room_id,user_id,data_json,updated_at) VALUES(?,?,?,?)').run(seat.roomId,userId,preference?.dataJson??'{}',preference?.updatedAt??stamp);
          const plan=getRoom(seat.roomId)?.current_proposal_id;
          if(plan){
            db.prepare('INSERT OR IGNORE INTO confirmations(proposal_id,user_id,decision,updated_at) SELECT proposal_id,?,decision,updated_at FROM confirmations WHERE proposal_id=? AND guest_id=?').run(userId,plan,guestId);
            db.prepare('INSERT OR IGNORE INTO attendance(proposal_id,segment_id,user_id,decision,updated_at) SELECT proposal_id,segment_id,?,decision,updated_at FROM attendance WHERE proposal_id=? AND guest_id=?').run(userId,plan,guestId);
          }
          db.prepare("INSERT OR IGNORE INTO poll_votes(poll_id,user_id,option_id,updated_at) SELECT poll_id,?,option_id,updated_at FROM poll_votes WHERE guest_id=? AND poll_id IN (SELECT id FROM polls WHERE room_id=? AND status='open')").run(userId,guestId,seat.roomId);
        }
        db.prepare("UPDATE members SET status='merged',merged_into_user_id=? WHERE room_id=? AND guest_id=? AND status='active'").run(userId,seat.roomId,guestId);
      }
      db.prepare("UPDATE room_coordination_questions SET status='obsolete' WHERE guest_id=? AND status='pending'").run(guestId);
      db.prepare('UPDATE guest_sessions SET revoked_at=? WHERE guest_id=? AND revoked_at IS NULL').run(stamp,guestId);
      for(const seat of seats){db.prepare('DELETE FROM room_public_guidance WHERE room_id=?').run(seat.roomId);refreshBulletin(seat.roomId);}
      return seats.map(seat=>seat.roomId);
    })();
}
function finishClaim(req:Request,res:Response,userId:string,visitor:Guest,token:string){
  res.append('Set-Cookie','weekend_guest=; HttpOnly; Path=/api; SameSite=Lax; Max-Age=0');
  const user=db.prepare('SELECT id,username,display_name AS name FROM users WHERE id=?').get(userId);
  const linkedRooms=db.prepare('SELECT room_id AS roomId FROM members WHERE merged_into_user_id=? AND guest_id=?').all(userId,visitor.id) as {roomId:string}[];
  for(const entry of linkedRooms){try{scheduleSemanticCoordination(entry.roomId);void updatePublicGuidance(entry.roomId);}catch(error){console.error('Guest coordination refresh failed',error);}}
  return res.json({user,linkedRooms,...(['android','wechat'].includes(String(req.headers['x-client-platform']))?{accessToken:token}:{})});
}
router.post('/guest/register',(req,res)=>{
  if(!webOnly(req,res))return;
  const visitor=currentGuest(req);if(!visitor)return res.status(401).json({error:'临时会话已失效'});
  const username=String(req.body.username??'').trim().toLowerCase(),name=String(req.body.name??'').trim(),password=String(req.body.password??'');
  if(!/^[a-z0-9_]{3,24}$/.test(username)||name.length<1||name.length>30||password.length<8||password.length>128)return res.status(400).json({error:'用户名需 3–24 位字母/数字/下划线，昵称 1–30 字，密码至少 8 位'});
  if(db.prepare('SELECT 1 FROM users WHERE username=?').get(username))return res.status(409).json({error:'用户名已被使用'});
  let result:{id:string;token:string};try{result=db.transaction(()=>{const created=register(username,name,password);claimGuest(visitor.id,created);return {id:created,token:createSession(req,res,created)};})();}catch(error){console.error('Guest registration failed',error);return res.status(409).json({error:'注册失败，临时会话仍然有效'});}return finishClaim(req,res,result.id,visitor,result.token);
});
router.post('/guest/login',(req,res)=>{
  if(!webOnly(req,res))return;
  const visitor=currentGuest(req);if(!visitor)return res.status(401).json({error:'临时会话已失效'});
  const id=verify(String(req.body.username??''),String(req.body.password??''));if(!id)return res.status(401).json({error:'用户名或密码不正确'});
  let token:string;try{token=db.transaction(()=>{claimGuest(visitor.id,id);return createSession(req,res,id);})();}catch(error){console.error('Guest login claim failed',error);return res.status(409).json({error:'关联失败，临时会话仍然有效'});}return finishClaim(req,res,id,visitor,token);
});
router.post('/rooms/:id/guest-invites',(req,res)=>{
  const user=currentUser(req),room=getRoom(String(req.params.id));
  if(!user)return res.status(401).json({error:'请先登录'});
  if(!room)return res.status(404).json({error:'讨论间不存在'});
  if(room.created_by!==user.id||!isMember(room.id,user.id))return res.status(403).json({error:'只有发起人可以邀请'});
  if(room.phase==='closed'||room.phase==='final')return res.status(409).json({error:'讨论已结束'});
  const token=crypto.randomBytes(32).toString('base64url'),id=uid(),expiresAt=new Date(Date.now()+7*86400000).toISOString();
  db.prepare('INSERT INTO room_invite_tokens(id,room_id,token_hash,created_by,expires_at,created_at) VALUES(?,?,?,?,?,?)').run(id,room.id,digest(token),user.id,expiresAt,now());
  res.status(201).json({id,token,roomId:room.id,expiresAt});
});
router.delete('/rooms/:id/guest-invites/:inviteId',(req,res)=>{
  const user=currentUser(req),room=getRoom(String(req.params.id));
  if(!user)return res.status(401).json({error:'请先登录'});
  if(!room)return res.status(404).json({error:'讨论间不存在'});
  if(room.created_by!==user.id)return res.status(403).json({error:'只有发起人可以撤销'});
  const result=db.prepare('UPDATE room_invite_tokens SET revoked_at=? WHERE id=? AND room_id=? AND revoked_at IS NULL').run(now(),req.params.inviteId,room.id);
  if(!result.changes)return res.status(404).json({error:'邀请不存在或已撤销'});
  res.json({ok:true});
});
export default router;
