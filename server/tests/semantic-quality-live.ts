import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';

const dataDir=process.env.DATA_DIR;
if(!dataDir?.includes('zhoumoju-real-'))throw Error('Use an isolated real-model database');
const base=`http://127.0.0.1:${process.env.TEST_PORT??3130}/api`;
const db=new Database(path.join(dataDir,'weekend.db'),{readonly:true});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function client(){let cookie='';return async(route:string,body?:unknown)=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});cookie=response.headers.get('set-cookie')?.split(';',1)[0]??cookie;return {status:response.status,data:await response.json() as any};};}
const [a,b]=[client(),client()],stamp=Date.now(),users:string[]=[];
for(const [index,call] of [a,b].entries()){const result=await call('/register',{username:`quality_${stamp}_${index}`,name:`质量测试${index}`,password:'test-password-123'});assert.equal(result.status,201);users.push(result.data.user.id as string);}
const circle=await a('/circles',{name:'真实模型质量隔离测试'});assert.equal(circle.status,201);assert.equal((await b('/circles/join',{code:circle.data.joinCode})).status,200);
async function room(title:string){const result=await a('/rooms',{mode:'blank',title,circleId:circle.data.id,inviteeIds:[users[1]],date:'待定',timeWindow:'unsure',area:'',food:'简餐',play:'徒步',secondPlay:null,rounds:1,order:'either',after:false,budget:{meal:null,play1:null,play2:null,after:null},note:''});assert.equal(result.status,201,JSON.stringify(result.data));assert.equal((await b(`/rooms/${result.data.id}/join`,{})).status,200);return result.data.id as string;}
async function say(call:typeof a,id:string,text:string){const response=await call(`/rooms/${id}/message`,{text});assert.equal(response.status,200,JSON.stringify(response.data));}
async function analysis(id:string,priorSignature?:string){for(let i=0;i<180;i++){const row=db.prepare('SELECT input_signature AS signature,status,content_json AS content FROM room_semantic_analysis WHERE room_id=?').get(id) as {signature:string;status:string;content:string|null}|undefined;if(row?.status==='ready'&&row.signature!==priorSignature&&row.content)return {signature:row.signature,content:JSON.parse(row.content) as {conflicts:{kind:string;severity:string;memberIds:string[]}[];findings:{facet:string;strength:string}[];alternatives:unknown[]}};await sleep(500);}throw Error(`Model analysis did not become ready for ${id}`);}
const results:Record<string,unknown>={};
try{
  const changed=await room('条件撤回与拒答');
  await say(a,changed,'我只能周六爬山，周日要上班。');await say(b,changed,'我周六值班，只能周日徒步。');
  const original=await analysis(changed);
  results.oppositeDates=original.content.conflicts.some(conflict=>conflict.kind==='date'&&conflict.memberIds.includes(users[0])&&conflict.memberIds.includes(users[1]));
  const before=(await a(`/rooms/${changed}`)).data;
  if(before.coordination?.question){const answer=await a(`/rooms/${changed}/coordination/${before.coordination.question.id}/answer`,{text:'这次我不想回答能否改期'});results.refusalStored=answer.status===200;}
  else results.refusalStored=false;
  const afterRefusal=await analysis(changed,original.signature);
  results.refusalNotConsent=afterRefusal.content.conflicts.some(conflict=>conflict.kind==='date');
  await say(a,changed,'我现在撤回只能周六的限制，改成周日也可以参加。');
  const updated=await analysis(changed,afterRefusal.signature);
  results.changedConditionResolved=!updated.content.conflicts.some(conflict=>conflict.kind==='date'&&conflict.severity==='hard');
  const publicView=(await b(`/rooms/${changed}`)).data;
  results.privateReasonHidden=!JSON.stringify(publicView).includes('周日要上班');

  const overturned=await room('新消息推翻共识');
  await say(a,overturned,'周六下午徒步我可以。');await say(b,overturned,'周六下午徒步我也可以。');
  const consensus=await analysis(overturned);
  await say(b,overturned,'刚收到通知，周六必须加班，现在只能周日。');
  const reversal=await analysis(overturned,consensus.signature);
  results.newMessageOverturns= reversal.content.conflicts.some(conflict=>conflict.kind==='date'&&conflict.memberIds.includes(users[0])&&conflict.memberIds.includes(users[1]));

  const flexible=await room('软硬条件与地点折中');
  await say(a,flexible,'我周六必须参加，地点最好市区，离地铁近一点。');await say(b,flexible,'我更喜欢周日，但周六也行；想去郊外，近郊也可以。');
  const soft=await analysis(flexible);
  results.softNotHard=!soft.content.conflicts.some(conflict=>conflict.kind==='date'&&conflict.severity==='hard');
  results.locationConsidered=soft.content.findings.some(finding=>finding.facet==='area'||finding.facet==='transport')||soft.content.conflicts.some(conflict=>conflict.kind==='area'||conflict.kind==='transport');
  results.rooms=[changed,overturned,flexible];
  console.log(JSON.stringify(results));
  assert.ok(results.oppositeDates,'opposite dates must be identified');
  assert.ok(results.refusalStored&&results.refusalNotConsent,'refusal must not be treated as agreement');
  assert.ok(results.changedConditionResolved,'new explicit condition must supersede the old hard constraint');
  assert.ok(results.privateReasonHidden,'other members must not see the private reason');
  assert.ok(results.newMessageOverturns,'new information must overturn prior consensus');
  assert.ok(results.softNotHard,'a flexible preference is not a hard date conflict');
  assert.ok(results.locationConsidered,'location preference should be retained');
}finally{db.close();}
