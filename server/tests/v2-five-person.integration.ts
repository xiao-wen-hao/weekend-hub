import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';

const base=`http://127.0.0.1:${process.env.TEST_PORT??3112}/api`;
const users=Array.from({length:5},()=>{let cookie='';return async(route:string,method='GET',body?:unknown)=>{const response=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});cookie=response.headers.get('set-cookie')?.split(';',1)[0]??cookie;return {status:response.status,data:await response.json() as any};};});
const stamp=Date.now();const ids:string[]=[];
for(let i=0;i<5;i++){const r=await users[i]('/register','POST',{username:`five_${stamp}_${i}`,name:`朋友${'ABCDE'[i]}`,password:'test-password-123'});assert.equal(r.status,201);ids.push(r.data.user.id);}
const [a,b,c,d,e]=users;
const circle=(await a('/circles','POST',{name:'五人周末验收圈'})).data;
for(const call of [b,c,d,e])assert.equal((await call('/circles/join','POST',{code:circle.joinCode})).status,200);
const sayings=['想去爬山，希望交通方便','周末有空想徒步','想去郊外走走，不想太累','周末想去徒步，但周六没空','想打羽毛球'];
for(let i=0;i<5;i++){const p=await users[i]('/intents/preview','POST',{text:sayings[i]});assert.equal(p.status,200);assert.equal(p.data.category,i===4?'羽毛球':'徒步',JSON.stringify(p.data));const r=await users[i](`/circles/${circle.id}/intents`,'POST',{text:sayings[i],confirmed:true,matchAllowed:true,contactAllowed:true});assert.equal(r.status,201,JSON.stringify(r.data));}
const candidates=(await a(`/circles/${circle.id}/candidates`)).data.candidates as any[];
const found=candidates.find(x=>x.category==='徒步'&&x.memberCount===4);assert.ok(found,'A/B/C/D should find a shared outdoor discussion');
assert.equal((await e(`/circles/${circle.id}/candidates`)).data.candidates.length,0,'E badminton interest stays separate');
const reason=JSON.parse(found.matchReasonJson) as {source:string;summary:string};
if(process.env.EXPECT_MODEL_MATCH)assert.equal(reason.source,'model','semantic matching must come from actual model');
assert.equal((await a(`/candidates/${found.id}/respond`,'POST',{decision:'yes'})).status,200);
const opened=await a(`/candidates/${found.id}/open`,'POST',{});assert.equal(opened.status,201,JSON.stringify(opened.data));const roomId=opened.data.roomId;
for(const call of [b,c,d])assert.equal((await call(`/rooms/${roomId}`)).data.joined,false);
assert.equal((await e(`/rooms/${roomId}`)).status,403);
assert.equal((await e(`/rooms/${roomId}/join`,'POST',{})).status,403);
for(const call of [b,c,d])assert.equal((await call(`/rooms/${roomId}/join`,'POST',{})).status,200);
const secret='私人理由：周六有家庭安排938';
assert.equal((await d(`/rooms/${roomId}/message`,'POST',{text:secret})).status,200);
assert.ok(!JSON.stringify((await a(`/rooms/${roomId}`)).data).includes(secret),'D private reason must not leak to A');
assert.equal((await a(`/rooms/${roomId}/share`,'POST',{publicText:'我建议周六去徒步',explicitApproval:true})).status,200);
assert.equal((await d(`/rooms/${roomId}/share`,'POST',{publicText:'周六没空，只能周日去徒步',explicitApproval:true})).status,200);
if(process.env.EXPECT_MODEL_GUIDANCE){let seen=false;for(let i=0;i<160;i++){const state=(await a(`/rooms/${roomId}`)).data;if(JSON.stringify(state.bulletin?.content?.disagreements??[]).includes('AI 发现两条公开想法可能有分歧')){seen=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(seen,'model should identify authorized Saturday/Sunday conflict');}
const database=new Database(path.join(process.env.DATA_DIR!,'weekend.db'),{readonly:true});
try{assert.equal((database.prepare('SELECT COUNT(*) AS n FROM members WHERE room_id=?').get(roomId) as {n:number}).n,4);assert.equal((database.prepare('SELECT COUNT(*) AS n FROM members WHERE room_id=? AND decision_status=\'undecided\'').get(roomId) as {n:number}).n,4);assert.equal((database.prepare('SELECT COUNT(*) AS n FROM attendance WHERE proposal_id IN (SELECT id FROM proposals WHERE room_id=?)').get(roomId) as {n:number}).n,0);}
finally{database.close();}
console.log(JSON.stringify({ok:true,roomId,circleId:circle.id,accounts:Array.from({length:5},(_,i)=>`five_${stamp}_${i}`),password:'test-password-123',matched:4,unrelatedExcluded:true,privateIsolated:true,matchSource:reason.source,modelConflictChecked:!!process.env.EXPECT_MODEL_GUIDANCE}));
