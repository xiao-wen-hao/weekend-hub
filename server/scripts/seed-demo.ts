/** Creates a real, repeatable course-demo room through public API endpoints. */
const base=(process.env.DEMO_BASE_URL??"http://127.0.0.1:3000").replace(/\/$/,"");
const accounts=[
  {username:"demo_aqing",name:"阿青"},
  {username:"demo_xiaolin",name:"小林"},
  {username:"demo_qixi",name:"七喜"},
  {username:"demo_mumu",name:"木木"},
];
const password="DemoPass1234";
type Client=(path:string,method?:string,body?:unknown)=>Promise<any>;
async function client(username:string,name:string):Promise<Client>{
  let cookie="";
  const call:Client=async(path,method="GET",body)=>{
    const response=await fetch(`${base}/api${path}`,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
    const next=response.headers.get("set-cookie");if(next)cookie=next.split(";",1)[0];
    const data=await response.json() as any;
    if(!response.ok)throw Error(`${method} ${path}: ${response.status} ${data.error??"请求失败"}`);
    return data;
  };
  try{await call("/register","POST",{username,name,password});}
  catch(error){if(!String(error).includes("409"))throw error;await call("/login","POST",{username,password});}
  return call;
}

const users=await Promise.all(accounts.map(a=>client(a.username,a.name)));
const owner=users[0];
let roomId:string,circleId:string|null=null;
const latest=(await owner("/rooms")).rooms.find((room:{id:string;title:string;phase:string;memberCount:number})=>room.title==="桌游周末局"&&room.phase==="discussing"&&room.memberCount===4);
if(latest&&process.env.DEMO_FRESH!=="1"){
  roomId=latest.id;
}else{
  const circle=await owner("/circles","POST",{name:`本地示例圈 ${new Date().toLocaleDateString("zh-CN")}`});circleId=circle.id;
  for(const user of users.slice(1))await user("/circles/join","POST",{code:circle.joinCode});
  for(const user of users)await user(`/circles/${circle.id}/intents`,"POST",{text:"周六下午想玩桌游，聚餐后最好还有时间聊聊",category:"桌游",windowId:"afternoon",confirmed:true,matchAllowed:true,contactAllowed:true});
  const candidates=(await owner(`/circles/${circle.id}/candidates`)).candidates as {id:string;memberCount:number}[];
  const candidate=candidates.find(c=>c.memberCount===4);if(!candidate)throw Error("四人候选局没有生成");
  for(const user of users)await user(`/candidates/${candidate.id}/respond`,"POST",{decision:"yes"});
  roomId=(await owner(`/candidates/${candidate.id}/open`,"POST",{})).roomId;
  await owner(`/rooms/${roomId}/message`,"POST",{text:"我想在学校附近集合，先吃再玩，第一场桌游预算80元，聚餐人均预算120元。"});
  await users[1](`/rooms/${roomId}/message`,"POST",{text:"我最晚21点要离开，不能吃火锅，想吃烤肉。聚餐人均最多100元。"});
}
const waitForPlan=async()=>{for(let n=0;n<45;n++){const state=await owner(`/rooms/${roomId}`);if(state.room.phase!=="blocked"&&!state.room.coordinationPending&&state.proposal?.pendingFinal?.length===0&&!state.poll)return state;await new Promise(resolve=>setTimeout(resolve,300));}throw Error(`房间 ${roomId} 的方案未稳定：协调未结束、存在投票或尚缺定案字段`)};
let state=await waitForPlan();
if(process.env.DEMO_COMPLETE==="1"){
  state=await owner(`/rooms/${roomId}/polls`,"POST",{facet:"food"});
  const poll=state.poll;if(!poll)throw Error("未发起真实投票");
  const meal=state.proposal.plan.segments.find((segment:{id:string})=>segment.id==="meal")?.category;
  const choice=poll.options.find((option:{value:string})=>option.value===meal)??poll.options[0];
  for(const user of users)await user(`/rooms/${roomId}/polls/${poll.id}/vote`,"POST",{optionId:choice.id});
  state=await waitForPlan();
  const proposalId=state.proposal.id;
  for(const user of users)for(const segment of state.proposal.plan.segments)await user(`/rooms/${roomId}/attendance`,"POST",{proposalId,segmentId:segment.id,decision:"yes"});
  for(const user of users)await user(`/rooms/${roomId}/confirm`,"POST",{proposalId,decision:"accept"});
  const verify=async(expectedVersion:number,expectedId:string)=>{
    const states=await Promise.all(users.map(user=>user(`/rooms/${roomId}`)));
    const current=states[0];
    if(current.room.phase!=="final")throw Error(`房间未保持 final，当前阶段：${current.room.phase}`);
    if(current.room.coordinationPending)throw Error("定案后仍有待处理协调任务");
    if(current.proposal.id!==expectedId||current.proposal.version!==expectedVersion)throw Error(`当前方案从 v${expectedVersion}/${expectedId} 变为 v${current.proposal.version}/${current.proposal.id}`);
    if(current.proposal.confirmed!==4)throw Error(`当前方案确认数为 ${current.proposal.confirmed}，预期 4`);
    const members=new Set(current.members.map((member:{id:string})=>member.id));
    const segments=current.proposal.plan.segments.map((segment:{id:string})=>segment.id);
    if(members.size!==4||segments.length!==2||!segments.includes("meal")||!segments.includes("play1"))throw Error("当前成员或两项活动与预期不符");
    for(const userState of states)if(userState.proposal.id!==expectedId||userState.proposal.myDecision!=="accept")throw Error("四人没有接受同一个当前 proposal ID");
    const attendance=current.proposal.attendance;
    if(attendance.length!==8||segments.some((segmentId:string)=>[...members].some(userId=>attendance.filter((entry:{segmentId:string;userId:string;decision:string})=>entry.segmentId===segmentId&&entry.userId===userId&&entry.decision==="yes").length!==1)))throw Error(`当前版本分项报名不完整：${attendance.length}/8`);
    return current;
  };
  state=await verify(state.proposal.version,proposalId);
  await new Promise(resolve=>setTimeout(resolve,1200));
  state=await verify(state.proposal.version,proposalId);
}
console.log(JSON.stringify({ok:true,roomId,circleId,url:`${base}/?room=${roomId}`,accounts:accounts.map(x=>x.username),password,phase:state.room.phase,version:state.proposal.version,proposalId:state.proposal.id,confirmed:state.proposal.confirmed,attendance:state.proposal.attendance.length,notes:process.env.DEMO_COMPLETE==="1"?"等待后再次读取真实数据库，四人同版确认与两项报名仍稳定":"现场可继续投票、确认和分项报名"}));
