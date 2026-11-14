import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,sep} from "node:path";
import {createServer} from "node:net";
import Database from "better-sqlite3";

const directory=mkdtempSync(join(tmpdir(),"zhoumoju-race-"));
const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const address=server.address();if(!address||typeof address==="string")return reject(Error("port unavailable"));const value=address.port;server.close(()=>resolve(value));});});
const base=`http://127.0.0.1:${port}/api`;
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let backend:ChildProcess|null=null;
let database:Database.Database|null=null;
let workerDb:Database.Database|null=null;
async function start(){
  backend=spawn(process.execPath,["--import","tsx","server/index.ts","--prod"],{cwd:process.cwd(),env:{...process.env,PORT:String(port),DATA_DIR:directory,TOKENDANCE_API_KEY:""},stdio:"ignore",windowsHide:true});
  for(let i=0;i<80;i++){try{const result=await fetch(`${base}/health`);if(result.ok)return;}catch{}await sleep(100);}
  throw Error("isolated backend did not start");
}
async function stop(){if(!backend)return;const child=backend;backend=null;child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve(null);child.once("exit",resolve);setTimeout(()=>resolve(null),2000);});}
type Client={cookie:string;id:string};
async function call<T=any>(client:Client|null,path:string,body?:unknown):Promise<{status:number;data:T}>{
  const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{...(client?.cookie?{Cookie:client.cookie}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
  const next=response.headers.get("set-cookie");if(client&&next)client.cookie=next.split(";",1)[0];
  return {status:response.status,data:await response.json() as T};
}
async function user(label:string):Promise<Client>{const client={cookie:"",id:""};const result=await call<{user:{id:string}}>(client,"/register",{username:`race_${Date.now().toString(36)}_${label}`,name:label,password:"RaceTest#2026"});assert.equal(result.status,201);client.id=result.data.user.id;return client;}
async function state(client:Client,roomId:string){const response=await call<any>(client,`/rooms/${roomId}`);assert.equal(response.status,200);return response.data;}
async function settled(client:Client,roomId:string,minVersion:number){for(let i=0;i<80;i++){const room=await state(client,roomId);if(!room.room.coordinationPending&&room.proposal?.version>=minVersion&&!room.poll)return room;await sleep(100);}throw Error(`room ${roomId} did not settle at v${minVersion}`);}
const raw=()=>{assert.ok(database);return database!;};
const read=(sql:string,...args:unknown[]):any=>raw().prepare(sql).get(...args);
try{
  await start();
  const [host,alice,bob]=await Promise.all([user("host"),user("alice"),user("bob")]);
  const brief={title:"竞态回归",date:"2026-11-21",timeWindow:"noon",area:"学校附近",food:"火锅",play:"桌游",secondPlay:null,rounds:1,order:"eat",after:false,budget:{meal:120,play1:80,play2:null,after:null},note:""};
  const created=await call<{id:string}>(host,"/rooms",brief);assert.equal(created.status,201);const roomId=created.data.id;
  const initial=await state(host,roomId);const initialId=initial.proposal.id;
  assert.equal((await call(alice,`/rooms/${roomId}/join`,{})).status,200);
  assert.equal((await call(bob,`/rooms/${roomId}/join`,{})).status,200);
  database=new Database(join(directory,"weekend.db"),{readonly:true});
  assert.equal(read("SELECT coordination_pending AS n FROM rooms WHERE id=?",roomId).n,1);
  assert.equal((await call(host,`/rooms/${roomId}/confirm`,{proposalId:initialId,decision:"accept"})).status,409);
  assert.equal(read("SELECT COUNT(*) AS n FROM confirmations WHERE proposal_id=?",initialId).n,0);
  let room=await settled(host,roomId,1);
  assert.equal((await call(host,`/rooms/${roomId}/confirm`,{proposalId:room.proposal.id,decision:"accept"})).status,200);
  const previousId=room.proposal.id;
  const message=await call(alice,`/rooms/${roomId}/message`,{text:"聚餐预算最多80元"});assert.equal(message.status,200);
  const pending=await state(host,roomId);assert.equal(pending.room.coordinationPending,true);
  const snapshot={revision:pending.room.revision,epoch:read("SELECT coordination_epoch AS n FROM rooms WHERE id=?",roomId).n,proposalId:pending.proposal.id};
  assert.equal((await call(bob,`/rooms/${roomId}/confirm`,{proposalId:previousId,decision:"accept"})).status,409);
  assert.equal(read("SELECT COUNT(*) AS n FROM confirmations WHERE proposal_id=?",previousId).n,1);
  room=await settled(host,roomId,2);assert.notEqual(room.proposal.id,previousId);assert.equal(room.proposal.confirmed,0);
  assert.equal((await call(host,`/rooms/${roomId}/confirm`,{proposalId:previousId,decision:"accept"})).status,409);
  assert.equal(read("SELECT COUNT(*) AS n FROM confirmations WHERE proposal_id=?",room.proposal.id).n,0);
  // The first delayed job has a real snapshot but may no longer write after a newer proposal.
  process.env.DATA_DIR=directory;
  const [{coordinateRoom},{db}]=await Promise.all([import("../server/coordinator"),import("../server/db")]);workerDb=db;
  coordinateRoom(roomId,snapshot);
  assert.equal((await state(host,roomId)).proposal.id,room.proposal.id);
  assert.equal((await call(alice,`/rooms/${roomId}/message`,{text:"聚餐预算最多70元"})).status,200);
  const older=await state(host,roomId);assert.equal(older.room.coordinationPending,true);
  const olderSnapshot={revision:older.room.revision,epoch:read("SELECT coordination_epoch AS n FROM rooms WHERE id=?",roomId).n,proposalId:older.proposal.id};
  assert.equal((await call(alice,`/rooms/${roomId}/message`,{text:"聚餐预算最多60元"})).status,200);
  coordinateRoom(roomId,olderSnapshot);
  assert.equal(read("SELECT current_proposal_id AS id FROM rooms WHERE id=?",roomId).id,older.proposal.id);
  room=await settled(host,roomId,3);
  const finalId=room.proposal.id,finalVersion=room.proposal.version;
  for(const client of [host,alice,bob])for(const segment of room.proposal.plan.segments)assert.equal((await call(client,`/rooms/${roomId}/attendance`,{proposalId:finalId,segmentId:segment.id,decision:"yes"})).status,200);
  for(const client of [host,alice,bob])assert.equal((await call(client,`/rooms/${roomId}/confirm`,{proposalId:finalId,decision:"accept"})).status,200);
  room=await state(host,roomId);assert.equal(room.room.phase,"final");assert.equal(room.proposal.confirmed,3);
  coordinateRoom(roomId,olderSnapshot);
  assert.equal((await call(alice,`/rooms/${roomId}/message`,{text:"聚餐预算最多50元"})).status,409);
  assert.equal((await call(host,`/rooms/${roomId}/polls`,{facet:"food"})).status,409);
  await sleep(900);
  room=await state(host,roomId);assert.equal(room.room.phase,"final");assert.equal(room.proposal.id,finalId);
  assert.equal(read("SELECT COUNT(*) AS n FROM confirmations WHERE proposal_id=? AND decision='accept'",finalId).n,3);
  assert.equal(read("SELECT COUNT(*) AS n FROM attendance WHERE proposal_id=? AND decision='yes'",finalId).n,6);
  assert.equal(read("SELECT COUNT(*) AS n FROM proposals WHERE room_id=?",roomId).n,finalVersion);
  await stop();database.close();database=null;workerDb.close();workerDb=null;
  await start();database=new Database(join(directory,"weekend.db"),{readonly:true});
  room=await state(host,roomId);assert.equal(room.room.phase,"final");assert.equal(room.proposal.id,finalId);assert.equal(room.proposal.confirmed,3);
  assert.equal(read("SELECT COUNT(*) AS n FROM attendance WHERE proposal_id=?",finalId).n,6);
  // Simulate a process stopping after an input was committed but before its timer ran.
  const recovery=(await call<{id:string}>(host,"/rooms",{...brief,title:"重启后恢复待协调"})).data.id;
  await stop();database.close();database=null;
  const writable=new Database(join(directory,"weekend.db"));
  writable.prepare("UPDATE rooms SET coordination_pending=1,coordination_epoch=coordination_epoch+1,revision=revision+1 WHERE id=?").run(recovery);
  writable.close();
  await start();database=new Database(join(directory,"weekend.db"),{readonly:true});
  const recovered=await settled(host,recovery,1);assert.equal(recovered.room.coordinationPending,false);
  room=await state(host,roomId);assert.equal(room.room.phase,"final");assert.equal(room.proposal.id,finalId);
  console.log(JSON.stringify({ok:true,roomId,version:finalVersion,confirmed:3,attendance:6,pendingReject:true,staleJobIgnored:true,restartStable:true,pendingRecovery:true}));
}finally{
  database?.close();workerDb?.close();await stop();
  if(directory.startsWith(tmpdir()+sep))rmSync(directory,{recursive:true,force:true});
}
