import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import {createServer} from 'node:net';
import Database from 'better-sqlite3';

const directory=mkdtempSync(join(tmpdir(),'zhoumoju-v2-'));
const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string')return reject(Error('port unavailable'));server.close(()=>resolve(address.port));});});
const base=`http://127.0.0.1:${port}/api`;
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let backend:ChildProcess|null=null;
type Client={cookie:string};
async function call<T=any>(client:Client|null,path:string,body?:unknown){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(client?.cookie?{Cookie:client.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const cookie=response.headers.get('set-cookie');if(client&&cookie)client.cookie=cookie.split(';',1)[0];return {status:response.status,data:await response.json() as T};}
async function user(name:string){const client={cookie:''};const r=await call(client,'/register',{username:`v2_${name}_${Date.now().toString(36)}`,name,password:'V2Test#2026'});assert.equal(r.status,201);return client;}
try{
  backend=spawn(process.execPath,['--import','tsx','server/index.ts','--prod'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),DATA_DIR:directory,TOKENDANCE_API_KEY:''},stdio:'ignore',windowsHide:true});
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await sleep(100);}assert.ok(ready,'isolated server started');
  const host=await user('host'),guest=await user('guest');
  const privateSentence='周末想爬山，但我的私人理由是秘密标记739';
  const created=await call<{id:string}>(host,'/rooms',{mode:'blank',idea:privateSentence});assert.equal(created.status,201);
  const id=created.data.id;
  const own=(await call<any>(host,`/rooms/${id}`)).data;assert.equal(own.room.mode,'blank');assert.equal(own.room.title,'周末讨论');assert.equal(own.proposal,null);assert.ok(own.messages.some((m:any)=>m.body===privateSentence));assert.ok(!JSON.stringify(own.bulletin).includes('秘密标记739'));
  const outsider=await call<any>(guest,`/rooms/${id}`);assert.equal(outsider.status,200);assert.equal(outsider.data.joined,false);assert.ok(!JSON.stringify(outsider.data).includes('秘密标记739'));
  assert.equal((await call(guest,`/rooms/${id}/join`,{})).status,200);
  const before=(await call<any>(guest,`/rooms/${id}`)).data;assert.deepEqual(before.messages,[]);assert.ok(!JSON.stringify(before).includes('秘密标记739'));
  const sourceId=own.messages.find((m:any)=>m.role==='user').id;
  assert.equal((await call(host,`/rooms/${id}/share`,{sourceMessageId:sourceId,publicText:'周末想爬山',explicitApproval:false})).status,400);
  assert.equal((await call(guest,`/rooms/${id}/share`,{sourceMessageId:sourceId,publicText:'偷发别人的话',explicitApproval:true})).status,403);
  const shared=await call<any>(host,`/rooms/${id}/share`,{sourceMessageId:sourceId,publicText:'周末想爬山',explicitApproval:true});assert.equal(shared.status,200);
  let annotation:any;for(let i=0;i<30;i++){const read=new Database(join(directory,'weekend.db'),{readonly:true});annotation=read.prepare('SELECT a.kind,a.excerpt,a.source FROM room_share_annotations a JOIN room_public_shares s ON s.id=a.share_id WHERE s.room_id=?').get(id);read.close();if(annotation)break;await sleep(50);}
  assert.equal(annotation?.kind,'provisional');assert.equal(annotation?.excerpt,'周末想爬山');assert.equal(annotation?.source,'fallback');
  const after=(await call<any>(guest,`/rooms/${id}`)).data;assert.equal(after.bulletin.content.shared.length,1);assert.equal(after.bulletin.content.shared[0].text,'周末想爬山');assert.ok(!JSON.stringify(after).includes('秘密标记739'));
  assert.ok(after.bulletin.content.provisional.some((x:string)=>x.includes('周末想爬山')));
  const history=await call<any>(guest,`/rooms/${id}/bulletins`);assert.equal(history.status,200);assert.ok(history.data.bulletins.length>=2);assert.ok(history.data.bulletins[0].sources.some((x:string)=>x.startsWith('share:')));
  const agreed=await call<any>(guest,`/rooms/${id}/share`,{publicText:'我也想去爬山，时间可以再商量',explicitApproval:true});assert.equal(agreed.status,200);
  let proposal:any=null;for(let i=0;i<30;i++){proposal=(await call<any>(host,`/rooms/${id}`)).data.proposal;if(proposal)break;await sleep(100);}
  assert.ok(proposal,'two approved public ideas generated a draft');assert.equal(proposal.version,1);
  const debugDb=new Database(join(directory,'weekend.db'),{readonly:true});const debugRoom=debugDb.prepare('SELECT mode,brief_json AS brief,coordination_pending AS pending FROM rooms WHERE id=?').get(id);debugDb.close();
  assert.ok(proposal.plan.segments.some((s:any)=>s.category==='徒步'),JSON.stringify({segments:proposal.plan.segments,room:debugRoom}));
  assert.ok(!JSON.stringify(proposal).includes('秘密标记739'));
  const secretArea='隐私公园附近';
  assert.equal((await call(host,`/rooms/${id}/message`,{text:`我想在${secretArea}集合`})).status,200);
  let afterPrivate:any;for(let i=0;i<50;i++){afterPrivate=(await call<any>(guest,`/rooms/${id}`)).data;if(!afterPrivate.room.coordinationPending)break;await sleep(100);}
  assert.ok(!JSON.stringify(afterPrivate).includes(secretArea),'private area must not enter another member view or public proposal');
  const publicArea='九龙湾公园附近';
  assert.equal((await call(host,`/rooms/${id}/share`,{publicText:`建议在${publicArea}集合`,explicitApproval:true})).status,200);
  let afterPublic:any;for(let i=0;i<50;i++){afterPublic=(await call<any>(guest,`/rooms/${id}`)).data;if(!afterPublic.room.coordinationPending&&afterPublic.proposal?.plan.area===publicArea)break;await sleep(100);}
  assert.equal(afterPublic.proposal?.plan.area,publicArea,'explicitly shared area may enter a new public plan');
  assert.ok(afterPublic.proposal.version>proposal.version,'approved public area creates a new proposal version');
  const raw=new Database(join(directory,'weekend.db'),{readonly:true});assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM room_public_shares WHERE room_id=?').get(id) as {n:number}).n,3);assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM messages WHERE room_id=? AND role='user'").get(id) as {n:number}).n,2);raw.close();
  console.log(JSON.stringify({ok:true,roomId:id,blank:true,privateDefault:true,explicitShare:true,sourceAudit:true,bulletinVersions:history.data.bulletins.length}));
}finally{if(backend){backend.kill();await new Promise(resolve=>{if(backend!.exitCode!==null)return resolve(null);backend!.once('exit',resolve);setTimeout(()=>resolve(null),2000);});}if(directory.startsWith(tmpdir()+sep))try{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:150});}catch(error){if((error as NodeJS.ErrnoException).code!=='EBUSY')throw error;console.warn('Temporary SQLite test directory is still locked and was retained:',directory);}}
