import {useState} from 'react'
import {Button,Input,Text,View} from '@tarojs/components'
import type {Coordination} from './api'
import './v2-coordination.scss'

export function CoordinationView({state,busy,onAnswer}:{state:Coordination|undefined;busy:boolean;onAnswer:(id:string,text:string)=>Promise<boolean>}){
  const [answer,setAnswer]=useState('')
  if(!state||state.status==='idle')return null
  if(!state.question)return state.status==='pending'||state.status==='running'?<View className='coordination-card quiet'><Text>AI 正在整理新意见。你可以继续表达，稍后再看是否有需要你回应的问题。</Text></View>:state.status==='unavailable'?<View className='coordination-card quiet'><Text>AI 暂时无法分析这轮讨论。大家仍可继续交流，系统不会把分歧视为已解决。</Text></View>:null
  return <View className='coordination-card'><Text className='eyebrow'>只问你一个问题</Text><Text className='card-title'>{state.question.question}</Text><Text className='muted small'>你的回答仍留在私人会话中；暂不回答不会被视为同意。</Text><View className='action-row'><Input className='field coordination-input' value={answer} onInput={e=>setAnswer(e.detail.value)} placeholder='说说你的真实条件或调整余地…' confirmType='send'/><Button className='small-btn active-btn' disabled={busy||!answer.trim()} onClick={async()=>{const text=answer.trim();if(!text)return;if(await onAnswer(state.question!.id,text))setAnswer('')}}>回应</Button></View></View>
}

export function PlanIdeasView({state,isHost,busy,onChoose}:{state:Coordination|undefined;isHost:boolean;busy:boolean;onChoose:(key:string)=>Promise<boolean>}){
  if(!state?.alternatives?.length)return null
  return <View className='coordination-card'><Text className='eyebrow'>AI 提出的讨论方向</Text><Text className='muted small'>还需要大家核对和确认。私人理由不会展示给其他成员。</Text>{state.issues?.length>0&&<Text className='muted small'>目前还有 {state.issues.length} 处分歧待商量。</Text>}{state.alternatives.map(x=><View className='coordination-option' key={x.key}><Text>{[x.date||'日期待商量',x.startHour!==null?`${String(Math.floor(x.startHour)).padStart(2,'0')}:${x.startHour%1?'30':'00'}`:'时间待商量',x.activity,x.area].filter(Boolean).join(' · ')}</Text>{x.unresolvedCount>0&&<Text className='muted small'>还有 {x.unresolvedCount} 位成员的条件待核对，草案不代表他们同意</Text>}{isHost&&<Button className='small-btn' disabled={busy||!x.canDraft} onClick={()=>void onChoose(x.key)}>生成待确认草案</Button>}</View>)}</View>
}
