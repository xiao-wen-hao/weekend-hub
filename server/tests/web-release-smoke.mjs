import assert from 'node:assert/strict';

const targets=await(await fetch('http://127.0.0.1:9235/json')).json();
const target=targets.find(item=>item.type==='page'&&item.webSocketDebuggerUrl);
assert.ok(target,'browser target missing');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let nextId=0;
const pending=new Map();
socket.addEventListener('message',event=>{const data=JSON.parse(event.data);const waiter=pending.get(data.id);if(!waiter)return;pending.delete(data.id);data.error?waiter.reject(Error(JSON.stringify(data.error))):waiter.resolve(data.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const data=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(data.exceptionDetails)throw Error(JSON.stringify(data.exceptionDetails));return data.result.value;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await send('Runtime.enable');
  let warning=false,app=false;
  for(let i=0;i<20;i++){await sleep(300);warning=await evaluate("document.body?.innerText.includes('Visit Site')||false");app=await evaluate("document.body?.innerText.includes('周末局')||false");if(warning||app)break;}
  if(warning){await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Visit Site'))?.click();true");for(let i=0;i<35;i++){await sleep(300);app=await evaluate("document.body?.innerText.includes('周末局')||false");if(app)break;}}
  assert.ok(app,'public URL should render the Weekend Hub Web client');
  console.log(JSON.stringify({ok:true,ngrokWarning:warning,appAfterContinue:app}));
}finally{socket.close();}
