import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c04-selection',
  chapterId: 'c-control',
  order: 1,
  title: '选择结构：程序的岔路口',
  subtitle: '用 if、else if 与 switch，让程序按条件选择不同的执行路径。',
  description:
    '学会写条件表达式，用 if、else if 处理多段区间，用逻辑运算符组合条件，再用 switch 处理离散分支。',
  difficulty: 2,
  minutes: 35,
  objectives: [
    '写出正确的关系表达式，并说出它在 C 语言里如何变成“真”或“假”',
    '用 `if`、`else`、`else if` 实现两路分支与多段区间判断',
    '用 `&&`、`||`、`!` 组合条件，并理解短路求值',
    '用 `switch` 处理离散取值，正确使用 `break` 避免穿透',
    '读懂流程图里的菱形判断与“是 / 否”两条分支'
  ],
  blocks: [
    {
      type: 'text',
      body:
        '前面几节的程序都像一条笔直的马路：语句从上往下，一条接一条，不会拐弯。可现实中的程序几乎都要做选择：分数够不够及格线？密码对不对？余额够不够付款？\n\n' +
        '选择结构让程序有了岔路口。程序先计算一个条件，再根据条件的真假决定走哪条路。这一节我们学习三种表达岔路的方式：`if`、`else if` 和 `switch`，并且用流程图把它们画出来。'
    },
    { type: 'heading', text: '一、条件：一个能回答“是或否”的表达式' },
    {
      type: 'text',
      body:
        '条件通常由关系运算符构成。它们比较两个值，然后给出一个结果，表示比较是否成立。'
    },
    {
      type: 'table',
      headers: ['运算符', '含义', '例子', '什么时候成立'],
      rows: [
        ['`==`', '等于', '`score == 100`', 'score 正好等于 100'],
        ['`!=`', '不等于', '`score != 100`', 'score 不等于 100'],
        ['`>`', '大于', '`score > 60`', 'score 大于 60'],
        ['`<`', '小于', '`score < 60`', 'score 小于 60'],
        ['`>=`', '大于或等于', '`score >= 60`', 'score 大于或等于 60'],
        ['`<=`', '小于或等于', '`score <= 100`', 'score 小于或等于 100']
      ]
    },
    {
      type: 'text',
      body:
        '在 C 语言里，条件的结果是一个整数：**0 表示假，非 0 表示真**。任何值都能当作条件使用，比如 `if (5)` 永远成立，`if (0)` 永远不成立。不过为了让意图清楚，判断大小、相等时还是应该老老实实写关系表达式。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'pass.c',
      code: `#include <stdio.h>

int main(void) {
  int score = 58;

  if (score >= 60) {
    printf("通过\\n");
  } else {
    printf("未通过，需要补考\\n");
  }
  return 0;
}
`,
      caption: '条件成立走 if 的花括号，不成立走 else 的花括号，两条路只会走一条。',
      highlights: [6, 7]
    },
    {
      type: 'note',
      tone: 'warn',
      title: '一个等号是赋值，两个等号才是比较',
      body:
        '`if (score = 60)` 是新手最危险的笔误：它先把 60 赋给 score，再把 60 当作条件，于是条件永远成立，而且变量被悄悄改掉了。编译器通常只会给一条警告。写条件时看到单个 `=`，先停下来检查。'
    },
    { type: 'heading', text: '二、if 与 else：两条路' },
    {
      type: 'text',
      body:
        '`if` 的语法很直白：`if (条件) { 语句 }`。条件为真时执行花括号里的内容；如果后面还跟着 `else`，条件为假时就执行 `else` 里的内容。\n\n' +
        '如果分支里只有一条语句，花括号可以省略，但初学阶段建议总是写上。花括号像护栏，能防止你以后往分支里加第二行语句时忘了补括号，导致逻辑出错。\n\n' +
        '下面用取余判断奇偶。`number % 2` 只有 0 和 1 两种可能，正好对应两条路。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'even_odd.c',
      code: `#include <stdio.h>

int main(void) {
  int number = 17;
  int remainder = number % 2;

  if (remainder == 0) {
    printf("%d 是偶数。\\n", number);
  } else {
    printf("%d 是奇数，余数是 %d。\\n", number, remainder);
  }
  return 0;
}
`,
      caption: '把余数存进变量再判断，比在条件里直接写 `number % 2 == 0` 更容易读。',
      highlights: [7]
    },
    {
      type: 'text',
      body:
        '还有一种容易忽略的写法问题：`else` 永远与离它最近、并且还没有配对的 `if` 结合，而不是与“看起来对齐”的那个结合。缩进只是给人看的，编译器并不读缩进。所以写多层判断时，最好给每一层都补上花括号，或者把它拆成更小的步骤，别让读者靠猜来判断代码归属。'
    },
    { type: 'heading', text: '三、else if：多段区间' },
    {
      type: 'text',
      body:
        '现实中的分类往往不止两类：成绩要分 A、B、C、D、E，体温要分正常、低烧、高烧。这时可以用 `else if` 串成一条链。\n\n' +
        '判断会从上往下依次进行，**一旦某个条件成立，后面所有分支都会被跳过**。因此条件的顺序非常重要：范围应该从窄到宽，或者说从高到低。如果先把 `score >= 60` 放在最前面，那么 87 分也会被归入及格，后面 `>= 90` 的分支就永远轮不到。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'grade.c',
      code: `#include <stdio.h>

int main(void) {
  int score = 87;

  if (score < 0 || score > 100) {
    printf("分数不合法\\n");
  } else if (score >= 90) {
    printf("等级 A\\n");
  } else if (score >= 80) {
    printf("等级 B\\n");
  } else if (score >= 70) {
    printf("等级 C\\n");
  } else if (score >= 60) {
    printf("等级 D\\n");
  } else {
    printf("等级 E\\n");
  }
  return 0;
}
`,
      caption: '第一个分支负责拦截非法分数，剩下的分支再从高到低判断。',
      highlights: [6, 8, 10, 12, 14]
    },
    {
      type: 'note',
      tone: 'info',
      title: '条件顺序决定结果',
      body:
        '把 `score >= 90` 和 `score >= 60` 的位置互换，87 分会先在 `>= 60` 处成立，于是直接输出 D。写 else-if 链时，先问自己：这些条件是否互斥？如果不是，就必须按更严格、更具体的条件排在前面。'
    },
    { type: 'heading', text: '四、逻辑运算符：把条件拼起来' },
    {
      type: 'text',
      body:
        '一个判断常常要同时满足好几个条件，比如“年满 18 岁并且分数达到 60”。C 提供三个逻辑运算符来组合条件。'
    },
    {
      type: 'table',
      headers: ['运算符', '含义', '例子', '什么时候成立'],
      rows: [
        ['`&&`', '逻辑与，两边都真才真', '`age >= 18 && score >= 60`', '两个条件都成立'],
        ['`||`', '逻辑或，有一边真就真', '`score < 0 || score > 100`', '至少一个条件成立'],
        ['`!`', '逻辑非，把真假反过来', '`!(score >= 60)`', '条件不成立时']
      ]
    },
    {
      type: 'code',
      language: 'c',
      title: 'signup.c',
      code: `#include <stdio.h>

int main(void) {
  int age = 20;
  int score = 85;

  if (age >= 18 && score >= 60) {
    printf("可以报名\\n");
  } else {
    printf("条件不满足\\n");
  }
  return 0;
}
`,
      caption: '两个条件都成立时，`&&` 才为真。',
      highlights: [7]
    },
    {
      type: 'text',
      body:
        '`&&` 和 `||` 还有一个很实用的性质：**短路求值**。对于 `&&`，如果左边已经为假，右边根本不会计算；对于 `||`，如果左边已经为真，右边也会被跳过。这不仅省时间，还能保护程序，例如 `if (b != 0 && a / b > 2)`：当 b 为 0 时，右边的除法不会执行，也就不会出现除零错误。'
    },
    {
      type: 'note',
      tone: 'warn',
      title: '不能写 0 <= score <= 100',
      body:
        'C 语言会先算 `0 <= score`，得到一个 0 或 1，再拿这个结果与 100 比较。于是无论分数是多少，整个条件都恒为真，根本起不到限制作用。正确写法是 `score >= 0 && score <= 100`。数学里的连写不等式，在 C 里必须拆成两个比较。'
    },
    { type: 'heading', text: '五、switch：按离散取值分路' },
    {
      type: 'text',
      body:
        '当判断依据是几个确定的取值时，`switch` 比一长串 `else if` 更清楚。比如根据运算符字符决定做哪种运算，根据菜单编号决定执行哪个功能。\n\n' +
        '`switch (表达式)` 后面的括号里必须是整数或字符类型。每个 `case` 是一个标签，表示“如果值等于这个，就从这里开始执行”。`default` 负责兜底，所有 case 都不匹配时执行。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'calculator.c',
      code: `#include <stdio.h>

int main(void) {
  double a = 12.0;
  double b = 8.0;
  char op = '/';

  switch (op) {
    case '+':
      printf("%.1f + %.1f = %.1f\\n", a, b, a + b);
      break;
    case '-':
      printf("%.1f - %.1f = %.1f\\n", a, b, a - b);
      break;
    case '*':
      printf("%.1f * %.1f = %.1f\\n", a, b, a * b);
      break;
    case '/':
      if (b != 0.0) {
        printf("%.1f / %.1f = %.1f\\n", a, b, a / b);
      } else {
        printf("除数不能为 0\\n");
      }
      break;
    default:
      printf("不认识的运算符: %c\\n", op);
  }
  return 0;
}
`,
      caption: '每个 case 末尾的 `break` 让程序跳出 switch，不再往下“滑”。',
      highlights: [11, 14, 17, 24]
    },
    {
      type: 'note',
      tone: 'warn',
      title: '忘了 break 会“穿透”',
      body:
        'switch 只会决定从哪里开始执行，并不会自动在下一个 case 前停下。如果某个 case 忘了写 `break`，程序会继续执行下一个 case 的语句，这叫 fallthrough。初学阶段除非刻意为之，否则每个 case 末尾都要写 `break;`。'
    },
    { type: 'heading', text: '六、图解：岔路口长什么样' },
    {
      type: 'text',
      body:
        '把分数分档的程序画成流程图，分支会变成菱形：菱形里写着条件，两条箭头分别标着“是”和“否”。沿着箭头走，你能直观看到为什么 87 分最终落在等级 B。'
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'flow',
        functionName: 'main',
        code: `#include <stdio.h>

int main(void) {
  int score = 87;

  if (score < 0 || score > 100) {
    printf("分数不合法\\n");
  } else if (score >= 90) {
    printf("等级 A\\n");
  } else if (score >= 80) {
    printf("等级 B\\n");
  } else if (score >= 70) {
    printf("等级 C\\n");
  } else if (score >= 60) {
    printf("等级 D\\n");
  } else {
    printf("等级 E\\n");
  }
  return 0;
}
`
      },
      title: 'else-if 链在流程图里是一串菱形',
      caption: '每个菱形都是一次提问；回答“否”才继续往下问，回答“是”就走向对应的输出。'
    },
    {
      type: 'text',
      body:
        '读流程图时，可以刻意练习一种“反向翻译”：从某个输出节点往回走，看看需要满足哪些条件才能到达它。比如 87 分要走到“等级 B”，必须先在第一个菱形处回答“否”，在“大于等于 90”处再回答“否”，然后在“大于等于 80”处回答“是”。能完成这种反向推理，说明你已经真正理解了分支结构。'
    },
    {
      type: 'text',
      body:
        '如果改用 `switch`，流程图会变成多路分支的扇形结构：每个 case 是一条独立的路。两种结构没有绝对的好坏，关键是看判断依据是“范围”还是“确定的几个值”。'
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'trace',
        code: `#include <stdio.h>

int main(void) {
  int score = 76;

  if (score >= 60) {
    printf("及格\\n");
  } else {
    printf("不及格\\n");
  }
  return 0;
}
`
      },
      title: '单步执行：条件为真，走 if 分支',
      caption: '播放器会在判断处给出条件结果；这次结果是真，所以 else 里的语句不会执行。'
    },
    {
      type: 'text',
      body:
        '在播放器里把 score 改成 42 再运行一次，你会看到判断结果为假，执行路线立刻换到另一条分支。这正是选择结构与顺序结构最根本的区别：同一段代码，不同的数据会走出不同的路线。'
    },
    { type: 'heading', text: '七、小结' },
    {
      type: 'text',
      body:
        '选择结构让程序第一次拥有了“判断力”。关系表达式负责提问，`if` 与 `else if` 负责按范围分流，逻辑运算符把多个条件组合起来，`switch` 则适合处理几个离散的取值。\n\n' +
        '写分支时记住三件事：比较用 `==` 而不是 `=`；多段区间要从严格到宽松排列；switch 的每个 case 都要检查 `break`。下一节，我们让程序把同一条路走上很多遍——循环结构。'
    },
    {
      type: 'try',
      language: 'c',
      prompt:
        '把 score 分别改成 59、60、95，观察走哪条分支。再把这段程序改写成 switch 版本：用 `score / 10` 作为判断依据，体会 case 10 和 case 9 共用同一个输出时，为什么可以只写一次 `break`。',
      code: `#include <stdio.h>

int main(void) {
  int score = 87;

  switch (score / 10) {
    case 10:
    case 9:
      printf("等级 A\\n");
      break;
    case 8:
      printf("等级 B\\n");
      break;
    case 7:
      printf("等级 C\\n");
      break;
    case 6:
      printf("等级 D\\n");
      break;
    default:
      printf("等级 E\\n");
  }
  return 0;
}
`
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
    {
      mistake: "if 后面多写了分号",
      wrong: "if (score >= 60);\n  printf(\"及格\");",
      right: "if (score >= 60)\n  printf(\"及格\");",
      why: "分号让 if 的语句体变成空语句，后面的 printf 变成无条件执行。"
    },
    {
      mistake: "用 == 比较浮点数",
      wrong: "if (0.1 + 0.2 == 0.3)",
      right: "if (fabs(0.1 + 0.2 - 0.3) < 1e-9)",
      why: "浮点数有精度误差，0.1 + 0.2 实际是 0.30000000000000004，相等判断要用误差范围。"
    },
    {
      mistake: "悬垂 else：else 跟错了 if",
      wrong: "if (a) if (b) x(); else y();",
      right: "if (a) { if (b) x(); } else y();",
      why: "else 永远匹配最近的未配对 if；想让它配外层，必须加花括号。"
    }
      ]
    },
  ],
  keyPoints: [
    '条件在 C 里用整数表示：0 为假，非 0 为真；比较时用 `==`，赋值才用 `=`。',
    '`else if` 自上而下判断，一旦命中就跳过后面所有分支，条件顺序会改变结果。',
    '`&&` 与 `||` 会短路求值，可以利用它避免除零等危险操作。',
    '数学里的连写不等式在 C 里要拆成两个比较，用 `&&` 连接。',
    '`switch` 按离散值分路，每个 case 末尾通常都要写 `break`，否则会穿透到下一个 case。'
  ],
  quiz: [
    {
      id: 'c04-q1',
      question: '`if (score = 60)` 这条语句实际会发生什么？',
      options: [
        '把 60 赋给 score，条件恒为真',
        '比较 score 是否等于 60，语法错误',
        '把 score 改成 0，条件恒为假',
        '编译时一定会被拒绝，无法运行'
      ],
      answer: 0,
      explanation:
        '单个 `=` 是赋值，不是比较。它先把 60 写进 score，整个赋值表达式的值也是 60，非 0 即为真，所以分支永远执行。正确写法是 `if (score == 60)`。'
    },
    {
      id: 'c04-q2',
      question: '为什么 `if (0 <= score <= 100)` 不能实现“分数在 0 到 100 之间”？',
      options: [
        '它先算 `0 <= score` 得到 0 或 1，再与 100 比较，恒为真',
        'C 语言不允许在条件里写两个比较符号',
        '它只会判断 score 是否等于 100',
        '它会把 score 的值改成 100'
      ],
      answer: 0,
      explanation:
        'C 从左到右计算：`0 <= score` 得到 0 或 1，再拿这个结果与 100 比较——0 和 1 都小于等于 100，所以整个条件恒为真。正确写法是 `score >= 0 && score <= 100`。'
    },
    {
      id: 'c04-q3',
      question: 'switch 中某个 case 末尾忘了写 `break`，会发生什么？',
      options: [
        '继续执行下一个 case 的语句，直到遇到 break 或结束',
        '程序直接跳出 switch，什么也不执行',
        '编译报错，无法通过',
        '重复执行当前 case 一次'
      ],
      answer: 0,
      explanation:
        'switch 只根据值决定“从哪里开始”，并不自动结束。缺少 `break` 时会继续往下穿透（fallthrough），执行后面 case 的语句，往往产生意料之外的输出。'
    },
    {
      id: 'c04-q4',
      question: '表达式 `a > 0 && b / a > 1` 中，`&&` 的短路求值有什么好处？',
      options: [
        '当 a 为 0 时不再计算右边的除法，避免除零错误',
        '让整个条件永远为真',
        '把 a 自动转换成 double 再计算',
        '跳过左边的比较，直接算右边'
      ],
      answer: 0,
      explanation:
        '`&&` 从左往右求值，左边为假时右边不会执行。因此当 a 为 0 时，`b / a` 不会被计算，程序不会因除零崩溃。'
    }
  ],
  labSampleId: 'grade-level'
};

export default lesson;
