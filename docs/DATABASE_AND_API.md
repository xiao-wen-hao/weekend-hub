# 数据库与主要 API

`server/server/db.ts` 在启动时以 `DATA_DIR`（未设置时为从 `server/` 启动所用的 `./data`）打开 `weekend.db`，启用外键并按 `PRAGMA user_version` 逐步执行迁移。新开发者无需下载示例库：空目录会自动建库。数据库含私人表达，绝不提交到 Git。

## 主要实体和关系

| 实体 | 作用 |
| --- | --- |
| `users`, `sessions` | 密码哈希、账号和会话令牌哈希 |
| `circles`, `circle_members`, `intents` | 熟人圈成员及本人意愿；意愿有状态、匹配与联系授权 |
| `candidates`, `candidate_members` | 圈内匹配建议及各人回应 |
| `rooms`, `members`, `room_circle_invites` | 讨论间、决策参与状态及邀请 |
| `messages`, `preferences` | 按房间及本人隔离的对话和条件 |
| `room_public_shares`, `room_bulletins`, `room_events` | 明确授权的分享、版本化公告与公共事件 |
| `room_semantic_analysis`, `room_coordination_questions` | 带输入签名的语义分析和定向问题 |
| `proposals`, `confirmations`, `attendance` | 版本化方案、对特定 proposal 的确认及分项报名 |
| `polls`, `poll_votes`, `notification_outbox` | 投票和待发通知 |

意愿可从待确认变为有效或撤回；候选局需成员选择，讨论间可讨论、阻塞、最终定案；新 proposal 不继承旧确认或报名。最终状态与异步协调任务通过版本检查和事务保护。精确字段、检查约束和迁移版本以 `server/server/db.ts` 为准。

## API 速查

除 `/api/health`、`/api/register`、`/api/login` 外，以下接口要求有效会话。Web 使用 Cookie；Android/微信使用 `Authorization: Bearer <token>`。无身份通常返回 401，无成员权限返回 403，过期方案或非法阶段通常返回 409；响应错误主体含 `error`。

| 模块 | 主要接口 | 权限与用途 |
| --- | --- | --- |
| 账号 | `POST /api/register`, `/api/login`, `/api/logout`; `GET /api/me` | 注册/登录；试用模式注册额外传 `inviteCode` |
| 圈子 | `GET, POST /api/circles`; `POST /api/circles/join`; `GET /api/circles/:id/members` | 圈内成员可见；邀请码加入 |
| 意愿 | `POST /api/intents/preview`; `GET, POST /api/circles/:id/intents`; `PATCH /api/intents/:id`; `POST /api/intents/:id/withdraw` | 本人核对、授权及撤回 |
| 候选 | `GET /api/circles/:id/candidates`; `POST /api/candidates/:id/respond`, `/api/candidates/:id/open` | 候选成员回应；明确开房 |
| 房间 | `GET, POST /api/rooms`; `GET /api/rooms/:id`; `POST /api/rooms/:id/join`, `/message`, `/share` | 房间成员权限；分享需显式批准 |
| 协调 | `POST /api/rooms/:id/coordination/:questionId/answer`, `/coordination/plan` | 本人回答当前问题；发起人采用有效建议 |
| 定案 | `POST /api/rooms/:id/polls`, `/polls/:pollId/vote`, `/confirm`, `/attendance` | 当前方案 ID、投票和分项报名校验 |
| 通知 | `GET /api/notifications`; `POST /api/notifications/:id/read` | 本人通知 |

具体请求体、版本和返回字段请对照 `server/server/index.ts`、`community.ts`、`management.ts`、`notification.ts` 及 `miniprogram/src/api.ts`。不要从本表推断未列出的批量管理能力。

## 备份与恢复

先停止本地服务，再把自己的 `DATA_DIR` 整个目录（包括可能存在的 `weekend.db-wal`、`weekend.db-shm`）复制到安全位置；恢复时同样先停止服务，再恢复整个目录。避免在 SQLite 写入过程中仅复制主库文件。开发测试使用独立 `DATA_DIR`；`server/tests/` 与 `server/scripts/seed-demo.ts` 可生成**虚构**数据，演示脚本会写入指定库，切勿指向他人的数据目录。见 [开发指南](DEVELOPMENT.md)。
