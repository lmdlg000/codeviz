import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'cpp-refs',
  chapterId: 'cpp-start',
  order: 3,
  title: '引用：给变量起个别名',
  subtitle: '`int& r = a;` 之后 r 就是 a 的另一个名字——改 r 就是改 a',
  description:
    '讲清引用的本质、与指针的区别、`const T&` 参数为什么是 C++ 的默认写法，以及返回引用的坑。',
  difficulty: 2,
  minutes: 22,
  objectives: [
    '说清引用是「别名」而不是新变量，并解释它为什么必须初始化',
    '用引用参数写出真正能交换两个变量的 `swap(int&, int&)`',
    '用 `const T&` 传参避免拷贝，并说明什么时候必须加 `const`',
    '区分「返回引用」与「返回副本」，避免返回局部变量的引用',
    '列出引用与指针的五个关键差异'
  ],
  blocks: [
    {
      type: 'text',
      body:
        '指针用「地址」间接访问变量，写起来要 `*`、`&` 到处飞。C++ 提供了另一种方式：**引用**（reference）。它不是新变量，也不占独立存储，就是给已有变量起的一个**别名**。\n\n' +
        '`int& r = a;` 之后，`r` 和 `a` 是同一块内存的两个名字。改 `r` 就是改 `a`，取 `&r` 拿到的还是 `a` 的地址。'
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'ref_basic.cpp',
      caption: '`r` 不是副本：`r = 20` 之后 `a` 也变成 20。',
      code: `#include <iostream>

int main() {
  int a = 10;
  int& r = a;          // r 是 a 的别名，不是拷贝

  r = 20;
  std::cout << "a = " << a << std::endl;   // 20
  std::cout << "r = " << r << std::endl;   // 20

  a = 30;
  std::cout << "r = " << r << std::endl;   // 30
  return 0;
}
`
    },
    {
      type: 'note',
      tone: 'warn',
      title: '两条硬规则：必须初始化，不能改绑',
      body:
        '引用在定义时必须绑定到一个已存在的对象（没有「空引用」），而且绑定之后**不能改绑**到别的变量。`int& r;` 编译不过；`r = b;` 不是让 r 指向 b，而是把 b 的值赋给 r 指向的那个变量。需要「指向谁可以变」时，用指针。'
    },
    {
      type: 'table',
      headers: ['维度', '引用 `int& r = a;`', '指针 `int* p = &a;`'],
      rows: [
        ['是什么', 'a 的别名，不是独立对象', '独立变量，存的是地址'],
        ['能否为空', '不能，必须绑定对象', '可以 `nullptr`'],
        ['能否改绑', '不能', '可以 `p = &b;`'],
        ['访问方式', '直接用 `r`', '要解引用 `*p`'],
        ['占用空间', '通常不占（编译器实现为地址）', '占一个指针大小'],
        ['典型用途', '函数参数、返回值、运算符重载', '动态内存、可空关系、C 接口']
      ]
    },
    { type: 'heading', text: '一、引用做参数：真正能改变实参' },
    {
      type: 'code',
      language: 'cpp',
      title: 'swap.cpp',
      caption: '引用参数在函数内部就是实参本身，所以交换能生效。',
      code: `#include <iostream>

void swapByRef(int& x, int& y) {
  int temp = x;
  x = y;
  y = temp;
}

int main() {
  int a = 1;
  int b = 2;
  swapByRef(a, b);
  std::cout << a << " " << b << std::endl;   // 2 1
  return 0;
}
`
    },
    {
      type: 'text',
      body:
        'C 里要写 `void swap(int *x, int *y)`，调用时还得 `swap(&a, &b)`。C++ 用引用把这两步合并了：调用处看不到 `&` 和 `*`，语义仍然是「传进去的是本体」。\n\n' +
        '由此引出 C++ 里最常见的参数写法——**`const T&`**：既避免拷贝（大对象、`std::string`、`std::vector`），又保证函数不会改到你。'
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'const_ref.cpp',
      caption: '传 `const std::string&` 不会拷贝字符串，也不会改到它。',
      code: `#include <iostream>
#include <string>

// 按值传参：拷贝一份，函数里改的是副本
void byValue(std::string s) {
  s += "!";
}

// 按 const 引用传参：不拷贝，也不允许改
void byConstRef(const std::string& s) {
  std::cout << "长度 " << s.size() << std::endl;
}

int main() {
  std::string name = "CodeViz";
  byValue(name);
  std::cout << name << std::endl;    // 仍然是 CodeViz

  byConstRef(name);
  return 0;
}
`
    },
    {
      type: 'note',
      tone: 'tip',
      title: '参数怎么选：一句话规则',
      body:
        '内置类型（`int`、`double`、指针）按值传；其它一律 `const T&`。需要修改实参时才用非 const 引用 `T&`。返回值同理：小对象按值返回，大对象返回 `const T&`（但绝不能返回局部变量的引用）。'
    },
    { type: 'heading', text: '二、引用做返回值：能改到「原对象」' },
    {
      type: 'code',
      language: 'cpp',
      title: 'return_ref.cpp',
      caption: '返回引用让 `get(0) = 99` 这种写法成立——左值引用返回的是本体。',
      code: `#include <iostream>

int& at(int* data, int index) {
  return data[index];          // 返回的是那个元素本身
}

int main() {
  int arr[3] = {10, 20, 30};
  at(arr, 0) = 99;             // 通过返回的引用直接改元素
  std::cout << arr[0] << std::endl;   // 99
  return 0;
}
`
    },
    {
      type: 'note',
      tone: 'danger',
      title: '不要返回局部变量的引用',
      body:
        '函数返回后局部变量已销毁，引用指向的是「已经不存在的东西」，再去读写就是未定义行为。`int& bad() { int x = 1; return x; }` 编译可能只给警告，运行却时对时错——这类 bug 最难查。'
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
        {
          mistake: '以为 `r = b` 能让引用改绑到 b',
          wrong: 'int a = 1, b = 2;\nint& r = a;\nr = b;      // 改的是 a，不是让 r 指向 b',
          right: 'int* p = &a;\np = &b;     // 需要改指向就用指针',
          why: '引用一旦绑定就不能改绑，`r = b` 只是把 b 的值赋给 a。'
        },
        {
          mistake: '定义引用时没初始化',
          wrong: 'int& r;',
          right: 'int a = 0;\nint& r = a;',
          why: '引用必须绑定到已存在的对象，不存在「空引用」，编译器会直接报错。'
        },
        {
          mistake: '返回局部变量的引用',
          wrong: 'int& bad() { int x = 1; return x; }',
          right: 'int good() { return 1; }',
          why: '函数结束局部变量就销毁了，返回的引用悬空，继续使用是未定义行为。'
        },
        {
          mistake: '大对象按值传参',
          wrong: 'void print(std::vector<int> v);',
          right: 'void print(const std::vector<int>& v);',
          why: '按值传参会整份拷贝，几千个元素就是几千次复制；`const T&` 既快又安全。'
        },
        {
          mistake: '把 `const T&` 当成「函数里可以改」',
          wrong: 'void f(const std::string& s) { s += "x"; }',
          right: 'void f(std::string& s) { s += "x"; }',
          why: '`const` 引用只读；要修改实参必须用非 const 引用（且实参不能是常量）。'
        }
      ]
    }
  ],
  keyPoints: [
    '引用是别名，必须初始化、不能改绑，不存在空引用。',
    '引用参数能让函数直接改到实参，调用处不用写 `&` / `*`。',
    '`const T&` 是 C++ 的默认传参方式：不拷贝、不改动，适合所有非内置类型。',
    '返回引用可以让调用方改到原对象，但绝不能返回局部变量的引用。',
    '要「可空、可改绑」就用指针；要「一定存在、就是它本身」就用引用。'
  ],
  quiz: [
    {
      id: 'cppr-q1',
      question: '执行 `int a = 1; int& r = a; r = 5;` 之后，`a` 的值是？',
      options: ['1', '5', '0', '未定义'],
      answer: 1,
      explanation:
        '`r` 是 `a` 的别名，二者是同一块内存的两个名字，给 `r` 赋值就是给 `a` 赋值。'
    },
    {
      id: 'cppr-q2',
      question: '为什么大对象参数推荐写成 `const std::string&`？',
      options: [
        '语法更短，看起来更专业',
        '避免整份拷贝，同时保证函数不会修改实参',
        '可以传空值',
        '只有这样才能返回字符串'
      ],
      answer: 1,
      explanation:
        '按值传参会拷贝整个对象；`const T&` 只传引用（本质是地址），并加了只读约束。注意引用本身不能为空，需要「可空」请用指针。'
    },
    {
      id: 'cppr-q3',
      question: '下面哪个函数是安全的？',
      options: [
        '`int& f() { int x = 1; return x; }`',
        '`int f() { int x = 1; return x; }`',
        '`int& f(int n) { return n; }`',
        '`int& f() { return *(new int(1)); }`（不 delete）'
      ],
      answer: 1,
      explanation:
        '按值返回的是副本，函数结束后副本仍然有效。返回局部变量的引用（或按值传参的形参引用）都会悬空；最后一项虽然内存还在，但没人释放，属于泄漏。'
    }
  ]
};

export default lesson;
