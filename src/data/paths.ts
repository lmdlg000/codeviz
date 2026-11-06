/**
 * 学习路线
 * ------------------------------------------------------------------
 * 站点默认按 C → C++ 的教材顺序编排，但确实有一批学习者直接从 C++ 起步。
 * 这里把同样的 14 节课重新组织成两条路线，不改课程内容，只改「先学什么、
 * 哪些可以晚点看」，避免 C++ 学习者被指针 / 文件 / 位运算卡在门口。
 */

export type PathId = 'c' | 'cpp';

export interface LearningPath {
  id: PathId;
  /** 分段控件上的短名 */
  short: string;
  name: string;
  tagline: string;
  description: string;
  /** 主线课程 id，按学习顺序 */
  core: string[];
  /** 可以跳过、需要时再回来看的课程 */
  optional: string[];
  /** 本路线下的补充说明：lessonId → 一句提示 */
  notes: Record<string, string>;
}

export const LEARNING_PATHS: LearningPath[] = [
  {
    id: 'c',
    short: 'C 主线',
    name: '从 C 开始',
    tagline: '按教材顺序打底，再进 C++',
    description:
      '完整体验「先过程、后对象」的经典路径：变量与流程 → 数组函数 → 指针与内存 → 结构体与文件 → 类、继承、模板。适合零基础、或准备应付 C 语言考试的同学。',
    core: [
      'c01-hello',
      'c02-data',
      'c03-operators',
      'c04-selection',
      'c05-loops',
      'c06-arrays',
      'c07-functions',
      'c08-pointers',
      'c09-structs',
      'c10-files',
      'c14-bits',
      'c11-classes',
      'c12-inheritance',
      'c13-templates'
    ],
    optional: [],
    notes: {}
  },
  {
    id: 'cpp',
    short: 'C++ 直达',
    name: '直接学 C++',
    tagline: '跳过 C 专属内容，直奔类与模板',
    description:
      '给已经决定用 C++ 的人：C++ 与 C 共享变量、运算、选择、循环、函数这些语法，所以这几节照学即可（把 printf 换成 cout 就行）；指针、结构体、文件、位运算先标为「可跳过」，等真正需要时再回来补，不要一上手就被它们劝退。',
    core: [
      'c01-hello',
      'c02-data',
      'c03-operators',
      'c04-selection',
      'c05-loops',
      'c06-arrays',
      'c07-functions',
      'c11-classes',
      'c12-inheritance',
      'c13-templates'
    ],
    optional: ['c08-pointers', 'c09-structs', 'c10-files', 'c14-bits'],
    notes: {
      'c01-hello': '把 `printf("…\\n")` 换成 `std::cout << "…" << std::endl`，其余不变。',
      'c02-data': '用 `std::string` 代替 `char[]`，用 `cin >>` 代替 `scanf`，从第一天就避开缓冲区陷阱。',
      'c06-arrays': '先用 `std::vector<int>` 完成同样的遍历与排序，数组留作理解内存布局的底层视角。',
      'c07-functions': 'C++ 还支持函数重载与默认参数，函数名可以相同、参数表不同。',
      'c11-classes': 'C++ 的真正起点：从这里开始，`struct` 与 `class` 只差默认访问权限。',
      'c12-inheritance': '多态必须靠虚函数，记得把基类析构函数写成 `virtual`。',
      'c13-templates': '模板 + STL 是 C++ 生产力的来源，`vector` / `map` / `sort` 要能熟练用。'
    }
  }
];

export const DEFAULT_PATH: PathId = 'c';

export const pathById = (id: string): LearningPath =>
  LEARNING_PATHS.find((item) => item.id === id) ?? LEARNING_PATHS[0];
