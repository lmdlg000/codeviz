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
