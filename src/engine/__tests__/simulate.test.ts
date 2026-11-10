import { describe, expect, it } from 'vitest';
import { simulate } from '../index';

function run(code: string, stdin?: string) {
  return simulate(code, { stdin });
}

function outputOf(code: string, stdin?: string): string {
  const result = run(code, stdin);
  if (!result.ok) {
    throw new Error(`simulate 失败：${result.error?.message ?? '未知错误'}（第 ${result.error?.line ?? '?'} 行）`);
  }
  return result.output;
}

const BUBBLE = `#include <stdio.h>

void swap(int *a, int *b) {
  int t = *a;
  *a = *b;
  *b = t;
}

int main() {
  int a[5] = {5, 2, 4, 1, 3};
  int i, j;
  for (i = 0; i < 4; i++) {
    for (j = 0; j < 4 - i; j++) {
      if (a[j] > a[j + 1]) {
        swap(&a[j], &a[j + 1]);
      }
    }
  }
  for (i = 0; i < 5; i++) {
    printf("%d ", a[i]);
  }
  printf("\\n");
  return 0;
}
`;

describe('simulate：基础输出', () => {
  it('for 循环求和', () => {
    const code = `
int main() {
  int sum = 0;
  int i;
  for (i = 1; i <= 100; i++) {
    sum += i;
  }
  printf("%d\\n", sum);
  return 0;
}
`;
    expect(outputOf(code)).toBe('5050\n');
  });

  it('while 倒计时', () => {
    const code = `
int main() {
  int n = 3;
  while (n > 0) {
    printf("%d ", n);
    n--;
  }
  return 0;
}
`;
    expect(outputOf(code)).toBe('3 2 1 ');
  });

  it('嵌套 for 打印乘法表', () => {
    const code = `
int main() {
  int i, j;
  for (i = 1; i <= 3; i++) {
    for (j = 1; j <= 3; j++) {
      printf("%d ", i * j);
    }
    puts("");
  }
  return 0;
}
`;
    expect(outputOf(code)).toBe('1 2 3 \n2 4 6 \n3 6 9 \n');
  });

  it('do-while 至少执行一次', () => {
    const code = `
int main() {
  int i = 5;
  do {
    printf("%d", i);
    i++;
  } while (i < 3);
  return 0;
}
`;
    expect(outputOf(code)).toBe('5');
  });

  it('break / continue 控制循环', () => {
    const code = `
int main() {
  int i;
  for (i = 0; i < 10; i++) {
    if (i == 2) continue;
    if (i == 5) break;
    printf("%d", i);
  }
  return 0;
}
`;
    expect(outputOf(code)).toBe('0134');
  });

  it('switch 支持 fallthrough', () => {
    const code = `
int main() {
  int x = 1;
  switch (x) {
    case 1: printf("a");
    case 2: printf("b"); break;
    default: printf("c");
  }
  return 0;
}
`;
    expect(outputOf(code)).toBe('ab');
  });

  it('逻辑运算短路避免除零', () => {
    const code = `
int main() {
  int x = 0;
  if (x != 0 && 10 / x > 1) {
    printf("bad");
  } else {
    printf("ok");
  }
  return 0;
}
`;
    expect(outputOf(code)).toBe('ok');
  });

  it('三元、位运算与复合赋值', () => {
    const code = `
int main() {
  int a = 6, b = 3;
  int max = a > b ? a : b;
  int shifted = a << 2;
  a /= b;
  printf("%d %d %d", max, shifted, a);
  return 0;
}
`;
    expect(outputOf(code)).toBe('6 24 2');
  });

  it('浮点数与 %.2f 输出', () => {
    const code = `
int main() {
  double a = 3.5, b = 2.0;
  printf("%.2f\\n", a * b);
  return 0;
}
`;
    expect(outputOf(code)).toBe('7.00\n');
  });

  it('char 与 %c / putchar', () => {
    const code = `
int main() {
  char c = 'A';
  printf("%c", c);
  putchar(66);
  printf("\\n%s", "abc");
  return 0;
}
`;
    expect(outputOf(code)).toBe('AB\nabc');
  });

  it('printf 宽度、精度与转义', () => {
    const code = `
int main() {
  printf("[%5d][%-5d][%05d][%.2f][%%]\\n", 42, 42, 42, 3.14159);
  return 0;
}
`;
    expect(outputOf(code)).toBe('[   42][42   ][00042][3.14][%]\n');
  });

  it('二维数组读写', () => {
    const code = `
int main() {
  int a[2][3] = {{1, 2, 3}, {4, 5, 6}};
  a[1][0] = 40;
  printf("%d %d", a[0][2], a[1][0]);
  return 0;
}
`;
    expect(outputOf(code)).toBe('3 40');
  });

  it('全局变量在函数间共享', () => {
    const code = `
int counter = 0;
void bump() { counter++; }
int main() {
  bump();
  bump();
  printf("%d", counter);
  return 0;
}
`;
    expect(outputOf(code)).toBe('2');
  });
});

describe('simulate：验收基准', () => {
  it('冒泡排序完整执行', () => {
    expect(outputOf(BUBBLE)).toBe('1 2 3 4 5 \n');
  });

  it('递归阶乘', () => {
    const code = `
int fact(int n) {
  if (n <= 1) return 1;
  return n * fact(n - 1);
}
int main() {
  printf("%d\\n", fact(5));
  return 0;
}
`;
    expect(outputOf(code)).toBe('120\n');
  });

  it('递归斐波那契', () => {
    const code = `
int fib(int n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}
int main() {
  printf("%d", fib(7));
  return 0;
}
`;
    expect(outputOf(code)).toBe('13');
  });

  it('指针交换两个变量', () => {
    const code = `
void swap(int *a, int *b) {
  int t = *a;
  *a = *b;
  *b = t;
}
int main() {
  int x = 1, y = 2;
  swap(&x, &y);
  printf("%d %d\\n", x, y);
  return 0;
}
`;
    expect(outputOf(code)).toBe('2 1\n');
  });

  it('指针指向数组元素与下标访问', () => {
    const code = `
int main() {
  int a[4] = {10, 20, 30, 40};
  int *p = a;
  printf("%d ", *p);
  p = &a[2];
  printf("%d %d", *p, p[1]);
  return 0;
}
`;
    expect(outputOf(code)).toBe('10 30 40');
  });

  it('范围 for 遍历数组', () => {
    const code = `
int main() {
  int a[3] = {1, 2, 3};
  int sum = 0;
  for (int x : a) {
    sum += x;
  }
  printf("%d", sum);
  return 0;
}
`;
    expect(outputOf(code)).toBe('6');
  });

  it('浮点输出避免 0.30000000000000004', () => {
    const code = `
#include <iostream>
int main() {
  double x = 0.1 + 0.2;
  cout << x << endl;
  return 0;
}
`;
    expect(outputOf(code)).toBe('0.3\n');
  });

  it('scanf 读取两个整数求和', () => {
    const code = `
int main() {
  int a, b, sum;
  scanf("%d %d", &a, &b);
  sum = a + b;
  printf("%d\\n", sum);
  return 0;
}
`;
    expect(outputOf(code, '3 4')).toBe('7\n');
  });

  it('结构体数组遍历', () => {
    const code = `
#include <stdio.h>
struct Student {
  char name[20];
  int score;
};
int main() {
  struct Student s[2] = {{"Tom", 90}, {"Ann", 95}};
  int i;
  for (i = 0; i < 2; i++) {
    printf("%s %d\\n", s[i].name, s[i].score);
  }
  return 0;
}
`;
    expect(outputOf(code)).toBe('Tom 90\nAnn 95\n');
  });

  it('cout << / cin >>', () => {
    const code = `
#include <iostream>
using namespace std;
int main() {
  int x;
  cin >> x;
  cout << "x=" << x << endl;
  return 0;
}
`;
    expect(outputOf(code, '7')).toBe('x=7\n');
  });

  it('std::string 拼接与 length()', () => {
    const code = `
#include <iostream>
#include <string>
using namespace std;
int main() {
  string s = "code";
  s = s + "viz";
  cout << s << " " << s.length() << endl;
  return 0;
}
`;
    expect(outputOf(code)).toBe('codeviz 7\n');
  });

  it('字符数组与 strlen', () => {
    const code = `
#include <stdio.h>
#include <string.h>
int main() {
  char s[] = "hello";
  printf("%s %d", s, (int)strlen(s));
  return 0;
}
`;
    expect(outputOf(code)).toBe('hello 5');
  });

  it('字符指针可以当字符串输出', () => {
    const code = `
int main() {
  char s[] = "hi";
  char *p = s;
  printf("%s", p);
  return 0;
}
`;
    expect(outputOf(code)).toBe('hi');
  });

  it('printf 动态宽度 %*d', () => {
    const code = `
int main() {
  printf("[%*d]", 4, 7);
  return 0;
}
`;
    expect(outputOf(code)).toBe('[   7]');
  });
});

describe('simulate：轨迹与保护', () => {
  it('首步 start、末步 end，包含变量快照与调用栈', () => {
    const result = run(`
int add(int a, int b) { return a + b; }
int main() {
  int x = add(1, 2);
  return x;
}
`);
    expect(result.ok).toBe(true);
    expect(result.steps[0].event).toBe('start');
    expect(result.steps[result.steps.length - 1].event).toBe('end');
    const callStep = result.steps.find((step) => step.event === 'call' && step.description.includes('add'));
    expect(callStep?.description).toContain('add');
    const declareStep = result.steps.find((step) => step.event === 'declare' && step.vars.some((v) => v.name === 'x'));
    expect(declareStep?.vars.find((v) => v.name === 'x')?.valueText).toBe('3');
    expect(declareStep?.vars.find((v) => v.name === 'x')?.changed).toBe(true);
    const returnStep = result.steps.find((step) => step.event === 'return');
    expect(returnStep).toBeTruthy();
    expect(result.steps[0].callStack.length).toBeGreaterThanOrEqual(0);
  });

  it('stdout 每步累计，outputChunk 记录增量', () => {
    const result = run(`
int main() {
  printf("a");
  printf("b");
  return 0;
}
`);
    const outputs = result.steps.filter((step) => step.event === 'output');
    expect(outputs).toHaveLength(2);
    expect(outputs[0].outputChunk).toBe('a');
    expect(outputs[0].stdout).toBe('a');
    expect(outputs[1].stdout).toBe('ab');
    expect(result.output).toBe('ab');
  });

  it('数组变量快照包含 arrayValues', () => {
    const result = run(`
int main() {
  int a[3] = {1, 2, 3};
  a[1] = 9;
  return 0;
}
`);
    const step = result.steps.find((s) => s.vars.some((v) => v.name === 'a'));
    const variable = step?.vars.find((v) => v.name === 'a');
    expect(variable?.arrayValues).toEqual(['1', '2', '3']);
  });

  it('指针变量快照包含 pointerTarget', () => {
    const result = run(`
int main() {
  int x = 1;
  int *p = &x;
  return 0;
}
`);
    const pointer = result.steps
      .flatMap((step) => step.vars)
      .find((variable) => variable.name === 'p');
    expect(pointer?.pointerTarget).toBe('x');
    expect(pointer?.valueText).toContain('->');
  });

  it('超过 maxSteps 时截断但保留步骤', () => {
    const result = simulate(
      `int main() { int i = 0; while (1) { i++; } return 0; }`,
      { maxSteps: 60 },
    );
    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.steps.length).toBeLessThanOrEqual(61);
    expect(result.steps[result.steps.length - 1].event).toBe('end');
    expect(result.steps[result.steps.length - 1].description).toContain('上限');
  });

  it('除以 0 返回运行时错误', () => {
    const result = run(`
int main() {
  int a = 10;
  int b = 0;
  int c = a / b;
  return c;
}
`);
    expect(result.ok).toBe(false);
    expect(result.supported).toBe(true);
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.message).toContain('0');
  });

  it('数组越界返回运行时错误', () => {
    const result = run(`
int main() {
  int a[3] = {1, 2, 3};
  int i = 5;
  printf("%d", a[i]);
  return 0;
}
`);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.message).toContain('越界');
  });

  it('空指针解引用返回运行时错误', () => {
    const result = run(`
int main() {
  int *p = nullptr;
  *p = 1;
  return 0;
}
`);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.message).toContain('空指针');
  });

  it('输入不足返回运行时错误', () => {
    const result = simulate(
      `int main() { int a; scanf("%d", &a); return a; }`,
      { stdin: '' },
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.message).toContain('输入');
  });

  it('scanf %c 不跳过空白', () => {
    const result = run(
      `int main() { char c; scanf("%c", &c); printf("[%c]", c); return 0; }`,
      ' x',
    );
    expect(result.output).toBe('[ ]');
  });

  it('cin >> 读取多个值', () => {
    const result = run(
      `
int main() {
  int a, b;
  cin >> a >> b;
  cout << a * b << endl;
  return 0;
}
`,
      '6 7',
    );
    expect(result.output).toBe('42\n');
  });

  it('while (cin >> x) 在输入读完后结束循环', () => {
    const result = run(
      `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
  int input;
  vector<int> ivec;
  while (cin >> input)
    ivec.push_back(input);
  sort(ivec.begin(), ivec.end());
  for (vector<int>::iterator it = ivec.begin(); it != ivec.end(); ++it) {
    cout << *it << " ";
  }
  cout << endl;
  return 0;
}
`,
      '3 6 4 2 10 7',
    );
    expect(result.ok).toBe(true);
    expect(result.output).toBe('2 3 4 6 7 10 \n');
  });

  it('while (scanf("%d", &x) != EOF)', () => {
    const result = run(
      `#include <stdio.h>
int main() {
  int x, sum = 0;
  while (scanf("%d", &x) != EOF) {
    sum += x;
  }
  printf("%d\\n", sum);
  return 0;
}
`,
      '1 2 3 4',
    );
    expect(result.ok).toBe(true);
    expect(result.output).toBe('10\n');
  });

  it('getchar() 读到末尾返回 EOF', () => {
    const result = run(
      `#include <stdio.h>
int main() {
  int c = getchar();
  int n = 0;
  while (c != EOF) {
    n++;
    c = getchar();
  }
  printf("%d\\n", n);
  return 0;
}
`,
      'abc',
    );
    expect(result.ok).toBe(true);
    expect(result.output).toBe('3\n');
  });

  it('文件操作返回 unsupported', () => {
    const result = run(`
#include <stdio.h>
int main() {
  FILE *fp = fopen("a.txt", "r");
  return 0;
}
`);
    expect(result.ok).toBe(false);
    expect(result.supported).toBe(false);
    expect(result.error?.kind).toBe('unsupported');
    expect(result.error?.line).toBeGreaterThan(0);
  });

  it('类对象与成员函数已经可以执行', () => {
    const result = run(`
#include <iostream>
class Shape {
  double k;
public:
  Shape(double k) : k(k) {}
  double area() { return k * k; }
};
int main() {
  Shape s(3);
  std::cout << s.area() << std::endl;
  return 0;
}
`);
    expect(result.ok).toBe(true);
    expect(result.output).toBe('9\n');
  });

  it('没有 main 返回 unsupported', () => {
    const result = run('int add(int a, int b) { return a + b; }');
    expect(result.ok).toBe(false);
    expect(result.supported).toBe(false);
    expect(result.error?.message).toContain('main');
  });

  it('递归过深返回运行时错误', () => {
    const result = run(`
int down(int n) {
  return down(n - 1);
}
int main() {
  return down(5);
}
`);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.message).toContain('递归');
  });

  it('空代码不崩溃', () => {
    const result = simulate('');
    expect(result.ok).toBe(false);
    expect(result.supported).toBe(false);
  });

  it('性能：3000 步量级执行在合理时间内', () => {
    const started = Date.now();
    const result = simulate(
      `
int main() {
  int i, sum = 0;
  for (i = 0; i < 500; i++) {
    sum += i;
  }
  printf("%d", sum);
  return 0;
}
`,
      { maxSteps: 5000 },
    );
    const elapsed = Date.now() - started;
    expect(result.ok).toBe(true);
    expect(result.output).toBe('124750');
    expect(result.steps.length).toBeGreaterThan(500);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('simulate：标准库覆盖', () => {
  it('string.h 的 strcpy / strcat / strcmp / strlen 可用', () => {
    const out = outputOf(`
#include <string.h>
#include <stdio.h>
int main() {
  char a[16] = "hello";
  char b[16] = "C";
  strcat(a, b);
  printf("%s %d\\n", a, (int)strlen(a));
  strcpy(b, "world");
  printf("%s %d\\n", b, strcmp(b, "world"));
  return 0;
}
`);
    expect(out).toBe('helloC 6\nworld 0\n');
  });

  it('ctype.h 与 atoi 可用', () => {
    const out = outputOf(`
#include <ctype.h>
#include <stdlib.h>
#include <stdio.h>
int main() {
  char c = 'A';
  printf("%d %d %d\\n", isupper(c), isalpha('7'), isdigit('7'));
  printf("%d %c\\n", atoi("42x"), tolower(c));
  return 0;
}
`);
    expect(out).toBe('1 0 1\n42 a\n');
  });

  it('getchar 按字符读取输入', () => {
    const out = outputOf(
      `
#include <stdio.h>
int main() {
  char a = getchar();
  char b = getchar();
  printf("%c%c", b, a);
  return 0;
}
`,
      'ok',
    );
    expect(out).toBe('ko');
  });

  it('math.h 扩展函数返回浮点结果', () => {
    const out = outputOf(`
#include <math.h>
#include <stdio.h>
int main() {
  printf("%.2f %.2f %.2f\\n", sqrt(16.0), sin(0.0), fmod(7.0, 4.0));
  return 0;
}
`);
    expect(out).toBe('4.00 0.00 3.00\n');
  });
});

describe('simulate：引用语义', () => {
  const runRef = (code: string) => simulate(code, { maxSteps: 20000 });

  it('引用变量是别名，改 r 就是改 a', () => {
    const r = runRef(`
#include <iostream>
int main() {
  int a = 10;
  int& r = a;
  r = 20;
  std::cout << a << " ";
  a = 30;
  std::cout << r << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output.trim()).toBe('20 30');
  });

  it('范围 for 带引用时改的是容器里的元素', () => {
    const r = runRef(`
#include <iostream>
#include <vector>
int main() {
  int v[3] = {1, 2, 3};
  for (int& item : v) {
    item = item * 2;
  }
  for (int item : v) std::cout << item << " ";
  std::cout << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output.trim()).toBe('2 4 6');
  });

  it('返回引用的函数可以写在赋值号左边', () => {
    const r = runRef(`
#include <iostream>
int& at(int* a, int i) { return a[i]; }
int main() {
  int v[3] = {1, 2, 3};
  at(v, 1) = 9;
  std::cout << v[1] << std::endl;
  int& r = at(v, 2);
  r = 7;
  std::cout << v[2] << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('9\n7\n');
  });

  it('返回引用的成员函数也能被赋值', () => {
    const r = runRef(`
#include <iostream>
class Grid {
public:
  Grid() { for (int i = 0; i < 3; i++) data_[i] = i; }
  int& at(int i) { return data_[i]; }
private:
  int data_[3];
};
int main() {
  Grid g;
  g.at(1) = 42;
  std::cout << g.at(1) << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('42\n');
  });

  it('返回引用的调用可以直接传给引用参数', () => {
    const r = runRef(`
#include <iostream>
int& at(int* a, int i) { return a[i]; }
void bump(int& x) { x = x + 100; }
int main() {
  int v[3] = {1, 2, 3};
  bump(at(v, 0));
  std::cout << v[0] << std::endl;
  return 0;
}
`);
    expect(r.ok, r.error?.message).toBe(true);
    expect(r.output).toBe('101\n');
  });
});
