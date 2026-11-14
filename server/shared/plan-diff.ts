import type {Plan} from "./domain";

export function describePlanChanges(before:Plan,after:Plan):string[]{
  const changes:string[]=[];
  if(before.date!==after.date)changes.push("日期");
  if(before.area!==after.area)changes.push("区域");
  const old=new Map(before.segments.map(s=>[s.id,s]));
  const current=new Map(after.segments.map(s=>[s.id,s]));
  for(const id of new Set([...old.keys(),...current.keys()])){
    const a=old.get(id),b=current.get(id);
    const name=id==="meal"?"聚餐":id==="play1"?"第一场玩乐":id==="play2"?"第二场玩乐":"续摊";
    if(!a||!b){changes.push(`${name}安排`);continue;}
    if(a.start!==b.start||a.end!==b.end)changes.push(`${name}时间`);
    if(a.category!==b.category)changes.push(`${name}类别`);
    if(a.budgetCap!==b.budgetCap)changes.push(`${name}预算`);
  }
  return changes;
}
