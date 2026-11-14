import {useState} from 'react'
import {Button,Text,Textarea,View} from '@tarojs/components'
import type {Bulletin} from './api'

export function BulletinView({bulletin}:{bulletin:Bulletin|null|undefined}){
  const c=bulletin?.content
  return <View className='v2-bulletin'><View className='row'><Text className='card-title'>大家聊到哪了</Text><Text className='pill'>公告 {bulletin?.version||0}</Text></View>
    {!c?<Text className='muted small'>公开进展正在整理…</Text>:<>
      {!!c.consensus.length&&<View className='v2-bulletin-section'><Text className='field-label'>已经说定</Text>{c.consensus.map((x,i)=><Text className='v2-bulletin-line' key={i}>{x}</Text>)}</View>}
      <View className='v2-bulletin-section'><Text className='field-label'>目前的想法</Text>{c.provisional.length?c.provisional.map((x,i)=><Text className='v2-bulletin-line' key={i}>{x}</Text>):<Text className='muted small'>还没有公开方案。可以先向私人助手说说你的想法。</Text>}</View>
      {!!c.shared.length&&<View className='v2-bulletin-section'><Text className='field-label'>朋友主动分享</Text>{c.shared.map(x=><Text className='v2-bulletin-line' key={x.id}>{x.author}：{x.text}</Text>)}</View>}
      {!!c.disagreements.length&&<View className='v2-bulletin-section'><Text className='field-label'>还没达成一致</Text>{c.disagreements.map((x,i)=><Text className='v2-bulletin-line' key={i}>{x}</Text>)}</View>}
      {!!c.pending.length&&<View className='v2-bulletin-section'><Text className='field-label'>下一步</Text>{c.pending.map((x,i)=><Text className='v2-bulletin-line' key={i}>{x}</Text>)}</View>}
      {!!c.recentChanges.length&&<View className='v2-bulletin-section'><Text className='field-label'>最近进展</Text>{c.recentChanges.slice(0,2).map((x,i)=><Text className='v2-bulletin-line muted small' key={i}>{x}</Text>)}</View>}
    </>}
  </View>
}

export function ShareView({messages,busy,onCancel,onShare}:{messages:{id:string;role:string;body:string}[];busy:boolean;onCancel:()=>void;onShare:(id:string,text:string)=>Promise<void>}){
  const [source,setSource]=useState(''),[text,setText]=useState(''),[approved,setApproved]=useState(false)
  return <View className='card v2-share'><Text className='card-title'>你决定公开什么</Text><Text className='muted small'>私聊默认只对你可见。选择一条原话后，可以删去不想公开的细节。</Text>
    {messages.filter(x=>x.role==='user').slice(-6).reverse().map(m=><Text className={source===m.id?'v2-source selected':'v2-source'} key={m.id} onClick={()=>{setSource(m.id);setText(m.body.slice(0,300));setApproved(false)}}>{m.body}</Text>)}
    <Text className='field-label'>将向所有成员展示的准确内容</Text><Textarea className='v2-share-input' maxlength={300} value={text} onInput={e=>{setText(e.detail.value);setApproved(false)}} placeholder='例如：周六下午想一起爬山'/>
    <Text className={approved?'v2-consent selected':'v2-consent'} onClick={()=>setApproved(!approved)}>{approved?'✓ 已核对公开文字':'○ 我确认上述文字会向全员公开'}</Text>
    <View className='action-row'><Button className='small-btn' onClick={onCancel}>取消</Button><Button className='small-btn active-btn' disabled={busy||!approved||!text.trim()} onClick={()=>void onShare(source,text.trim())}>确认公开</Button></View>
  </View>
}
