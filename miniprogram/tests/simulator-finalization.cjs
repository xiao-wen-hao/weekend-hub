const assert=require('node:assert/strict');
const automator=require('miniprogram-automator');

(async()=>{
  const mini=await automator.connect({wsEndpoint:process.env.WEAPP_AUTOMATOR_URL||'ws://127.0.0.1:9420'}),exceptions=[];
  mini.on('exception',error=>exceptions.push(String(error)));
  try{
    await mini.callWxMethod('setStorageSync','zhoumoju_api_base',process.env.TEST_BASE_URL);
    await mini.callWxMethod('removeStorageSync','zhoumoju_token');
    let page=await mini.reLaunch('/pages/login/index');await page.waitFor(500);
    const fields=await page.$$('input');assert.equal(fields.length,3);
    await fields[0].input(process.env.TEST_BASE_URL);await fields[1].input(process.env.TEST_USER);await fields[2].input(process.env.TEST_PASSWORD);
    const choose=async(text)=>{const buttons=await page.$$('button');const labels=await Promise.all(buttons.map(async button=>({button,label:await button.text()})));const found=labels.find(x=>x.label.includes(text));assert.ok(found,`button ${text}`);await found.button.tap();};
    await choose('登录并继续');await page.waitFor(1200);
    page=await mini.currentPage();assert.equal(page.path,'pages/home/index');
    const room=await page.$('.room-card');assert.ok(room);await room.tap();await page.waitFor(900);
    page=await mini.currentPage();assert.equal(page.path,'pages/room/index');
    await choose('查看详细方案、确认与报名');await page.waitFor(350);
    await choose('接受这版');await page.waitFor(850);
    for(let i=0;i<2;i++){const buttons=await page.$$('button');const matches=await Promise.all(buttons.map(async button=>({button,label:await button.text()})));const attend=matches.filter(x=>x.label==='我参加');assert.equal(attend.length,2);await attend[i].button.tap();await page.waitFor(700);}
    const content=await(await page.$('.room-page')).text();if(process.env.EXPECT_FINAL==='1')assert.ok(content.includes('已定案'),'all members confirmed the same version');
    assert.deepEqual(exceptions,[]);
    console.log(JSON.stringify({ok:true,miniConfirmed:true,miniAttendance:2,final:content.includes('已定案'),exceptions:0}));
  }finally{await mini.disconnect();}
})().catch(error=>{console.error(error);process.exitCode=1;});
