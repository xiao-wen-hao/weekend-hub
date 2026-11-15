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
const database=new Database(path.join(process.env.DATA_DIR!,'weekend.db'),{readonly:true});
try{assert.equal((database.prepare('SELECT count(*) AS n FROM members WHERE room_id=?').get(roomId) as {n:number}).n,2);assert.equal((database.prepare("SELECT count(*) AS n FROM room_circle_invites WHERE room_id=? AND status='accepted'").get(roomId) as {n:number}).n,2);assert.equal((database.prepare('SELECT count(*) AS n FROM proposals WHERE room_id=?').get(roomId) as {n:number}).n,0);}finally{database.close();}
console.log(JSON.stringify({ok:true,roomId,invited:true,outsiderDenied:true,noAutoProposal:true}));
