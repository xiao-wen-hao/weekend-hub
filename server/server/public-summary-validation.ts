export type Annotation={kind:'provisional'|'disagreement';excerpt:string;source:'model'|'fallback'};
export function validatePublicAnnotation(text:string,raw:unknown):Annotation|null{
  if(!raw||typeof raw!=='object')return null;
  const x=raw as Record<string,unknown>;
  if(x.kind!=='provisional'&&x.kind!=='disagreement')return null;
  if(typeof x.excerpt!=='string'||!x.excerpt.trim()||x.excerpt.length>120||!text.includes(x.excerpt))return null;
  return {kind:x.kind,excerpt:x.excerpt,source:'model'};
}
