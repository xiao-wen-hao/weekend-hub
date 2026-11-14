import type {Preference} from "../shared/domain";
import {formatTime} from "../shared/domain";
import "./private-conditions.css";

export type Analysis={source:"model"|"fallback";applied:string[];suggestions:string[]};
export default function PrivateConditions({preference,analysis}:{preference:Preference;analysis:Analysis|null}){
  const items:string[]=[];
  if(preference.from!==undefined)items.push(`${formatTime(preference.from)} 后有空`);
  if(preference.until!==undefined)items.push(`${formatTime(preference.until)} 前离开`);
  if(preference.food&&preference.food!=="any")items.push(`想吃 ${preference.food}`);
  if(preference.vetoFood)items.push(`不吃 ${preference.vetoFood}`);
  if(preference.play&&preference.play!=="any")items.push(`想玩 ${preference.play}`);
  if(preference.vetoPlay)items.push(`不玩 ${preference.vetoPlay}`);
  if(preference.order&&preference.order!=="either")items.push(preference.order==="eat"?"先吃再玩":"先玩再吃");
  if(preference.rounds)items.push(`玩 ${preference.rounds} 场`);
  if(preference.budgetMeal)items.push(`聚餐 ≤ ¥${preference.budgetMeal}`);
  if(preference.budgetPlay1)items.push(`第一场 ≤ ¥${preference.budgetPlay1}`);
  if(preference.budgetPlay2)items.push(`第二场 ≤ ¥${preference.budgetPlay2}`);
  if(preference.budgetAfter)items.push(`续摊 ≤ ¥${preference.budgetAfter}`);
  if(preference.after)items.push(preference.after==="yes"?"愿意续摊":preference.after==="no"?"不续摊":"续摊待定");
  if(preference.area)items.push(`区域：${preference.area}`);
  if(preference.attend&&preference.attend!=="all")items.push(preference.attend==="meal"?"只参加聚餐":"只参加玩乐");
  return <aside className="private-conditions"><div className="private-conditions-head"><strong>主持人记住的私人条件</strong><span>仅你可见</span></div>{items.length?<div className="private-chips">{items.map(x=><span key={x}>{x}</span>)}</div>:<p>还没有记录条件。说一句你的真实安排，主持人会从原话中提取。</p>}{analysis&&<p className="analysis-result">{analysis.source==="model"?"AI 语义理解":"基础识别（模型暂不可用）"} · {analysis.applied.length?`新记录 ${analysis.applied.length} 项条件`:"这轮没有擅自添加条件"}</p>}</aside>;
}
