# 周末局微信小程序（产品版）

独立的 Taro + React 客户端。注册/登录、发起讨论间、私聊、快捷回答、投票、同版确认和分项报名均调用 `../server` 的真实 API；界面不使用 Web DOM 或假数据。

## 本地运行

1. 启动后端：`cd ../server && npm install && npm run dev`。
2. 安装依赖和编译：`npm install && npm run build:weapp`。
3. 用微信开发者工具导入此文件夹。`project.config.json` 指向 `dist/`，项目本地预览使用 `touristappid`；有自己的 AppID 时换成真实值。
4. 登录页填写能从开发者工具访问的后端地址，默认 `http://127.0.0.1:3000`。真机访问时需可访问的 HTTPS 域名和微信合法域名配置。

当前产品版使用现有账号体系与独立登录凭证。微信身份绑定、订阅消息和真机验收需要正式小程序 AppID 与配置，尚未完成。分享按钮会携带讨论间 ID，好友登录后可加入。
