import {Router} from "express";
import crypto from "node:crypto";
import {db,now} from "./db";
import {currentUser} from "./auth";
const router=Router();
const active=(circleId:string,userId:string)=>db.prepare("SELECT role FROM circle_members WHERE circle_id=? AND user_id=? AND status='active'").get(circleId,userId) as {role:string}|undefined;
router.get("/profile",(req,res)=>{const u=currentUser(req);if(!u)return res.status(401).json({error:"请先登录"});res.json({id:u.id,username:u.username,name:u.display_name});});
router.patch("/profile",(req,res)=>{const u=currentUser(req);if(!u)return res.status(401).json({error:"请先登录"});const name=String(req.body.name??"").trim();if(!name||name.length>30)return res.status(400).json({error:"昵称须为 1 至 30 字"});db.prepare("UPDATE users SET display_name=? WHERE id=?").run(name,u.id);res.json({id:u.id,username:u.username,name});});
router.get("/circles/:id/members",(req,res)=>{const u=currentUser(req);if(!u)return res.status(401).json({error:"请先登录"});if(!active(req.params.id,u.id))return res.status(403).json({error:"无权查看成员"});res.json({members:db.prepare("SELECT cm.user_id AS id,users.display_name AS name,cm.role FROM circle_members cm JOIN users ON users.id=cm.user_id WHERE cm.circle_id=? AND cm.status='active' ORDER BY cm.role='owner' DESC,users.display_name").all(req.params.id)});});
router.post("/circles/:id/invite/rotate",(req,res)=>{const u=currentUser(req);if(!u)return res.status(401).json({error:"请先登录"});const m=active(req.params.id,u.id);if(!m||!['owner','admin'].includes(m.role))return res.status(403).json({error:"只有管理员可以更新邀请"});const hours=Number(req.body.hours??168);if(!Number.isInteger(hours)||hours<1||hours>720)return res.status(400).json({error:"有效期须在 1 至 720 小时"});const code=crypto.randomBytes(8).toString('hex'),expiresAt=new Date(Date.now()+hours*3600000).toISOString();db.prepare("UPDATE circles SET join_code=?,invite_expires_at=? WHERE id=?").run(code,expiresAt,req.params.id);res.json({joinCode:code,expiresAt});});
router.post("/circles/:id/owner",(req,res)=>{
  const u=currentUser(req);if(!u)return res.status(401).json({error:"请先登录"});
  const circleId=req.params.id,targetId=String(req.body.userId??"");
  if(active(circleId,u.id)?.role!=="owner")return res.status(403).json({error:"只有圈主可以转交"});
  if(!targetId||targetId===u.id||!active(circleId,targetId))return res.status(400).json({error:"请选择其他在圈成员"});
  const changed=db.transaction(()=>{
    const update=db.prepare("UPDATE circles SET owner_id=? WHERE id=? AND owner_id=?").run(targetId,circleId,u.id);
    if(!update.changes)return false;
    db.prepare("UPDATE circle_members SET role='admin' WHERE circle_id=? AND user_id=?").run(circleId,u.id);
    db.prepare("UPDATE circle_members SET role='owner' WHERE circle_id=? AND user_id=?").run(circleId,targetId);
    return true;
  })();
  if(!changed)return res.status(409).json({error:"圈主已变更，请刷新"});
  res.json({ownerId:targetId});
});
router.post("/circles/:id/leave",(req,res)=>{const u=currentUser(req);if(!u)return res.status(401).json({error:"请先登录"});const m=active(req.params.id,u.id);if(!m)return res.status(403).json({error:"不是圈子成员"});if(m.role==='owner')return res.status(409).json({error:"圈主须先转交圈子"});db.transaction(()=>{db.prepare("UPDATE circle_members SET status='left' WHERE circle_id=? AND user_id=?").run(req.params.id,u.id);db.prepare("UPDATE candidate_members SET response='withdrawn' WHERE user_id=? AND candidate_id IN (SELECT id FROM candidates WHERE circle_id=? AND status='probing')").run(u.id,req.params.id);})();res.json({ok:true});});
export default router;
