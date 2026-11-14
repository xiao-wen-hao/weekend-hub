# 需求追踪矩阵

PASS 仅表示已实现且有测试证据；PARTIAL 为仅部分实现；FAIL 为未实现。当前没有任何项目级完成宣称。

| 编号 | 需求 | 模块与文件 | 当前状态 | 验收测试 |
|---|---|---|---|---|
| A01 | 注册登录与圈子 | `server/auth.ts`、`community.ts`、`src/CircleHub.tsx`、Android MainActivity | PARTIAL | 多账号注册、加入、转交和权限已通过；重启待测 |
| A02 | 意愿自然输入、确认、编辑、有效期、双授权 | `community.ts`、`intent-parser.ts`、`src/CircleHub.tsx` | PARTIAL | 证据校验与未确认不匹配已通过；修改及自动撤权已联调；前端编辑、到期待测 |
| B01 | 同圈 3–5 人候选、硬约束、公平排序、去重限频 | `community.ts`、Matching 模块待建 | PARTIAL | 相容/冲突组合、重复请求 |
| B02 | 私下试探状态与正式开房 | `community.ts` | PARTIAL | 三账号开房、失效授权、重复开房、48 小时过期已通过；通知待做 |
| C01 | 直接发起与开局字段状态 | `server/index.ts`、`shared/planner.ts` | PARTIAL | 草案假设、未知字段不被确认 |
| D01 | 私聊抽取、证据、软硬约束与动态追问 | `language.ts`、`planner.ts` | PARTIAL | 字段 F1、误抽取、无解、降级 |
| E01 | 投票名单、修改、弃权、锁定、硬约束复核 | `coordinator.ts`、`index.ts` | PARTIAL | 重复票、弃权、过期票 |
| F01 | 不可变版本、同版接受、分项报名 | `db.ts`、`index.ts` | PARTIAL | 新旧版冲突、报名不等于接受 |
| G01 | 公告、通知、变更、历史 | `coordinator.ts`、`notification.ts`、`src/CircleHub.tsx` | PARTIAL | 候选与开房待办、用户隔离已通过；通知重启通过；变更影响待做 |
| P01 | 微信小程序移动端 | Taro 客户端待建 | FAIL | 开发工具导入与真机十场景 |
| Q01 | 十场景端到端、Docker 实测 | `tests/`、部署文档待补 | FAIL | 全场景执行并记录结果 |
