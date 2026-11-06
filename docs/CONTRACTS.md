# CodeViz 协作契约（v1）

> 所有成员开工前先读本文件与 `docs/DESIGN_BRIEF.md`。契约中的接口、文件名、ID 不得擅自更改；
> 确需更改时先给 Lead 发消息，由 Lead 统一修改并通知全员。

## 1. 产品目标

面向 C/C++ 初学者的**图形化教程网页**：

- 13 节原创中文课程，覆盖 C 基础 → 控制流程 → 数据组织 → C++ 面向对象，参考两本指定教程的章节脉络（仅参考知识顺序，所有讲解与代码必须原创）。
- “代码实验室”：上传 / 粘贴 **≤ 1000 行** C/C++ 代码，纯前端分析并生成：
  1. 代码画像（行数 / 函数 / 循环 / 分支 / 圈复杂度 / 难度）
  2. 结构大纲（AST 摘要树）
  3. 函数流程图（结构化 SVG）
  4. 调用图（含递归、外部函数）
  5. C++ 类图（字段 / 方法 / 访问控制 / 继承 / 虚函数）
  6. 内存布局示意（全局区 / 栈帧 / 堆、数组格子、指针箭头）
  7. 单步执行动画（教学子集解释器：变量监视、调用栈、输出、控制流）
  8. 诊断建议（语法、常见错误、风格提示）
- 知识图谱、进度记录、测验、深色模式、响应式布局。
- 全部离线可用，无后端、无外部 CDN、无运行时网络请求。

技术栈：Vite 8 + React 19 + TypeScript 7（严格模式）+ CodeMirror 6 + 手写 SVG 可视化 + 自研分析引擎。禁止新增第三方依赖（确需新增先问 Lead）。

## 2. 文件所有权（严格遵守）

| 角色 | 可写范围 | 说明 |
| --- | --- | --- |
| Lead | 根配置、`src/main.tsx`、`src/engine/types.ts`、`src/data/types.ts`、`src/data/chapters.ts`、`src/data/concepts.ts`、`src/data/index.ts`、`docs/**`、`README.md` | 集成、审查、构建、修复 |
| engine-dev | `src/engine/**`（含 `src/engine/__tests__/**`） | 唯一可改引擎代码的人 |
| ui-dev | `src/ui/App.tsx`、`src/ui/pages/**`、`src/ui/layout/**`、`src/ui/components/**`、`src/ui/styles/**`、`src/ui/hooks/**`、`src/ui/lib/**` | 应用外壳与页面 |
| viz-dev | `src/ui/viz/**` | 图形可视化组件 |
| content-c | `src/data/lessons/01-hello.ts`、`02-data.ts`、`03-operators.ts`、`04-selection.ts`、`05-loops.ts`、`src/data/samples/c-basics.ts` | C 入门 5 课 |
| content-advanced | `src/data/lessons/06-arrays.ts`、`07-functions.ts`、`08-pointers.ts`、`09-structs.ts`、`10-files.ts`、`src/data/samples/c-advanced.ts` | C 进阶 5 课 |
| content-cpp | `src/data/lessons/11-classes.ts`、`12-inheritance.ts`、`13-templates.ts`、`src/data/samples/cpp.ts` | C++ 3 课 |
| qa | `tests/**`、`docs/qa/**` | 独立验收（后期加入） |

规则：

- 不修改别人的文件；不要在 `src/engine/types.ts`、`src/data/types.ts` 中删除或改名已有字段。
- 不运行 `pnpm add`、`pnpm install`、`pnpm build`、`git` 命令；不做 git 提交。可运行 `pnpm exec tsc --noEmit`、`pnpm test`。
- 不启动 dev server（Lead 统一启动 `pnpm dev` 于 127.0.0.1:5178 供联调）。
- 文件统一 UTF-8，无 BOM；中文 UI；代码注释适度。
- 完成后 `send_message` 给 lead：完成内容、关键文件、已知问题、验证方式。未完成但需要联调时也要先报告里程碑。

## 3. 引擎契约（engine-dev 必读）

### 3.1 入口与类型

- 公共入口：`src/engine/index.ts`，必须导出：
  ```ts
  export function analyzeCode(code: string, options?: AnalyzeOptions): AnalysisResult;
  export function simulate(code: string, options?: SimulateOptions): TraceResult;
  export function detectLanguage(code: string, filename?: string): SourceLanguage;
  export function getEngineInfo(): EngineInfo;
  export * from './types';
  ```
- 所有类型在 `src/engine/types.ts`（Lead 已写好契约）。不得改语义；可增可选字段。
- 纯同步、纯函数、确定性（相同输入必须相同输出，禁止 Date/random）。
- **绝不抛异常**：无论输入多离谱，都返回带 diagnostics 的结果。对 1000 行内的合法教学代码，`analyzeCode` 建议 < 100ms。

### 3.2 词法 / 语法（容错解析）

支持 C 与常见 C++ 教学代码：

- 预处理行 `#include`、`#define`、`#ifdef` 等：收集 include，其余忽略不报错。
- 注释 `//`、`/* */`；字符串（含转义）、字符常量、数字（十进制/十六进制/浮点/后缀）。
- 声明：`int/char/float/double/void/long/short/unsigned/signed/bool`、`const`、`static`、指针 `*`、引用 `&`、数组 `[n]`、初始化列表、`struct/class/enum`、`typedef`。
- 函数：定义、声明（原型）、`main`、参数默认值、C++ 成员函数（类内定义与类外 `A::f` 定义都应识别）、构造/析构、`virtual`、`override`、`static`、`const` 成员函数、模板函数（`template <...>` 前缀跳过）。
- 语句：块、空语句、声明、表达式语句、`if/else if/else`、`while`、`do...while`、`for`（含 C++ 范围 for 可识别但不要求流程图精细）、`switch/case/default`、`break`、`continue`、`return`、`goto`（可降级为普通节点）。
- 表达式：赋值、复合赋值、三元、逻辑/关系/算术/位运算、前后缀 ++/--、函数调用、下标、成员访问 `.` / `->`、取地址 `&`、解引用 `*`、`new/delete`、类型转换、`::`、lambda（可跳过）。表达式解析只需支撑分析与解释器，不要求完整语义。
- 未识别语法：跳过到下一个 `;` 或匹配的 `}`，记录 `Diagnostic severity=info/error`，不中断整体分析。`parseErrors` 统计跳过次数（无法恢复的语法错误）。

### 3.3 分析产物要求

**stats**：
- 行数统计中 `//`、`/* */` 行、空行、代码行的划分要尽量准确（多行注释内算注释行；代码+行尾注释算代码行）。
- 圈复杂度 = 1 + if/else if/for/while/do/case/&&/||/?: 的数量（每个函数单独计算并汇总）。
- `maxNesting` 统计函数体内控制结构最深层数；难度映射建议：≤1 入门、2 基础、3-4 进阶、≥5 挑战，再结合函数数量微调。

**functions**：
- 每个函数生成稳定 id（如 `fn_main`、`fn_add`、`fn_Rect_area`，重复名加序号），span 行号准确。
- `locals` 收集函数体内变量声明（含循环变量、参数也可作为 param 变量；params 在 params 中）。
- `calls` 收集调用点（callee 名称取裸名，如 `printf`、`add`；方法调用可取 `obj.method` 或 `method`，至少能匹配到类方法）。
- `hasReturnOnAllPaths`：保守判断（非 void 函数若存在无 return 的结束路径则为 false；解析不确定时返回 true 以免误报）。
- `interpreterSupported`：该函数（以及它调用的源码内函数）是否完全落在解释器子集内。

**flowcharts**（每个函数一条）：
- 结构化树，见 `FlowchartNode` 注释。必须包含 `start` 与 `end`。
- 顺序语句合并为 `process` 节点（可将连续声明/赋值/输入输出/函数调用合并），标签为中文简述或代码截断（≤ 30 字）；不要堆砌整段代码。
- `if/else` → `decision`，`yes/no` 分支；无 else 时 `no` 分支为 `block`（空）。else-if 嵌套。条件文本放 `condition`（原样表达式）。
- `while/for/do` → `loop`（while/for 先判断，do 使用 `testAfter=true`）。`for` 的初始化与自增可并入 `label`，例如 `i=0; i<n; i++`，`condition="i < n"`。
- `switch` → `switch` 节点，cases 各有 body；`case` 标签保留。
- `return` / `break` / `continue` 独立节点并终止该路径。
- 输入（scanf/cin）→ `input`，输出（printf/puts/cout）→ `output`，函数调用语句 → `call`；纯计算赋值 → `process`。
- 空函数体：start → process("空函数体") → end。
- 节点行号指向源码；`id` 全局唯一、稳定（如 `fn_main_n3`）。nodeCount 统计全部节点。

**callGraph**：
- 节点 = 源码内定义的函数 + `main`；外部函数（printf、sqrt、std::sort 等）单独放 `externalCalls`，不建节点。
- 边去重聚合，保留首个调用行、调用次数。
- 递归：直接与间接递归都要标记（DFS 环检测），`hasRecursion`。
- 根：main 优先；无 main 时取所有未被调用的函数或第一个函数。`depth` 从根开始最长路径（有环时截断）。
- 类方法名建议以 `类名::方法名` 展示（node.name），调用匹配允许方法名。

**outline**：
- 根为 program；children 依次 include、全局声明、struct/class、函数。
- 函数节点 children 展开主要语句（if/loop/switch/return/call/declaration/assignment），供 UI 展示“结构大纲”。层级过深可在 12 层截断。

**classes**：
- 识别 `class/struct` 定义（含 `public:/private:/protected:` 段，struct 默认 public，class 默认 private）。
- fields：成员变量（数组、指针标记）；methods：成员函数、构造/析构、虚函数、纯虚、static、const。access 正确。
- 类外定义 `void A::f() {}` 归并到类方法（至少不产生重复类）。
- 继承：`class Derived : public Base`，`bases` 存基类名；多继承也支持。
- 模板类可只记录类名与成员，不要求实例化。

**memory**：
- 全局变量进 `globals`，每个函数局部变量按栈帧 `stack`；`new`/`malloc` 静态可识别的进 `heap`（无法识别留空）。
- 字节数：`char/bool=1`、`short=2`、`int/float=4`、`long long/double/指针=8`（64 位）、数组 = 元素大小 × 元素个数；结构体 = 成员字节和（含对齐可粗略）。
- 数组尽可能给出 `arrayValues`（初始化列表字面量；字符串字面量拆字符）；指针在初始化表达式为 `&var` / 数组名 / 字符串字面量时给 `pointerTarget`。
- notes 说明“地址为教学示意，不是实际运行地址”。

**diagnostics** 至少覆盖（每条中文、给行号与 hint，避免对合法代码误报）：
1. 括号不匹配 / 缺少分号（error）——能定位才报；
2. 非 void 函数缺少返回值（warning，仅在能确认时）；
3. `if (x = 0)` 条件中误用赋值（warning，x 为已声明变量时；`if (x = f())` 也提示）；
4. `scanf("%d", x)` 缺少取地址符（warning）；
5. 数组下标字面量越界（warning）；
6. 未使用的局部变量（info，参数不报）；
7. 除数为字面量 0（warning）；
8. `printf` 格式符与参数数量明显不符（warning，尽力而为）；
9. 空循环体 `while(...);` 提醒（info）；
10. 不支持的语法 / 解析跳过（info/error）。
最多输出 40 条，按行号排序。

### 3.4 解释器（simulate）

教学子集，**不追求完整语言**。若遇到不支持语法：`ok=false, supported=false, error.kind='unsupported'`，说明行号与原因，UI 会友好降级。

必须支持：
- 类型：`int/long/short/unsigned/float/double/char/bool`，`std::string` 基础（声明、赋值、+、length/size、cout）；字符串字面量（C 字符数组）。
- 表达式：算术、比较、逻辑（短路）、位运算、赋值与复合赋值、三元、前后缀自增自减、强制转换（数值）、`&`/`*` 基础指针、数组下标、成员访问（简单 struct/对象只读字段）、函数调用。
- 声明：带/不带初始化、一维/二维数组初始化（含 `{...}` 部分初始化）、`const`、全局变量。
- 语句：`if/else`、`while`、`do-while`、`for`、嵌套、`switch/case/default`（含 fallthrough）、`break/continue`、`return`、块作用域。
- 函数：参数按值传递、返回值、递归（深度上限 64）、无参、void；数组参数可简化。
- 指针基础：`int *p = &x; *p = ...;`、指针交换两个变量、指针指向数组元素（`p = &a[i]` / `p = a`、`*p`、`p[i]` 可选）。不支持时声明为不支持并说明。
- struct：定义、变量、成员读写、初始化列表；结构体数组可选。不支持就明确报 unsupported。
- I/O：
  - `printf`：`%d %i %u %ld %lld %f %.2f %lf %c %s %%` 与基本宽度（如 `%5d`、`%-5d`、`%05d`）可忽略精度以外细节但要输出正确值；`%s` 支持字符串/字符数组。
  - `puts`、`putchar`、`cout <<`（字符串、数值、`char`、`endl`、`"\n"`，可链式；`std::cout` 与 `using namespace std;` 均可）。
  - `scanf` / `cin >>` 从 `options.stdin` 读取；实现格式串解析（`%d/%f/%lf/%c/%s`），`%c` 读单字符不跳空白，其他跳过空白。stdin 用空白（含换行）分隔的 token 流。输入不足时报 runtime 错误。
  - 不支持文件 I/O 的执行（`fopen` 等直接 unsupported）。
- 每个执行步骤记录一条 `TraceStep`：
  - 在每条语句执行前/后产生，至少覆盖：声明、赋值、条件判断（含 conditionResult）、循环迭代、函数调用/返回、输出（stdout 累计与 outputChunk）、break/continue、程序结束。
  - `vars` 是当前函数可见变量 + 全局变量的快照，`changed` 标出本步变化；`valueText` 面向学生（数组显示为 `{1, 2, 3}`，字符串带引号，指针显示 `0x... -> x` 或 `-> x`；地址可虚构稳定值）。
  - `callStack` 含当前帧；`description` 是中文短句（如 “执行 i++，i 变为 3”）。
  - 首步 `start`、末步 `end`；若截断，最后加说明。
  - `stdout` 每步都为累计值，便于播放器直接跳转。
- 保护：`maxSteps` 默认 3000；超过则截断（`truncated=true`，保留已产生步骤）；总操作数上限 ~200k 防死循环；除以 0、数组越界、空指针解引用报运行时错误（`kind='runtime'`，带行号），但不要崩溃。
- 浮点输出默认 `%g` 风格，避免 0.30000000000000004；整型除法向零截断。

### 3.5 测试

- 测试放在 `src/engine/__tests__/*.test.ts`（vitest，`pnpm test` 可运行），不少于 30 个用例，覆盖：词法/注释统计、函数与递归调用图、if/else 流程图结构、循环节点、数组内存、C++ 类与继承、诊断规则、解释器输出（printf/scanf/cout）、冒泡排序执行、递归阶乘、指针交换、错误输入不抛异常。
- 必须真实跑通的内容示例（教材与实验室会用）：
  - 冒泡排序（数组 + 双层循环 + swap）
  - 递归阶乘、递归斐波那契
  - 指针交换 `swap(int*, int*)`
  - `scanf` 读取两个整数求和
  - 结构体数组 + 遍历
  - C++ `class Rectangle { ... };` 与 `class Shape / Circle : public Shape`（静态分析）
  - `for` 循环求和、`while` 倒计时、嵌套 for 打印乘法表
- 可另写临时调试脚本，但不要留在仓库根目录。

### 3.6 质量要求

- 严格 TypeScript（`strict`），不得用 `any` 大面积绕过；内部可选 `unknown` + 类型守卫。
- 单个文件建议 ≤ 800 行；拆分为 `tokenizer.ts`、`parser.ts`、`analyzer.ts`、`flowchart.ts`、`interpreter.ts`、`utils.ts`。
- 用中文错误信息与节点标签；代码用英文标识符。
- 注释解释关键算法（容错解析、图解布局数据、解释器作用域）。
- 完成后自测：`pnpm exec tsc --noEmit` 与 `pnpm test`，并把典型输出摘要发给 Lead。

## 4. 内容契约（content-* 必读）

### 4.1 课程文件

文件名与 Lesson id 必须**完全一致**：

| 文件 | id | 章节 | 主题 | labSampleId |
| --- | --- | --- | --- | --- |
| 01-hello.ts | c01-hello | c-basics | 初识 C：从一行代码到一张图 | hello-world |
| 02-data.ts | c02-data | c-basics | 数据与变量：给内存贴标签 | circle-area |
| 03-operators.ts | c03-operators | c-basics | 运算符与表达式：让数据动起来 | temp-convert |
| 04-selection.ts | c04-selection | c-control | 选择结构：程序的岔路口 | grade-level |
| 05-loops.ts | c05-loops | c-control | 循环结构：重复的艺术 | sum-1-to-100 |
| 06-arrays.ts | c06-arrays | c-data | 数组与字符串：一排连续的格子 | bubble-sort |
| 07-functions.ts | c07-functions | c-data | 函数与递归：分而治之 | factorial |
| 08-pointers.ts | c08-pointers | c-data | 指针：内存的门牌号 | swap-pointer |
| 09-structs.ts | c09-structs | c-data | 结构体与自定义类型 | student-struct |
| 10-files.ts | c10-files | c-data | 文件：把数据留在磁盘上 | score-file |
| 11-classes.ts | c11-classes | cpp-oop | 类与对象：从结构体到蓝图 | class-rectangle |
| 12-inheritance.ts | c12-inheritance | cpp-oop | 继承与多态：同一种调用，不同的行为 | shape-polymorphism |
| 13-templates.ts | c13-templates | cpp-oop | 模板与 STL：写出通用的代码 | stl-vector |

每个文件 `export default` 一个 `Lesson` 对象（类型见 `src/data/types.ts`）。必须字段：id/chapterId/order/title/subtitle/description/difficulty/minutes/objectives/blocks/keyPoints/quiz/labSampleId。

### 4.2 内容标准

- 原创中文，面向零基础；语气亲切、准确、少术语堆砌；首次出现术语给英文与解释。
- 每课正文（text/note/list）合计约 **1200–2200 个汉字**，结构清晰：引入 → 概念 → 示例 → 图解 → 易错点 → 小结。
- 每课至少：
  - 3–5 条 objectives，3–5 条 keyPoints；
  - 3 个以上代码块（`type:'code'`；每段建议 ≤ 40 行，必须 ≤ 1000 行）；
  - **2 个图形块**（`type:'diagram'`）：控制流课优先 `flow`，数据课用 `memory`/`trace`，函数课用 `calls`/`trace`，C++ 课用 `classes`。图形块里的代码要能被引擎解析；`trace` 代码务必限定在解释器子集（简单声明/循环/函数调用/数组/printf，不依赖输入时可自行赋值，若需 scanf 在 trace 块中请谨慎，建议用固定输入替代）；
  - 2–4 道 quiz（单选题，每题 4 选项、解析完整）；
  - 至少 1 个 `note`（易错点/提示）；
  - 1 个 `try` 块（引导去实验室）。
- 允许的内联格式（仅有这两种）：`**加粗**`、`` `行内代码` ``。不要用 HTML/Markdown 链接。
- 代码规范：2 空格或 4 空格缩进统一；变量命名清晰；注释适量；示例能通过 `g++` 编译（C++ 示例请自行用本机 g++ 验证语法）；C 示例也可以是合法 C++，但不要混入 C++ 专属语法。
- 严禁抄袭参考书文字；不要复制书中的大段例题。参考书仅用于章节脉络与知识点覆盖（About 页面会列出参考书目）。
- 课程中代码块默认带“在实验室打开”按钮（runnable 默认 true）；只有在代码片段不完整时才设 `runnable:false`。

### 4.3 示例文件（CodeSample[]）

| 文件 | 负责 | 必须包含的 id |
| --- | --- | --- |
| samples/c-basics.ts | content-c | hello-world, circle-area, temp-convert, grade-level, sum-1-to-100 |
| samples/c-advanced.ts | content-advanced | bubble-sort, factorial, swap-pointer, student-struct, score-file |
| samples/cpp.ts | content-cpp | class-rectangle, shape-polymorphism, stl-vector |

每个文件 default export 一个 `CodeSample[]`（可多于上表，鼓励 8–10 个）。示例代码 ≤ 1000 行，尽量 30–90 行；能通过本机 g++ 编译；`description` 一句话说明演示点；`focus` 选择最能展示的图形能力；`tags` 2–4 个中文标签；`level` 1–3。

## 5. UI 契约（ui-dev / viz-dev 必读）

- 技术：React 19 函数组件 + TS；样式用普通 CSS / CSS Modules？**统一使用全局 CSS 文件 + BEM 风格类名**（`src/ui/styles/*.css`），不引入 Tailwind/CSS-in-JS。可用 CSS 变量与原生动画。
- 路由：hash 路由（避免服务器 rewrite）：
  - `#/` 首页
  - `#/learn` 课程目录
  - `#/learn/:id` 课程详情
  - `#/lab` 实验室（可用 query 传参：`#/lab?sample=bubble-sort&code=<encodeURIComponent>`；由 ui-dev 定义解析）
  - `#/map` 知识图谱
  - `#/about` 关于
  - 未知路由 → 404 视图（在应用内）。
- 全局数据：`src/data/index.ts` 的 `lessons / samples / chapters / conceptGraph / glossary / getLesson / getSample / getLessonsByChapter / getLessonNeighbors / getConceptsForLesson`。
- 引擎：`src/engine/index.ts` 的 `analyzeCode / simulate / detectLanguage / getEngineInfo`。
- 进度：localStorage，key 前缀 `codeviz.`；课程完成集合 `codeviz.progress.lessons`（string[]），测验答案 `codeviz.quiz.<lessonId>`，实验室草稿 `codeviz.lab.draft`，主题 `codeviz.theme`。提供 hook `useLocalStorage`/`useProgress`。
- UI 必须适配空数据（lessons 为空时首页不崩）。
- 图形组件 API（viz-dev 提供，ui-dev 使用）：
  ```ts
  // src/ui/viz/index.ts
  export function AnalyzedDiagram(props: {
    kind: 'flow' | 'calls' | 'classes' | 'memory' | 'trace';
    code: string;
    functionName?: string;
    autoplay?: boolean;
    onOpenLab?: () => void;
  }): JSX.Element;

  export function FlowchartView(props: {
    data: FlowchartData;
    activeLine?: number;
    onSelectLine?: (line: number) => void;
    compact?: boolean;
  }): JSX.Element;

  export function CallGraphView(props: {
    graph: CallGraph;
    activeFunctionId?: string;
    onSelectFunction?: (id: string) => void;
    compact?: boolean;
  }): JSX.Element;

  export function ClassDiagramView(props: {
    classes: ClassInfo[];
    activeLine?: number;
    onSelectLine?: (line: number) => void;
    compact?: boolean;
  }): JSX.Element;

  export function MemoryView(props: { memory: MemoryModel; compact?: boolean }): JSX.Element;

  export function OutlineView(props: {
    outline: OutlineNode;
    activeLine?: number;
    onSelectLine?: (line: number) => void;
    compact?: boolean;
  }): JSX.Element;

  export function TracePlayer(props: {
    code: string;
    trace: TraceResult;
    language?: 'c' | 'cpp';
    autoplay?: boolean;
    compact?: boolean;
    onLineChange?: (line: number) => void;
  }): JSX.Element;

  export function DiagnosticsView(props: {
    diagnostics: Diagnostic[];
    onSelectLine?: (line: number) => void;
    compact?: boolean;
  }): JSX.Element;
  ```
  `AnalyzedDiagram` 内部自行调用 `analyzeCode`/`simulate`（带缓存）、处理空/错/加载状态，并显示“在实验室打开”入口（若传 onOpenLab）。
- 所有图表要能用鼠标/键盘操作（节点可聚焦、Enter 触发点击），给出图例；移动端可横向滚动，不压缩到不可读。
- 不在渲染期抛错；无效数据给出空状态文案。
- 性能：分析结果不要在每次 render 时重算（`useMemo` / 模块级 Map 缓存）。

## 6. 验收与联调

- Lead 会在 5178 启动 dev server，用浏览器截图验收。UI 组件需要能在 1280×800 与 390×844 下正常显示。
- 每个里程碑完成后向 Lead 报告：完成了什么、涉及文件、自测命令与结果、待办/风险。
- 编译错误优先自己修复；跨模块接口问题先报告 Lead，不擅自改别人的文件。
- 最终必须：`pnpm exec tsc --noEmit` 0 错误、`pnpm test` 全绿、`pnpm build` 成功、浏览器无 console error。

## 7. 参考书目（只做课程脉络参考，不复制原文）

- 《C程序设计教程》（清华大学出版社，馆藏索书号 3204705）——C 语言部分章节脉络：程序设计与 C、顺序结构、选择结构、循环结构、数组、函数、指针、结构体、文件。
- 《C++自学视频教程》（软件开发技术联盟 编著）——C++ 部分：类与对象、继承、多态、模板、STL。
- 教材内容全部原创；About 页面注明“参考教材”与“原创声明”。
