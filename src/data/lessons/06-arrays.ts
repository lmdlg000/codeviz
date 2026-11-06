import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c06-arrays',
  chapterId: 'c-data',
  order: 1,
  title: '数组与字符串：一排连续的格子',
  subtitle: '把成组的数据放进连续的内存，用下标逐个访问',
  description:
    '从一排连续的格子出发，理解数组的下标、遍历与冒泡排序，并弄清 C 字符串为什么以 \\0 结尾。',
  difficulty: 2,
  minutes: 24,
  objectives: [
    '说清数组在内存中连续存放的特点，以及下标为什么从 0 开始',
    '用 for 循环完成数组的遍历、求和、求平均与找最值',
    '读懂并写出冒泡排序，理解外层与内层循环各自控制什么',
    '区分字符数组的 sizeof 与字符串长度 strlen，解释 \\0 的作用',
  ],
  blocks: [
    {
      type: 'text',
      body: '如果只记录一个学生的成绩，一个 `int` 变量就够了；可要记录全班五十个人的成绩，难道要写五十个变量吗？数组（array）正是为解决这类问题准备的：它把**相同类型**的一批数据按顺序放进内存里一排连续的格子，再用一个编号找到其中某一格。这节课我们从这排格子出发，学会遍历、求和、排序，最后看看 C 语言里的字符串究竟是怎样的字符数组。',
    },
    { type: 'heading', text: '一、数组：一排同类型的格子' },
    {
      type: 'text',
      body: '声明数组要写出元素类型、数组名和长度，例如 `int scores[5];` 表示五个 `int` 元素。本课程和实验室引擎都按固定长度数组讲解：长度在定义时就确定下来。C99 虽然支持用变量指定长度（VLA，变长数组），但它的支持情况因编译器而异，也不适合作为入门默认写法，初学阶段先不要依赖。这些元素在内存里**紧挨着**排列：`scores[0]`、`scores[1]` 一直到 `scores[4]`，每个 `int` 通常占 4 字节。下标从 0 开始，所以长度为 5 的数组，最后一个元素是 `scores[4]`，而 `scores[5]` 已经越界。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'array_basic.c',
      caption: '声明、初始化并用下标访问；sizeof 可以算出元素个数。',
      code: `#include <stdio.h>

int main() {
  int scores[5] = {88, 76, 95, 60, 82};

  printf("第一个元素：%d\\n", scores[0]);
  printf("最后一个元素：%d\\n", scores[4]);
  printf("元素个数：%d\\n", (int)(sizeof(scores) / sizeof(scores[0])));
  return 0;
}
`,
    },
    {
      type: 'diagram',
      title: '五个 int 在内存里排成一行',
      diagram: {
        kind: 'memory',
        code: `#include <stdio.h>

int main() {
  int scores[5] = {88, 76, 95, 60, 82};
  int count = 5;
  int first = scores[0];

  printf("%d %d\\n", count, first);
  return 0;
}
`,
      },
      caption: '数组元素的地址连续，下标每加 1，地址就前进一个元素的宽度。',
    },
    {
      type: 'text',
      body: '内存图里，五个格子共用同一个名字 `scores`，靠下标区分。第一个格子的地址最小，后面的格子依次排开。这也是数组能快速访问的原因：知道首地址和下标，就能直接算出目标地址，不必从头数。图里的地址是教学示意，真实地址由系统与运行环境决定，每次运行都可能不同。',
    },
    {
      type: 'text',
      body: '初始化数组时，可以像上面那样一次写全，也可以只写前几个，剩下的元素会自动补 0。但如果没有写初始化列表，局部数组里的值是不确定的，使用前一定要先赋值。数组的长度在定义后不能改变，需要更多格子时只能另开一个数组——这也是后面学习动态内存的伏笔。',
    },
    { type: 'heading', text: '二、遍历：让循环替你走遍每一格' },
    {
      type: 'text',
      body: '数组最常见的用法是**遍历**：让循环变量 `i` 从 0 走到长度减一，每轮访问 `scores[i]`。求和时把每个元素累加到 `sum`；找最大值时先假设第一个元素最大，再逐个比较。注意循环条件通常写 `i < 6` 而不是 `i <= 6`，因为 `scores[6]` 已经越界。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'array_sum.c',
      caption: '一次遍历同时完成求和与找最大值；求平均前先转成 double。',
      code: `#include <stdio.h>

int main() {
  int scores[6] = {88, 76, 95, 60, 82, 71};
  int sum = 0;
  int max = scores[0];

  for (int i = 0; i < 6; i++) {
    sum += scores[i];
    if (scores[i] > max) {
      max = scores[i];
    }
  }

  printf("总分 %d，平均 %.1f，最高 %d\\n", sum, (double)sum / 6, max);
  return 0;
}
`,
    },
    {
      type: 'list',
      items: [
        '**求和与平均**：循环累加得到 `sum`，再除以元素个数；整数除法会截断小数，除之前先转成 `double`。',
        '**计数**：满足条件时执行 `count++`，循环结束后 `count` 就是个数。',
        '**找最值**：把第一个元素当作当前最值，后面每遇到更大（或更小）的就更新。',
        '**查找**：找到目标后可以 `break` 提前结束，也可以把下标存下来供后面使用。',
      ],
    },
    { type: 'heading', text: '三、排序：让格子按大小排队' },
    {
      type: 'text',
      body: '冒泡排序（bubble sort）是最适合入门的排序。它的思路是反复比较相邻的两个元素，如果前一个比后一个大就交换它们。这样每扫一遍，当前最大的元素就会被“冒”到末尾。对长度为 `n` 的数组，外层循环只需要 `n - 1` 遍；每一遍内部比较的次数也会越来越少，因为末尾的部分已经排好了。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'bubble_sort.c',
      highlights: [7, 8, 9],
      caption: '外层的 i 控制轮数，内层的 j 控制这一轮要比较到哪一格。',
      code: `#include <stdio.h>

int main() {
  int a[6] = {5, 2, 9, 1, 7, 3};
  int n = 6;

  for (int i = 0; i < n - 1; i++) {
    for (int j = 0; j < n - 1 - i; j++) {
      if (a[j] > a[j + 1]) {
        int temp = a[j];
        a[j] = a[j + 1];
        a[j + 1] = temp;
      }
    }
  }

  for (int i = 0; i < n; i++) {
    printf("%d ", a[i]);
  }
  printf("\\n");
  return 0;
}
`,
    },
    {
      type: 'diagram',
      title: '单步执行冒泡排序',
      diagram: {
        kind: 'trace',
        code: `#include <stdio.h>

int main() {
  int a[5] = {4, 2, 5, 1, 3};
  int n = 5;

  for (int i = 0; i < n - 1; i++) {
    for (int j = 0; j < n - 1 - i; j++) {
      if (a[j] > a[j + 1]) {
        int temp = a[j];
        a[j] = a[j + 1];
        a[j + 1] = temp;
      }
    }
  }

  for (int i = 0; i < n; i++) {
    printf("%d ", a[i]);
  }
  printf("\\n");
  return 0;
}
`,
      },
      caption: '播放时观察数组 a 的格子变化：每交换一次，相邻元素就换了个位置。',
    },
    {
      type: 'text',
      body: '单步执行时，你会看到 `i`、`j` 和数组 `a` 同时变化。第一轮结束后，`5` 已经落到最后一格；第二轮只处理前四格。交换时必须借助临时变量 `temp`，否则先把 `a[j]` 覆盖掉，原来的值就找不回来了。这个“三步交换”在后面指针、结构体的代码里还会反复出现。',
    },
    { type: 'heading', text: '四、字符串：以 \\0 结尾的字符数组' },
    {
      type: 'text',
      body: 'C 语言没有单独的字符串类型。字符串（string）就是一个字符数组，最后放一个特殊的 `\\0`（读作 null 字符，数值为 0）作为结束标记。写 `char name[] = "CodeViz";` 时，编译器会自动在末尾补上 `\\0`，所以数组长度是 8，而看得见的字符只有 7 个。`printf` 的 `%s` 会从首字符开始打印，直到遇到 `\\0` 才停下。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'string_demo.c',
      caption: 'strlen 数到 \\0 之前；sizeof 数整个数组占用的字节数。',
      code: `#include <stdio.h>
#include <string.h>

int main() {
  char name[] = "CodeViz";

  printf("字符串：%s\\n", name);
  printf("strlen：%d\\n", (int)strlen(name));
  printf("sizeof：%d\\n", (int)sizeof(name));
  return 0;
}
`,
    },
    {
      type: 'table',
      headers: ['写法', '含义', '结果'],
      rows: [
        ['`sizeof(name)`', '整个字符数组占用的字节数', '8'],
        ['`strlen(name)`', '第一个 `\\0` 之前的字符个数', '7'],
        ['`name[0]`', '第一个字符', 'C'],
        ['`name[7]`', '结束标记 `\\0`', '0'],
      ],
    },
    {
      type: 'text',
      body: '`strlen` 数的是从开头到第一个 `\\0` 之前的字符数，`sizeof` 数的是整个数组占用的字节数。对 `name` 来说，前者是 7，后者是 8。如果把字符数组填满而不留 `\\0`，再用 `%s` 打印，函数会一直往后读，直到碰巧遇到一个 0——这是最常见的字符串越界问题之一。',
    },
    {
      type: 'note',
      tone: 'warn',
      title: '下标从 0 开始，越界不会报错',
      body: '`int a[5]` 的合法下标是 0 到 4。`a[5]` 看起来只多了一格，实际已经踩到数组之外的内存。C 不会替你检查边界，这种越界（out of bounds）可能悄悄改坏别的变量，甚至让程序崩溃。写循环时把边界想清楚：最后一个合法下标永远是“长度减一”。',
    },
    {
      type: 'note',
      tone: 'tip',
      title: '用 sizeof 计算元素个数',
      body: '对真正的数组，`sizeof(a) / sizeof(a[0])` 可以得到元素个数，比到处写魔法数字更稳。但要注意：数组传进函数后，参数会退化成指针，此时 `sizeof` 得到的是指针大小，不再是数组总字节数。这个坑在学过函数参数和指针之后会更清楚。',
    },
    { type: 'heading', text: '小结' },
    {
      type: 'text',
      body: '数组把同类型数据按顺序放在一起，下标从 0 开始，遍历时用 `for` 加下标最直接。排序算法看起来复杂，拆开看也只是“比较 + 交换”两件事。字符串是结尾带 `\\0` 的字符数组，`sizeof` 与 `strlen` 问的并不是同一个问题。下一课我们把这节课反复写过的计算逻辑抽成函数，让代码开始分工合作。',
    },
    {
      type: 'try',
      language: 'c',
      code: `#include <stdio.h>

int main() {
  int a[5] = {4, 2, 5, 1, 3};

  for (int i = 0; i < 4; i++) {
    for (int j = 0; j < 4 - i; j++) {
      if (a[j] > a[j + 1]) {
        int t = a[j];
        a[j] = a[j + 1];
        a[j + 1] = t;
      }
    }
  }

  for (int i = 0; i < 5; i++) {
    printf("%d ", a[i]);
  }
  printf("\\n");
  return 0;
}
`,
      prompt:
        '在实验室打开这段冒泡排序：先看单步执行里数组的每一次变化，再把比较条件 `>` 改成 `<`，观察输出变成了升序还是降序。',
    },
  ],
  keyPoints: [
    '数组元素类型相同、内存连续，下标从 0 到长度减一。',
    '遍历用 for 循环最自然，循环条件别把 `<` 误写成 `<=`。',
    '冒泡排序靠相邻比较与三步交换，每一轮把当前最大值送到末尾。',
    '字符串是结尾带 \\0 的字符数组；普通 char 数组不要求以 \\0 结尾。sizeof 是占用字节数，strlen 是字符个数。',
    '越界访问属于未定义行为，C 编译器不会替你做边界检查。',
  ],
  quiz: [
    {
      id: 'c06-q1',
      question: '声明 `int a[5] = {1, 2, 3, 4, 5};` 之后，表达式 `a[5]` 表示什么？',
      options: [
        '数组的最后一个元素，值为 5',
        '数组的第一个元素，值为 1',
        '越界访问，行为未定义',
        '自动变成 0，可以安全读取',
      ],
      answer: 2,
      explanation:
        '合法下标是 0 到 4，`a[5]` 已经越过数组末尾。C 不做边界检查，读到的内容不可预测，写入则可能破坏其他数据。',
    },
    {
      id: 'c06-q2',
      question: '冒泡排序的内层循环写成 `for (int j = 0; j < n - 1 - i; j++)`，为什么要减去 `i`？',
      options: [
        '因为 `a[i]` 已经排序完成，不能再访问',
        '每轮开始时末尾的 i 个元素已经就位，不必再参与比较',
        '为了减少循环变量的数量',
        '因为 i 就是数组的长度',
      ],
      answer: 1,
      explanation:
        '`i` 从 0 开始计数：第 i 轮开始时，末尾已经有 i 个元素排好，所以这一轮只需要比较前 n - 1 - i 对相邻元素；每轮结束再把一个最大值送到末尾，下一轮自然少比较一对。',
    },
    {
      id: 'c06-q3',
      question: '执行 `char s[] = "C";` 之后，`sizeof(s)` 的值是多少？',
      options: ['1', '2', '3', '4'],
      answer: 1,
      explanation:
        '编译器会在字符串字面量末尾补一个 `\\0`，所以数组里是字符 C 和结束标记两个字符，`sizeof(s)` 为 2，而 `strlen(s)` 为 1。',
    },
  ],
  labSampleId: 'bubble-sort',
};

export default lesson;
