# CodeViz · C/C++ 图解工坊

> 把 C / C++ 代码，变成看得见的图。

面向 C/C++ 初学者的**纯前端图形化教程网站**：一边按 20 节原创课程学习，一边把任意 ≤1000 行的 C/C++ 代码粘贴/上传到「代码实验室」，自动得到流程图、调用图、类图、内存布局与单步执行动画。

## 功能

- **20 节原创课程 + 两条学习路线**：C 语言起步 → 控制流程 → 数据组织 → C++ 面向对象，含图解、可运行示例、随堂测验、**易错警示 / 自查清单**与学习进度。
  - 「从 C 开始」：20 节完整主线，含 C++ 起步课；
  - 「直接学 C++」（`#/learn?path=cpp`）：15 节核心课，**第一课就是 `iostream` / `cout` / `cin` / `std::string`**，不经过 printf 与 char 数组；指针 / 结构体 / 文件 / 位运算标为可跳过，每节课附「C++ 里怎么写」的对照提示。
- **代码实验室**：上传或粘贴 ≤ 1000 行 C/C++ 代码，纯浏览器内分析：
  - 代码画像：行数、函数、循环、分支、圈复杂度、难度；
  - 函数流程图（结构化 SVG，可点击定位源码）；
  - 调用图（含递归检测、外部函数）；
  - C++ 类图（字段 / 方法 / 访问控制 / 继承 / 虚函数）；
  - 内存布局示意（全局区 / 栈帧 / 堆、数组格子、指针目标）；
  - 单步执行动画（教学子集解释器：变量监视、调用栈、输出，以及 **new/delete 的堆视图**：块编号、元素、谁指向它、是否已释放）；
  - **C++ 类对象可单步**：构造（初始化列表 / 类内声明 + 类外定义 / 默认参数）、析构（按声明逆序）、成员函数与 `this`、拷贝构造与 `operator=` 的深拷贝、运算符重载（成员与非成员、`operator<<` 链式输出），临时对象按「完整表达式」析构 —— `BigInt` 那类 300 行代码能在实验室里跑出正确结果；
  - 明确的能力边界：继承 / 虚函数 / 类模板 / STL 容器不在单步范围内，会在开跑前指着具体行给出中文说明，而不是跑到一半报错；
  - **堆内存检查**：泄漏、重复释放、释放后使用、`new[]` 与 `delete` 混用都会被点名；`malloc` / `calloc` / `free` 与 `new` / `delete` 走同一套堆模型；
  - 诊断建议（语法与常见错误）；
  - **自查清单**：15 条初学者高频错误，能自动判定的由诊断规则驱动，其余标注「需人工确认」；
  - **标准库覆盖**：`stdio.h` / `string.h` / `ctype.h` / `math.h` / `stdlib.h` / `iostream` / `string` / STL 共 64 条，逐项标注「可执行 / 仅静态」。
- **知识图谱**：34 个核心概念与依赖关系，点击跳转对应课程。
- **知识点覆盖矩阵**：「关于」页对照两本教材逐条标注已覆盖 / 部分覆盖 / 未覆盖（见 `docs/COVERAGE.md`）。
- **终端皮肤**：等宽字体、荧光绿配色、扫描线与提示符，深色为默认，可切浅色；响应式布局与键盘可操作；所有分析在本地完成，代码不会离开浏览器。

## 技术栈

- Vite 8 + React 19 + TypeScript 7（严格模式）
- CodeMirror 6（代码编辑，C/C++ 语法高亮）
- 手写 C/C++ 词法/语法分析、静态分析、教学解释器（`src/engine`）
- 手写 SVG 可视化（`src/ui/viz`）
- 无后端、无外部 CDN、无运行时网络请求

## 运行

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5178
pnpm test         # 引擎单元测试
pnpm build        # 类型检查 + 生产构建（dist/）
pnpm preview      # 预览生产构建 http://127.0.0.1:4178
```

## 部署

推送到 `main` 分支即触发 `.github/workflows/deploy-pages.yml`：类型检查 → 单元测试 → 构建 → 发布到 GitHub Pages。

- 线上地址：https://lmdlg000.github.io/codeviz/
- 首次使用需要在仓库 **Settings → Pages → Build and deployment → Source** 里选择 **GitHub Actions**（`GITHUB_TOKEN` 无权自动创建 Pages 站点）。
- `vite.config.ts` 的 `base` 为相对路径，项目页子路径、自定义域名与本地 `pnpm preview` 都直接可用。
- **排障**：如果打开站点白屏、控制台报 `Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "application/octet-stream"`，说明 Pages 仍是「Deploy from a branch」在发布仓库源码（`/src/main.tsx` 被当成静态文件返回）。把 Source 改成 **GitHub Actions** 后重新运行工作流即可。

## 目录

```
src/
  engine/          C/C++ 分析引擎、流程图/调用图/类图/内存模型、教学解释器
  data/            13 节课程、示例代码、章节、知识图谱、术语表
  ui/
    pages/         首页 / 课程 / 课程详情 / 实验室 / 图谱 / 关于
    components/    通用 UI 组件
    viz/           六类 SVG 可视化与单步执行播放器
    styles/        设计变量与全局样式
docs/
  CONTRACTS.md     模块接口与内容契约
  DESIGN_BRIEF.md  视觉与交互设计简报
tests/             集成/端到端测试
scripts/           截图与验收脚本
```

## 支持范围

- **分析**：C 与常见 C++ 教学代码（预处理、类型、指针/引用、数组、结构体/类、继承、模板前缀、控制流、函数/成员函数等）。
- **执行追踪**：教学子集（基本类型、数组、控制流、函数与递归、指针基础、结构体基础、`printf`/`scanf`/`cout`/`cin`）。超出子集时仍提供静态分析，并给出友好说明。
- 代码行数上限：1000 行（按产品需求）。

## 参考教材

课程知识脉络参考（**仅参考章节顺序，所有讲解、示例与图表均为原创**，未复制教材内容）：

1. 谭浩强《C程序设计教程（第3版）》，清华大学出版社
2. 软件开发技术联盟 编著《C++自学视频教程》，清华大学出版社

## 验收与测试

- 引擎单元测试：`pnpm test`（99 个用例）
- 类型检查 / 生产构建：`pnpm build`
- 独立 QA（无头 Edge，需先 `pnpm dev`）：`node tests/qa/run-routes.mjs`、`node tests/qa/run-lab.mjs`、`node tests/qa/run-lessons.mjs`、`node tests/qa/run-a11y.mjs`
- QA 报告：[docs/qa/report.md](docs/qa/report.md)（P0=0，P1=0；65 路由组合、116 项实验室检查、212 项课程检查、54 项可访问性检查全部通过）

## 原创与使用

本项目为学习/教学用途的原创实现。示例代码可自由用于学习；教材文字与插图版权归原作者及出版社所有。
