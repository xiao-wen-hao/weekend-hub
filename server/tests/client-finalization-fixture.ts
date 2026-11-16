import assert from 'node:assert/strict';

assert.match(process.env.DATA_DIR??'',/zhoumoju-client-/, 'Refuse to create UI test data in a demo database');
const base=`http://127.0.0.1:${process.env.TEST_PORT??3132}/api`;
const roomPassword='test-password-123';
const stamp=Date.now(),usernames=[`client_h_${stamp}`,`client_g_${stamp}`];
const clients=usernames.map(()=>{let cookie='';return async(route:string,body?:unknown)=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});cookie=response.headers.get('set-cookie')?.split(';',1)[0]??cookie;return {status:response.status,data:await response.json() as any};};});
const [host,guest]=clients;
for(let i=0;i<2;i++)assert.equal((await clients[i]('/register',{username:usernames[i],name:i?'小程序成员':'网页成员',password:roomPassword})).status,201);
const created=await host('/rooms',{mode:'blank',idea:'周末一起徒步'});assert.equal(created.status,201);const roomId=created.data.id;
assert.equal((await guest(`/rooms/${roomId}/join`,{})).status,200);
assert.equal((await host(`/rooms/${roomId}/share`,{publicText:'周日想一起徒步',explicitApproval:true})).status,200);
assert.equal((await guest(`/rooms/${roomId}/share`,{publicText:'周日一起徒步我有兴趣',explicitApproval:true})).status,200);
const read=async()=> (await host(`/rooms/${roomId}`)).data;
const wait=async(predicate:(s:any)=>boolean,label:string)=>{for(let i=0;i<100;i++){const state=await read();if(predicate(state))return state;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(`Timed out: ${label}`);};
let state=await wait(s=>!!s.proposal&&!s.room.coordinationPending,'first proposal');
assert.equal((await host(`/rooms/${roomId}/share`,{publicText:'建议在九龙湾公园附近集合',explicitApproval:true})).status,200);
state=await wait(s=>s.proposal?.plan.area==='九龙湾公园附近'&&!s.room.coordinationPending,'approved public area');
for(const facet of ['budgetMeal','budgetPlay1']){
  const version=state.proposal.version;
  const started=await host(`/rooms/${roomId}/polls`,{facet});assert.equal(started.status,200,JSON.stringify(started.data));
  const option=started.data.poll.options.find((x:any)=>x.id==='100');assert.ok(option);
  for(const client of clients)assert.equal((await client(`/rooms/${roomId}/polls/${started.data.poll.id}/vote`,{optionId:option.id})).status,200);
  state=await wait(s=>!s.room.coordinationPending&&s.proposal?.version>version,`${facet} vote`);
}
assert.deepEqual(state.proposal.pendingFinal,[]);
console.log(JSON.stringify({roomId,usernames,password:roomPassword,proposalId:state.proposal.id,version:state.proposal.version,segments:state.proposal.plan.segments.map((x:any)=>x.id)}));
