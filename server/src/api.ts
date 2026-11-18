import {CapacitorHttp} from "@capacitor/core";

type ApiResponse={error?:string;accessToken?:string};
const native=import.meta.env.VITE_CLIENT_PLATFORM==="android";
export const isNativeClient=native;
const tokenKey="zhoumoju_access_token";
export const apiBase=()=>String(localStorage.getItem("zhoumoju_api_base")||import.meta.env.VITE_API_BASE_URL||"").replace(/\/$/,"");
export const setApiBase=(value:string)=>localStorage.setItem("zhoumoju_api_base",value.replace(/\/$/,""));
export const getAccessToken=()=>native?localStorage.getItem(tokenKey):null;
export async function apiRequest<T>(path:string,method="GET",body?:unknown):Promise<T>{
  const base=apiBase();
  if(native&&!base)throw Error("请先配置后端地址");
  const token=getAccessToken();
  const url=`${base}/api${path}`;
  const headers={...(body===undefined?{}:{"Content-Type":"application/json"}),...(native?{"X-Client-Platform":"android"}:{}),...(base.includes(".ngrok-free.")?{"ngrok-skip-browser-warning":"true"}:{}),...(token?{Authorization:`Bearer ${token}`}:{})};
  let status:number;
  let rawData:unknown;
  try{
    if(native){const response=await CapacitorHttp.request({url,method,headers,data:body===undefined?undefined:JSON.stringify(body),responseType:"json"});status=response.status;rawData=response.data;}
    else{const response=await fetch(url,{method,credentials:"same-origin",cache:"no-store",headers,body:body===undefined?undefined:JSON.stringify(body)});status=response.status;rawData=await response.text();}
  }
  catch{throw Error("网络连接失败，请检查后端地址和网络状态");}
  let data:ApiResponse & T;
  try{data=(typeof rawData==="string"?JSON.parse(rawData):rawData) as ApiResponse & T;}catch{throw Error("服务暂时不可用，请稍后重试");}
  if(status<200||status>=300){if(native&&status===401)localStorage.removeItem(tokenKey);throw Error(data.error??`请求失败 (${status})`);}
  if(native&&data.accessToken)localStorage.setItem(tokenKey,data.accessToken);
  if(native&&path==="/logout")localStorage.removeItem(tokenKey);
  return data;
}
