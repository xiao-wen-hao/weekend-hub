import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import Database from 'better-sqlite3';

const dir=mkdtempSync(join(tmpdir(),'zhoumoju-public-intents-'));
const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string')return reject(Error('No test port'));server.close(()=>resolve(address.port));});});
const base=`http://127.0.0.1:${port}/api`;
let backend:ChildProcess|null=null;
const client=()=>{let cookie='';return async(path:string,method='GET',body?:unknown)=>{const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';',1)[0];return {status:response.status,data:await response.json() as any};};};
try{
  backend=spawn(process.execPath,['--import','tsx','server/index.ts','--prod'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),DATA_DIR:dir,TOKENDANCE_API_KEY:''},stdio:'ignore',windowsHide:true});
  for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.status<500)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  const a=client(),b=client(),outsider=client();
  for(const [call,name] of [[a,'author'],[b,'friend'],[outsider,'outsider']] as const)assert.equal((await call('/register','POST',{username:`p_${name}_${String(Date.now()).slice(-6)}`,name,password:'test-password-123'})).status,201);
  const circle=(await a('/circles','POST',{name:'公开意愿权限测试'})).data;assert.ok(circle.id);
  assert.equal((await b('/circles/join','POST',{code:circle.joinCode})).status,200);
  const route=`/circles/${circle.id}/public-intents`;
  const privateIntent=(await a(`/circles/${circle.id}/intents`,'POST',{text:'周末想去徒步',category:'徒步',confirmed:true})).data;
  assert.equal((await b(route)).data.intents.length,0,'default-private intent must stay hidden');
  const publicIntent=(await a(`/circles/${circle.id}/intents`,'POST',{text:'周日想去散步',category:'散步聊天',confirmed:true,publicAllowed:true})).data;
  let feed=(await b(route)).data.intents;assert.equal(feed.length,1);assert.equal(feed[0].rawText,'周日想去散步');assert.equal(feed[0].authorName,'author');
  assert.equal((await outsider(route)).status,403,'non-members must not read the feed');
  assert.equal((await a(`/intents/${privateIntent.id}`,'PATCH',{publicAllowed:true})).status,200);
  feed=(await b(route)).data.intents;assert.equal(feed.length,2,'author may publish an existing confirmed intent');
  assert.equal((await a(`/intents/${privateIntent.id}`,'PATCH',{publicAllowed:false})).status,200);
  assert.equal((await b(route)).data.intents.length,1,'revoking public consent must hide it');
  assert.equal((await a(`/intents/${publicIntent.id}/withdraw`,'POST',{})).status,200);
  assert.equal((await b(route)).data.intents.length,0,'withdrawn intent must disappear');
  const draft=(await a(`/circles/${circle.id}/intents`,'POST',{text:'以后想打羽毛球',confirmed:false,publicAllowed:true})).data;
  const database=new Database(join(dir,'weekend.db'),{readonly:true});
  assert.equal((database.prepare('SELECT public_allowed FROM intents WHERE id=?').get(draft.id) as {public_allowed:number}).public_allowed,0);
  assert.equal((database.prepare('SELECT public_allowed FROM intents WHERE id=?').get(publicIntent.id) as {public_allowed:number}).public_allowed,1);
  database.close();
  console.log('public intents: consent, member-only read, revoke, withdrawal and private drafts passed');
}finally{if(backend){backend.kill();await new Promise(resolve=>{if(backend!.exitCode!==null)return resolve(null);backend!.once('exit',resolve);setTimeout(()=>resolve(null),2000);});}if(dir.startsWith(tmpdir()+sep))try{rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150});}catch(error){if((error as NodeJS.ErrnoException).code!=='EBUSY')throw error;}}
