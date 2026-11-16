import {useState} from 'react'
import {Button,Input,Text,View} from '@tarojs/components'
import type {Coordination} from './api'
import './v2-coordination.scss'

export function CoordinationView({state,busy,onAnswer}:{state:Coordination|undefined;busy:boolean;onAnswer:(id:string,text:string)=>Promise<boolean>}){
  const [answer,setAnswer]=useState('')
  if(!state||state.status==='idle')return null
  if(!state.question)return state.status==='pending'||state.status==='running'?<View className='coordination-card quiet'><Text>AI 正在整理新意见。你可以继续表达，稍后再看是否有需要你回应的问题。</Text></View>:state.status==='unavailable'?<View className='coordination-card quiet'><Text>AI 暂时无法分析这轮讨论。大家仍可继续交流，系统不会把分歧视为已解决。</Text></View>:state.status==='ready'&&state.answeredCount>0?<View className='coordination-card quiet'><Text>AI 已根据新回答重新检查。{state.issues.length?`目前还有 ${state.issues.length} 处分歧需要商量。`:'上一轮的分歧已不在当前判断中，接下来仍需逐人确认方案。'}</Text></View>:null
  const ownIssue=state.issues.find(issue=>issue.needsMyAnswer)
  return <View className='coordination-card'><Text className='eyebrow'>只问你一个问题</Text>{ownIssue&&<Text className='muted small'>目前的{ownIssue.label}安排还需要协调。{ownIssue.ownContext}，所以先来问问你。</Text>}<Text className='card-title'>{state.question.question}</Text><Text className='muted small'>你的回答仍留在私人会话中；暂不回答不会被视为同意。也可以说明哪些条件能调整。</Text><View className='action-row'><Input className='field coordination-input' value={answer} onInput={e=>setAnswer(e.detail.value)} placeholder='说说你的真实条件或调整余地…' confirmType='send'/><Button className='small-btn active-btn' disabled={busy||!answer.trim()} onClick={async()=>{const text=answer.trim();if(!text)return;if(await onAnswer(state.question!.id,text))setAnswer('')}}>回应</Button></View></View>
}

export function PlanIdeasView({state,isHost,busy,onChoose}:{state:Coordination|undefined;isHost:boolean;busy:boolean;onChoose:(key:string)=>Promise<boolean>}){
  if(!state||state.status!=='ready'||(!state.alternatives.length&&!state.issues.length))return null
  return <View className='coordination-card'><Text className='eyebrow'>{state.alternatives.length?'AI 提出的讨论方向':'AI 发现需要商量的地方'}</Text><Text className='muted small'>{state.alternatives.length?'根据当前表达整理，仍需大家核对和自行确认。':'只联系需要回应的人，私人条件不会在这里公开。'}</Text>{state.issues.map(issue=><View className='coordination-option' key={`${issue.kind}:${issue.label}`}><Text>正在商量{issue.label}{issue.severity==='hard'?' · 条件暂未兼顾':''}</Text>{issue.publicEvidence.map((line,i)=><Text className='muted small' key={i}>{line}</Text>)}</View>)}{state.alternatives.map(x=><View className='coordination-option' key={x.key}><Text>{[x.date||'日期待商量',x.startHour!==null?`${String(Math.floor(x.startHour)).padStart(2,'0')}:${x.startHour%1?'30':'00'}`:'时间待商量',x.activity,x.area].filter(Boolean).join(' · ')}</Text>{x.explanation&&<Text className='muted small'>{x.explanation}</Text>}{x.evidence.map((line,i)=><Text className='muted small' key={i}>{line}</Text>)}{x.unresolvedCount>0&&<Text className='muted small'>还有 {x.unresolvedCount} 位成员的条件待核对，草案不代表他们同意</Text>}{isHost&&<Button className='small-btn' disabled={busy||!x.canDraft} onClick={()=>void onChoose(x.key)}>生成待确认草案</Button>}</View>)}</View>
}
