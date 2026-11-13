# 周末局 Android 项目原型

此项目按《周末局_需求分析与概要详细设计说明书》升级，沿用同目录 `ws` 项目的 Android Studio、Gradle Kotlin DSL、Java/XML 结构。`app/` 是 Android 客户端，`server/` 是可单机部署的 Express + SQLite 服务，含原有的 React 活动讨论间。服务端 API 可供之后的微信小程序复用。

## 当前可运行流程

1. 注册或登录，创建熟人圈，把邀请码发给朋友。
2. 在圈内用一句话投递意愿，并**分别明确勾选**允许圈内匹配、允许针对候选私下询问。默认两个授权都关闭。
3. 三位成员投递相同活动类别和时段后，系统产生圈内候选局。参与者逐人点击“愿意讨论”；三人愿意后可开活动讨论间。
4. 活动讨论间复用网页版的即时草案、私聊、投票、分项预算、报名和同版确认。Android 端目前覆盖意愿到开局的前半程，活动协商请在同一服务地址的网页端使用相同账号登录。

本阶段的意愿解析是保守的本地类别与时段识别；不确定项保持未知。候选发现只在一个熟人圈内、相同类别和时段、已明确授权的有效意愿之间进行。当前没有微信登录、订阅消息、真实场所价格、跨圈推荐或多实例部署。Android 客户端是该文档所建议的小程序之外的先行客户端，不应视作已经完成小程序适配。

## 运行

需要 Node.js 22+、Android Studio 和 Android SDK。Android 工程打开 `D:\AndroidStudioProjects\zhoumoju`，使用 `gradlew.bat :app:assembleDebug` 构建。调试 APK 位于 `app/build/outputs/apk/debug/`。

服务端在 `server/` 运行：

```powershell
npm ci
npm run build
npm start
```

网站默认地址是 `http://localhost:3000`。Android 模拟器访问电脑上的服务填 `http://10.0.2.2:3000`；真机需要填电脑在同一局域网中的地址，并允许相应防火墙端口。生产部署使用 HTTPS，把模型密钥放在服务器环境变量中；`server/.env` 已被 Git 忽略。网页自由输入在没有密钥时会退回本地解析。

## 验证

```powershell
cd server
npm run typecheck
npm test
npm run build
# 先 npm start，然后在另一个终端运行：
node --import tsx tests/community.integration.ts
cd ..
.\gradlew.bat :app:assembleDebug --no-configuration-cache
```

集成脚本会创建三个测试账号和测试房间。SQLite 数据保存在 `server/data/`，不进入 Git。当前为单实例原型，公开发布前仍需补充登录限频、邀请码失效与撤销、意愿去重、通知待发箱、删除策略和真机体验测试。
