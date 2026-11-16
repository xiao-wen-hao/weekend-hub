# 模型、协调与隐私

模型密钥只由后端读取：`server/.env.example` 列出 `TOKENDANCE_API_KEY`、`TOKENDANCE_BASE_URL`、`TOKENDANCE_MODEL`。开发者把自己的值写入被 Git 忽略的 `server/.env`；前端代码和 APK 不需要 Key。

| 能力 | 代码入口 | 输出如何使用 |
| --- | --- | --- |
| 意愿解析 | `server/server/intent-parser.ts` | 提取类别、时间、预算/地点证据，用户核对后才正式投递 |
| 相近意愿 | `semantic-match.ts`, `community.ts` | 模型或规则产生候选建议，成员仍需选择是否讨论 |
| 私聊理解/公告 | `language.ts`, `public-summary.ts`, `public-guidance.ts` | 公共内容须授权；公告记录来源及版本 |
| 冲突与定向问题 | `semantic-coordination.ts` | 读取成员表达、公告、现有方案与前次判断；保存带来源 ID 的结构化分析，向相关成员提问 |
| 方案建议 | `semantic-coordination.ts`, `coordinator.ts` | 仅是可讨论方向；后端验证并生成新 proposal，不能替成员确认 |

`semantic-coordination.ts` 的上下文带房间、成员、公开/私人来源、公告、当前方案、已回答问题和输入签名。模型返回 finding、conflict、targetIds、alternatives 等 JSON；后端检查成员与来源 ID 是否真实、时间和类别是否合法，并在写入前重新核对签名。新回答会触发重新分析，旧任务不能覆盖新版本。给每位成员的响应经 `ownCoordination` 裁剪：只显示自己的私人依据与已授权的公共依据。

**职责边界：**模型做语义判断和建议；后端做身份、成员关系、隐私授权、事务、方案版本、投票、确认、报名。模型失败时意愿解析等部分功能有规则 `fallback`，但语义协调显示不可用；`source=fallback` 绝不能称为真实模型推理。定向分析仍可能遗漏或误解自然语言，不应把建议当成全员接受。测试入口见 `server/tests/semantic-coordination.integration.ts`（模拟模型）和 `semantic-quality-live.ts`（需要自己的真实 Key 与隔离库）。见 [产品概念](PRODUCT.md)和[架构](ARCHITECTURE.md)。
