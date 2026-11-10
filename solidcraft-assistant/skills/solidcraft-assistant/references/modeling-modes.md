# 单体建模入口：特征驱动 / 几何驱动

两种入口，共用 brief、草图协议、参数化、measure/audit、preview。

## 判定

- 用户描述用途/功能/特征 → `feature-first`；逐轮细化，先拓扑后尺寸，每轮更新同一预览 tab。
- 用户直接给面/点/图样/尺寸/特征值 → `geometry-first`；只问缺项，确认后集中建模。
- 中途可切换；切换必须更新 `brief.design_mode`，保留已确认特征与参数。

## 特征驱动

F1 功能/特征意图 → F2 拓扑/位置/数量 → F3 约束/基准 → F4 参数与表达式 → F5 草图协议 → build → verify。

- 不在 F1/F2 追问全部尺寸；
- 已确认特征不得静默删除；
- 每轮预览变化能用一句话解释。

## 几何驱动

G1 参考面（XY Z=0；XZ Y=offset；YZ X=offset；构造面/实体面）→ G2 起点（默认 [0,0]）→ G3 图样/方法 → G4 开口图样闭合 → G5 参数/特征 → sketch 校验 → brief.sketch → build。

## 不变量

1. `brief.design_mode` ∈ {feature-first, geometry-first}，未选择不得 batch。
2. 任何草图落模前必须过草图协议和 `sketch` 校验；特征驱动不例外。
3. 每阶段 measure；`brief audit` verdict=verified 才可宣称通过。
4. 同一模型只更新原预览 tab；不重启窗口。
5. 数值用 calc 复算；交付前 report_check；未 verified 标准不得作合规依据。

详细规格：本地 `docs/specs/modeling-input-modes.md`（不随产品发布）。
