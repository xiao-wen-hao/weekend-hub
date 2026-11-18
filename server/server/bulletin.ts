import {db,getRoom,now,uid} from './db';
import {formatTime} from '../shared/domain';
import type {Plan} from '../shared/domain';

export type BulletinContent={topic:string;consensus:string[];provisional:string[];disagreements:string[];pending:string[];recentChanges:string[];shared:{id:string;author:string;text:string}[]};
type Share={id:string;public_text:string;name:string;kind:string|null;excerpt:string|null};

// Only public artifacts enter this projection. Never query messages or preferences here.
export function buildBulletin(roomId:string):{content:BulletinContent;sources:string[]}|null{
  const room=getRoom(roomId);if(!room)return null;
  const proposalRow=db.prepare('SELECT id,plan_json AS planJson FROM proposals WHERE id=?').get(room.current_proposal_id) as {id:string;planJson:string}|undefined;
  const proposal=proposalRow?{id:proposalRow.id,plan:JSON.parse(proposalRow.planJson) as Plan}:null;
  const confirmations=proposal?db.prepare("SELECT c.decision,COUNT(*) AS count FROM confirmations c JOIN members m ON m.room_id=? AND m.status='active' AND (m.user_id=c.user_id OR m.guest_id=c.guest_id) WHERE c.proposal_id=? GROUP BY c.decision").all(roomId,proposal.id) as {decision:string;count:number}[]:[];
  const accepted=confirmations.find(c=>c.decision==='accept')?.count??0,rejected=confirmations.find(c=>c.decision==='reject')?.count??0;
  const members=(db.prepare("SELECT COUNT(*) AS count FROM members WHERE room_id=? AND status='active'").get(roomId) as {count:number}).count;
  const poll=db.prepare("SELECT id,question FROM polls WHERE room_id=? AND status='open' ORDER BY created_at DESC LIMIT 1").get(roomId) as {id:string;question:string}|undefined;
  const shares=(db.prepare('SELECT s.id,s.public_text,COALESCE(u.display_name,g.display_name) AS name,a.kind,a.excerpt FROM room_public_shares s LEFT JOIN users u ON u.id=s.author_id LEFT JOIN guests g ON g.id=s.guest_id LEFT JOIN room_share_annotations a ON a.share_id=s.id WHERE s.room_id=? ORDER BY s.created_at DESC,s.id DESC LIMIT 50').all(roomId) as Share[]).reverse();
  const guidanceRow=db.prepare('SELECT source_ids_json AS sourceIds,content_json AS content FROM room_public_guidance WHERE room_id=?').get(roomId) as {sourceIds:string;content:string}|undefined;
  const guidance=guidanceRow&&JSON.stringify(shares.slice(-30).map(s=>s.id))===guidanceRow.sourceIds?JSON.parse(guidanceRow.content) as {consensusIds:string[];conflictIds:string[];nextFacet:string;source:string}:null;
  const pair=(ids:string[])=>ids.map(id=>shares.find(s=>s.id===id)?.public_text.slice(0,90)).filter(Boolean);
  const agreement=guidance?.consensusIds?.length===2?pair(guidance.consensusIds):[];
  const conflict=guidance?.conflictIds?.length===2?pair(guidance.conflictIds):[];
  const topicLabel:Record<string,string>={date:'日期',area:'地点或距离',budget:'预算',activity:'活动方向'};
  const samePair=guidance?.consensusIds?.length===2&&guidance.conflictIds?.length===2&&guidance.consensusIds.every(id=>guidance.conflictIds.includes(id));
  const events=db.prepare('SELECT id,public_text AS text FROM room_events WHERE room_id=? ORDER BY created_at DESC,id DESC LIMIT 4').all(roomId) as {id:string;text:string}[];
  const planLines=proposal?[`${proposal.plan.date} · ${proposal.plan.area||'区域待商量'}`,...proposal.plan.segments.map(s=>`${formatTime(s.start)} ${s.category} · ${s.budgetCap===null?'预算待商量':`人均不超过 ¥${s.budgetCap}`}`)]:[];
  const missing=proposal?[...(!proposal.plan.area?['大致区域']:[]),...proposal.plan.segments.filter(s=>s.budgetCap===null).map(s=>`${s.label}预算`)]:['活动、时间和安排'];
  const content:BulletinContent={topic:room.title,consensus:room.phase==='final'?planLines:[],provisional:room.phase==='final'?[]:[...planLines,...(agreement.length===2&&!samePair?[`AI 发现两条公开想法可能相近：「${agreement[0]}」「${agreement[1]}」`]:[]),...shares.filter(s=>s.kind==='provisional').map(s=>`${s.name}：${s.excerpt}`)],disagreements:[...(poll?[poll.question]:[]),...(room.phase==='blocked'?['现有条件尚无共同可行的安排']:[]),...(rejected?['有成员对当前方案提出异议，具体理由仍属私人信息']:[]),...(conflict.length===2?[`AI 发现${samePair?'活动方向相近，但'+(topicLabel[guidance!.nextFacet]??'具体条件')+'仍需商量':'两条公开想法可能有分歧'}：「${conflict[0]}」「${conflict[1]}」`]:[]),...shares.filter(s=>s.kind==='disagreement').map(s=>`${s.name}：${s.excerpt}`)],pending:room.phase==='final'?[]:[...missing,...(guidance&&topicLabel[guidance.nextFacet]?[`AI 建议先商量${topicLabel[guidance.nextFacet]}`]:[]),...(proposal&&!missing.length?[`等待 ${members-accepted} 位成员确认当前方案`]:[])],recentChanges:events.map(e=>e.text),shared:shares.map(s=>({id:s.id,author:s.name,text:s.public_text}))};
  return {content,sources:[...(proposal?[`proposal:${proposal.id}`,`accept:${accepted}`,`reject:${rejected}`]:[]),...(poll?[`poll:${poll.id}`]:[]),...shares.map(s=>`share:${s.id}${s.kind?`:annotation:${s.kind}`:''}`),...(guidance?[`guidance:${guidanceRow!.sourceIds}`]:[]),...events.map(e=>`event:${e.id}`),`phase:${room.phase}`]};
}

export function refreshBulletin(roomId:string){
  const next=buildBulletin(roomId);if(!next)return null;
  const json=JSON.stringify(next.content),sources=JSON.stringify(next.sources);
  const latest=db.prepare('SELECT id,version,content_json AS contentJson,source_json AS sourceJson FROM room_bulletins WHERE room_id=? ORDER BY version DESC LIMIT 1').get(roomId) as {id:string;version:number;contentJson:string;sourceJson:string}|undefined;
  if(latest?.contentJson===json&&latest.sourceJson===sources)return {id:latest.id,version:latest.version,content:next.content,sources:next.sources};
  const id=uid(),version=(latest?.version??0)+1;
  db.prepare('INSERT INTO room_bulletins(id,room_id,version,content_json,source_json,created_at) VALUES(?,?,?,?,?,?)').run(id,roomId,version,json,sources,now());
  return {id,version,content:next.content,sources:next.sources};
}

export function currentBulletin(roomId:string){
  const row=db.prepare('SELECT id,version,content_json AS contentJson,source_json AS sourceJson,created_at AS createdAt FROM room_bulletins WHERE room_id=? ORDER BY version DESC LIMIT 1').get(roomId) as {id:string;version:number;contentJson:string;sourceJson:string;createdAt:string}|undefined;
  return row?{id:row.id,version:row.version,content:JSON.parse(row.contentJson) as BulletinContent,sources:JSON.parse(row.sourceJson) as string[],createdAt:row.createdAt}:null;
}
