# 草图输入协议

从草图开始建模时，按顺序确认；**未确认完不执行第一次 `batch`**。

1. **参考面**：XY（Z=0）、XZ（Y=0 + offset）、YZ（X=0 + offset）、已有构造面、实体平面。
   - XZ 且 Y=15 → `{"type":"XZ","offset":15}`。
   - 构造面用 `name`；实体平面用 `point`/`face`。
2. **起点**：草图平面坐标 `[u,v]`，默认 `[0,0]`。
3. **图样**：`line` / `circle` / `arc` / `rectangle`。
4. **绘制方法**：
   - line：`two_point`（起点+终点）或 `point_angle_length`（长度+角度）。
   - circle：`center_radius`、`two_point`（直径两端）、`three_point`。
   - arc：`three_point`（起点、经过点、终点）或 `center_start_end`（中心、起点、终点/扫角）。
   - rectangle：`two_point`、`three_point`、`rounded`（需半径）。
5. **闭合**：`line`、`arc` 是开口图样，必须问“是否闭合”；`circle`、`rectangle` 天然闭合，`closed` 可省略。
6. 用 `sketch {"op":"validate", ...}` 校验；通过后把规范化 `plan` 写入 `brief.sketch`，再按 `plan.command` 组织 `batch`。
7. 尺寸单位 mm；坐标/长度可写设计参数表达式；`sketch` 工具只校验，不执行 CAD。

对照命令：`sketch.create`、`sketch.line`、`sketch.circle.center|two_point|three_point`、`sketch.arc.three_point|center_point`、`sketch.rectangle.two_point|three_point|rounded`。
