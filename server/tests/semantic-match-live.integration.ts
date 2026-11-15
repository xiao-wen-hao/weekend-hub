import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';

const base=`http://127.0.0.1:${process.env.TEST_PORT??3123}/api`;
const clients=Array.from({length:3},()=>{let cookie='';return async(route:string,method='GET',body?:unknown)=>{const response=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});cookie=response.headers.get('set-cookie')?.split(';',1)[0]??cookie;return {status:response.status,data:await response.json() as any};};});
const [a,b,c]=clients,stamp=Date.now(),ids:string[]=[];
for(let i=0;i<3;i++){const result=await clients[i]('/register','POST',{username:`cross_${stamp}_${i}`,name:`匹配成员${i}`,password:'test-password-123'});assert.equal(result.status,201);ids.push(result.data.user.id);}
const circle=await a('/circles','POST',{name:'跨类别语义匹配验收'});assert.equal(circle.status,201);
for(const client of [b,c])assert.equal((await client('/circles/join','POST',{code:circle.data.joinCode})).status,200);
const intents=[
  {client:a,text:'周末想爬山，最好轻松些',category:'徒步'},
  {client:b,text:'想去郊外走走，不想太累',category:'散步聊天'},
  {client:c,text:'周末只想打羽毛球，不想爬山',category:'羽毛球'},
];
for(const item of intents){const response=await item.client(`/circles/${circle.data.id}/intents`,'POST',{text:item.text,category:item.category,confirmed:true,matchAllowed:true,contactAllowed:true});assert.equal(response.status,201,JSON.stringify(response.data));}
const candidates=(await a(`/circles/${circle.data.id}/candidates`)).data.candidates as any[];
const cross=candidates.find(x=>x.status==='probing'&&x.memberCount===2&&x.matchReasonJson&&JSON.parse(x.matchReasonJson).source==='model');
assert.ok(cross,'real semantic match must create a cross-category candidate');
assert.ok((await b(`/circles/${circle.data.id}/candidates`)).data.candidates.some((x:any)=>x.id===cross.id));
assert.ok(!(await c(`/circles/${circle.data.id}/candidates`)).data.candidates.some((x:any)=>x.id===cross.id),'badminton member not included');
const db=new Database(path.join(process.env.DATA_DIR!,'weekend.db'),{readonly:true});
try{const members=db.prepare('SELECT user_id AS userId,intent_id AS intentId FROM candidate_members WHERE candidate_id=? ORDER BY user_id').all(cross.id) as {userId:string;intentId:string|null}[];assert.equal(members.length,2);assert.ok(members.every(x=>x.intentId));}finally{db.close();}
assert.equal((await a(`/candidates/${cross.id}/respond`,'POST',{decision:'yes'})).status,200);
assert.equal((await b(`/candidates/${cross.id}/respond`,'POST',{decision:'yes'})).status,200);
const opened=await a(`/candidates/${cross.id}/open`,'POST',{});assert.equal(opened.status,201,JSON.stringify(opened.data));
assert.equal((await c(`/rooms/${opened.data.roomId}`)).status,403);
console.log(JSON.stringify({ok:true,source:'real-model',crossCategory:true,candidateId:cross.id,roomId:opened.data.roomId,unrelatedMemberExcluded:true}));
