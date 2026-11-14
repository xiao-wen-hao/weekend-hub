import type {CapacitorConfig} from "@capacitor/cli";

const config:CapacitorConfig={
  appId:"com.zhoumoju.weekendhub",
  appName:"周末局",
  webDir:"dist",
  android:{allowMixedContent:false},
  plugins:{CapacitorHttp:{enabled:true},StatusBar:{overlaysWebView:false,style:"LIGHT",backgroundColor:"#fffdf8"},Keyboard:{resize:"body"}},
};
export default config;
