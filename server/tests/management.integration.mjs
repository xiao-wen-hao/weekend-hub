const base='http://127.0.0.1:3000/api';
async function client(label){let cookie='';const call=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';',1)[0];return {status:r.status,data:await r.json()};};const user='m'+Date.now().toString(36)+label;const created=await call('/register','POST',{username:user,name:label,password:'password-123'});if(created.status!==201)throw Error(JSON.stringify(created));return call;}
const owner=await client('owner'),member=await client('member'),outsider=await client('outsider');
const created=await owner('/circles','POST',{name:'安全测试圈'});if(created.status!==201)throw Error('create circle');const id=created.data.id,original=created.data.joinCode;
let r=await outsider(`/circles/${id}/members`);if(r.status!==403)throw Error('outsider read members');
r=await member('/circles/join','POST',{code:original});if(r.status!==200)throw Error('member join');
r=await member(`/circles/${id}/invite/rotate`,'POST',{hours:1});if(r.status!==403)throw Error('member rotated invite');
r=await owner(`/circles/${id}/invite/rotate`,'POST',{hours:1});if(r.status!==200)throw Error('owner rotation');const rotated=r.data.joinCode;
r=await outsider('/circles/join','POST',{code:original});if(r.status!==404)throw Error('old invite still works');
r=await outsider('/circles/join','POST',{code:rotated});if(r.status!==200)throw Error('new invite rejected');
r=await member(`/circles/${id}/members`);if(r.status!==200||r.data.members.length!==3)throw Error('member list');
r=await member('/profile','PATCH',{name:'改名成功'});if(r.status!==200||r.data.name!=='改名成功')throw Error('profile edit');
r=await member(`/circles/${id}/leave`,'POST',{});if(r.status!==200)throw Error('leave');
r=await member(`/circles/${id}/members`);if(r.status!==403)throw Error('former member retained access');
console.log(JSON.stringify({ok:true,rotate:true,oldInviteInvalid:true,roleBoundary:true,leaveRevokesAccess:true}));
