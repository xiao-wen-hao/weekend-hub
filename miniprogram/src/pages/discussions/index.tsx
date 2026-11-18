import {tr} from '../../i18n'
import {useState} from 'react'
import Taro,{useDidShow} from '@tarojs/taro'
import {Button,Text,View} from '@tarojs/components'
import {api,requireLogin,roomPath,Summary,Room} from '../../api'
export default function DiscussionsPage(){
 const [rooms,setRooms]=useState<Summary[]>([]),[needs,setNeeds]=useState<Record<string,string>>({}),[filter,setFilter]=useState<'all'|'active'|'mine'|'finished'>('all'),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const load=async()=>{if(requireLogin('/pages/discussions/index'))return;setLoading(true);try{const r=await api<{rooms:Summary[]}>('/rooms');setRooms(r.rooms);const results=await Promise.allSettled(r.rooms.filter(x=>x.phase!=='final').map(async x=>{const d=await api<Room>(`/rooms/${x.id}`);return [x.id,d.coordination?.question?'有问题待回应':d.proposal&&!d.proposal.myDecision?'方案待确认':''] as const}));setNeeds(Object.fromEntries(results.filter(x=>x.status==='fulfilled').map(x=>x.value)));setError('')}catch(e){setError(e instanceof Error?e.message:'讨论间加载失败')}finally{setLoading(false)}}
 useDidShow(()=>{void load()})
 const visible=rooms.filter(x=>filter==='all'||filter==='active'&&x.phase!=='final'||filter==='finished'&&x.phase==='final'||filter==='mine'&&!!needs[x.id])
 return <View className='page tab-page'><Text className='page-title'>{tr("讨论间")}</Text><Text className='muted'>{tr("你参与的讨论，都在这里。")}</Text><View className='filter-strip'>{([['all','全部'],['active','进行中'],['mine','待我回应'],['finished','已结束']] as const).map(([k,v])=><Text key={k} className={filter===k?'filter active':'filter'} onClick={()=>setFilter(k)}>{v}</Text>)}</View>{error&&<View className='alert error'>{error}<Button className='link' onClick={load}>{tr("重试")}</Button></View>}{loading?<View className='card empty'>{tr("正在加载讨论…")}</View>:visible.length?visible.map(x=><View className='card compact-card' key={x.id} onClick={()=>Taro.navigateTo({url:roomPath(x.id)})}><View className='row'><Text className='card-title'>{x.title}</Text><Text className='pill'>{x.phase==='final'?'已成行':needs[x.id]||'正在讨论'}</Text></View><Text className='muted small'>{x.memberCount} {tr("位朋友 · ")}{x.date}</Text></View>):<View className='card empty'>{tr("这里还没有符合条件的讨论。")}</View>}<Button className='primary sticky-action' onClick={()=>Taro.navigateTo({url:'/pages/create/index'})}>{tr("＋ 发起一场讨论")}</Button></View>
}
