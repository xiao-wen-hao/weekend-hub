/** The next Saturday on the China calendar, excluding today when today is Saturday. */
export function nextSaturdayShanghai(at:Date=new Date()):string{
  const china=new Date(at.getTime()+8*3600000);
  const days=(6-china.getUTCDay()+7)%7||7;
  china.setUTCDate(china.getUTCDate()+days);
  return china.toISOString().slice(0,10);
}
