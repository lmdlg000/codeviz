import { describe, expect, it } from 'vitest';
import { simulate } from '../index';
import { samples } from '../../data';

const run = (code: string) => simulate(code);

describe('simulate：C++ 类对象', () => {
  it('构造、成员函数、析构都按顺序执行', () => {
    const r = run(`
#include <iostream>
class Counter {
  int n;
public:
  Counter(int start) { n = start; }
  ~Counter() { std::cout << "bye " << n << std::endl; }
  void inc() { n += 1; }
  int value() const { return n; }
};
int main() {
  Counter c(3);
  c.inc();
  std::cout << c.value() << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe('4\nbye 4\n');
  });

  it('构造初始化列表生效', () => {
    const r = run(`
#include <iostream>
class Point {
  int x;
  int y;
public:
  Point(int a, int b) : x(a), y(b) {}
  int getX() const { return x; }
  int getY() const { return y; }
};
int main() {
  Point p(3, 4);
  std::cout << p.getX() + p.getY() << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe('7\n');
  });

  it('成员运算符 += 与 == 可用', () => {
    const r = run(`
#include <iostream>
class P {
public:
  int x;
  P(int v) : x(v) {}
  P& operator+=(const P& o) { x += o.x; return *this; }
  bool operator==(const P& o) const { return x == o.x; }
};
int main() {
  P a(2);
  P b(3);
  a += b;
  std::cout << a.x << std::endl;
  std::cout << (a == b) << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe('5\n0\n');
  });

  it('非成员 operator+ 与 operator<< 支持链式输出', () => {
    const r = run(`
#include <iostream>
class P {
public:
  int x;
  P(int v) : x(v) {}
  friend P operator+(const P& a, const P& b);
  friend std::ostream& operator<<(std::ostream& os, const P& p);
};
P operator+(const P& a, const P& b) { return P(a.x + b.x); }
std::ostream& operator<<(std::ostream& os, const P& p) { os << "P(" << p.x << ")"; return os; }
int main() {
  P a(1);
  P b(2);
  P c = a + b;
  std::cout << c << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe('P(3)\n');
  });

  it('引用参数按引用绑定，能修改调用方对象', () => {
    const r = run(`
#include <iostream>
class Box { public: int v; Box(int x) : v(x) {} };
void bump(Box& b) { b.v += 10; }
int main() {
  Box b(5);
  bump(b);
  std::cout << b.v << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe('15\n');
  });

  it('char 缓冲区：new/delete、下标写入与自定义输出', () => {
    const r = run(`
#include <iostream>
#include <cstring>
class Buf {
  char* s;
  int len;
public:
  Buf(const char* src) {
    len = strlen(src);
    s = new char[len + 1];
    for (int i = 0; i < len; i++) s[i] = src[i];
    s[len] = '\\0';
  }
  void fill(char c) { for (int i = 0; i < len; i++) s[i] = c; }
  friend std::ostream& operator<<(std::ostream& os, const Buf& b);
};
std::ostream& operator<<(std::ostream& os, const Buf& b) {
  for (int i = 0; i < b.len; i++) os << b.s[i];
  return os;
}
int main() {
  Buf b("abc");
  std::cout << b << std::endl;
  b.fill('x');
  std::cout << b << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe('abc\nxxx\n');
  });

  it('重载解析优先匹配实参类型（字符串 vs size_t）', () => {
    const r = run(`
#include <iostream>
class Tag {
public:
  int kind;
  Tag(size_t v) { kind = 1; }
  Tag(const char* s) { kind = 2; }
};
int main() {
  Tag a(7);
  Tag b("text");
  std::cout << a.kind << b.kind << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe('12\n');
  });

  it('类内声明带默认参数、类外定义时，无参构造也能执行', () => {
    const r = run(`
#include <iostream>
class Acc {
  int n;
public:
  Acc(int start = 7);
  int get() { return n; }
};
Acc::Acc(int start) { n = start; }
int main() {
  Acc a;
  Acc b(3);
  std::cout << a.get() << b.get() << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe('73\n');
  });

  it('赋值运算符做深拷贝：右侧对象析构后左侧仍可用', () => {
    const r = run(`
#include <iostream>
#include <cstring>
class Str {
  char* s;
  int len;
public:
  Str(const char* src) {
    len = strlen(src);
    s = new char[len + 1];
    memcpy(s, src, len + 1);
  }
  Str(const Str& o) {
    len = o.len;
    s = new char[len + 1];
    memcpy(s, o.s, len + 1);
  }
  Str& operator=(const Str& o) {
    if (this != &o) {
      delete[] s;
      len = o.len;
      s = new char[len + 1];
      memcpy(s, o.s, len + 1);
    }
    return *this;
  }
  ~Str() { delete[] s; }
  friend std::ostream& operator<<(std::ostream& os, const Str& v);
};
std::ostream& operator<<(std::ostream& os, const Str& v) {
  for (int i = 0; i < v.len; i++) os << v.s[i];
  return os;
}
Str make() {
  Str local("inner");
  return local;
}
int main() {
  Str a("outer");
  a = make();
  std::cout << a << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(true);
    expect(r.output).toBe('inner\n');
  });

  it('表达式临时对象在语句结束析构，不产生假泄漏', () => {
    const r = run(`
#include <iostream>
class T {
public:
  int v;
  T(int x) : v(x) {}
  ~T() { std::cout << "~" << v; }
  friend T operator+(const T& a, const T& b);
  friend std::ostream& operator<<(std::ostream& os, const T& t);
};
T operator+(const T& a, const T& b) { return T(a.v + b.v); }
std::ostream& operator<<(std::ostream& os, const T& t) { os << t.v; return os; }
int main() {
  T a(1);
  T b(2);
  std::cout << (a + b) << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(true);
    // 临时 T(3) 在输出语句之后才析构
    expect(r.output).toBe('3\n~3~2~1');
    expect(r.heapIssues ?? []).toHaveLength(0);
  });

  it('BigInt 完整示例端到端跑通（加减乘与拷贝构造）', () => {
    const sample = samples.find((item) => item.id === 'cpp-bigint');
    expect(sample).toBeTruthy();
    const r = simulate(sample?.code ?? '');
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.truncated).toBe(false);
    const lines = r.output.trim().split('\n');
    expect(lines).toEqual([
      '9999999999+1 = 10000000000',
      '2100000000+2100000000 = 4200000000',
      '99*99 = 9801',
      '99*0 = 0',
      '9999999999*9999999999 = 99999999980000000001',
    ]);
    expect(r.heapIssues ?? []).toHaveLength(0);
  });
});

describe('simulate：成员函数返回对象 / 类作用域常量 / 指针自增', () => {
  it('局部对象声明 B r(5) 在方法体里不会被当成函数声明', () => {
    const r = run(`
#include <iostream>
using namespace std;
class B {
  int v;
public:
  B(int x) { v = x; }
  B(const B& o) { v = o.v; }
  int get() { return v; }
  B makeLocal() { B r(5); return r; }
  B makeFromParam(int n) { B r(n); return r; }
};
int main() {
  B x(1);
  cout << x.makeLocal().get() << " " << x.makeFromParam(7).get() << endl;
  return 0;
}`);
    expect(r.output).toBe('5 7\n');
  });

  it('B z = x.make(7); 真的执行这次调用，而不是变成 B z(7)', () => {
    const r = run(`
#include <iostream>
using namespace std;
class B {
  int v;
public:
  B(int x) { v = x; }
  B(const B& o) { v = o.v; }
  int get() { return v; }
  B make(int n) { B r(n * 2); return r; }
};
int main() {
  B x(1);
  B z = x.make(7);
  cout << z.get() << endl;
  return 0;
}`);
    expect(r.output).toBe('14\n');
  });

  it('类作用域枚举常量 BigInt::NEGATIVE 可以取用', () => {
    const r = run(`
#include <iostream>
using namespace std;
class Num {
public:
  enum Sign { NEGATIVE = -1, ZERO = 0, POSITIVE = 1 };
  Sign sign;
  Num(int s) { sign = s > 0 ? POSITIVE : (s < 0 ? NEGATIVE : ZERO); }
};
ostream& operator<<(ostream& os, const Num& n) {
  if (n.sign == Num::NEGATIVE) os << "neg";
  else if (n.sign == Num::ZERO) os << "zero";
  else os << "pos";
  return os;
}
int main() {
  Num a(-3), b(0), c(4);
  cout << a << " " << b << " " << c << endl;
  return 0;
}`);
    expect(r.output).toBe('neg zero pos\n');
  });

  it('const char* 可以 ++p，偏移后的 strlen / 下标同步生效', () => {
    const r = run(`
#include <iostream>
#include <cstring>
using namespace std;
int main() {
  const char* str = "-12345";
  const char* p = str;
  if (*p == '-' || *p == '+') { ++p; }
  cout << strlen(p) << " " << *p << " " << p[4] << endl;
  return 0;
}`);
    expect(r.output).toBe('5 1 5\n');
  });
});
