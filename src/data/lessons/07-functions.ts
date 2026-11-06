import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c07-functions',
  chapterId: 'c-data',
  order: 2,
  title: '函数与递归：分而治之',
  subtitle: '把重复的逻辑装进函数，用调用栈读懂递归',
  description:
    '学会定义和调用函数，理解参数、返回值与作用域，再从阶乘出发看懂递归与调用栈。',
  difficulty: 2,
  minutes: 25,
  objectives: [
    '按“返回类型、函数名、参数、函数体”写出一个完整的函数',
    '解释实参与形参的区别，说明为什么按值传递改不了外面的变量',
    '读懂函数声明的作用，知道什么时候必须先声明',
    '写出带终止条件的递归函数，并借助调用栈解释它的执行过程',
  ],
  blocks: [
    {
      type: 'text',
      body: '写程序时你会发现，求最大值、算平均分、打印一张表这类操作会反复出现。如果每次遇到都复制一遍代码，改起来既麻烦又容易漏掉某处。函数（function）就是为此准备的：把一段逻辑起个名字、装进盒子里，需要时“调用”它。这一课先学会定义和使用函数，再挑战更绕的情况——函数调用自己，也就是递归。',
    },
    { type: 'heading', text: '一、函数：给一段逻辑起名字' },
    {
      type: 'text',
      body: '函数的基本格式是：返回类型、函数名、括号里的参数列表，再用花括号包住函数体。例如 `int max2(int a, int b)` 表示它接收两个整数，返回一个整数。函数定义好之后并不会自动执行，要等别处调用它。`main` 本身也是一个函数，程序从它开始运行。参数列表里每个参数都要写类型和名字，多个参数之间用逗号隔开。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'max2.c',
      caption: 'max2 封装了“比较两个数”的逻辑，main 只负责准备数据。',
      code: `#include <stdio.h>

int max2(int a, int b) {
  if (a > b) {
    return a;
  }
  return b;
}

int main() {
  int x = 12;
  int y = 47;
  int bigger = max2(x, y);

  printf("%d 和 %d 中较大的是 %d\\n", x, y, bigger);
  return 0;
}
`,
    },
    {
      type: 'text',
      body: '调用 `max2(x, y)` 时，`x` 的值复制给形参 `a`，`y` 的值复制给形参 `b`。函数里的 `a`、`b` 是**另外两块**内存，只是初始值相同；在函数里改 `a`，外面的 `x` 不会跟着变。这种“按值传递”（pass by value）是理解函数边界的关键。下一课的指针会教我们怎样让函数真正改动外面的变量。',
    },
    {
      type: 'text',
      body: '函数还有一个容易被低估的好处：名字就是最简短的注释。`average`、`max2` 这样的名字直接说明了“做什么”，函数体负责“怎么做”。读程序时先看 `main` 调用了哪些函数，往往就能抓住整段代码的主线。',
    },
    { type: 'heading', text: '二、参数、返回值与函数声明' },
    {
      type: 'text',
      body: '`return` 做两件事：结束当前函数，并把结果交给调用者。函数有返回类型时，必须保证每条执行路径都返回一个值；`void` 函数不返回值，只负责完成动作。如果函数在 `main` 之后才定义，而 `main` 里要调用它，就需要在前面写一行函数声明（prototype），比如 `double average(int a, int b, int c);`，告诉编译器“这个函数存在，参数和返回值是这样的”。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'average.c',
      caption: '先声明、后定义；返回 double 时要让除法发生在浮点数上。',
      code: `#include <stdio.h>

double average(int a, int b, int c);

int main() {
  double avg = average(80, 92, 69);

  printf("平均分：%.1f\\n", avg);
  return 0;
}

double average(int a, int b, int c) {
  int sum = a + b + c;
  return (double)sum / 3;
}
`,
    },
    {
      type: 'text',
      body: '注意 `(double)sum / 3` 里的强制转换：如果写成 `sum / 3`，整数除法会把小数部分直接丢掉，平均分会变成 80 而不是 80.3。参数个数、顺序和类型要和声明保持一致，否则编译器会报错。返回值的类型也可以和表达式不同，编译器会按返回类型做转换，但最好一开始就把类型写对。',
    },
    {
      type: 'diagram',
      title: '调用图：main 身后的两条调用链',
      diagram: {
        kind: 'calls',
        code: `#include <stdio.h>

int max2(int a, int b) {
  if (a > b) {
    return a;
  }
  return b;
}

int max3(int a, int b, int c) {
  return max2(max2(a, b), c);
}

int factorial(int n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

int main() {
  int big = max3(12, 47, 35);
  int fact = factorial(4);

  printf("%d %d\\n", big, fact);
  return 0;
}
`,
      },
      caption:
        'main 调用 max3 与 factorial；max3 再调用 max2，而 factorial 有一条回到自己的递归边。',
    },
    { type: 'heading', text: '三、递归：函数调用自己' },
    {
      type: 'text',
      body: '递归（recursion）是指函数直接或间接地调用自身。听起来像绕圈子，但只要每次调用都把问题**变小**，并且有一个明确的**终止条件**，它就能像剥洋葱一样一层层解决。以阶乘为例：`4! = 4 × 3 × 2 × 1`，也可以写成 `4! = 4 × 3!`，而 `1! = 1`。后一句就是终止条件，前一句把 `n` 减小到 `n - 1`，问题规模不断缩小，最终一定会到达 1。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'factorial.c',
      caption: '终止条件 n <= 1 挡住继续递归，return 把各层结果一路乘回去。',
      code: `#include <stdio.h>

int factorial(int n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

int main() {
  printf("5! = %d\\n", factorial(5));
  return 0;
}
`,
    },
    {
      type: 'diagram',
      title: '单步执行：factorial(4) 的调用栈',
      diagram: {
        kind: 'trace',
        code: `#include <stdio.h>

int factorial(int n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

int main() {
  int result = factorial(4);

  printf("4! = %d\\n", result);
  return 0;
}
`,
      },
      caption: '播放时留意调用栈：每进入一层递归就多一帧，返回时再一帧一帧弹回。',
    },
    {
      type: 'text',
      body: '执行 `factorial(4)` 时，函数先停在 `return 4 * factorial(3)` 这一行，等 `factorial(3)` 的结果；`factorial(3)` 又去等 `factorial(2)`……这些还没返回的调用会一层层压在**调用栈**（call stack）上，直到 `factorial(1)` 返回 1，再逐层乘回去。调用栈是后进先出的，层数太深会耗尽栈空间，所以递归必须有终止条件，也不能无限展开。',
    },
    {
      type: 'text',
      body: '递归并不是唯一的选择。阶乘完全可以用一个循环从 1 乘到 n，既不占用额外的调用栈，也更容易一眼看懂。递归擅长表达本身就有层次的问题，例如树的遍历、分治排序；如果问题是一条直线，循环通常更直接。初学递归时可以先写三句话：什么时候停、每次把问题缩小到哪里、返回时怎样组合，再翻译成代码。',
    },
    { type: 'heading', text: '四、作用域：变量在哪里活着' },
    {
      type: 'text',
      body: '函数体是一个作用域（scope）。在函数里声明的变量只在这个函数里可见，`main` 看不到 `max2` 里的 `a`，反过来也一样。参数也是函数内的局部变量，函数返回后它们就销毁了。花括号 `{}` 里的变量在离开这对花括号时就销毁了；循环里声明的 `i` 出了循环也不能再用。全局变量虽然到处可见，但会让数据流向变得难以追踪，初学阶段优先用参数和返回值传递数据。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'square.c',
      caption: 'result 只活在 square 内部，main 通过返回值拿到结果。',
      code: `#include <stdio.h>

int square(int x) {
  int result = x * x;
  return result;
}

int main() {
  int a = 6;
  int b = square(a);

  printf("%d 的平方是 %d\\n", a, b);
  return 0;
}
`,
    },
    {
      type: 'note',
      tone: 'warn',
      title: '递归最常见的错误：忘了终止条件',
      body: '如果递归函数没有终止条件，或者调用时参数没有向终止条件靠近，它就会一直调用自己，直到把调用栈撑爆，程序崩溃。写递归前先回答两个问题：什么时候停下来？每次调用之后，问题比上一次小在哪里？',
    },
    {
      type: 'note',
      tone: 'tip',
      title: '形参是副本，不是原件',
      body: '在函数里修改形参，只影响函数内部。如果发现“函数里改了，外面没变”，先想想是不是这个原因。需要把结果带出去时，可以用 `return` 返回，或者把地址传进去（下一课的内容）。',
    },
    { type: 'heading', text: '小结' },
    {
      type: 'text',
      body: '函数由返回类型、函数名、参数列表和函数体组成，通过 `return` 把结果交回调用者。实参按值复制给形参，函数内部改形参不会影响调用者的变量。递归是函数调用自己，只要终止条件明确、问题规模每次都变小，它就能一层层把结果算出来。下一课我们把变量的“地址”交给函数，让函数真正有能力修改外面的数据。',
    },
    {
      type: 'try',
      language: 'c',
      code: `#include <stdio.h>

int sumTo(int n) {
  if (n <= 0) {
    return 0;
  }
  return n + sumTo(n - 1);
}

int main() {
  printf("1 + 2 + ... + 10 = %d\\n", sumTo(10));
  return 0;
}
`,
      prompt:
        '在实验室打开这段递归求和：单步执行时数一数调用栈最多有几层；再把终止条件改成 `n == 0`，想想 n 为负数时会发生什么。',
    },
  ],
  keyPoints: [
    '函数由返回类型、函数名、参数列表和函数体组成，用 return 交回结果。',
    '实参按值复制给形参，函数里改形参不会影响调用者的变量。',
    '先调用后定义时要写函数声明，让编译器提前知道参数与返回类型。',
    '递归必须有终止条件，并且每次调用都要缩小问题规模。',
    '调用栈后进先出，递归层数过深会耗尽栈空间。',
  ],
  quiz: [
    {
      id: 'c07-q1',
      question:
        '函数 `int f(int n) { if (n == 0) return 0; return n + f(n - 1); }` 被调用 `f(3)` 时返回多少？',
      options: ['3', '6', '10', '会无限递归'],
      answer: 1,
      explanation:
        '展开为 3 + f(2)，f(2) = 2 + f(1)，f(1) = 1 + f(0)，f(0) = 0，所以结果是 3 + 2 + 1 + 0 = 6。',
    },
    {
      id: 'c07-q2',
      question: '关于实参和形参的关系，下面哪种说法正确？',
      options: [
        '形参和实参是同一块内存，改形参就是改实参',
        '形参是实参的副本，函数内改形参不影响实参',
        '实参是形参的副本，函数内改实参不影响形参',
        '只要名字相同，它们就是同一个变量',
      ],
      answer: 1,
      explanation:
        'C 语言默认按值传递：调用时把实参的值复制给形参，两者占据不同的内存。想让函数修改实参，需要把地址传进去。',
    },
    {
      id: 'c07-q3',
      question: '一个递归函数必须具备下面哪个要素，才能避免无限调用？',
      options: ['至少一个循环', '一个全局变量', '能到达的终止条件', '两个以上参数'],
      answer: 2,
      explanation:
        '递归必须有终止条件，并且每次递归都要向终止条件靠近。没有终止条件或参数不收敛，调用栈会不断增长直到溢出。',
    },
  ],
  labSampleId: 'factorial',
};

export default lesson;
