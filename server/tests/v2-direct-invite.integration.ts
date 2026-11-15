import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';

const base=`http://127.0.0.1:${process.env.TEST_PORT??3112}/api`;
const users=Array.from({length:3},()=>{let cookie='';return async(route:string,method='GET',body?:unknown)=>{const response=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});cookie=response.headers.get('set-cookie')?.split(';',1)[0]??cookie;return {status:response.status,data:await response.json() as any};};});
const [a,b,c]=users;
const stamp=Date.now();const ids:string[]=[];
for(let i=0;i<3;i++){const r=await users[i]('/register','POST',{username:`v2invite_${stamp}_${i}`,name:`成员${i}`,password:'test-password-123'});assert.equal(r.status,201);ids.push(r.data.user?.id??r.data.id);}
const circle=(await a('/circles','POST',{name:'主动邀请测试圈'})).data;
for(const call of [b,c])assert.equal((await call('/circles/join','POST',{code:circle.joinCode})).status,200);
const members=(await a(`/circles/${circle.id}/members`)).data.members as {id:string;name:string}[];
assert.equal(members.length,3);
const invited=members.find(x=>x.name==='成员1')!;
const opened=await a('/rooms','POST',{mode:'blank',title:'周末徒步讨论',idea:'想约大家周末去爬山',circleId:circle.id,inviteeIds:[invited.id],date:'待定',timeWindow:'unsure',area:'',food:'简餐',play:'徒步',secondPlay:null,rounds:1,order:'either',after:false,budget:{meal:null,play1:null,play2:null,after:null},note:''});
assert.equal(opened.status,201,JSON.stringify(opened.data));const roomId=opened.data.id;
assert.equal((await a(`/rooms/${roomId}`)).data.room.date,'待定');
assert.equal((await b(`/rooms/${roomId}`)).data.joined,false);
assert.equal((await c(`/rooms/${roomId}`)).status,403);
assert.equal((await c(`/rooms/${roomId}/join`,'POST',{})).status,403);
assert.equal((await b(`/circles/${circle.id}/discussions`)).data.rooms.length,0);
assert.equal((await b(`/rooms/${roomId}/join`,'POST',{})).status,200);
assert.ok((await b(`/circles/${circle.id}/discussions`)).data.rooms.some((r:any)=>r.id===roomId));
assert.equal((await a(`/rooms/${roomId}/message`,'POST',{text:'私人预算秘密739'})).status,200);
assert.ok(!JSON.stringify((await b(`/rooms/${roomId}`)).data).includes('私人预算秘密739'));
const publicBody={mode:'blank',title:'公开起点',idea:'我想约周末徒步',publicText:'我想约周末徒步',circleId:circle.id,inviteeIds:[invited.id],date:'待定',timeWindow:'unsure',area:'',food:'简餐',play:'徒步',secondPlay:null,rounds:1,order:'either',after:false,budget:{meal:null,play1:null,play2:null,after:null},note:''};
assert.equal((await a('/rooms','POST',publicBody)).status,400,'public text needs explicit approval');
const publicRoom=await a('/rooms','POST',{...publicBody,explicitApproval:true});assert.equal(publicRoom.status,201);
assert.ok(JSON.stringify((await a(`/rooms/${publicRoom.data.id}`)).data.bulletin).includes('我想约周末徒步'));
assert.equal((await b(`/rooms/${publicRoom.data.id}/join`,'POST',{})).status,200);
assert.equal((await a(`/rooms/${publicRoom.data.id}/message`,'POST',{text:'私人理由：秘密口令518'})).status,200);
assert.equal((await b(`/rooms/${publicRoom.data.id}/share`,'POST',{publicText:'我也想周末去徒步',explicitApproval:true})).status,200);
if(process.env.EXPECT_MODEL_GUIDANCE){
  let seen=false;
  for(let i=0;i<160;i++){
    const state=(await a(`/rooms/${publicRoom.data.id}`)).data;
    if(JSON.stringify(state.bulletin?.content?.provisional??[]).includes('AI 发现两条公开想法')){seen=true;break;}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(seen,'real model should recognize two approved hiking ideas in the shared bulletin');
  const conflictRoom=await a('/rooms','POST',{...publicBody,title:'日期分歧讨论',idea:'周六想去徒步',publicText:'周六想去徒步',explicitApproval:true});
  assert.equal(conflictRoom.status,201);
  assert.equal((await b(`/rooms/${conflictRoom.data.id}/join`,'POST',{})).status,200);
  assert.equal((await b(`/rooms/${conflictRoom.data.id}/share`,'POST',{publicText:'周六没空，只能周日去徒步',explicitApproval:true})).status,200);
  let conflictSeen=false;
  for(let i=0;i<160;i++){
    const state=(await a(`/rooms/${conflictRoom.data.id}`)).data;
    if(JSON.stringify(state.bulletin?.content?.disagreements??[]).includes('AI 发现两条公开想法可能有分歧')){conflictSeen=true;break;}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(conflictSeen,'real model should identify the public Saturday/Sunday conflict');
}
assert.ok(!JSON.stringify((await b(`/rooms/${publicRoom.data.id}`)).data).includes('秘密口令518'));
const database=new Database(path.join(process.env.DATA_DIR!,'weekend.db'),{readonly:true});
try{assert.equal((database.prepare('SELECT count(*) AS n FROM members WHERE room_id=?').get(roomId) as {n:number}).n,2);assert.equal((database.prepare("SELECT count(*) AS n FROM room_circle_invites WHERE room_id=? AND status='accepted'").get(roomId) as {n:number}).n,2);assert.equal((database.prepare('SELECT count(*) AS n FROM proposals WHERE room_id=?').get(roomId) as {n:number}).n,0);assert.equal((database.prepare('SELECT count(*) AS n FROM room_public_shares WHERE room_id=?').get(publicRoom.data.id) as {n:number}).n,2);}finally{database.close();}
console.log(JSON.stringify({ok:true,roomId,invited:true,outsiderDenied:true,noAutoProposal:true}));
const inviteC=await b(`/rooms/${roomId}/invites`,'POST',{userId:ids[2]});assert.equal(inviteC.status,201,JSON.stringify(inviteC.data));
assert.equal((await a(`/rooms/${roomId}/invites`,'POST',{userId:ids[2]})).status,409,'duplicate pending invite must fail');
assert.equal((await c(`/rooms/${roomId}`)).data.joined,false);
assert.equal((await c(`/rooms/${roomId}/message`,'POST',{text:'未加入不能看或发言'})).status,403);
const cNotices=(await c('/notifications')).data.notifications;
assert.ok(cNotices.some((n:any)=>n.kind==='discussion_invite'&&n.status==='pending'&&n.payload.roomId===roomId));
assert.equal((await a(`/rooms/${roomId}/invites/${ids[2]}/revoke`,'POST',{})).status,409,'only inviter revokes');
assert.equal((await b(`/rooms/${roomId}/invites/${ids[2]}/revoke`,'POST',{})).status,200);
assert.equal((await c(`/rooms/${roomId}`)).status,403);
assert.equal((await c(`/rooms/${roomId}/join`,'POST',{})).status,403);
assert.equal((await b(`/rooms/${roomId}/invites`,'POST',{userId:ids[2]})).status,201);
assert.equal((await c(`/rooms/${roomId}/invites/respond`,'POST',{decision:'decline'})).status,200);
assert.equal((await c(`/rooms/${roomId}/join`,'POST',{})).status,403);
assert.equal((await b(`/rooms/${roomId}/invites`,'POST',{userId:ids[2]})).status,201);
assert.equal((await c(`/rooms/${roomId}/join`,'POST',{})).status,200);
assert.equal((await c(`/rooms/${roomId}`)).data.members.find((m:any)=>m.id===ids[2]).decisionStatus,'undecided','joining discussion is not decision opt-in');
assert.equal((await c(`/rooms/${roomId}/decision`,'POST',{status:'no'})).status,200);
assert.equal((await a(`/rooms/${roomId}`)).data.members.find((m:any)=>m.id===ids[2]).decisionStatus,'no');
assert.equal((await c(`/rooms/${roomId}/decision`,'POST',{status:'yes'})).status,200);
assert.equal((await b(`/rooms/${roomId}/invites`,'POST',{userId:ids[2]})).status,409,'joined member cannot be re-invited');
assert.equal((await c(`/rooms/${roomId}/leave`,'POST',{})).status,200);
assert.equal((await c(`/rooms/${roomId}/message`,'POST',{text:'退出后不能发言'})).status,403);
assert.equal((await c(`/rooms/${roomId}`)).status,403);
assert.equal((await a(`/rooms/${roomId}/leave`,'POST',{})).status,409,'host transfer required');
assert.equal((await a(`/rooms/${roomId}/leave`,'POST',{transferTo:ids[1]})).status,200);
assert.equal((await b(`/rooms/${roomId}`)).data.room.hostId,ids[1]);
assert.equal((await b(`/rooms/${roomId}/invites`,'POST',{userId:ids[2]})).status,201);
assert.equal((await b(`/rooms/${roomId}/leave`,'POST',{})).status,200,'sole host may close the room');
assert.equal((await c(`/rooms/${roomId}/join`,'POST',{})).status,403,'expired invitation cannot join a closed room');
const state=new Database(path.join(process.env.DATA_DIR!,'weekend.db'),{readonly:true});
try{
  assert.equal((state.prepare('SELECT COUNT(*) AS n FROM members WHERE room_id=?').get(roomId) as {n:number}).n,0);
  assert.equal((state.prepare("SELECT COUNT(*) AS n FROM room_circle_invites WHERE room_id=? AND status='expired'").get(roomId) as {n:number}).n,1);
  assert.equal((state.prepare("SELECT phase FROM rooms WHERE id=?").get(roomId) as {phase:string}).phase,'closed');
  assert.equal((state.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE kind='discussion_invite' AND status='pending' AND json_extract(payload_json,'$.roomId')=?").get(roomId) as {n:number}).n,0);
}finally{state.close();}
const template=await a('/rooms','POST',{mode:'template',title:'邀请到期验收',circleId:circle.id,inviteeIds:[ids[1],ids[2]],date:'2026-11-21',timeWindow:'noon',area:'学校附近',food:'火锅',play:'桌游',secondPlay:null,rounds:1,order:'eat',after:false,budget:{meal:100,play1:80,play2:null,after:null},note:''});
assert.equal(template.status,201,JSON.stringify(template.data));const finalRoomId=template.data.id;
assert.equal((await b(`/rooms/${finalRoomId}/join`,'POST',{})).status,200);
let ready:any;for(let i=0;i<40;i++){ready=(await a(`/rooms/${finalRoomId}`)).data;if(!ready.room.coordinationPending&&ready.proposal)break;await new Promise(resolve=>setTimeout(resolve,100));}
assert.ok(ready.proposal);assert.equal(ready.room.coordinationPending,false);
assert.equal((await a(`/rooms/${finalRoomId}/confirm`,'POST',{proposalId:ready.proposal.id,decision:'accept'})).status,200);
assert.equal((await b(`/rooms/${finalRoomId}/confirm`,'POST',{proposalId:ready.proposal.id,decision:'accept'})).data.room.phase,'final');
assert.equal((await c(`/rooms/${finalRoomId}`)).status,403,'pending invitation expires when room is finalized');
const expired=new Database(path.join(process.env.DATA_DIR!,'weekend.db'),{readonly:true});
try{assert.equal((expired.prepare('SELECT status FROM room_circle_invites WHERE room_id=? AND user_id=?').get(finalRoomId,ids[2]) as {status:string}).status,'expired');assert.equal((expired.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE user_id=? AND kind='discussion_invite' AND status='expired' AND json_extract(payload_json,'$.roomId')=?").get(ids[2],finalRoomId) as {n:number}).n,1);}finally{expired.close();}
