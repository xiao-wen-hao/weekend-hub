import assert from 'node:assert/strict';
import {createServer as httpServer} from 'node:http';
import {createServer as netServer} from 'node:net';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import Database from 'better-sqlite3';

const dir=mkdtempSync(join(tmpdir(),'zhoumoju-semantic-'));
const freePort=()=>new Promise<number>((resolve,reject)=>{const server=netServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const a=server.address();if(!a||typeof a==='string')return reject(Error('no port'));server.close(()=>resolve(a.port));});});
const port=await freePort(),base=`http://127.0.0.1:${port}/api`,sleep=(n:number)=>new Promise(r=>setTimeout(r,n));
const questionInputs:unknown[]=[],analysisInputs:unknown[]=[];let analysisCalls=0,backend:ChildProcess|null=null;
const model=httpServer(async(req,res)=>{
  let body='';for await(const part of req)body+=part;
  const input=JSON.parse(body) as {messages:{content:string}[]};const system=input.messages[0]?.content??'';let data:any=null;try{data=JSON.parse(input.messages.at(-1)!.content);}catch{}
  let output:unknown;
  if(system.includes('你只为当前这一位成员')){questionInputs.push(data);output={question:data.own?.[0]?.text?.includes('周六')?'你说周六优先，如果改到周日，是否也能参加？':'你说周日方便，具体哪个时段可以参加？'};}
  else if(system.includes('熟人组局协调员')){
    analysisCalls++;analysisInputs.push(data);
    const sources=data.sources as {id:string;memberId:string;text:string}[],a=sources.find(s=>s.text.includes('周六爬山'))!,b=sources.find(s=>s.text.includes('只能周日'))!;
    const answered=sources.some(s=>s.text.includes('周日下午也可以'));
    output={findings:[{memberId:a.memberId,sourceId:a.id,facet:'date',strength:answered?'flexible':'hard',summary:'周末日期'}],conflicts:answered?[]:[{kind:'date',severity:'hard',memberIds:[a.memberId,b.memberId],sourceIds:[a.id,b.id],targetIds:[a.memberId,b.memberId],reason:'日期不同'}],nextFacet:answered?'none':'date'};
  }else if(system.includes('熟人组局方案顾问')){
    const sources=data.sources as {id:string;memberId:string;text:string}[],a=sources.find(s=>s.text.includes('周六爬山'))!,b=sources.find(s=>s.text.includes('只能周日'))!;
    output={alternatives:[{date:null,startHour:14,activity:'徒步',area:'隐私公园附近',sourceIds:[a.id,b.id],satisfiedMemberIds:[],unresolvedMemberIds:data.conflicts?.length?[a.memberId,b.memberId]:[],explanation:'需要核对'}]};
  }else output={patch:{},reply:'我记下了你的想法。',suggestions:[]};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}));
});
const modelPort=await freePort();await new Promise<void>(resolve=>model.listen(modelPort,'127.0.0.1',resolve));
const clients=Array.from({length:3},()=>{let cookie='';return async(route:string,method='GET',body?:unknown)=>{const r=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});cookie=r.headers.get('set-cookie')?.split(';',1)[0]??cookie;return {status:r.status,data:await r.json() as any};};});
try{
  backend=spawn(process.execPath,['--import','tsx','server/index.ts','--prod'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),DATA_DIR:dir,TOKENDANCE_API_KEY:'isolated-test-key',TOKENDANCE_BASE_URL:`http://127.0.0.1:${modelPort}`},stdio:'ignore',windowsHide:true});
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await sleep(100);}assert.ok(ready);
  const [a,b,c]=clients,ids:string[]=[];for(let i=0;i<3;i++){const r=await clients[i]('/register','POST',{username:`semantic_mock_${i}`,name:`成员${i}`,password:'test-password-123'});assert.equal(r.status,201);ids.push(r.data.user.id);}
  const circle=(await a('/circles','POST',{name:'语义协商测试圈'})).data;assert.equal((await b('/circles/join','POST',{code:circle.joinCode})).status,200);assert.equal((await c('/circles/join','POST',{code:circle.joinCode})).status,200);
  const room=await a('/rooms','POST',{mode:'blank',circleId:circle.id,inviteeIds:[ids[1]],title:'徒步讨论',date:'待定',timeWindow:'unsure',area:'',food:'简餐',play:'徒步',secondPlay:null,rounds:1,order:'either',after:false,budget:{meal:null,play1:null,play2:null,after:null},note:''});assert.equal(room.status,201);const id=room.data.id;assert.equal((await b(`/rooms/${id}/join`,'POST',{})).status,200);
  const aText='我想周六爬山，周日要上班，私人理由保密739，想在隐私公园附近集合',bText='我周六有事，只能周日，私人原因保密518';
  assert.equal((await a(`/rooms/${id}/message`,'POST',{text:aText})).status,200);assert.equal((await b(`/rooms/${id}/message`,'POST',{text:bText})).status,200);
  let stateA:any,stateB:any;for(let i=0;i<100;i++){stateA=(await a(`/rooms/${id}`)).data;stateB=(await b(`/rooms/${id}`)).data;if(stateA.coordination?.question&&stateB.coordination?.question)break;await sleep(100);}assert.ok(stateA.coordination?.question&&stateB.coordination?.question,'both targeted questions visible to own members');
  assert.ok(!JSON.stringify(stateA).includes(bText));assert.ok(!JSON.stringify(stateB).includes(aText));assert.ok(!JSON.stringify(stateA.bulletin).includes('保密739'));assert.ok(!JSON.stringify(stateB.bulletin).includes('保密518'));
  assert.ok(!JSON.stringify(stateB).includes('隐私公园附近'),'model alternative must not publish another member private area');
  assert.equal(stateA.coordination.issues[0].label,'日期');
  assert.ok(stateA.coordination.issues[0].ownContext.includes('周六爬山'),'the target sees why they are asked');
  assert.ok(!JSON.stringify(stateB.coordination).includes('私人理由保密739'),'source-backed explanations exclude other members private conditions');
  assert.equal(questionInputs.length,2);assert.ok(questionInputs.every(x=>!JSON.stringify(x).includes('私人原因保密518')||!JSON.stringify(x).includes('私人理由保密739')),'question model never receives both private reasons');
  assert.equal((await b(`/rooms/${id}/coordination/${stateA.coordination.question.id}/answer`,'POST',{text:'偷答'})).status,409);
  const oldSignature=(await a(`/rooms/${id}`)).data.coordination.alternatives[0].key;
  assert.equal((await a(`/rooms/${id}/coordination/plan`,'POST',{key:oldSignature})).status,409,'unresolved members must block model proposal adoption');
  const answer=await a(`/rooms/${id}/coordination/${stateA.coordination.question.id}/answer`,'POST',{text:'周日下午也可以，上午不行'});assert.equal(answer.status,200);
  assert.equal((await a(`/rooms/${id}/coordination/${stateA.coordination.question.id}/answer`,'POST',{text:'重复提交不应写入'})).status,409);
  let newState:any;for(let i=0;i<100;i++){newState=(await a(`/rooms/${id}`)).data;if(newState.coordination?.status==='ready'&&newState.coordination.alternatives[0]?.key!==oldSignature)break;await sleep(100);}assert.equal(newState.coordination.status,'ready');assert.notEqual(newState.coordination.alternatives[0]?.key,oldSignature);
  assert.equal((await a(`/rooms/${id}/coordination/plan`,'POST',{key:oldSignature})).status,409,'old model advice cannot change a newer room');
  const adopted=await a(`/rooms/${id}/coordination/plan`,'POST',{key:newState.coordination.alternatives[0].key});assert.equal(adopted.status,200,JSON.stringify(adopted.data));
  let proposal:any;for(let i=0;i<100;i++){proposal=(await a(`/rooms/${id}`)).data.proposal;if(proposal)break;await sleep(100);}assert.ok(proposal?.id,'adopted model direction creates a persisted proposal through the coordinator');
  assert.equal(proposal.plan.segments[0].kind,'play','suggested activity begins at the suggested time, before a meal');
  assert.equal(proposal.plan.segments[0].start,14);
  assert.deepEqual(proposal.plan.segments.map((segment:any)=>segment.id),['play1','meal'],'a one-activity draft must not invent a second round');
  const beforeShare=(await a(`/rooms/${id}`)).data.coordination.alternatives[0]?.key;
  assert.equal((await a(`/rooms/${id}/share`,'POST',{publicText:'周日14点徒步可以考虑',explicitApproval:true})).status,200);
  let afterShare:any;for(let i=0;i<100;i++){afterShare=(await a(`/rooms/${id}`)).data;if(afterShare.coordination?.status==='ready'&&afterShare.coordination.alternatives[0]?.key!==beforeShare)break;await sleep(100);}
  assert.notEqual(afterShare.coordination.alternatives[0]?.key,beforeShare,'new public bulletin invalidates prior model analysis');
  assert.ok(analysisCalls>=3,'model rereads the updated public bulletin');
  const db=new Database(join(dir,'weekend.db'),{readonly:true});try{const analysis=db.prepare('SELECT content_json AS content FROM room_semantic_analysis WHERE room_id=?').get(id) as {content:string};assert.deepEqual(JSON.parse(analysis.content).conflicts,[]);assert.equal((db.prepare("SELECT COUNT(*) AS n FROM room_coordination_questions WHERE room_id=? AND status='answered'").get(id) as {n:number}).n,1);assert.equal((db.prepare("SELECT COUNT(*) AS n FROM messages WHERE room_id=? AND body='重复提交不应写入'").get(id) as {n:number}).n,0);assert.ok(analysisCalls>=2);}finally{db.close();}
  const withdrawn=await a('/rooms','POST',{mode:'blank',circleId:circle.id,inviteeIds:[ids[1],ids[2]],title:'退出协调测试',date:'待定',timeWindow:'unsure',area:'',food:'简餐',play:'徒步',secondPlay:null,rounds:1,order:'either',after:false,budget:{meal:null,play1:null,play2:null,after:null},note:''});assert.equal(withdrawn.status,201);
  const withdrawnId=withdrawn.data.id;assert.equal((await b(`/rooms/${withdrawnId}/join`,'POST',{})).status,200);assert.equal((await c(`/rooms/${withdrawnId}/join`,'POST',{})).status,200);
  const thirdText='我只想打羽毛球，不想参加徒步';
  assert.equal((await a(`/rooms/${withdrawnId}/message`,'POST',{text:aText})).status,200);assert.equal((await b(`/rooms/${withdrawnId}/message`,'POST',{text:bText})).status,200);assert.equal((await c(`/rooms/${withdrawnId}/message`,'POST',{text:thirdText})).status,200);
  for(let i=0;i<100;i++){if(analysisInputs.some(input=>JSON.stringify(input).includes(thirdText)))break;await sleep(100);}
  assert.ok(analysisInputs.some(input=>JSON.stringify(input).includes(thirdText)),'active third member participates in model context');
  const beforeWithdrawal=analysisInputs.length;assert.equal((await c(`/rooms/${withdrawnId}/decision`,'POST',{status:'no'})).status,200);
  for(let i=0;i<100;i++){if(analysisInputs.length>beforeWithdrawal)break;await sleep(100);}
  assert.ok(analysisInputs.length>beforeWithdrawal,'withdrawing triggers fresh analysis');
  const latest=analysisInputs.at(-1) as {members:{id:string}[];sources:{text:string}[]};
  assert.ok(!latest.members.some(member=>member.id===ids[2]));assert.ok(!latest.sources.some(source=>source.text===thirdText),'withdrawn member conditions are excluded from future model input');
  console.log(JSON.stringify({ok:true,questions:2,analysisCalls,privacy:true,reanalysis:true,withdrawalExcluded:true}));
}finally{
  if(backend){backend.kill();await new Promise(resolve=>{if(backend!.exitCode!==null)return resolve(null);backend!.once('exit',resolve);setTimeout(()=>resolve(null),3000);});}
  await new Promise<void>(resolve=>model.close(()=>resolve()));
  if(dir.startsWith(tmpdir()+sep))try{rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150});}catch(error){if((error as NodeJS.ErrnoException).code!=='EBUSY')throw error;console.warn('Temporary SQLite test directory is still locked and was retained:',dir);}
}
