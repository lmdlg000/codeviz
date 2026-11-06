import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'cpp-first',
  chapterId: 'cpp-start',
  order: 1,
  title: 'C++ 第一课：从 cout 开始',
  subtitle: '用 <iostream> 做输入输出，用 std::string 存文本，不碰 printf 和 char 数组',
  description:
    '专门给「直接学 C++」的人：第一个程序就写 std::cout，输入用 std::cin 与 getline，字符串用 std::string。顺带说清 iostream 与 stdio.h 到底差在哪。',
  difficulty: 1,
  minutes: 26,
  objectives: [
    '写出第一个 C++ 程序：`#include <iostream>`、`std::cout`、`std::endl` 与 `main`',
    '说清 `std::` 是什么、`using namespace std;` 为什么不该滥用',
    '用 `std::cin >>` 读数字、用 `std::getline` 读整行，并处理两者混用时留下的换行符',
    '用 `std::string` 完成拼接、取长度、截取与数字转换，不再手写 `char[]` 与 `strcpy`',
    '对照 `printf` / `scanf` 与 `cout` / `cin` 的差异，知道什么场合该用哪一个'
  ],
  blocks: [
    {
      type: 'text',
      body:
        'C++ 与 C 共享变量、运算、分支、循环、函数这些语法，所以大部分基础课可以照学。但**输入输出是第一个必须换掉的地方**：`printf` 和 `scanf` 来自 C 的 `<stdio.h>`，C++ 有自己的 `<iostream>`——`cout`、`cin`、`endl`。\n\n' +
        '这一节不解释「C 是怎么做的」，直接按 C++ 的方式写第一个程序。学完这一节，你再去学变量、分支、循环，可以完全不碰格式串。'
    },
    { type: 'heading', text: '一、第一个 C++ 程序' },
    {
      type: 'code',
      language: 'cpp',
      title: 'hello_cpp.cpp',
      caption: '用 g++ 编译：`g++ hello_cpp.cpp -o hello`，然后运行 `./hello`。',
      code: `#include <iostream>   // 输入输出流，不是 stdio.h

int main() {
  std::cout << "你好，C++！" << std::endl;
  std::cout << "3 + 4 = " << 3 + 4 << std::endl;
  std::cout << "半个苹果的价格：" << 2.5 << std::endl;
  return 0;
}
`
    },
    {
      type: 'text',
      body:
        '把它和 C 的写法放在一起看，差异立刻清楚：\n\n' +
        '- `#include <iostream>`：C++ 的标准库头文件**不带 `.h`**。写成 `<iostream.h>` 是三十年前的写法，现代编译器直接报错。\n' +
        '- `std::cout << 值`：`<<` 原本是左移运算符，这里被重载成「把右边的值送进输出流」。所以**不需要格式串**，`3 + 4` 是 `int` 就按整数打印，`2.5` 是 `double` 就按小数打印。\n' +
        '- `std::endl`：换行并刷新缓冲区（`\\n` 只换行、不强制刷新）。\n' +
        '- `std::` 是命名空间前缀。标准库里的东西都住在 `std` 里，用全名最安全。'
    },
    {
      type: 'compare',
      left: {
        title: 'C：格式串说了算',
        language: 'c',
        code: `printf("%d 岁，身高 %.1f 米\\n",
       age, height);`
      },
      right: {
        title: 'C++：类型自己说了算',
        language: 'cpp',
        code: `std::cout << age << " 岁，身高 "
          << std::fixed << std::setprecision(1)
          << height << " 米" << std::endl;`
      },
      caption: '左边靠 `%d`、`%.1f` 指定类型，写错就打印垃圾值；右边由编译器按变量类型挑输出方式，写不"错类型"。'
    },
    {
      type: 'note',
      tone: 'warn',
      title: 'using namespace std; 能用，但别到处用',
      body:
        '写 `using namespace std;` 之后就可以省略 `std::`，小作业里很方便。但它会把整个 std 的名字倒进当前作用域：一旦你自己定义了 `count`、`distance`、`max` 这类变量或函数，就可能和标准库撞名，报错信息还很难读。**头文件里绝对不要写**；源文件里如果写，也请放在所有 `#include` 之后、并接受它只在当前文件生效。'
    },
    { type: 'heading', text: '二、输入：cin 与 getline' },
    {
      type: 'code',
      language: 'cpp',
      title: 'io_cpp.cpp',
      caption: '`cin >>` 返回流对象本身；放进 `if` 里会转成 bool，读失败时为 false。',
      code: `#include <iostream>

int main() {
  int a = 0;
  int b = 0;

  std::cout << "输入两个整数：";
  if (!(std::cin >> a >> b)) {
    std::cout << "输入格式不对" << std::endl;
    return 1;
  }

  std::cout << a << " + " << b << " = " << a + b << std::endl;
  return 0;
}
`
    },
    {
      type: 'text',
      body:
        '`cin >> a >> b` 会自动跳过空格和换行，再按变量的类型解析：读 `int` 时只吃数字，读 `double` 时认小数点，读 `std::string` 时**遇到空白就停**。不需要写 `&a`，也不需要在格式串里声明类型——这是它比 `scanf` 省心的地方。\n\n' +
        '代价是它读不到带空格的内容。想读一整行（比如姓名、带空格的句子），要用 `std::getline`。'
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'getline.cpp',
      caption: '混用 `cin >>` 与 `getline` 之前，先吃掉上一行剩下的换行符。',
      code: `#include <iostream>
#include <string>

int main() {
  int age = 0;
  std::string name;

  std::cout << "年龄：";
  std::cin >> age;

  // cin >> 读完数字后，换行符还留在缓冲区里，
  // 不丢掉它，下面的 getline 会立刻读到空行。
  std::cin.ignore();

  std::cout << "姓名：";
  std::getline(std::cin, name);

  std::cout << name << " 今年 " << age << " 岁" << std::endl;
  return 0;
}
`
    },
    {
      type: 'note',
      tone: 'danger',
      title: '最容易卡住的一行：cin >> 之后接 getline',
      body:
        '`cin >> n` 只把数字读走，用户敲下的回车留在缓冲区。紧接着的 `getline(cin, s)` 会把这个回车当成「一个空行」，于是 s 是空串，程序看起来"跳过"了一次输入。解决：在两者之间加 `std::cin.ignore();`（或 `std::cin.ignore(std::numeric_limits<std::streamsize>::max(), \'\\n\');` 更彻底）。'
    },
    { type: 'heading', text: '三、文本用 std::string，不要手搓 char 数组' },
    {
      type: 'code',
      language: 'cpp',
      title: 'string_demo.cpp',
      caption: '`std::string` 自己管理长度，赋值、拼接、比较都像普通变量。',
      code: `#include <iostream>
#include <string>

int main() {
  std::string first = "Lin";
  std::string last = "Xiaoyu";
  std::string full = first + " " + last;   // 直接拼接

  std::cout << full << "，长度 " << full.size() << std::endl;
  std::cout << "前三个字符：" << full.substr(0, 3) << std::endl;

  std::string text = "2026";
  int year = std::stoi(text);              // 字符串 -> 整数
  std::cout << "明年是 " << year + 1 << std::endl;

  std::string num = std::to_string(3.14);  // 数值 -> 字符串
  std::cout << "转成文本后长度：" << num.size() << std::endl;

  if (first == "Lin") {                    // 直接用 == 比较内容
    std::cout << "内容比较，不用 strcmp" << std::endl;
  }
  return 0;
}
`
    },
    {
      type: 'table',
      headers: ['想做的事', 'C（stdio.h / string.h）', 'C++（iostream / string）'],
      rows: [
        ['输出', '`printf("%d\\n", x);`', '`std::cout << x << "\\n";`'],
        ['输出并换行', '`printf("...\\n");`', '`std::cout << "..." << std::endl;`'],
        ['读一个整数', '`scanf("%d", &x);`', '`std::cin >> x;`'],
        ['读一整行', '`gets(buf)` / `fgets`', '`std::getline(std::cin, s)`'],
        ['存字符串', '`char s[64]` + `strcpy`', '`std::string s`'],
        ['比较字符串', '`strcmp(a, b) == 0`', '`a == b`'],
        ['取长度', '`strlen(s)`', '`s.size()`'],
        ['转数字', '`atoi(s)`', '`std::stoi(s)`'],
        ['保留两位小数', '`printf("%.2f", x)`', '`std::fixed << std::setprecision(2)`']
      ]
    },
    {
      type: 'note',
      tone: 'tip',
      title: 'printf 也不是不能用',
      body:
        '真到大输出量的场合（比如算法题打印几万行），`printf` 往往比 `cout` 快；这时可以保留 `printf`，只要在 `main` 开头写 `std::ios::sync_with_stdio(false);` 并**不要**再混用 cout 输出。日常练习与工程代码，优先 `cout` / `cin`：类型安全、不用背格式串。'
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'flow',
        code: `int scoreLevel(int score) {
  if (score >= 90) {
    return 3;
  } else if (score >= 60) {
    return 2;
  }
  return 1;
}
`,
        functionName: 'scoreLevel'
      },
      title: '分支还是照旧写：输入输出换了，逻辑没变',
      caption: 'C++ 的 `if / else` 与 C 完全一致，只有输入输出换了写法。'
    },
    {
      type: 'try',
      language: 'cpp',
      prompt:
        '把 hello_cpp.cpp 改成：先让用户输入姓名和年龄，再输出「XXX 今年 N 岁，明年 N+1 岁」。注意年龄用 `cin >>`、姓名用 `getline`，别忘了中间那句 `cin.ignore()`。',
      code: `#include <iostream>
#include <string>

int main() {
  int age = 0;
  std::string name;

  std::cout << "年龄：";
  std::cin >> age;
  std::cin.ignore();

  std::cout << "姓名：";
  std::getline(std::cin, name);

  std::cout << name << " 今年 " << age << " 岁，明年 " << age + 1 << " 岁" << std::endl;
  return 0;
}
`
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
        {
          mistake: '用 `cin >>` 读带空格的姓名',
          wrong: 'std::cin >> name;   // 只读到 "Li"',
          right: 'std::getline(std::cin, name);',
          why: '`>>` 以空白为分隔符，读到空格就停。要整行必须用 `getline`。'
        },
        {
          mistake: '`cin >>` 之后直接 `getline`，结果读到空行',
          wrong: 'std::cin >> age;\nstd::getline(std::cin, name);',
          right: 'std::cin >> age;\nstd::cin.ignore();\nstd::getline(std::cin, name);',
          why: '数字后面残留的换行符被 `getline` 当成一个空行吃掉，于是姓名变成空串。'
        },
        {
          mistake: '包含 `<iostream.h>` 或忘记 `std::`',
          wrong: '#include <iostream.h>\ncout << "hi";',
          right: '#include <iostream>\nstd::cout << "hi";',
          why: 'C++ 标准库头文件没有 `.h` 后缀；`cout` 在 `std` 命名空间里，不写 `std::` 又没 `using` 就找不到。'
        },
        {
          mistake: '在头文件里写 `using namespace std;`',
          wrong: '// mylib.h\nusing namespace std;',
          right: '// mylib.h 里一律写 std::string / std::vector',
          why: '头文件会被别人包含，等于把整个 std 的名字倒进别人的作用域，极易造成名字冲突。'
        },
        {
          mistake: '循环里大量使用 `std::endl`',
          wrong: 'for (...) std::cout << i << std::endl;',
          right: 'for (...) std::cout << i << "\\n";',
          why: '`endl` 每次都刷新缓冲区，十万行输出会明显变慢；只换行用 `"\\n"`。'
        }
      ]
    }
  ],
  keyPoints: [
    'C++ 用 `#include <iostream>` 与 `std::cout` / `std::cin`，不用 `<stdio.h>` 与 `printf` / `scanf`。',
    '`<<` 与 `>>` 在 iostream 里被重载成输出与输入运算符，类型由变量决定，不需要格式串。',
    '`cin >>` 遇空白即停；读整行要用 `std::getline`，两者混用时先 `cin.ignore()` 吃掉换行符。',
    '文本一律用 `std::string`：可直接 `+` 拼接、用 `==` 比较、`.size()` 取长度、`stoi` / `to_string` 转数字。',
    '`endl` 会刷新缓冲区，密集输出改用 `"\\n"`；`printf` 仍可在追求速度时使用，但不要和 cout 混着写。'
  ],
  quiz: [
    {
      id: 'cppf-q1',
      question: '`std::cin >> s` 与 `std::getline(std::cin, s)` 的关键区别是？',
      options: [
        '前者只能读数字，后者只能读字符串',
        '前者遇空白就停，后者读到换行符为止',
        '两者完全等价，只是写法不同',
        '后者需要配合 `scanf` 使用'
      ],
      answer: 1,
      explanation:
        '`>>` 以空白（空格、制表符、换行）为分隔符，读到空白就结束；`getline` 一直读到换行符，因此能保留空格。两者的目标变量都可以是 `std::string`。'
    },
    {
      id: 'cppf-q2',
      question: '输出一万行数据时，把 `std::endl` 全部换成 `"\\n"` 的主要好处是？',
      options: [
        '换行效果更准确',
        '避免每次输出都刷新缓冲区，明显更快',
        '可以省略 `#include <iostream>`',
        '让数字按整数格式输出'
      ],
      answer: 1,
      explanation:
        '`endl` 等于「换行 + flush」，每次都强制刷新缓冲区；`"\\n"` 只写一个换行符，由缓冲区自行决定何时写盘，大批量输出时差距很明显。'
    },
    {
      id: 'cppf-q3',
      question: '关于 `using namespace std;`，下面哪种说法正确？',
      options: [
        '写了它就必须删掉所有 `std::`，否则编译报错',
        '它把 std 的名字引入当前作用域，头文件里使用容易造成名字冲突',
        '它只对 `cout` 有效，对 `string` 无效',
        '它是 C++23 才有的新语法'
      ],
      answer: 1,
      explanation:
        '`using namespace std;` 只是省掉前缀的语法糖，会让 std 里的所有名字在当前作用域可见。头文件被多方包含，冲突风险最大，所以头文件里应写全 `std::`。'
    }
  ]
};

export default lesson;
