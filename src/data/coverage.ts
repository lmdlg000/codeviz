/**
 * 知识点覆盖矩阵
 * ------------------------------------------------------------------
 * 对照两本参考教材的章节结构，标注本站在 14 节课里的覆盖情况：
 *   covered —— 有独立小节 + 可运行示例
 *   partial —— 有提及或仅有片段，不足以支撑独立练习
 *   gap     —— 本版未覆盖，明确写出来，避免"看起来什么都教了"
 * 数据同时用于「关于」页的表格与验收文档。
 */

export type CoverageStatus = 'covered' | 'partial' | 'gap';

export interface CoverageRow {
  /** 参考教材，或「通用」表示两本都要求的基础 */
  source: 'C 程序设计教程' | 'C++ 自学视频教程';
  topic: string;
  status: CoverageStatus;
  /** 对应课程 id（gap 时为空） */
  lessonIds: string[];
  note: string;
}

export const COVERAGE_ROWS: CoverageRow[] = [
  { source: 'C 程序设计教程', topic: '第 1 章 程序设计与 C 语言', status: 'covered', lessonIds: ['c01-hello'], note: 'main、编译运行、第一个 printf。' },
  { source: 'C 程序设计教程', topic: '第 2 章 数据类型与运算符', status: 'covered', lessonIds: ['c02-data', 'c03-operators'], note: '基本类型、常量、算术与赋值、优先级与类型转换。' },
  { source: 'C 程序设计教程', topic: '第 3 章 顺序结构（输入输出）', status: 'covered', lessonIds: ['c01-hello', 'c02-data'], note: 'printf / scanf 的格式串、地址与返回值。' },
  { source: 'C 程序设计教程', topic: '第 4 章 选择结构', status: 'covered', lessonIds: ['c04-selection'], note: 'if / else if / switch，悬垂 else 与浮点比较。' },
  { source: 'C 程序设计教程', topic: '第 5 章 循环结构', status: 'covered', lessonIds: ['c05-loops'], note: 'while / for / do-while、break / continue、嵌套与差一错误。' },
  { source: 'C 程序设计教程', topic: '第 6 章 数组', status: 'covered', lessonIds: ['c06-arrays'], note: '一维二维数组、遍历、排序、字符数组与 \\0。' },
  { source: 'C 程序设计教程', topic: '第 7 章 函数', status: 'covered', lessonIds: ['c07-functions'], note: '参数传递、返回值、作用域、递归与调用栈。' },
  { source: 'C 程序设计教程', topic: '第 8 章 指针', status: 'covered', lessonIds: ['c08-pointers'], note: '地址与解引用、指针与数组、指针作参数、二级指针入门。' },
  { source: 'C 程序设计教程', topic: '第 9 章 自定义数据类型', status: 'covered', lessonIds: ['c09-structs', 'c14-bits'], note: '结构体在 09，枚举 / 共用体 / typedef 在 14。' },
  { source: 'C 程序设计教程', topic: '第 10 章 文件', status: 'covered', lessonIds: ['c10-files'], note: 'FILE 指针、打开模式、读写与关闭。' },
  { source: 'C 程序设计教程', topic: '位运算', status: 'covered', lessonIds: ['c14-bits'], note: '六个位运算符、掩码与标志位。' },
  { source: 'C 程序设计教程', topic: '编译预处理', status: 'covered', lessonIds: ['c14-bits'], note: '#define 宏的括号陷阱、条件编译。' },
  { source: 'C 程序设计教程', topic: '常见错误分析', status: 'covered', lessonIds: ['c01-hello', 'c14-bits'], note: '每节课都有易错警示，实验室另有自动自查清单。' },

  { source: 'C++ 自学视频教程', topic: '从 C 到 C++：cin / cout', status: 'covered', lessonIds: ['c11-classes'], note: '链式输出、endl、按类型解析输入。' },
  { source: 'C++ 自学视频教程', topic: '类与对象、构造与析构', status: 'covered', lessonIds: ['c11-classes'], note: '访问控制、构造函数、this、const 成员函数。' },
  { source: 'C++ 自学视频教程', topic: '继承与派生', status: 'covered', lessonIds: ['c12-inheritance'], note: 'public 继承、构造析构顺序、protected。' },
  { source: 'C++ 自学视频教程', topic: '多态与虚函数', status: 'covered', lessonIds: ['c12-inheritance'], note: '虚函数、虚析构、纯虚函数与抽象类。' },
  { source: 'C++ 自学视频教程', topic: '函数模板与类模板', status: 'covered', lessonIds: ['c13-templates'], note: '类型参数、实例化、模板定义放头文件。' },
  { source: 'C++ 自学视频教程', topic: 'STL 容器与算法', status: 'partial', lessonIds: ['c13-templates'], note: '讲了 vector / string / sort 的用法，容器适配器与迭代器体系未展开。' },
  { source: 'C++ 自学视频教程', topic: '引用', status: 'partial', lessonIds: ['c08-pointers'], note: '在指针课末尾对比过，未单独成节；单步执行暂不支持引用参数。' },
  { source: 'C++ 自学视频教程', topic: '动态内存 new / delete', status: 'partial', lessonIds: ['c08-pointers'], note: '只讲了存在性与风险，未给完整示例；解释器不支持追踪。' },
  { source: 'C++ 自学视频教程', topic: '运算符重载', status: 'gap', lessonIds: [], note: '本版未覆盖。' },
  { source: 'C++ 自学视频教程', topic: '异常处理 try / catch', status: 'gap', lessonIds: [], note: '本版未覆盖。' },
  { source: 'C++ 自学视频教程', topic: '文件流 fstream', status: 'gap', lessonIds: [], note: '文件课讲的是 C 的 FILE*，C++ 流式文件未覆盖。' }
];

export const COVERAGE_SUMMARY = {
  covered: COVERAGE_ROWS.filter((row) => row.status === 'covered').length,
  partial: COVERAGE_ROWS.filter((row) => row.status === 'partial').length,
  gap: COVERAGE_ROWS.filter((row) => row.status === 'gap').length,
  total: COVERAGE_ROWS.length,
};

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  covered: '已覆盖',
  partial: '部分覆盖',
  gap: '未覆盖',
};
