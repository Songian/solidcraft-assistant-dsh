# GUI 预览（preview 工具）

只用 Host 工具 `preview`，不要用 shell/python 启动或关闭 SolidCraft。

- `preview {"op":"status"}`：是否运行、端口、文档/标签页。
- `preview {"op":"open","design":"designs/x.sc","view":"iso"}`：没有窗口才启动；已有窗口绝不重启。
- `preview {"op":"push","design":"designs/x.sc","view":"top"}`：同一模型关闭旧 tab 后原位重开；新模型才新开 tab。dirty tab 拒绝。
- `preview {"op":"screenshot","design":"renders/x.png"}`：截图到项目根内；没有显示环境时如实说明。
- 路径必须在项目根内；窗口已运行但控制通道不可达时，返回错误并提示用户启用 Preferences > Assistant，不要启动第二个实例。
