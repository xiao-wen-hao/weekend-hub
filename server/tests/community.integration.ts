const base="http://127.0.0.1:3000/api";
async function client(n:number){let cookie="";const call=async(path:string,method="GET",body?:unknown)=>{const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});const set=response.headers.get("set-cookie");if(set)cookie=set.split(";",1)[0];const data=await response.json() as any;if(!response.ok)throw Error(`${response.status} ${data.error}`);return data;};await call("/register","POST",{username:`test_${Date.now()}_${n}`,name:`用户${n}`,password:"test-password-123"});return call;}
const [a,b,c]=await Promise.all([client(1),client(2),client(3)]);
const circle=await a("/circles","POST",{name:"周末朋友"});
await b("/circles/join","POST",{code:circle.joinCode});await c("/circles/join","POST",{code:circle.joinCode});
for(const call of [a,b,c])await call(`/circles/${circle.id}/intents`,"POST",{text:"周六下午想玩桌游",matchAllowed:true,contactAllowed:true});
const own=await a(`/circles/${circle.id}/intents`);if(own.intents.length!==1)throw Error("Private intents leaked");
const candidate=(await a(`/circles/${circle.id}/candidates`)).candidates[0];if(!candidate||candidate.memberCount!==3)throw Error("Candidate missing");
for(const call of [a,b,c])await call(`/candidates/${candidate.id}/respond`,"POST",{decision:"yes"});
const opened=await a(`/candidates/${candidate.id}/open`,"POST",{});if(!opened.roomId)throw Error("Room not created");
const room=await b(`/rooms/${opened.roomId}`);if(!room.joined||!room.proposal)throw Error("Opening draft missing");
const withdrawn=await a(`/intents/${own.intents[0].id}/withdraw`,"POST",{});if(!withdrawn.ok)throw Error("Withdrawal failed");
console.log(JSON.stringify({ok:true,candidateId:candidate.id,roomId:opened.roomId,privateIntents:true,participants:3}));
export {};
