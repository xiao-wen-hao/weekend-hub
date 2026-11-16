# 参与开发

先阅读 [README](README.md)、[产品](docs/PRODUCT.md)、[架构](docs/ARCHITECTURE.md)和[开发指南](docs/DEVELOPMENT.md)。Fork 或克隆后用独立本地 `DATA_DIR` 开发。以 `feat/简短主题`、`fix/简短主题` 或 `docs/简短主题` 建分支；提交说明写清实际变化，例如 `fix: reject stale proposal confirmation`。

Pull Request 请说明问题、修改范围、复现步骤、相关测试的真实结果及剩余限制。后端业务变更需核对权限、隐私、事务和方案版本；界面变更需核对 Web/Android/小程序受影响路径。运行与改动相关的测试，不要以编译通过冒充完整业务验证。Bug 报告请提供可复现步骤、期望/实际结果、脱敏日志和运行环境；功能建议先描述真实使用场景。

**禁止提交** `.env`、模型 Key、邀请码、SQLite/WAL/SHM、真实对话、私人截图、个人设备配置或私人公网地址。发现泄露请按 [安全说明](SECURITY.md)处理，不要在公开 PR 或 Issue 中贴出凭据。项目采用 [MIT](LICENSE)，第三方依赖分别遵循自己的许可证。
