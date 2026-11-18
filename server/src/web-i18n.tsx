import {useState} from 'react';
import './web-i18n.css';

export type Locale='zh'|'en';
const KEY='zhoumoju-locale';
let current:Locale=localStorage.getItem(KEY)==='en'?'en':'zh';
const originals=new WeakMap<Text,string>();
const originalAttributes=new WeakMap<Element,Map<string,string>>();

// Only application-owned labels belong here. User messages and AI prose remain in their original language.
const en:Record<string,string>={
  '周末局':'Weekend Hub','首页':'Home','讨论间':'Discussions','熟人圈':'Circles','我的':'Me','退出':'Log out','退出登录':'Log out','已登录':'Signed in','主导航':'Main navigation',
  '把「改天约」变成「周末见」':'Turn “sometime” into this weekend','正在打开周末局…':'Opening Weekend Hub…','正在打开讨论间…':'Opening discussion…','正在打开讨论…':'Opening discussion…',
  '你好，':'Hello, ','看看朋友的回应，或发起一场新的讨论。':'See what your friends said, or start a discussion.','我的消息':'My updates','查看全部':'View all','查看全部 →':'View all →','最近讨论':'Recent discussions','发起一场讨论':'Start a discussion',
  '功能简介 了解一下 →':'How it works →','功能简介':'How it works','了解一下':'Learn more','收起':'Hide','查看讨论 →':'View discussions →','方案待确认':'Plan needs acceptance','共同兴趣有新回应':'New reply to shared interest','讨论有新进展':'Discussion updated','去看看最新进展':'See the latest update','位朋友 ·':'friends ·','位朋友':'friends','位成员':'members','人':'people',
  '所有讨论间':'All discussions','你参与的讨论，都在这里。':'Your discussions are here.','邀请与成员':'Invites and members','接受讨论邀请':'Accept invitation','加入这场周末局':'Join this discussion','接受邀请并加入':'Accept and join','暂不加入':'Not now','发起的讨论 ·':'started this discussion ·',
  '公告牌':'Shared board','聚会公告牌':'Discussion board','和主持人私聊':'Private AI chat','和 AI 主持人聊聊':'Chat with the AI host','私人会话':'Private conversation','只对你可见的对话':'Only you can see this chat',
  '自由讨论':'Open discussion','讨论中':'Discussing','已定案':'Finalized','等待协调':'Coordinating','待定':'To be decided','已结束':'Finished','进行中':'Active','全部':'All','待我回应':'Needs my reply',
  '目前还没有全员可行的安排':'No plan works for everyone yet','上一版已暂停。主持人会私下询问最可能解决冲突的人，也可以由发起人发起一轮投票。':'The previous plan is paused. The host may ask the relevant members privately, or the organizer can start a poll.',
  '大家都确认了这一版':'Everyone accepted this version','时间、区域、方式和预算都能接受吗？':'Does this time, area, activity and budget work for you?','可以继续在线下决定具体店铺与预订。':'You can decide on the venue and booking offline.','先完成正在进行的投票，再确认新方案。':'Finish the current poll before accepting the new plan.',
  '我已确认这版':'I accepted this version','我能接受这版':'I can accept this version','有地方不合适':'Something does not work','参与的朋友':'Participants','公开记录':'Public updates','讨论进展':'Discussion progress','发起一轮投票':'Start a poll',
  '你':'You','已表达想法':'Shared an idea','待回复':'Awaiting reply','其他人的私人条件不会显示在这里':'Other members’ private conditions are hidden here','别人的私人条件不会显示在这里。':'Other members’ private conditions are hidden here.',
  '这里可以先自由聊，原话只在你的私人会话里。想让大家看到一条想法时，再由你核对并公开。':'Speak freely here. Your words remain private until you review and share a specific idea.',
  '草案已贴在公告牌上。直接说哪里不合适、想换什么，或问我还能怎么玩。':'The draft is on the board. Say what does not work, what to change, or ask for ideas.',
  '主持人想听听你':'The host wants your input','目前没有急需回答的问题。想到新玩法、时间限制或预算变化，随时告诉我。':'No question needs an answer right now. Share a new idea, time limit or budget change anytime.',
  '把一条想法公开分享给大家':'Share one idea publicly','私聊内容由 AI 模型处理，不会展示给其他参与者':'The AI processes this private chat. Other participants cannot see it.',
  '先有草案':'Start with a draft','私下协调':'Coordinate privately','逐人确认':'Individual acceptance','欢迎回来':'Welcome back','加入周末局':'Join Weekend Hub','登录账号':'Sign in','创建账号':'Create an account','登录并继续':'Sign in and continue','注册并继续':'Sign up and continue','还没有账号？创建一个':'No account? Create one','已有账号？返回登录':'Have an account? Sign in',
  '用自己的账号加入讨论间，私人偏好只在你的会话中显示。':'Sign in to join discussions. Your private preferences stay in your own chat.','后端地址':'Server address','内测邀请码':'Trial invitation code','用户名':'Username','昵称':'Display name','显示昵称':'Display name','密码':'Password','登录':'Sign in','注册':'Sign up','没有账号？注册':'No account? Sign up','已有账号？登录':'Have an account? Sign in','字母、数字或下划线':'Letters, numbers or underscores','至少 8 位':'At least 8 characters','向组局负责人获取':'Ask the organizer for a code','朋友们怎么称呼你？':'How should friends call you?','例如 https://你的域名':'For example, https://your-domain.com',
  '好朋友，好商量。':'Better plans with friends.','周末局，':'Weekend Hub,','几点见？吃什么？玩几场？结束后还续不续？先有一版草案，再让每个人都能把真实想法说出来。':'When, where and what should we do? Start with a draft, then let everyone speak honestly.',
  '创建熟人圈':'Create a circle','＋ 创建熟人圈':'＋ Create a circle','加入熟人圈':'Join a circle','我的熟人圈':'My circles','管理全部':'Manage all','管理全部 →':'Manage all →','朋友们公开的想法':'Friends’ public ideas','发布一个想法':'Share an idea','＋ 发布一个想法':'＋ Share an idea',
  '看看朋友的想法，从一句话开始商量周末。':'See your friends’ ideas and start planning with a sentence.','还没有熟人圈，先创建一个或用邀请码加入。':'No circles yet. Create one or join with a code.','圈内还没有成员选择公开想法。私人的意愿不会出现在这里。':'No one has shared a public idea in this circle yet. Private wishes stay hidden.',
  '收起管理':'Close management','邀请码':'Invitation code','加入':'Join','创建':'Create','关闭':'Close','取消':'Cancel','保存':'Save','确认':'Confirm','重试':'Retry','加载失败':'Could not load','操作失败':'Action failed',
  '先随口说说，AI 理解后由你确认投递。':'Say it naturally. Review the AI interpretation before posting.','告诉哪个熟人圈':'Choose a circle','公开给所选熟人圈成员':'Share with members of the selected circle','让 AI 理解并确认投递 →':'Review AI interpretation →',
  '意愿原话默认仅本人可见。授权匹配只用于发现共同兴趣，不会公开原话。':'Your original words are private by default. Matching permission does not publish them.',
  '熟人圈详情':'Circle details','所有熟人圈':'All circles','圈内讨论':'Circle discussions','新待办':'New tasks','圈子成员':'Circle members','更新邀请码':'Renew invitation code','复制':'Copy',
  '朋友邀请你一起商量':'A friend invited you to discuss','临时参与':'Guest access','输入昵称即可参与当前讨论。加入讨论不等于报名；你的私人意见不会自动公开。':'Enter a name to join this discussion. Joining is not a commitment, and private comments remain private.',
  '朋友怎么称呼你？':'What should your friends call you?','输入昵称':'Enter a name','加入这场讨论':'Join discussion','如链接已过期，请发起人重新分享。':'If the link expired, ask the organizer for a new one.',
  '与朋友一起商量':'Plan together with friends','共享进展':'Shared progress','我的私人 AI':'My private AI','区域待商量':'Area to discuss','预算待商量':'Budget to discuss','暂无':'None yet','我参加':'I’m joining','这段不来':'Not this part',
  '方案变化后需要重新确认。':'Accept again if the plan changes.','匿名投票':'Anonymous poll','选择':'Choose','公开进展':'Public progress','和 AI 主持人私聊':'Chat privately with the AI host',
  '你说的条件默认只在这里显示。AI 可以用它协调安排，但不会直接公开原话。':'Your conditions stay here by default. The AI may use them for coordination, but will not publish your words.',
  '发送给 AI':'Send to AI','主动公开一条想法':'Share an idea publicly','想保留这次讨论？':'Want to keep this discussion?','注册或登录正式账号':'Sign up or sign in','保存你的讨论记录':'Keep your discussion history',
  '关联后进入完整周末局，原来的发言和报名会保留。':'Link an account to keep your messages and sign-ups.','已有账号登录':'Sign in to an existing account','关联并继续':'Link and continue',
  '共享公告':'Shared board','大家共同看到':'Visible to everyone here','这场局，聊到哪了':'Where the discussion stands','正在整理公开进展…':'Summarizing public progress…','已经说定':'Agreed','目前的想法':'Current ideas',
  '还没有公开方案。先说说你想怎么过这个周末。':'No public plan yet. Tell the group what you would like to do.','朋友主动分享':'Shared by friends','还没达成一致':'Still unresolved','下一步':'Next step','最近进展':'Recent updates',
  '公开分享想法':'Share an idea publicly','由你决定公开什么':'You decide what to share','分享给这场局的朋友':'Share with this discussion','将公开的准确内容':'Exact text to share',
  '我确认上面的文字会向本讨论间所有成员公开':'I agree to share this text with everyone in this discussion','确认公开分享':'Share this text',
  '需要你回应的协商问题':'A question for you','AI 想听听你的想法':'The AI wants your input','回应':'Reply','只在你的私人会话里回答；不回答也不会被视为同意。你也可以说明哪些条件能调整。':'Reply privately. No answer is never treated as agreement. You can say what is flexible.',
  'AI 提出的讨论方向':'AI suggestions','AI 发现需要商量的地方':'Issues to discuss','AI 根据当前表达提出建议；每个人仍需核对并自行确认。':'The AI suggests an option from current input. Everyone must review and decide for themselves.',
  '只联系需要回应的人，私人条件不会在这里公开。':'Only relevant members are asked. Private conditions stay hidden.','日期待商量':'Date to discuss','时间待商量':'Time to discuss','核对并生成草案':'Review and draft a plan',
  '主持人记住的私人条件':'Private conditions remembered by the host','仅你可见':'Only you can see this','还没有记录条件。说一句你的真实安排，主持人会从原话中提取。':'No conditions recorded yet. Tell the host about your actual availability.',
  'AI 语义理解':'AI interpretation','基础识别（模型暂不可用）':'Basic recognition (model unavailable)','这轮没有擅自添加条件':'No condition was added without your input',
  '开局草案':'Initial draft','协商草案':'Revised draft','人均预算待商量':'Budget per person to discuss','具体场所待定':'Venue to decide','· 具体场所待定':'· Venue TBD','公开报名':'Visible sign-up','区域：':'Area: ','公告':'Bulletin','第':'Version ','· 第':'· Version ','版':'','一起吃饭':'Meal together','玩第一场':'First activity','玩第二场':'Second activity','烤肉':'Barbecue','火锅':'Hot pot','桌游':'Board games','KTV':'Karaoke','爬山':'Hiking','徒步':'Hiking',
  '这是根据已表达的条件生成的讨论方案，仍需每人确认':'This discussion draft reflects expressed conditions and still needs everyone’s acceptance','预算为人均目标上限，实际商家价格待核实':'Budgets are per-person targets; actual venue prices still need checking',
  '第一场玩乐时间':'first activity time','第一场玩乐预算':'first activity budget','聚餐时间':'meal time','聚餐类别':'meal type','聚餐预算':'meal budget',
  '✳ 这是根据已表达的条件生成的讨论方案，仍需每人确认':'✳ This draft reflects expressed conditions and still needs each person’s acceptance','✳ 预算为人均目标上限，实际商家价格待核实':'✳ Budgets are per-person targets; actual venue prices need checking',
  '所有决策参与者都确认了同一版方案，这场聚会正式定案。':'All decision participants accepted the same plan version. The outing is finalized.','发起人发起了一轮匿名投票。':'The organizer started an anonymous poll.',
  '会来：':'Joining:','不来：':'Not joining:','待报名':'Awaiting sign-up','目前没有符合条件的讨论。':'No matching discussions yet.','我的活动':'My activities','参与的讨论':'Discussions joined','个人空间':'My space','我的熟人圈与意愿':'My circles and ideas',
  '查看公开想法和共同兴趣':'See public ideas and shared interests','活动记录':'Activity history','查看参与过的讨论与方案':'See past discussions and plans',
  '匿名投票进行中':'Anonymous poll in progress','投票':'Vote','提前结束投票':'Close poll early','只显示票数，不公布谁投了哪个选项。所有人投完会自动结束。':'Only vote counts are shown. The poll closes automatically when everyone votes.',
};

const weekdays:Record<string,string>={'星期日':'Sunday','星期一':'Monday','星期二':'Tuesday','星期三':'Wednesday','星期四':'Thursday','星期五':'Friday','星期六':'Saturday'};
function translate(raw:string):string{
  const leading=raw.match(/^\s*/)?.[0]??'', trailing=raw.match(/\s*$/)?.[0]??'';
  const key=raw.slice(leading.length,raw.length-trailing.length);
  if(!key)return raw;
  let translated=en[key];
  if(!translated){
    let m=key.match(/^(\d+) 位朋友$/);if(m)translated=`${m[1]} friends`;
    m=key.match(/^(\d+) 位朋友 ·$/);if(m)translated=`${m[1]} friends ·`;
    m=key.match(/^(\d+) 位参与者$/);if(m)translated=`${m[1]} participants`;
    m=key.match(/^第 (\d+) 版方案$/);if(m)translated=`Plan version ${m[1]}`;
    m=key.match(/^已报名 (\d+) 人$/);if(m)translated=`${m[1]} signed up`;
    m=key.match(/^(\d+) 票$/);if(m)translated=`${m[1]} votes`;
    m=key.match(/^公告 (\d+)$/);if(m)translated=`Bulletin ${m[1]}`;
    m=key.match(/^第 (\d+) 版$/);if(m)translated=`Version ${m[1]}`;
    m=key.match(/^(\d+) 人$/);if(m)translated=`${m[1]} people`;
    m=key.match(/^(\d+) 位成员$/);if(m)translated=`${m[1]} members`;
    m=key.match(/^人均预算目标 ≤ ¥(\d+) · 具体场所待定$/);if(m)translated=`Budget per person ≤ ¥${m[1]} · Venue TBD`;
    m=key.match(/^人均预算目标 ≤ ¥(\d+)$/);if(m)translated=`Budget per person ≤ ¥${m[1]}`;
    m=key.match(/^区域：(.*)$/);if(m)translated=`Area: ${m[1]}`;
    m=key.match(/^匿名投票结束：「(.+)」获得最多支持，主持人正在检查新安排。$/);if(m)translated=`Anonymous poll closed. “${en[m[1]]??m[1]}” received the most votes; the host is checking the plan.`;
    m=key.match(/^主持人更新了第 (\d+) 版讨论方案。本次变更：(.+)。请重新查看并确认。$/);if(m)translated=`The host updated plan version ${m[1]}. Changes: ${m[2].split('、').map(x=>en[x]??x).join(', ')}. Please review and accept again.`;
    m=key.match(/^(\d+)月(\d+)日(星期[日一二三四五六])?$/);if(m)translated=`${weekdays[m[3]]?weekdays[m[3]]+', ':''}${m[1]}/${m[2]}`;
    m=key.match(/^第 (\d+) 版 · 已有 (\d+)\/(\d+) 人确认。方案变动后重新确认。$/);if(m)translated=`Version ${m[1]} · ${m[2]}/${m[3]} accepted. Accept again if the plan changes.`;
    m=key.match(/^还需确定：(.*)。可以私聊或投票解决。$/);if(m)translated=`Still to decide: ${m[1]}. Discuss privately or vote.`;
    m=key.match(/^已报名 (.*)$/);if(m)translated=`Signed up: ${m[1]}`;
  }
  return translated===undefined?raw:leading+translated+trailing;
}

function updateNode(node:Text){
  const value=node.nodeValue??'';
  if(current==='zh'){
    const original=originals.get(node);
    if(original!==undefined&&value===translate(original)&&value!==original)node.nodeValue=original;
    else originals.set(node,value);
    return;
  }
  const original=originals.get(node);
  const base=original!==undefined&&translate(original)===value?original:value;
  originals.set(node,base);
  const next=translate(base);
  if(next!==value)node.nodeValue=next;
}
function updateAttributes(el:Element){
  for(const name of ['placeholder','title','aria-label']){
    const value=el.getAttribute(name);if(value===null)continue;
    let record=originalAttributes.get(el);if(!record){record=new Map();originalAttributes.set(el,record);}
    if(current==='zh'){
      const original=record.get(name);
      if(original!==undefined&&value===translate(original)&&value!==original)el.setAttribute(name,original);
      else record.set(name,value);
    }else{
      const original=record.get(name),base=original!==undefined&&translate(original)===value?original:value;
      record.set(name,base);const next=translate(base);if(next!==value)el.setAttribute(name,next);
    }
  }
}
function localize(root:Node){
  if(root.nodeType===Node.TEXT_NODE){updateNode(root as Text);return;}
  if(root.nodeType!==Node.ELEMENT_NODE)return;
  updateAttributes(root as Element);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  let node:Node|null;while((node=walker.nextNode())){
    if(node.nodeType===Node.TEXT_NODE)updateNode(node as Text);
    else updateAttributes(node as Element);
  }
}
let started=false;
export function startLocalization(){
  if(started)return;started=true;document.documentElement.lang=current==='en'?'en':'zh-CN';document.title=current==='en'?'Weekend Hub · Plan with friends':'周末局 · 聚会有商有量';
  localize(document.body);
  new MutationObserver(records=>{for(const record of records){
    if(record.type==='characterData')localize(record.target);
    else if(record.type==='attributes')updateAttributes(record.target as Element);
    else for(const node of record.addedNodes)localize(node);
  }}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
}
export function LanguageSwitch(){
  const [locale,setLocale]=useState(current);
  return <button type="button" className="language-switch" aria-label={locale==='zh'?'Switch to English':'切换到中文'} onClick={()=>{
    current=locale==='zh'?'en':'zh';localStorage.setItem(KEY,current);document.documentElement.lang=current==='en'?'en':'zh-CN';document.title=current==='en'?'Weekend Hub · Plan with friends':'周末局 · 聚会有商有量';setLocale(current);localize(document.body);
  }}>{locale==='zh'?'EN':'中文'}</button>;
}
