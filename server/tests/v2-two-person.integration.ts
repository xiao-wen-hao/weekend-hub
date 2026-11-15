import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';

const base=`http://127.0.0.1:${process.env.TEST_PORT??3112}/api`;
const clients=[] as Array<(route:string,method?:string,body?:unknown)=>Promise<{status:number;data:any}>>;
for(let i=0;i<3;i++){
  let cookie='';
  const call=async(route:string,method:string='GET',body?:unknown)=>{const r=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';',1)[0];return {status:r.status,data:await r.json()};};
  assert.equal((await call('/register','POST',{username:`v2abc_${Date.now()}_${i}`,name:`成员${i}`,password:'test-password-123'})).status,201);clients.push(call);
}
const [a,b,c]=clients;
const circle=(await a('/circles','POST',{name:'A B C 验收圈'})).data;
for(const call of [b,c])assert.equal((await call('/circles/join','POST',{code:circle.joinCode})).status,200);
const sayings=['最近想去爬山，最好不要太远。','周末想找个地方徒步。','这周末想打羽毛球。'];
for(let i=0;i<3;i++)assert.equal((await clients[i](`/circles/${circle.id}/intents`,'POST',{text:sayings[i],confirmed:true,matchAllowed:true,contactAllowed:true})).status,201);
const aCandidates=(await a(`/circles/${circle.id}/candidates`)).data.candidates;
const candidate=aCandidates.find((x:any)=>x.category==='徒步'&&x.memberCount===2);
assert.ok(candidate,'A and B should match as two people');
assert.equal((await c(`/circles/${circle.id}/candidates`)).data.candidates.length,0);
assert.equal((await a(`/circles/${circle.id}/discussions`)).data.rooms.length,0,'matching must not auto-create a room');
assert.equal((await a(`/candidates/${candidate.id}/respond`,'POST',{decision:'yes'})).status,200);
const opened=await a(`/candidates/${candidate.id}/open`,'POST',{});assert.equal(opened.status,201);
const roomId=opened.data.roomId;
assert.equal((await a(`/rooms/${roomId}`)).data.joined,true);
assert.equal((await b(`/rooms/${roomId}`)).data.joined,false,'invite is not room membership');
assert.equal((await c(`/rooms/${roomId}`)).status,403,'unrelated member cannot inspect invitation');
assert.equal((await b(`/rooms/${roomId}/join`,'POST',{})).status,200);
assert.equal((await b(`/rooms/${roomId}`)).data.joined,true);
assert.equal((await a(`/rooms/${roomId}/message`,'POST',{text:'私人理由：秘密标记739，路线轻松一点'})).status,200);
assert.ok(!JSON.stringify((await b(`/rooms/${roomId}`)).data).includes('秘密标记739'));
const database=new Database(path.join(process.env.DATA_DIR!,'weekend.db'),{readonly:true});
try{assert.equal((database.prepare('SELECT count(*) AS n FROM members WHERE room_id=?').get(roomId) as {n:number}).n,2);assert.equal((database.prepare('SELECT count(*) AS n FROM attendance WHERE proposal_id IN (SELECT id FROM proposals WHERE room_id=?)').get(roomId) as {n:number}).n,0);}finally{database.close();}
console.log(JSON.stringify({ok:true,roomId,candidateId:candidate.id,twoMembers:true,outsiderDenied:true,noAutomaticAttendance:true}));
