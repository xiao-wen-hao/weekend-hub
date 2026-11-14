import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const source=fs.readFileSync(new URL('./src/api.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const storage=new Map(),requests=[]
let response={statusCode:200,data:{ok:true}},networkError=false,redirect='',relaunch='',backCount=0,pageCount=1
const taro={
  getStorageSync:(key)=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:(key)=>storage.delete(key),
  redirectTo:async({url})=>{redirect=url},reLaunch:async({url})=>{relaunch=url},navigateBack:async()=>{backCount++},getCurrentPages:()=>Array.from({length:pageCount}),request:async(options)=>{requests.push(options);if(networkError)throw Error('offline');return response}
}
const module={exports:{}}
vm.runInNewContext(js,{module,exports:module.exports,require:()=>({__esModule:true,default:taro})})
const client=module.exports

test('Bearer token, platform header, base URL and PATCH request',async()=>{
  client.setBase('http://localhost:3105/');client.setToken('secret-token')
  const result=await client.api('/intents/abc','PATCH',{confirmed:true})
  assert.equal(result.ok,true)
  assert.equal(requests.at(-1).url,'http://localhost:3105/api/intents/abc')
  assert.equal(requests.at(-1).header.Authorization,'Bearer secret-token')
  assert.equal(requests.at(-1).header['X-Client-Platform'],'wechat')
  assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1).data)),{confirmed:true})
})

test('shared room target survives login and is consumed once',()=>{
  client.setToken('');assert.equal(client.requireLogin('/pages/room/index?id=room-1'),true)
  assert.equal(redirect,'/pages/login/index')
  client.setToken('new-token');assert.equal(client.consumeLoginTarget(),'/pages/room/index?id=room-1')
  assert.equal(client.consumeLoginTarget(),'/pages/home/index')
})

test('401 clears expired credential while 403 keeps it',async()=>{
  response={statusCode:401,data:{error:'请先登录'}}
  await assert.rejects(client.api('/rooms'),e=>e.status===401&&e.message==='请先登录')
  assert.equal(client.getToken(),'')
  client.setToken('valid');response={statusCode:403,data:{error:'无权访问'}}
  await assert.rejects(client.api('/circles/foreign/intents'),e=>e.status===403&&e.message==='无权访问')
  assert.equal(client.getToken(),'valid')
})

test('network failure has actionable message',async()=>{
  networkError=true
  await assert.rejects(client.api('/rooms'),e=>e.status===0&&e.message.includes('检查地址和网络'))
  networkError=false
})

test('shared entry back button returns home when no page stack exists',()=>{
  pageCount=1;client.backHome();assert.equal(relaunch,'/pages/home/index')
  pageCount=2;client.backHome();assert.equal(backCount,1)
})
