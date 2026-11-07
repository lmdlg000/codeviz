import { describe, expect, it } from 'vitest';
import { simulate } from '../index';

function run(code: string, stdin?: string) {
  return simulate(code, { stdin });
}

describe('simulate：new / delete 堆内存', () => {
  it('new int 与 delete 正常执行，堆块被标记释放', () => {
    const result = run(`
#include <stdio.h>
int main() {
  int *p = new int(42);
  printf("%d\\n", *p);
  delete p;
  return 0;
}
`);
    expect(result.ok).toBe(true);
    expect(result.output).toBe('42\n');
    const withHeap = result.steps.filter((step) => step.heap && step.heap.length > 0);
    expect(withHeap.length).toBeGreaterThan(0);
    const first = withHeap[0].heap![0];
    expect(first.label).toBe('heap#1');
    expect(first.elemType).toBe('int');
    expect(first.freed).toBe(false);
    const last = result.steps[result.steps.length - 1].heap!;
    expect(last[0].freed).toBe(true);
    expect(result.heapIssues?.filter((issue) => issue.kind === 'leak')).toHaveLength(0);
  });

  it('new int[n] 可以用下标读写，delete[] 释放', () => {
    const result = run(`
#include <stdio.h>
int main() {
  int n = 4;
  int *a = new int[n];
  for (int i = 0; i < n; i++) {
    a[i] = i * i;
  }
  int sum = 0;
  for (int i = 0; i < n; i++) {
    sum += a[i];
  }
  printf("%d\\n", sum);
  delete[] a;
  return 0;
}
`);
    expect(result.ok).toBe(true);
    expect(result.output).toBe('14\n');
    const block = result.steps[result.steps.length - 1].heap![0];
    expect(block.isArray).toBe(true);
    expect(block.length).toBe(4);
    expect(block.values).toEqual(['0', '1', '4', '9']);
    expect(block.freed).toBe(true);
  });

  it('忘记 delete 会被报告为泄漏', () => {
    const result = run(`
int main() {
  int *p = new int(7);
  *p = 8;
  return 0;
}
`);
    expect(result.ok).toBe(true);
    const leaks = (result.heapIssues ?? []).filter((issue) => issue.kind === 'leak');
    expect(leaks).toHaveLength(1);
    expect(leaks[0].message).toContain('heap#1');
  });

  it('重复 delete 给出明确错误', () => {
    const result = run(`
int main() {
  int *p = new int(1);
  delete p;
  delete p;
  return 0;
}
`);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('重复释放');
    expect(result.heapIssues?.some((issue) => issue.kind === 'double-free')).toBe(true);
  });

  it('delete 之后继续读写会被拦住（释放后使用）', () => {
    const result = run(`
#include <stdio.h>
int main() {
  int *p = new int(5);
  delete p;
  printf("%d\\n", *p);
  return 0;
}
`);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('释放后使用');
    expect(result.heapIssues?.some((issue) => issue.kind === 'use-after-free')).toBe(true);
  });

  it('new[] 用 delete 释放会被指出', () => {
    const result = run(`
int main() {
  int *a = new int[3];
  delete a;
  return 0;
}
`);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('delete[]');
  });

  it('每个堆块记录指向它的变量名', () => {
    const result = run(`
int main() {
  int *p = new int(1);
  int *q = p;
  *q = 2;
  delete p;
  return 0;
}
`);
    expect(result.ok).toBe(true);
    const mid = result.steps.find((step) => step.heap && step.heap[0].owners.length === 2);
    expect(mid).toBeTruthy();
    expect(mid!.heap![0].owners.sort()).toEqual(['p', 'q']);
  });
});

describe('simulate：堆内存的写入路径', () => {
  it('delete 之后写 *p 也会被拦住', () => {
    const result = simulate(`
int main() {
  int* p = new int(5);
  delete p;
  *p = 9;
  return 0;
}
`);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('释放后使用');
  });

  it('对空指针 delete 是安全的', () => {
    const result = simulate(`
int main() {
  int* p = nullptr;
  delete p;
  return 0;
}
`);
    expect(result.ok).toBe(true);
  });

  it('new 出来的结构体可以按成员访问', () => {
    const result = simulate(`
#include <stdio.h>
struct Point { int x; int y; };
int main() {
  Point* p = new Point();
  p->x = 3;
  p->y = 4;
  printf("%d\\n", p->x + p->y);
  delete p;
  return 0;
}
`);
    expect(result.ok).toBe(true);
    expect(result.output).toBe('7\n');
  });
});

describe('simulate：malloc / calloc / free', () => {
  it('malloc(n * sizeof(int)) 还原成 int 数组，free 后标记释放', () => {
    const result = simulate(`
#include <stdio.h>
#include <stdlib.h>
int main() {
  int n = 3;
  int *a = (int*)malloc(n * sizeof(int));
  for (int i = 0; i < n; i++) a[i] = i + 1;
  printf("%d\\n", a[0] + a[2]);
  free(a);
  return 0;
}
`);
    expect(result.ok).toBe(true);
    expect(result.output).toBe('4\n');
    const last = result.steps[result.steps.length - 1].heap![0];
    expect(last.elemType).toBe('int');
    expect(last.length).toBe(3);
    expect(last.freed).toBe(true);
    expect((result.heapIssues ?? []).filter((issue) => issue.kind === 'leak')).toHaveLength(0);
  });

  it('calloc(n, sizeof(double)) 按元素类型申请', () => {
    const result = simulate(`
#include <stdlib.h>
int main() {
  double *p = (double*)calloc(2, sizeof(double));
  p[1] = 1.5;
  free(p);
  return 0;
}
`);
    expect(result.ok).toBe(true);
    const block = result.steps[result.steps.length - 1].heap![0];
    expect(block.elemType).toBe('double');
    expect(block.length).toBe(2);
    expect(block.values[1]).toBe('1.5');
  });

  it('忘记 free 会报告泄漏', () => {
    const result = simulate(`
#include <stdlib.h>
int main() {
  int *p = (int*)malloc(4 * sizeof(int));
  p[0] = 1;
  return 0;
}
`);
    expect(result.ok).toBe(true);
    const leaks = (result.heapIssues ?? []).filter((issue) => issue.kind === 'leak');
    expect(leaks).toHaveLength(1);
  });

  it('重复 free 被拦住', () => {
    const result = simulate(`
#include <stdlib.h>
int main() {
  int *p = (int*)malloc(2 * sizeof(int));
  free(p);
  free(p);
  return 0;
}
`);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('重复释放');
  });

  it('free 之后按元素读写会被拦住', () => {
    const result = simulate(`
#include <stdlib.h>
int main() {
  int *p = (int*)malloc(2 * sizeof(int));
  p[0] = 1;
  free(p);
  p[1] = 2;
  return 0;
}
`);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('释放后使用');
  });
});
