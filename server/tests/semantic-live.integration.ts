import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';

const base=`http://127.0.0.1:${process.env.TEST_PORT??3120}/api`;
const startedAt=new Date(),startedMs=Date.now();
const clients=Array.from({length:5},()=>{let cookie='';return async(route:string,method='GET',body?:unknown)=>{const response=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});cookie=response.headers.get('set-cookie')?.split(';',1)[0]??cookie;return {status:response.status,data:await response.json() as any};};});
const [a,b,c,d,e]=clients,stamp=Date.now(),ids:string[]=[];
for(let i=0;i<5;i++){const result=await clients[i]('/register','POST',{username:`semantic_${stamp}_${i}`,name:`协商成员${i}`,password:'test-password-123'});assert.equal(result.status,201);ids.push(result.data.user.id);}
const circle=await a('/circles','POST',{name:'语义协商隔离验收圈'});assert.equal(circle.status,201);
for(const client of [b,c,d,e])assert.equal((await client('/circles/join','POST',{code:circle.data.joinCode})).status,200);
const opened=await a('/rooms','POST',{mode:'blank',title:'周末徒步协商',idea:'想组织一次徒步',circleId:circle.data.id,inviteeIds:[ids[1],ids[2],ids[3]],date:'待定',timeWindow:'unsure',area:'',food:'简餐',play:'徒步',secondPlay:null,rounds:1,order:'either',after:false,budget:{meal:null,play1:null,play2:null,after:null},note:''});assert.equal(opened.status,201,JSON.stringify(opened.data));const roomId=opened.data.id;
for(const client of [b,c,d])assert.equal((await client(`/rooms/${roomId}/join`,'POST',{})).status,200);
const aText='我希望周六去爬山，周日需要上班，最好交通方便。';
const bText='我周六有事，只能周日出门，喜欢徒步。';
const cText='我想去郊外走走，但不想太累，最好车程不超过一小时。';
const dText='周六可以参加户外活动，但我不接受早上六点出发，九点以后更好。';
for(const [client,text] of [[a,aText],[b,bText],[c,cText],[d,dText]] as const)assert.equal((await client(`/rooms/${roomId}/message`,'POST',{text})).status,200);
assert.equal((await e(`/rooms/${roomId}`)).status,403,'E is not automatically included in hiking discussion');
let state:any;for(let i=0;i<180;i++){const all=await Promise.all(clients.map(x=>x(`/rooms/${roomId}`)));state=all.find(x=>x.data.coordination?.question)?.data??all[0].data;if(state.coordination?.status==='ready'&&state.coordination?.question)break;await new Promise(resolve=>setTimeout(resolve,500));}
const db=new Database(path.join(process.env.DATA_DIR!,'weekend.db'),{readonly:true});
try{
  const row=db.prepare('SELECT input_signature AS signature,status,content_json AS content FROM room_semantic_analysis WHERE room_id=?').get(roomId) as {signature:string;status:string;content:string|null}|undefined;
  const analysis=row?.content?JSON.parse(row.content):null;
  const questions=db.prepare('SELECT user_id AS userId,question,status FROM room_coordination_questions WHERE room_id=?').all(roomId);
  console.log(JSON.stringify({model:process.env.TOKENDANCE_MODEL??'deepseek-v4.1-flash-1017',startedAt:startedAt.toISOString(),elapsedMs:Date.now()-startedMs,roomId,status:row?.status,analysis,questions,apiQuestion:state?.coordination?.question}));
  assert.equal(row?.status,'ready','real model should return a valid sourced analysis');
  assert.ok(analysis?.conflicts?.some((x:any)=>x.kind==='date'&&x.memberIds.includes(ids[0])&&x.memberIds.includes(ids[1])),'A and B date conflict');
  assert.ok(questions.some((q:any)=>q.userId===ids[0])&&questions.some((q:any)=>q.userId===ids[1]),'A and B each have a targeted question');
  assert.ok(analysis?.findings?.some((x:any)=>x.memberId===ids[2]&&x.facet==='transport'),'C transport condition retained');
  assert.ok(analysis?.findings?.some((x:any)=>x.memberId===ids[3]&&x.facet==='time'),'D departure time retained');
  const forA=(await a(`/rooms/${roomId}`)).data,forB=(await b(`/rooms/${roomId}`)).data;
  assert.ok(!JSON.stringify(forA).includes(bText));assert.ok(!JSON.stringify(forB).includes(aText));
  if(process.env.STOP_BEFORE_ANSWER){console.log(JSON.stringify({fixture:true,roomId,accounts:ids.map((_,i)=>`semantic_${stamp}_${i}`),password:'test-password-123'}));process.exit(0);}
  if(process.env.FULL_RESOLVE){
    const aQuestion=forA.coordination.question;assert.ok(aQuestion);
    assert.equal((await a(`/rooms/${roomId}/coordination/${aQuestion.id}/answer`,'POST',{text:'我周日也可以参加，下午14点出发可以，周日上班的安排已经调整好了。'})).status,200);
    for(const [client,text] of [[b,'我周日14点出发也可以，下午有空。'],[c,'周日下午14点出发可以，我能接受轻松徒步和一小时内的交通。'],[d,'周日下午14点可以参加，九点以后出发都可以。']] as const)assert.equal((await client(`/rooms/${roomId}/message`,'POST',{text})).status,200);
    let resolved:any;for(let i=0;i<300;i++){const current=db.prepare('SELECT status,content_json AS content FROM room_semantic_analysis WHERE room_id=?').get(roomId) as {status:string;content:string|null};resolved=current.status==='ready'&&current.content?JSON.parse(current.content):null;if(resolved?.conflicts?.length===0&&resolved?.alternatives?.some((x:any)=>x.date&&x.startHour===14))break;await new Promise(resolve=>setTimeout(resolve,500));}
    assert.ok(resolved?.conflicts?.length===0&&resolved?.alternatives?.some((x:any)=>x.date&&x.startHour===14),'real model should produce a Sunday afternoon draft while retaining unresolved preferences');
    const host=(await a(`/rooms/${roomId}`)).data;const option=host.coordination.alternatives.find((x:any)=>x.canDraft&&x.startHour===14);assert.ok(option);
    const adopt=await a(`/rooms/${roomId}/coordination/plan`,'POST',{key:option.key});assert.equal(adopt.status,200,JSON.stringify(adopt.data));
    let proposal:any;for(let i=0;i<100;i++){proposal=(await a(`/rooms/${roomId}`)).data.proposal;if(proposal)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(proposal?.id,'model option creates proposal');
    assert.equal(proposal.plan.segments[0].kind,'play');assert.equal(proposal.plan.segments[0].start,14);
    console.log(JSON.stringify({resolved:true,roomId,analysis:resolved,proposalId:proposal.id,version:proposal.version}));
    process.exit(0);
  }
  const target=questions.find((q:any)=>q.status==='pending') as {userId:string}|undefined;assert.ok(target);
  const client=clients[ids.indexOf(target.userId)],own=(await client(`/rooms/${roomId}`)).data;
  const answer=await client(`/rooms/${roomId}/coordination/${own.coordination.question.id}/answer`,'POST',{text:'如果大家只能周日，我可以考虑周日下午，但上午不行。'});assert.equal(answer.status,200,JSON.stringify(answer.data));
  let changed=false;for(let i=0;i<180;i++){const latest=db.prepare('SELECT input_signature AS signature,status FROM room_semantic_analysis WHERE room_id=?').get(roomId) as {signature:string;status:string};if(latest.status==='ready'&&latest.signature!==row!.signature){changed=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}
  assert.ok(changed,'answer must cause another analysis');
}finally{db.close();}
