import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c09-structs',
  chapterId: 'c-data',
  order: 4,
  title: '结构体与自定义类型',
  subtitle: '把姓名、学号、成绩打包成一个学生',
  description:
    '用结构体描述现实中的实体，学会成员访问、结构体数组，再用 typedef 与枚举给类型起名字。',
  difficulty: 2,
  minutes: 24,
  objectives: [
    '按“成员列表 + 分号”定义一个结构体，并创建结构体变量',
    '用点号读写成员，理解结构体整体赋值与逐成员赋值的区别',
    '用结构体数组和循环处理一张表，按“先下标、后成员”的顺序访问',
    '用 typedef 给类型起别名，用 enum 定义有名字的状态常量',
  ],
  blocks: [
    {
      type: 'text',
      body: '数组很擅长处理“一排同类数据”，可现实中的对象往往由不同类型的信息组成：一个学生有学号（整数）、姓名（字符串）、成绩（小数）。如果分别放三个数组，下标必须处处对齐，一旦插入或删除就很容易错位。结构体（struct）允许你把这几项**打包**成一个整体，让它拥有自己的类型。',
    },
    { type: 'heading', text: '一、定义结构体：先画一张表' },
    {
      type: 'text',
      body: '结构体的定义像在画一张表：`struct Student { int id; char name[16]; double score; };`。花括号里每行是一个**成员**（member），各自有类型和名字；末尾的分号不能漏，它把整个定义变成一条完整的声明。定义只是造了一个新类型，还没有分配内存。真正创建变量要写 `struct Student s;`，这时才会按成员顺序分配空间。',
    },
    {
      type: 'text',
      body: '结构体的成员可以是任意类型，也可以再嵌套另一个结构体。例如学生结构体里放一个“日期”结构体表示入学时间，访问时写成 `s.enroll.year`。嵌套让数据层次更清楚，但也不要套太多层，否则读写路径会变得难追踪。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'student_struct.c',
      caption: '初始化列表按成员顺序赋值；用点号访问每个成员。',
      code: `#include <stdio.h>

struct Student {
  int id;
  char name[16];
  double score;
};

int main() {
  struct Student s = {101, "Lin", 92.5};

  printf("学号：%d\\n", s.id);
  printf("姓名：%s\\n", s.name);
  printf("成绩：%.1f\\n", s.score);
  return 0;
}
`,
    },
    {
      type: 'diagram',
      title: '结构体在内存里的样子',
      diagram: {
        kind: 'memory',
        code: `#include <stdio.h>

struct Student {
  int id;
  char name[16];
  double score;
};

int main() {
  struct Student s1 = {101, "Lin", 92.5};
  struct Student s2 = {102, "Chen", 78.0};

  printf("%s %s\\n", s1.name, s2.name);
  return 0;
}
`,
      },
      caption:
        '每个 Student 变量在内存中是一整块连续空间（各占 28 字节），块内按 id、name、score 的顺序排列；为了对齐，成员之间可能有填充字节。',
    },
    {
      type: 'text',
      body: '从布局上看，`s1` 不是三个散落的变量，而是一整块连续的空间：先是 `id`，接着 16 字节的 `name`，最后是 `score`。内存图会把每个结构体变量按整块显示，字段顺序可从上面的成员列表对应。因为成员大小不同，编译器可能插入少量填充字节（padding），让 `double` 从合适的地址开始，所以结构体的总大小不一定等于成员大小之和，可以用 `sizeof(struct Student)` 查看。',
    },
    { type: 'heading', text: '二、成员访问与修改' },
    {
      type: 'text',
      body: '用点号 `.` 访问成员：`s.id`、`s.name`、`s.score`。点号左边是结构体变量，右边是成员名，合起来就是一个普通变量，可以读也可以写，比如 `s.score = s.score + 5;`。结构体变量之间可以直接整体赋值，`s2 = s1;` 会把所有成员复制过去；但比较两个结构体不能直接用 `==`，要逐个成员比较。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'member_update.c',
      caption: '成员可以像普通变量一样修改；整体赋值会复制全部成员。',
      code: `#include <stdio.h>

struct Student {
  int id;
  char name[16];
  double score;
};

int main() {
  struct Student s = {101, "Lin", 92.5};

  s.id = 102;
  s.score = s.score + 5.0;

  struct Student copy = s;
  printf("%d %s %.1f\\n", copy.id, copy.name, copy.score);
  return 0;
}
`,
    },
    {
      type: 'text',
      body: '如果手里拿到的是结构体指针，访问成员要写 `p->score`，它等价于 `(*p).score`。点号用于结构体变量，箭头用于结构体指针，两者不要混用；等把指针和结构体组合起来写链表、树时，这个写法会天天出现。',
    },
    { type: 'heading', text: '三、结构体数组：一张学生表' },
    {
      type: 'text',
      body: '把结构体放进数组，就得到一张真正的表格：`struct Student classA[3];`，每个元素都是一个完整的学生。访问某个学生的成员要写 `classA[i].score`：先用下标取出元素，再用点号取成员。遍历时用一个 `for` 循环就能打印整张表、累加总分，比维护三个平行数组清楚得多，也不容易漏改某一行。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'student_table.c',
      caption: '结构体数组 + 循环：classA[i].score 先下标、后成员。',
      code: `#include <stdio.h>

struct Student {
  int id;
  char name[16];
  int score;
};

int main() {
  struct Student classA[3] = {
    {101, "Lin", 92},
    {102, "Chen", 78},
    {103, "Zhao", 85}
  };
  int sum = 0;

  for (int i = 0; i < 3; i++) {
    sum += classA[i].score;
    printf("%d %s %d\\n", classA[i].id, classA[i].name, classA[i].score);
  }
  printf("平均分：%.1f\\n", (double)sum / 3);
  return 0;
}
`,
    },
    {
      type: 'text',
      body: '结构体数组让排序和查找也能复用数组课的方法，只是比较的对象从单个数字变成了结构体的某个成员。比如按成绩排序时，比较 `classA[j].score`，交换的却是整个结构体元素。把“整条记录”当成一个整体搬动，比维护三个平行数组更不容易错。',
    },
    {
      type: 'diagram',
      title: '单步执行：给结构体成员逐个赋值',
      diagram: {
        kind: 'trace',
        code: `#include <stdio.h>

struct Point {
  int x;
  int y;
};

int main() {
  struct Point p;
  p.x = 3;
  p.y = 4;

  int sum = p.x + p.y;
  printf("x=%d, y=%d, sum=%d\\n", p.x, p.y, sum);
  return 0;
}
`,
      },
      caption: '观察变量面板：p 是一个整体，展开后能看到 x 与 y 两个成员。',
    },
    {
      type: 'text',
      body: '单步执行时，`p` 会作为一个整体出现在变量面板里，`p.x`、`p.y` 是它的两个成员。注意 `p` 没有初始化就写成员，之前的内容是不确定的；如果先读取再赋值，读到的是垃圾值。给结构体变量初始化时，最简单的办法是在声明时就写完整初始化列表，例如 `struct Point p = {0, 0};`，让所有成员都有确定的初始值。',
    },
    { type: 'heading', text: '四、typedef 与枚举：给类型起名字' },
    {
      type: 'text',
      body: '每次写 `struct Student` 有点啰嗦。`typedef` 可以为已有类型起别名：`typedef struct Student Student;` 之后就能直接写 `Student s;`。更常见的写法是在定义结构体时一步到位，把别名写在右花括号后面。`typedef` 不只服务结构体，也可以给数组、指针类型起别名；不过在初学阶段，最常见的用法就是省掉反复写 `struct` 的麻烦。另一种自定义类型是枚举（enum），它把一组有名字的整数常量排在一起，适合表示“状态”这类有限取值。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'typedef_enum.c',
      caption: 'typedef 让 Student 成为类型名；enum 让 PASS、FAIL 比 0、1 更好读。',
      code: `#include <stdio.h>

typedef struct {
  int id;
  int score;
} Student;

typedef enum {
  FAIL = 0,
  PASS = 1
} Result;

int main() {
  Student s = {101, 92};
  Result r = s.score >= 60 ? PASS : FAIL;

  printf("学号 %d，结果 %d\\n", s.id, r);
  return 0;
}
`,
    },
    {
      type: 'text',
      body: '枚举的底层就是整数，不写值时按顺序从 0 开始，也可以像上面那样自己指定。它不会替你检查取值范围，但能让代码读起来有含义：`r == PASS` 比 `r == 1` 清楚得多。结构体、`typedef`、枚举组合起来，你就有了描述现实数据的基本工具，这也是后面 C++ 中“类”的前身。',
    },
    {
      type: 'table',
      headers: ['写法', '作用'],
      rows: [
        ['`struct Student { ... };`', '定义一个结构体类型'],
        ['`struct Student s;`', '创建一个结构体变量'],
        ['`s.score`', '访问结构体成员'],
        ['`s2 = s1;`', '整体复制所有成员'],
        ['`typedef ... Student;`', '给类型起一个短名字'],
        ['`enum { PASS, FAIL };`', '定义一组有名字的整数常量'],
      ],
    },
    {
      type: 'note',
      tone: 'warn',
      title: '右花括号后的分号，以及不能整体赋值的字符数组',
      body: '`struct Student { ... };` 右花括号后面的分号经常被漏掉，漏了会引发一串莫名其妙的报错。另外，字符数组成员 `name` 是数组，声明后不能用 `s.name = "新名字";` 整体赋值，要借助 `strcpy` 或逐个字符写入，`s.name` 本身也不能用 `==` 比较。',
    },
    {
      type: 'note',
      tone: 'info',
      title: '结构体的大小可能比成员之和更大',
      body: '为了性能，编译器会按成员的字节宽度做内存对齐，在成员之间插入填充字节。比如 `int` 后面跟 `double` 时，中间可能会空出几个字节。因此判断结构体大小时要相信 `sizeof`，不要手动把各成员大小相加。',
    },
    { type: 'heading', text: '小结' },
    {
      type: 'text',
      body: '结构体把多个不同类型的成员组合成一个整体，用点号访问成员，用初始化列表或逐个赋值填入数据。结构体数组是描述“一张表”的利器，访问顺序是“先下标、后成员”。`typedef` 让类型名更短，`enum` 让状态值有名字。下一课我们把这些数据写进磁盘文件，让程序结束后还能读回来。',
    },
    {
      type: 'try',
      language: 'c',
      code: `#include <stdio.h>

struct Student {
  int id;
  int score;
};

int main() {
  struct Student list[3] = {{1, 80}, {2, 55}, {3, 92}};
  int pass = 0;

  for (int i = 0; i < 3; i++) {
    if (list[i].score >= 60) {
      pass++;
    }
  }

  printf("及格人数：%d\\n", pass);
  return 0;
}
`,
      prompt:
        '在实验室打开这段代码：先看内存图里结构体数组的排列，再把某个分数改成 59，观察及格人数如何变化；最后试着给结构体加一个 `name` 成员。',
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
    {
      mistake: "结构体定义后面漏分号",
      wrong: "struct Point { int x; int y; }",
      right: "struct Point { int x; int y; };",
      why: "结构体定义本身是一条语句，右花括号后必须有分号。"
    },
    {
      mistake: "结构体和结构体指针用同一个访问符",
      wrong: "p.x   /  s->x",
      right: "p->x  /  s.x",
      why: "变量用点，指针用箭头；p->x 等价于 (*p).x。"
    },
    {
      mistake: "结构体里有指针时直接整体赋值",
      wrong: "b = a;  // 两个结构体指向同一块内存",
      right: "b.s = strdup(a.s);  // 深拷贝",
      why: "结构体赋值是浅拷贝，指针成员只复制地址，改一个另一个也跟着变，释放时还会重复 free。"
    }
      ]
    },
  ],
  keyPoints: [
    '结构体把多个不同类型的成员组合成一个整体，定义末尾必须写分号。',
    '用点号访问成员；结构体变量可以整体赋值，但不能直接用 == 比较。',
    '结构体数组适合表示一张表，classA[i].score 是“先下标、后成员”。',
    '成员按顺序存放，可能有对齐填充，总大小用 sizeof 查。',
    'typedef 给类型起别名，enum 定义有名字的整数常量，让自定义类型更好用。',
  ],
  quiz: [
    {
      id: 'c09-q1',
      question: '已有 `struct Student classA[3];`，要访问第二个学生的成绩，正确写法是？',
      options: ['`classA[2].score`', '`classA[1].score`', '`classA.score[1]`', '`classA[1]->score`'],
      answer: 1,
      explanation:
        '数组下标从 0 开始，第二个元素是 `classA[1]`；元素本身是结构体变量而不是指针，所以用点号取成员，`->` 是给结构体指针用的。',
    },
    {
      id: 'c09-q2',
      question: '定义结构体时漏掉右花括号后面的分号，通常会怎样？',
      options: [
        '编译器自动补上，程序正常运行',
        '编译报错，并可能在后续代码处出现连带错误',
        '只是警告，不影响运行',
        '结构体自动变成全局变量',
      ],
      answer: 1,
      explanation:
        '结构体定义是一条完整声明，必须以分号结束。漏掉后编译器无法判断声明在哪里结束，往往会在后面几行报出关联错误。',
    },
    {
      id: 'c09-q3',
      question: '`struct Student { int id; char name[16]; int score; };` 中，`s.name` 的类型是什么？',
      options: ['`int`', '`char[16]`', '`char *`', '`double`'],
      answer: 1,
      explanation:
        '`name` 是结构体里的字符数组成员，类型为 `char[16]`。它会在某些表达式里退化为 `char *`，但成员本身的类型是数组。',
    },
  ],
  labSampleId: 'student-struct',
};

export default lesson;
