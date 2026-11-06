import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c02-data',
  chapterId: 'c-basics',
  order: 2,
  title: '数据与变量：给内存贴标签',
  subtitle: '用 int、double、char 装下数字与文字，再用 printf 把它们的值读出来。',
  description:
    '认识变量与常见数据类型，学会用格式说明符输出整数、小数和字符，并从内存图里看清每个变量占多少空间。',
  difficulty: 1,
  minutes: 28,
  objectives: [
    '用自己的话说清变量是什么：有名字、有类型、能变化的内存格子',
    '按场合选择 `int`、`double`、`char`，不给数据选错“容器”',
    '用 `%d`、`%.2f`、`%c` 等格式说明符正确输出不同类型的值',
    '读懂内存图，知道变量名、类型、值与字节数之间的关系'
  ],
  blocks: [
    {
      type: 'text',
      body:
        '上一节的程序只会打印固定文字，像一个只会背台词的演员。真正有用的程序要能处理数据：记下价格、算出总价、判断是否及格。\n\n' +
        '数据得先有地方放。内存就像一整面储物柜，每个小格子都能放一点东西。变量就是给其中某个格子贴上名字，并约定这个格子只能放什么类型的东西。名字方便你找到它，类型决定它能装多少、怎么解释里面的内容。\n\n' +
        '这一节我们从“贴标签”开始，把整数、小数、字符分别装进合适的格子里。'
    },
    { type: 'heading', text: '一、变量：给内存格子贴标签' },
    {
      type: 'text',
      body:
        '看下面这段程序。第 4 行声明了一个叫 `apples` 的变量，类型是 `int`，并放入初始值 5。第 5 行又声明了 `pears`。第 6 行做了一个加法，把结果放进新变量 `total`。\n\n' +
        '一条变量声明语句通常由三部分组成：类型（能装什么）、名字（怎么找到它）、初始值（一开始装什么）。初始值可以省略，但省略后格子里的内容是未知的，所以初学阶段建议总是给它一个明确的起点。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'fruit.c',
      code: `#include <stdio.h>

int main(void) {
  int apples = 5;
  int pears = 3;
  int total = apples + pears;
  printf("苹果 %d 个，梨 %d 个，共 %d 个\\n", apples, pears, total);
  return 0;
}
`,
      caption: '三个 `%d` 会依次被 apples、pears、total 的值替换。',
      highlights: [6]
    },
    {
      type: 'note',
      tone: 'info',
      title: '变量名是给人和编译器看的',
      body:
        '变量名由字母、数字和下划线组成，不能以数字开头，区分大小写，也不能是 `int`、`return` 这类关键字。`appleCount` 与 `apple_count` 都是好名字，`a1`、`x` 在稍长的程序里很快就让人看不懂。'
    },
    { type: 'heading', text: '二、三种最常用的类型' },
    {
      type: 'text',
      body:
        'C 语言内置了不少类型，初学阶段先牢牢掌握三个：装整数的 `int`、装小数的 `double`、装单个字符的 `char`。它们的大小与用途见下表。'
    },
    {
      type: 'table',
      headers: ['类型', '用来装什么', '例子', '常见字节数'],
      rows: [
        ['`int`', '不带小数点的整数', '`42`、`-7`、`2026`', '4 字节'],
        ['`double`', '带小数点的数', '`3.14`、`-0.5`、`2.0`', '8 字节'],
        ['`char`', '单个字符', "`'A'`、`'9'`、`'?'`", '1 字节'],
        ['`float`', '单精度小数，精度低于 double', '`1.5f`', '4 字节']
      ]
    },
    {
      type: 'text',
      body:
        '为什么要分这么细？因为整数和小数在内存里的存储方式完全不同，能做运算也不同。`int` 适合计数、编号、年份；`double` 适合价格、身高、温度这类有小数部分的量；`char` 适合单个字母或符号。给数据选错容器，轻则输出格式不对，重则算出莫名其妙的结果。\n\n' +
        '下面是三种类型各用一次的小程序。注意 `grade` 里放的是字符 `A`，用单引号包起来；`average` 里放的是小数，计算时参与的是浮点运算。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'types.c',
      code: `#include <stdio.h>

int main(void) {
  char grade = 'A';
  int score = 92;
  double average = 88.5;

  printf("等级 %c，分数 %d，平均分 %.1f\\n", grade, score, average);
  return 0;
}
`,
      caption: '字符用 `%c`，整数用 `%d`，小数用 `%.1f`。',
      highlights: [4, 5, 6]
    },
    {
      type: 'note',
      tone: 'warn',
      title: '单引号和双引号不是一回事',
      body:
        "`'A'` 是一个字符，用单引号，占 1 字节；`\"A\"` 是一个字符串，用双引号，末尾还藏着一个结束标记。用 `%c` 输出字符，用 `%s` 输出字符串。把两者混着写，编译器经常只给一句含糊的警告，运行时却输出奇怪的东西。"
    },
    { type: 'heading', text: '三、赋值：等号是“放进去”' },
    {
      type: 'text',
      body:
        '数学课上，等号表示左右两边相等；在 C 语言里，等号是赋值运算符，意思是“先算右边，再把结果放进左边”。所以 `coins = coins + 5;` 完全合理：取出 coins 原来的值，加上 5，再存回同一个格子。\n\n' +
        '也正因为如此，`=` 和 `==` 必须严格区分。一个是“放进去”，一个是“比一比”，后面讲选择结构时会反复用到后者。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'coins.c',
      code: `#include <stdio.h>

int main(void) {
  int coins = 10;
  coins = coins + 5;
  coins = coins * 2;
  printf("现在有 %d 枚金币\\n", coins);
  return 0;
}
`,
      caption: '变量之所以叫“变”量，就是因为它的值可以被重新赋值。',
      highlights: [5, 6]
    },
    {
      type: 'text',
      body:
        '赋值语句按书写顺序执行。如果把第 5 行和第 6 行互换，先乘 2 再加 5，最后就是 25 而不是 30，结果确实不同。程序不是一眼看完全局的数学证明，它是一步一步往前走的。'
    },
    { type: 'heading', text: '四、printf 与格式说明符' },
    {
      type: 'text',
      body:
        '`printf` 的第一个参数叫格式串，里面的 `%` 开头的部分叫格式说明符，它们是占位符，会被后面参数的值依次填进去。常见的几个先记住：'
    },
    {
      type: 'list',
      items: [
        '`%d`：输出十进制整数；`%5d` 表示至少占 5 格、右对齐。',
        '`%f`：输出小数，默认保留 6 位；`%.2f` 表示保留 2 位小数，最常用。',
        '`%c`：输出单个字符；`%s`：输出字符串。',
        '`%%`：输出一个百分号本身，不消耗参数。'
      ]
    },
    {
      type: 'code',
      language: 'c',
      title: 'format.c',
      code: `#include <stdio.h>

int main(void) {
  int count = 3;
  double price = 4.5;
  char tag = 'A';

  printf("数量 %d，单价 %.2f，标签 %c\\n", count, price, tag);
  printf("总价约 %.1f 元，折扣 10%%\\n", count * price);
  return 0;
}
`,
      caption: '格式串里的占位符个数、顺序、类型要与后面的参数一一对应。'
    },
    {
      type: 'note',
      tone: 'warn',
      title: '类型和格式必须配对',
      body:
        '用 `%d` 输出 `double`，或把 `int` 交给 `%f`，编译器可能只给一句警告，运行结果却完全对不上。记住最常用的配对：`int` 配 `%d`，`double` 配 `%.2f`，`char` 配 `%c`。输出前先问自己：这个变量到底是什么类型？'
    },
    { type: 'heading', text: '五、变量在内存里的样子' },
    {
      type: 'text',
      body:
        '把变量画出来，比背诵定义更容易记住。下面的内存图里，`main` 的栈帧中并排摆着几个格子：`count` 是 int，占 4 字节；`price` 是 double，占 8 字节；`tag` 是 char，只占 1 字节。\n\n' +
        '图上的地址是为了教学虚构的示意值，不是真实运行时的地址。真正重要的是这个观察：类型不同，格子大小不同；变量名贴在格子上，值写在格子里。'
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'memory',
        code: `#include <stdio.h>

int main(void) {
  int count = 3;
  double price = 4.5;
  char tag = 'A';
  double total = count * price;
  printf("%d 件，单价 %.1f，合计 %.1f，标签 %c\\n", count, price, total, tag);
  return 0;
}
`
      },
      title: '内存图：每个变量都有自己的格子',
      caption: '栈帧按函数划分；int 占 4 字节、double 占 8 字节、char 占 1 字节。'
    },
    {
      type: 'text',
      body:
        '同一个函数里的局部变量，通常按声明顺序出现在栈帧中。数组会拆成一排连续的小格，指针会画出一支指向目标的箭头——这些后面都会遇到。现在先建立一个直觉：程序运行时，数据真的住在内存里，而变量是我们访问这些住所的门牌号。'
    },
    { type: 'heading', text: '六、示例：计算圆的面积' },
    {
      type: 'text',
      body:
        '把这一节的知识合起来，就是下面这个程序：用 `const double` 定义不会变的圆周率，用 `double` 存半径，用表达式算出面积与周长，最后按不同精度输出。'
    },
    {
      type: 'code',
      language: 'c',
      title: 'circle.c',
      code: `#include <stdio.h>

int main(void) {
  const double PI = 3.1415926;
  double radius = 3.0;
  double area = PI * radius * radius;
  double perimeter = 2.0 * PI * radius;

  printf("半径: %.1f\\n", radius);
  printf("面积: %.2f\\n", area);
  printf("周长: %.2f\\n", perimeter);
  return 0;
}
`,
      caption: '`const` 表示这个变量的值在初始化后不能再修改，适合存放常量。',
      highlights: [4, 6, 7]
    },
    {
      type: 'text',
      body:
        '这里的 `2.0` 而不是 `2` 并不会改变计算结果——`2 * PI` 同样会按 double 计算，因为 int 会自动转换；写成 `2.0` 只是把“这是浮点运算”的意图表达得更明确。真正会丢精度的是把小数结果赋给 int，例如 `int half = 5 / 2.0;` 得到的是 2，而不是 2.5。'
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'trace',
        code: `#include <stdio.h>

int main(void) {
  int count = 3;
  double price = 4.5;
  double total = count * price;
  total = total + 1.5;
  printf("应付 %.2f 元\\n", total);
  return 0;
}
`
      },
      title: '单步执行：整数也会参与小数运算',
      caption: '`count * price` 中，count 会先转成 double 再相乘；随后 total 被重新赋值。'
    },
    {
      type: 'text',
      body:
        '在播放器里一步步前进，你会看到 total 先变成 13.5，再变成 15。整数与 double 相乘时，C 会自动把整数转换成 double，这叫隐式类型转换。方向通常是“往精度更高的类型靠”，但把 double 赋给 int 时小数部分会被截掉，这一点要特别小心。'
    },
    { type: 'heading', text: '七、小结' },
    {
      type: 'text',
      body:
        '这一节的核心只有一句话：变量是内存中一块有名字、有类型的空间，赋值就是把值放进去。围绕这句话，我们认识了 int、double、char 三种容器，学会了用格式说明符把值打印出来，也在内存图里看到了每个变量占几字节。\n\n' +
        '有了数据，下一步就该让数据动起来。下一节进入运算符与表达式，看看加减乘除、取余和自增如何组合成能算出结果的式子。'
    },
    {
      type: 'try',
      language: 'c',
      prompt:
        '把半径改成 5.0，把输出精度改成保留三位小数，再增加一行输出直径。运行后去内存图里找找，多出来的变量住在哪个格子里。',
      code: `#include <stdio.h>

int main(void) {
  const double PI = 3.1415926;
  double radius = 5.0;
  double area = PI * radius * radius;
  printf("半径 %.3f 的圆面积是 %.3f\\n", radius, area);
  return 0;
}
`
    }
  ],
  keyPoints: [
    '变量是内存中一块有名字、有类型的存储空间，声明时最好同时给出初始值。',
    '`int` 装整数、`double` 装小数、`char` 装单个字符，选类型要看数据本身。',
    '等号是赋值：先算右边，再把结果放进左边；它不等于数学上的“相等”。',
    '格式说明符必须与参数类型配对：`%d` 配 int，`%.2f` 配 double，`%c` 配 char。',
    '内存图里类型决定格子大小，地址只是教学示意，不是真实运行地址。'
  ],
  quiz: [
    {
      id: 'c02-q1',
      question: '要保存商品价格 19.9 元，最合适的类型是？',
      options: ['`double`', '`int`', '`char`', '`void`'],
      answer: 0,
      explanation:
        '19.9 带小数，用 `double` 保存才不会丢掉小数部分。`int` 只能存整数，`char` 只能存单个字符，`void` 表示“没有类型”，不能用来声明普通变量。'
    },
    {
      id: 'c02-q2',
      question: '已知 `double price = 4.5;`，想输出 `4.50`，应该用哪个格式说明符？',
      options: ['`%.2f`', '`%d`', '`%c`', '`%s`'],
      answer: 0,
      explanation:
        '`%f` 用于输出小数，`%.2f` 表示保留两位小数，因此输出 4.50。`%d` 用于整数，`%c` 用于字符，`%s` 用于字符串。'
    },
    {
      id: 'c02-q3',
      question: '`int a = 7; a = a + 2;` 执行后，a 的值是多少？',
      options: ['9', '7', '2', '程序会报错'],
      answer: 0,
      explanation:
        '赋值语句先计算右边的 `a + 2`，得到 9，再把它放回 a 这个格子，于是 a 变成 9。原来的 7 被覆盖。'
    },
    {
      id: 'c02-q4',
      question: '下面关于变量 `char tag = \'A\';` 的说法，哪一项正确？',
      options: [
        '`tag` 里放的是一个字符，可以用 `%c` 输出',
        '`tag` 里放的是一段字符串，必须用 `%s` 输出',
        '`tag` 占 8 个字节，和 double 一样大',
        "`tag` 不能保存字母，只能保存数字"
      ],
      answer: 0,
      explanation:
        "`char` 用来保存单个字符，例如 `'A'`，通常占 1 字节，用 `%c` 输出。双引号包起来的是字符串，不是字符。"
    }
  ],
  labSampleId: 'circle-area'
};

export default lesson;
