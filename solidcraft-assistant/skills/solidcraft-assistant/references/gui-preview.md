# GUI 预览

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

