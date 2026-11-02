# SolidCraft Bug 报告规范

只报告**观察到的现象**，不猜原因。一份能行动的报告 = 全新设计里最少步骤可复现 + 原文错误 + 手算与实测数字 + 最小脚本 + 截图。

## 1. 收集（只问找不到的信息）

- 版本与平台：`solidcraft-cli --version`、应用 Help → About、MCP `initialize` 的 `serverInfo.version`；注明是否自编译。
- 用户做了什么（按顺序）、期望什么、实际发生什么。
- 原文错误，不要转述：`batch` 的 `failed.error`、`inspect_design` 里特征的 `error`，或应用里的提示。
- 应用崩溃/卡死：先 `mcp__solidcraft__crash_reports {}`；用 `solidcraft-cli crashes replay <id>` 验证是否仍复现。

## 2. 在全新设计里复现

- headless（不碰用户的设计）：把步骤写成命令脚本 `repro/repro.json`，运行 `solidcraft-cli run repro/repro.json`；失败的特征会让 run 失败并指名。
- 走 MCP：`new_design {}` 后用一个 `batch {"commands":[...],"rollback":false}`，保留失败前的状态便于检查。桥接应用时若当前设计 dirty，先征求用户同意。
- 只在用户设计里出现：`solidcraft-cli script design.sc --out repro/repro.json` 导出历史；若重建后不复现，在报告中说明问题依赖历史之外的东西（导入、外部文件）。
- 只有交互能复现（对话框、拖拽、拾取、视图）：写成编号的应用操作步骤，脚本无法表达。
- 同一操作至少跑两次，确认可重复；偶发问题也值得报，注明频率。

## 3. 最小化

保持相同错误信息的前提下逐步缩小，每改一次重跑：

1. 先删末尾步骤，再删中间：其它 body、失败特征之后的特征、外观/命名/视图。
2. 草图能换成 `solid.box` / `solid.cylinder` 就换。
3. 尺寸取整（10、20、2.5），把参数表达式换成数字，除非表达式本身就是问题。
4. 删到再删就通过为止；记录边界（“半径 5 失败，4.9 成功”）。

卡死/慢命令：绝不无限等待。`timeout 120 solidcraft-cli run repro/repro.json --timings`；被 kill 的 run 不打印任何东西，就一次多跑一步来定位慢步骤。MCP 用 `batch` 的 `timings:true`（包含失败步骤）。

## 4. 核对结论

- 几何/数值：`measure {}` 与手算值对比，两个数字都写进报告。
- 选错边/面：`body_topology {"body":"Body1"}` 看当时有哪些可选。
- 看形状：`screenshot {"source":"model","view":"iso","path":"renders/repro.png"}`，或 `solidcraft-cli snapshot repro/repro.json --out renders/repro.png --view iso`。附图前自己先看一遍。
- 最终最小脚本从零再跑一次，输出原样放进报告。

## 5. 隐私

- 未经用户同意，绝不上传、引用或粘贴：用户设计、crash report 里的 `design.sc`、文件内容、日志。
- 默认附件是合成的最小脚本，不是用户设计。
- GitHub 不接受 `.sc` 附件；用户同意分享时把 `.sc` 复制/重命名为 `name.sc.zip`（`.sc` 本身就是 ZIP），或直接 zip。
- 去掉家目录、用户名、客户/项目名和路径（`/home/alice/clients/acme/bracket.sc` → `bracket.sc`）。
- 检查截图里的其它窗口、文件名和个人信息。

## 6. 先搜索，再写

1. 搜索已有 issue：`web_fetch "https://github.com/tangency-labs/solidcraft/issues?q=<两三个关键词>"`，或 `web_search`。命中就把最小脚本和版本作为评论补充，而不是新开。
2. 用 `references/report-template.md` 写报告；标题 `<区域>: <什么失败了>`，如 `Fillet: a radius above half the edge's face fails with "..."`。
3. 把填好的报告完整展示给用户。**只有用户明确同意后**才提交：本机没有 `gh` 时，让用户粘贴到应用的 **Report a bug**（会自动带截图），或由用户自己提交；不要替用户发帖。
4. 提交后把 issue 链接回报给用户。

## 陷阱

- **版本不对**：PATH 上的 CLI 可能比用户运行的应用新或旧；用用户版本复现，并在报告里写清用的哪个。
- **已经修了**：最新 release 或 `main` 不复现而用户版本复现，要写明，这本身就有价值。
- **边拾取**：会吸附到最近边且无距离限制，复现脚本可能选到另一条边；步骤后用面数或 `body_topology` 确认。
- **“成功”也可能是 bug**：没切到材料的 cut 仍报成功。以 `measure` 为准。
