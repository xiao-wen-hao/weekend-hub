import Database from "better-sqlite3";
import path from "node:path";

const base=`http://127.0.0.1:${process.env.TEST_PORT??3111}/api`;
const clients=[] as Array<(path:string,method?:string,body?:unknown)=>Promise<any>>;
for(let i=0;i<3;i++){
  let cookie="";
  const call=async (route:string,method="GET",body?:unknown)=>{
    const response=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
    const set=response.headers.get("set-cookie");if(set)cookie=set.split(";",1)[0];
    const data=await response.json() as any;if(!response.ok)throw Error(`${response.status} ${data.error}`);return data;
  };
  await call("/register","POST",{username:`v2_match_${Date.now()}_${i}`,name:`成员${i}`,password:"test-password-123"});clients.push(call);
}
const [a,b,c]=clients;
const circle=await a("/circles","POST",{name:"V2 意愿匹配测试"});
await b("/circles/join","POST",{code:circle.joinCode});await c("/circles/join","POST",{code:circle.joinCode});
const preview=await a("/intents/preview","POST",{text:"周末想去爬山，预算 200 元以内，最好学校附近"});
if(preview.category!=="徒步"||preview.windowId!==null||preview.budgetCap!==200)throw Error("Natural language extraction failed");
const negative=await a("/intents/preview","POST",{text:"周末不想爬山"});
if(negative.category)throw Error("Negated activity became a positive intent");
const sayings=["周末想去爬山，预算 200 元以内，最好学校附近","周六下午想郊外徒步","想登山，时间待定"];
for(let i=0;i<3;i++)await clients[i](`/circles/${circle.id}/intents`,"POST",{text:sayings[i],matchAllowed:true,contactAllowed:true,confirmed:true});
const lists=await Promise.all(clients.map(call=>call(`/circles/${circle.id}/candidates`)));
const candidate=lists[0].candidates.find((x:any)=>x.status==="probing"&&x.memberCount===3);
if(!candidate||candidate.category!=="徒步"||candidate.windowId!=="afternoon")throw Error("Compatible hiking intents did not match");
const reason=String(candidate.matchReasonJson??"");
if(reason.includes("学校附近")||reason.includes("200")||reason.includes("爬山"))throw Error("Private intent leaked into candidate reason");
for(const call of clients)await call(`/candidates/${candidate.id}/respond`,"POST",{decision:"yes"});
const opened=await a(`/candidates/${candidate.id}/open`,"POST",{});
const room=await b(`/rooms/${opened.roomId}`);
if(!room.joined||room.room?.phase!=="draft"||!room.proposal)throw Error("Candidate did not open a real discussion room");
const discussion=(await a(`/circles/${circle.id}/discussions`)).rooms;
if(!discussion.some((x:any)=>x.id===opened.roomId&&x.memberCount===3))throw Error('Circle discussion list did not show the opened room');
let outsiderCookie='';const outsider=async(route:string,method:'GET'|'POST'='GET',body?:unknown)=>{const response=await fetch(base+route,{method,headers:{...(outsiderCookie?{Cookie:outsiderCookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)outsiderCookie=set.split(';',1)[0];return response;};
const registration=await outsider('/register','POST',{username:`v2o_${Date.now()}`,name:'圈外人',password:'test-password-123'});
if(registration.status!==201)throw Error(`Outsider registration failed: ${registration.status}`);
const outsiderStatus=(await outsider(`/circles/${circle.id}/discussions`)).status;
if(outsiderStatus!==403)throw Error(`Outsider read circle discussion list: ${outsiderStatus}`);
const database=new Database(path.join(process.env.DATA_DIR!,"weekend.db"),{readonly:true});
try{
  const persisted=database.prepare("SELECT status,room_id FROM candidates WHERE id=?").get(candidate.id) as any;
  const members=database.prepare("SELECT count(*) AS n FROM members WHERE room_id=?").get(opened.roomId) as {n:number};
  if(persisted?.status!=="opened"||persisted.room_id!==opened.roomId||members.n!==3)throw Error("Database candidate state inconsistent");
}finally{database.close();}
console.log(JSON.stringify({ok:true,candidateId:candidate.id,roomId:opened.roomId,members:3,privateReason:true}));
