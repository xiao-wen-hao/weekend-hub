import Taro from '@tarojs/taro'

export type User={id:string;username:string;name:string}
export type Summary={id:string;title:string;date:string;phase:string;memberCount:number;updatedAt:string}
export type Circle={id:string;name:string;joinCode:string;role:string}
export type Member={id:string;name:string;role:string}
export type Intent={id:string;rawText:string;category:string|null;windowId:string|null;status:string;matchAllowed:number|boolean;contactAllowed:number|boolean;parsedJson?:string;confirmedAt:string|null}
export type Preview={category:string|null;windowId:string|null;evidence:{category:string|null;time:string|null};source:'model'|'fallback'}
export type Candidate={id:string;category:string;windowId:string;status:string;response:string;memberCount:number;yesCount:number;roomId:string|null;expiresAt:string}
export type Notice={id:string;kind:string;status:string;payload:{circleId?:string;candidateId?:string;roomId?:string;category?:string;version?:number;changes?:string[]}}
export type Segment={id:string;kind:string;category:string;start:number;end:number;budgetCap:number|null;label:string}
export type Poll={id:string;question:string;options:{id:string;label:string;votes:number}[];myVote:string|null}
export type Room={joined:boolean;room:{id:string;title:string;date:string;phase:string;hostId:string;coordinationPending:boolean};members?:{id:string;name:string;hasAnswered:boolean}[];me?:{id:string;preference:Record<string,unknown>};messages?:{id:string;role:string;body:string}[];events?:{id:string;text:string;type:string}[];question?:{id:string;prompt:string;hint:string;options:{label:string;value:string}[]}|null;poll?:Poll|null;proposal?:{id:string;version:number;plan:{area:string;segments:Segment[];assumptions:string[]};confirmed:number;myDecision:string|null;attendance:{segmentId:string;userId:string;name:string;decision:string}[];pendingFinal:string[]}|null;interpretation?:{source:string;applied:string[]}}

const storageBase='zhoumoju_api_base',storageToken='zhoumoju_token',storageTarget='zhoumoju_target'
export const getBase=()=>Taro.getStorageSync<string>(storageBase)||'http://127.0.0.1:3000'
export const setBase=(v:string)=>Taro.setStorageSync(storageBase,v.replace(/\/$/,''))
export const getToken=()=>Taro.getStorageSync<string>(storageToken)||''
export const setToken=(v:string)=>v?Taro.setStorageSync(storageToken,v):Taro.removeStorageSync(storageToken)
export const setLoginTarget=(url:string)=>Taro.setStorageSync(storageTarget,url)
export const consumeLoginTarget=()=>{const target=Taro.getStorageSync<string>(storageTarget)||'/pages/home/index';Taro.removeStorageSync(storageTarget);return target.startsWith('/pages/')?target:'/pages/home/index'}
export const requireLogin=(target:string)=>{if(getToken())return false;setLoginTarget(target);void Taro.redirectTo({url:'/pages/login/index'});return true}
export class ApiError extends Error{constructor(message:string,public status:number){super(message)}}
export async function api<T>(path:string,method:'GET'|'POST'|'PATCH'='GET',data?:unknown):Promise<T>{
  let response:Taro.request.SuccessCallbackResult<T>
  try{response=await Taro.request<T>({url:`${getBase()}/api${path}`,method,data,timeout:15000,header:{'Content-Type':'application/json','X-Client-Platform':'wechat',...(getToken()?{Authorization:`Bearer ${getToken()}`}:{})}})}
  catch{throw new ApiError('连接不到服务器，请检查地址和网络',0)}
  if(response.statusCode<200||response.statusCode>=300){const body=response.data as {error?:string};if(response.statusCode===401&&path!=='/login'&&path!=='/register')setToken('');throw new ApiError(body?.error||`请求失败（${response.statusCode}）`,response.statusCode)}
  return response.data
}
export const roomPath=(id:string)=>`/pages/room/index?id=${encodeURIComponent(id)}`
export const circlePath=(id:string)=>`/pages/circle/index?id=${encodeURIComponent(id)}`
export const times:Record<string,string>={morning:'上午',noon:'中午',afternoon:'下午',evening:'晚上'}
export const foods=['火锅','烤肉','川菜','湘菜','日料','粤菜','西餐','简餐']
export const plays=['桌游','KTV','电影','剧本杀','密室逃脱','保龄球','逛街','散步聊天']
