# CodeViz 独立验收报告（QA）

- 验收人：qa（独立验收，未修改任何产品源码）
- 日期：2026-11-06（最终复跑同日晚间）
- 环境：dev server `http://127.0.0.1:5178`（未重启）；Windows + Microsoft Edge（playwright-core 1.64.1，headless）；桌面 1440×900、移动 390×844；浅色 / 深色
- 最终结论：**P0 = 0，P1 = 0，未关闭 P2 = 0**。验收期发现的 2 条 P2 已修复并复测通过；另 1 条 Toast 位置经 Lead 确认属有意设计偏离，不计为缺陷。
- 交付物：
  - 测试脚本：`tests/qa/`（`harness.mjs`、`run-routes.mjs`、`run-lab.mjs`、`run-lessons.mjs`、`check-content.mjs`、`run-a11y.mjs`）
  - 截图：`docs/qa/shots/{routes,lab,lessons}/`
  - 机器可读结果：`docs/qa/results/{routes,lab,lessons,content,a11y}.json`

## 1. 最终结果（最后一轮复跑）

| 验证范围 | 脚本 | 检查点 | 失败 |
| --- | --- | --- | --- |
| 全部路由 × 桌面/移动 × 浅色/深色 | `run-routes.mjs` | 65（64 个路由组合 + 深色切换） | **0** |
| 代码实验室深度流程 | `run-lab.mjs` | 116 | **0** |
| 课程页（c01/c05/c08/c11） | `run-lessons.mjs` | 212 | **0** |
| 数据 / 内容完整性 | `check-content.mjs` | 395 | **0** |
| 可访问性 / 质量抽查 | `run-a11y.mjs` | 54 | **0** |

复跑日志：`docs/qa/results/_final-routes.log`、`_final-lab.log`、`_final-lessons.log`、`_final-a11y.log`。
全部路由扫描均无 `console error`、`pageerror`、请求失败、React key 警告；页面无横向滚动、无越界元素、无占位/异常文案（`Lorem`/`TODO`/`占位文案`/`undefined` 等）。

## 2. 问题清单与关闭状态

### P0（阻塞/崩溃）
无。

### P1（明显功能或布局问题）
无。

### P2-01 次级文字对比度不满足 WCAG AA —— 已修复并复测通过

- 页面：全站 `.eyebrow` 眉标、侧栏底部 `.sidebar__meta`
- 原问题（复现）：`#/lab`（1440×900）测量 `.eyebrow` / `.sidebar__meta` 文字色 `--ink-tertiary` 与背景对比度，浅色仅 **2.40:1 / 2.56:1**、深色 **4.02:1 / 3.64:1**，低于设计简报 §6 “对比度满足 WCAG AA”（普通文字 ≥ 4.5:1）。
- 修复：文字色由 `--ink-tertiary` 改为 `--ink-secondary`（浅色 `rgb(71,85,105)`）。
- 复测（`docs/qa/results/a11y.json`）：

| 元素 | 浅色对比度 | 深色对比度 | AA 要求 | 结果 |
| --- | --- | --- | --- | --- |
| `.eyebrow` | **7.08:1** | **8.81:1** | ≥ 4.5:1 | 通过 |
| `.sidebar__meta` | **7.58:1** | **8.00:1** | ≥ 4.5:1 | 通过 |
| `.page-header__description` | 7.08:1 | 8.81:1 | ≥ 4.5:1 | 通过 |

### P2-03 示例库标签筛选区过高 —— 已修复并复测通过

- 页面：`#/lab` → 「示例库」弹窗
- 原问题：71 个标签 chip 占 6 行、**193px** 高；弹窗正文 725px，卡片网格顶部被推到 393px，首屏只能看到约 2 行示例卡。
- 修复：改为单行横向滚动（`overflow-x: auto`）。
- 复测（浏览器 DOM 测量，1440×900 与 390×844 均验证）：

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 标签筛选区高度 | 193px（6 行） | **31px（1 行横向滚动）** |
| 示例卡网格顶部位置 | 393px | **231px** |
| 标签 chip 数量 | 71 | 71（全部保留） |

- 证据截图：[lab-sample-library-fixed-desktop.png](shots/lab/lab-sample-library-fixed-desktop.png)、[lab-sample-library-fixed-mobile.png](shots/lab/lab-sample-library-fixed-mobile.png)、开发同轮截图 `shots/sample-library-fixed.png`

### 设计偏离（Lead 已确认保留，不计为缺陷）

- **Toast 位于右上角**：`docs/DESIGN_BRIEF.md` §5.4/§6 原写“右下角”，实际在右上（`.toast-layer { right: 22px; top: 20px }`）。Lead 确认为**有意偏离**（避免遮挡实验室底部内容与类图），验收方不再作为问题跟踪。
- 证据截图：[lab-overview.png](shots/lab/lab-overview.png)

## 3. 已验证通过的关键路径（最终复跑）

### A. 页面与响应式（`run-routes.mjs`，65/65 通过）
- 路由：`#/`、`#/learn`、13 个 `#/learn/:id`、`#/lab`、`#/map`、`#/about`、`#/nope`、未知课程 id；桌面 1440×900 与移动 390×844；浅色与深色（桌面通过点击侧栏「深色模式」切换并验证 `data-theme=dark`）。
- 内容：首页 6 张能力卡 + 4 张路径卡 + CTA；课程目录 13 张课程卡 / 4 章节；课程页 3–5 目标、≥3 代码块、≥2 图形卡、2–4 道测验、目录与 heading 锚点数量一致；图谱 28 个概念节点，点击后详情卡正常；关于页 2 本参考教材 + 4 行快捷键；404 文案正确。
- 布局：全部组合无横向滚动、无越界元素、无空壳页面、无遮挡（桌面侧栏/移动顶栏显示规则正确）。

### B. 实验室深度流程（`run-lab.mjs`，116/116 通过）
- 初始示例加载（bubble-sort.c、24/1000 行、未分析空状态）→「分析代码」→ 状态「已分析 · 1 个函数 · 0 个错误」、4 个统计卡、函数列表、调用摘要。
- 7 个 tab 全部可用：概览 / 流程图 / 调用图 / 类图 / 内存 / 单步执行 / 诊断；C 示例的类图正确显示空状态文案。
- 流程图节点点击 → 编辑器 `cm-cv-target-line` 高亮对应行 + 底部代码片段；函数 chips 正常。
- 单步执行：运行追踪 → 上一步/下一步、播放/暂停、0.5×/1×/2×、滑块、跳首/末步、空格快捷键均有效；变量表与输出随步骤变化；不支持文件 I/O 的代码给出中文友好降级说明。
- 示例库：打开/搜索/语言筛选/标签筛选；载入 `class-rectangle` 后类图显示 1 个类（字段/方法），点击成员可定位代码；载入 `shape-polymorphism` 后类图 3 个类 + 继承边 + virtual 标记，调用图 9 个节点。
- 上传：合法 `small.c` 自动载入并分析；1001 行文件被拒绝并提示「超过了 1000 行的上限」；`.py` 被拒绝并提示支持的扩展名；空文件被拒绝。
- 快捷键与状态：Ctrl+Enter 重新分析、Ctrl+Shift+Enter 打开并运行追踪、代码修改后显示「代码已修改」；草稿 800ms 防抖写入 localStorage 且刷新后恢复（不自动分析）。
- 错误输入：缺分号、`scanf` 少 `&`、数组下标越界、除数为 0 均给出对应中文诊断且不崩溃；空代码状态 0/1000、按钮禁用、Ctrl+Enter 提示「请先输入或载入一段代码」。
- URL `#/lab?sample=factorial` 自动载入并分析；移动端上下堆叠、抽屉、深色、播放器无横向溢出。

### C. 课程页（`run-lessons.mjs`，212/212 通过）
- c01-hello、c05-loops、c08-pointers、c11-classes 抽查：目录锚点滚动到对应 heading 且 scrollspy 高亮、阅读进度条生效；内联 `**加粗**` / `` `行内代码` `` 正常渲染且无残留标记。
- 图形卡均为真实 SVG/播放器（非空状态），点击节点出现对应代码片段，键盘 Enter 可触发；trace 图卡播放器控件完整。
- 测验：选择 → 查看答案（正确项/解析/得分）→ 刷新后答案与解析持久化 →「再试一次」清空；标记完成 → Toast + 徽标 + 侧栏章节进度更新 → 刷新后保留 → 可取消；上一课/下一课链接与路由正确；代码块「在实验室打开」成功交接代码并自动分析。
- 移动端课程页：右目录隐藏、本节目录折叠可用、无横向溢出、测验与完成按钮可点。
- 深色模式课程页与图形卡截图正常，无 console error。

### D. 数据/内容完整性（`check-content.mjs`，395/395 通过）
- 13 个课程文件与 `docs/CONTRACTS.md` 的 id / chapterId / order / labSampleId 完全对应；lesson id、quiz id 全局唯一；测验均为 4 选项且答案下标合法、解析非空。
- 13 个契约样例 id 全部存在（实际 30 个示例），sample id 唯一、标签 2–4 个、等级合法、代码 ≤1000 行。
- 每课均有 ≥3 个代码块、≥2 个图形块、≥1 个 note、≥1 个 try；`text/note/list` 汉字数 1257–1965，均在契约约 1200–2200 范围。
- 所有图形块代码均能通过引擎分析：flow 有流程图、calls 有调用节点、classes 有类、memory 有内存单元、trace 可执行且步骤 >0。
- 概念图 28 节点 / 28 条边，边引用全部有效，节点章节/课程引用有效；glossary 33 条。
- 安全面：`src` 无 `dangerouslySetInnerHTML`，数据层无外部 URL、无 Markdown 链接、无 `Lorem/TODO/FIXME/待补充/占位文案`。验收过程中曾出现的仓库根目录 `temp-viz-test.log` 与临时 smoke 测试已在复检前由开发删除。

### E. 可访问性 / 质量（`run-a11y.mjs`，54/54 通过）
- 首页/课程目录/课程页/图谱/关于/实验室：交互元素均有可访问名称，无重复 id、无失效 `aria-labelledby/describedby`、无 `img` 缺 alt、无正整数 tabindex；每页 1 个 h1、main/nav/skip-link 齐全；真实键盘 Tab 前 8 个焦点均有可见 focus ring。
- 实验室 tablist 支持方向键切换；SVG 流程节点均有 `role=button` + `aria-label` + tabIndex；`prefers-reduced-motion: reduce` 下滚动行为为 auto、无报错。
- 对比度复测全部达到 WCAG AA（见 P2-01）。

## 4. 复跑结论

- 最后一轮复跑（开发已合入 P2-01 / P2-03 修复后执行，同一批脚本）：
  - `run-routes.mjs`：**65 / 65 通过**，0 失败，0 console 警告
  - `run-lab.mjs`：**116 / 116 通过**，0 失败
  - `run-lessons.mjs`：**212 / 212 通过**，0 失败
  - `run-a11y.mjs`：**54 / 54 通过**，0 失败（对比度 7.08–8.81:1）
- 结论：**P0 = 0，P1 = 0，未关闭 P2 = 0**；两处 P2 修复均已复测确认，未引入回归。
- 说明：复跑期间开发同步更新了内存布局说明文案（MemoryView），测试断言已同步更新，文案变更本身不构成缺陷。

## 5. 范围与限制

- 仅验证 Chromium 内核（Edge）；未验证 Firefox/Safari 的 CSS/SVG 差异。
- 未做真实屏幕阅读器（NVDA/VoiceOver）走查；可访问性为 DOM/键盘/对比度自动化抽查。
- 未做性能基准（1000 行代码分析耗时）与离线断网测试；本次验收聚焦功能与布局正确性。
- 实验室测试全部通过真实 UI 交互完成（未直接调用引擎模块）；内容完整性检查通过 dev server 动态 import 真实数据模块 + 引擎校验。
