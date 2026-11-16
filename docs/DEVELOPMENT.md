# 从零开发

## 环境

服务端需要 Node.js 22+ 与 npm；Web 在桌面浏览器运行。Android 需要 Android Studio、Android SDK 和 Java 21（当前工程的构建环境）；微信小程序需微信开发者工具。Windows 为本项目已验证的主要开发环境，其他系统需自行核对 Android SDK 配置。

## 后端与 Web

```powershell
git clone <你的仓库地址>
cd zhoumoju/server
npm ci
Copy-Item .env.example .env
npm run dev
```

打开 `http://localhost:3000`。`server/server/db.ts` 会自动创建 `DATA_DIR/weekend.db` 并执行迁移；默认 `DATA_DIR=./data`，请从 `server/` 启动以保持路径明确。`.env` 可设置 `PORT`、`DATA_DIR` 和自己的 `TOKENDANCE_*` 配置；`TRIAL_INVITE_CODE` 仅用于受限试用，本地开发留空即可。不要使用项目负责人的试用库或凭据。生产模式先运行 `npm run build`，再运行 `npm start`。

## Android

在 `server/` 运行 `npm run sync:android`，在 Android Studio 打开 `server/android/`，运行 Gradle `assembleDebug`。APK 在 `server/android/app/build/outputs/apk/debug/`。模拟器访问本机服务可在登录页填写 `http://10.0.2.2:3000`；远端后端请用 HTTPS。Android 复用 Web UI，不维护另一份业务规则。更多见 [Android 说明](../server/ANDROID.md)。

## 微信小程序

```powershell
cd miniprogram
npm ci
npm run typecheck
npm run build:weapp
```

用微信开发者工具导入 `miniprogram/`；登录页填写开发者工具可访问的后端地址。当前使用开发阶段账号密码认证；正式 AppID、`wx.login` 绑定、订阅消息和真机合法域名尚未完成。见 [小程序说明](../miniprogram/README.md)。

## 测试与数据

`server/`：`npm run typecheck`、`npm test`、`npm run build`；`miniprogram/`：`npm run typecheck`、`npm test`、`npm run build:weapp`。集成脚本可能创建账号和房间，执行前阅读其 `DATA_DIR`/端口要求，绝不指向个人试用库。`server/scripts/seed-demo.ts` 通过真实 API 创建**虚构演示数据**，需先启动独立服务；操作见 [DEMO](../server/DEMO.md)。没有模型 Key 时仍可试用部分规则降级能力，真实语义协调需要自己的模型服务。

## 常见问题

- 连接失败：确认后端端口、`DATA_DIR` 与客户端填写的地址；Android 模拟器用 `10.0.2.2`，不是模拟器自己的 `localhost`。
- 小程序无法请求：开发者工具本地调试与真机域名要求不同；真机需正式平台配置。
- 模型显示不可用：核对自己的 Key、服务地址、模型名及后端日志；不要把 Key 发到 Issue。
- 方案确认被拒绝：刷新当前 proposal ID，检查待处理协调、投票或未定字段；旧版本确认不能复用。

继续阅读 [架构](ARCHITECTURE.md)、[数据库与 API](DATABASE_AND_API.md)、[LLM](LLM.md)。
