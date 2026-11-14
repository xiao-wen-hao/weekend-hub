import {useState} from 'react'
import Taro,{useDidShow} from '@tarojs/taro'
import {Button,Input,Text,View} from '@tarojs/components'
import {api,circlePath,requireLogin,Circle} from '../../api'

export default function CirclesPage(){
  const [circles,setCircles]=useState<Circle[]>([]),[name,setName]=useState(''),[code,setCode]=useState(''),[invite,setInvite]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const load=async()=>{if(requireLogin('/pages/circles/index'))return;setLoading(true);try{setCircles((await api<{circles:Circle[]}>('/circles')).circles);setError('')}catch(e){setError(e instanceof Error?e.message:'熟人圈加载失败')}finally{setLoading(false)}}
  useDidShow(()=>{void load()})
  const create=async()=>{setBusy(true);setError('');try{const x=await api<{id:string;joinCode:string}>('/circles','POST',{name:name.trim()});setName('');setInvite(x.joinCode);await load();await Taro.navigateTo({url:circlePath(x.id)})}catch(e){setError(e instanceof Error?e.message:'创建失败')}finally{setBusy(false)}}
  const join=async()=>{setBusy(true);setError('');try{const x=await api<{id:string}>('/circles/join','POST',{code:code.trim()});setCode('');await load();await Taro.navigateTo({url:circlePath(x.id)})}catch(e){setError(e instanceof Error?e.message:'加入失败')}finally{setBusy(false)}}
  return <View className='page'><View className='topline'><Text className='back' onClick={()=>Taro.navigateBack({delta:1})}>‹ 返回</Text><Text className='eyebrow'>YOUR CIRCLES</Text></View><Text className='page-title'>熟人圈</Text><Text className='muted'>先找到熟悉的人，再随口说说这个周末想做什么。</Text>
    {error&&<View className='alert error'>{error}<Button className='link' onClick={load}>重试</Button></View>}
    {loading?<View className='card empty'>正在加载…</View>:circles.length?<View className='circle-strip'>{circles.map(c=><View className='mini-card' key={c.id} onClick={()=>Taro.navigateTo({url:circlePath(c.id)})}><Text className='circle-icon'>{c.name.slice(0,1)}</Text><Text className='mini-title'>{c.name}</Text><Text className='muted small'>{c.role==='owner'?'我创建的圈子':'已加入'} · 查看详情 ›</Text></View>)}</View>:<View className='card empty'>还没有熟人圈。可以建一个，或用朋友的邀请码加入。</View>}
    <View className='section-title'><Text>创建或加入</Text></View><View className='card'><Text className='field-label'>给圈子起个名字</Text><View className='inline-form'><Input className='field' value={name} onInput={e=>setName(e.detail.value)} placeholder='例如 周末搭子'/><Button className='small-btn' disabled={busy||!name.trim()} onClick={create}>创建</Button></View><Text className='field-label'>朋友的邀请码</Text><View className='inline-form'><Input className='field' value={code} onInput={e=>setCode(e.detail.value)} placeholder='输入邀请码'/><Button className='small-btn' disabled={busy||!code.trim()} onClick={join}>加入</Button></View>{invite&&<View className='invite-box' onClick={()=>Taro.setClipboardData({data:invite})}>邀请码 {invite} · 点按复制</View>}</View>
  </View>
}
