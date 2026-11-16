# 周末局 V2

自然语言驱动的熟人组局项目项目。Web、Capacitor Android 和 Taro 微信小程序共用 Express + SQLite 后端。

## 当前队友试用

- Web：<https://example.invalid/>
- Android APK：[下载试用版](https://example.invalid/downloads/zhoumoju-v0.1.0-android.apk)。下载后在 Android 手机上允许安装来自该来源的应用。
- 首次注册：向项目负责人领取内测邀请码，自行设置用户名和密码；之后直接登录。负责人可在本机 `server/data/team-trial/invite-code.txt` 查看邀请码并私下发送。APK 已预填当前 HTTPS 地址，也允许在登录页修改。ngrok 免费入口首次在浏览器打开时可能要求点一次“Visit Site”。
- 后端运行在项目负责人 Windows 电脑的 3160 端口，经 ngrok 账号的固定免费开发域名提供 HTTPS；电脑、后端和隧道必须保持运行。若以后更换域名，APK 登录页可改填新地址。
- 试用数据位于 `server/data/team-trial/`，与 `server/data/course-2026/` 的本地示例数据隔离。上述目录、邀请码和服务端模型密钥均不进入 Git。

负责人重启时，在 `server/` 的 PowerShell 终端设置 `PORT=3160`、`DATA_DIR` 为 `server/data/team-trial` 的绝对路径、`TRIAL_INVITE_CODE` 为该目录 `invite-code.txt` 的内容，然后运行 `npm start`；另一个终端运行 `ngrok http 3160`。服务端会从被忽略的 `server/.env` 读取模型密钥。不要把邀请码或密钥写进仓库或命令截图。

本次 APK 是**调试签名**的小范围试用包。微信小程序真机仍需正式 AppID 与合法域名配置；开发者工具可按 [小程序说明](miniprogram/README.md)运行。

## 本地开发

需要 Node.js 22+。在 `server/` 执行 `npm ci`，复制 `.env.example` 为 `.env`，给本机设置独立的 `DATA_DIR`，然后运行 `npm run dev`。没有 `TOKENDANCE_API_KEY` 时，AI 相关功能会明确降级。Web 默认访问 `http://localhost:3000`。

Android：在 `server/` 运行 `npm run sync:android`，用 Android Studio 打开 `server/android/`，构建 `assembleDebug`。小程序：在 `miniprogram/` 运行 `npm ci`、`npm run build:weapp`，用微信开发者工具导入。

## GitHub Release

在仓库的 **Actions → Publish Android trial release → Run workflow** 中填写版本标签（如 `v0.1.0`）和当时有效的 HTTPS 后端地址。工作流构建带有该默认地址的 APK，并创建含 APK、[版本说明](RELEASE_NOTES.md)和 GitHub 自动生成源码包的预发布版。工作流仅在推送到 GitHub 且仓库允许 Actions 写入 Release 后可用。

服务端环境变量见 [示例](server/.env.example)，本地示例步骤见 [DEMO](server/DEMO.md)。
