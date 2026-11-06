import { describe, expect, it } from 'vitest';
import { samples } from '../../data';
import { analyzeCode, detectLanguage, getEngineInfo } from '../index';
import type { FlowchartNode } from '../types';

function flowNodes(node: FlowchartNode | undefined, out: FlowchartNode[] = []): FlowchartNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of node.children ?? []) flowNodes(child, out);
  flowNodes(node.yes, out);
  flowNodes(node.no, out);
  flowNodes(node.body, out);
  for (const switchCase of node.cases ?? []) flowNodes(switchCase.body, out);
  return out;
}

function flowKinds(node: FlowchartNode | undefined): string[] {
  return flowNodes(node).map((item) => item.kind);
}

function findFlow(node: FlowchartNode | undefined, predicate: (n: FlowchartNode) => boolean): FlowchartNode | undefined {
  return flowNodes(node).find(predicate);
}

const HELLO = `#include <stdio.h>

// 第一段程序
int main() {
  printf("Hello, CodeViz!\\n");
  return 0;
}
`;

const ADD = `int add(int a, int b) {
  int sum = a + b;
  return sum;
}

int main() {
  int result = add(2, 3);
  printf("%d\\n", result);
  return 0;
}
`;

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
  return 0;
}
`;

const CPP_CLASSES = `#include <iostream>
using namespace std;

class Shape {
public:
  virtual double area() const = 0;
  virtual ~Shape() {}
};

class Circle : public Shape {
private:
  double r;
public:
  Circle(double radius) : r(radius) {}
  double area() const override { return 3.14 * r * r; }
};
`;

describe('analyzeCode：基础与统计', () => {
  it('识别 C / C++ 语言', () => {
    expect(detectLanguage(HELLO)).toBe('c');
    expect(detectLanguage(CPP_CLASSES)).toBe('cpp');
    expect(detectLanguage('int main(){}', 'a.cpp')).toBe('cpp');
    expect(detectLanguage('int main(){}', 'main.c')).toBe('c');
  });

  it('统计行数 / 注释 / 空行', () => {
    const result = analyzeCode(HELLO);
    expect(result.ok).toBe(true);
    expect(result.stats.totalLines).toBe(8);
    expect(result.stats.commentLines).toBe(1);
    expect(result.stats.blankLines).toBe(2);
    expect(result.stats.codeLines).toBe(5);
    expect(result.includes).toContain('stdio.h');
  });

  it('统计函数 / 循环 / 分支 / 复杂度 / 难度', () => {
    const result = analyzeCode(BUBBLE);
    expect(result.stats.functions).toBe(2);
    expect(result.stats.loops).toBe(3);
    expect(result.stats.branches).toBe(1);
    expect(result.stats.cyclomaticComplexity).toBeGreaterThan(3);
    expect(result.stats.maxNesting).toBe(3);
    expect(result.stats.difficulty).toBe('进阶');
    expect(result.stats.arrays).toBe(1);
    expect(result.stats.pointers).toBeGreaterThanOrEqual(2);
  });

  it('else-if 链不算深层嵌套', () => {
    const code = `
int main() {
  int score = 85;
  if (score >= 90) printf("A");
  else if (score >= 80) printf("B");
  else if (score >= 70) printf("C");
  else if (score >= 60) printf("D");
  else printf("E");
  return 0;
}
`;
    const result = analyzeCode(code);
    expect(result.stats.maxNesting).toBe(1);
    expect(result.stats.branches).toBe(4);
    expect(result.stats.cyclomaticComplexity).toBe(5);
    expect(['入门', '基础']).toContain(result.stats.difficulty);
  });

  it('难度校准：简单示例不虚高', () => {
    const circle = analyzeCode(`
int main() {
  double r = 2.0;
  double area = 3.14 * r * r;
  printf("%.2f", area);
  return 0;
}
`);
    expect(circle.stats.maxNesting).toBe(0);
    expect(circle.stats.difficulty).toBe('入门');

    const sum = analyzeCode(`
int main() {
  int sum = 0;
  for (int i = 1; i <= 100; i++) sum += i;
  printf("%d", sum);
  return 0;
}
`);
    expect(sum.stats.difficulty).toBe('基础');

    const cpp = analyzeCode(CPP_CLASSES);
    expect(cpp.stats.difficulty).toBe('进阶');
  });

  it('函数信息：签名 / 参数 / 局部变量 / span', () => {
    const result = analyzeCode(ADD);
    const add = result.functions.find((fn) => fn.name === 'add');
    expect(add).toBeTruthy();
    expect(add?.signature).toBe('int add(int a, int b)');
    expect(add?.params.map((p) => p.name)).toEqual(['a', 'b']);
    expect(add?.locals.map((l) => l.name)).toContain('sum');
    expect(add?.span.startLine).toBe(1);
    expect(add?.lineCount).toBe(4);
    expect(result.functions.find((fn) => fn.name === 'main')?.calls.map((c) => c.callee)).toContain('add');
  });

  it('main 函数 kind 与返回值分析', () => {
    const result = analyzeCode(ADD);
    const main = result.functions.find((fn) => fn.name === 'main');
    expect(main?.kind).toBe('main');
    const add = result.functions.find((fn) => fn.name === 'add');
    expect(add?.hasReturnOnAllPaths).toBe(true);
  });

  it('空代码不崩溃', () => {
    const result = analyzeCode('');
    expect(result.ok).toBe(true);
    expect(result.functions).toHaveLength(0);
    expect(result.flowcharts).toHaveLength(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.parseErrors).toBe(0);
  });

  it('乱码输入不崩溃且给出解析诊断', () => {
    const result = analyzeCode('@@@ int ??? { ] } #$%^');
    expect(result.ok).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.parseErrors).toBeGreaterThanOrEqual(0);
  });

  it('getEngineInfo 返回契约字段', () => {
    const info = getEngineInfo();
    expect(info.name).toBeTruthy();
    expect(info.schemaVersion).toBe(1);
    expect(info.supportedPatterns.length).toBeGreaterThan(5);
  });

  it('超过 500 行给出 line-limit 错误但仍分析', () => {
    const code = `int main() {\n${'  int x = 1;\n'.repeat(520)}  return 0;\n}`;
    const result = analyzeCode(code);
    expect(result.diagnostics.some((d) => d.rule === 'line-limit')).toBe(true);
    expect(result.stats.functions).toBe(1);
  });
});

describe('analyzeCode：函数与调用图', () => {
  it('直接递归被标记', () => {
    const result = analyzeCode('int fact(int n) { if (n <= 1) return 1; return n * fact(n - 1); }');
    const fact = result.functions.find((fn) => fn.name === 'fact');
    expect(fact?.isRecursive).toBe(true);
    expect(result.callGraph.hasRecursion).toBe(true);
    expect(result.callGraph.nodes.find((n) => n.name === 'fact')?.recursive).toBe(true);
  });

  it('间接递归被标记', () => {
    const code = `
int isEven(int n);
int isOdd(int n) { if (n == 0) return 0; return isEven(n - 1); }
int isEven(int n) { if (n == 0) return 1; return isOdd(n - 1); }
`;
    const result = analyzeCode(code);
    expect(result.callGraph.hasRecursion).toBe(true);
  });

  it('调用边去重并计数', () => {
    const code = `
int f(int x) { return x + 1; }
int main() {
  int a = f(1);
  int b = f(2);
  return a + b;
}
`;
    const result = analyzeCode(code);
    const edge = result.callGraph.edges.find((e) => e.count === 2);
    expect(edge).toBeTruthy();
    expect(edge?.line).toBe(4);
  });

  it('外部函数聚合，roots 与 depth 正确', () => {
    const result = analyzeCode(ADD);
    expect(result.callGraph.externalCalls).toContain('printf');
    expect(result.callGraph.roots).toHaveLength(1);
    const main = result.callGraph.nodes.find((n) => n.name === 'main');
    expect(main?.depth).toBe(0);
    const add = result.callGraph.nodes.find((n) => n.name === 'add');
    expect(add?.depth).toBe(1);
    expect(result.callGraph.maxDepth).toBe(1);
  });

  it('解释器支持度：纯教学代码支持，类方法不支持', () => {
    const simple = analyzeCode(ADD);
    expect(simple.interpreterSupported).toBe(true);
    expect(simple.functions.find((fn) => fn.name === 'add')?.interpreterSupported).toBe(true);

    const cpp = analyzeCode(CPP_CLASSES);
    expect(cpp.interpreterSupported).toBe(false);
    expect(cpp.interpreterHint).toBeTruthy();
    expect(cpp.functions.find((fn) => fn.name === 'area')?.interpreterSupported).toBe(false);
  });

  it('模板前缀可以被跳过', () => {
    const code = `
template <typename T>
T maxOf(T a, T b) { return a > b ? a : b; }
int main() { return 0; }
`;
    const result = analyzeCode(code);
    expect(result.functions.map((fn) => fn.name)).toContain('maxOf');
    expect(result.parseErrors).toBe(0);
  });
});

describe('analyzeCode：流程图', () => {
  it('每个函数都有 start / end', () => {
    const result = analyzeCode(BUBBLE);
    expect(result.flowcharts).toHaveLength(2);
    for (const chart of result.flowcharts) {
      expect(chart.entry.kind).toBe('block');
      const children = chart.entry.children ?? [];
      expect(children[0].kind).toBe('start');
      expect(children[children.length - 1].kind).toBe('end');
      expect(chart.nodeCount).toBeGreaterThanOrEqual(2);
    }
  });

  it('if / else 生成 decision 与 yes / no', () => {
    const code = `
int main() {
  int x = 5;
  if (x > 3) {
    printf("big");
  } else {
    printf("small");
  }
  return 0;
}
`;
    const result = analyzeCode(code);
    const chart = result.flowcharts[0];
    const decision = findFlow(chart.entry, (n) => n.kind === 'decision');
    expect(decision).toBeTruthy();
    expect(decision?.condition).toBe('x > 3');
    expect(decision?.yes).toBeTruthy();
    expect(decision?.no).toBeTruthy();
    expect(findFlow(decision?.yes, (n) => n.kind === 'output')).toBeTruthy();
    expect(findFlow(decision?.no, (n) => n.kind === 'output')).toBeTruthy();
  });

  it('无 else 时 no 分支为空 block', () => {
    const result = analyzeCode('int main() { int x = 1; if (x) { x = 2; } return 0; }');
    const decision = findFlow(result.flowcharts[0].entry, (n) => n.kind === 'decision');
    expect(decision?.no?.kind).toBe('block');
    expect(decision?.no?.children ?? []).toHaveLength(0);
  });

  it('for / while / do-while 循环节点', () => {
    const code = `
int main() {
  int i = 0;
  while (i < 3) { i++; }
  for (int j = 0; j < 2; j++) { i += j; }
  do { i--; } while (i > 0);
  return 0;
}
`;
    const result = analyzeCode(code);
    const loops = flowNodes(result.flowcharts[0].entry).filter((n) => n.kind === 'loop');
    expect(loops).toHaveLength(3);
    expect(loops.some((n) => n.loopKind === 'while')).toBe(true);
    expect(loops.some((n) => n.loopKind === 'for')).toBe(true);
    const doLoop = loops.find((n) => n.loopKind === 'do');
    expect(doLoop?.testAfter).toBe(true);
  });

  it('switch 生成 cases 并保留 case 标签', () => {
    const code = `
int main() {
  int x = 1;
  switch (x) {
    case 1: printf("one"); break;
    case 2: printf("two"); break;
    default: printf("other");
  }
  return 0;
}
`;
    const result = analyzeCode(code);
    const switchNode = findFlow(result.flowcharts[0].entry, (n) => n.kind === 'switch');
    expect(switchNode).toBeTruthy();
    expect(switchNode?.cases?.length).toBe(3);
    expect(switchNode?.cases?.[0].label).toContain('case 1');
    expect(switchNode?.cases?.[2].isDefault).toBe(true);
    expect(findFlow(switchNode?.cases?.[0].body, (n) => n.kind === 'output')).toBeTruthy();
    expect(findFlow(switchNode?.cases?.[0].body, (n) => n.kind === 'break')).toBeTruthy();
  });

  it('printf / scanf / 调用分别映射为 output / input / call', () => {
    const code = `
int add(int a, int b) { return a + b; }
int main() {
  int x;
  scanf("%d", &x);
  int y;
  y = add(x, 2);
  printf("%d", y);
  return 0;
}
`;
    const result = analyzeCode(code);
    const kinds = flowKinds(result.flowcharts.find((c) => c.functionName === 'main')?.entry);
    expect(kinds).toContain('input');
    expect(kinds).toContain('output');
    expect(kinds).toContain('call');
  });

  it('return / break / continue 成为独立节点', () => {
    const code = `
int main() {
  int i;
  for (i = 0; i < 10; i++) {
    if (i == 2) continue;
    if (i == 5) break;
  }
  return 0;
}
`;
    const result = analyzeCode(code);
    const kinds = flowKinds(result.flowcharts[0].entry);
    expect(kinds).toContain('continue');
    expect(kinds).toContain('break');
    expect(kinds).toContain('return');
  });

  it('空函数体生成 空函数体 节点', () => {
    const result = analyzeCode('void nothing() {}');
    const chart = result.flowcharts[0];
    expect(chart.entry.children?.some((n) => n.kind === 'process' && n.label.includes('空函数体'))).toBe(true);
  });

  it('节点 id 全局唯一且行号准确', () => {
    const result = analyzeCode(BUBBLE);
    const ids = new Set<string>();
    for (const chart of result.flowcharts) {
      for (const node of flowNodes(chart.entry)) {
        expect(ids.has(node.id)).toBe(false);
        ids.add(node.id);
        expect(node.line).toBeGreaterThan(0);
      }
    }
  });
});

describe('analyzeCode：类、内存、大纲', () => {
  it('成员方法修饰符与返回类型分离', () => {
    const code = `
class Shape {
public:
  virtual double area() const = 0;
  const char* name() const override;
  virtual ~Shape() {}
};

class Circle : public Shape {
  double r;
public:
  Circle(double radius);
  ~Circle();
  double area() const override { return 3.14 * r * r; }
  int* data() { return nullptr; }
};
`;
    const result = analyzeCode(code);
    const shape = result.classes.find((c) => c.name === 'Shape');
    const area = shape?.methods.find((m) => m.name === 'area');
    expect(area?.returnType).toBe('double');
    expect(area?.signature).toContain('virtual');
    expect(area?.signature).toContain('const');
    expect(area?.signature).toContain('= 0');
    expect(area?.isPureVirtual).toBe(true);
    expect(area?.isConst).toBe(true);

    const named = shape?.methods.find((m) => m.name === 'name');
    expect(named?.returnType).toBe('const char*');
    expect(named?.signature).toContain('const char*');
    expect(named?.isVirtual).toBe(true);
    expect(named?.isConst).toBe(true);
    expect(named?.isPureVirtual).toBeUndefined();

    const destructor = shape?.methods.find((m) => m.kind === 'destructor');
    expect(destructor?.returnType).toBe('');

    const circle = result.classes.find((c) => c.name === 'Circle');
    const constructor = circle?.methods.find((m) => m.kind === 'constructor');
    expect(constructor?.name).toBe('Circle');
    expect(constructor?.returnType).toBe('');
    expect(circle?.methods.find((m) => m.name === '~Circle')?.kind).toBe('destructor');
    expect(circle?.methods.find((m) => m.name === 'data')?.returnType).toBe('int*');

    // FunctionInfo 同样使用干净的返回类型
    const areaInfo = result.functions.find((fn) => fn.name === 'area' && fn.className === 'Shape');
    expect(areaInfo?.returnType).toBe('double');
    expect(result.functions.find((fn) => fn.name === 'data')?.returnType).toBe('int*');
  });

  it('C++ class 字段 / 方法 / 访问控制 / 继承 / 纯虚', () => {
    const result = analyzeCode(CPP_CLASSES);
    const shape = result.classes.find((c) => c.name === 'Shape');
    const circle = result.classes.find((c) => c.name === 'Circle');
    expect(shape?.kind).toBe('class');
    expect(shape?.isAbstract).toBe(true);
    expect(shape?.methods.some((m) => m.isPureVirtual)).toBe(true);
    expect(shape?.methods.some((m) => m.kind === 'destructor')).toBe(true);
    expect(circle?.bases).toContain('Shape');
    expect(circle?.fields.find((f) => f.name === 'r')?.access).toBe('private');
    expect(circle?.methods.find((m) => m.name === 'Circle')?.kind).toBe('constructor');
    expect(result.callGraph.externalCalls).not.toContain('Circle');
  });

  it('构造函数调用进入调用图而不是外部函数', () => {
    const code = `
class Rect {
public:
  int w;
  Rect(int width) : w(width) {}
};
int main() {
  Rect r(3);
  return r.w;
}
`;
    const result = analyzeCode(code);
    expect(result.callGraph.externalCalls).not.toContain('Rect');
    expect(result.callGraph.edges.length).toBeGreaterThan(0);
    expect(result.callGraph.nodes.some((n) => n.kind === 'constructor')).toBe(true);
  });

  it('struct 默认 public，字段类型正确', () => {
    const code = `
struct Student {
  char name[20];
  int score;
};
int main() { struct Student s; s.score = 90; return 0; }
`;
    const result = analyzeCode(code);
    const student = result.classes.find((c) => c.name === 'Student');
    expect(student?.kind).toBe('struct');
    expect(student?.fields.every((f) => f.access === 'public')).toBe(true);
    expect(student?.fields.find((f) => f.name === 'name')?.category).toBe('array');
  });

  it('类外定义合并到类方法', () => {
    const code = `
class Rect {
public:
  int area();
};
int Rect::area() { return 4; }
`;
    const result = analyzeCode(code);
    const rect = result.classes.find((c) => c.name === 'Rect');
    expect(rect?.methods.filter((m) => m.name === 'area')).toHaveLength(1);
  });

  it('内存模型：全局 / 栈帧 / 数组值 / 指针目标 / 字节数', () => {
    const code = `
int g = 10;
int main() {
  int n = 3;
  int arr[3] = {1, 2, 3};
  int *p = &n;
  return 0;
}
`;
    const result = analyzeCode(code);
    expect(result.memory.globals.find((c) => c.name === 'g')?.bytes).toBe(4);
    const frame = result.memory.stack.find((f) => f.functionName === 'main');
    expect(frame).toBeTruthy();
    const arr = frame?.cells.find((c) => c.name === 'arr');
    expect(arr?.arrayValues).toEqual(['1', '2', '3']);
    expect(arr?.bytes).toBe(12);
    const pointer = frame?.cells.find((c) => c.name === 'p');
    expect(pointer?.pointerTarget).toBe('n');
    expect(result.memory.totalBytes).toBeGreaterThan(0);
    expect(result.memory.notes.length).toBeGreaterThan(0);
  });

  it('new 分配进入 heap', () => {
    const code = `int main() { int *p = new int[5]; return 0; }`;
    const result = analyzeCode(code);
    expect(result.memory.heap).toHaveLength(1);
    expect(result.memory.heap[0].bytes).toBe(20);
  });

  it('结构体数组遍历也能分析', () => {
    const code = `
struct Student { char name[20]; int score; };
int main() {
  struct Student s[2] = {{"Tom", 90}, {"Ann", 95}};
  for (int i = 0; i < 2; i++) {
    printf("%s %d\\n", s[i].name, s[i].score);
  }
  return 0;
}
`;
    const result = analyzeCode(code);
    expect(result.parseErrors).toBe(0);
    expect(result.classes[0].name).toBe('Student');
    expect(result.stats.functions).toBe(1);
  });

  it('outline 根为 program 且包含 include / 函数', () => {
    const result = analyzeCode(ADD);
    expect(result.outline.kind).toBe('program');
    const kinds = (result.outline.children ?? []).map((child) => child.kind);
    expect(kinds).toContain('function');
    const fn = (result.outline.children ?? []).find((child) => child.kind === 'function');
    expect(fn?.children?.length).toBeGreaterThan(0);
  });

  it('globals 与 typedef 被记录', () => {
    const code = `
typedef unsigned long ulong;
ulong big = 10;
int main() { return 0; }
`;
    const result = analyzeCode(code);
    expect(result.globals.find((g) => g.name === 'big')?.sizeBytes).toBe(4);
    expect(result.outline.children?.some((child) => child.label.includes('typedef'))).toBe(true);
  });
});

describe('analyzeCode：诊断规则', () => {
  const rulesOf = (code: string): string[] => analyzeCode(code).diagnostics.map((d) => d.rule);

  it('非 void 函数缺少返回值', () => {
    const rules = rulesOf('int f(int x) { if (x > 0) { return 1; } }');
    expect(rules).toContain('missing-return');
  });

  it('if 条件中误用赋值', () => {
    const rules = rulesOf('int main() { int x = 1; if (x = 0) { return 1; } return 0; }');
    expect(rules).toContain('assignment-in-condition');
  });

  it('scanf 缺少取地址符', () => {
    const rules = rulesOf('int main() { int x; scanf("%d", x); return 0; }');
    expect(rules).toContain('scanf-missing-address');
  });

  it('数组下标越界', () => {
    const rules = rulesOf('int main() { int a[3] = {0}; int x = a[5]; return x; }');
    expect(rules).toContain('array-index-out-of-bounds');
  });

  it('未使用的局部变量（参数不报）', () => {
    const result = analyzeCode('int f(int a) { int unused = 1; return a; }');
    const unused = result.diagnostics.filter((d) => d.rule === 'unused-variable');
    expect(unused).toHaveLength(1);
    expect(unused[0].message).toContain('unused');
  });

  it('除数为字面量 0', () => {
    const rules = rulesOf('int main() { int x = 10 / 0; return x; }');
    expect(rules).toContain('division-by-zero');
  });

  it('printf 格式符与参数数量不符', () => {
    const rules = rulesOf('int main() { int a = 1; printf("%d %d", a); return 0; }');
    expect(rules).toContain('printf-arg-mismatch');
  });

  it('空循环体', () => {
    const rules = rulesOf('int main() { int i = 0; while (i < 3); return 0; }');
    expect(rules).toContain('empty-loop-body');
  });

  it('缺少分号能被定位', () => {
    const result = analyzeCode('int main() { int x = 1 int y = 2; return 0; }');
    expect(result.diagnostics.some((d) => d.rule === 'missing-semicolon')).toBe(true);
  });

  it('诊断按行号排序且不超过 40 条', () => {
    const code = `int main() {\n${'  int unusedVar = 10 / 0;\n'.repeat(60)}  return 0;\n}`;
    const result = analyzeCode(code);
    expect(result.diagnostics.length).toBeLessThanOrEqual(40);
    const lines = result.diagnostics.map((d) => d.line);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
  });

  it('构造函数 / 析构函数不会误报缺少返回值', () => {
    const code = `
class A {
public:
  A() {}
  ~A() {}
  void reset() {}
};
int main() { return 0; }
`;
    const result = analyzeCode(code);
    expect(result.diagnostics.filter((d) => d.rule === 'missing-return')).toHaveLength(0);
    expect(result.functions.find((fn) => fn.kind === 'constructor')?.hasReturnOnAllPaths).toBe(true);
  });

  it('纯虚函数 / 虚析构 / void 方法也不会误报缺少返回值', () => {
    const code = `
class Shape {
public:
  virtual double area() const = 0;
  virtual ~Shape() {}
  void show() {}
};
class Circle : public Shape {
public:
  Circle(double r) : r(r) {}
  ~Circle() {}
  double area() const override { return 3.14 * r * r; }
private:
  double r;
};
int main() { return 0; }
`;
    const result = analyzeCode(code, { filename: 'sample.cpp' });
    expect(result.diagnostics.filter((d) => d.rule === 'missing-return')).toHaveLength(0);
    for (const fn of result.functions.filter((item) => item.kind === 'constructor' || item.kind === 'destructor')) {
      expect(fn.hasReturnOnAllPaths).toBe(true);
    }
  });

  it('content 的 C++ 类示例没有缺少返回值误报', () => {
    for (const id of ['class-rectangle', 'shape-polymorphism']) {
      const sample = samples.find((item) => item.id === id);
      if (!sample) continue;
      const result = analyzeCode(sample.code, { filename: 'sample.cpp' });
      const missing = result.diagnostics.filter((d) => d.rule === 'missing-return');
      expect(missing, `${id}: ${missing.map((d) => d.message).join('; ')}`).toHaveLength(0);
    }
  });

  it('scanf 传入数组名不误报取地址', () => {
    const result = analyzeCode('int main() { int a[3]; scanf("%d", a); return 0; }');
    expect(result.diagnostics.filter((d) => d.rule === 'scanf-missing-address')).toHaveLength(0);
  });

  it('未定义的函数调用给出 info', () => {
    const rules = rulesOf('int main() { mystery(1); return 0; }');
    expect(rules).toContain('undefined-function');
  });

  it('重复定义函数给出 warning', () => {
    const rules = rulesOf('int f() { return 1; }\nint f() { return 2; }\nint main() { return f(); }');
    expect(rules).toContain('duplicate-definition');
  });

  it('scanf 参数数量不符', () => {
    const rules = rulesOf('int main() { int a; scanf("%d %d", &a); return 0; }');
    expect(rules).toContain('scanf-arg-count');
  });

  it('500 行规模分析在 100ms 量级', () => {
    const lines: string[] = ['#include <stdio.h>', 'int main() {'];
    for (let i = 0; i < 120; i++) {
      lines.push(`  int v${i} = ${i};`);
      lines.push(`  if (v${i} % 2 == 0) { v${i} += 1; }`);
    }
    lines.push('  return 0;', '}');
    const code = lines.join('\n');
    expect(code.split('\n').length).toBeGreaterThan(240);
    const started = Date.now();
    const result = analyzeCode(code);
    const elapsed = Date.now() - started;
    expect(result.ok).toBe(true);
    expect(result.stats.codeLines).toBeGreaterThan(200);
    expect(elapsed).toBeLessThan(500);
  });

  it('完整合法的冒泡排序没有 error 级别诊断', () => {
    const result = analyzeCode(BUBBLE);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });
});
