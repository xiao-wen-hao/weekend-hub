# 开发任务清单

每项对应需求、改动范围、测试与验收。完成前不得改成 PASS。

| 任务 | 需求 | 主要文件 | 实现与测试 | 状态 |
|---|---|---|---|---|
| T01 增量迁移 | A01/B01/G01 | `server/server/db.ts` | 新库和 v1 升级测试通过；后续补强现有表外键迁移 | PARTIAL |
| T02 身份与邀请 | A01 | auth/circle/API/UI | 昵称、成员查询、邀请轮换与有效期、退出已实现并联调；角色转交已联调；Web 熟人圈、成员转交与退出已接入；Android 待做 | PARTIAL |
| T03 意愿领域模型 | A02 | intent/LLM/UI | 证据校验、解析降级、确认门槛和撤回已实现并联调；软硬条件、日期范围和Web 编辑已接入；软硬条件和日期范围待做 | PARTIAL |
| T04 候选匹配 | B01 | matching/candidate | 约束过滤、公平排序、去重限频；组合单测和 API 测试 | 待做 |
| T05 邀约状态 | B02 | candidate/notification/UI | 私下回应、拒绝后人数不足自动关闭、成员资格复核和单次开房已实现；候选 48 小时过期、站内通知已联调；外部推送待做 | PARTIAL |
| T06 活动规划 | C01/D01 | planner/activity/LLM | 持久化待协调标记与 epoch、版本快照校验、重启恢复及竞态回归通过；复杂规划场景待测 | PARTIAL |
| T07 投票 | E01 | poll/API/UI | 改变方案的投票触发新版与通知；投票期阻止条件修改；冻结成员、弃权等待测 | PARTIAL |
| T08 版本与报名 | F01 | plan/RSVP/API/UI | 确认事务校验当前 proposal 与待协调状态；四人同版确认和 8 条报名延迟复查通过，其他状态边界待测 | PARTIAL |
| T09 公告与通知 | G01 | board/outbox/API/UI | 候选与开房事务通知、用户隔离的站内待办已实现；方案差异公告与成员待办已实现并联调；通知数据库重启测试通过 | PARTIAL |
| T10a Capacitor Android | P01 | `server/android/` | Studio 工程、APK 构建、模拟器登录与重启通过；真机和完整流程待测 | PARTIAL |
| T10 小程序 | P01 | `miniprogram/` | 独立 Taro 页面、真实 API 登录/房间/私聊/投票/确认/报名，编译和 Bearer 联通通过；开发工具与真机待验 | PARTIAL |
| T11 部署验收 | Q01 | Docker/docs/tests | 十场景、备份恢复、Docker 实测；测试报告 | 待做 |


