# 报告模板

填满每一节，删掉尖括号提示。脚本和数字说明大部分问题，保持简短。

````markdown
**Reproduced on:** SolidCraft <version> (<release, or built from source at commit …>), <OS and version>, <GPU, for a display problem>
<or: **Only in my design:** <what was tried: its history as a script rebuilds fine / fails the same way>>

### Steps
1. <app step, in the app's words: Sketch → Rectangle on the XY plane, 20 × 20 mm>
2. <…>
3. <the step that fails>

Minimal script (`solidcraft-cli run repro.json`):

```json
{"commands":[
  <the smallest command list that still fails>
]}
```

### Expected
<what should happen, with the number you computed>

### Actual
<what happens, with the measured numbers>

```text
<the error text or command output, copied as it is>
```

<how often: every time / 3 of 5 runs; the boundary if you found one>

### Attachments
<screenshot of the failure; the crash report id if there is one; no private designs unless the user agreed>
````
