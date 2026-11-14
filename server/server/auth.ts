import crypto from "node:crypto";
import type { Request, Response } from "express";
import { db, getUser, now, uid } from "./db";

const hash=(token:string)=>crypto.createHash("sha256").update(token).digest("hex");
const cookie=(req:Request,name:string)=>{const raw=req.headers.cookie??"";return raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)??"";};
export function currentUser(req:Request){
  const authorization=req.headers.authorization??"";const token=authorization.startsWith("Bearer ")?authorization.slice(7):cookie(req,"weekend_session");if(!token)return null;
  const row=db.prepare("SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?").get(hash(token),now()) as {user_id:string}|undefined;
  return row?getUser(row.user_id)??null:null;
}
export function createSession(req:Request,res:Response,userId:string){
  const token=crypto.randomBytes(32).toString("base64url");
  const expiry=new Date(Date.now()+30*86400000).toISOString();
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(hash(token),userId,expiry);
  const secure=req.secure||req.headers["x-forwarded-proto"]==="https";
  res.setHeader("Set-Cookie",`weekend_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30*86400}${secure?"; Secure":""}`);
  return token;
}
export function clearSession(req:Request,res:Response){
  const authorization=req.headers.authorization??"";const token=authorization.startsWith("Bearer ")?authorization.slice(7):cookie(req,"weekend_session");if(token)db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(token));
  res.setHeader("Set-Cookie","weekend_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
}
export function register(username:string,displayName:string,password:string){
  const salt=crypto.randomBytes(16).toString("hex");
  const passwordHash=crypto.scryptSync(password,salt,64).toString("hex");
  const user={id:uid(),username:username.trim().toLowerCase(),displayName:displayName.trim(),passwordHash,salt,createdAt:now()};
  db.prepare("INSERT INTO users(id,username,display_name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)").run(user.id,user.username,user.displayName,user.passwordHash,user.salt,user.createdAt);
  return user.id;
}
export function verify(username:string,password:string){
  const user=db.prepare("SELECT * FROM users WHERE username=?").get(username.trim().toLowerCase()) as {id:string;password_hash:string;salt:string}|undefined;
  if(!user)return null;
  const actual=crypto.scryptSync(password,user.salt,64);
  const expected=Buffer.from(user.password_hash,"hex");
  return expected.length===actual.length&&crypto.timingSafeEqual(actual,expected)?user.id:null;
}
