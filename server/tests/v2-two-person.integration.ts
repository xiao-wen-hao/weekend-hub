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
assert.equal((await a(`/rooms/${roomId}/share`,'POST',{publicText:'周末想去爬山，学校附近',explicitApproval:true})).status,200);
assert.equal((await b(`/rooms/${roomId}/share`,'POST',{publicText:'周末也想去徒步',explicitApproval:true})).status,200);
let proposal:any=null;for(let i=0;i<40;i++){proposal=(await a(`/rooms/${roomId}`)).data.proposal;if(proposal)break;await new Promise(resolve=>setTimeout(resolve,100));}
assert.ok(proposal,'approved public ideas should create a first discussion proposal');
assert.ok(proposal.plan.segments.some((x:any)=>x.category==='徒步'));
assert.equal(proposal.plan.date,'待定','ambiguous weekend cannot become a confirmed Saturday');
assert.equal((await a(`/rooms/${roomId}/confirm`,'POST',{proposalId:proposal.id,decision:'accept'})).status,409);
assert.ok(!JSON.stringify((await b(`/rooms/${roomId}`)).data.bulletin).includes('秘密标记739'));
async function decide(facet:string,value:string){
  const before=(await a(`/rooms/${roomId}`)).data.proposal.version;
  const created=await a(`/rooms/${roomId}/polls`,'POST',{facet});assert.equal(created.status,200);
  const poll=created.data.poll;const option=poll.options.find((x:any)=>x.id===value)||poll.options[0];assert.ok(option);
  assert.equal((await a(`/rooms/${roomId}/polls/${poll.id}/vote`,'POST',{optionId:option.id})).status,200);
  assert.equal((await b(`/rooms/${roomId}/polls/${poll.id}/vote`,'POST',{optionId:option.id})).status,200);
  for(let i=0;i<50;i++){const state=(await a(`/rooms/${roomId}`)).data;if(!state.room.coordinationPending&&state.proposal?.version>before)return state.proposal;await new Promise(resolve=>setTimeout(resolve,100));}
  throw Error(`Coordination after ${facet} vote did not produce a new proposal`);
}
proposal=await decide('date','');
assert.equal((await a(`/rooms/${roomId}`)).data.room.date,proposal.plan.date);
proposal=await decide('budgetMeal','100');
proposal=await decide('budgetPlay1','100');
assert.deepEqual(proposal.pendingFinal,[]);
assert.equal((await a(`/rooms/${roomId}/confirm`,'POST',{proposalId:proposal.id,decision:'accept'})).status,200);
assert.equal((await b(`/rooms/${roomId}/confirm`,'POST',{proposalId:proposal.id,decision:'accept'})).data.room.phase,'final');
for(const segment of proposal.plan.segments)for(const call of [a,b])assert.equal((await call(`/rooms/${roomId}/attendance`,'POST',{proposalId:proposal.id,segmentId:segment.id,decision:'yes'})).status,200);
const database=new Database(path.join(process.env.DATA_DIR!,'weekend.db'),{readonly:true});
try{assert.equal((database.prepare('SELECT count(*) AS n FROM members WHERE room_id=?').get(roomId) as {n:number}).n,2);assert.equal((database.prepare('SELECT count(*) AS n FROM confirmations WHERE proposal_id=? AND decision=\'accept\'').get(proposal.id) as {n:number}).n,2);assert.equal((database.prepare('SELECT count(*) AS n FROM attendance WHERE proposal_id=? AND decision=\'yes\'').get(proposal.id) as {n:number}).n,proposal.plan.segments.length*2);}finally{database.close();}
assert.equal((await b(`/rooms/${roomId}/leave`,'POST',{})).status,409,'confirmed attendance requires explicit cancellation before exit');
for(const segment of proposal.plan.segments)assert.equal((await b(`/rooms/${roomId}/attendance`,'POST',{proposalId:proposal.id,segmentId:segment.id,decision:'no'})).status,200);
assert.equal((await b(`/rooms/${roomId}/leave`,'POST',{})).status,200);
assert.equal((await b(`/rooms/${roomId}/message`,'POST',{text:'已退出'})).status,403);
const afterLeave=(await a(`/rooms/${roomId}`)).data;
assert.equal(afterLeave.room.phase,'final');
assert.equal(afterLeave.proposal.confirmed,1,'departed member confirmation is history, not current confirmation');
const history=new Database(path.join(process.env.DATA_DIR!,'weekend.db'),{readonly:true});
try{assert.equal((history.prepare('SELECT count(*) AS n FROM confirmations WHERE proposal_id=?').get(proposal.id) as {n:number}).n,2);assert.equal((history.prepare('SELECT count(*) AS n FROM attendance WHERE proposal_id=? AND user_id=?').get(proposal.id,(await b('/me')).data.user.id) as {n:number}).n,proposal.plan.segments.length);}finally{history.close();}
console.log(JSON.stringify({ok:true,roomId,candidateId:candidate.id,twoMembers:true,outsiderDenied:true,finalVersion:proposal.version,attendance:proposal.plan.segments.length*2}));
