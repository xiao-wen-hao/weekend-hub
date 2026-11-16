import assert from 'node:assert/strict';

const targets=await(await fetch('http://127.0.0.1:9222/json')).json(),target=targets.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);assert.ok(target);
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let nextId=0;const pending=new Map();socket.addEventListener('message',event=>{const data=JSON.parse(event.data),p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await send('Page.enable');await send('Runtime.enable');
  await evaluate(`localStorage.setItem('zhoumoju_api_base',${JSON.stringify(process.env.ANDROID_API_BASE)});true`);
  assert.ok(await evaluate("!!document.querySelector('.auth-card form')"),'Android login screen visible');
  const details=JSON.stringify({server:process.env.ANDROID_API_BASE,username:process.env.TEST_USER,password:process.env.TEST_PASSWORD});
  await evaluate(`(()=>{const c=${details};const inputs=document.querySelectorAll('.auth-card form input');for(const [i,value] of [c.server,c.username,c.password].entries()){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[i],value);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('.auth-submit').click();return true})()`);
  let state=null;for(let i=0;i<35;i++){await wait(300);state=await evaluate("({home:!!document.querySelector('.dashboard'),error:document.querySelector('.form-error')?.textContent||null})");if(state.home||state.error)break;}
  assert.ok(state.home,`Android login failed: ${state.error||'timed out'}`);
  await send('Page.navigate',{url:`https://localhost/?room=${process.env.TEST_ROOM_ID}`});await wait(1000);
  const room=await evaluate("({visible:!!document.querySelector('.room-page'),text:document.body.innerText.slice(0,1400),plan:!!document.querySelector('.plan-card')})");
  assert.ok(room.visible,'Android opens a real room');
  if(process.env.TEST_ANSWER){
    await evaluate("[...document.querySelectorAll('.mobile-tabs button')].find(x=>x.textContent.includes('私聊'))?.click()");
    let question=false;for(let i=0;i<180;i++){await wait(500);question=await evaluate("!!document.querySelector('.coordination-card form input')");if(question)break;}
    assert.ok(question,'Android shows a real targeted coordination question');
    await evaluate(`(()=>{const input=document.querySelector('.coordination-card form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(process.env.TEST_ANSWER)});input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.coordination-card form button').click();return true})()`);
    let answered=false;for(let i=0;i<70;i++){await wait(500);answered=await evaluate(`document.body.innerText.includes(${JSON.stringify(process.env.TEST_ANSWER)})`);if(answered)break;}
    assert.ok(answered,'Android response is persisted and displayed in the private chat');
  }else assert.ok(room.plan,'Android opens the final proposal');
  console.log(JSON.stringify({ok:true,androidLogin:true,room:true,plan:room.plan,answered:!!process.env.TEST_ANSWER,text:room.text.slice(0,260)}));
}finally{socket.close();}
