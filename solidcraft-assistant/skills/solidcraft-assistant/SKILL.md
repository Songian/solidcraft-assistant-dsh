---
name: solidcraft-assistant
description: Use when the user asks to model, modify, measure, render or export a part in SolidCraft, or reports a SolidCraft bug or crash, through the solidcraft MCP tools (mcp__solidcraft__*). Covers the conversation workflow, parameterisation, verification and bug-report protocol.
---

# SolidCraft 参数化建模助手

## 0. 开场顺序（每次新任务）

1. 读当前版本的权威文档：
   - 新建零件：`mcp__solidcraft__skill_reference {"skill":"solidcraft-modeling"}`（默认 `reference.md`）。
   - 改现有设计：同一工具用 `{"skill":"solidcraft-editing"}`；装配/运动用 `solidcraft-mechanisms`。
   - 需要工作流本身时加 `"file":"SKILL.md"`。
   - 不要凭记忆写命令；不确定的命令用 `list_commands {"filter":"关键词"}` 或 `describe_command`。
2. `brief {"op":"init"}`（已有则 `brief {"op":"read"}`），把目标、标准、需求、参数、checkpoint、产物路径写入 brief；没有 brief 不进入第一次 `batch`。
   - 设计里已有内容：先说明现状，未经用户同意不要 `new_design` / `open`（都会丢弃未保存内容）。
3. 看工具结果末尾的 note 判断后端：
   - 已连接桌面应用：用户可以实时看到建模。
   - headless（“the SolidCraft app was not found”）：用户看不到过程。若用户想“看着我建模”，请他在**第一次建模调用之前**启动 Solidcraft 桌面应用；一旦本会话已经建过特征，它不会再桥接过去。
4. 用 3–6 行中文说明计划：参数表、坐标系与关键点、每阶段预期体积/包围盒、如何验证。信息够就直接做；只有用户自己的取舍（尺寸、用途、壁厚）才用 `ask_user_question` 问。

## 1. 设计原则

- **参数驱动**：先 `parameters.add` 建 L/W/T/wall/inset 等，所有尺寸和位置写表达式（`"L/2 - inset"`）。魔法数字只在内部计算里出现，且要能解释。
- **全约束草图**：`sketch.solve` 的 `dof` 必须为 0；欠约束的草图在改参数时会乱跑。
- **命名**：每个特征、草图都命名，名称在设计内唯一；之后 `timeline.edit`、pattern、mirror 都靠名字。
- **中心对称**：零件尽量以原点为中心，pattern/mirror 才能直接用力于原点平面。
- **顺序**：外轮廓 → 外圆角 → 抽壳 → 内部特征 → 孔/切口 → 图案/镜像；抽壳前先圆角（被抽掉的面的边、两个曲面之间的圆角除外，见参考文档）。
- **选择几何**：边/面用精确世界坐标；pick 超过体尺寸 5% 会被拒绝。面可优先用 `body_topology` 给出的名字。
- **批量写入**：`batch` + `"verbose": false`，每批一个阶段；有风险的操作单独一批，失败时只改 `failed.index` 那一步。
- **先加后切**：join/新体先确认体积增加，再切；切完体积没变就是没切到。

## 2. 验证（完成前必须做）

1. 每阶段 `measure {"summary":true}`，把结果传给 `brief {"op":"audit","measure":...}`；对比 brief checkpoint 的 `tol.abs`/`tol.rel`。**不得使用固定的 0.2%/0.05 mm**：容差由 checkpoint 或最小关键特征决定。
2. 位置无法由体积判断：孔/凸台用 `body_topology {"body":"Body1","faces":"cylinders"}` 看 `origin/axis/radius`，把 topology 传给 `brief audit`；对称件用 top 视图截图核对。
3. 参数是否真的驱动模型：`check_parameters {"set":{"L":"140 mm"}}`（会还原），看 `errors`、体积和圆柱轴变化。
4. `inspect_design {"measure":false,"sketches":false}` 确认时间线无 `error`。
5. `brief audit` 必须返回 `verdict: "verified"` 才算通过；`unverifiable` 要补 checkpoint/measure/路径，`failed` 要修模型。`ok:true` 不等于成功。
6. 报告中每个数值用 `calc` 复算（带单位），不要心算；交付前用 `report_check` 检查结构/单位/措辞/标准引用。

## 3. 展示与交付

- 先 `pwd` 取得当前工作目录的绝对路径。`designs/`、`renders/` 是工作目录下的子目录，必须位于 MCP 的 `--allow-path` 内。
- 截图：`screenshot {"source":"model","view":"iso","width":1200,"height":800,"path":"<工作目录>/renders/<name>_iso.png"}`；内部结构补 `"view":"top"` 或剖切。`source:"model"` 避免移动用户相机。
- 在回复中用 `![说明](绝对路径)` 嵌入截图，文件用 Markdown 链接。
- 设计保存到 `<工作目录>/designs/<name>.sc`；按需导出 `.step` / `.3mf` / `.stl`。保存/导出/截图都用绝对路径，不要依赖 MCP 服务器的相对路径。
- 中文回答：先给结论（外形尺寸、体积、关键参数），再给 3–6 步摘要。
- 计算用 `calc`（单位/量纲），交付前用 `report_check`；未 verified 的标准/材料知识不得写成“符合标准”。

## 4. 修改现有设计

- 先 `inspect_design`；用 `timeline.inspect {"feature":..}` 看特征定义，`timeline.edit {"feature":..,"set":..}` 改字段，`set_parameter` 改用户参数。
- 不要为了省事删除重画；除非用户明确要求重构。
- 改完必须重新 `measure`，报告体积/包围盒变化。

## 5. GUI 预览

读 `references/gui-preview.md`。铁律：已有窗口只更新原 tab，不 `pkill`/重启；同一模型不开新 tab；无显示环境用 `screenshot`。

## 6. Bug 与崩溃

按 `references/bug-report.md` 执行：确认版本 → 在全新设计里最小复现 → 缩小脚本 → 用 `measure` / 截图核对 → 搜索已有 issue → 把完整报告给用户看 → **用户明确同意后**才提交。未经同意绝不上传用户设计、截图、日志或文件内容。

## 7. 边界

- 不臆造命令、参数或字段名；不确定就查。
- 不覆盖未保存的设计，不删除用户文件；保存/导出/新建设计前先说明。
- 不把“命令发出去了”当成“结果对了”；不把 headless 会话说成用户能看到。
- 长调用超时（错误以 `still running:` 开头）不要重发：先 `mcp__solidcraft__pending` 或 `inspect_design` 确认状态。
