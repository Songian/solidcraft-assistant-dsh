# Changelog

## 0.0.1 — Early Preview

- 预设内工具：`brief`（含 audit/verdict/audit.jsonl）、`calc`、`report_check`、`preview`。
- GB/ISO 知识子集与材料数据；全部 `unverified`，报告引用未核标准会被 `report_check` 拒绝。
- 安全：工具收窄到 `solidcraft` 预设；移除 bash/pwsh/jobs/web；MCP 使用 `--allow-path`；`SOLIDCRAFT_WORKSPACE` 未设置时 fail-closed。
- GUI 预览：`preview` 工具，同一模型更新原 tab，不重启实例，路径限制在项目根。
- 测试：17 个 `node:test` 用例（工具、知识、lock、路径/符号链接）。
- Tarball SHA-256: `9b1e757a0fc372b46cdcfba7ca03ec626b0b02e5272d93ba849b223f5419df27`；tarball `local-solidcraft-assistant-0.0.1.tgz`，20 files。
