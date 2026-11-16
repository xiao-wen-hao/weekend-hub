import assert from 'node:assert/strict';

const targets=await(await fetch('http://127.0.0.1:9229/json')).json(),target=targets.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);assert.ok(target);
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let nextId=0;const pending=new Map();socket.addEventListener('message',event=>{const data=JSON.parse(event.data),p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await send('Page.enable');await send('Runtime.enable');await send('Network.clearBrowserCookies');
  await send('Page.navigate',{url:process.env.TEST_BASE_URL});await wait(1300);
  const credentials=JSON.stringify({username:process.env.TEST_USER,password:process.env.TEST_PASSWORD});
  await evaluate(`(()=>{const c=${credentials};const inputs=document.querySelectorAll('.auth-card form input');for(const [i,value] of [c.username,c.password].entries()){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[i],value);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('.auth-submit').click();return true})()`);
  await wait(1400);await send('Page.navigate',{url:`${process.env.TEST_BASE_URL}/?room=${process.env.TEST_ROOM_ID}`});await wait(1300);
  const before=await evaluate("({ideas:document.querySelectorAll('.coordination-plan-option').length,evidence:[...document.querySelectorAll('.coordination-plan-option small')].map(x=>x.textContent),version:document.querySelector('.plan-card-head span')?.textContent||null,buttons:[...document.querySelectorAll('.coordination-plan-option button')].map(x=>({text:x.textContent,disabled:x.disabled}))})");
  assert.ok(before.ideas>0,'model option is visible in the actual browser');assert.ok(before.evidence.length>0,'source-backed plan explanation is visible');
  assert.ok(await evaluate("(()=>{const button=[...document.querySelectorAll('.coordination-plan-option button')].find(x=>!x.disabled);if(!button)return false;button.click();return true})()"),'host can adopt a valid model proposal');
  let version=null;for(let i=0;i<80;i++){await wait(250);version=await evaluate("document.querySelector('.plan-card-head span')?.textContent||null");if(version&&version!==before.version)break;}
  assert.ok(version&&version!==before.version,'adopting the model suggestion produces a newer visible plan');
  console.log(JSON.stringify({ok:true,roomId:process.env.TEST_ROOM_ID,ideas:before.ideas,evidence:before.evidence,version}));
}finally{socket.close();}
