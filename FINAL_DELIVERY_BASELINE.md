# V2 最终收敛基线（2026-11-16）

- Git：`main`，HEAD `295021f`；开始本轮时暂存区为空。
- 用户未提交文件：`miniprogram/project.config.json`、`miniprogram/project.private.config.json`、`FINAL_PROGRESS_AUDIT.md`、`UI_UX_CURRENT_STATE_AUDIT.md`。本轮不覆盖、不暂存这些文件。
- Web：`server/src/App.tsx`，Vite 产物由 `server/dist` 提供；Android 通过 `server/capacitor.config.ts` 和 `server/android` 封装同一 Web 客户端。
- 小程序：`miniprogram/src/app.config.ts` 与 `miniprogram/src/pages`，Taro 编译到 `miniprogram/dist`；本地开发者工具配置属于用户文件。
- 后端：`server/server/index.ts`，SQLite 数据目录由 `DATA_DIR` 指定，缺省为 `server/data`。真实模型使用 `TOKENDANCE_API_KEY`、`TOKENDANCE_BASE_URL`、`TOKENDANCE_MODEL`；密钥不写入仓库。
- 验收必须使用独立 `DATA_DIR`，不得运行会改写 `server/data` 的脚本。此前的真实模型协商和跨端定案分别通过，但尚未在同一个讨论间串联。
- 本轮优先问题：方案依据在模型结果中保存却未充分呈现；回答后的协商变化不够清楚；缺少同房间从意愿到报名的三端证据。Android 新协商界面尚未实际操作。
- 现有入口：`server/tests/semantic-live.integration.ts`、`server/tests/semantic-match-live.integration.ts`、`server/tests/semantic-finalization.integration.ts`、`server/tests/web-browser-smoke.mjs`、`miniprogram/tests/simulator-smoke.cjs`；单元测试、类型检查、Web/Taro 生产构建和 Android Gradle 构建均有既有命令。
