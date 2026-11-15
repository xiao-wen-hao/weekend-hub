export const FOODS = ["火锅","烤肉","川菜","湘菜","日料","粤菜","西餐","简餐"] as const;
export const PLAYS = ["桌游","KTV","剧本杀","密室逃脱","电影","保龄球","逛街","散步聊天","徒步","羽毛球"] as const;
export const START_WINDOWS = [
  {id:"morning",label:"上午见",start:10},
  {id:"noon",label:"中午见",start:12},
  {id:"afternoon",label:"下午见",start:15},
  {id:"evening",label:"晚上见",start:18},
  {id:"unsure",label:"时间待商量",start:12},
] as const;

export type Brief = {
  title:string; date:string; timeWindow:typeof START_WINDOWS[number]["id"];
  area:string; food:string; play:string; secondPlay:string|null;
  rounds:1|2; order:"eat"|"play"|"either";
  after:boolean; budget:{meal:number|null;play1:number|null;play2:number|null;after:number|null};
  note:string;
};

export type Preference = {
  from?:number; until?:number; desiredStart?:number; food?:string; play?:string; secondPlay?:string;
  vetoFood?:string; vetoPlay?:string;
  order?:"eat"|"play"|"either"; rounds?:1|2;
  budgetMeal?:number; budgetPlay1?:number; budgetPlay2?:number; budgetAfter?:number;
  after?:"yes"|"no"|"maybe";
  attend?:"all"|"meal"|"play";
  area?:string;
};

export type Segment = {
  id:string; kind:"meal"|"play"|"after";
  category:string; start:number; end:number; budgetCap:number|null;
  label:string;
};
export type Plan = {
  date:string; area:string; segments:Segment[];
  assumptions:string[]; provisional:boolean;
};
export type MemberPreference = {userId:string;name:string;preference:Preference};
export type QuickOption = {label:string;value:string;effect?:Partial<Preference>};
export type Question = {id:string;facet:string;prompt:string;options:QuickOption[];hint:string};
export type PlanLocks = {date?:string;food?:string;play?:string;start?:number;order?:"eat"|"play";rounds?:1|2;area?:string;budgetMeal?:number;budgetPlay1?:number;budgetPlay2?:number;budgetAfter?:number;after?:boolean};

export const formatTime=(hour:number)=>`${String(Math.floor(hour)).padStart(2,"0")}:${hour%1?"30":"00"}`;
export const mealOf=(plan:Plan)=>plan.segments.find(s=>s.kind==="meal");
export const playOf=(plan:Plan)=>plan.segments.find(s=>s.kind==="play");
export const mainEnd=(plan:Plan)=>Math.max(...plan.segments.filter(s=>s.kind!=="after").map(s=>s.end));
