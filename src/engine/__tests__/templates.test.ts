import { describe, expect, it } from 'vitest';
import { analyzeCode, simulate } from '../index';
import { samples } from '../../data';

const run = (code: string) => simulate(code, { maxSteps: 20000 });

const sampleCode = (id: string): string => {
  const sample = samples.find((item) => item.id === id);
  if (!sample) throw new Error(`找不到样例 ${id}`);
  return sample.code;
};

describe('函数模板', () => {
  it('maxValue：int / double / string 三种实参各展开一份', () => {
    const r = run(sampleCode('template-max'));
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output.trim().split('\n')).toEqual(['9', '2.5', 'pear']);
  });

  it('模板函数的调用步里能看到展开出来的具体函数', () => {
    const r = run(`
template <typename T>
T twice(T v) { return v + v; }
int main() {
  int a = twice(3);
  double b = twice(1.5);
  return a;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.steps.some((step) => step.event === 'call' && step.description.includes('twice'))).toBe(true);
  });

  it('实参类型推导不出来时给出明确说明，而不是崩掉', () => {
    const r = run(`
template <typename T>
T pick(T a, T b) { return a; }
int main() {
  int x = pick(1, 2.5);
  return x;
}
`);
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe('unsupported');
    expect(r.error?.message).toContain('函数模板');
  });
});

describe('类模板', () => {
  it('Stack<int>：push / pop 按栈序输出', () => {
    const r = run(sampleCode('template-stack'));
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output.trim()).toBe('30 20 10');
  });

  it('static const 成员被当成员常量：kCapacity 决定数组长度', () => {
    const r = run(`
#include <iostream>
template <typename T>
class Buffer {
public:
  Buffer() { used_ = 0; }
  bool add(const T& v) {
    if (used_ == kMax) return false;
    data_[used_] = v;
    used_++;
    return true;
  }
  int used() const { return used_; }
private:
  static const int kMax = 3;
  T data_[kMax];
  int used_ = 0;
};
int main() {
  Buffer<int> b;
  b.add(1); b.add(2); b.add(3); b.add(4);
  std::cout << b.used() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    // 第 4 次 add 被 kMax 挡掉，used_ 停在 3
    expect(r.output.trim()).toBe('3');
  });

  it('同一个类模板的不同实参各自独立展开', () => {
    const r = run(`
#include <iostream>
template <typename T>
class Box {
public:
  Box(T v) { value_ = v; }
  T get() const { return value_; }
private:
  T value_;
};
int main() {
  Box<int> a(7);
  Box<double> b(1.5);
  std::cout << a.get() << " " << b.get() << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output.trim()).toBe('7 1.5');
  });

  it('类图里模板类带上参数名', () => {
    const analysis = analyzeCode(sampleCode('template-stack'));
    expect(analysis.classes.map((item) => item.name)).toContain('Stack<T>');
  });
});

describe('std::vector', () => {
  it('push_back / size / 范围 for 求和 / sort', () => {
    const r = run(sampleCode('stl-vector'));
    expect(r.ok, r.error?.message).toBe(true);
    const lines = r.output.trim().split('\n');
    expect(lines[0]).toBe('size = 6');
    expect(lines[1]).toBe('sum = 493');
    expect(lines[2]).toBe('sorted: 60 72 78 88 95 100');
  });

  it('vector<string> 与 front / back / size', () => {
    const r = run(sampleCode('vector-stats'));
    expect(r.ok, r.error?.message).toBe(true);
    const lines = r.output.trim().split('\n');
    expect(lines[0]).toBe('names: Ada Linus Grace Ken ');
    expect(lines[1]).toBe('min = 75, max = 100');
    expect(lines[2]).toBe('average = 87');
  });

  it('sort 只重排给定区间（begin 到 begin+3）', () => {
    const r = run(`
#include <algorithm>
#include <iostream>
int main() {
  int a[5] = {5, 4, 3, 2, 1};
  std::sort(a, a + 3);
  for (int i = 0; i < 5; i++) std::cout << a[i] << " ";
  std::cout << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output.trim()).toBe('3 4 5 2 1');
  });
});
