import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c12-inheritance',
  chapterId: 'cpp-oop',
  order: 2,
  title: '继承与多态：同一种调用，不同的行为',
  subtitle: '从复用代码到面向接口编程',
  description:
    '用继承复用共性，用 virtual 让基类指针在运行时找到真正的方法；理解抽象类、override 与虚析构，写出可扩展的图形程序。',
  difficulty: 3,
  minutes: 45,
  objectives: [
    '写出 `class Dog : public Animal` 形式的继承，并说明基类与派生类的构造、析构顺序。',
    '区分继承方式与成员访问级别，知道为什么日常开发几乎只用 public 继承。',
    '用 virtual、override 和基类指针解释动态绑定，说出多态成立的三个条件。',
    '用纯虚函数定义抽象类，并解释虚析构函数为什么必要。',
  ],
  blocks: [
    {
      type: 'text',
      body:
        '假设要写一个计算图形面积的程序：圆用半径，矩形用宽高，三角形用底和高。如果为每种图形各写一个独立函数，调用时就得先判断“现在到底是什么图形”，代码会堆满 if/else；每增加一种图形，还要回来修改这段判断。继承（inheritance）与多态（polymorphism）解决的正是这个问题：把共同点抽到基类，让不同的对象对同一个调用给出自己的回答。',
    },
    {
      type: 'heading',
      text: '一、继承：把共性抽出来',
    },
    {
      type: 'text',
      body:
        '继承让一个类（派生类，derived class）在另一个类（基类，base class）的基础上定义，写法是 `class Dog : public Animal`，冒号后面是继承方式。Dog 自动拥有 Animal 中 public 和 protected 的成员，不需要重新声明；private 成员虽然仍存在于 Dog 对象里，但 Dog 的成员函数不能直接访问它们。',
    },
    {
      type: 'text',
      body:
        '继承表达的是一种“是一个（is-a）”的关系：狗是一种动物。派生类不会自动获得基类的构造函数，通常要自己写构造函数，并负责让基类部分完成初始化；销毁时顺序相反，先执行派生类析构，再执行基类析构。理解这个顺序，是后面理解虚析构的基础。判断两个类该不该继承，先问一句：派生类对象能不能直接替代基类对象？如果不能，就不要用继承。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'animal.cpp',
      code: `#include <iostream>
#include <string>

class Animal {
public:
  Animal(const std::string& name) { name_ = name; }

  std::string sound() const { return "..."; }

  void introduce() const {
    std::cout << name_ << " says " << sound() << std::endl;
  }

protected:
  std::string name_;
};

class Dog : public Animal {
public:
  Dog(const std::string& name) : Animal(name) {}

  std::string sound() const { return "Woof"; }
};

int main() {
  Dog dog("Buddy");
  dog.introduce();
  return 0;
}`,
      caption:
        '`Dog` 明明重写了 `sound`，猜猜 `introduce()` 会打印出什么？运行一下，再看下面的解释。',
    },
    {
      type: 'text',
      body:
        '程序打印的是 `Buddy says ...`，而不是 `Woof`。原因在于 `introduce` 是 Animal 的成员函数，编译器编译它时只知道 `sound` 属于 Animal，于是把调用静态绑定（static binding）到 `Animal::sound`。它无法预知将来会有一个 Dog 对象来调用。想让“调用哪个 sound”由对象的真实类型在运行时决定，就要把 `sound` 声明为虚函数（virtual function）。',
    },
    {
      type: 'heading',
      text: '二、访问控制与继承方式',
    },
    {
      type: 'table',
      headers: ['继承方式', '基类 public 成员', '基类 protected 成员', '基类 private 成员'],
      rows: [
        ['public 继承', '在派生类中仍是 public', '在派生类中仍是 protected', '不可直接访问'],
        ['protected 继承', '在派生类中变为 protected', '在派生类中仍是 protected', '不可直接访问'],
        ['private 继承', '在派生类中变为 private', '在派生类中变为 private', '不可直接访问'],
      ],
    },
    {
      type: 'text',
      body:
        '表格说明的是继承方式对基类成员可见性的影响。日常开发中绝大多数情况都写 public 继承，用来表达真正的 is-a 关系；private 继承更像“借用实现”，初学阶段可以先不深究。另一个容易混淆的点是：基类的 private 成员在派生类对象里依然存在，只是派生类的成员函数不能直接碰它，需要基类提供 protected 或 public 的接口。',
    },
    {
      type: 'heading',
      text: '三、虚函数与多态',
    },
    {
      type: 'text',
      body:
        '在基类的成员函数前面加 `virtual`，就等于告诉编译器：“这个函数允许派生类改写；通过基类指针或引用调用时，请在运行时看对象的真实类型再决定用哪个版本。”这种机制叫动态绑定（dynamic binding）。实现上，带虚函数的对象会保存一个指向虚函数表（vtable）的隐藏指针，运行时沿着表找到正确的函数入口。派生类重写时写 `override`：一旦参数或 `const` 写错，编译器会立刻报错，而不是默默定义出一个没人调用的新函数。',
    },
    {
      type: 'text',
      body:
        '多态（polymorphism）成立需要三个条件：存在继承关系、基类声明了虚函数且派生类完成重写、通过基类指针或引用调用。三者缺一不可。用派生类对象直接调用自己的函数不会发生动态绑定；把派生类对象按值赋给基类对象也不会——后者还会丢掉派生类独有的数据。',
    },
    {
      type: 'text',
      body:
        '再举一个常见场景：把函数参数写成 `void printArea(const Shape& shape)`，传入 Circle 或 Rectangle 都可以，函数体里的 `shape.area()` 会自动选择正确版本；如果把参数写成 `void printArea(Shape shape)`，对象会被切片，多态也就丢了。引用参数既避免复制，又保留了动态绑定，这也是多态接口通常用引用或指针传递的原因。记住：多态看的是对象的真实类型，而不是变量声明的类型。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'shapes.cpp',
      code: `#include <iostream>

class Shape {
public:
  virtual ~Shape() {}
  virtual double area() const = 0;
};

class Circle : public Shape {
public:
  Circle(double radius) { radius_ = radius; }
  double area() const override { return 3.14159 * radius_ * radius_; }

private:
  double radius_ = 0.0;
};

class Rectangle : public Shape {
public:
  Rectangle(double width, double height) {
    width_ = width;
    height_ = height;
  }
  double area() const override { return width_ * height_; }

private:
  double width_ = 0.0;
  double height_ = 0.0;
};

double totalArea(const Shape* shapes[], int count) {
  double sum = 0.0;
  for (int i = 0; i < count; i++) {
    sum += shapes[i]->area();
  }
  return sum;
}

int main() {
  const Shape* shapes[2] = {new Circle(2.0), new Rectangle(3.0, 4.0)};
  std::cout << "total = " << totalArea(shapes, 2) << std::endl;
  delete shapes[0];
  delete shapes[1];
  return 0;
}`,
      caption:
        '`Shape` 只规定“必须会算面积”，两个派生类各自实现；`totalArea` 完全不知道具体图形是什么。',
    },
    {
      type: 'text',
      body:
        '`Shape` 里的 `area` 是纯虚函数（pure virtual function），`= 0` 表示它没有默认实现，Shape 因此成为抽象类（abstract class），不能直接创建对象。`Circle` 和 `Rectangle` 各自实现 `area`，main 里只有一个 `const Shape*` 数组，同一句 `shapes[i]->area()` 会依次调用到两个不同版本。`virtual ~Shape()` 则是为 `delete` 准备的安全出口，下面马上解释。',
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'classes',
        code: `#include <iostream>

class Shape {
public:
  virtual ~Shape() {}
  virtual double area() const = 0;
};

class Circle : public Shape {
public:
  Circle(double radius) { radius_ = radius; }
  double area() const override { return 3.14159 * radius_ * radius_; }

private:
  double radius_ = 0.0;
};

class Rectangle : public Shape {
public:
  Rectangle(double width, double height) {
    width_ = width;
    height_ = height;
  }
  double area() const override { return width_ * height_; }

private:
  double width_ = 0.0;
  double height_ = 0.0;
};

double totalArea(const Shape* shapes[], int count) {
  double sum = 0.0;
  for (int i = 0; i < count; i++) {
    sum += shapes[i]->area();
  }
  return sum;
}

int main() {
  const Shape* shapes[2] = {new Circle(2.0), new Rectangle(3.0, 4.0)};
  std::cout << "total = " << totalArea(shapes, 2) << std::endl;
  delete shapes[0];
  delete shapes[1];
  return 0;
}`,
      },
      title: 'Shape 家族的类图',
      caption:
        '继承箭头由派生类指向基类；抽象类名与虚函数会有特殊标记，`virtual` 让面积计算可以在运行时切换。',
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'flow',
        functionName: 'totalArea',
        code: `#include <iostream>

class Shape {
public:
  virtual ~Shape() {}
  virtual double area() const = 0;
};

class Circle : public Shape {
public:
  Circle(double radius) { radius_ = radius; }
  double area() const override { return 3.14159 * radius_ * radius_; }

private:
  double radius_ = 0.0;
};

class Rectangle : public Shape {
public:
  Rectangle(double width, double height) {
    width_ = width;
    height_ = height;
  }
  double area() const override { return width_ * height_; }

private:
  double width_ = 0.0;
  double height_ = 0.0;
};

double totalArea(const Shape* shapes[], int count) {
  double sum = 0.0;
  for (int i = 0; i < count; i++) {
    sum += shapes[i]->area();
  }
  return sum;
}

int main() {
  const Shape* shapes[2] = {new Circle(2.0), new Rectangle(3.0, 4.0)};
  std::cout << "total = " << totalArea(shapes, 2) << std::endl;
  delete shapes[0];
  delete shapes[1];
  return 0;
}`,
      },
      title: 'totalArea 的流程图',
      caption:
        '循环里只有一个 area 调用节点，但每次迭代都可能落到 Circle 或 Rectangle 的实现——这就是“同一种调用，不同的行为”。',
    },
    {
      type: 'heading',
      text: '四、抽象类与虚析构函数',
    },
    {
      type: 'text',
      body:
        '抽象类（abstract class）不能实例化，只能当作接口使用：可以定义 `Shape*` 或 `Shape&`，不能写 `Shape s;`。这让“图形”这种概念保持纯粹——它只规定所有图形必须会算面积，不负责具体怎么算。纯虚函数也可以提供函数体作为默认实现，但真正需要接口语义时，派生类仍然应该给出自己的版本。',
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'dtor.cpp',
      code: `#include <iostream>

class Base {
public:
  Base() { std::cout << "Base ctor" << std::endl; }
  virtual ~Base() { std::cout << "Base dtor" << std::endl; }
};

class Derived : public Base {
public:
  Derived() { std::cout << "Derived ctor" << std::endl; }
  ~Derived() override { std::cout << "Derived dtor" << std::endl; }
};

int main() {
  Base* p = new Derived();
  delete p;
  return 0;
}`,
      caption:
        '构造顺序是基类再到派生类，析构顺序相反；`delete p` 能把两条析构都走完，靠的是虚析构。',
    },
    {
      type: 'text',
      body:
        '运行这段程序，输出顺序是 Base ctor、Derived ctor、Derived dtor、Base dtor。如果基类析构函数不是 virtual，通过基类指针 `delete` 派生对象的行为是未定义的；常见实现只会调用 Base 的析构函数，Derived 申请的资源就泄漏了。因此只要一个类可能被当作基类、通过指针删除对象，就应该给它一个虚析构函数。',
    },
    {
      type: 'note',
      tone: 'warn',
      title: '对象切片（object slicing）',
      body:
        '当基类不是抽象类时，写 `Shape s = circle;` 只会复制 Shape 那部分成员，Circle 独有的数据被“切掉”，之后调用 `s.area()` 只会看到基类版本；如果基类含纯虚函数，这样的复制会直接编译失败。需要多态时，请使用基类指针或引用，不要按值复制。',
    },
    {
      type: 'heading',
      text: '五、易错点',
    },
    {
      type: 'list',
      items: [
        '基类析构函数没写 `virtual`，却用基类指针 `delete` 派生对象。',
        '重写时漏写 `const` 或参数类型不一致；加上 `override` 能让编译器帮你抓住这个错误。',
        '在构造函数或析构函数里调用虚函数不会多态：构造时派生类部分还没准备好，析构时已经开始销毁。',
        '把派生类对象按值传给基类参数会发生对象切片，多态失效。',
        '`class` 的默认继承方式是 private，忘记写 public 会让基类接口在派生类里变成私有。',
        '派生类构造函数要初始化基类；基类没有默认构造函数时不写初始化列表会直接编译失败。',
      ],
    },
    {
      type: 'heading',
      text: '六、小结',
    },
    {
      type: 'text',
      body:
        '继承负责复用，虚函数负责让复用变得灵活。写多态代码时先问三个问题：基类需要哪些共同接口？哪些函数必须允许派生类改写？对象会通过基类指针被销毁吗？前两个答案决定 `virtual` 放在哪里，第三个答案决定析构函数是否要 `virtual`。想清楚这三点，再复杂的类层次也能画得清楚。',
    },
    {
      type: 'text',
      body:
        '最后提醒一点：继承不是越多越好。只有当派生类确实“是一种”基类，并且希望被同一段代码统一处理时，继承才划算；如果只是想复用几个函数，把功能写成独立的工具函数，或者让一个类包含另一个类的对象（组合），往往更灵活。判断标准很简单：会不会通过基类指针对待这些对象？会，才建立继承关系。',
    },
    {
      type: 'try',
      language: 'cpp',
      code: `#include <iostream>

class Shape {
public:
  virtual ~Shape() {}
  virtual double area() const = 0;
};

class Triangle : public Shape {
public:
  Triangle(double base, double height) {
    base_ = base;
    height_ = height;
  }

  double area() const override { return 0.5 * base_ * height_; }

private:
  double base_;
  double height_;
};

int main() {
  Shape* shape = new Triangle(6.0, 2.0);
  std::cout << "triangle area = " << shape->area() << std::endl;
  delete shape;
  return 0;
}`,
      prompt:
        '在实验室里把 Triangle 加进上一段程序的 `const Shape*` 数组，确认 totalArea 一行都不用改；再试试去掉基类的 virtual，观察 shape->area() 还能不能调用到 Triangle 的版本。',
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
    {
      mistake: "基类析构函数不是虚函数",
      wrong: "class Base { ~Base(); };",
      right: "class Base { virtual ~Base(); };",
      why: "通过基类指针 delete 派生类对象时，非虚析构只调基类版本，派生类资源泄漏。"
    },
    {
      mistake: "以为派生类构造函数会先执行基类",
      wrong: "先执行派生类构造函数体",
      right: "Base() → Derived() 构造；~Derived() → ~Base() 析构",
      why: "构造由内到外，析构由外到内；基类先准备好，派生类才能使用它的成员。"
    },
    {
      mistake: "在派生类里直接访问基类 private 成员",
      wrong: "class D : public B { void f() { x = 1; } };",
      right: "把 x 改成 protected，或用基类的 public 接口",
      why: "private 只对声明它的类可见；需要派生类访问就用 protected。"
    }
      ]
    },
  ],
  keyPoints: [
    '派生类自动拥有基类成员；构造顺序是基类再到派生类，析构顺序相反。',
    '只有通过基类指针或引用调用虚函数，才会在运行时绑定到实际对象的版本。',
    '纯虚函数 `= 0` 让类成为抽象类，不能实例化，只能作为接口被继承。',
    '通过基类指针 delete 派生对象时，基类析构必须是 virtual，否则行为未定义。',
    'override 让编译器检查签名，写错参数或 const 会立刻报错。',
  ],
  quiz: [
    {
      id: 'c12-q1',
      question: '下面哪种情况会触发虚函数的动态绑定？',
      options: [
        '用派生类对象直接调用自己重写的成员函数',
        '用基类指针或基类引用调用虚函数',
        '在基类构造函数里调用虚函数',
        '把派生类对象按值赋给基类对象后调用',
      ],
      answer: 1,
      explanation:
        '动态绑定需要“基类指针或引用 + 虚函数 + 派生类重写”三个条件。直接调用派生类对象、在构造/析构函数中调用、按值复制都会在编译期确定版本，不会发生运行时多态。',
    },
    {
      id: 'c12-q2',
      question: '为什么基类的析构函数通常要声明为 virtual？',
      options: [
        '为了让析构函数可以被重载',
        '为了通过基类指针 delete 派生对象时，能正确调用派生类的析构函数',
        '为了提高程序的运行速度',
        '因为 C++ 规定所有析构函数都必须是虚函数',
      ],
      answer: 1,
      explanation:
        '如果析构函数不是虚函数，通过基类指针删除派生对象的行为是未定义的；常见实现只执行基类析构，派生类资源无法释放。因此基类析构应声明为 virtual，让析构链从派生类向基类正确执行。',
    },
    {
      id: 'c12-q3',
      question: '关于纯虚函数与抽象类，下列说法正确的是？',
      options: [
        '抽象类可以直接创建对象',
        '含有纯虚函数的类不能实例化，但可以定义指向它的指针和引用',
        '纯虚函数必须在抽象类里给出函数体',
        '派生类必须重写基类的所有非虚函数',
      ],
      answer: 1,
      explanation:
        '纯虚函数 `= 0` 使类成为抽象类，无法创建对象，但它可以作为接口类型定义指针或引用，从而支持多态。纯虚函数可以有默认实现，但在接口设计中通常由派生类提供实现。',
    },
  ],
  labSampleId: 'shape-polymorphism',
};

export default lesson;
