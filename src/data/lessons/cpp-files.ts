import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'cpp-files',
  chapterId: 'cpp-oop',
  order: 6,
  title: '文件流：用 << 和 >> 读写磁盘',
  subtitle: '`ifstream` / `ofstream` 把文件当成一个流，语法和 `cout` / `cin` 一模一样',
  description:
    '讲清三类文件流、打开模式、逐行与逐词读取、以及和 C 的 FILE* 的对照；顺带说清二进制模式与错误检查。',
  difficulty: 2,
  minutes: 24,
  objectives: [
    '用 `ofstream` 写文件、用 `ifstream` 读文件，并检查是否打开成功',
    '选择正确的打开模式：`ios::in` / `out` / `app` / `trunc` / `binary`',
    '用 `getline` 读整行、用 `>>` 读结构化的词，并知道两者混用的注意点',
    '说清 C++ 文件流与 C 的 `FILE*` 在语法、类型安全与析构上的区别',
    '列出处理文件时的四类常见错误并知道如何避免'
  ],
  blocks: [
    {
      type: 'text',
      body:
        'C 用 `FILE*` 与 `fopen` / `fprintf` / `fscanf`：格式串、指针、手动 `fclose`。C++ 把这些包装成了**流**：文件和键盘、屏幕在语法上没有区别，都是 `<<` / `>>`。\n\n' +
        '好处有两个——不用记格式串（类型由变量决定），关闭交给析构函数（RAII），异常或提前返回都不会漏关。'
    },
    {
      type: 'table',
      headers: ['类', '用途', '典型写法'],
      rows: [
        ['`std::ofstream`', '只写', '`ofstream out("a.txt");`'],
        ['`std::ifstream`', '只读', '`ifstream in("a.txt");`'],
        ['`std::fstream`', '读写都要', '`fstream io("a.txt", ios::in | ios::out);`']
      ]
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'write_file.cpp',
      caption: '`ofstream` 默认就是 `ios::out | ios::trunc`——文件已存在会被清空。',
      code: `#include <fstream>
#include <iostream>

int main() {
  std::ofstream out("scores.txt");        // 覆盖写
  if (!out) {                             // 关键：检查是否打开成功
    std::cerr << "无法创建文件" << std::endl;
    return 1;
  }

  out << "Lin 92" << std::endl;
  out << "Zhao 85" << std::endl;
  out << "Qian 78" << std::endl;
  // 不需要 out.close()：离开作用域时析构函数会自动关闭
  return 0;
}
`
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'read_file.cpp',
      caption: '`while (getline(in, line))` 是逐行读取的标准写法——它顺带判断了读取是否成功。',
      code: `#include <fstream>
#include <iostream>
#include <string>

int main() {
  std::ifstream in("scores.txt");
  if (!in.is_open()) {
    std::cout << "文件打不开" << std::endl;
    return 1;
  }

  std::string line;
  int total = 0;
  int count = 0;
  while (std::getline(in, line)) {         // 读到一行就进入循环
    if (line.empty()) continue;
    std::size_t space = line.find(' ');
    std::string name = line.substr(0, space);
    int score = std::stoi(line.substr(space + 1));
    std::cout << name << " -> " << score << std::endl;
    total += score;
    count++;
  }

  if (count > 0) {
    std::cout << "平均分：" << total / count << std::endl;
  }
  return 0;
}
`
    },
    {
      type: 'note',
      tone: 'warn',
      title: '`>>` 读不到空格，`getline` 读不到结构',
      body:
        '想读「姓名 + 分数」这种结构化数据，用 `in >> name >> score` 更省事，但它遇到空白就断；想读一整行（可能含空格）用 `getline`。两者混用时，`>>` 后面残留的换行会让紧接着的 `getline` 读到空行——先用 `in.ignore()` 吃掉。'
    },
    { type: 'heading', text: '一、打开模式：别把已有文件清空了' },
    {
      type: 'table',
      headers: ['模式', '含义', '注意'],
      rows: [
        ['`ios::in`', '读', '`ifstream` 默认'],
        ['`ios::out`', '写', '`ofstream` 默认，**会截断已有文件**'],
        ['`ios::app`', '追加', '写到末尾，不破坏原内容（日志常用）'],
        ['`ios::trunc`', '截断', '`out` 已隐含，显式写更清楚'],
        ['`ios::binary`', '二进制', '不做换行转换，结构体 / 图片必须加']
      ]
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'append_log.cpp',
      caption: '追加写不会清空历史记录；`ios::in | ios::out` 才能读写同一文件且保留内容。',
      code: `#include <fstream>

int main() {
  // 追加：原来的内容保留
  std::ofstream log("run.log", std::ios::app);
  log << "started" << std::endl;

  // 读写同一个文件（不清空）：必须同时给 in 和 out
  std::fstream io("data.txt", std::ios::in | std::ios::out);
  if (io) {
    int value = 0;
    io >> value;
    io.seekp(0);          // 回到开头再写
    io << value + 1;
  }
  return 0;
}
`
    },
    { type: 'heading', text: '二、和 C 的 FILE* 对照' },
    {
      type: 'table',
      headers: ['动作', 'C（`<cstdio>`）', 'C++（`<fstream>`）'],
      rows: [
        ['打开读', '`FILE* f = fopen("a.txt", "r");`', '`ifstream in("a.txt");`'],
        ['打开写', '`fopen("a.txt", "w")`', '`ofstream out("a.txt");`'],
        ['追加', '`fopen("a.txt", "a")`', '`ofstream out("a.txt", ios::app);`'],
        ['格式化写', '`fprintf(f, "%d %s", n, s);`', '`out << n << " " << s;`'],
        ['读一行', '`fgets(buf, 256, f)`', '`getline(in, line)`'],
        ['判断结束', '`feof(f)` / 检查返回值', '`while (getline(...))` / `while (in >> x)`'],
        ['关闭', '`fclose(f);`（必须手动）', '析构自动关闭，也可 `close()`'],
        ['类型安全', '格式串写错就打印垃圾', '类型由变量决定']
      ]
    },
    {
      type: 'note',
      tone: 'tip',
      title: '什么时候还用 FILE*',
      body:
        '需要和 C 库、系统调用混用，或者追求极致性能时，`FILE*` 仍然合适。纯 C++ 项目里优先 `<fstream>`：析构自动关闭、不用背格式串、能直接输出自定义类型（配合 `operator<<`）。'
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
        {
          mistake: '不检查文件是否打开成功就直接读',
          wrong: 'ifstream in("a.txt");\nin >> x;      // 打开失败时读到 0',
          right: 'ifstream in("a.txt");\nif (!in) { /* 报错退出 */ }',
          why: '文件不存在或没权限时流处于失败状态，后续读取全部无效但不会崩溃，错误会被静默吞掉。'
        },
        {
          mistake: '用 `ofstream` 打开已有文件却没意识到会被清空',
          wrong: 'ofstream out("data.txt");   // 原内容没了',
          right: 'ofstream out("data.txt", ios::app);',
          why: '`ofstream` 默认 `ios::out | ios::trunc`，打开即截断。只想追加必须显式 `ios::app`。'
        },
        {
          mistake: '用 `in >> line` 读带空格的一整行',
          wrong: 'std::string line;\nin >> line;      // 只读到第一个词',
          right: 'std::getline(in, line);',
          why: '`>>` 以空白为分隔符，姓名、地址这类含空格的内容会被截断。'
        },
        {
          mistake: '`>>` 之后直接 `getline`，读到空行',
          wrong: 'in >> age;\ngetline(in, name);',
          right: 'in >> age;\nin.ignore();\ngetline(in, name);',
          why: '数字后残留的换行符会被 `getline` 当成一个空行，导致姓名变成空串。'
        },
        {
          mistake: '二进制数据用文本模式读写',
          wrong: 'ofstream out("a.bin");\nout.write((char*)&obj, sizeof(obj));',
          right: 'ofstream out("a.bin", std::ios::binary);',
          why: '文本模式在 Windows 上会把 `\\n` 转成 `\\r\\n`，二进制数据被破坏，读回来就对不上了。'
        }
      ]
    }
  ],
  keyPoints: [
    '`ofstream` 写、`ifstream` 读、`fstream` 读写，头文件是 `<fstream>`。',
    '`ofstream` 默认会截断已有文件；只想追加要显式 `ios::app`。',
    '`getline(in, line)` 读整行，`in >> x` 读一个词；混用前先 `in.ignore()`。',
    '文件流在析构时自动关闭，异常路径也不会漏；但仍要检查 `if (!in)` 确认打开成功。',
    '二进制数据必须加 `ios::binary`；文本模式在 Windows 会改写换行符。'
  ],
  quiz: [
    {
      id: 'cppf2-q1',
      question: '`std::ofstream out("data.txt");` 打开一个已存在的文件，会发生什么？',
      options: [
        '内容追加到末尾',
        '原内容被清空',
        '打开失败',
        '内容被读取'
      ],
      answer: 1,
      explanation:
        '`ofstream` 默认模式是 `ios::out | ios::trunc`，打开即截断。要保留原内容请用 `ios::app`（追加）或 `ios::in | ios::out`（读写保留）。'
    },
    {
      id: 'cppf2-q2',
      question: '逐行读取文件的标准写法是？',
      options: [
        '`while (!in.eof()) { getline(in, line); ... }`',
        '`while (std::getline(in, line)) { ... }`',
        '`while (in >> line) { ... }`',
        '`for (int i = 0; i < 100; i++) getline(in, line);`'
      ],
      answer: 1,
      explanation:
        '`getline` 返回流对象，在布尔上下文中表示「这次读取是否成功」。用 `while (!in.eof())` 会多处理一遍旧数据——`eof` 要等读失败之后才为真。`in >> line` 只读一个词。'
    },
    {
      id: 'cppf2-q3',
      question: '相比 C 的 `FILE*`，C++ 文件流最直接的收益是？',
      options: [
        '文件读写速度更快',
        '不用格式串、类型安全，且析构函数自动关闭文件',
        '可以读写任意大小的文件',
        '不需要检查打开是否成功'
      ],
      answer: 1,
      explanation:
        '`<<` / `>>` 由变量类型决定如何转换，不用写 `%d`；文件流对象在析构时自动 `close`，提前返回或抛异常都不会漏关。打开是否成功仍然必须自己检查。'
    }
  ]
};

export default lesson;
