import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c13-templates',
  chapterId: 'cpp-oop',
  order: 3,
  title: '模板与 STL：写出通用的代码',
  subtitle: '让类型成为参数，让标准库替你干活',
  description:
    '从函数模板、类模板到 STL 容器与算法：用 template 写出与类型无关的代码，再用 vector、string、sort 和范围 for 完成真实的数据处理。',
  difficulty: 3,
  minutes: 45,
  objectives: [
    '写出函数模板与类模板，说明模板在编译期如何按类型实例化。',
    '用 vector 保存一组数据，完成遍历、求和、排序等常见操作。',
    '正确使用 auto、范围 for 与 sort，并理解它们背后的迭代器。',
    '说出 vector 下标访问与 at 的区别，以及迭代器失效的常见场景。',
  ],
  blocks: [
    {
      type: 'text',
      body:
        '写一个求两个数较大值的函数并不难，难的是 int、double、string 各来一份，逻辑一模一样，却要复制三遍。C++ 的模板（template）把“类型”也变成参数，让一份代码服务多种类型。标准模板库（STL，Standard Template Library）则是模板最成功的应用：vector、string、sort 都建立在模板之上。这一课先学会写简单的模板，再学会用 STL 解决真实的数据处理问题。',
    },
    {
      type: 'heading',
      text: '一、函数模板：把类型变成参数',
    },
    {
      type: 'text',
      body:
        '函数模板（function template）的写法是在函数前加一行 `template <typename T>`，其中 T 是类型参数（type parameter），可以理解成“待填的类型占位符”。调用 `maxValue(3, 9)` 时，编译器从实参推导出 T 是 int，并生成一个 int 版本；调用 `maxValue(2.5, 1.5)` 时再生成 double 版本。这个过程叫模板实例化（instantiation），发生在编译期，运行时没有额外开销。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'max_value.cpp',
      code: `#include <iostream>
#include <string>

template <typename T>
T maxValue(const T& a, const T& b) {
  return a > b ? a : b;
}

int main() {
  std::cout << maxValue(3, 9) << std::endl;
  std::cout << maxValue(2.5, 1.5) << std::endl;
  std::cout << maxValue(std::string("apple"), std::string("pear")) << std::endl;
  return 0;
}`,
      caption:
        '一份比较逻辑，三种类型复用；编译器分别为 int、double、std::string 生成一个函数。',
    },
    {
      type: 'text',
      body:
        '模板不是宏。宏只是文本替换，容易出现奇怪的优先级错误，而且不做类型检查；模板展开后是真正的函数，编译器会检查类型是否支持 `>`，错误信息虽然长，但问题定位准确。参数写成 `const T&` 可以避免拷贝大对象，又允许传入临时值。也可以显式指定模板参数，例如 `maxValue<double>(2, 3.5)` 会强制按 double 比较。',
    },
    {
      type: 'text',
      body:
        '有一个必须知道的工程细节：模板的定义通常要放在头文件里。编译器在调用处需要看到完整定义才能实例化，如果把定义藏在 .cpp 里，链接阶段就会找不到对应版本。初学阶段把模板和调用写在同一个文件里即可，等写多文件项目时再把它放进 `.h`。',
    },
    {
      type: 'text',
      body:
        '类型推导也有边界：`maxValue(3, 2.5)` 会让编译器从两个实参推导出不同的 T（int 和 double），于是报错；把调用改成 `maxValue<double>(3, 2.5)`，或让两个实参类型一致，就能通过。模板报错通常很长，但真正有用的信息往往在最后一行：到底是哪个类型不满足要求。',
    },
    {
      type: 'heading',
      text: '二、类模板：带类型的容器',
    },
    {
      type: 'text',
      body:
        '类模板（class template）把类型参数用在类上。比如栈可以存 int、double、string，但“后进先出”的逻辑完全一样，于是写成 `template <typename T> class Stack`，成员 `T items_[8]` 的元素类型随 T 变化。使用时要提供具体类型：`Stack<int> stack;`、`Stack<std::string> names;`，编译器会分别生成两个独立的类。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'stack.cpp',
      code: `#include <iostream>

template <typename T>
class Stack {
public:
  Stack() { top_ = -1; }

  bool empty() const { return top_ == -1; }
  bool full() const { return top_ == kCapacity - 1; }

  bool push(const T& value) {
    if (full()) {
      return false;
    }
    top_++;
    items_[top_] = value;
    return true;
  }

  bool pop(T& value) {
    if (empty()) {
      return false;
    }
    value = items_[top_];
    top_--;
    return true;
  }

private:
  static const int kCapacity = 8;
  T items_[kCapacity];
  int top_ = -1;
};

int main() {
  Stack<int> stack;
  stack.push(10);
  stack.push(20);
  stack.push(30);

  int value = 0;
  while (stack.pop(value)) {
    std::cout << value << " ";
  }
  std::cout << std::endl;
  return 0;
}`,
      caption:
        '`Stack<T>` 是模板，`Stack<int>` 才是真正的类型；push 与 pop 共用同一份逻辑，却适用于任何类型。',
    },
    {
      type: 'text',
      body:
        '栈的内部用数组和栈顶下标实现：`top_` 为 -1 表示空；push 先检查是否已满，再把元素放到 `++top_` 的位置；pop 先检查是否为空，再把 `top_` 位置的元素交给调用者。`full()` 里用到 `kCapacity`，它是 `static const int`，在类内初始化，编译器会把它当作常量表达式处理。',
    },
    {
      type: 'note',
      tone: 'tip',
      title: '类模板成员函数写到类外时',
      body:
        '不能只写 `void Stack<T>::push(...)`，前面还要保留 `template <typename T>`。漏掉这一行，编译器会把 T 当成未知类型。也正因为实例化需要完整定义，类模板通常整个写在头文件里。',
    },
    {
      type: 'heading',
      text: '三、STL：容器、迭代器与算法',
    },
    {
      type: 'text',
      body:
        'STL 由三部分配合而成：容器（container）负责存数据，迭代器（iterator）负责在容器里移动，算法（algorithm）负责处理一段区间。`vector` 是最常用的容器，本质是一块可以自动扩容的动态数组；`string` 是管理字符序列的容器；`sort` 是 `<algorithm>` 里的算法。它们都住在 `std` 命名空间里。',
    },
    {
      type: 'compare',
      left: {
        title: '固定长度的数组',
        language: 'cpp',
        code: `int scores[5] = {72, 95, 88, 60, 100};
int n = 5;`,
      },
      right: {
        title: '可增长的 vector',
        language: 'cpp',
        code: `#include <vector>

std::vector<int> scores = {72, 95, 88, 60, 100};
int n = static_cast<int>(scores.size());`,
      },
      caption:
        '数组的长度写在类型里，改不了；vector 的长度随元素增减，`size()` 随时告诉你现在有几个元素。',
    },
    {
      type: 'text',
      body:
        '数组的长度在编译期固定，`vector` 可以随时 `push_back` 追加元素，`size()` 返回当前元素个数，`capacity()` 返回已经申请好的容量。扩容时 vector 会申请更大的内存、搬走旧元素，因此扩容后原来的迭代器和元素指针可能失效；好在按倍数增长让 push_back 的均摊代价保持 O(1)。`sort(v.begin(), v.end())` 里的 `begin/end` 是一对迭代器，构成“从头到尾后一位”的半开区间，算法只认区间，不关心容器内部长什么样。',
    },
    {
      type: 'text',
      body:
        '另一个常用容器是 `std::string`：它管理一串字符，可以拼接、取长度、按下标访问，还会自动处理内存。读入一个单词用 `std::string word; std::cin >> word;`，比固定长度的字符数组安全得多，因为 string 会按需要增长。`string` 的下标访问与 vector 类似，`s.size()` 同样返回字符个数，`s[0]` 就是第一个字符。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'scores.cpp',
      code: `#include <algorithm>
#include <iostream>
#include <vector>

int main() {
  std::vector<int> scores = {72, 95, 88, 60, 100};
  scores.push_back(78);
  std::cout << "size = " << scores.size() << std::endl;

  int sum = 0;
  for (int score : scores) {
    sum += score;
  }
  std::cout << "sum = " << sum << std::endl;

  std::sort(scores.begin(), scores.end());
  std::cout << "sorted: ";
  for (int score : scores) {
    std::cout << score << " ";
  }
  std::cout << std::endl;
  return 0;
}`,
      caption:
        'push_back 追加、范围 for 求和、sort 原地升序排序：这三招覆盖了 vector 最常用的场景。',
    },
    {
      type: 'text',
      body:
        '范围 for（range-based for）`for (int score : scores)` 会自动从头到尾遍历容器，比分下标更简洁，也不容易写错边界。它本质上是迭代器循环的语法糖。注意它默认按值复制每个元素：只读取时这样写没问题；要修改元素必须写 `for (int& score : scores)`。`auto` 让编译器替我们写类型，遇到很长的迭代器类型时尤其省事，但不要滥用，关键变量的类型写清楚更容易读。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'range_for.cpp',
      code: `#include <iostream>
#include <vector>

int main() {
  std::vector<int> scores = {60, 75, 88};

  for (int& score : scores) {
    score = score + 5;
  }

  for (auto score : scores) {
    std::cout << score << " ";
  }
  std::cout << std::endl;

  auto count = scores.size();
  std::cout << "count = " << count << std::endl;
  return 0;
}`,
      caption:
        '加引用才能改到容器里的元素；只读取时用 `auto` 让编译器推导类型，代码更短。',
    },
    {
      type: 'heading',
      text: '四、一次遍历的两种视图',
    },
    {
      type: 'text',
      body:
        '无论容器怎么变，“遍历求和”这个套路都没有变：准备一个累加变量，从头访问每个元素，把值加进去，最后输出或返回。先用单步执行看一个普通数组的例子，再用流程图看一个接收 vector 的函数，两相对照，STL 的语法就不再神秘。',
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'trace',
        code: `#include <iostream>

int main() {
  int scores[4] = {72, 95, 88, 60};
  int sum = 0;

  for (int i = 0; i < 4; i++) {
    sum += scores[i];
  }

  std::cout << "sum = " << sum << std::endl;
  return 0;
}`,
      },
      title: '单步执行：数组求和',
      caption:
        '播放一遍，观察 `i` 从 0 走到 3，`sum` 依次变成 72、167、255、315。',
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'flow',
        functionName: 'sumScores',
        code: `#include <iostream>
#include <vector>

int sumScores(const std::vector<int>& scores) {
  int sum = 0;
  for (int i = 0; i < scores.size(); i++) {
    sum += scores[i];
  }
  return sum;
}

int main() {
  std::vector<int> scores = {72, 95, 88, 60};
  std::cout << "sum = " << sumScores(scores) << std::endl;
  return 0;
}`,
      },
      title: '函数流程图：遍历 vector 求和',
      caption:
        '循环判断、累加与回边被画成一条清楚的路径；换成其他容器，这张图的骨架也不会变。',
    },
    {
      type: 'text',
      body:
        '把这两种图记在心里，之后遇到“求平均分”“统计及格人数”“找最大值”都能套用：初始化结果、遍历每一个元素、按条件更新结果、最后返回。容器和算法只是让这四步写起来更安全、更通用。',
    },
    {
      type: 'text',
      body:
        '想自己验证也很简单：把 `std::vector` 换成长度固定的数组，把 `sumScores` 的参数从 const 引用改成数组，流程图的骨架不会变——变的只是“数据怎么存”和“长度从哪来”。理解到这一层，就不会被容器的名字吓到，而是能先画出算法的主干，再挑合适的容器去实现。',
    },
    {
      type: 'heading',
      text: '五、易错点',
    },
    {
      type: 'list',
      items: [
        '忘记 `#include <vector>`、`#include <algorithm>` 或 `#include <string>`，编译会报类型或函数找不到。',
        '`sort` 的第二个参数写成 `v.end() - 1`，最后一个元素没参加排序；尾后迭代器才是正确终点。',
        '用 `for (int score : scores)` 修改 score，容器里的值不会变；要修改请用引用。',
        '对空 vector 调用 `front()`、`back()` 是未定义行为，调用前先判断 `empty()`。',
        '模板的声明和实现被拆到不同文件，编译能过但链接失败。',
        '`vector::size()` 返回无符号类型，直接和 int 比较可能产生警告；统一用 `std::size_t` 更稳妥。',
      ],
    },
    {
      type: 'note',
      tone: 'warn',
      title: '下标访问与 at',
      body:
        '`v[i]` 不检查下标，越界会破坏内存；`v.at(i)` 会检查并抛出 `std::out_of_range` 异常。教学代码里两者都能用，真实项目里对不受信任的下标优先用 `at`。另外，空 vector 的 `begin() == end()`，循环体一次都不会执行，这通常是你想要的行为。',
    },
    {
      type: 'heading',
      text: '六、小结',
    },
    {
      type: 'text',
      body:
        '模板把类型抽象成参数，STL 把常用数据结构和算法做成现成工具。学会 vector 的增、查、改、排，再配合范围 for、auto 与 sort，已经能解决大部分入门数据处理任务。模板的语法细节很多，先掌握“定义模板、使用时提供类型、编译期实例化”这条主线，遇到复杂报错时从第一条错误看起。',
    },
    {
      type: 'try',
      language: 'cpp',
      code: `#include <algorithm>
#include <iostream>
#include <vector>

int main() {
  std::vector<int> scores = {72, 95, 88, 90, 100};
  int above90 = 0;
  for (int score : scores) {
    if (score >= 90) {
      above90++;
    }
  }

  std::sort(scores.begin(), scores.end());
  std::cout << "90+ count = " << above90 << std::endl;
  std::cout << "top = " << scores.back() << std::endl;
  return 0;
}`,
      prompt:
        '在实验室里把阈值改成变量，再对每个元素加 5 分（记得把范围 for 改成引用），最后用 `scores.front()` 和 `scores.back()` 输出排序后的最低分与最高分。',
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
    {
      mistake: "把模板函数定义写进 .cpp 且没有实例化",
      wrong: "// a.h 只放声明，a.cpp 放定义",
      right: "模板定义直接写在头文件里",
      why: "模板在编译期按实参类型生成代码，编译器看不到定义就无法实例化，链接时会报未定义。"
    },
    {
      mistake: "模板参数类型推导冲突",
      wrong: "template <class T> T max(T a, T b);\nmax(1, 2.5);",
      right: "max<double>(1, 2.5);  或 max(1.0, 2.5);",
      why: "两个实参类型不同时 T 推导不出唯一类型，需要显式指定或统一类型。"
    },
    {
      mistake: "模板里用了不支持的操作却不报错在定义处",
      wrong: "template <class T> T add(T a, T b) { return a + b; }\nadd(a, b); // 用了没有 + 的类型",
      right: "为类型提供 operator+，或改用支持的类型",
      why: "模板定义本身不检查具体类型，只有实例化时才暴露错误，报错信息通常很长，先看第一行。"
    }
      ]
    },
  ],
  keyPoints: [
    '`template <typename T>` 声明类型参数，编译器在编译期按实参类型实例化出具体函数或类。',
    '函数模板与类模板都只是“图纸”，只有被使用时才实例化；模板定义通常放在头文件。',
    'vector 是自动扩容的动态数组，size() 是元素个数，capacity() 是当前容量。',
    '范围 for 按值遍历会复制元素；修改元素必须写 `for (int& x : v)`。',
    'sort 接收迭代器区间，默认升序，直接原地修改容器；使用前要包含 `<algorithm>`。',
  ],
  quiz: [
    {
      id: 'c13-q1',
      question: '函数模板通常在什么时候被实例化？',
      options: [
        '程序运行时根据用户输入决定',
        '编译期，根据调用处推导或显式指定的类型生成具体函数',
        '第一次调用时由操作系统动态生成',
        '只有把模板参数写成 int 时才会实例化',
      ],
      answer: 1,
      explanation:
        '模板是一份“图纸”，编译器在看到具体调用（或显式指定模板参数）时，用实际类型替换 T，生成对应的函数版本。实例化发生在编译期，运行时没有查找类型的额外开销。',
    },
    {
      id: 'c13-q2',
      question: '执行 `for (int score : scores)` 时，修改 score 会发生什么？',
      options: [
        '会同时修改 vector 中对应的元素',
        '只修改循环变量这份拷贝，vector 里的元素不变',
        '编译错误，循环变量不能被赋值',
        '会删除 vector 中对应的元素',
      ],
      answer: 1,
      explanation:
        '范围 for 默认把每个元素按值复制给循环变量，修改循环变量只影响副本。若想修改容器元素，应写成 `for (int& score : scores)`，让循环变量成为元素的引用。',
    },
    {
      id: 'c13-q3',
      question: '`std::sort(v.begin(), v.end())` 的作用是？',
      options: [
        '创建一个排好序的新 vector 并返回',
        '对 v 中的元素原地升序排序，v 本身被修改',
        '只排序 v 的前一半元素',
        '删除 v 中的重复元素',
      ],
      answer: 1,
      explanation:
        'sort 接收一对迭代器，对半开区间 `[begin, end)` 内的元素原地排序，默认使用 `<` 比较、结果升序。它返回 void，排序结果直接体现在原容器里。',
    },
  ],
  labSampleId: 'stl-vector',
};

export default lesson;
