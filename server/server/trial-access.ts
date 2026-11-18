import crypto from 'node:crypto';
import type {Request,Response,NextFunction} from 'express';
import {currentUser} from './auth';
import {currentGuest} from './guest';

const inviteCode=process.env.TRIAL_INVITE_CODE?.trim();
if(inviteCode&&inviteCode.length<16)throw Error('TRIAL_INVITE_CODE must contain at least 16 characters');
const buckets=new Map<string,{count:number;expires:number}>();

function allowed(key:string,limit:number,windowMs:number){
  const time=Date.now(),previous=buckets.get(key);
  const current=previous&&previous.expires>time?previous:{count:0,expires:time+windowMs};
  if(current.count>=limit)return false;
  current.count++;
  buckets.set(key,current);
  return true;
}

function equalCode(input:unknown){
  if(typeof input!=='string'||!inviteCode||input.length>128)return false;
  const expected=crypto.createHash('sha256').update(inviteCode).digest();
  const actual=crypto.createHash('sha256').update(input.trim()).digest();
  return crypto.timingSafeEqual(actual,expected);
}

export function trialAccess(req:Request,res:Response,next:NextFunction){
  if(!inviteCode)return next();
  const ip=req.ip??'unknown';
  if(req.method==='POST'&&['/api/register','/api/guest/register'].includes(req.path)){
    if(!allowed(`register:${ip}`,12,60*60*1000))return res.status(429).json({error:'注册尝试过多，请稍后再试'});
    if(!equalCode(req.body?.inviteCode))return res.status(403).json({error:'内测邀请码不正确'});
  }
  if(req.method==='POST'&&['/api/login','/api/guest/login'].includes(req.path)&&!allowed(`login:${ip}`,30,15*60*1000))return res.status(429).json({error:'登录尝试过多，请稍后再试'});
  const aiAction=req.method==='POST'&&(/^\/api\/intents\/preview$|^\/api\/circles\/[^/]+\/intents$|^\/api\/rooms\/[^/]+\/(answer|message|share)$|^\/api\/rooms\/[^/]+\/coordination\/(plan|[^/]+\/answer)$/.test(req.path))||req.method==='PATCH'&&/^\/api\/intents\/[^/]+$/.test(req.path);
  if(aiAction){
    const user=currentUser(req)??currentGuest(req);
    if(user&&!allowed(`ai:${user.id}`,40,24*60*60*1000))return res.status(429).json({error:'今天的 AI 试用次数已用完，请明天继续'});
  }
  next();
}
