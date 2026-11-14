# 测试报告

日期：2026-11-14。此文件记录实际运行结果，不代表项目最终验收。

| 检查 | 结果 | 范围 |
|---|---|---|
| `npm run typecheck` | PASS | 服务端 TypeScript 类型检查 |
| `npm test` | PASS 6/6 | 规划器 5 项与数据库迁移 1 项 |
| 空数据库初始化 | PASS | schema user_version=2，表可创建 |
| v1 升级到 v2 | PASS | 测试用户记录保留，通知待发箱表创建 |
| 上一轮 Android `assembleDebug` | PASS | 本轮没有改 Android 代码；不作为小程序验收 |
| 上一轮三账号候选局联调 | PASS | 只覆盖同类别同时段的简单路径 |

尚未执行十个端到端场景、小程序构建与真机、Docker 实际部署、并发和故障恢复测试。需求追踪矩阵中的相关项维持 PARTIAL 或 FAIL。

## 2026-11-14 圈子权限回归

- 服务端 typecheck PASS；6 项单元测试 PASS。
- 三账号候选开局集成脚本 PASS。
- 多账号管理脚本 PASS：普通成员不能轮换邀请码；旧码失效；新码可加入；退出后读取成员返回 403；昵称更新成功。
- 尚未做 Android/Taro 端到端与 Docker 验证。

