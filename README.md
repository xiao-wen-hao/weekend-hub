# 周末局 V2

周末局是小型熟人圈的自然语言组局工具。成员先说出模糊的活动意愿；系统寻找潜在共同兴趣，**由人决定**是否发起讨论。讨论间的 AI 协助归纳共识、发现分歧和提出问题，最终方案仍须成员逐人确认。

## 从想法到成行

1. 加入熟人圈，自然语言表达意愿，核对 AI 理解后确认投递。
2. 授权匹配后查看候选局；成员自行决定是否讨论及接受邀请。
3. 在讨论间查看共享公告、私下表达限制，必要时参与投票。
4. 核对当前方案版本，逐人确认并对每项活动分别报名。

意愿不等于邀请，进入讨论间不等于报名，沉默也不等于同意。私人原话默认不公开。

手机 Web 可通过限时、限定房间的邀请链接让 Guest 输入昵称参与讨论；Guest 可在之后关联正式账号。Web 和 Android 界面支持中英文切换，用户自己写的内容保持原文。

## 代码和技术

| 位置 | 用途 |
| --- | --- |
| `server/server/` | Express + TypeScript API、权限、协调任务与 SQLite 迁移 |
| `server/src/` | React + Vite Web 界面 |
| `server/android/` | Capacitor Android Studio 工程，复用 Web 界面 |
| `miniprogram/` | Taro + React 微信小程序，调用同一后端 |
| `server/shared/` | 跨服务端和 Web 使用的类型与纯业务工具 |
| `server/tests/` | 单元与集成测试 |

业务状态、权限、投票、方案版本和报名以服务端数据库为准。详见[架构文档](docs/ARCHITECTURE.md)。

## 五分钟启动 Web

需要 Node.js **22+**。在仓库的 `server/` 目录执行：

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

打开 `http://localhost:3000`。首次启动会在 `server/data/` 自动建立空 SQLite 库并执行迁移；建议在 `.env` 中给自己的开发库设置独立 `DATA_DIR`。没有自己的模型 Key 时部分解析与匹配会降级，语义协商不可用。详细配置与三端命令见[开发指南](docs/DEVELOPMENT.md)。

## 文档

- [产品概念与流程](docs/PRODUCT.md)
- [系统架构与关键目录](docs/ARCHITECTURE.md)
- [数据库与 API](docs/DATABASE_AND_API.md)
- [LLM、降级和隐私](docs/LLM.md)
- [从零开发与测试](docs/DEVELOPMENT.md)
- [贡献指南](CONTRIBUTING.md) · [安全报告](SECURITY.md) · [变更记录](CHANGELOG.md)

项目采用 [MIT 许可证](LICENSE)。仓库不提供私人试用库、服务地址或模型凭据；开发者使用自己的本地数据和 Key。
