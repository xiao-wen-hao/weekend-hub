import assert from "node:assert/strict";

const base=`http://127.0.0.1:${process.env.TEST_PORT??3000}/api`;
let cookie="";
async function request(path:string,method="GET",body?:unknown){
  const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  const set=response.headers.get("set-cookie");if(set)cookie=set.split(";",1)[0];
  return {status:response.status,data:await response.json() as any};
}
const username=`login_${Date.now()}`;
let result=await request("/register","POST",{username,name:"登录测试",password:"safe-password-123"});assert.equal(result.status,201);
result=await request("/logout","POST",{});assert.equal(result.status,200);
cookie="";
result=await request("/login","POST",{username,password:"safe-password-123"});assert.equal(result.status,200);assert.equal(result.data.user.username,username);assert.ok(cookie);
result=await request("/me");assert.equal(result.data.user.username,username);
result=await request("/login","POST",{username,password:"wrong-password"});assert.equal(result.status,401);
const native=await fetch(`${base}/login`,{method:"POST",headers:{"Content-Type":"application/json","X-Client-Platform":"android",Origin:"http://localhost"},body:JSON.stringify({username,password:"safe-password-123"})});
assert.equal(native.status,200);assert.equal(native.headers.get("access-control-allow-origin"),"http://localhost");
const {accessToken}=await native.json() as {accessToken:string};assert.ok(accessToken);
const profile=await fetch(`${base}/me`,{headers:{Authorization:`Bearer ${accessToken}`}});assert.equal((await profile.json() as any).user.username,username);
const revoke=await fetch(`${base}/logout`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`}});assert.equal(revoke.status,200);
const expired=await fetch(`${base}/me`,{headers:{Authorization:`Bearer ${accessToken}`}});assert.equal((await expired.json() as any).user,null);
console.log(JSON.stringify({ok:true,firstLogin:true,sessionRestored:true,invalidPasswordRejected:true,mobileBearer:true}));
