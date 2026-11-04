# SolidCraft Bug 报告（受限工具集）

只使用 MCP 工具与 `preview`；不要调用 shell、`solidcraft-cli` 子命令或 web 搜索。

## 最小信息

- 应用版本：Help → About；MCP 连接时记录 serverInfo 版本（若工具返回）。
- 平台：OS/显示环境；是否 headless。
- 设计：最小 `.sc` 路径、关键参数、复现步骤。
- 期望/实际：体积、bbox、拓扑或截图差异；附 `measure`/`body_topology` 输出。

## 复现

1. 在**独立临时会话**中重建，不碰用户设计：`new_design` 或打开副本。
2. 按最小步骤用 `batch` 执行；失败时记录 `failed.index` 与错误文本。
3. `crash_reports {}` 查崩溃记录；能导出就导出到 `repro/`。
4. 形状问题用 `screenshot` 保存 `renders/repro.png`；报告前自己先看。

## 提交

- 未经用户明确同意，不提交 issue，不上传设计/截图/路径。
- 把复现步骤、版本、期望/实际、证据文件路径给用户；由用户决定是否提交。
- 无法联网搜索已有 issue；不要声称“已查重”。
