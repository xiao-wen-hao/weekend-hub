import { FOODS, PLAYS, START_WINDOWS, formatTime, mainEnd, mealOf, playOf } from "./domain";
import type { Brief, MemberPreference, Plan, PlanLocks, Preference, Question, Segment } from "./domain";

const HALF_HOURS=Array.from({length:27},(_,i)=>9+i*.5);
const roundMoney=(...values:(number|null|undefined)[])=>{const v=values.filter((x):x is number=>typeof x==="number"&&x>0);return v.length?Math.min(...v):null;};
const reasonableMeal=(hour:number)=>hour>=10.5&&hour<=14.5||hour>=16.5&&hour<=21.5;

function buildPlan(brief:Brief,start:number,food:string,play:string,rounds:1|2,order:"eat"|"play",members:MemberPreference[]=[],after=false):Plan {
  const first:Segment={id:"play1",kind:"play",category:play,start:0,end:0,budgetCap:roundMoney(brief.budget.play1,...members.map(m=>m.preference.budgetPlay1)),label:"玩第一场"};
  const secondChoice=brief.secondPlay??members.find(m=>m.preference.secondPlay&&m.preference.secondPlay!=="any")?.preference.secondPlay??"玩法待商量";
  const second:Segment={id:"play2",kind:"play",category:secondChoice,start:0,end:0,budgetCap:roundMoney(brief.budget.play2,...members.map(m=>m.preference.budgetPlay2)),label:"玩第二场"};
  const meal:Segment={id:"meal",kind:"meal",category:food,start:0,end:0,budgetCap:roundMoney(brief.budget.meal,...members.map(m=>m.preference.budgetMeal)),label:"一起吃饭"};
  const segments:Segment[]=[];
  let cursor=start;
  const add=(s:Segment)=>{s.start=cursor;s.end=cursor+1.5;segments.push(s);cursor=s.end+.5;};
  if(order==="eat"){add(meal);add(first);if(rounds===2)add(second);}
  else{add(first);if(rounds===2)add(second);add(meal);}
  if(after){segments.push({id:"after",kind:"after",category:"续摊待定",start:cursor,end:cursor+1.5,budgetCap:roundMoney(brief.budget.after,...members.map(m=>m.preference.budgetAfter)),label:"自愿续摊"});}
  return {date:brief.date,area:brief.area,segments,assumptions:[],provisional:true};
}

export function initialPlan(brief:Brief):Plan {
  const window=START_WINDOWS.find(w=>w.id===brief.timeWindow)??START_WINDOWS[4];
  const order=brief.order==="either" ? (brief.timeWindow==="morning"||brief.timeWindow==="afternoon"?"play":"eat") : brief.order;
  let start:number=window.start;
  if(brief.timeWindow==="morning")start=10;
  if(brief.timeWindow==="afternoon"&&order==="eat")start=17;
  const plan=buildPlan(brief,start,brief.food,brief.play,brief.rounds,order,[],brief.after);
  plan.assumptions=[
    brief.timeWindow==="unsure"?"时间尚未确定，先用午间方案作为讨论起点":"时间只是发起人的初步想法",
    "吃饭和玩乐类别是讨论起点，可以随时提议更换",
    "餐厅与活动场所尚未选定，预算为每项活动的人均目标上限",
    "朋友们还没有逐人确认",
    ...(brief.note?[`发起人补充：${brief.note}`]:[]),
  ];
  return plan;
}

function fits(plan:Plan,p:Preference):boolean {
  const relevant=plan.segments.filter(s=>s.kind!=="after"&&(p.attend==="meal"?s.kind==="meal":p.attend==="play"?s.kind==="play":true));
  if(!relevant.length)return false;
  const from=Math.min(...relevant.map(s=>s.start)),end=Math.max(...relevant.map(s=>s.end));
  if(p.from!==undefined&&from<p.from)return false;
  if(p.until!==undefined&&end>p.until)return false;
  if(p.vetoFood&&mealOf(plan)?.category===p.vetoFood&&p.attend!=="play")return false;
  if(p.vetoPlay&&plan.segments.some(s=>s.kind==="play"&&s.category===p.vetoPlay)&&p.attend!=="meal")return false;
  return true;
}

function satisfaction(plan:Plan,p:Preference):number {
  let score=2;
  if(p.food&&p.food===mealOf(plan)?.category)score+=3;
  if(p.play&&p.play===playOf(plan)?.category)score+=3;
  if(p.order&&p.order!=="either")score+=(plan.segments[0].kind==="meal"?"eat":"play")===p.order?2:0;
  if(p.rounds)score+=plan.segments.filter(s=>s.kind==="play").length===p.rounds?1:0;
  if(p.desiredStart!==undefined)score+=Math.max(0,2-Math.abs(plan.segments[0].start-p.desiredStart));
  if(p.area&&plan.area&&p.area===plan.area)score+=1;
  return score;
}

export function negotiatePlan(brief:Brief,members:MemberPreference[],locks:PlanLocks={}):Plan|null {
  if(members.length===0)return initialPlan(brief);
  brief={...brief,date:locks.date??brief.date,area:locks.area||brief.area||members.find(m=>m.preference.area&&m.preference.area!=="any")?.preference.area||"",budget:{...brief.budget,meal:locks.budgetMeal??brief.budget.meal,play1:locks.budgetPlay1??brief.budget.play1,play2:locks.budgetPlay2??brief.budget.play2,after:locks.budgetAfter??brief.budget.after}};
  const foods=[...new Set([locks.food??brief.food,...members.map(m=>m.preference.food).filter((x):x is string=>!!x)])].filter(x=>x!=="any");
  const plays=[...new Set([locks.play??brief.play,...members.map(m=>m.preference.play).filter((x):x is string=>!!x)])].filter(x=>x!=="any");
  const foodOptions=locks.food?[locks.food]:foods.slice(0,4);
  const playOptions=locks.play?[locks.play]:plays.slice(0,4);
  let best:{plan:Plan;lowest:number;total:number;drift:number}|null=null;
  const afterYes=members.filter(m=>m.preference.after==="yes").length;
  for(const food of foodOptions)for(const play of playOptions)
    for(const order of (locks.order?[locks.order]:["eat","play"] as const))for(const rounds of (locks.rounds?[locks.rounds]:[1,2] as const))
      for(const start of (locks.start!==undefined?[locks.start]:HALF_HOURS)){
        const afterAnswered=members.filter(m=>m.preference.after!==undefined).length;
        const plan=buildPlan(brief,start,food,play,rounds,order,members,locks.after??(afterYes>=2||brief.after&&afterAnswered<2));
        const meal=mealOf(plan)!;
        if(!reasonableMeal(meal.start)||mainEnd(plan)>23.5)continue;
        if(members.some(m=>!fits(plan,m.preference)))continue;
        const scores=members.map(m=>satisfaction(plan,m.preference));
        const lowest=Math.min(...scores),total=scores.reduce((a,b)=>a+b,0);
        const original=START_WINDOWS.find(w=>w.id===brief.timeWindow)?.start??12;
        const drift=Math.abs(start-original)+(food===brief.food?0:1)+(play===brief.play?0:1)+(rounds===brief.rounds?0:1)+(order===brief.order?0:1);
        if(!best||lowest>best.lowest||lowest===best.lowest&&total>best.total||lowest===best.lowest&&total===best.total&&drift<best.drift)best={plan,lowest,total,drift};
      }
  if(!best)return null;
  best.plan.assumptions=["这是根据已表达的条件生成的讨论方案，仍需每人确认","预算为人均目标上限，实际商家价格待核实"];
  return best.plan;
}

export function nextQuestion(plan:Plan,p:Preference):Question|null {
  const start=plan.segments[0].start,end=mainEnd(plan),meal=mealOf(plan)!,play=playOf(plan)!;
  const q=(id:string,facet:string,prompt:string,options:Question["options"],hint="也可以直接说自己的具体情况"):Question=>({id,facet,prompt,options,hint});
  if(p.from===undefined)return q("time_start","time",`这版打算 ${formatTime(start)} 开始，你大概赶得上吗？`,[
    {label:"这个点我可以",value:"accept",effect:{from:start,desiredStart:start}},
    {label:"我想早点开始",value:"earlier",effect:{from:Math.max(9,start-2),desiredStart:Math.max(9,start-1)}},
    {label:"我得晚点到",value:"later",effect:{from:Math.min(22,start+1)}},
    {label:"我有具体时间",value:"custom"},
  ]);
  if(p.until===undefined)return q("time_end","time",`主活动预计 ${formatTime(end)} 结束，你能待到那时吗？`,[
    {label:"可以待到结束",value:"accept",effect:{until:end}},
    {label:"我要提前走",value:"early",effect:{until:Math.max(start+1,end-1)}},
    {label:"我只参加一段",value:"partial"},
    {label:"我来说明时间",value:"custom"},
  ]);
  if(p.food===undefined&&!p.vetoFood)return q("food","food",`吃饭先按「${meal.category}」想，你觉得怎么样？`,[
    {label:`${meal.category}可以`,value:"accept",effect:{food:meal.category}},
    {label:"想换个口味",value:"change"},
    {label:"吃什么都行",value:"any",effect:{food:"any"}},
    {label:"我有忌口",value:"veto"},
  ]);
  if(p.play===undefined&&!p.vetoPlay)return q("play","play",`玩乐先按「${play.category}」安排，你愿意玩吗？`,[
    {label:`${play.category}可以`,value:"accept",effect:{play:play.category}},
    {label:"想玩别的",value:"change"},
    {label:"玩什么都行",value:"any",effect:{play:"any"}},
    {label:"这个我不玩",value:"veto",effect:{vetoPlay:play.category}},
  ]);
  if(p.rounds===undefined)return q("rounds","rounds",`目前想玩 ${plan.segments.filter(s=>s.kind==="play").length} 场，你想怎么安排？`,[
    {label:"这样刚好",value:"accept",effect:{rounds:plan.segments.filter(s=>s.kind==="play").length as 1|2}},
    {label:"一场就够啦",value:"one",effect:{rounds:1}},
    {label:"想再玩一场",value:"two",effect:{rounds:2}},
  ]);
  if(plan.segments.some(s=>s.id==="play2")&&p.secondPlay===undefined)return q("play2","play",`如果再玩第二场，想继续「${play.category}」还是换个玩法？`,[
    {label:`继续玩${play.category}`,value:"same",effect:{secondPlay:play.category}},
    {label:"换个玩法更有趣",value:"change"},
    {label:"第二场我都行",value:"any",effect:{secondPlay:"any"}},
  ]);
  if(p.order===undefined)return q("order","order",`这版是「${plan.segments[0].kind==="meal"?"先吃再玩":"先玩再吃"}」，顺序合适吗？`,[
    {label:"顺序可以",value:"accept",effect:{order:plan.segments[0].kind==="meal"?"eat":"play"}},
    {label:"换个顺序",value:"flip",effect:{order:plan.segments[0].kind==="meal"?"play":"eat"}},
    {label:"我都可以",value:"either",effect:{order:"either"}},
  ]);
  if(p.budgetMeal===undefined)return q("budget_meal","budget",meal.budgetCap?`聚餐人均先按不超过 ¥${meal.budgetCap}，你舒服吗？`:"聚餐的人均预算大概定多少比较舒服？",[
    {label:"这个预算可以",value:"accept",effect:{budgetMeal:meal.budgetCap??150}},
    {label:"希望省一点",value:"less",effect:{budgetMeal:Math.max(30,(meal.budgetCap??150)-50)}},
    {label:"预算比较灵活",value:"flexible",effect:{budgetMeal:9999}},
    {label:"我想自己说金额",value:"custom"},
  ]);
  if(p.budgetPlay1===undefined)return q("budget_play1","budget",play.budgetCap?`第一场「${play.category}」人均先按不超过 ¥${play.budgetCap}，可以吗？`:`第一场「${play.category}」的人均预算你希望控制在多少？`,[
    {label:"这个预算可以",value:"accept",effect:{budgetPlay1:play.budgetCap??100}},
    {label:"想少花一点",value:"less",effect:{budgetPlay1:Math.max(20,(play.budgetCap??100)-50)}},
    {label:"预算比较灵活",value:"flexible",effect:{budgetPlay1:9999}},
    {label:"我说个具体金额",value:"custom"},
  ]);
  const second=plan.segments.find(s=>s.id==="play2");
  if(second&&p.budgetPlay2===undefined)return q("budget_play2","budget",second.budgetCap?`第二场「${second.category}」人均不超过 ¥${second.budgetCap}，你觉得呢？`:`第二场「${second.category}」的人均预算大概多少？`,[
    {label:"这个预算可以",value:"accept",effect:{budgetPlay2:second.budgetCap??100}},
    {label:"想少花一点",value:"less",effect:{budgetPlay2:Math.max(20,(second.budgetCap??100)-50)}},
    {label:"预算比较灵活",value:"flexible",effect:{budgetPlay2:9999}},
    {label:"我说个具体金额",value:"custom"},
  ]);
  if(plan.area&&p.area===undefined)return q("area","area",`大致在「${plan.area}」附近活动，你方便吗？`,[
    {label:"这片区域可以",value:"accept",effect:{area:plan.area}},
    {label:"换个区域更好",value:"change"},
    {label:"在哪儿都行",value:"any",effect:{area:"any"}},
  ]);
  if(p.after===undefined)return q("after","after",`主活动大约 ${formatTime(end)} 结束，如果还有续摊，你会来吗？`,[
    {label:"有空就继续",value:"yes",effect:{after:"yes"}},
    {label:"主活动后回家",value:"no",effect:{after:"no"}},
    {label:"到时候再看",value:"maybe",effect:{after:"maybe"}},
  ]);
  if(plan.segments.some(s=>s.kind==="after")&&p.after==="yes"&&p.budgetAfter===undefined)return q("budget_after","budget","如果续摊，人均再花多少你能接受？",[
    {label:"¥50 以内",value:"50",effect:{budgetAfter:50}},
    {label:"¥100 以内",value:"100",effect:{budgetAfter:100}},
    {label:"预算灵活",value:"flexible",effect:{budgetAfter:9999}},
    {label:"我说个金额",value:"custom"},
  ]);
  return null;
}

export function conflictQuestion(plan:Plan|null,members:MemberPreference[]):{userId:string;question:Question}|null {
  if(plan||members.length<2)return null;
  const tight=[...members].filter(m=>m.preference.from!==undefined&&m.preference.until!==undefined&&m.preference.attend===undefined)
    .sort((a,b)=>(a.preference.until!-a.preference.from!)-(b.preference.until!-b.preference.from!))[0];
  if(!tight)return null;
  return {userId:tight.userId,question:{id:"partial",facet:"attendance",prompt:"目前还没有大家都能完整参加的时间。如果聚餐和玩乐分开参加，你愿意来哪一段？",options:[
    {label:"我只来吃饭",value:"meal",effect:{attend:"meal"}},
    {label:"我只来玩乐",value:"play",effect:{attend:"play"}},
    {label:"我想全程参加",value:"all",effect:{attend:"all"}},
  ],hint:"你的具体时间仍只在私聊里"}};
}

export function validatePreferencePatch(raw:unknown):Partial<Preference> {
  if(!raw||typeof raw!=="object")return {};
  const x=raw as Record<string,unknown>,out:Record<string,string|number>={};
  for(const key of ["from","until","desiredStart"]){const v=x[key];if(typeof v==="number"&&v>=9&&v<=24&&v*2===Math.round(v*2))out[key]=v;}
  for(const key of ["budgetMeal","budgetPlay1","budgetPlay2","budgetAfter"]){const v=x[key];if(typeof v==="number"&&v>=20&&v<=9999)out[key]=Math.round(v);}
  for(const key of ["food","vetoFood"]){const v=x[key];if(typeof v==="string"&&(FOODS.includes(v as typeof FOODS[number])||key==="food"&&v==="any"))out[key]=v;}
  for(const key of ["play","vetoPlay"]){const v=x[key];if(typeof v==="string"&&(PLAYS.includes(v as typeof PLAYS[number])||key==="play"&&v==="any"))out[key]=v;}
  if(typeof x.secondPlay==="string"&&(PLAYS.includes(x.secondPlay as typeof PLAYS[number])||x.secondPlay==="any"))out.secondPlay=x.secondPlay;
  if([1,2].includes(Number(x.rounds)))out.rounds=Number(x.rounds);
  if(["eat","play","either"].includes(String(x.order)))out.order=String(x.order);
  if(["yes","no","maybe"].includes(String(x.after)))out.after=String(x.after);
  if(["all","meal","play"].includes(String(x.attend)))out.attend=String(x.attend);
  if(typeof x.area==="string"&&x.area.length<=50)out.area=x.area.trim();
  return out as Partial<Preference>;
}

export function finalizationMissing(plan:Plan):string[]{
  const missing:string[]=[];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(plan.date))missing.push('具体日期');
  if(!plan.area||plan.area==="区域待定")missing.push("大致区域");
  for(const segment of plan.segments){
    if(segment.budgetCap===null)missing.push(`${segment.label}预算`);
    if(segment.category.includes("待商量"))missing.push(`${segment.label}玩法`);
  }
  return missing;
}
