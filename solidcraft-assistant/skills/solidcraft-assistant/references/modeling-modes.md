# 单体建模入口：特征驱动 / 几何驱动

两种入口，共用 brief、草图协议、参数化、measure/audit、preview。`design_mode` 未写不得 batch；可为 `null` 仅表示未选，不能建模。

## 判定（有优先级）

1. 用户给出足以直接建模的完整几何（面/点/图样/尺寸/特征值）→ `geometry-first`。
2. 否则用户描述用途/功能/特征 → `feature-first`。
3. 同时命中时按 1；不明确时默认 2，并在 `brief.design_mode_reason` 写理由。
4. 中途可切换；切换必须追加 `design_mode_history`，保留已确认特征/参数，并对保留几何重新 `sketch` 校验、`measure`、`brief audit`。

## 草图子流程

- `feature-description`：草图对应功能/特征，先多轮量化（位置、数量、尺寸、约束），再落图；每轮刷新同一预览。
- `parametric`：直接给参考面、起点、图样、方法、尺寸/表达式和约束；助手只补缺项。
- 两者最终都写同一 `sketch` 结构，`sketch.flow` 记录子流程；`parametric` 不取消开口图样闭合确认。

## 特征驱动

F1 功能/特征意图 → F2 拓扑/位置/数量 → F3 约束/基准 → F4 参数与表达式 → F5 草图协议 → build → measure → verify。

- F1/F2 不追问全部尺寸；已确认特征不得静默删除；
- 需要草图的特征（拉伸/旋转/放样/扫掠）必须走 F5；圆角、倒角、抽壳、孔等直接特征不额外造草图，但不得因此跳过基础草图；
- 每轮预览变化能用一句话解释。

## 几何驱动

G1 参考面 → G2 起点（默认 [0,0]）→ G3 图样/方法 → G4 开口图样闭合 → G5 参数/特征 → sketch 校验 → brief.sketch → build → measure → verify。

草图子流程见上；`sketch.flow` ∈ {feature-description, parametric}。

参考面语法：`XY Z=offset`、`XZ Y=offset`、`YZ X=offset`；offset 单位 mm、默认 0、沿面法向正方向。构造面 offset 沿其法向；实体面取支撑面，显式 offset 不一致时须确认。

## 抗失焦/抗失忆

每轮开始 `brief read`，用 `focus.goal/stage/current_question` 复述；结束写回 `focus` 的 decisions/open_questions。压缩/新会话从 `brief` 重建，不靠聊天记忆。

## 不变量

1. 任何需要草图的落模必须先过草图协议和 `sketch` 校验；特征驱动不例外。
2. 只有 build 之后才 measure；F1–F3/G1–G4 不得报告 measure 数值。
3. `brief audit` 需要 `design_mode` 与有效 `sketch`；artifacts 未保存时只能 `unverifiable`。
4. 同一模型只更新原预览 tab；不重启窗口。
5. 数值用 calc 复算；交付前 report_check；未 verified 标准不得作合规依据。
6. checkpoint 的 `tol.abs` 是体积 mm³；有效容差 = `min(tol.abs, minFeatureMm3/2)`，缺 `minFeatureMm3` 即 `unverifiable`。不得固定 0.2%。

详细规格：仓库根 `docs/specs/modeling-input-modes.md`（仅仓库内可见）。
