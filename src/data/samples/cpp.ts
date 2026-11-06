import type { CodeSample } from '../types';

/**
 * C++ 示例库
 * ------------------------------------------------------------------
 * 所有代码均为原创教学示例，可用 g++ -std=c++17 -fsyntax-only 通过。
 * focus 表示该示例最能展示的图形能力：类结构、流程图或单步执行。
 */
const samples: CodeSample[] = [
  {
    id: 'cpp-hello',
    title: 'C++ 的第一次问候',
    description: '用固定变量演示 cout 的链式输出：文本与数值交替拼接，最后算出一个带小数的结果。',
    language: 'cpp',
    code: `#include <iostream>

int main() {
  int apples = 7;
  int pears = 6;
  int total = apples + pears;

  std::cout << "apples = " << apples << std::endl;
  std::cout << "pears  = " << pears << std::endl;
  std::cout << "total  = " << total << std::endl;

  double average = total / 2.0;
  std::cout << "average = " << average << std::endl;
  return 0;
}`,
    tags: ['控制台输出', '流式输出', '命名空间'],
    level: 2,
    focus: 'trace',
  },
  {
    id: 'reference-swap',
    title: '用引用交换两个变量',
    description: '通过引用参数交换两个变量，体会“别名”参数如何避开拷贝并改到实参。',
    language: 'cpp',
    code: `#include <iostream>

// a 和 b 是实参的别名，函数内修改会直接落到调用者的变量上
void swapByReference(int& a, int& b) {
  int temp = a;
  a = b;
  b = temp;
}

int main() {
  int x = 3;
  int y = 8;

  std::cout << "before: x=" << x << ", y=" << y << std::endl;
  swapByReference(x, y);
  std::cout << "after:  x=" << x << ", y=" << y << std::endl;
  return 0;
}`,
    tags: ['引用', '函数参数', '交换'],
    level: 2,
    focus: 'flow',
  },
  {
    id: 'class-rectangle',
    title: 'Rectangle：第一个封装类',
    description: '用 Rectangle 类封装宽高、构造函数与面积方法，演示私有数据与公开接口的配合。',
    language: 'cpp',
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
    tags: ['类与对象', '封装', '构造函数'],
    level: 2,
    focus: 'classes',
  },
  {
    id: 'class-student',
    title: 'Student：构造、析构与 static 计数',
    description: '在 Student 类中演示构造函数、析构函数与 static 成员计数器。',
    language: 'cpp',
    code: `#include <iostream>
#include <string>

class Student {
public:
  Student(const std::string& name, int score) {
    name_ = name;
    score_ = score;
    id_ = ++count_;
    std::cout << "create student " << name_ << std::endl;
  }

  ~Student() {
    std::cout << "destroy student " << name_ << std::endl;
  }

  void print() const {
    std::cout << "#" << id_ << " " << name_ << " score=" << score_ << std::endl;
  }

  static int totalCreated() {
    return count_;
  }

private:
  std::string name_;
  int score_ = 0;
  int id_ = 0;
  static int count_;
};

int Student::count_ = 0;

int main() {
  Student alice("Alice", 92);
  {
    Student bob("Bob", 85);
    bob.print();
  }
  alice.print();
  std::cout << "total created = " << Student::totalCreated() << std::endl;
  return 0;
}`,
    tags: ['构造析构', '静态成员', '对象生命周期'],
    level: 2,
    focus: 'classes',
  },
  {
    id: 'inheritance-animal',
    title: 'Animal 家族：继承与重写',
    description: '让 Dog 和 Cat 继承 Animal 并重写 sound，通过基类指针观察虚函数调用。',
    language: 'cpp',
    code: `#include <iostream>
#include <string>

class Animal {
public:
  Animal(const std::string& name) { name_ = name; }
  virtual ~Animal() {}

  virtual std::string sound() const { return "..."; }

  void introduce() const {
    std::cout << name_ << " says " << sound() << std::endl;
  }

protected:
  std::string name_;
};

class Dog : public Animal {
public:
  Dog(const std::string& name) : Animal(name) {}

  std::string sound() const override { return "Woof"; }
};

class Cat : public Animal {
public:
  Cat(const std::string& name) : Animal(name) {}

  std::string sound() const override { return "Meow"; }
};

int main() {
  Dog dog("Buddy");
  Cat cat("Mimi");
  dog.introduce();
  cat.introduce();

  Animal* pet = &dog;
  std::cout << "pet says " << pet->sound() << std::endl;
  return 0;
}`,
    tags: ['继承', '函数重写', '虚函数'],
    level: 2,
    focus: 'classes',
  },
  {
    id: 'shape-polymorphism',
    title: 'Shape：多态图形计算',
    description: '用抽象基类 Shape、纯虚函数与虚析构实现一组图形的统一面积计算。',
    language: 'cpp',
    code: `#include <iostream>

class Shape {
public:
  virtual ~Shape() {}
  virtual double area() const = 0;
  virtual const char* name() const = 0;
};

class Circle : public Shape {
public:
  Circle(double radius) { radius_ = radius; }

  double area() const override { return 3.14159 * radius_ * radius_; }
  const char* name() const override { return "Circle"; }

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
  const char* name() const override { return "Rectangle"; }

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
  const int kCount = 2;
  const Shape* shapes[kCount] = {new Circle(2.0), new Rectangle(3.0, 4.0)};

  for (int i = 0; i < kCount; i++) {
    std::cout << shapes[i]->name() << " area = " << shapes[i]->area() << std::endl;
  }
  std::cout << "total area = " << totalArea(shapes, kCount) << std::endl;

  for (int i = 0; i < kCount; i++) {
    delete shapes[i];
  }
  return 0;
}`,
    tags: ['多态', '抽象类', '虚析构'],
    level: 3,
    focus: 'classes',
  },
  {
    id: 'template-max',
    title: 'maxValue：一个函数模板',
    description: '用函数模板 maxValue 让同一份比较逻辑服务 int、double 与 string。',
    language: 'cpp',
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
    tags: ['函数模板', '泛型', '类型推导'],
    level: 2,
    focus: 'flow',
  },
  {
    id: 'template-stack',
    title: 'Stack<T>：类模板',
    description: '用类模板 Stack<T> 演示带类型参数的栈容器及其 push/pop 行为。',
    language: 'cpp',
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
    tags: ['类模板', '栈', '封装'],
    level: 3,
    focus: 'classes',
  },
  {
    id: 'stl-vector',
    title: 'vector：动态数组入门',
    description: '用 vector 保存成绩、用范围 for 遍历求和，再用 sort 把成绩排序。',
    language: 'cpp',
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
    tags: ['动态数组', '范围遍历', '排序'],
    level: 2,
    focus: 'flow',
  },
  {
    id: 'vector-stats',
    title: 'vector + string：成绩统计',
    description: '用 vector 与 string 统计一组成绩的最小值、最大值与平均值。',
    language: 'cpp',
    code: `#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

int main() {
  std::vector<std::string> names = {"Ada", "Linus", "Grace"};
  names.push_back("Ken");

  std::cout << "names: ";
  for (const std::string& name : names) {
    std::cout << name << " ";
  }
  std::cout << std::endl;

  std::vector<int> scores = {80, 92, 75, 100, 88};
  std::sort(scores.begin(), scores.end());
  std::cout << "min = " << scores.front()
            << ", max = " << scores.back() << std::endl;

  int sum = 0;
  for (int score : scores) {
    sum += score;
  }
  double average = static_cast<double>(sum) / scores.size();
  std::cout << "average = " << average << std::endl;
  return 0;
}`,
    tags: ['动态数组', '字符串', '统计'],
    level: 3,
    focus: 'flow',
  },
];

export default samples;
