import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';

const targets=await(await fetch('http://127.0.0.1:9229/json')).json();
const target=targets.find(item=>item.type==='page'&&item.webSocketDebuggerUrl);
assert.ok(target,'a browser inspection target is required');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let nextId=0;
const pending=new Map();
socket.addEventListener('message',event=>{const data=JSON.parse(event.data);const waiting=pending.get(data.id);if(!waiting)return;pending.delete(data.id);data.error?waiting.reject(Error(JSON.stringify(data.error))):waiting.resolve(data.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await send('Page.enable');await send('Runtime.enable');await send('Network.clearBrowserCookies');
  await send('Page.navigate',{url:process.env.TEST_BASE_URL});await wait(1200);
  const credentials=JSON.stringify({username:process.env.TEST_USER,password:process.env.TEST_PASSWORD});
  await evaluate(`(()=>{const c=${credentials};const inputs=document.querySelectorAll('.auth-card form input');for(const [i,value] of [c.username,c.password].entries()){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[i],value);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('.auth-submit').click();return true})()`);
  await wait(1200);await send('Page.navigate',{url:`${process.env.TEST_BASE_URL}/?room=${process.env.TEST_ROOM_ID}`});await wait(1800);
  const state=await evaluate(`(()=>{const card=document.querySelector('.coordination-plan-option');card?.scrollIntoView({block:'center'});return {cards:document.querySelectorAll('.coordination-plan-option').length,explanations:[...document.querySelectorAll('.coordination-plan-option small')].map(item=>item.textContent)}})()`);
  assert.ok(state.cards>0,'a model plan option is shown');assert.ok(state.explanations.length>0,'source-backed explanation is shown');
  await wait(300);
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(process.env.SCREENSHOT_PATH,Buffer.from(screenshot.data,'base64'));
  console.log(JSON.stringify({ok:true,roomId:process.env.TEST_ROOM_ID,cards:state.cards,explanations:state.explanations,screenshot:process.env.SCREENSHOT_PATH}));
}finally{socket.close();}
