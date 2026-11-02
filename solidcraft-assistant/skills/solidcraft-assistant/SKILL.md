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
2. `inspect_design {"measure":false,"sketches":false}`，即使以为会话是空的。
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

1. 每阶段 `measure {"summary":true}`，与手算体积、包围盒对比（体积容差约 0.2%，包围盒每轴 0.05 mm）。
2. 位置无法由体积判断：孔/凸台用 `body_topology {"body":"Body1","faces":"cylinders"}` 看 `origin/axis/radius`；对称件用 top 视图截图核对。
3. 参数是否真的驱动模型：`check_parameters {"set":{"L":"140 mm"}}`（会还原），看 `errors`、体积和圆柱轴变化。
4. `inspect_design {"measure":false,"sketches":false}` 确认时间线无 `error`。
5. 只有数字对得上才可宣布完成；`ok:true` 不等于成功。

## 3. 展示与交付

- 先 `pwd` 取得当前工作目录的绝对路径。`designs/`、`renders/` 是工作目录下的子目录，必须位于 MCP 的 `--allow-path` 内。
- 截图：`screenshot {"source":"model","view":"iso","width":1200,"height":800,"path":"<工作目录>/renders/<name>_iso.png"}`；内部结构补 `"view":"top"` 或剖切。`source:"model"` 避免移动用户相机。
- 在回复中用 `![说明](绝对路径)` 嵌入截图，文件用 Markdown 链接。
- 设计保存到 `<工作目录>/designs/<name>.sc`；按需导出 `.step` / `.3mf` / `.stl`。保存/导出/截图都用绝对路径，不要依赖 MCP 服务器的相对路径。
- 中文回答：先给结论（外形尺寸、体积、关键参数），再给 3–6 步摘要；不要粘贴大段 JSON 或工具原始输出。

## 4. 修改现有设计

- 先 `inspect_design`；用 `timeline.inspect {"feature":..}` 看特征定义，`timeline.edit {"feature":..,"set":..}` 改字段，`set_parameter` 改用户参数。
- 不要为了省事删除重画；除非用户明确要求重构。
- 改完必须重新 `measure`，报告体积/包围盒变化。

## 5. 打开 GUI 预览

**铁律：已有的 SolidCraft 窗口只更新，不重启**。绝不 `pkill`、`job_kill`、重新 launch 或用 bash 直接跑 `solidcraft`；也不要为了刷新而关闭整个应用。刷新预览只操作当前设计的 tab：把模型 `save` 到磁盘，再 `push` 让它更新。

1. `python3 scripts/solidcraft_gui.py status`。它报告 `running`（控制通道可达）、`process`（窗口进程）、`unit`（脚本启动的常驻单元）和标签页数。
2. **已在运行（`running: true`）**：
   - `save designs/<name>.sc`，把助手当前 headless 设计落盘。
   - `python3 scripts/solidcraft_gui.py push designs/<name>.sc`：
     - 同一模型已打开 → 关闭它的旧 tab 并立即重新打开更新后的文件，**标签页数量不变**，模型就地更新（`updated: true`、`new_tab: false`）；
     - 新模型还没打开 → 只开一个 tab（`new_tab: true`）；
     - 如果那个 tab 有未保存修改（`dirty`），`push` 会拒绝，先请用户保存或关闭它，绝不丢用户改动。
   - 只有用户明确说“只调整视角”时才用 `--reframe`（不更新模型，不开/关 tab）。
3. **没有运行，但 `process: true`**：窗口在跑但控制通道关着。**绝不启动第二个实例**；请用户打开 Preferences → Assistant → “Let AI agents connect”，或在窗口里手动打开文件，然后重新 `status`。
4. **没有运行且 `process: false`**：
   - 运行 `python3 scripts/solidcraft_gui.py open [designs/xxx.sc]`。它通过 transient systemd user unit（`solidcraft-preview`）启动，`mode: "systemd"`，跨多次工具调用常驻。
   - 不要用 bash 直接（前台或后台）运行 `solidcraft`：沙箱会在调用结束时回收它，表现成窗口反复关闭、重开。
   - 若返回 `mode: "process"`，说明系统没有 user systemd，窗口可能被回收；只启动一次并尽快完成预览。
5. **未运行且本会话还没有特征**（`inspect_design` 的 timeline 为空）：启动后第一次 MCP 调用会自动桥接到这个窗口；结果末尾不再出现 “headless” note 即已连接，之后建模实时显示，不需要 push。
6. **未运行但已有建模工作**：MCP 会话固定为 headless，不能中途切换。`save` → `open`（打开该文件）→ 之后每次修改都用 `push` 更新原 tab。
7. 没有显示环境或启动失败：读 `renders/solidcraft-gui.log`，改用 `screenshot` 在聊天里预览，不要声称已打开窗口。
8. 预览截图用 `source:"model"`，不要用 `source:"window"` 抢用户当前视图或相机。需要证明窗口已打开时，用 `python3 scripts/solidcraft_gui.py screenshot renders/gui_window.png` 抓窗口。

## 6. Bug 与崩溃

按 `references/bug-report.md` 执行：确认版本 → 在全新设计里最小复现 → 缩小脚本 → 用 `measure` / 截图核对 → 搜索已有 issue → 把完整报告给用户看 → **用户明确同意后**才提交。未经同意绝不上传用户设计、截图、日志或文件内容。

## 7. 边界

- 不臆造命令、参数或字段名；不确定就查。
- 不覆盖未保存的设计，不删除用户文件；保存/导出/新建设计前先说明。
- 不把“命令发出去了”当成“结果对了”；不把 headless 会话说成用户能看到。
- 长调用超时（错误以 `still running:` 开头）不要重发：先 `mcp__solidcraft__pending` 或 `inspect_design` 确认状态。
