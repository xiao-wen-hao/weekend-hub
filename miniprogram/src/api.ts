import Taro from '@tarojs/taro'

export type User={id:string;username:string;name:string}
export type Summary={id:string;title:string;date:string;phase:string;memberCount:number;updatedAt:string}
export type Circle={id:string;name:string;joinCode:string;role:string}
export type Member={id:string;name:string;role:string}
export type Intent={id:string;rawText:string;category:string|null;windowId:string|null;status:string;matchAllowed:number|boolean;contactAllowed:number|boolean;parsedJson?:string;confirmedAt:string|null}
export type Preview={category:string|null;windowId:string|null;area?:string|null;budgetCap?:number|null;evidence:{category:string|null;time:string|null;area?:string|null;budget?:string|null};source:'model'|'fallback'}
export type Candidate={id:string;category:string;windowId:string;matchReasonJson?:string|null;status:string;response:string;memberCount:number;yesCount:number;roomId:string|null;expiresAt:string}
export type Notice={id:string;kind:string;status:string;createdAt?:string;payload:{circleId?:string;candidateId?:string;roomId?:string;category?:string;version?:number;changes?:string[];inviter?:string;roomTitle?:string}}
export type Segment={id:string;kind:string;category:string;start:number;end:number;budgetCap:number|null;label:string}
export type Poll={id:string;question:string;options:{id:string;label:string;votes:number}[];myVote:string|null}
export type Bulletin={id:string|null;version:number;content:{topic:string;consensus:string[];provisional:string[];disagreements:string[];pending:string[];recentChanges:string[];shared:{id:string;author:string;text:string}[]};sources:string[]}
export type Coordination={status:'idle'|'pending'|'running'|'ready'|'unavailable';source:'model'|null;question:{id:string;question:string;createdAt:string}|null;issues:{kind:string;label:string;severity:string;needsMyAnswer:boolean;publicEvidence:string[];ownContext:string|null}[];alternatives:{key:string;date:string|null;startHour:number|null;activity:string|null;area:string|null;unresolvedCount:number;canDraft:boolean;evidence:string[];explanation:string|null;source:'model'}[];answeredCount:number}
export type Room={joined:boolean;invite?:{status:string;inviter:string;circleName:string;createdAt:string};room:{id:string;title:string;date:string;mode?:'blank'|'template';phase:string;hostId:string;coordinationPending:boolean};bulletin?:Bulletin|null;coordination?:Coordination;members?:{id:string;name:string;hasAnswered:boolean;decisionStatus?:string}[];me?:{id:string;preference:Record<string,unknown>};messages?:{id:string;role:string;body:string}[];events?:{id:string;text:string;type:string}[];question?:{id:string;prompt:string;hint:string;options:{label:string;value:string}[]}|null;poll?:Poll|null;proposal?:{id:string;version:number;plan:{area:string;segments:Segment[];assumptions:string[]};confirmed:number;required?:number;confirmations:{userId:string;name:string;decision:string|null}[];myDecision:string|null;attendance:{segmentId:string;userId:string;name:string;decision:string}[];pendingFinal:string[]}|null;interpretation?:{source:string;applied:string[]}}

const storageBase='zhoumoju_api_base',storageToken='zhoumoju_token',storageTarget='zhoumoju_target'
export const getBase=()=>Taro.getStorageSync<string>(storageBase)||'http://127.0.0.1:3000'
export const setBase=(v:string)=>Taro.setStorageSync(storageBase,v.replace(/\/$/,''))
export const getToken=()=>Taro.getStorageSync<string>(storageToken)||''
export const setToken=(v:string)=>v?Taro.setStorageSync(storageToken,v):Taro.removeStorageSync(storageToken)
export const setLoginTarget=(url:string)=>Taro.setStorageSync(storageTarget,url)
export const consumeLoginTarget=()=>{const target=Taro.getStorageSync<string>(storageTarget)||'/pages/home/index';Taro.removeStorageSync(storageTarget);return target.startsWith('/pages/')?target:'/pages/home/index'}
export const requireLogin=(target:string)=>{if(getToken())return false;setLoginTarget(target);void Taro.redirectTo({url:'/pages/login/index'});return true}
export const backHome=()=>{if(Taro.getCurrentPages().length>1)void Taro.navigateBack();else void Taro.reLaunch({url:'/pages/home/index'})}
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
export const times:Record<string,string>={morning:'上午',noon:'中午',afternoon:'下午',evening:'晚上',unsure:'时间待商量'}
export const foods=['火锅','烤肉','川菜','湘菜','日料','粤菜','西餐','简餐']
export const plays=['桌游','KTV','电影','剧本杀','密室逃脱','保龄球','逛街','散步聊天','徒步','羽毛球']
