import assert from "node:assert/strict";
import type { Brief } from "../shared/domain";

const base=process.env.TEST_BASE_URL??"http://127.0.0.1:3000";
const seed=Math.random().toString(36).slice(2,9);
type Client={cookie:string;name:string};
async function call<T>(client:Client|null,path:string,method="GET",body?:unknown):Promise<T>{
  const response=await fetch(`${base}${path}`,{method,headers:{...(client?{Cookie:client.cookie}:{}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json() as T & {error?:string};
  if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${data.error}`);
  if(client){const cookie=response.headers.get("set-cookie");if(cookie)client.cookie=cookie.split(";")[0];}
  return data;
}
async function createClient(name:string):Promise<Client>{
  const client={cookie:"",name};
  await call(client,"/api/register","POST",{username:`flow_${seed}_${name}`,name,password:"LocalTest#2026"});
  assert.ok(client.cookie);
  return client;
}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

const [host,a,b]=await Promise.all([createClient("host"),createClient("a"),createClient("b")]);
const brief:Brief={title:`流程测试 ${seed}`,date:"2026-11-14",timeWindow:"noon",area:"学校附近",food:"火锅",play:"桌游",secondPlay:null,rounds:1,order:"eat",after:false,budget:{meal:120,play1:80,play2:null,after:null},note:""};
const created=await call<{id:string}>(host,"/api/rooms","POST",brief);
const roomId=created.id;
await call(a,`/api/rooms/${roomId}/join`,"POST",{});
await call(b,`/api/rooms/${roomId}/join`,"POST",{});
type Room={room:{phase:string};proposal:{id:string;version:number;plan:{segments:{id:string;kind:string;category:string}[]};confirmed:number;attendance:{name:string;decision:string}[]};poll:{id:string;facet:string;options:{id:string}[]}|null;messages:{body:string}[]};
const first=await call<Room>(host,`/api/rooms/${roomId}`);
assert.equal(first.proposal.version,1);
await call(a,`/api/rooms/${roomId}/message`,"POST",{text:"我更想吃烤肉"});
const privateCheck=await call<Room>(host,`/api/rooms/${roomId}`);
assert.ok(!privateCheck.messages.some(m=>m.body.includes("我更想吃烤肉")));
await call(b,`/api/rooms/${roomId}/message`,"POST",{text:"我想吃火锅"});
await sleep(1400);
let state=await call<Room>(host,`/api/rooms/${roomId}`);
assert.equal(state.poll?.facet,"food");
const options=state.poll!.options;
await call(host,`/api/rooms/${roomId}/polls/${state.poll!.id}/vote`,"POST",{optionId:options[0].id});
await call(a,`/api/rooms/${roomId}/polls/${state.poll!.id}/vote`,"POST",{optionId:options[1].id});
await call(b,`/api/rooms/${roomId}/polls/${state.poll!.id}/vote`,"POST",{optionId:options[0].id});
await sleep(900);
state=await call<Room>(host,`/api/rooms/${roomId}`);
assert.equal(state.poll,null);
const revisions=await call<{notifications:{kind:string;payload:{roomId?:string;version?:number;changes?:string[]}}[]}>(host,"/api/notifications");
assert.ok(revisions.notifications.some(n=>n.kind==="plan_updated"&&n.payload.roomId===roomId&&n.payload.version===state.proposal.version));
const proposalId=state.proposal.id;
await call(host,`/api/rooms/${roomId}/attendance`,"POST",{proposalId,segmentId:"meal",decision:"yes"});
const afterRsvp=await call<Room>(a,`/api/rooms/${roomId}`);
assert.ok(afterRsvp.proposal.attendance.some(x=>x.name==="host"&&x.decision==="yes"));
await call(host,`/api/rooms/${roomId}/confirm`,"POST",{proposalId,decision:"accept"});
await call(a,`/api/rooms/${roomId}/confirm`,"POST",{proposalId,decision:"accept"});
await call(b,`/api/rooms/${roomId}/confirm`,"POST",{proposalId,decision:"accept"});
state=await call<Room>(host,`/api/rooms/${roomId}`);
assert.equal(state.room.phase,"final");
assert.equal(state.proposal.confirmed,3);
const finalNotices=await call<{notifications:{kind:string;payload:{roomId?:string}}[]}>(a,"/api/notifications");
assert.ok(finalNotices.notifications.some(n=>n.kind==="room_final"&&n.payload.roomId===roomId));
console.log(JSON.stringify({ok:true,roomId,version:state.proposal.version,privateMessagesIsolated:true,pollClosed:true,confirmed:3}));
