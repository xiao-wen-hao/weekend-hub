import {useState} from 'react';

export type CoordinationState={status:'idle'|'pending'|'running'|'ready'|'unavailable';source:'model'|null;question:{id:string;question:string;createdAt:string}|null;issues:{kind:string;severity:string;needsMyAnswer:boolean}[];alternatives:{key:string;date:string|null;startHour:number|null;activity:string|null;area:string|null;unresolvedCount:number;canDraft:boolean;source:'model'}[]};
const time=(hour:number)=>`${String(Math.floor(hour)).padStart(2,'0')}:${hour%1?'30':'00'}`;

export function CoordinationCard({state,busy,onAnswer}:{state:CoordinationState|undefined;busy:boolean;onAnswer:(id:string,text:string)=>Promise<void>}){
  const [answer,setAnswer]=useState('');
  if(!state||state.status==='idle')return null;
  if(!state.question)return state.status==='pending'||state.status==='running'?<div className="coordination-card quiet" role="status">AI 正在整理大家的新想法。你可以继续自由表达，稍后会看到需要你回应的问题。</div>:state.status==='unavailable'?<div className="coordination-card quiet" role="status">这轮 AI 分析暂时不可用。你仍可继续讨论或发起投票，系统不会将未分析的分歧视为已解决。</div>:null;
  return <div className="coordination-card" role="group" aria-label="需要你回应的协商问题"><span className="coordination-kicker">AI 想听听你的想法</span><p>{state.question.question}</p><form onSubmit={e=>{e.preventDefault();const text=answer.trim();if(!text)return;void onAnswer(state.question!.id,text).then(()=>setAnswer('')).catch(()=>{});}}><input value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={600} placeholder="可以直接说你的真实条件，也可以说明暂时不确定" aria-label="回答协商问题"/><button disabled={busy||!answer.trim()}>回应</button></form><small>只在你的私人会话里回答；不回答也不会被视为同意。</small></div>;
}

export function PlanIdeas({state,isHost,busy,onChoose}:{state:CoordinationState|undefined;isHost:boolean;busy:boolean;onChoose:(key:string)=>void}){
  if(!state?.alternatives?.length)return null;
  return <div className="coordination-plan-ideas"><strong>AI 提出的讨论方向</strong><p>根据目前的表达整理，仍需大家核对和逐人确认；这里不会展示任何人的私人理由。</p>{state.issues?.length>0&&<p>当前还有{state.issues.length}处需要商量的分歧。</p>}{state.alternatives.map(option=><div className="coordination-plan-option" key={option.key}><span>{[option.date||'日期待商量',option.startHour!==null?time(option.startHour):'时间待商量',option.activity,option.area].filter(Boolean).join(' · ')}{option.unresolvedCount>0&&<small>还有{option.unresolvedCount}位成员的条件待核对，草案不代表他们同意</small>}</span>{isHost&&<button disabled={busy||!option.canDraft} onClick={()=>onChoose(option.key)}>核对并生成草案</button>}</div>)}</div>;
}
