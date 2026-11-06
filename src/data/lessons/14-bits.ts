import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c14-bits',
  chapterId: 'c-data',
  order: 6,
  title: '位运算与预处理：贴近硬件的写法',
  subtitle: '用二进制位做开关，用宏与条件编译给代码做配置',
  description:
    '掌握 & | ^ ~ << >> 六个位运算符、常用位技巧，以及 #define 宏、条件编译、枚举与共用体这些教材里绕不开的语法。',
  difficulty: 3,
  minutes: 32,
  objectives: [
    '把十进制数与二进制位对应起来，说清 `&`、`|`、`^`、`~`、`<<`、`>>` 各自的作用',
    '用位运算完成判奇偶、置位、清位、翻转与不用中间变量的交换',
    '写出带括号的宏，并说明为什么宏的参数和整体都要加括号',
    '用 `#ifdef` / `#if defined` 做条件编译，区分编译期与运行期',
    '用 `enum` 表达一组相关常量，用 `union` 说明成员共用内存的含义'
  ],
  blocks: [
    {
      type: 'text',
      body:
        '前面所有运算都在“数”这一层进行：加减乘除、比较大小。但内存里的整数其实是一串二进制位，C 允许我们直接对着这些位下指令——这就是位运算。\n\n' +
        '位运算在教材里通常单独成章，因为它是理解掩码、标志位、哈希、压缩存储的入口；同时它也是各类考试的常客。这一节我们把六个位运算符、常见的位技巧，以及配套的宏与条件编译一次讲清。'
    },
    { type: 'heading', text: '一、六个位运算符' },
    {
      type: 'text',
      body:
        '位运算把两个整数按二进制对齐，逐位计算。以 `int a = 12`（`0000 1100`）、`int b = 10`（`0000 1010`）为例：'
    },
    {
      type: 'table',
      headers: ['运算符', '名称', '规则', '12 op 10', '结果'],
      rows: [
        ['`&`', '按位与', '两位都是 1 才得 1', '`0000 1000`', '8'],
        ['`|`', '按位或', '有一位是 1 就得 1', '`0000 1110`', '14'],
        ['`^`', '按位异或', '两位不同才得 1', '`0000 0110`', '6'],
        ['`~`', '按位取反', '0 变 1，1 变 0', '`~12`', '-13'],
        ['`<<`', '左移', '整体左移，低位补 0', '`12 << 2`', '48'],
        ['`>>`', '右移', '整体右移，高位补符号位', '`12 >> 2`', '3']
      ]
    },
    {
      type: 'code',
      language: 'c',
      title: 'bit_basic.c',
      caption: '把每个结果和二进制对照着看，比背规则有效。',
      code: `#include <stdio.h>

int main() {
  int a = 12;   /* 0000 1100 */
  int b = 10;   /* 0000 1010 */

  printf("a & b  = %d\\n", a & b);    /* 0000 1000 -> 8  */
  printf("a | b  = %d\\n", a | b);    /* 0000 1110 -> 14 */
  printf("a ^ b  = %d\\n", a ^ b);    /* 0000 0110 -> 6  */
  printf("~a     = %d\\n", ~a);       /* 取反后是负数     */
  printf("a << 2 = %d\\n", a << 2);   /* 左移两位 = 乘 4  */
  printf("a >> 2 = %d\\n", a >> 2);   /* 右移两位 = 除 4  */
  return 0;
}
`
    },
    {
      type: 'note',
      tone: 'warn',
      title: '左移右移不是万能的乘除法',
      body:
        '在没溢出的前提下，`x << n` 等于 `x * 2^n`，`x >> n` 等于 `x / 2^n`（整数）。但移位不检查溢出，负数右移在不同实现上可能是算术右移或逻辑右移。要乘除就用乘除，别为了“快”牺牲可读性。'
    },
    { type: 'heading', text: '二、四个能立刻用上的招式' },
    {
      type: 'list',
      ordered: true,
      items: [
        '**判奇偶**：`n & 1` 为 1 就是奇数——比 `n % 2` 更直接，也不会被负数取余的符号问题绊住。',
        '**置位 / 清位 / 翻转**：把第 `k` 位置 1 用 `flags |= (1 << k)`，清 0 用 `flags &= ~(1 << k)`，取反用 `flags ^= (1 << k)`。',
        '**取出最低位的 1**：`n & -n` 得到一个只保留最低位 1 的数，树状数组里随处可见。',
        '**不用中间变量交换**：`a ^= b; b ^= a; a ^= b;` 三步之后两数互换。'
      ]
    },
    {
      type: 'code',
      language: 'c',
      title: 'bit_tricks.c',
      caption: '权限位是最典型的用法：一个 int 里塞下多个开关。',
      code: `#include <stdio.h>

#define READ  1   /* 0001 */
#define WRITE 2   /* 0010 */
#define EXEC  4   /* 0100 */

int isOdd(int n) {
  return n & 1;
}

int main() {
  int flags = READ | WRITE;          /* 同时拥有读和写 */
  printf("读权限：%d\\n", (flags & READ) != 0);
  printf("执行权限：%d\\n", (flags & EXEC) != 0);

  flags |= EXEC;                     /* 增加执行权限 */
  printf("加上执行后：%d\\n", flags);

  int a = 3;
  int b = 8;
  a ^= b;
  b ^= a;
  a ^= b;
  printf("交换后 a = %d, b = %d\\n", a, b);
  printf("7 是奇数吗：%d\\n", isOdd(7));
  return 0;
}
`
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'flow',
        code: `int countOne(int n) {
  int count = 0;
  while (n != 0) {
    n = n & (n - 1);
    count++;
  }
  return count;
}
`,
        functionName: 'countOne'
      },
      title: '数一数二进制里有几个 1',
      caption: '`n & (n - 1)` 每次消掉最低位的 1，循环次数正好等于 1 的个数。'
    },
    { type: 'heading', text: '三、预处理：编译之前先做一次文本替换' },
    {
      type: 'text',
      body:
        '`#` 开头的行不是 C 语句，而是给预处理器（preprocessor）的指令，在真正编译之前执行。最常见的三条是 `#include`、`#define` 和条件编译。\n\n' +
        '`#define` 是纯文本替换，没有类型检查、没有作用域。写宏时**每个参数都要加括号，整体也要加括号**，否则运算符优先级会把表达式撕开。'
    },
    {
      type: 'compare',
      left: {
        title: '有风险的宏',
        language: 'c',
        code: `#define SQUARE(x) x * x

printf("%d", SQUARE(1 + 2));
/* 展开成 1 + 2 * 1 + 2 = 5 */`
      },
      right: {
        title: '安全的写法',
        language: 'c',
        code: `#define SQUARE(x) ((x) * (x))

printf("%d", SQUARE(1 + 2));
/* 展开成 ((1 + 2) * (1 + 2)) = 9 */`
      },
      caption: '宏不是函数：它只做替换，括号是唯一的保险。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'preprocess.c',
      caption: '条件编译常用于调试开关与跨平台分支，被排除的代码根本不会进目标文件。',
      code: `#include <stdio.h>

#define DEBUG 1
#define MAX(a, b) ((a) > (b) ? (a) : (b))

int main() {
#ifdef DEBUG
  printf("调试模式已开启\\n");
#endif

#if DEBUG
  printf("最大值：%d\\n", MAX(3, 9));
#endif

  return 0;
}
`
    },
    {
      type: 'note',
      tone: 'tip',
      title: '宏 vs const / 内联函数',
      body:
        '常量优先用 `const int N = 10;` 或 `constexpr`，函数优先用普通函数或 `static inline`——它们有类型检查、能被调试器看见。宏只在确实需要“文本级替换”（如条件编译、日志开关）时才用。'
    },
    { type: 'heading', text: '四、枚举与共用体：自定义类型的两种补充' },
    {
      type: 'text',
      body:
        '`enum` 给一组相关常量起名字，默认从 0 开始递增；`union` 让多个成员共用同一块内存，大小取最大的成员。前者提升可读性，后者常用于“同一块内存按不同类型解释”的场合（如协议解析）。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'enum_union.c',
      caption: '`typedef` 给类型起别名，后面就能直接写 `Point` 而不用写 `struct Point`。',
      code: `#include <stdio.h>

enum Color { RED, GREEN, BLUE };

typedef struct {
  int x;
  int y;
} Point;

union Number {
  int i;
  float f;
};

int main() {
  enum Color c = GREEN;
  printf("GREEN = %d\\n", c);

  Point p = {3, 4};
  printf("点 (%d, %d)\\n", p.x, p.y);

  union Number n;
  n.i = 1065353216;   /* 与 1.0f 共用同一段位模式 */
  printf("按 float 解释：%.1f\\n", n.f);
  printf("union 大小：%d 字节\\n", (int)sizeof(union Number));
  return 0;
}
`
    },
    {
      type: 'note',
      tone: 'danger',
      title: '共用体同一时刻只有一个成员有效',
      body:
        '写入 `n.i` 之后读 `n.f` 是在“按另一种类型解释同一段内存”，结果依赖具体的位模式与字节序。真实项目里这种用法需要明确的类型双关规则，入门阶段只需要知道：union 的大小是最大成员的大小，成员之间共享内存。'
    },
    {
      type: 'try',
      language: 'c',
      prompt:
        '把 `countOne` 改成用递归实现，再试试统计 `n` 的二进制长度（最高位 1 的位置）。打开实验室单步执行，看每次 `n` 怎么变化。',
      code: `#include <stdio.h>

int countOne(int n) {
  if (n == 0) return 0;
  return 1 + countOne(n & (n - 1));
}

int main() {
  printf("%d\\n", countOne(255));
  return 0;
}
`
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
        {
          mistake: '位运算与比较混在一起写，忘了加括号',
          wrong: 'if (n & 1 == 0)',
          right: 'if ((n & 1) == 0)',
          why: '`==` 的优先级高于 `&`，原式会被解析成 `n & (1 == 0)`，结果恒为 0，条件永远不成立。'
        },
        {
          mistake: '宏的参数和整体没有加括号',
          wrong: '#define SQUARE(x) x * x',
          right: '#define SQUARE(x) ((x) * (x))',
          why: '宏只是文本替换，`SQUARE(1 + 2)` 会展开成 `1 + 2 * 1 + 2`。参数和整体都加括号才能保住运算顺序。'
        },
        {
          mistake: '对浮点数使用位运算符',
          wrong: 'double d = 3.5; int r = d & 1;',
          right: 'int r = ((int)d) & 1;',
          why: '位运算符只接受整型，浮点数在内存里的位模式是 IEEE 754，直接按位与得不到数学意义上的结果。'
        },
        {
          mistake: '以为枚举值一定是 0、1、2',
          wrong: 'enum Color { RED = 5, GREEN, BLUE };  // 以为 GREEN 是 0',
          right: '/* RED=5, GREEN=6, BLUE=7 */',
          why: '没有显式赋值时，第一个成员从 0 开始；一旦某个成员被赋值，后面的成员在它的基础上依次加 1。'
        }
      ]
    }
  ],
  keyPoints: [
    '`&` 与、`|` 或、`^` 异或、`~` 取反、`<<` 左移、`>>` 右移，都是逐位计算。',
    '`n & 1` 判奇偶，`flags |= (1 << k)` 置位，`flags &= ~(1 << k)` 清位。',
    '位运算符优先级低于比较运算符，混用时必须加括号。',
    '`#define` 是编译前的文本替换：参数与整体都要加括号，能不用就不用。',
    '条件编译在编译期决定哪些代码参与编译，`enum` 给常量起名，`union` 让成员共用内存。'
  ],
  quiz: [
    {
      id: 'c14-q1',
      question: '`int a = 6; int b = 3;` 执行 `a & b` 的结果是？',
      options: ['7', '2', '5', '0'],
      answer: 1,
      explanation:
        '6 是 `0110`，3 是 `0011`。按位与只有两位都是 1 才得 1，结果是 `0010`，也就是 2。'
    },
    {
      id: 'c14-q2',
      question: '想把整数 `flags` 的第 3 位（从 0 开始数）置为 1，正确写法是？',
      options: ['`flags |= (1 << 3);`', '`flags = 3;`', '`flags &= ~(1 << 3);`', '`flags ^= 3;`'],
      answer: 0,
      explanation:
        '`1 << 3` 得到 `1000`，再与 `flags` 按位或，就能在不影响其他位的前提下把第 3 位置 1。`&=` 是清位，`^=` 是翻转。'
    },
    {
      id: 'c14-q3',
      question: '关于 `#define MAX(a, b) ((a) > (b) ? (a) : (b))`，说法正确的是？',
      options: [
        '它是函数，参数有类型检查',
        '它是文本替换，`MAX(i++, j++)` 可能会让变量自增两次',
        '它只在运行时计算一次',
        '宏名必须大写，否则编译报错'
      ],
      answer: 1,
      explanation:
        '宏在预处理阶段做文本替换，参数会被原样代入两次（条件和两个分支各一次），带副作用的表达式因此可能执行多次。宏名大写只是约定，不是语法要求。'
    }
  ]
};

export default lesson;
