import Taro from '@tarojs/taro'

export type User={id:string;username:string;name:string}
export type Summary={id:string;title:string;date:string;phase:string;memberCount:number}
export type Segment={id:string;kind:string;category:string;start:number;end:number;budgetCap:number|null;label:string}
export type Poll={id:string;question:string;options:{id:string;label:string;votes:number}[];myVote:string|null}
export type Room={joined:boolean;room:{id:string;title:string;date:string;phase:string;hostId:string};members?:{id:string;name:string;hasAnswered:boolean}[];me?:{id:string;preference:Record<string,unknown>};messages?:{id:string;role:string;body:string}[];events?:{id:string;text:string}[];question?:{id:string;prompt:string;hint:string;options:{label:string;value:string}[]}|null;poll?:Poll|null;proposal?:{id:string;version:number;plan:{area:string;segments:Segment[];assumptions:string[]};confirmed:number;myDecision:string|null;attendance:{segmentId:string;userId:string;name:string;decision:string}[];pendingFinal:string[]}|null;interpretation?:{source:string;applied:string[]}}
const storageBase='zhoumoju_api_base',storageToken='zhoumoju_token'
export const getBase=()=>Taro.getStorageSync<string>(storageBase)||'http://127.0.0.1:3000'
export const setBase=(v:string)=>Taro.setStorageSync(storageBase,v.replace(/\/$/,''))
export const getToken=()=>Taro.getStorageSync<string>(storageToken)||''
export const setToken=(v:string)=>v?Taro.setStorageSync(storageToken,v):Taro.removeStorageSync(storageToken)
export async function api<T>(path:string,method:'GET'|'POST'='GET',data?:unknown):Promise<T>{
  let response:Taro.request.SuccessCallbackResult<T>
  try{response=await Taro.request<T>({url:`${getBase()}/api${path}`,method,data,timeout:15000,header:{'Content-Type':'application/json','X-Client-Platform':'wechat',...(getToken()?{Authorization:`Bearer ${getToken()}`}:{})}})}
  catch{throw new Error('连接不到服务器，请检查地址和网络')}
  if(response.statusCode<200||response.statusCode>=300){const body=response.data as {error?:string};throw new Error(body?.error||`请求失败（${response.statusCode}）`)}
  return response.data
}
