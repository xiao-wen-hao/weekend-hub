import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';

const targets=await (await fetch(process.env.CDP_LIST||'http://127.0.0.1:9229/json')).json();
const target=targets.find(item=>item.type==='page'&&item.webSocketDebuggerUrl);assert.ok(target,'isolated browser page');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let nextId=1;const pending=new Map();
socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(!message.id)return;const callback=pending.get(message.id);if(!callback)return;pending.delete(message.id);message.error?callback.reject(Error(JSON.stringify(message.error))):callback.resolve(message.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await send('Page.enable');await send('Runtime.enable');
  await send('Network.clearBrowserCookies');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:process.env.TEST_BASE_URL||'http://127.0.0.1:3124'});await wait(1500);
  const loginVisible=await evaluate("!!document.querySelector('.auth-card form')");assert.ok(loginVisible,'Web login rendered');
  const credentials=JSON.stringify({username:process.env.TEST_USER,password:process.env.TEST_PASSWORD});
  await evaluate(`(()=>{const c=${credentials};const inputs=document.querySelectorAll('.auth-card form input');for(const [i,value] of [c.username,c.password].entries()){const input=inputs[i];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}return true})()`);
  await evaluate("document.querySelector('.auth-submit').click()");await wait(1800);
  assert.ok(await evaluate("document.body.innerText.includes('熟人圈')"),'Web home loads real data');
  const roomId=process.env.TEST_ROOM_ID;assert.ok(roomId);
  await send('Page.navigate',{url:`${process.env.TEST_BASE_URL||'http://127.0.0.1:3124'}/?room=${encodeURIComponent(roomId)}`});await wait(1400);
  const state=await evaluate("({room:!!document.querySelector('.room-shell'),text:document.body.innerText.slice(0,1300),question:!!document.querySelector('.coordination-card')})");
  assert.ok(state.text.includes('讨论')||state.text.includes('方案'),'Web room renders real data');
  if(process.env.TEST_ANSWER){
    assert.ok(await evaluate("!!document.querySelector('.coordination-board-link')"),'personal question link visible');
    await evaluate("document.querySelector('.coordination-board-link').click()");await wait(250);
    assert.ok(await evaluate("!!document.querySelector('.coordination-card form input')"),'question has a private reply field');
    await evaluate(`(()=>{const input=document.querySelector('.coordination-card form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(process.env.TEST_ANSWER)});input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    await evaluate("document.querySelector('.coordination-card form button').click()");
    let persisted=false;for(let i=0;i<60;i++){await wait(500);if(await evaluate(`document.body.innerText.includes(${JSON.stringify(process.env.TEST_ANSWER)})`)){persisted=true;break;}}
    assert.ok(persisted,'private answer is displayed after submission');
  }
  if(process.env.TEST_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(process.env.TEST_SCREENSHOT,Buffer.from(shot.data,'base64'));}
  console.log(JSON.stringify({ok:true,login:true,home:true,room:true,question:state.question,answered:!!process.env.TEST_ANSWER,text:state.text.slice(0,220)}));
}finally{socket.close();}
