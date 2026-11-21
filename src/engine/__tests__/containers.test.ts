import { describe, expect, it } from 'vitest';
import { simulate } from '../index';

const run = (code: string) => simulate(code);

describe('simulate：std::pair', () => {
  it('pair 的 first / second 可以读写', () => {
    const r = run(`
#include <iostream>
#include <string>
int main() {
  std::pair<std::string, int> p = {"Tom", 18};
  std::cout << p.first << " " << p.second << std::endl;
  p.second = p.second + 1;
  std::cout << p.second << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('Tom 18\n19\n');
  });

  it('make_pair 按实参类型生成 pair', () => {
    const r = run(`
#include <iostream>
int main() {
  std::pair<int, int> q = std::make_pair(3, 4);
  std::cout << q.first + q.second << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('7\n');
  });
});

describe('simulate：std::map', () => {
  it('下标赋值、读取与 size', () => {
    const r = run(`
#include <iostream>
#include <map>
#include <string>
int main() {
  std::map<std::string, int> age;
  age["Tom"] = 18;
  age["Ann"] = 20;
  age["Bob"] = 19;
  std::cout << age.size() << " " << age["Tom"] << std::endl;
  age["Tom"] = age["Tom"] + 1;
  std::cout << age.at("Tom") << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('3 18\n19\n');
  });

  it('读取不存在的键会插入默认值（和 C++ 一致）', () => {
    const r = run(`
#include <iostream>
#include <map>
#include <string>
int main() {
  std::map<std::string, int> m;
  m["a"] = 1;
  std::cout << m.size() << " ";
  std::cout << m["zzz"] << " ";
  std::cout << m.size() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('1 0 2\n');
  });

  it('count / contains / erase / empty', () => {
    const r = run(`
#include <iostream>
#include <map>
#include <string>
int main() {
  std::map<std::string, int> m;
  m["a"] = 1;
  m["b"] = 2;
  std::cout << m.count("a") << " " << m.count("z") << std::endl;
  std::cout << m.contains("b") << std::endl;
  m.erase("a");
  std::cout << m.size() << " " << m.empty() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('1 0\n1\n1 0\n');
  });

  it('at() 找不到键时报运行时错误', () => {
    const r = run(`
#include <iostream>
#include <map>
#include <string>
int main() {
  std::map<std::string, int> m;
  std::cout << m.at("nope") << std::endl;
  return 0;
}
`);
    expect(r.ok).toBe(false);
    expect(r.error?.message).toContain('map::at');
  });

  it('范围 for 按 key 升序遍历', () => {
    const r = run(`
#include <iostream>
#include <map>
#include <string>
int main() {
  std::map<std::string, int> m;
  m["b"] = 2;
  m["a"] = 1;
  m["c"] = 3;
  for (const auto& p : m) {
    std::cout << p.first << "=" << p.second << " ";
  }
  std::cout << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    // 插入顺序是 b、a、c，但 map 按 key 排序输出
    expect(r.output).toBe('a=1 b=2 c=3 \n');
  });

  it('按引用遍历时改 value 会写回表里', () => {
    const r = run(`
#include <iostream>
#include <map>
#include <string>
int main() {
  std::map<std::string, int> m;
  m["a"] = 1;
  m["b"] = 2;
  for (auto& p : m) p.second = p.second * 10;
  for (const auto& p : m) std::cout << p.first << ":" << p.second << " ";
  std::cout << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('a:10 b:20 \n');
  });

  it('用初始化列表构造 map', () => {
    const r = run(`
#include <iostream>
#include <map>
#include <string>
int main() {
  std::map<std::string, int> m = {{"x", 1}, {"y", 2}};
  std::cout << m.size() << " " << m["y"] << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('2 2\n');
  });
});

describe('simulate：std::set', () => {
  it('insert 去重、count 判断、erase 删除', () => {
    const r = run(`
#include <iostream>
#include <set>
int main() {
  std::set<int> s;
  s.insert(3);
  s.insert(1);
  s.insert(3);
  s.insert(2);
  std::cout << s.size() << " " << s.count(3) << " " << s.count(9) << std::endl;
  s.erase(1);
  std::cout << s.size() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('3 1 0\n2\n');
  });

  it('范围 for 按升序给出元素', () => {
    const r = run(`
#include <iostream>
#include <set>
int main() {
  std::set<int> s;
  s.insert(30);
  s.insert(10);
  s.insert(20);
  for (int x : s) std::cout << x << " ";
  std::cout << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('10 20 30 \n');
  });

  it('set 不能用下标访问', () => {
    const r = run(`
#include <iostream>
#include <set>
int main() {
  std::set<int> s;
  s[0] = 1;
  return 0;
}
`);
    expect(r.ok).toBe(false);
    expect(r.error?.message).toContain('set 不能用下标');
  });
});

describe('simulate：容器适配器', () => {
  it('stack 后进先出', () => {
    const r = run(`
#include <iostream>
#include <stack>
int main() {
  std::stack<int> s;
  s.push(1);
  s.push(2);
  s.push(3);
  std::cout << s.top() << " " << s.size() << std::endl;
  s.pop();
  std::cout << s.top() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('3 3\n2\n');
  });

  it('queue 先进先出', () => {
    const r = run(`
#include <iostream>
#include <queue>
int main() {
  std::queue<int> q;
  q.push(1);
  q.push(2);
  q.push(3);
  std::cout << q.front() << " " << q.back() << std::endl;
  q.pop();
  std::cout << q.front() << " " << q.size() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('1 3\n2 2\n');
  });

  it('priority_queue 每次弹出最大值', () => {
    const r = run(`
#include <iostream>
#include <queue>
int main() {
  std::priority_queue<int> pq;
  pq.push(5);
  pq.push(1);
  pq.push(9);
  std::cout << pq.top() << std::endl;
  pq.pop();
  std::cout << pq.top() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('9\n5\n');
  });
});

describe('STL 组合：pair 构造 / map 迭代器 / copy / 自定义比较器', () => {
  it('表达式位置的 pair<T1,T2>() 构造', () => {
    const r = run(`
#include <iostream>
#include <string>
using namespace std;
int main() {
  pair<string, int> p("a", 1);
  cout << p.first << p.second << endl;
  return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('a1\n');
  });

  it('vector<pair<...>> 迭代器遍历，it->first / it->second', () => {
    const r = run(`
#include <iostream>
#include <vector>
#include <string>
using namespace std;
int main() {
  vector< pair<string, int> > v;
  v.push_back(pair<string,int>("a", 1));
  v.push_back(pair<string,int>("b", 2));
  vector< pair<string, int> >::iterator it;
  for (it = v.begin(); it != v.end(); ++it) {
    cout << it->first << "=" << it->second << " ";
  }
  cout << endl;
  return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('a=1 b=2 \n');
  });

  it('sort 使用自定义比较器（之前会忽略比较器、静默排出错序）', () => {
    const r = run(`
#include <iostream>
#include <vector>
using namespace std;
struct P { int a; };
bool cmp(P& l, P& r) { return l.a < r.a; }
int main() {
  vector<P> v;
  P p1; p1.a = 3; v.push_back(p1);
  P p2; p2.a = 1; v.push_back(p2);
  P p3; p3.a = 2; v.push_back(p3);
  sort(v.begin(), v.end(), cmp);
  for (int i = 0; i < 3; i++) cout << v[i].a << " ";
  cout << endl;
  return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('1 2 3 \n');
  });

  it('map 的 begin()/end() 可以迭代', () => {
    const r = run(`
#include <iostream>
#include <map>
#include <string>
using namespace std;
int main() {
  map<string, int> m;
  m["b"] = 2;
  m["a"] = 1;
  for (map<string,int>::iterator it = m.begin(); it != m.end(); ++it) {
    cout << it->first << ":" << it->second << " ";
  }
  cout << endl;
  return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('a:1 b:2 \n');
  });

  it('copy + back_inserter 把 map 拷进 vector', () => {
    const r = run(`
#include <iostream>
#include <map>
#include <string>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
  map<string, int> m;
  m["x"] = 1;
  m["y"] = 2;
  vector< pair<string,int> > v;
  copy(m.begin(), m.end(), back_inserter(v));
  cout << v.size() << " " << v[0].first << v[0].second << endl;
  return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('2 x1\n');
  });

  it('课程例子：map → vector<pair> → 按薪水排序 → 迭代输出', () => {
    const r = run(`
#include <iostream>
#include <string>
#include <map>
#include <vector>
#include <algorithm>
using namespace std;

class Employee {
    string name;
    double salary;
public:
    Employee(string n, double s) { name = n; salary = s; }
    string getName() { return name; }
    double getSalary() { return salary; }
};

bool lessThen(pair<string, Employee*>& l, pair<string, Employee*>& r) {
    return (l.second)->getSalary() < (r.second)->getSalary();
}

int main() {
    map<string, Employee*> employees;
    employees["e1"] = new Employee("Tom", 8000);
    employees["e2"] = new Employee("Jerry", 12000);
    employees["e3"] = new Employee("Spike", 5000);

    vector< pair<string, Employee*> > employeeVec;
    copy( employees.begin(), employees.end(), back_inserter( employeeVec ) );
    sort( employeeVec.begin(), employeeVec.end(), lessThen );

    vector< pair<string, Employee*> >::iterator it;
    for ( it = employeeVec.begin(); it != employeeVec.end(); ++it ) {
        cout << (it->second)->getName() << " "
             << (it->second)->getSalary() << endl;
    }
    return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('Spike 5000\nTom 8000\nJerry 12000\n');
  });
});

describe('lambda：自定义比较器与捕获', () => {
  it('lambda 直接作为 sort 的比较器', () => {
    const r = run(`
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(3); v.push_back(1); v.push_back(2);
  sort(v.begin(), v.end(), [](int a, int b) { return a < b; });
  for (int i = 0; i < 3; i++) cout << v[i] << " ";
  cout << endl;
  return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('1 2 3 \n');
  });

  it('lambda 存进变量再传给 sort', () => {
    const r = run(`
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
  vector<int> v;
  v.push_back(3); v.push_back(1); v.push_back(2);
  auto cmp = [](int a, int b) { return a > b; };
  sort(v.begin(), v.end(), cmp);
  for (int i = 0; i < 3; i++) cout << v[i] << " ";
  cout << endl;
  return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('3 2 1 \n');
  });

  it('按值捕获是快照：外部变量改了也不影响 lambda 里的副本', () => {
    const r = run(`
#include <iostream>
using namespace std;
int main() {
  int base = 10;
  auto add = [base](int x) { return x + base; };
  cout << add(5) << endl;
  base = 100;
  cout << add(5) << endl;
  return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('15\n15\n');
  });

  it('按引用捕获能改到外部变量', () => {
    const r = run(`
#include <iostream>
using namespace std;
int main() {
  int count = 0;
  auto bump = [&count]() { count++; };
  bump(); bump(); bump();
  cout << count << endl;
  return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('3\n');
  });

  it('课程写法：map 转 vector<pair> 后用 lambda 按薪水排序', () => {
    const r = run(`
#include <iostream>
#include <string>
#include <map>
#include <vector>
#include <algorithm>
using namespace std;
class Employee {
    string name; double salary;
public:
    Employee(string n, double s) { name = n; salary = s; }
    string getName() { return name; }
    double getSalary() { return salary; }
};
int main() {
  map<string, Employee*> employees;
  employees["e1"] = new Employee("Tom", 8000);
  employees["e2"] = new Employee("Jerry", 12000);
  employees["e3"] = new Employee("Spike", 5000);
  vector< pair<string, Employee*> > vec;
  copy(employees.begin(), employees.end(), back_inserter(vec));
  sort(vec.begin(), vec.end(), [](pair<string, Employee*>& a, pair<string, Employee*>& b) {
    return (a.second)->getSalary() < (b.second)->getSalary();
  });
  for (auto it = vec.begin(); it != vec.end(); ++it)
    cout << (it->second)->getName() << " " << (it->second)->getSalary() << endl;
  return 0;
}`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('Spike 5000\nTom 8000\nJerry 12000\n');
  });
});

describe('simulate：std::swap', () => {
  it('交换两个变量', () => {
    const r = run(`
#include <iostream>
int main() {
  int a = 1, b = 2;
  swap(a, b);
  std::cout << a << " " << b << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('2 1\n');
  });

  it('交换数组元素与容器元素', () => {
    const r = run(`
#include <iostream>
#include <vector>
int main() {
  int a[3] = {1, 2, 3};
  swap(a[0], a[2]);
  vector<int> v = {4, 5, 6};
  swap(v[0], v[2]);
  std::cout << a[0] << a[1] << a[2] << " " << v[0] << v[1] << v[2] << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('321 654\n');
  });

  it('交换 vector<vector<double>> 的两行，值不串行', () => {
    const r = run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<vector<double>> m = {{1,2,3},{4,5,6},{7,8,10}};
  swap(m[0], m[2]);
  cout << m[0][0] << " " << m[0][2] << " " << m[2][0] << endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('7 10 1\n');
  });

  it('交换结构体字段', () => {
    const r = run(`
#include <iostream>
using namespace std;
struct Point { int x; int y; };
int main() {
  Point p;
  p.x = 3;
  p.y = 9;
  swap(p.x, p.y);
  cout << p.x << " " << p.y << endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('9 3\n');
  });
});

describe('simulate：嵌套 vector 的元素类型', () => {
  it('字面量初始化的 vector<vector<double>> 保留浮点（不做整数除法）', () => {
    const r = run(`
#include <iostream>
#include <vector>
using namespace std;
int main() {
  vector<vector<double>> a = {{4, 7}};
  cout << a[0][0] / a[0][1] << endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('0.5714285714\n');
  });

  it('花括号实参传给 vector<vector<double>> 形参也保留浮点', () => {
    const r = run(`
#include <iostream>
#include <vector>
using namespace std;
double ratio(vector<vector<double>> a) {
  return a[1][0] / a[2][0];
}
int main() {
  cout << ratio({{1,2,3},{4,5,6},{7,8,10}}) << endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('0.5714285714\n');
  });

  it('高精度消元求行列式：det3 与 detN 结果一致', () => {
    const r = run(`
#include <iostream>
#include <vector>
#include <cmath>
using namespace std;
double det3(double a[3][3]) {
  return a[0][0] * (a[1][1]*a[2][2] - a[1][2]*a[2][1])
       - a[0][1] * (a[1][0]*a[2][2] - a[1][2]*a[2][0])
       + a[0][2] * (a[1][0]*a[2][1] - a[1][1]*a[2][0]);
}
double detN(vector<vector<double>> a) {
  int n = a.size(), sign = 1;
  double d = 1;
  for (int c = 0; c < n; ++c) {
    int piv = c;
    for (int r = c + 1; r < n; ++r)
      if (abs(a[r][c]) > abs(a[piv][c])) piv = r;
    if (abs(a[piv][c]) < 1e-12) return 0;
    if (piv != c) { swap(a[piv], a[c]); sign = -sign; }
    d *= a[c][c];
    for (int r = c + 1; r < n; ++r) {
      double k = a[r][c] / a[c][c];
      for (int j = c; j < n; ++j) a[r][j] -= k * a[c][j];
    }
  }
  return sign * d;
}
int main() {
  double A[3][3] = {{1,2,3},{4,5,6},{7,8,10}};
  cout << det3(A) << " " << detN({{1,2,3},{4,5,6},{7,8,10}}) << endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('-3 -3\n');
  });

  it('abs 对浮点不做截断', () => {
    const r = run(`
#include <iostream>
#include <cmath>
using namespace std;
int main() {
  double x = -0.5;
  cout << abs(x) << " " << fabs(x) << endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('0.5 0.5\n');
  });
});
