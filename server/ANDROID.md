# Android 本地示例版

Android Studio 打开 `server/android`。这是 Capacitor 封装的 React Web 客户端；仓库根目录旧 `app` 工程不是本产品版 Android 入口。

在 `server` 目录运行 `npm ci`、`npm run sync:android`，再在 `server/android` 运行 `gradlew.bat assembleDebug`。APK 位于 `server/android/app/build/outputs/apk/debug/app-debug.apk`。

调试包默认连接模拟器宿主机 `http://10.0.2.2:3000`。登录页可修改后端地址；真机或正式演示服务器应填写 HTTPS 地址。调试包仅对模拟器地址开放明文连接，正式包没有该例外。Web 和 Android 使用同一个 Express/SQLite 服务。

2026-11-14 已在 `Medium_Phone` 模拟器安装调试 APK，完成真实后端登录，并验证强制结束应用后登录态恢复。尚未进行真机安装与完整 Android 多人演示流程。
