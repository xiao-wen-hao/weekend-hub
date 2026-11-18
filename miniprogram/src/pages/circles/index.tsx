import {tr} from '../../i18n'
import {useState} from 'react'
import Taro,{useDidShow} from '@tarojs/taro'
import {Button,Picker,ScrollView,Text,Textarea,View} from '@tarojs/components'
import {api,circlePath,requireLogin,Circle,Member} from '../../api'
type PublicIntent={id:string;rawText:string;createdAt:string;authorName:string;circleName:string}

export default function CirclesPage(){
  const [circles,setCircles]=useState<Circle[]>([]),[counts,setCounts]=useState<Record<string,number>>({}),[selected,setSelected]=useState(''),[idea,setIdea]=useState('')
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[ideaOpen,setIdeaOpen]=useState(false),[publicAllowed,setPublicAllowed]=useState(false),[publicIntents,setPublicIntents]=useState<PublicIntent[]>([])
  const load=async()=>{
    if(requireLogin('/pages/circles/index'))return
    setLoading(true)
    try{
      const list=(await api<{circles:Circle[]}>('/circles')).circles
      setCircles(list)
      setSelected(current=>list.some(c=>c.id===current)?current:list[0]?.id||'')
      const results=await Promise.allSettled(list.map(c=>api<{members:Member[]}>(`/circles/${c.id}/members`)))
      setCounts(Object.fromEntries(results.flatMap((result,index)=>result.status==='fulfilled'?[[list[index].id,result.value.members.length]]:[])))
      const feeds=await Promise.allSettled(list.map(c=>api<{intents:Omit<PublicIntent,'circleName'>[]}>(`/circles/${c.id}/public-intents`)))
      setPublicIntents(feeds.flatMap((result,index)=>result.status==='fulfilled'?result.value.intents.map(intent=>({...intent,circleName:list[index].name})):[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)))
      setError('')
    }catch(e){setError(e instanceof Error?e.message:'熟人圈加载失败')}
    finally{setLoading(false)}
  }
  useDidShow(()=>{void load()})
  const manage=()=>Taro.navigateTo({url:'/pages/circle/index'})
  const publish=()=>{
    if(!selected||!idea.trim())return
    void Taro.navigateTo({url:`/pages/intent/index?circleId=${encodeURIComponent(selected)}&draft=${encodeURIComponent(idea.trim())}${publicAllowed?'&public=1':''}`})
  }
  const selectedIndex=Math.max(0,circles.findIndex(c=>c.id===selected))
  return <View className='page circle-home-page tab-page'>
    <View className='topline'><Text className='wordmark'>{tr("熟人圈")}</Text><Text className='eyebrow'>FRIENDS FIRST</Text></View>
    <Text className='page-title'>{tr("朋友最近想做什么？")}</Text><Text className='muted'>{tr("先看看熟人圈，有想法时再说一句。")}</Text>
    {error&&<View className='alert error'>{error}<Button className='link' onClick={load}>{tr("重试")}</Button></View>}
    <View className='circle-home-head'><Text>{tr("我的熟人圈")}</Text><Text className='circle-home-link' onClick={manage}>{tr("管理全部 ›")}</Text></View>
    {loading?<View className='card empty'>{tr("正在加载熟人圈…")}</View>:circles.length?<View className='circle-home-list'>{circles.map(c=><View className='circle-home-row' key={c.id} onClick={()=>Taro.navigateTo({url:circlePath(c.id)})}><Text className='circle-home-icon'>{c.name.slice(0,1)}</Text><View className='circle-home-row-body'><Text className='circle-home-name'>{c.name}</Text><Text className='muted small'>{tr(counts[c.id]===undefined?'成员人数暂不可用':`${counts[c.id]} 位成员`)}</Text></View><Text className='arrow'>›</Text></View>)}</View>:<View className='card empty'>{tr("还没有熟人圈。先创建一个，或用朋友的邀请码加入。")}</View>}
    <View className='circle-home-actions'><Button onClick={manage}>{tr("＋ 创建熟人圈")}</Button><Button onClick={manage}>{tr("加入熟人圈")}</Button></View>
    <View className='circle-home-head'><Text>{tr("朋友们公开的想法")}</Text></View>
    {publicIntents.length?publicIntents.map(intent=><View className='card circle-public-item' key={intent.id}><Text className='circle-home-name'>{intent.authorName} · {intent.circleName}</Text><Text className='circle-public-text'>{intent.rawText}</Text><Text className='muted small'>{new Date(intent.createdAt).toLocaleString('zh-CN')}</Text></View>):<View className='card empty'>{tr("圈内还没有成员选择公开想法。私人的意愿不会出现在这里。")}</View>}
    <Button className='primary sticky-action' onClick={()=>setIdeaOpen(true)}>{tr("＋ 发布一个想法")}</Button>
    {ideaOpen&&<View className='circle-idea-overlay' onClick={()=>setIdeaOpen(false)}><View className='circle-idea-sheet' onClick={e=>e.stopPropagation()}>
      <View className='circle-idea-sheet-head'><Text>{tr("发布一个想法")}</Text><Text onClick={()=>setIdeaOpen(false)}>{tr("关闭 ×")}</Text></View>
      <Text className='muted small'>{tr("先随口说说，AI 理解后由你确认投递。")}</Text>
      <ScrollView scrollY className='circle-idea-scroll'><View className='circle-idea-card'>
      <Textarea className='circle-idea-input' maxlength={500} value={idea} onInput={e=>setIdea(e.detail.value)} placeholder={tr("这周末想做什么？例如：想去海边走走，最好别太远……")}/>
      <Text className='field-label'>{tr("告诉哪个熟人圈")}</Text>
      <Picker mode='selector' range={circles.map(c=>c.name)} value={selectedIndex} disabled={!circles.length} onChange={e=>setSelected(circles[Number(e.detail.value)]?.id||'')}><View className='circle-idea-picker'>{circles.find(c=>c.id===selected)?.name||'请先加入熟人圈'} <Text>⌄</Text></View></Picker>
      <Text className='muted small circle-privacy-note'>{tr("意愿原话默认仅本人可见。授权匹配只用于发现共同兴趣，不会公开原话。")}</Text>
      <View className='circle-public-choice' onClick={()=>setPublicAllowed(!publicAllowed)}><Text>{publicAllowed?'✓':'○'} {tr("公开原话给所选熟人圈成员")}</Text><Text>{tr(publicAllowed?'已开启':'默认关闭')}</Text></View>
      <Button className='primary' disabled={!selected||!idea.trim()} onClick={publish}>{tr("让 AI 理解并确认投递 →")}</Button>
      </View></ScrollView>
    </View></View>}
  </View>
}
