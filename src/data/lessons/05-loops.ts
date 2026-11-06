import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c05-loops',
  chapterId: 'c-control',
  order: 2,
  title: '循环结构：重复的艺术',
  subtitle: 'while、for、do-while 与 break：把重复交给程序，把思考留给自己。',
  description:
    '用 while、for、do-while 写循环，掌握初值、条件与更新三要素，再用嵌套循环、break 与 continue 处理更复杂的重复任务。',
  difficulty: 2,
  minutes: 35,
  objectives: [
    '说清循环的三要素：从哪开始、做到什么时候停、每轮怎么变化',
    '熟练写出 `while` 与 `for` 循环，并根据场景选择更合适的写法',
    '用 `do-while` 实现“至少执行一次”的逻辑',
    '用嵌套循环处理行与列这样的二维问题',
    '用 `break` 与 `continue` 精确控制循环的走向'
  ],
  blocks: [
    {
      type: 'text',
      body:
        '选择结构解决了“走哪条路”，但还有一类问题它帮不上忙：把同一件事做很多遍。想输出 100 个编号、累加 1 到 100、打印九九乘法表，靠复制粘贴显然不现实。\n\n' +
        '循环就是为重复而生的结构。它让一小段代码反复执行，直到某个条件不再成立。写循环的核心，是把“重复的动作”和“什么时候停”想清楚。'
    },
    { type: 'heading', text: '一、先看看没有循环有多笨' },
    {
      type: 'text',
      body:
        '如果要连续输出三次问候，可以老老实实写三条 `printf`。可如果是一百次呢？代码会变得又长又难改，而且改一处数字就得改一百行。\n\n' +
        '更麻烦的是，重复次数往往由数据决定：用户输入几就输出几。固定行数的代码根本无法应对。循环把“次数”变成一个可以计算的变量，问题立刻变得灵活。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'three_times.c',
      code: `#include <stdio.h>

int main(void) {
  printf("第 1 次练习\\n");
  printf("第 2 次练习\\n");
  printf("第 3 次练习\\n");
  return 0;
}
`,
      caption: '三行还能接受，一百行就是灾难。循环会把这三行压成一行循环体。'
    },
    { type: 'heading', text: '二、while：条件成立就一直做' },
    {
      type: 'text',
      body:
        '`while` 是最朴素的循环：先判断条件，成立就执行循环体，执行完再回来判断，直到条件不成立为止。它的结构是 `while (条件) { 循环体 }`。\n\n' +
        '要让循环有结束的一天，循环体里必须有东西在改变条件，通常就是那个控制次数的循环变量。下面的程序用 `fuel` 记录剩余燃料，每轮减一，减到 0 时条件不成立，循环结束。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'fuel.c',
      code: `#include <stdio.h>

int main(void) {
  int fuel = 3;

  while (fuel > 0) {
    printf("剩余燃料 %d\\n", fuel);
    fuel--;
  }

  printf("燃料耗尽，着陆\\n");
  return 0;
}
`,
      caption: '循环体里的 `fuel--` 是循环能停下来的关键。',
      highlights: [8]
    },
    {
      type: 'text',
      body:
        '把循环拆开看，永远只有三件事：**初值**（fuel 从 3 开始）、**条件**（fuel 大于 0 才继续）、**更新**（每轮减一）。这三要素缺一个，循环要么不执行，要么停不下来。写任何循环之前，先把这三件事用一句话说清楚。'
    },
    {
      type: 'note',
      tone: 'warn',
      title: '忘了更新，就是死循环',
      body:
        '如果循环体里漏写了 `fuel--`，fuel 永远是 3，条件永远成立，程序会一直打印下去。遇到程序卡死、输出刷屏，第一反应就是检查循环变量有没有被更新、条件有没有机会变成假。'
    },
    { type: 'heading', text: '三、for：把三要素写在一行' },
    {
      type: 'text',
      body:
        '`for` 循环把初值、条件、更新集中写在括号里，是“知道要循环多少次”时最常用的写法。它的执行顺序是：初始化一次，判断条件，执行循环体，执行更新，再判断条件，如此往复。\n\n' +
        '下面的程序累加 1 到 100。`sum` 像一只存钱罐，每轮把当前的 `i` 放进去。循环结束后，存钱罐里就是总和。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'sum.c',
      code: `#include <stdio.h>

int main(void) {
  int sum = 0;

  for (int i = 1; i <= 100; i++) {
    sum += i;
  }

  printf("1 + 2 + ... + 100 = %d\\n", sum);
  return 0;
}
`,
      caption: '初值 `i = 1`、条件 `i <= 100`、更新 `i++` 三件事一目了然。',
      highlights: [6, 7]
    },
    {
      type: 'text',
      body:
        '累加是循环最经典的用途：先准备一个初值为 0 的累加器，再在每轮里把新值加进去。想求阶乘，就把累加器初值改成 1、把 `sum += i` 换成 `product *= i`，并让循环从 1 走到 n；不过阶乘增长极快，`int` 很快就会溢出。想只累加偶数，可以把初值改成 2、更新语句改成 `i += 2`，或者在循环体里用 `continue` 跳过奇数。同一个骨架，能变出很多程序。'
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'flow',
        functionName: 'main',
        code: `#include <stdio.h>

int main(void) {
  int sum = 0;

  for (int i = 1; i <= 100; i++) {
    sum += i;
  }

  printf("1 + 2 + ... + 100 = %d\\n", sum);
  return 0;
}
`
      },
      title: 'for 循环在流程图里是一个环',
      caption: '判断节点在循环体上方，循环体执行完有一条箭头回到判断处，这就是“回边”。'
    },
    {
      type: 'text',
      body:
        '流程图里最值得注意的，是那条从循环体指回判断节点的箭头。顺序结构只有一条向下的线，而循环让线绕了回来。只要条件仍然成立，程序就会沿着回边一圈一圈地走。'
    },
    { type: 'heading', text: '四、do-while：先做一遍再说' },
    {
      type: 'text',
      body:
        '`while` 和 `for` 都是先判断再执行，如果一开始条件就不成立，循环体一次也不会执行。`do-while` 反过来：先执行循环体，再判断要不要继续，因此循环体至少执行一次。\n\n' +
        '它适合“先做一次，再决定要不要重复”的场景，比如倒计时、菜单至少显示一次、读取数据直到遇到结束标记。注意 `do-while` 的结尾有一个分号，这是它和 `while` 在写法上最容易忽略的差别。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'countdown.c',
      code: `#include <stdio.h>

int main(void) {
  int seconds = 5;

  do {
    printf("%d...\\n", seconds);
    seconds--;
  } while (seconds > 0);

  printf("点火，起飞!\\n");
  return 0;
}
`,
      caption: '先输出 5，再减一、判断，直到 seconds 变成 0。',
      highlights: [6, 9]
    },
    {
      type: 'text',
      body:
        '两者的差别在边界情况下最明显。把起始值设为 0，`while (n > 0)` 一次都不会执行，而 `do-while` 会先执行一遍再退出。下面左右两段程序除了循环写法，其余完全相同，输出却不一样。'
    },
    {
      type: 'compare',
      left: {
        title: 'while-zero.c',
        language: 'c',
        code: `#include <stdio.h>

int main(void) {
  int n = 0;

  while (n > 0) {
    printf("执行一次\\n");
    n--;
  }

  printf("循环结束\\n");
  return 0;
}
`
      },
      right: {
        title: 'do-while-zero.c',
        language: 'c',
        code: `#include <stdio.h>

int main(void) {
  int n = 0;

  do {
    printf("执行一次\\n");
    n--;
  } while (n > 0);

  printf("循环结束\\n");
  return 0;
}
`
      },
      caption: '左侧只输出“循环结束”，右侧会多输出一行“执行一次”。'
    },
    { type: 'heading', text: '五、嵌套循环：行与列' },
    {
      type: 'text',
      body:
        '循环体里还可以再放一个循环，这叫嵌套。外层每走一轮，内层都要完整地跑一遍。打印表格、遍历二维数据、生成图形，都离不开嵌套循环。\n\n' +
        '下面的程序打印九九乘法表。外层 `row` 控制第几行，内层 `col` 从 1 打印到 `row`，因此每行的列数逐行增加。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'table.c',
      code: `#include <stdio.h>

int main(void) {
  for (int row = 1; row <= 9; row++) {
    for (int col = 1; col <= row; col++) {
      printf("%d*%d=%-2d ", row, col, row * col);
    }
    printf("\\n");
  }
  return 0;
}
`,
      caption: '内层循环结束后，外层循环才换到下一行；`%-2d` 让每格至少占两格、左对齐。',
      highlights: [5, 6, 8]
    },
    {
      type: 'note',
      tone: 'info',
      title: '内层跑完一整轮，外层才走一步',
      body:
        '理解嵌套循环的关键，是分清“谁快谁慢”。外层变量 row 每变化一次，内层变量 col 都要从 1 走到 row。用单步执行走一遍，你会看到 col 反复归 1、反复增加，而 row 一直不动。'
    },
    { type: 'heading', text: '六、break 与 continue' },
    {
      type: 'text',
      body:
        '循环有时不需要走到最后。`break` 立刻跳出整个循环，`continue` 只结束当前这一轮、马上进入下一轮。一个管“整体退出”，一个管“跳过本次”。\n\n' +
        '判断素数很适合演示 `break`：只要找到一个因子，就能确定它不是素数，后面的试除没有意义，可以提前收工。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'prime.c',
      code: `#include <stdio.h>

int main(void) {
  int number = 97;
  int isPrime = 1;

  if (number < 2) {
    isPrime = 0;
  } else {
    for (int i = 2; i * i <= number; i++) {
      if (number % i == 0) {
        isPrime = 0;
        break;
      }
    }
  }

  if (isPrime) {
    printf("%d 是素数\\n", number);
  } else {
    printf("%d 不是素数\\n", number);
  }
  return 0;
}
`,
      caption: '一旦找到因子，`break` 立刻结束 for 循环，不再做无谓的试除。',
      highlights: [13]
    },
    {
      type: 'code',
      language: 'c',
      title: 'skip_even.c',
      code: `#include <stdio.h>

int main(void) {
  for (int i = 1; i <= 10; i++) {
    if (i % 2 == 0) {
      continue;
    }
    printf("%d ", i);
  }
  printf("\\n");
  return 0;
}
`,
      caption: '遇到偶数就 `continue`，跳过本轮的 printf，只打印奇数。',
      highlights: [5, 6]
    },
    {
      type: 'note',
      tone: 'warn',
      title: 'break 跳出的是哪一层？',
      body:
        '`break` 和 `continue` 只作用于它们所在的那一层循环。在嵌套循环的内层写 `break`，只跳出内层，外层仍会继续。如果确实需要一次退出两层，通常用一个标志变量配合条件判断，而不要指望一个 break 解决所有问题。'
    },
    { type: 'heading', text: '七、单步看循环' },
    {
      type: 'text',
      body:
        '循环最难想象的是“执行到第几圈、变量现在是多少”。文字和流程图都有局限，单步执行可以直接把每一轮摊开给你看。'
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'trace',
        code: `#include <stdio.h>

int main(void) {
  int fuel = 3;
  while (fuel > 0) {
    printf("燃料 %d\\n", fuel);
    fuel--;
  }
  printf("着陆\\n");
  return 0;
}
`
      },
      title: '单步执行：一圈一圈看清 fuel 的变化',
      caption: '每走一轮，fuel 减一；条件变成假时，执行路线离开循环，走向最后的输出。'
    },
    {
      type: 'text',
      body:
        '播放时留意三个信号：当前执行到哪一行、条件判断的结果、变量表里 fuel 的值。把这三者对应起来，任何循环都不再是黑盒。也可以试着把循环体删掉一行，观察结果怎么变。'
    },
    { type: 'heading', text: '八、小结' },
    {
      type: 'text',
      body:
        '循环把重复的工作交给机器，把设计循环的思考留给人。这一节记住四件事：循环三要素（初值、条件、更新）缺一不可；`for` 适合次数已知，`while` 适合由条件驱动；`do-while` 保证至少执行一次；`break` 退出整个循环，`continue` 只跳过本轮。\n\n' +
        '到这里，C 语言入门最核心的三块内容——顺序、选择、循环——已经齐全。下一章将进入数组与字符串，开始组织一批数据，而不是单个变量。'
    },
    {
      type: 'try',
      language: 'c',
      prompt:
        '把 sum.c 改成只累加偶数（提示：如果 i 是奇数就 continue），再把上限从 100 改成 50 看看结果。然后用 for 循环输出 1 到 20 中所有能被 3 整除的数，试着用取余配合条件判断。',
      code: `#include <stdio.h>

int main(void) {
  int sum = 0;

  for (int i = 1; i <= 100; i++) {
    if (i % 2 != 0) {
      continue;
    }
    sum += i;
  }

  printf("1 到 100 中所有偶数的和是 %d\\n", sum);
  return 0;
}
`
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
    {
      mistake: "循环变量从不改变，变成死循环",
      wrong: "while (i < 10) { sum += i; }",
      right: "while (i < 10) { sum += i; i++; }",
      why: "循环体里必须让条件最终变假，否则程序卡住（在实验室里会触发步数上限）。"
    },
    {
      mistake: "累加器没有清零",
      wrong: "int sum;  // 随机初值\nfor (...) sum += i;",
      right: "int sum = 0;\nfor (...) sum += i;",
      why: "局部变量不初始化是随机值，累加、计数、求最大值之前都要给初值。"
    },
    {
      mistake: "遍历 n 个元素却写成 i <= n",
      wrong: "for (i = 0; i <= n; i++) a[i];",
      right: "for (i = 0; i < n; i++) a[i];",
      why: "合法下标是 0..n-1，<= n 会多访问一格，越界写坏别的变量。"
    }
      ]
    },
  ],
  keyPoints: [
    '循环三要素：初值、继续条件、每轮更新；缺少更新就会死循环。',
    '`while` 先判断再执行，可能一次都不执行；`do-while` 先执行再判断，至少执行一次。',
    '`for` 把三要素集中在括号里，适合次数已知的循环。',
    '嵌套循环中，外层每走一步，内层都要完整跑一轮。',
    '`break` 结束整个循环，`continue` 只跳过本轮剩余语句。'
  ],
  quiz: [
    {
      id: 'c05-q1',
      question: '`for (int i = 1; i <= 100; i++)` 这段循环的循环体一共执行多少次？',
      options: ['100 次', '99 次', '101 次', '1 次'],
      answer: 0,
      explanation:
        'i 从 1 开始，每次加一，条件是 `i <= 100`。i 依次取 1 到 100，共 100 个取值，因此循环体执行 100 次。'
    },
    {
      id: 'c05-q2',
      question: '`while (i > 0) { printf("%d", i); }` 中漏写了 `i--`，会发生什么？',
      options: [
        '陷入死循环，不断输出同一个数',
        '循环体一次都不执行',
        '自动把 i 减到 0',
        '编译器直接报错'
      ],
      answer: 0,
      explanation:
        '循环体没有改变 i，条件 `i > 0` 永远成立，程序会一直重复输出。遇到循环卡死，先检查循环变量有没有更新。'
    },
    {
      id: 'c05-q3',
      question: '`do-while` 与 `while` 最主要的区别是什么？',
      options: [
        '`do-while` 的循环体至少执行一次',
        '`do-while` 不能嵌套',
        '`while` 的循环体至少执行一次',
        '`do-while` 只能用于计数'
      ],
      answer: 0,
      explanation:
        '`do-while` 先执行循环体再判断条件，即使条件一开始为假，循环体也会执行一次；`while` 先判断，条件为假时一次都不执行。'
    },
    {
      id: 'c05-q4',
      question: '在循环体里执行 `break;` 和 `continue;` 的区别是？',
      options: [
        '`break` 结束整个循环，`continue` 只跳过本轮剩余语句',
        '`break` 只跳过本轮，`continue` 结束整个循环',
        '两者都会重新开始循环',
        '两者都只能用于 for 循环'
      ],
      answer: 0,
      explanation:
        '`break` 立即跳出当前这一层循环；`continue` 不跳出循环，只是不再执行本轮剩下的语句，直接进入下一轮的条件判断。'
    }
  ],
  labSampleId: 'sum-1-to-100'
};

export default lesson;
