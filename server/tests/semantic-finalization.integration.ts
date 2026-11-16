import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';

const roomId=process.env.TEST_ROOM_ID;
assert.ok(roomId&&process.env.DATA_DIR,'Use an isolated real-model test room and DATA_DIR');
assert.match(process.env.DATA_DIR,/zhoumoju-real-/, 'Refuse to run against a demo database');
const db=new Database(path.join(process.env.DATA_DIR,'weekend.db'),{readonly:true});
const users=db.prepare('SELECT u.username,m.user_id AS id FROM members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY m.joined_at').all(roomId) as {username:string;id:string}[];
assert.equal(users.length,4);
const base=`http://127.0.0.1:${process.env.TEST_PORT??3130}/api`;
const clients=users.map(({username})=>{
  let cookie='';
  return async(route:string,body?:unknown)=>{
    const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
    cookie=response.headers.get('set-cookie')?.split(';',1)[0]??cookie;
    return {status:response.status,data:await response.json() as any};
  };
});
const [host,...guests]=clients;
for(let i=0;i<clients.length;i++)assert.equal((await clients[i]('/login',{username:users[i].username,password:'test-password-123'})).status,200);
const read=async()=> (await host(`/rooms/${roomId}`)).data;
const wait=async(predicate:(state:any)=>boolean,label:string)=>{
  for(let i=0;i<120;i++){const state=await read();if(predicate(state))return state;await new Promise(resolve=>setTimeout(resolve,150));}
  throw Error(`Timed out waiting for ${label}`);
};
const old=(await read()).proposal;assert.ok(old);
assert.equal((await host(`/rooms/${roomId}/share`,{publicText:'建议在九龙湾公园附近集合，具体路线还要商量。',explicitApproval:true})).status,200);
let state=await wait(s=>!s.room.coordinationPending&&s.proposal?.version>old.version&&s.proposal.plan.area==='九龙湾公园附近','publicly approved area proposal');
for(const facet of ['budgetMeal','budgetPlay1']){
  const previous=state.proposal.version;
  const created=await host(`/rooms/${roomId}/polls`,{facet});assert.equal(created.status,200,JSON.stringify(created.data));
  const option=created.data.poll.options.find((x:any)=>x.id==='100');assert.ok(option,'¥100 must be a real poll option');
  for(const client of clients)assert.equal((await client(`/rooms/${roomId}/polls/${created.data.poll.id}/vote`,{optionId:option.id})).status,200);
  state=await wait(s=>!s.room.coordinationPending&&s.proposal?.version>previous,`${facet} vote proposal`);
}
assert.deepEqual(state.proposal.pendingFinal,[]);
const proposalId=state.proposal.id;
for(const client of clients)assert.equal((await client(`/rooms/${roomId}/confirm`,{proposalId,decision:'accept'})).status,200);
state=await wait(s=>s.room.phase==='final'&&s.proposal.id===proposalId&&s.proposal.confirmed===4,'four same-version confirmations');
for(const client of clients)for(const segment of state.proposal.plan.segments)assert.equal((await client(`/rooms/${roomId}/attendance`,{proposalId,segmentId:segment.id,decision:'yes'})).status,200);
await new Promise(resolve=>setTimeout(resolve,1000));
state=await read();assert.equal(state.room.phase,'final');assert.equal(state.proposal.id,proposalId);assert.equal(state.proposal.confirmed,4);
const stored=db.prepare('SELECT phase,current_proposal_id AS proposalId FROM rooms WHERE id=?').get(roomId) as {phase:string;proposalId:string};
assert.equal(stored.phase,'final');assert.equal(stored.proposalId,proposalId);
assert.equal((db.prepare("SELECT COUNT(*) AS n FROM confirmations WHERE proposal_id=? AND decision='accept'").get(proposalId) as {n:number}).n,4);
assert.equal((db.prepare("SELECT COUNT(*) AS n FROM attendance WHERE proposal_id=? AND decision='yes'").get(proposalId) as {n:number}).n,8);
console.log(JSON.stringify({ok:true,roomId,proposalId,version:state.proposal.version,phase:stored.phase,confirmations:4,attendance:8,segments:state.proposal.plan.segments.map((x:any)=>({id:x.id,start:x.start,category:x.category,budgetCap:x.budgetCap}))}));
db.close();
