import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c08-pointers',
  chapterId: 'c-data',
  order: 3,
  title: '指针：内存的门牌号',
  subtitle: '用地址间接访问数据，让函数真正修改外面的变量',
  description:
    '从取地址符出发认识指针，看懂地址与箭头，再用指针参数写出真正能交换两个变量的 swap。',
  difficulty: 3,
  minutes: 26,
  objectives: [
    '说明地址、指针变量与解引用三者的关系',
    '区分“修改指针的指向”和“修改指针指向的内容”',
    '用指针参数写出 swap，理解它为什么能改变调用者的变量',
    '解释数组名退化为首元素指针，以及 *(p + i) 与 a[i] 的等价关系',
  ],
  blocks: [
    {
      type: 'text',
      body: '上一课我们说过，函数收到的参数只是实参的副本，所以在函数里改形参，外面的变量纹丝不动。可如果就是想让函数修改外面的变量呢？C 给出的答案是**指针**（pointer）：不复制数据本身，而是把数据的地址交给函数。要理解指针，先要接受一件事——内存里的每个字节都有一个编号，这个编号就是地址。',
    },
    { type: 'heading', text: '一、地址与指针变量' },
    {
      type: 'text',
      body: '用取地址运算符 `&` 可以拿到一个变量的地址，`&x` 的类型是“指向 int 的指针”，写作 `int *`。`int *p = &x;` 声明了一个指针变量 `p`，它里面存的就是 `x` 的地址。指针本身也是变量，占一块内存（64 位系统上通常 8 字节），只不过它存的内容是另一个变量的位置。用 `*p` 可以顺着地址找到目标，这叫**解引用**（dereference）。',
    },
    {
      type: 'text',
      body: '可以把内存想成一排房间，变量是房间里的东西，地址是门牌号。普通变量直接住着值；指针变量则像一张写着门牌号的纸条，纸条本身也是被存放的对象，但顺着号码能找到另一个房间。`&` 是“问门牌号”，`*` 是“按门牌号找过去”。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'address.c',
      caption: 'p 存的是 x 的地址；*p 又把地址“还原”成 x 的值。',
      code: `#include <stdio.h>

int main() {
  int x = 42;
  int *p = &x;

  printf("x 的值：%d\\n", x);
  printf("x 的地址：%p\\n", (void *)&x);
  printf("p 里存的地址：%p\\n", (void *)p);
  printf("p 指向的值：%d\\n", *p);
  return 0;
}
`,
    },
    {
      type: 'diagram',
      title: '地址与指针箭头',
      diagram: {
        kind: 'memory',
        code: `#include <stdio.h>

int main() {
  int x = 42;
  int y = 7;
  int *p = &x;
  int *q = &y;

  printf("%d %d\\n", *p, *q);
  return 0;
}
`,
      },
      caption:
        '指针变量 p、q 里存的是地址，所以用箭头画出指向关系；地址为教学示意，不是真实运行地址。',
    },
    {
      type: 'text',
      body: '在内存图里，`x` 和 `y` 是两块普通的格子，`p` 和 `q` 是另外两块格子，只是它们的内容是一串地址，所以用箭头画出指向关系。`p` 的类型是 `int *`，它告诉编译器：顺着这个地址读 4 个字节，并按整数解释。类型不同的指针不能随便互相赋值，因为编译器要靠类型决定读多少字节、怎么解释这些字节。',
    },
    { type: 'heading', text: '二、通过指针修改目标' },
    {
      type: 'text',
      body: '解引用不仅能读，也能写。`*p = 100;` 的意思是“把 100 写到 p 指向的那块内存”，于是 `x` 就变成了 100。注意指针本身没有被修改，`p` 仍然指向 `x`。如果写的是 `p = &y;`，那才是让 `p` 改指向 `y`。读代码时要分清：这一句改的是指针的指向，还是指针指向的内容。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'pointer_write.c',
      caption: '*p 修改的是目标变量；p = &y 只是换了指向。',
      code: `#include <stdio.h>

int main() {
  int x = 42;
  int y = 7;
  int *p = &x;

  *p = 100;
  printf("x = %d\\n", x);

  p = &y;
  *p = *p + 1;
  printf("y = %d\\n", y);
  return 0;
}
`,
    },
    { type: 'heading', text: '三、指针参数：swap 终于能工作了' },
    {
      type: 'text',
      body: '把指针作为参数，函数拿到的仍然是“地址的副本”，但这个地址指向调用者的变量。于是在函数里解引用，改的就是调用者的数据。经典的 `swap(int *a, int *b)` 就是这样：`a` 和 `b` 分别保存两个变量的地址，交换 `*a` 与 `*b`，就交换了外面的值。调用时要传地址，写成 `swap(&x, &y)`；如果写成 `swap(x, y)`，编译器会因为类型不匹配而报错。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'swap.c',
      caption: '三步交换交换的是 *a 和 *b，也就是外面的 x 和 y。',
      code: `#include <stdio.h>

void swap(int *a, int *b) {
  int temp = *a;
  *a = *b;
  *b = temp;
}

int main() {
  int x = 3;
  int y = 8;

  printf("交换前：x = %d, y = %d\\n", x, y);
  swap(&x, &y);
  printf("交换后：x = %d, y = %d\\n", x, y);
  return 0;
}
`,
    },
    {
      type: 'diagram',
      title: 'swap 函数的流程图',
      diagram: {
        kind: 'flow',
        functionName: 'swap',
        code: `void swap(int *a, int *b) {
  int temp = *a;
  *a = *b;
  *b = temp;
}
`,
      },
      caption: '函数体只有三步：先备份 *a，再用 *b 覆盖 *a，最后把备份写进 *b。',
    },
    {
      type: 'text',
      body: '把 swap 画成流程图，会看到它是一条没有分支的直路：备份、覆盖、写回。真正容易出错的是调用处——忘记写 `&`，等于把整数当成地址传进去；在函数里少写一个 `*`，交换的就变成了两个局部指针，外面的 `x`、`y` 毫无变化。写完后对着内存图检查一遍：箭头有没有指对，改的是不是箭头另一端的内容。',
    },
    {
      type: 'text',
      body: '指针参数的意义不止交换两个数。函数一次只能 `return` 一个值，但借由指针，可以让函数修改多个变量，把多个结果带回调用者。C 标准库中很多函数要求传地址，例如 `scanf("%d", &x)` 必须写 `&`，原因就在这里。',
    },
    { type: 'heading', text: '四、指针与数组' },
    {
      type: 'text',
      body: '数组名在大多数表达式里会“退化”成指向首元素的指针，所以 `int *p = a;` 是合法的。`p + i` 表示向后移动 `i` 个元素（不是 `i` 个字节），`*(p + i)` 与 `a[i]` 完全等价。指针加法会自动按元素大小缩放，这正是指针类型存在的意义之一。但指针不会记住数组边界，越界访问照样不会报错，使用时要自己控制范围。',
    },
    {
      type: 'text',
      body: '数组元素本身也有地址，`&a[2]` 就等于 `a + 2`。`a` 与 `&a[0]` 指向同一个位置，但类型不同：`sizeof(a)` 得到整个数组的大小，而 `sizeof(&a[0])` 只是指针的大小。指针还可以和下标一起用，`p[i]` 与 `*(p + i)` 等价，只是前者读起来更像数组。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'pointer_array.c',
      caption: 'p + i 按 int 的大小移动；*(p + i) 等价于 a[i]。',
      code: `#include <stdio.h>

int main() {
  int a[5] = {10, 20, 30, 40, 50};
  int *p = a;

  for (int i = 0; i < 5; i++) {
    printf("a[%d] = %d\\n", i, *(p + i));
  }
  return 0;
}
`,
    },
    {
      type: 'compare',
      caption:
        'C++ 的引用是变量的别名，函数里直接写名字就能改到外面；两种写法都能通过 g++ 编译。',
      left: {
        title: 'C：用指针交换',
        language: 'c',
        code: `void swap(int *a, int *b) {
  int temp = *a;
  *a = *b;
  *b = temp;
}

/* 调用：swap(&x, &y); */
`,
      },
      right: {
        title: 'C++：用引用交换',
        language: 'cpp',
        code: `void swap(int &a, int &b) {
  int temp = a;
  a = b;
  b = temp;
}

/* 调用：swap(x, y); */
`,
      },
    },
    {
      type: 'note',
      tone: 'danger',
      title: '野指针与空指针：解引用前先确认指向',
      body: '`int *p;` 只声明未初始化，`p` 里是随机值，此时解引用就是野指针访问；`int *p = NULL;` 之后解引用同样属于未定义行为。使用指针前必须确认它指向有效内存，解引用前可以用 `if (p != NULL)` 检查，但检查只能挡住空指针，挡不住未初始化或已经失效的指针。',
    },
    {
      type: 'note',
      tone: 'info',
      title: '地址是示意，不是固定数字',
      body: '课程里的内存图会给变量标上一串地址，那只是为了帮助理解“谁挨着谁、谁指向谁”。真实地址由操作系统和运行时决定，同一程序两次运行都可能不同，还有地址随机化机制。不要根据图里的数字写代码，也不要假设变量一定按声明顺序排列。',
    },
    { type: 'heading', text: '小结' },
    {
      type: 'text',
      body: '`&` 取地址，`*` 解引用，`int *p` 里存的是 int 变量的地址。指针本身是变量，`p = &y` 改指向，`*p = 9` 改内容。把地址传给函数，函数就能通过解引用修改调用者的变量，这正是 swap 能工作的原因。数组名会退化成首元素指针，`*(p + i)` 与 `a[i]` 等价。下一课我们把多个相关变量打包成结构体，用更贴近现实的方式组织数据。',
    },
    {
      type: 'try',
      language: 'c',
      code: `#include <stdio.h>

void swap(int *a, int *b) {
  int temp = *a;
  *a = *b;
  *b = temp;
}

int main() {
  int x = 10;
  int y = 20;

  swap(&x, &y);
  printf("x = %d, y = %d\\n", x, y);
  return 0;
}
`,
      prompt:
        '在实验室打开这段代码：先看内存图里两个指针的箭头指向，再单步执行，观察 *a 与 *b 的交换如何改变 x、y；最后把交换三步的顺序打乱，看看结果是否还正确。',
    },
  ],
  keyPoints: [
    '& 取地址，* 解引用；int *p 里存的是 int 变量的地址。',
    '指针本身是变量：p = &y 改指向，*p = 9 改指向的内容。',
    '指针参数让函数能修改调用者的变量，swap 交换的是 *a 与 *b。',
    '数组名退化为首元素指针，*(p + i) 与 a[i] 等价，且指针加法按元素大小移动。',
    '野指针、空指针解引用都是未定义行为，使用前必须确认指向有效内存。',
  ],
  quiz: [
    {
      id: 'c08-q1',
      question: '执行 `int x = 5; int *p = &x; *p = 8;` 之后，`x` 的值是多少？',
      options: ['5', '8', 'p 的地址', '无法确定'],
      answer: 1,
      explanation:
        '`p` 保存 `x` 的地址，`*p = 8` 把 8 写到 `p` 指向的内存，也就是 `x` 所在的格子，所以 `x` 变成 8。',
    },
    {
      id: 'c08-q2',
      question: '已有 `int x = 3; int y = 8;` 和 `void swap(int *a, int *b);`，正确的调用是哪个？',
      options: ['`swap(x, y);`', '`swap(&x, &y);`', '`swap(*x, *y);`', '`swap(x, &y);`'],
      answer: 1,
      explanation:
        'swap 的参数类型是 `int *`，需要传变量的地址。`&x`、`&y` 的类型正是 `int *`；直接传 `x`、`y` 会类型不匹配，`*x` 本身也不合法。',
    },
    {
      id: 'c08-q3',
      question: '`int a[5]; int *p = a;` 之后，`*(p + 2)` 与下面哪个表达式等价？',
      options: ['`a[1]`', '`a[2]`', '`&a[2]`', '`2`'],
      answer: 1,
      explanation:
        '数组名 `a` 退化为首元素地址，`p + 2` 指向下标 2 的元素，`*(p + 2)` 取出的值就是 `a[2]`。`&a[2]` 是地址而不是值。',
    },
  ],
  labSampleId: 'swap-pointer',
};

export default lesson;
