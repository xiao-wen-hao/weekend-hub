import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';

const roomId=process.env.TEST_ROOM_ID,dir=process.env.DATA_DIR,stage=process.env.STAGE;
assert.ok(roomId&&dir&&stage);assert.match(dir,/zhoumoju-full-/,'Use only an isolated acceptance database');
const db=new Database(path.join(dir,'weekend.db'),{readonly:true});
const base=`http://127.0.0.1:${process.env.TEST_PORT??3133}/api`;
const rows=db.prepare('SELECT u.username,m.user_id AS id FROM members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY u.username').all(roomId) as {username:string;id:string}[];
assert.equal(rows.length,4);
const clients=rows.map(({username})=>{let cookie='';return async(route:string,body?:unknown)=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});cookie=response.headers.get('set-cookie')?.split(';',1)[0]??cookie;return {status:response.status,data:await response.json() as any};};});
const [a,b,c,d]=clients;
for(let i=0;i<4;i++)assert.equal((await clients[i]('/login',{username:rows[i].username,password:'test-password-123'})).status,200);
const read=async()=> (await a(`/rooms/${roomId}`)).data;
const wait=async(check:(s:any)=>boolean,label:string)=>{for(let i=0;i<300;i++){const state=await read();if(check(state))return state;await new Promise(resolve=>setTimeout(resolve,500));}throw Error(`Timed out waiting for ${label}`);};
const analysis=()=>{const row=db.prepare('SELECT status,content_json AS content FROM room_semantic_analysis WHERE room_id=?').get(roomId) as {status:string;content:string|null}|undefined;return row?.status==='ready'&&row.content?JSON.parse(row.content) as any:null;};
if(stage==='context'){
  for(const [client,text] of [[b,'周末想徒步，周日14点有空。'],[c,'想轻松徒步，不想太累，希望交通时间不超过一小时。'],[d,'我只能周日参加，下午14点可以出发，但不想早上六点出发。']] as const)assert.equal((await client(`/rooms/${roomId}/message`,{text})).status,200);
  const state=await wait(s=>s.coordination?.status==='ready'&&s.coordination.issues.some((x:any)=>x.kind==='date')&&!!s.coordination.question,'real-model conflict and target question');
  const result=analysis();assert.ok(result?.conflicts.some((x:any)=>x.kind==='date'&&x.memberIds.includes(rows[0].id)&&x.memberIds.includes(rows[3].id)));
  assert.ok(result.findings.some((x:any)=>x.memberId===rows[2].id&&x.facet==='transport'));
  assert.ok(result.findings.some((x:any)=>x.memberId===rows[3].id&&x.facet==='time'));
  assert.ok(!JSON.stringify((await b(`/rooms/${roomId}`)).data).includes('私人理由：周六有家庭安排938'));
  console.log(JSON.stringify({stage,roomId,modelConflict:result.conflicts,question:state.coordination.question,modelFindings:result.findings.length,webAccount:rows[0].username}));
}else if(stage==='resolve'){
  const answered=(db.prepare("SELECT COUNT(*) AS n FROM room_coordination_questions WHERE room_id=? AND user_id=? AND status='answered'").get(roomId,rows[0].id) as {n:number}).n;assert.ok(answered>0,'A must answer in the simulator first');
  for(const [client,text] of [[b,'周日14点徒步我可以参加。'],[c,'周日14点轻松徒步可以，只要往返车程别太长。'],[d,'周日14点出发可以，我愿意参加。']] as const)assert.equal((await client(`/rooms/${roomId}/message`,{text})).status,200);
  const state=await wait(s=>s.coordination?.status==='ready'&&s.coordination.alternatives.some((x:any)=>x.canDraft&&x.date&&x.startHour===14)&&!s.coordination.issues.some((x:any)=>x.severity==='hard'),'resolved Sunday proposal');
  console.log(JSON.stringify({stage,roomId,analysis:analysis(),options:state.coordination.alternatives,proposalVersion:state.proposal?.version??null}));
}else if(stage==='prepare-final'){
  const original=(await read()).proposal;assert.ok(original,'host must adopt the model direction through Web first');
  assert.equal((await a(`/rooms/${roomId}/share`,{publicText:'建议在九龙湾公园附近集合，具体路线一起挑。',explicitApproval:true})).status,200);
  let state=await wait(s=>!s.room.coordinationPending&&s.proposal?.version>original.version&&s.proposal.plan.area==='九龙湾公园附近','approved area proposal');
  assert.equal((await c(`/rooms/${roomId}/message`,{text:'九龙湾公园附近我过去不到一小时，轻松徒步的安排可以接受。'})).status,200);
  state=await wait(s=>!s.room.coordinationPending&&s.coordination?.status==='ready'&&!s.coordination.issues.some((x:any)=>x.severity==='hard')&&s.proposal?.plan.area==='九龙湾公园附近','transport condition rechecked after public area');
  for(const facet of ['budgetMeal','budgetPlay1']){
    const version=state.proposal.version,started=await a(`/rooms/${roomId}/polls`,{facet});assert.equal(started.status,200,JSON.stringify(started.data));
    const option=started.data.poll.options.find((x:any)=>x.id==='100');assert.ok(option);
    for(const client of clients)assert.equal((await client(`/rooms/${roomId}/polls/${started.data.poll.id}/vote`,{optionId:option.id})).status,200);
    state=await wait(s=>!s.room.coordinationPending&&s.proposal?.version>version,`${facet} vote`);
  }
  assert.deepEqual(state.proposal.pendingFinal,[]);console.log(JSON.stringify({stage,roomId,proposalId:state.proposal.id,version:state.proposal.version,segments:state.proposal.plan.segments.map((x:any)=>x.id)}));
}else if(stage==='verify'){
  const state=await read(),id=state.proposal?.id;assert.ok(id);assert.equal(state.room.phase,'final');assert.equal(state.proposal.confirmed,4);assert.equal(state.proposal.plan.segments.length,2);
  const confirmations=(db.prepare("SELECT COUNT(*) AS n FROM confirmations WHERE proposal_id=? AND decision='accept'").get(id) as {n:number}).n,attendance=(db.prepare("SELECT COUNT(*) AS n FROM attendance WHERE proposal_id=? AND decision='yes'").get(id) as {n:number}).n;
  assert.equal(confirmations,4);assert.equal(attendance,8);
  console.log(JSON.stringify({stage,roomId,phase:state.room.phase,proposalId:id,version:state.proposal.version,confirmations,attendance}));
}else throw Error(`Unknown STAGE=${stage}`);
db.close();
