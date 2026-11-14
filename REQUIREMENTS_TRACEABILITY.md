# 需求追踪矩阵

PASS 仅表示已实现且有测试证据；PARTIAL 为仅部分实现；FAIL 为未实现。当前没有任何项目级完成宣称。

| 编号 | 需求 | 模块与文件 | 当前状态 | 验收测试 |
|---|---|---|---|---|
| A01 | 注册登录与圈子 | `server/auth.ts`、`community.ts`、Android MainActivity | PARTIAL | 多账号注册、加入、权限与重启 |
| A02 | 意愿自然输入、确认、编辑、有效期、双授权 | `community.ts`、意愿 UI | PARTIAL | 模糊输入、修改、暂停、撤回、到期 |
| B01 | 同圈 3–5 人候选、硬约束、公平排序、去重限频 | `community.ts`、Matching 模块待建 | PARTIAL | 相容/冲突组合、重复请求 |
| B02 | 私下试探状态与正式开房 | `community.ts` | PARTIAL | 愿意/拒绝/稍后、低人数、撤权 |
| C01 | 直接发起与开局字段状态 | `server/index.ts`、`shared/planner.ts` | PARTIAL | 草案假设、未知字段不被确认 |
| D01 | 私聊抽取、证据、软硬约束与动态追问 | `language.ts`、`planner.ts` | PARTIAL | 字段 F1、误抽取、无解、降级 |
| E01 | 投票名单、修改、弃权、锁定、硬约束复核 | `coordinator.ts`、`index.ts` | PARTIAL | 重复票、弃权、过期票 |
| F01 | 不可变版本、同版接受、分项报名 | `db.ts`、`index.ts` | PARTIAL | 新旧版冲突、报名不等于接受 |
| G01 | 公告、通知、变更、历史 | `coordinator.ts`、通知模块待建 | FAIL | 变更影响、待办、重启送达 |
| P01 | 微信小程序移动端 | Taro 客户端待建 | FAIL | 开发工具导入与真机十场景 |
| Q01 | 十场景端到端、Docker 实测 | `tests/`、部署文档待补 | FAIL | 全场景执行并记录结果 |
