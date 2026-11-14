import {useState} from 'react';
import './v2.css';

export type Bulletin={id:string|null;version:number;content:{topic:string;consensus:string[];provisional:string[];disagreements:string[];pending:string[];recentChanges:string[];shared:{id:string;author:string;text:string}[]};sources:string[]};

export function BulletinPanel({bulletin}:{bulletin:Bulletin|null|undefined}){
  const content=bulletin?.content;
  return <section className="v2-bulletin" aria-label="共享公告">
    <div className="v2-bulletin-head"><div><span className="v2-overline">大家共同看到</span><h2>这场局，聊到哪了</h2></div><span className="v2-version">公告 {bulletin?.version??0}</span></div>
    {!content?<p className="v2-muted">正在整理公开进展…</p>:<>
      {!!content.consensus.length&&<div className="v2-section"><h3>已经说定</h3>{content.consensus.map((line,i)=><p key={i}>{line}</p>)}</div>}
      <div className="v2-section"><h3>目前的想法</h3>{content.provisional.length?content.provisional.map((line,i)=><p key={i}>{line}</p>):<p className="v2-muted">还没有公开方案。先说说你想怎么过这个周末。</p>}</div>
      {!!content.shared.length&&<div className="v2-section"><h3>朋友主动分享</h3>{content.shared.map(x=><p key={x.id}><strong>{x.author}</strong>：{x.text}</p>)}</div>}
      {!!content.disagreements.length&&<div className="v2-section v2-divergence"><h3>还没达成一致</h3>{content.disagreements.map((x,i)=><p key={i}>{x}</p>)}</div>}
      {!!content.pending.length&&<div className="v2-section"><h3>下一步</h3>{content.pending.map((x,i)=><p key={i}>{x}</p>)}</div>}
      {!!content.recentChanges.length&&<details className="v2-history"><summary>最近进展</summary>{content.recentChanges.map((x,i)=><p key={i}>{x}</p>)}</details>}
    </>}
  </section>;
}

export function ShareDialog({messages,onClose,onShare,busy}:{messages:{id:string;role:string;body:string}[];onClose:()=>void;onShare:(sourceMessageId:string,publicText:string)=>Promise<void>;busy:boolean}){
  const own=messages.filter(m=>m.role==='user').reverse();
  const [source,setSource]=useState(''),[publicText,setPublicText]=useState(''),[approved,setApproved]=useState(false);
  return <div className="modal-backdrop" onClick={onClose}><div className="v2-share-dialog" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="公开分享想法">
    <button className="v2-dialog-close" onClick={onClose} aria-label="关闭">×</button>
    <span className="v2-overline">由你决定公开什么</span><h2>分享给这场局的朋友</h2>
    <p className="v2-muted">私聊默认只有你能看。选一条原话后，可以删去不想公开的细节；下方文字会原样出现在共享公告中。</p>
    {!!own.length&&<div className="v2-source-list">{own.slice(0,8).map(m=><button className={source===m.id?'selected':''} key={m.id} onClick={()=>{setSource(m.id);setPublicText(m.body.slice(0,300));setApproved(false)}}>{m.body}</button>)}</div>}
    <label>将公开的准确内容<textarea maxLength={300} value={publicText} onChange={e=>{setPublicText(e.target.value);setApproved(false)}} placeholder="例如：周六下午想一起爬山"/></label>
    <label className="v2-approve"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>我确认上面的文字会向本讨论间所有成员公开</label>
    <div className="v2-dialog-actions"><button className="button button-soft" onClick={onClose}>取消</button><button className="button button-dark" disabled={busy||!approved||!publicText.trim()} onClick={()=>void onShare(source,publicText.trim())}>确认公开分享</button></div>
  </div></div>;
}
