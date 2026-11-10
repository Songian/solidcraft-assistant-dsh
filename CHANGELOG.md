# Changelog

## 0.0.1 — Early Preview

- 预设内工具：`brief`（含 audit/verdict/audit.jsonl）、`calc`、`report_check`、`sketch`、`preview`。
- GB/ISO 知识子集与材料数据；全部 `unverified`，报告引用未核标准会被 `report_check` 拒绝。
- 安全：工具收窄到 `solidcraft` 预设；移除 bash/pwsh/jobs/web；MCP 使用 `--allow-path`；`SOLIDCRAFT_WORKSPACE` 未设置时 fail-closed。
- 会话锚点：`brief.focus` 记录目标/阶段/当前问题/决策/未决；每轮读回复述、结束写回，压缩恢复从 brief 重建。
- 草图输入协议：`feature-description`（多轮量化）与 `parametric`（直接给参数/图样/方法）两个子流程；参考面（含 offset）→ 起点（默认 0,0）→ 图样 → 绘制方法 → 开口图样闭合；`sketch` 工具校验后才执行 batch。
- 工作区：新建任务选择项目目录；session-aware MCP bridge 按会话目录启动 `solidcraft-cli mcp --allow-path`，不再需要 `SOLIDCRAFT_WORKSPACE`。
- GUI 预览：`preview` 工具，同一模型更新原 tab，不重启实例，路径限制在项目根。
- 测试：17 个 `node:test` 用例（工具、知识、lock、路径/符号链接）。
- Tarball SHA-256: `700b7850ff9a7892aada7c45bf9b77ca8f5abdf3f584e537c6b3987633747b0f`；tarball `local-solidcraft-assistant-0.0.1.tgz`，20 files。
