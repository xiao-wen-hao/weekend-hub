import {useState} from 'react'
import Taro,{useDidShow} from '@tarojs/taro'
import {Button,Text,View} from '@tarojs/components'
import {api,getToken,setToken,Summary,User} from '../../api'

export default function Home(){
  const [user,setUser]=useState<User|null>(null),[rooms,setRooms]=useState<Summary[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const load=async()=>{if(!getToken()){Taro.redirectTo({url:'/pages/login/index'});return}setLoading(true);try{const me=await api<{user:User|null}>('/me');if(!me.user){setToken('');Taro.redirectTo({url:'/pages/login/index'});return}setUser(me.user);setRooms((await api<{rooms:Summary[]}>('/rooms')).rooms);setError('')}catch(e){setError(e instanceof Error?e.message:'加载失败')}finally{setLoading(false)}}
  useDidShow(()=>{void load()})
  return <View className='page'><View className='topline'><Text className='wordmark'>周末局<span className='accent'>.</span></Text><Text>{user?.name||'朋友'}，你好</Text></View><View className='hero'><Text className='eyebrow'>YOUR WEEKEND, SORTED</Text><Text className='hero-title'>把「改天约」\n变成「周末见」</Text><Text className='muted'>先有一版草案，再私下协调时间、玩法和每项预算。</Text><Button className='primary' onClick={()=>Taro.navigateTo({url:'/pages/create/index'})}>发起一个周末局 →</Button></View><View className='section-title'><Text>我的讨论间</Text><Text className='muted small'>{rooms.length} 个聚会</Text></View>{loading?<Text className='muted'>正在加载…</Text>:rooms.length?rooms.map(room=><View className='card room-card' key={room.id} onClick={()=>Taro.navigateTo({url:`/pages/room/index?id=${room.id}`})}><View className='row'><Text className='pill'>{room.phase==='final'?'已定案':'讨论中'}</Text><Text>→</Text></View><Text className='card-title'>{room.title}</Text><Text className='muted'>{room.date} · {room.memberCount} 位朋友</Text></View>):<View className='card empty'><Text>还没有聚会。先发起一场，把朋友约起来。</Text></View>}{error&&<View className='card error'>{error}<Button className='link' onClick={load}>重试</Button></View>}<Button className='link bottom-link' onClick={async()=>{await api('/logout','POST',{}).catch(()=>{});setToken('');Taro.redirectTo({url:'/pages/login/index'})}}>退出登录</Button></View>
}
