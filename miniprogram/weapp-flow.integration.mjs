import assert from 'node:assert/strict'

const base='http://127.0.0.1:3107/api',seed=Date.now().toString(36)
async function request(path,method='GET',body,credential={}){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...credential},body:body===undefined?undefined:JSON.stringify(body)})
  const data=await response.json()
  if(!response.ok)throw Error(`${method} ${path}: ${response.status} ${data.error}`)
  return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]}
}
const accounts=[]
for(let n=1;n<=3;n++){
  const username=`weapp_${seed}_${n}`,password='weapp-test-123'
  const reg=await request('/register','POST',{username,name:`小程序成员${n}`,password},{'X-Client-Platform':'wechat'})
  assert.ok(reg.data.accessToken)
  const login=await request('/login','POST',{username,password})
  accounts.push({bearer:{Authorization:`Bearer ${reg.data.accessToken}`},cookie:{Cookie:login.cookie},id:reg.data.user.id})
}
const [a,b,c]=accounts
const call=(who,path,method='GET',body,web=false)=>request(path,method,body,web?who.cookie:who.bearer).then(x=>x.data)
const circle=await call(a,'/circles','POST',{name:'小程序集成测试圈'})
for(const who of [b,c])await call(who,'/circles/join','POST',{code:circle.joinCode})
const preview=await call(a,'/intents/preview','POST',{text:'周六下午想玩桌游，预算100元'})
assert.equal(preview.category,'桌游');assert.equal(preview.windowId,'afternoon')
const draft=await call(a,`/circles/${circle.id}/intents`,'POST',{text:'周六下午想玩桌游，预算100元',category:preview.category,windowId:preview.windowId,matchAllowed:true,contactAllowed:true,confirmed:false})
assert.equal(draft.status,'paused')
await call(a,`/intents/${draft.id}`,'PATCH',{confirmed:true,status:'active'})
for(const who of [b,c])await call(who,`/circles/${circle.id}/intents`,'POST',{text:'周六下午想玩桌游',category:'桌游',windowId:'afternoon',matchAllowed:true,contactAllowed:true,confirmed:true})
const candidate=(await call(a,`/circles/${circle.id}/candidates`)).candidates[0]
assert.equal(candidate.memberCount,3)
for(const who of [a,b,c])await call(who,`/candidates/${candidate.id}/respond`,'POST',{decision:'yes'})
const {roomId}=await call(a,`/candidates/${candidate.id}/open`,'POST',{})
const weapp=await call(b,`/rooms/${roomId}`)
const web=await call(b,`/rooms/${roomId}`,'GET',undefined,true)
assert.equal(weapp.proposal.id,web.proposal.id)
assert.equal(weapp.proposal.version,web.proposal.version)
assert.deepEqual(weapp.members,web.members)
const segment=weapp.proposal.plan.segments[0]
await call(b,`/rooms/${roomId}/attendance`,'POST',{proposalId:weapp.proposal.id,segmentId:segment.id,decision:'yes'})
const webAfterSignup=await call(b,`/rooms/${roomId}`,'GET',undefined,true)
assert.equal(webAfterSignup.proposal.attendance.find(x=>x.userId===b.id&&x.segmentId===segment.id)?.decision,'yes')
await call(b,`/rooms/${roomId}/message`,'POST',{text:'我九点前要回家，玩乐预算100元'})
const other=await call(a,`/rooms/${roomId}`)
assert.ok(!other.messages.some(m=>m.body.includes('九点前')))
const mine=await call(b,`/rooms/${roomId}`)
assert.ok(mine.messages.some(m=>m.body.includes('九点前')))
console.log(JSON.stringify({ok:true,realApi:true,preview:true,candidate:true,roomId,webParity:true,signupSynced:true,privateIsolation:true}))
