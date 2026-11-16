const assert=require('node:assert/strict');
const automator=require('miniprogram-automator');

(async()=>{
  const mini=await automator.connect({wsEndpoint:process.env.WEAPP_AUTOMATOR_URL||'ws://127.0.0.1:9420'});
  const exceptions=[];mini.on('exception',error=>exceptions.push(String(error)));
  try{
    await mini.callWxMethod('setStorageSync','zhoumoju_api_base',process.env.TEST_BASE_URL||'http://127.0.0.1:3124');
    await mini.callWxMethod('removeStorageSync','zhoumoju_token');
    let page=await mini.reLaunch('/pages/login/index');
    await page.waitFor(800);
    const inputs=await page.$$('input');assert.equal(inputs.length,3,'login should show server, username, password');
    await inputs[0].input(process.env.TEST_BASE_URL||'http://127.0.0.1:3124');
    await inputs[1].input(process.env.TEST_USER);
    await inputs[2].input(process.env.TEST_PASSWORD);
    const buttons=await page.$$('button');
    const loginButton=await Promise.all(buttons.map(async button=>({button,label:await button.text()})));
    const submit=loginButton.find(x=>x.label.includes('登录并继续'))?.button;assert.ok(submit,'login button is visible');
    await submit.tap();await page.waitFor(1400);
    page=await mini.currentPage();assert.equal(page.path,'pages/home/index','successful login opens home');
    const homeRoot=await page.$('.home-page');assert.ok(homeRoot,'home root is rendered');
    const homeText=await homeRoot.text();assert.ok(homeText.includes('熟人圈'),'home loads circle information');
    const roomCard=await page.$('.room-card');assert.ok(roomCard,'home shows a real discussion');
    await roomCard.tap();await page.waitFor(1100);
    page=await mini.currentPage();assert.equal(page.path,'pages/room/index');
    const roomRoot=await page.$('.room-page');assert.ok(roomRoot,'room root is rendered');
    const roomText=await roomRoot.text();assert.ok(roomText.includes('讨论')||roomText.includes('方案'),'room renders data');
    if(process.env.TEST_ANSWER){
      const questionInput=await page.$('.coordination-input');assert.ok(questionInput,'targeted AI question is visible to this member');
      await questionInput.input(process.env.TEST_ANSWER);
      const replyButton=await page.$('.coordination-card .active-btn');assert.ok(replyButton,'question has a response action');
      await replyButton.tap();
      let cleared=false;for(let i=0;i<60;i++){await page.waitFor(500);page=await mini.currentPage();if(!(await page.$('.coordination-input'))){cleared=true;break;}}
      assert.ok(cleared,'answered question is removed from pending UI');
    }
    if(process.env.TEST_CHAT){
      const tabs=await page.$$('.tab');const labels=await Promise.all(tabs.map(async tab=>({tab,text:await tab.text()})));
      const privateTab=labels.find(x=>x.text.includes('私聊主持人'))?.tab;assert.ok(privateTab);
      await privateTab.tap();await page.waitFor(400);
      const composerView=await page.$('.composer');assert.ok(composerView);
      const composer=await composerView.$('input');assert.ok(composer);
      await composer.input(process.env.TEST_CHAT);
      const send=await composerView.$('.send');assert.ok(send);await send.tap();
      let saved=false;for(let i=0;i<60;i++){await page.waitFor(500);page=await mini.currentPage();const root=await page.$('.room-page');if((await root.text()).includes(process.env.TEST_CHAT)){saved=true;break;}}
      assert.ok(saved,'private message appears in simulator room');
    }
    if(process.env.TEST_SCREENSHOT)await mini.screenshot({path:process.env.TEST_SCREENSHOT});
    assert.deepEqual(exceptions,[],'simulator has no runtime exception');
    console.log(JSON.stringify({ok:true,login:true,home:true,room:true,answered:!!process.env.TEST_ANSWER,chatted:!!process.env.TEST_CHAT,path:page.path,exceptions:exceptions.length}));
  }finally{await mini.disconnect();}
})().catch(error=>{console.error(error);process.exitCode=1;});
