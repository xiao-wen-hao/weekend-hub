import {useRef,useState} from 'react'
import Taro,{useDidShow,useRouter} from '@tarojs/taro'
import {Button,Input,Text,Textarea,View} from '@tarojs/components'
import {api,ApiError,backHome,circlePath,foods,plays,Preview,requireLogin,times,Intent} from '../../api'

export default function IntentPage(){
  const route=useRouter(),circleId=route.params.circleId||'',intentId=route.params.intentId||'',draft=route.params.draft||''
  const target=`/pages/intent/index?circleId=${encodeURIComponent(circleId)}${intentId?`&intentId=${encodeURIComponent(intentId)}`:''}${draft?`&draft=${encodeURIComponent(draft)}`:''}`
  const [text,setText]=useState(draft),[category,setCategory]=useState(''),[windowId,setWindowId]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[match,setMatch]=useState(false),[contact,setContact]=useState(false)
  const matchRef=useRef(false),contactRef=useRef(false)
  const [loading,setLoading]=useState(!!intentId),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useDidShow(()=>{if(requireLogin(target)||!intentId)return;void (async()=>{setLoading(true);try{const result=await api<{intents:Intent[]}>(`/circles/${circleId}/intents`);const i=result.intents.find(x=>x.id===intentId);if(!i)throw Error('意愿不存在');setText(i.rawText);setCategory(i.category||'');setWindowId(i.windowId||'');matchRef.current=!!i.matchAllowed;contactRef.current=!!i.contactAllowed;setMatch(matchRef.current);setContact(contactRef.current);setError('')}catch(e){if(e instanceof ApiError&&e.status===401){requireLogin(target);return}setError(e instanceof Error?e.message:'读取失败')}finally{setLoading(false)}})()})
  const toggleMatch=()=>{const next=!matchRef.current;matchRef.current=next;setMatch(next);if(!next){contactRef.current=false;setContact(false)}}
  const toggleContact=()=>{if(!matchRef.current)return;contactRef.current=!contactRef.current;setContact(contactRef.current)}
  const parse=async()=>{if(!text.trim())return;setBusy(true);try{const result=await api<Preview>('/intents/preview','POST',{text:text.trim()});setPreview(result);setCategory(result.category||'');setWindowId(result.windowId||'');setError('')}catch(e){setError(e instanceof Error?e.message:'解析失败')}finally{setBusy(false)}}
  const save=async(confirmed:boolean)=>{if(!text.trim())return;setBusy(true);try{const body={text:text.trim(),category:category||null,windowId:windowId||null,matchAllowed:matchRef.current,contactAllowed:contactRef.current,confirmed,...(intentId?{status:confirmed?'active':'paused'}:{})};if(intentId)await api(`/intents/${intentId}`,'PATCH',body);else await api(`/circles/${circleId}/intents`,'POST',body);Taro.showToast({title:confirmed?'意愿已确认':'草稿已保存',icon:'success'});Taro.redirectTo({url:circlePath(circleId)})}catch(e){setError(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}}
  return <View className='page'><View className='topline'><Text className='back' onClick={backHome}>‹ 返回圈子</Text><Text className='eyebrow'>SAY IT YOUR WAY</Text></View><Text className='page-title'>{intentId?'修改我的意愿':'你周末想做什么？'}</Text><Text className='muted'>先用自己的话说。AI 给出理解后，由你核对并决定是否投递。</Text>{error&&<View className='alert error'>{error}</View>}{loading?<View className='card empty'>正在读取意愿…</View>:<>
    <View className='card'><Text className='field-label'>原话</Text><Textarea className='intent-input' maxlength={500} value={text} onInput={e=>{setText(e.detail.value);setPreview(null)}} placeholder='比如：周六下午想玩桌游，预算 100 元以内，晚上要早点回家…'/><Button className='secondary' disabled={busy||!text.trim()} onClick={parse}>{busy?'正在理解…':'让 AI 理解这句话 →'}</Button></View>
    <View className='card'><View className='row'><Text className='card-title'>核对提取结果</Text><Text className='pill'>{preview?preview.source==='model'?'AI 理解':'基础识别':'等待解析'}</Text></View>{preview?<Text className='muted small'>原话依据：{[preview.evidence.category,preview.evidence.time,preview.evidence.area,preview.evidence.budget].filter(Boolean).join('、')||'没有识别到明确类别或时段，请手动选择'}</Text>:<Text className='muted small'>你也可以自己选择活动与时段。保存前必须亲自确认。</Text>}
      <Text className='field-label'>活动类别</Text><View className='choice-row'>{[...foods,...plays].map(x=><Text className={category===x?'choice selected':'choice'} key={x} onClick={()=>setCategory(x)}>{x}</Text>)}</View>
      <Text className='field-label'>大概时段</Text><View className='choice-row'>{Object.entries(times).map(([key,label])=><Text className={windowId===key?'choice selected':'choice'} key={key} onClick={()=>setWindowId(key)}>{label}</Text>)}</View>
      <Text className='muted small'>预算等细节保留在原话中；时间不确定也可以先投递。进入讨论间后可告诉 AI 主持人，由房间方案按分项协调预算。</Text>
    </View>
    <View className='card'><Text className='card-title'>由你决定分享范围</Text><View className='permission-row' onClick={toggleMatch}><Text>允许圈内匹配</Text><Text className={match?'toggle on':'toggle'}>{match?'已开启':'未开启'}</Text></View><Text className='muted small'>授权后，AI 会使用你的原话判断相近兴趣；匹配建议不会展示原话。</Text><View className='permission-row' onClick={toggleContact}><Text>允许私下联系试探</Text><Text className={contact?'toggle on':'toggle'}>{contact?'已开启':'未开启'}</Text></View><Text className='muted small'>两项都开启后才可能出现候选局。</Text></View>
    <Button className='primary' disabled={busy||!text.trim()||!category} onClick={()=>save(true)}>我已核对，确认投递</Button><Button className='link' disabled={busy||!text.trim()} onClick={()=>save(false)}>暂存，稍后再确认</Button>
  </>}</View>
}
