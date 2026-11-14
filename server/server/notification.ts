import {Router} from "express";
import {db,now,uid} from "./db";
import {currentUser} from "./auth";

const router=Router();
export function enqueueNotification(userId:string,kind:string,payload:Record<string,unknown>,key:string){
  db.prepare("INSERT OR IGNORE INTO notification_outbox(id,user_id,kind,payload_json,status,created_at,dedupe_key) VALUES(?,?,?,?,'pending',?,?)").run(uid(),userId,kind,JSON.stringify(payload),now(),key);
}
router.get("/notifications",(req,res)=>{
  const user=currentUser(req);if(!user)return res.status(401).json({error:"请先登录"});
  const rows=db.prepare("SELECT id,kind,payload_json AS payloadJson,status,created_at AS createdAt,delivered_at AS readAt FROM notification_outbox WHERE user_id=? ORDER BY created_at DESC LIMIT 100").all(user.id) as {id:string;kind:string;payloadJson:string;status:string;createdAt:string;readAt:string|null}[];
  res.json({notifications:rows.map(({payloadJson,...row})=>({...row,payload:JSON.parse(payloadJson)}))});
});
router.post("/notifications/:id/read",(req,res)=>{
  const user=currentUser(req);if(!user)return res.status(401).json({error:"请先登录"});
  const row=db.prepare("SELECT id FROM notification_outbox WHERE id=? AND user_id=?").get(req.params.id,user.id);
  if(!row)return res.status(404).json({error:"通知不存在"});
  db.prepare("UPDATE notification_outbox SET status='read',delivered_at=COALESCE(delivered_at,?) WHERE id=? AND user_id=?").run(now(),req.params.id,user.id);
  res.json({ok:true});
});
export default router;
