import assert from 'node:assert/strict';

const tabs=await(await fetch('http://127.0.0.1:9229/json')).json(),target=tabs.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);assert.ok(target);
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let id=0;const pending=new Map();socket.addEventListener('message',event=>{const data=JSON.parse(event.data),p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
const evalJs=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const click=(label,unselected=false)=>evalJs(`(()=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(label)}${unselected?"&&!x.classList.contains('selected')":''});if(!button||button.disabled)return false;button.click();return true})()`);
try{
  await send('Page.enable');await send('Runtime.enable');await send('Network.clearBrowserCookies');
  await send('Page.navigate',{url:process.env.TEST_BASE_URL});await sleep(1300);
  const credentials=JSON.stringify({username:process.env.TEST_USER,password:process.env.TEST_PASSWORD});
  await evalJs(`(()=>{const c=${credentials};const inputs=document.querySelectorAll('.auth-card form input');for(const [i,value] of [c.username,c.password].entries()){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[i],value);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('.auth-submit').click();return true})()`);
  await sleep(1400);await send('Page.navigate',{url:`${process.env.TEST_BASE_URL}/?room=${process.env.TEST_ROOM_ID}`});await sleep(1200);
  assert.ok(await evalJs("!!document.querySelector('.plan-card')"),'Web displays the real proposal');
  assert.ok(await click('我能接受这版'),'Web confirmation button available');await sleep(650);
  for(let i=0;i<2;i++){assert.ok(await click('我参加',true),'Web segment signup button available');await sleep(650);}
  const count=await evalJs("document.querySelectorAll('.attendance-line button.selected').length");assert.equal(count,2);
  console.log(JSON.stringify({ok:true,webConfirmed:true,webAttendance:2,roomId:process.env.TEST_ROOM_ID}));
}finally{socket.close();}
