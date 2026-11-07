import { describe, expect, it } from 'vitest';
import { simulate } from '../index';

const run = (code: string) => simulate(code);

describe('simulate：继承与虚函数', () => {
  it('派生类能直接读写基类字段', () => {
    const r = run(`
#include <iostream>
class Animal {
protected:
  int legs;
public:
  void setLegs(int n) { legs = n; }
  int getLegs() { return legs; }
};
class Bird : public Animal {
public:
  void fly() { legs = 2; }
};
int main() {
  Bird b;
  b.setLegs(4);
  std::cout << b.getLegs() << std::endl;
  b.fly();
  std::cout << b.getLegs() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('4\n2\n');
  });

  it('构造从基类到派生，析构反过来', () => {
    const r = run(`
#include <iostream>
class Base {
public:
  Base() { std::cout << "base ctor" << std::endl; }
  ~Base() { std::cout << "base dtor" << std::endl; }
};
class Derived : public Base {
public:
  Derived() { std::cout << "derived ctor" << std::endl; }
  ~Derived() { std::cout << "derived dtor" << std::endl; }
};
int main() {
  Derived d;
  std::cout << "in main" << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('base ctor\nderived ctor\nin main\nderived dtor\nbase dtor\n');
  });

  it('基类构造参数来自派生类的初始化列表', () => {
    const r = run(`
#include <iostream>
class Base {
public:
  int id;
  Base(int v) { id = v; }
};
class Derived : public Base {
public:
  Derived(int v) : Base(v * 2) {}
};
int main() {
  Derived d(5);
  std::cout << d.id << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('10\n');
  });

  it('虚函数按实际对象分派（基类指针）', () => {
    const r = run(`
#include <iostream>
class Animal {
public:
  virtual const char* speak() { return "..."; }
};
class Dog : public Animal {
public:
  const char* speak() override { return "Woof"; }
};
class Cat : public Animal {
public:
  const char* speak() override { return "Meow"; }
};
int main() {
  Dog dog;
  Cat cat;
  Animal* p1 = &dog;
  Animal* p2 = &cat;
  std::cout << p1->speak() << " " << p2->speak() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('Woof Meow\n');
  });

  it('基类的非虚函数里调用虚函数，也会分派到派生实现', () => {
    const r = run(`
#include <iostream>
class Animal {
public:
  virtual const char* sound() const { return "..."; }
  void introduce() const { std::cout << "I say " << sound() << std::endl; }
};
class Dog : public Animal {
public:
  const char* sound() const override { return "Woof"; }
};
int main() {
  Dog d;
  d.introduce();
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('I say Woof\n');
  });

  it('非虚函数按指针的静态类型绑定', () => {
    const r = run(`
#include <iostream>
class Base {
public:
  const char* kind() { return "base"; }
};
class Derived : public Base {
public:
  const char* kind() { return "derived"; }
};
int main() {
  Derived d;
  Base* p = &d;
  std::cout << d.kind() << " " << p->kind() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    // 直接调是 derived，走基类指针是 base —— 非虚函数不看实际对象
    expect(r.output).toBe('derived base\n');
  });

  it('纯虚函数的类是抽象类，不能创建对象', () => {
    const r = run(`
#include <iostream>
class Shape {
public:
  virtual double area() const = 0;
};
int main() {
  Shape s;
  return 0;
}
`);
    expect(r.ok).toBe(false);
    expect(r.error?.message).toContain('抽象类');
  });

  it('纯虚函数在派生类实现后可以实例化', () => {
    const r = run(`
#include <iostream>
class Shape {
public:
  virtual double area() const = 0;
  virtual const char* name() const = 0;
};
class Square : public Shape {
public:
  Square(double side) { side_ = side; }
  double area() const override { return side_ * side_; }
  const char* name() const override { return "Square"; }
private:
  double side_ = 0.0;
};
int main() {
  Square s(3.0);
  const Shape* p = &s;
  std::cout << p->name() << " " << p->area() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('Square 9\n');
  });

  it('delete 基类指针会依次调用派生与基类析构', () => {
    const r = run(`
#include <iostream>
class Shape {
public:
  virtual ~Shape() { std::cout << "~Shape" << std::endl; }
  virtual double area() const { return 0; }
};
class Circle : public Shape {
public:
  Circle(double r) { r_ = r; }
  ~Circle() { std::cout << "~Circle" << std::endl; }
  double area() const override { return 3.0 * r_ * r_; }
private:
  double r_ = 0.0;
};
int main() {
  Shape* p = new Circle(2.0);
  std::cout << p->area() << std::endl;
  delete p;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('12\n~Circle\n~Shape\n');
  });

  it('三层继承：字段查找与方法分派都沿链往上', () => {
    const r = run(`
#include <iostream>
class A {
public:
  int depth() { return 1; }
  virtual const char* tag() { return "A"; }
};
class B : public A {
public:
  int depth() { return 2; }
};
class C : public B {
public:
  const char* tag() override { return "C"; }
};
int main() {
  C c;
  A* p = &c;
  std::cout << c.depth() << " " << c.tag() << " " << p->tag() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('2 C C\n');
  });

  it('派生类按值传递时拷贝构造基类字段', () => {
    const r = run(`
#include <iostream>
class Base {
public:
  int v;
};
class Derived : public Base {
public:
  Derived(int x) { v = x; }
};
int main() {
  Derived a(7);
  Derived b = a;
  b.v = 9;
  std::cout << a.v << " " << b.v << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    // 隐式拷贝构造：逐字段复制，改 b 不影响 a
    expect(r.output).toBe('7 9\n');
  });

  it('按值传基类参数会发生对象切片，多态失效', () => {
    const r = run(`
#include <iostream>
class Animal {
public:
  int age;
  virtual const char* speak() { return "..."; }
};
class Dog : public Animal {
public:
  const char* speak() override { return "Woof"; }
};
void byValue(Animal a) { std::cout << a.speak() << std::endl; }
void byRef(Animal& a) { std::cout << a.speak() << std::endl; }
void byPointer(Animal* a) { std::cout << a->speak() << std::endl; }
int main() {
  Dog d;
  byValue(d);
  byRef(d);
  byPointer(&d);
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    // 按值传参被切片成 Animal，另外两种方式保留动态类型
    expect(r.output).toBe('...\nWoof\nWoof\n');
  });

  it('用基类变量接派生类对象，也只保留基类字段', () => {
    const r = run(`
#include <iostream>
class Base {
public:
  int a;
  virtual const char* tag() { return "base"; }
};
class Derived : public Base {
public:
  int b;
  Derived() { a = 1; b = 2; }
  const char* tag() override { return "derived"; }
};
int main() {
  Derived d;
  Base sliced = d;
  std::cout << sliced.a << " " << sliced.tag() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('1 base\n');
  });
});
