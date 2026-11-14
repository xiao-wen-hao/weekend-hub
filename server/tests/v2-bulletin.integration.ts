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
  const after=(await call<any>(guest,`/rooms/${id}`)).data;assert.equal(after.bulletin.content.shared.length,1);assert.equal(after.bulletin.content.shared[0].text,'周末想爬山');assert.ok(!JSON.stringify(after).includes('秘密标记739'));
  const history=await call<any>(guest,`/rooms/${id}/bulletins`);assert.equal(history.status,200);assert.ok(history.data.bulletins.length>=2);assert.ok(history.data.bulletins[0].sources.some((x:string)=>x.startsWith('share:')));
  const raw=new Database(join(directory,'weekend.db'),{readonly:true});assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM room_public_shares WHERE room_id=?').get(id) as {n:number}).n,1);assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM messages WHERE room_id=?').get(id) as {n:number}).n,2);raw.close();
  console.log(JSON.stringify({ok:true,roomId:id,blank:true,privateDefault:true,explicitShare:true,sourceAudit:true,bulletinVersions:history.data.bulletins.length}));
}finally{if(backend){backend.kill();await new Promise(resolve=>{if(backend!.exitCode!==null)return resolve(null);backend!.once('exit',resolve);setTimeout(()=>resolve(null),2000);});}if(directory.startsWith(tmpdir()+sep))rmSync(directory,{recursive:true,force:true});}
