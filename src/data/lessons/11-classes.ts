import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c11-classes',
  chapterId: 'cpp-oop',
  order: 1,
  title: '类与对象：从结构体到蓝图',
  subtitle: '把数据和行为装进同一个类型',
  description:
    '从 struct 出发理解 C++ 的 class：用封装保护数据，用构造函数与析构函数管理对象的一生，再用 this、引用和默认参数写出自然的接口。',
  difficulty: 2,
  minutes: 40,
  objectives: [
    '说清楚类（class）与对象（object）的关系，并能把一组数据和操作封装成类。',
    '正确使用 public / private 设计公开接口，让类守住自己的数据不变量。',
    '写出带默认参数的构造函数，并解释构造与析构的调用时机和顺序。',
    '理解 this 指针、引用参数与 const 成员函数在类中的作用。',
  ],
  blocks: [
    {
      type: 'text',
      body:
        '上一章我们用结构体（struct）把一名学生的姓名和成绩装在了一起，但计算平均分、打印信息这些操作仍然散落在外面。C++ 的类（class）把数据和对数据的操作放进同一个类型里，既减少了“数据在 A 处、函数在 B 处”的割裂感，也让数据有了自我保护的能力。这一课我们从一个矩形出发，走完从结构体到类的这一步。',
    },
    {
      type: 'heading',
      text: '一、没有类的世界：数据靠约定对齐',
    },
    {
      type: 'text',
      body:
        '先回忆一下没有类时怎么写。假设要处理两个矩形，我们可能用两个数组分别保存宽和高，再用循环按下标把同一行的数据配成一对。程序能运行，但“第几个宽度对应第几个高度”全靠程序员记着，一旦某个数组少存一项，后面全部错位。更麻烦的是，任何代码都能随手把宽度改成负数，面积函数只能被动接受。',
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'trace',
        code: `#include <iostream>

int main() {
  int widths[2] = {4, 6};
  int heights[2] = {3, 2};
  int total = 0;

  for (int i = 0; i < 2; i++) {
    int area = widths[i] * heights[i];
    std::cout << "rect " << i << " area = " << area << std::endl;
    total += area;
  }

  std::cout << "total = " << total << std::endl;
  return 0;
}`,
      },
      title: '没有类时：两个数组靠下标对齐',
      caption:
        '单步执行观察 `i`、`area`、`total` 的变化。这段程序没有语法错误，但数据之间的关系只存在于程序员的记忆里。',
    },
    {
      type: 'text',
      body:
        '这段程序的问题不在语法，而在“数据之间的关系”没有被类型表达出来。C++ 的做法是定义一个 Rectangle 类型，让 `width` 和 `height` 成为它的数据成员（data member），让 `area` 成为它的成员函数（member function）。从此一个 `Rectangle` 对象（object）就是“一个宽度、一个高度、会算面积”的整体，而不是两个碰巧放得很近的变量。',
    },
    {
      type: 'heading',
      text: '二、封装：公开接口，隐藏实现',
    },
    {
      type: 'text',
      body:
        '类（class）是一种用户自定义类型，它把数据成员和成员函数写在同一个 `{}` 里。成员函数的函数体可以直接使用同类的数据成员，不需要像 C 那样把结构体变量作为参数传来传去。',
    },
    {
      type: 'text',
      body:
        '面向对象里最重要的习惯叫封装（encapsulation）：把数据藏起来，只通过公开的函数与外界打交道。C++ 用访问控制（access control）实现这一点：`public` 成员谁都能用，`private` 成员只有本类的成员函数能直接访问，`protected` 留给继承时使用。`class` 的默认访问级别是 `private`，而 `struct` 的默认是 `public`；此外，未写继承方式时，`class` 默认是 private 继承、`struct` 默认是 public 继承。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'rectangle.cpp',
      code: `#include <iostream>

class Rectangle {
public:
  Rectangle(double width, double height) {
    width_ = width > 0 ? width : 0;
    height_ = height > 0 ? height : 0;
  }

  double area() const {
    return width_ * height_;
  }

  double perimeter() const {
    return 2 * (width_ + height_);
  }

  void setWidth(double width) {
    if (width > 0) {
      width_ = width;
    }
  }

  double width() const { return width_; }
  double height() const { return height_; }

private:
  double width_ = 1.0;
  double height_ = 1.0;
};

int main() {
  Rectangle rect(4.0, 2.5);
  std::cout << "area = " << rect.area() << std::endl;
  std::cout << "perimeter = " << rect.perimeter() << std::endl;

  rect.setWidth(10.0);
  std::cout << "new width = " << rect.width() << std::endl;
  return 0;
}`,
      caption:
        '私有数据配合公开接口：外部只能通过 `setWidth` 修改宽度，而它会把非法值挡在门外。',
    },
    {
      type: 'text',
      body:
        '这段代码里，`width_`、`height_` 是私有成员，外部没法写 `rect.width_ = -5;`。想改宽度只能调用 `setWidth`，而 `setWidth` 会先检查参数是否大于 0；构造函数同样把非法值折成 0。这样类就守住了自己的不变量（invariant）——任何一个 Rectangle 对象的宽高都不会是负数。`area()` 后面的 `const` 表示这个成员函数承诺不修改对象，因此常量对象也能调用它。',
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'classes',
        code: `#include <iostream>

class Rectangle {
public:
  Rectangle(double width, double height) {
    width_ = width > 0 ? width : 0;
    height_ = height > 0 ? height : 0;
  }

  double area() const {
    return width_ * height_;
  }

  double perimeter() const {
    return 2 * (width_ + height_);
  }

  void setWidth(double width) {
    if (width > 0) {
      width_ = width;
    }
  }

  double width() const { return width_; }
  double height() const { return height_; }

private:
  double width_ = 1.0;
  double height_ = 1.0;
};`,
      },
      title: 'Rectangle 类图',
      caption:
        '类图把字段和方法的访问权限一目了然地画出来：`+` 是 public，`-` 是 private。',
    },
    {
      type: 'text',
      body:
        '类图（class diagram）是描述类结构的标准画法：每个方框分三格，依次是类名、数据成员、成员函数，前面的 `+` 表示 `public`，`-` 表示 `private`。以后读一个大程序时，先看类图就能知道它有哪些类型、每个类型对外提供什么能力。',
    },
    {
      type: 'note',
      tone: 'tip',
      title: 'struct 也能有成员函数',
      body:
        'C++ 中的 `struct` 同样可以定义构造函数和成员函数，和 `class` 的区别只在默认访问级别。代码风格上，常把“纯数据集合”写成 `struct`，把需要封装行为和维护不变量的类型写成 `class`。看到带函数的 `struct` 不必意外。',
    },
    {
      type: 'heading',
      text: '三、对象的生命周期：构造与析构',
    },
    {
      type: 'text',
      body:
        '对象从创建到销毁的过程叫生命周期（lifetime）。C++ 提供了两个特殊成员函数来把握这两个时刻。构造函数（constructor）的名字与类名相同、没有返回类型，在对象创建时自动调用；析构函数（destructor）写作 `~类名`，没有参数也没有返回类型，在对象离开作用域或被 `delete` 时自动调用。它们的调用由语言保证，不要像普通函数那样手动去调。',
    },
    {
      type: 'text',
      body:
        '构造函数的任务是“让对象一出生就处于合法状态”。它可以带参数，也可以重载多个版本；如果没有写任何构造函数，编译器会隐式提供一个默认构造函数。析构函数用来收拾对象用过的资源，例如释放 `new` 出来的内存、关闭文件。局部对象按创建顺序的逆序销毁；对象里的成员按声明顺序构造、按相反顺序析构。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'tracker.cpp',
      code: `#include <iostream>

class Tracker {
public:
  Tracker(const char* name) {
    name_ = name;
    ++alive_;
    std::cout << "create " << name_ << std::endl;
  }

  ~Tracker() {
    --alive_;
    std::cout << "destroy " << name_ << std::endl;
  }

  static int alive() { return alive_; }

private:
  const char* name_;
  static int alive_;
};

int Tracker::alive_ = 0;

int main() {
  Tracker a("A");
  {
    Tracker b("B");
    std::cout << "inside block: " << Tracker::alive() << std::endl;
  }
  std::cout << "after block: " << Tracker::alive() << std::endl;
  return 0;
}`,
      caption:
        '内层块结束时 `b` 立即析构，`main` 结束时 `a` 才析构；`alive_` 是所有对象共享的 static 成员。',
    },
    {
      type: 'text',
      body:
        '这段程序里，`Tracker` 的构造函数把 `alive_` 加一，析构函数把它减一。`b` 位于内层 `{}` 中，离开这个块时立刻销毁；`a` 在 `main` 结束时销毁。`static` 数据成员属于类而不是某个对象，所有对象共享同一份，所以用 `Tracker::alive()` 访问。静态成员要在类外定义并初始化一次：`int Tracker::alive_ = 0;`，否则链接时会找不到它。',
    },
    {
      type: 'list',
      items: [
        '构造函数没有返回类型，写成 `void Tracker()` 就不再是构造函数。',
        '`static` 成员函数没有 `this` 指针，不能直接访问非静态成员。',
        '对象销毁是自动的，手动调用析构函数几乎总是错误。',
      ],
    },
    {
      type: 'text',
      body:
        '数据不一定写死在代码里。下面的程序用 `std::cin` 读入宽和高，再把它们交给构造函数创建对象。输入值会先经过构造函数的校验：负数会被折成 0，所以对象一创建就处于合法状态。运行前在实验室的输入框里填两个数即可。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'input_rectangle.cpp',
      code: `#include <iostream>

class Rectangle {
public:
  Rectangle(double width, double height) {
    width_ = width > 0 ? width : 0;
    height_ = height > 0 ? height : 0;
  }

  double area() const { return width_ * height_; }

private:
  double width_;
  double height_;
};

int main() {
  double width = 0.0;
  double height = 0.0;

  std::cout << "Enter width and height: ";
  std::cin >> width >> height;

  Rectangle rect(width, height);
  std::cout << "area = " << rect.area() << std::endl;
  return 0;
}`,
      caption:
        '`std::cin >>` 把键盘输入写进变量，再作为实参传给构造函数；输入和对象的创建就这样接上了。',
    },
    {
      type: 'heading',
      text: '四、this、引用与默认参数',
    },
    {
      type: 'text',
      body:
        '每个非静态成员函数都隐藏着一个参数 `this`，它是指向当前对象的指针。调用 `rect.area()` 时，`this` 就是 `&rect`；在成员函数里写 `this->width_` 和直接写 `width_` 等价。什么时候需要显式写 `this`？最常见的是形参和成员同名，需要用 `this->` 区分；另一种是希望成员函数返回对象自己，从而支持链式调用。`*this` 表示当前对象本身，返回 `Counter&` 而不是 `Counter`，链式调用才不会复制对象。',
    },
    {
      type: 'text',
      body:
        '引用（reference）是给已有变量起的别名，`int& r = x;` 之后 `r` 与 `x` 是同一块内存。函数参数用 `int&` 可以修改实参且不产生拷贝，用 `const std::string&` 则既避免拷贝又禁止函数改动实参。引用在定义时必须绑定，之后不能改绑到别的对象。默认参数（default argument）让调用者可以省略末尾的参数，规则是：带默认值的参数必须从右往左连续排列，同一个参数的默认值只能写一次，通常写在声明处。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'counter.cpp',
      code: `#include <iostream>
#include <string>

class Counter {
public:
  Counter(int start = 0) { value_ = start; }

  void add(int step = 1) { value_ += step; }

  Counter& increase(int step = 1) {
    value_ += step;
    return *this;
  }

  void setName(const std::string& name) { name_ = name; }

  void print() const {
    std::cout << name_ << ": " << value_ << std::endl;
  }

private:
  int value_ = 0;
  std::string name_ = "counter";
};

int main() {
  Counter c(10);
  c.add();
  c.setName("demo");
  c.increase().increase(3).print();
  return 0;
}`,
      caption:
        '`this` 返回自身、`const std::string&` 避免拷贝、默认参数让调用更简洁，这三样常一起出现。',
    },
    {
      type: 'text',
      body:
        '`Counter(int start = 0)` 让 `Counter c;` 和 `Counter c(5);` 都合法。`increase` 返回 `Counter&`，所以 `c.increase().increase(3).print();` 能一路调用下去；`print() const` 里不能修改 `value_`，这是编译器强制的承诺。默认参数 `step = 1` 让 `add()` 与 `add(2)` 都可用，而 `this` 在需要区分同名参数时保证我们操作的是成员。',
    },
    {
      type: 'heading',
      text: '五、易错点',
    },
    {
      type: 'list',
      items: [
        '构造函数误写返回类型，编译器会把它当成普通成员函数，对象反而没有初始化。',
        '`this` 是指针，`*this` 才是对象；返回 `*this` 时返回类型要写引用 `Counter&`。',
        '在 `const` 成员函数里修改数据成员会直接编译失败；确实需要修改时可把成员声明为 `mutable`，但初学阶段先别用。',
        '默认参数重复写在声明和定义两处，编译器会报重定义错误。',
        '成员函数返回局部对象的引用会造成悬垂引用，函数结束后引用指向已销毁的内存。',
        '数据成员尽量在类内给默认值或在构造函数里初始化，未初始化的成员会带来不确定的值。',
      ],
    },
    {
      type: 'note',
      tone: 'warn',
      title: '封装不是把所有成员都设为 private',
      body:
        '只读属性提供 `const` 取值函数，需要修改的属性提供带校验的设值函数；像 `area` 这种纯计算的方法直接公开即可。判断标准是“外部有没有必要知道内部细节”。过度隐藏会让类变得难用，隐藏不足又会让不变量随时被破坏。',
    },
    {
      type: 'heading',
      text: '六、小结',
    },
    {
      type: 'text',
      body:
        '这一课的核心只有两句话：类是蓝图，对象是按蓝图造出来的实例；封装让对象自己管理自己的数据。再记住构造与析构的自动调用时机、`this` 指向当前对象、引用参数避免拷贝、默认参数从右往左。下一课我们让一个类从另一个类那里继承能力，并看看同一句调用如何在不同的对象上产生不同的结果。',
    },
    {
      type: 'try',
      language: 'cpp',
      code: `#include <iostream>

class Rectangle {
public:
  Rectangle(double width, double height) {
    width_ = width > 0 ? width : 0;
    height_ = height > 0 ? height : 0;
  }

  double area() const { return width_ * height_; }
  bool isSquare() const { return width_ == height_; }

private:
  double width_;
  double height_;
};

int main() {
  Rectangle a(4.0, 4.0);
  Rectangle b(3.0, 5.0);
  std::cout << a.isSquare() << " " << b.isSquare() << std::endl;
  return 0;
}`,
      prompt:
        '在实验室里给 Rectangle 增加 `perimeter` 成员函数和会校验正数的 `setHeight`，再把 `isSquare` 改成 `const` 成员函数，观察常量对象能否调用它。',
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
    {
      mistake: "给构造函数写了返回类型",
      wrong: "void Point() { x = 0; }",
      right: "Point() { x = 0; }",
      why: "构造函数没有返回类型，加上 void 就变成了普通成员函数。"
    },
    {
      mistake: "忘了 class 默认是 private",
      wrong: "class Point { int x; };  // 外部访问不到",
      right: "class Point { public: int x; };",
      why: "class 的成员默认私有，struct 默认公有；想让外部访问必须显式写 public:。"
    },
    {
      mistake: "只读成员函数忘记 const",
      wrong: "int getX() { return x; }",
      right: "int getX() const { return x; }",
      why: "const 对象只能调用 const 成员函数，漏写会导致 const 对象编译不过。"
    }
      ]
    },
  ],
  keyPoints: [
    '类描述“有哪些数据、能做什么”，对象是类的一个实例，每个对象拥有独立的数据。',
    '构造函数在对象创建时自动调用，负责把成员带到合法状态；析构函数在对象销毁时自动调用。',
    'private 不是“不能访问”，而是“只能通过类的成员函数访问”，封装的目的是守住不变量。',
    'this 指向调用成员函数的当前对象；返回 *this 可以支持链式调用。',
    '引用参数避免拷贝并允许修改实参；const 成员函数承诺不修改对象状态。',
  ],
  quiz: [
    {
      id: 'c11-q1',
      question: '下面关于 class 与 struct 的说法，哪一项正确？',
      options: [
        'class 的成员默认是 private，struct 的成员默认是 public',
        'struct 不能定义成员函数和构造函数',
        'class 的对象不能按值传递给函数',
        'class 必须显式写出 public: 才能定义构造函数',
      ],
      answer: 0,
      explanation:
        '在 C++ 中 class 和 struct 都能定义数据成员、成员函数、构造与析构，唯一区别是默认访问级别：class 默认 private，struct 默认 public。按值传递与访问级别无关。',
    },
    {
      id: 'c11-q2',
      question: '关于构造函数，下列说法正确的是？',
      options: [
        '构造函数有返回值，类型与类名相同',
        '构造函数在对象创建时自动调用，并且没有返回类型',
        '对象创建后还可以再次手动调用构造函数来重置自己',
        '一个类最多只能有一个构造函数',
      ],
      answer: 1,
      explanation:
        '构造函数的名字与类名相同、没有返回类型，对象创建时由编译器自动调用；它可以重载多个版本，也可以用默认参数。对象创建之后不会再次自动调用构造函数。',
    },
    {
      id: 'c11-q3',
      question: '在成员函数中写 `return *this;`，通常是为了什么？',
      options: [
        '销毁当前对象并释放它的内存',
        '返回当前对象的引用，从而支持连续调用',
        '复制一份当前对象并按值返回',
        '把 this 指针转换成整数地址',
      ],
      answer: 1,
      explanation:
        'this 是指向当前对象的指针，*this 就是当前对象本身。把返回类型写成类引用（如 Counter&）并返回 *this，可以继续在返回值上调用成员函数，形成链式调用。',
    },
  ],
  labSampleId: 'class-rectangle',
};

export default lesson;
