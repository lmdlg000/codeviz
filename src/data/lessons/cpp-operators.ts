import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'cpp-operators',
  chapterId: 'cpp-oop',
  order: 2,
  title: '运算符重载：让自定义类型也用 + 和 <<',
  subtitle: '把 `a + b`、`cout << a` 变成你自己的函数，写起来像内置类型',
  description:
    '讲清运算符重载的成员/非成员两种写法、`<<` 为什么必须写成友元、返回值类型怎么定，以及哪些运算符不该重载。',
  difficulty: 3,
  minutes: 28,
  objectives: [
    '用成员函数重载 `+=`、`==`，用非成员（friend）函数重载 `+` 与 `<<`',
    '说明运算符重载函数的返回值类型该怎么选：`T&` 还是 `T`',
    '写出支持 `cout << obj << endl` 链式输出的 `operator<<`',
    '区分前置 `++x` 与后置 `x++` 的签名差异',
    '列出不该重载的运算符，并解释原因'
  ],
  blocks: [
    {
      type: 'text',
      body:
        '自定义类型默认只支持赋值。你写 `a + b`，编译器不知道该怎么加；写 `cout << a`，它也不知道该打印什么。**运算符重载**就是把这些符号变成函数：`a + b` 等价于 `operator+(a, b)`，`a += b` 等价于 `a.operator+=(b)`。\n\n' +
        '它不是「发明新语法」，而是给已有符号一个对自定义类型说得通的实现——所以重载之后的行为必须符合直觉：`+` 就该像加法，`==` 就该判断相等。'
    },
    { type: 'heading', text: '一、两种写法：成员函数与友元函数' },
    {
      type: 'table',
      headers: ['写法', '适用运算符', '调用形式', '典型例子'],
      rows: [
        ['成员函数', '会修改自身：`+=`、`-=`、`++`、`[]`、`()`', '`a.op(b)`', '`a += b`'],
        ['非成员（friend）', '对称、需要左操作数不是本类型：`+`、`-`、`*`、`==`、`<<`', '`op(a, b)`', '`a + b`、`cout << a`']
      ]
    },
    {
      type: 'text',
      body:
        '为什么 `+` 建议写成非成员？因为 `a + b` 两边地位对等，写成成员会变成 `a.op(b)`，一旦左边不是你的类型（比如 `2 + a`）就无法匹配。而 `+=` 天然是「改左边那个对象」，写成成员最自然。'
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'point_ops.cpp',
      caption: '`+=` 用成员（改自己），`+` 用非成员（保持对称），`<<` 用 friend（左边是 ostream）。',
      code: `#include <iostream>

class Point {
  int x;
  int y;
public:
  Point(int x = 0, int y = 0) : x(x), y(y) {}

  // 成员：修改自身，返回 *this 的引用以支持链式 a += b += c
  Point& operator+=(const Point& o) {
    x += o.x;
    y += o.y;
    return *this;
  }

  bool operator==(const Point& o) const {
    return x == o.x && y == o.y;
  }

  int getX() const { return x; }
  int getY() const { return y; }

  // 非成员：需要读私有成员，所以声明为 friend
  friend Point operator+(const Point& a, const Point& b);
  friend std::ostream& operator<<(std::ostream& os, const Point& p);
};

Point operator+(const Point& a, const Point& b) {
  return Point(a.getX() + b.getX(), a.getY() + b.getY());
}

std::ostream& operator<<(std::ostream& os, const Point& p) {
  os << "(" << p.getX() << ", " << p.getY() << ")";
  return os;
}

int main() {
  Point a(1, 2);
  Point b(3, 4);
  Point c = a + b;            // operator+(a, b)
  std::cout << "c = " << c << std::endl;

  a += b;                     // a.operator+=(b)
  std::cout << "a = " << a << std::endl;
  std::cout << (a == b) << std::endl;
  return 0;
}
`
    },
    {
      type: 'note',
      tone: 'tip',
      title: '`operator<<` 为什么必须是非成员',
      body:
        '`cout << p` 的左操作数是 `std::ostream`，不是你写的类，所以它不可能成为你的成员函数。只能写成全局的 `operator<<(ostream&, const T&)`，需要访问私有成员时再声明为 `friend`。返回 `ostream&` 是为了支持 `cout << a << b` 链式输出。'
    },
    { type: 'heading', text: '二、返回值类型：`T&` 还是 `T`' },
    {
      type: 'table',
      headers: ['运算符', '返回类型', '原因'],
      rows: [
        ['`+=` `-=` `*=`', '`T&`', '返回自身引用，才能 `a += b += c`，也避免多一次拷贝'],
        ['`+` `-` `*`', '`T`（按值）', '结果是新对象，返回引用会指向局部变量'],
        ['`==` `<`', '`bool`', '只回答真假'],
        ['`<<` `>>`', '`ostream&` / `istream&`', '链式调用'],
        ['`++x`（前置）', '`T&`', '先自增，返回自增后的自己'],
        ['`x++`（后置）', '`T`', '返回自增前的副本，所以要按值']
      ]
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'inc_dec.cpp',
      caption: '后置版本多一个 `int` 占位参数——这是编译器区分前置/后置的唯一办法。',
      code: `#include <iostream>

class Counter {
  int n;
public:
  Counter(int n = 0) : n(n) {}

  // 前置：++c
  Counter& operator++() {
    n += 1;
    return *this;
  }

  // 后置：c++（int 是占位参数，不用传）
  Counter operator++(int) {
    Counter old = *this;
    n += 1;
    return old;
  }

  int value() const { return n; }
};

int main() {
  Counter c(5);
  std::cout << (++c).value() << std::endl;   // 6
  std::cout << (c++).value() << std::endl;   // 6（返回旧值）
  std::cout << c.value() << std::endl;       // 7
  return 0;
}
`
    },
    { type: 'heading', text: '三、哪些运算符不该重载' },
    {
      type: 'list',
      ordered: true,
      items: [
        '`&&`、`||`：重载后**短路求值会消失**，`a && b` 两边都会被执行，和内置语义不一致。',
        '`,`（逗号）：重载后失去「从左到右求值」的保证，几乎没有正当用途。',
        '`&`（取地址）：除非你在写智能指针这类底层设施，否则不要动它。',
        '`::`、`.`、`.*`、`?:`、`sizeof`：语言规定**不可重载**。'
      ]
    },
    {
      type: 'note',
      tone: 'danger',
      title: '重载要「像那么回事」',
      body:
        '运算符重载最大的风险是可读性：把 `+` 实现成「删除元素」能编译，但没人看得懂。经验法则——**如果这个符号的直觉含义说不通，就不要重载，写一个有名字的函数**（比如 `append()`、`merge()`）。'
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
        {
          mistake: '`operator+` 返回引用',
          wrong: 'Point& operator+(const Point& a, const Point& b) {\n  Point t(a.x + b.x, 0);\n  return t;   // 返回局部变量',
          right: 'Point operator+(const Point& a, const Point& b) {\n  return Point(a.x + b.x, 0);',
          why: '`+` 产生的是新对象，返回局部变量的引用会悬空，运行结果时对时错。'
        },
        {
          mistake: '`operator<<` 返回 void',
          wrong: 'void operator<<(ostream& os, const Point& p);',
          right: 'ostream& operator<<(ostream& os, const Point& p);',
          why: '返回 `ostream&` 才能继续接 `<<`；返回 void 之后 `cout << a << endl` 编译不过。'
        },
        {
          mistake: '把 `operator==` 写成成员却忘了 `const`',
          wrong: 'bool operator==(const Point& o) { ... }',
          right: 'bool operator==(const Point& o) const { ... }',
          why: '常量对象只能调用 const 成员函数；漏写 const 会让 `const Point` 无法比较。'
        },
        {
          mistake: '`+=` 返回 void 或 T 值',
          wrong: 'void operator+=(const Point& o);',
          right: 'Point& operator+=(const Point& o);',
          why: '返回 void 不能链式 `a += b += c`；返回值会多一次拷贝，且语义上「改的是自己」应返回引用。'
        },
        {
          mistake: '重载 `&&` / `||`',
          wrong: 'bool operator&&(const T& a, const T& b);',
          right: '不要重载，直接用普通函数或保持内置语义',
          why: '重载后两个操作数都会被求值，短路语义丢失；而很多人依赖短路写法（如 `p && p->x`）。'
        }
      ]
    }
  ],
  keyPoints: [
    '`a + b` 会被翻译成 `operator+(a, b)`，`a += b` 翻译成 `a.operator+=(b)`。',
    '会修改自身的运算符（`+=`、`++`）写成成员并返回 `T&`；对称的 `+`、比较与 `<<` 写成非成员。',
    '`operator<<` 的左操作数是流对象，只能是非成员，需要访问私有成员时加 `friend`。',
    '后置 `x++` 靠一个 `int` 占位参数与前置 `++x` 区分，并返回自增前的副本。',
    '`&&`、`||`、`,`、`&` 不该重载；`::`、`.`、`?:`、`sizeof` 不能重载。'
  ],
  quiz: [
    {
      id: 'cppo-q1',
      question: '为什么 `operator<<(ostream&, const T&)` 不能写成 T 的成员函数？',
      options: [
        '成员函数不能带两个参数',
        '左操作数是 `ostream`，不是 T，成员函数要求左操作数是本类型',
        '成员函数不能返回引用',
        '必须用 `friend` 才能访问私有成员'
      ],
      answer: 1,
      explanation:
        '成员形式的运算符，左操作数固定是本类对象。`cout << p` 的左边是 `std::ostream`，所以只能写成非成员函数；需要读私有成员时再声明为 friend。'
    },
    {
      id: 'cppo-q2',
      question: '`Point& operator+=(const Point& o)` 返回 `Point&` 的主要好处是？',
      options: [
        '让编译更快',
        '支持 `a += b += c` 这样的链式写法，并避免返回时拷贝',
        '可以修改 const 对象',
        '自动生成 `operator+`'
      ],
      answer: 1,
      explanation:
        '`+=` 修改的是自身，返回 `*this` 的引用既符合语义，又能链式调用；返回 `Point` 会多一次拷贝，返回 void 则链式写法失效。'
    },
    {
      id: 'cppo-q3',
      question: '关于后置 `operator++(int)`，说法正确的是？',
      options: [
        '那个 int 参数是要传进去的值',
        '它是占位参数，用来和前置版本区分，调用时不用传',
        '它返回的是自增后的对象',
        '它必须返回引用'
      ],
      answer: 1,
      explanation:
        '语言规定用 `operator++()` 表示前置、`operator++(int)` 表示后置，那个 int 只是占位符，`c++` 调用时不会传值。后置需要返回自增前的副本，所以按值返回。'
    }
  ]
};

export default lesson;
