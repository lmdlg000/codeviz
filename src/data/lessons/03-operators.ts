import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c03-operators',
  chapterId: 'c-basics',
  order: 3,
  title: '运算符与表达式：让数据动起来',
  subtitle: '加减乘除、取余、自增与优先级——把变量拼成能算出结果的式子。',
  description:
    '掌握算术、赋值、自增与比较运算符，理解整数除法、取余和优先级，把零散的数据组合成能算出结果的表达式。',
  difficulty: 2,
  minutes: 30,
  objectives: [
    '用算术运算符组成表达式，并说清结果的类型是怎么来的',
    '解释整数除法为什么会丢掉小数，并用取余完成分秒换算',
    '正确使用复合赋值与 `++`、`--`，分清前缀和后缀的区别',
    '依据优先级与括号控制计算顺序，不靠猜测读表达式',
    '用强制类型转换让两个整数的除法保留小数部分'
  ],
  blocks: [
    {
      type: 'text',
      body:
        '有了能装数据的变量，接下来要做的是让数据动起来。程序里几乎每一个有意义的动作，最后都落在一个表达式上：算总价、求平均值、判断余数、把计数器加一。\n\n' +
        '表达式由操作数和运算符组成。操作数可以是字面量（如 `3`、`2.5`），也可以是变量；运算符告诉我们“对这些数做什么”。同一个表达式里出现多个运算符时，谁先谁后由优先级决定——这是本节最需要建立的感觉。'
    },
    { type: 'heading', text: '一、算术运算符' },
    {
      type: 'text',
      body:
        'C 语言提供五个基本算术运算符。前四个你早就熟悉，最后一个取余需要新认识一下。'
    },
    {
      type: 'table',
      headers: ['运算符', '名称', '例子', '结果'],
      rows: [
        ['`+`', '加', '`7 + 3`', '`10`'],
        ['`-`', '减', '`7 - 3`', '`4`'],
        ['`*`', '乘', '`7 * 3`', '`21`'],
        ['`/`', '除', '`7 / 3`', '`2`（整数相除）'],
        ['`%`', '取余', '`7 % 3`', '`1`']
      ]
    },
    {
      type: 'code',
      language: 'c',
      title: 'arithmetic.c',
      code: `#include <stdio.h>

int main(void) {
  int a = 17;
  int b = 5;

  printf("%d + %d = %d\\n", a, b, a + b);
  printf("%d - %d = %d\\n", a, b, a - b);
  printf("%d * %d = %d\\n", a, b, a * b);
  printf("%d / %d = %d\\n", a, b, a / b);
  printf("%d %% %d = %d\\n", a, b, a % b);
  return 0;
}
`,
      caption: '注意最后一行：格式串里想输出 `%` 本身，必须写成 `%%`。',
      highlights: [10, 11]
    },
    {
      type: 'note',
      tone: 'warn',
      title: '整数除法会“砍掉”小数',
      body:
        '当 `/` 两边都是整数时，C 执行的是整数除法，结果只保留整数部分：`17 / 5` 得到 3，不是 3.4，也不是四舍五入。想让结果带小数，至少要让其中一个操作数是 `double`，例如 `17.0 / 5`。'
    },
    {
      type: 'text',
      body:
        '下面左右两段程序做的是同一道除法，但参与运算的类型不同，结果完全不同。这是初学者最容易踩的坑之一：明明写了 `a / b`，输出却“少了一截”。'
    },
    {
      type: 'compare',
      left: {
        title: 'int-division.c',
        language: 'c',
        code: `#include <stdio.h>

int main(void) {
  int a = 17;
  int b = 5;
  printf("%d / %d = %d\\n", a, b, a / b);
  return 0;
}
`
      },
      right: {
        title: 'double-division.c',
        language: 'c',
        code: `#include <stdio.h>

int main(void) {
  double a = 17.0;
  double b = 5.0;
  printf("%.1f / %.1f = %.2f\\n", a, b, a / b);
  return 0;
}
`
      },
      caption: '同样的数字，换成 double 后结果保留小数；整数相除只会留下整数部分。'
    },
    { type: 'heading', text: '二、取余：除法剩下的那一截' },
    {
      type: 'text',
      body:
        '取余运算符 `%` 计算“除完之后还剩多少”。`17 % 5` 等于 2，因为 17 里能装下 3 个 5，还剩 2。它有两个非常实用的场景：判断整除关系，以及把一个大单位拆成小单位。\n\n' +
        '下面的程序把 3672 秒拆成小时、分钟和秒。先整除得到小时数，再用取余拿到剩下的秒，继续拆分。这段代码几乎每一个“时间换算”需求里都能见到。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'time_split.c',
      code: `#include <stdio.h>

int main(void) {
  int totalSeconds = 3672;
  int hours = totalSeconds / 3600;
  int minutes = totalSeconds % 3600 / 60;
  int seconds = totalSeconds % 60;

  printf("%d 秒 = %d 时 %d 分 %d 秒\\n", totalSeconds, hours, minutes, seconds);
  return 0;
}
`,
      caption: '`%` 与 `/` 的优先级相同，从左到右计算，所以 `totalSeconds % 3600 / 60` 先取余再除。',
      highlights: [5, 6, 7]
    },
    {
      type: 'text',
      body:
        '还有一个小规律：`x % 2` 的结果不是 0 就是 1，正好可以用来判断奇偶；`x % 10` 可以取出一个整数的个位数字。取余只对整数有意义，对 `double` 使用 `%` 会直接编译失败。'
    },
    { type: 'heading', text: '三、赋值与复合赋值' },
    {
      type: 'text',
      body:
        '赋值运算符 `=` 把右边的值放进左边的变量。它本身也是一个表达式，会“返回”被赋的值，因此可以连着写。为了少写一点重复，C 还提供了复合赋值：`+=`、`-=`、`*=`、`/=`、`%=`。\n\n' +
        '`score += 10;` 等价于 `score = score + 10;`。别小看这点缩写，当变量名很长或表达式很复杂时，它能明显降低抄错的概率。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'score.c',
      code: `#include <stdio.h>

int main(void) {
  int score = 60;

  score += 10;
  score -= 5;
  score *= 2;
  score /= 5;

  printf("最终得分 %d\\n", score);
  return 0;
}
`,
      caption: '每一步都在上一步的结果上继续算：60 → 70 → 65 → 130 → 26。',
      highlights: [6, 7, 8, 9]
    },
    {
      type: 'note',
      tone: 'info',
      title: '复合赋值不是“新语法”',
      body:
        '`score += 10` 只是 `score = score + 10` 的简写，运算顺序完全一样：先取 score 的旧值参与计算，再把结果放回 score。理解这一点，就不会把它误当成“给 10 加个 score”之类的奇怪操作。'
    },
    { type: 'heading', text: '四、自增与自减' },
    {
      type: 'text',
      body:
        '让变量加一、减一是如此常见的操作，以至于 C 专门提供了 `++` 和 `--`。`i++` 与 `++i` 都会让 i 增加 1，区别在于表达式本身返回的值：后缀 `i++` 先返回旧值再增加，前缀 `++i` 先增加再返回新值。\n\n' +
        '如果只是单独写一行 `i++;`，两者没有区别。但当它出现在赋值或输出语句中时，差异就显现出来了。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'increment.c',
      code: `#include <stdio.h>

int main(void) {
  int i = 5;
  int a = i++;
  int b = ++i;

  printf("i = %d, a = %d, b = %d\\n", i, a, b);
  return 0;
}
`,
      caption: 'a 拿到的是自增前的旧值 5；b 拿到的是自增后的新值 7。',
      highlights: [5, 6]
    },
    {
      type: 'text',
      body:
        '很多风格指南会建议：不要在一个表达式里同时使用自增和别的运算，因为可读性会迅速下降。把 `tickets++;` 单独写一行，老师、同事和三个月后的你都会感谢你。'
    },
    { type: 'heading', text: '五、优先级与括号' },
    {
      type: 'text',
      body:
        '表达式里有多个运算符时，C 按优先级决定先算谁：乘除取余高于加减，加减高于关系比较，关系比较高于逻辑运算，赋值排在很后面。同一优先级则结合方向决定顺序。\n\n' +
        '记不住整张优先级表也没关系，有一条更实用的规则：**不确定就加括号**。括号能让阅读者一眼看出你的意图，也不会因为记错规则而算错。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'precedence.c',
      code: `#include <stdio.h>

int main(void) {
  int a = 2 + 3 * 4;
  int b = (2 + 3) * 4;
  double c = 9.0 / 2.0;

  printf("a = %d, b = %d, c = %.1f\\n", a, b, c);
  return 0;
}
`,
      caption: '先乘除后加减：a 是 14；括号改变了顺序：b 是 20。',
      highlights: [4, 5]
    },
    { type: 'heading', text: '六、类型转换' },
    {
      type: 'text',
      body:
        '当表达式中混有整数和小数时，C 会把整数自动转换成小数再计算，这叫隐式转换。方向一般是“往能表示更大范围的类型靠”，但反过来把小数赋给整数时，小数部分会被直接截掉，而不是四舍五入。\n\n' +
        '如果你想让两个整数做小数除法，可以显式地写 `(double)` 做强制转换。它只是把这一次的值临时变成 double，不会改变变量本身。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'rate.c',
      code: `#include <stdio.h>

int main(void) {
  int passed = 17;
  int total = 20;
  double rate = passed * 100.0 / total;

  printf("通过率 %.1f%%\\n", rate);
  printf("直接用整数除：%d\\n", passed / total);
  return 0;
}
`,
      caption: '`100.0` 把整个式子带进小数运算；如果想更明确，可以写 `(double)passed / total`。',
      highlights: [6]
    },
    {
      type: 'note',
      tone: 'tip',
      title: '让类型在表达式里保持一致',
      body:
        '算钱、算比例、算平均分时，把参与运算的数写成小数（如 `100.0`），比事后补救更稳。反过来，如果确实需要整数结果，就别在中途引入小数，否则会在赋值回 int 时被截断。'
    },
    { type: 'heading', text: '七、图解：表达式怎么走' },
    {
      type: 'text',
      body:
        '温度换算是表达式运算的经典例子。下面这段程序先把摄氏度乘以 9，除以 5，再加 32，最后把结果交给 `printf` 输出。\n\n' +
        '流程图会把这段代码画成一串处理节点。借助图，你可以清楚地看到：表达式不是“一眼算完”，而是按顺序一步步求值，每一步的结果都进入下一个节点。'
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'flow',
        functionName: 'main',
        code: `#include <stdio.h>

int main(void) {
  double celsius = 26.0;
  double fahrenheit = celsius * 9.0 / 5.0 + 32.0;
  double back = (fahrenheit - 32.0) * 5.0 / 9.0;

  printf("摄氏度: %.1f\\n", celsius);
  printf("华氏度: %.1f\\n", fahrenheit);
  printf("换算回摄氏度: %.1f\\n", back);
  return 0;
}
`
      },
      title: '表达式被拆成处理节点的先后顺序',
      caption: '先算摄氏度到华氏度，再算回摄氏度，最后依次输出三个结果。'
    },
    {
      type: 'text',
      body:
        '读图时留意 `celsius * 9.0 / 5.0 + 32.0` 这一串：乘除从左到右，最后才加 32。如果写成 `celsius * 9.0 / (5.0 + 32.0)`，结果就会大错特错。这也是为什么我们在复杂表达式里宁可多写一对括号。'
    },
    { type: 'heading', text: '八、单步看自增' },
    {
      type: 'text',
      body:
        '自增的前后缀差异，用文字解释容易绕晕，放进单步执行里却一目了然。下面这段代码在第 5 行和第 6 行各用了一次 `++`，但顺序不同。'
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'trace',
        code: `#include <stdio.h>

int main(void) {
  int i = 5;
  int a = i++;
  int b = ++i;
  printf("i = %d, a = %d, b = %d\\n", i, a, b);
  return 0;
}
`
      },
      title: '单步执行：后缀先取值，前缀先加一',
      caption: '观察 i 从 5 到 6 再到 7，以及 a、b 分别被放进什么值。'
    },
    {
      type: 'text',
      body:
        '走完这几步，再回头读一遍那句口诀：后缀“先取后用”，前缀“先加后用”。如果你能预测出输出是 i 为 7、a 为 5、b 为 7，说明这一节最关键的一个细节已经掌握了。'
    },
    { type: 'heading', text: '九、小结' },
    {
      type: 'text',
      body:
        '运算符是程序的动词。这一节我们学了算术、取余、复合赋值、自增自减，也接触了优先级和类型转换。最值得带走的三条经验是：整数除法和取余要提前想清楚类型；不确定优先级就加括号；不要在一个表达式里塞太多动作。\n\n' +
        '到目前为止，程序还只会沿着一条直线走。下一节我们要给程序装上“岔路口”：根据条件选择不同的路。'
    },
    {
      type: 'try',
      language: 'c',
      prompt:
        '把摄氏温度改成 37.0，观察华氏度的结果；再加一行输出开尔文温度（摄氏度加 273.15，保留两位小数）。试着用两种写法完成，一种用 `100.0` 这样的小数常量，一种用强制类型转换。',
      code: `#include <stdio.h>

int main(void) {
  double celsius = 37.0;
  double fahrenheit = celsius * 9.0 / 5.0 + 32.0;
  double kelvin = celsius + 273.15;
  printf("摄氏度 %.1f，华氏度 %.1f，开尔文 %.2f\\n", celsius, fahrenheit, kelvin);
  return 0;
}
`
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
    {
      mistake: "在条件里把 == 写成 =",
      wrong: "if (x = 0) { ... }",
      right: "if (x == 0) { ... }",
      why: "赋值表达式的值是赋进去的数，x = 0 永远是假，x = 1 永远是真，而且会把 x 改掉。"
    },
    {
      mistake: "同一个表达式里对同一变量多次自增",
      wrong: "int i = 1; int r = i++ + i++;",
      right: "int r = i + (i + 1); i += 2;",
      why: "未定义行为：编译器可以先取两次 1 再自增，也可以先自增，结果随编译器变化。"
    },
    {
      mistake: "混淆 % 与 / 的用途",
      wrong: "int last = n / 10;   // 想取个位",
      right: "int last = n % 10;",
      why: "/ 是商，% 是余数。取个位、判断奇偶、循环取每一位都要用 %。"
    }
      ]
    },
  ],
  keyPoints: [
    '算术运算符 `+ - * / %` 中，整数相除只保留整数部分，`%` 取余只用于整数。',
    '`i++` 先取旧值再自增，`++i` 先自增再取新值；单独成句时两者效果相同。',
    '复合赋值 `+=`、`-=` 等只是 `x = x op y` 的简写，运算顺序不变。',
    '优先级记不住就加括号；括号既保证正确，也让代码更容易读。',
    '整数与小数混合运算会自动转换类型，必要时用 `(double)` 明确表达意图。'
  ],
  quiz: [
    {
      id: 'c03-q1',
      question: '在 C 语言中，表达式 `17 / 5` 的结果是多少？',
      options: ['3', '3.4', '4', '2'],
      answer: 0,
      explanation:
        '`17` 和 `5` 都是整数，执行的是整数除法，只保留整数部分，因此结果是 3。若写成 `17.0 / 5`，结果才是 3.4。'
    },
    {
      id: 'c03-q2',
      question: '`17 % 5` 的值是多少？',
      options: ['2', '3', '3.4', '0'],
      answer: 0,
      explanation:
        '取余计算的是除完之后剩下的部分：17 除以 5 商 3 余 2，所以 `17 % 5` 等于 2。'
    },
    {
      id: 'c03-q3',
      question: '执行 `int i = 3; int a = i++;` 之后，a 和 i 分别是多少？',
      options: ['a 是 3，i 是 4', 'a 是 4，i 是 4', 'a 是 3，i 是 3', 'a 是 4，i 是 3'],
      answer: 0,
      explanation:
        '后缀 `i++` 先取出 i 的旧值 3 赋给 a，然后把 i 增加到 4。因此 a 是 3、i 是 4。若写成 `++i`，则 a 和 i 都是 4。'
    },
    {
      id: 'c03-q4',
      question: '表达式 `2 + 3 * 4` 的结果是多少？',
      options: ['14', '20', '24', '9'],
      answer: 0,
      explanation:
        '乘法优先级高于加法，所以先算 `3 * 4` 得到 12，再加 2，结果是 14。想得到 20，需要写成 `(2 + 3) * 4`。'
    }
  ],
  labSampleId: 'temp-convert'
};

export default lesson;
