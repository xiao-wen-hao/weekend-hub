import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const targets=await(await fetch('http://127.0.0.1:9222/json')).json();
const target=targets.find(item=>item.type==='page'&&item.webSocketDebuggerUrl);
assert.ok(target,'Android WebView inspection target missing');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let nextId=0;
const pending=new Map();
socket.addEventListener('message',event=>{const data=JSON.parse(event.data);const wait=pending.get(data.id);if(!wait)return;pending.delete(data.id);data.error?wait.reject(Error(JSON.stringify(data.error))):wait.resolve(data.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const data=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(data.exceptionDetails)throw Error(JSON.stringify(data.exceptionDetails));return data.result.value;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await send('Runtime.enable');
  const defaultBase=await evaluate("document.querySelector('.auth-card form input')?.value||null");
  assert.equal(defaultBase,process.env.ANDROID_API_BASE,'APK should prefill the active HTTPS endpoint');
  await evaluate("document.querySelector('.auth-switch').click();true");
  assert.ok(await evaluate("document.body.innerText.includes('内测邀请码')"),'registration shows the trial invite field');
  const username=`apk_${Date.now().toString(36)}`,password=`Probe-${crypto.randomUUID()}`;
  const values=JSON.stringify([defaultBase,process.env.TRIAL_INVITE_CODE,username,'APK 测试',password]);
  await evaluate(`(()=>{const values=${values};const inputs=document.querySelectorAll('.auth-card form input');for(let i=0;i<values.length;i++){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[i],values[i]);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('.auth-submit').click();return true})()`);
  let state=null;for(let i=0;i<40;i++){await sleep(300);state=await evaluate("({home:!!document.querySelector('.dashboard'),error:document.querySelector('.form-error')?.textContent||null})");if(state.home||state.error)break;}
  assert.ok(state.home,`APK registration failed: ${state.error||'timed out'}`);
  console.log(JSON.stringify({ok:true,defaultBase,inviteField:true,registeredThroughPublicApi:true}));
}finally{socket.close();}
