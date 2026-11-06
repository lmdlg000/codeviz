import type { CodeSample } from '../types';

/**
 * C 进阶示例库（数组 / 函数 / 指针 / 结构体 / 文件）。
 * 所有代码都能用 g++ -std=c++17 通过语法检查；文件示例使用相对路径，运行时会写在工作目录。
 */
const samples: CodeSample[] = [
  {
    id: 'bubble-sort',
    title: '冒泡排序：让数组排好队',
    description: '用相邻比较与三步交换，把一组无序整数从小到大排好。',
    language: 'c',
    code: `#include <stdio.h>

int main() {
  int a[8] = {42, 17, 93, 8, 55, 21, 76, 34};
  int n = 8;

  for (int i = 0; i < n - 1; i++) {
    for (int j = 0; j < n - 1 - i; j++) {
      if (a[j] > a[j + 1]) {
        int temp = a[j];
        a[j] = a[j + 1];
        a[j + 1] = temp;
      }
    }
  }

  printf("排序结果：");
  for (int i = 0; i < n; i++) {
    printf("%d ", a[i]);
  }
  printf("\\n");
  return 0;
}
`,
    tags: ['数组', '排序', '循环'],
    level: 2,
    focus: 'trace',
  },
  {
    id: 'factorial',
    title: '递归阶乘：函数调用自己',
    description: '用 n! = n × (n-1) 的递推关系演示递归与调用栈。',
    language: 'c',
    code: `#include <stdio.h>

int factorial(int n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

int main() {
  for (int i = 1; i <= 6; i++) {
    printf("%d! = %d\\n", i, factorial(i));
  }
  return 0;
}
`,
    tags: ['递归', '函数', '调用栈'],
    level: 2,
    focus: 'calls',
  },
  {
    id: 'swap-pointer',
    title: '指针交换：真正改动外面的变量',
    description: '用一个交换函数展示指针参数如何让函数修改调用者的变量。',
    language: 'c',
    code: `#include <stdio.h>

void swap(int *a, int *b) {
  int temp = *a;
  *a = *b;
  *b = temp;
}

int main() {
  int x = 3;
  int y = 8;

  printf("交换前：x = %d, y = %d\\n", x, y);
  swap(&x, &y);
  printf("交换后：x = %d, y = %d\\n", x, y);
  return 0;
}
`,
    tags: ['指针', '函数参数', '交换'],
    level: 2,
    focus: 'memory',
  },
  {
    id: 'student-struct',
    title: '结构体数组：一张学生成绩表',
    description: '把学号、姓名、成绩打包成结构体，再用数组和循环处理整张表。',
    language: 'c',
    code: `#include <stdio.h>

struct Student {
  int id;
  char name[16];
  int score;
};

int main() {
  struct Student students[4] = {
    {101, "Lin", 92},
    {102, "Chen", 78},
    {103, "Zhao", 85},
    {104, "Wu", 60}
  };
  int sum = 0;

  for (int i = 0; i < 4; i++) {
    sum += students[i].score;
    printf("%d %s %d\\n", students[i].id, students[i].name, students[i].score);
  }
  printf("平均分：%.1f\\n", (double)sum / 4);
  return 0;
}
`,
    tags: ['结构体', '数组', '遍历'],
    level: 2,
    focus: 'memory',
  },
  {
    id: 'score-file',
    title: '成绩文件：先写入，再读回统计',
    description: '用 fopen、fprintf、fscanf 与 fclose 完成一次完整的文件写入和读取。',
    language: 'c',
    code: `#include <stdio.h>

int main() {
  int scores[5] = {92, 78, 85, 60, 47};

  /* 写入：文件放在程序的工作目录 */
  FILE *fp = fopen("scores.txt", "w");
  if (fp == NULL) {
    printf("无法写入文件\\n");
    return 1;
  }
  for (int i = 0; i < 5; i++) {
    fprintf(fp, "%d\\n", scores[i]);
  }
  fclose(fp);

  /* 读取：边读边累加 */
  fp = fopen("scores.txt", "r");
  if (fp == NULL) {
    printf("无法读取文件\\n");
    return 1;
  }
  int score = 0;
  int sum = 0;
  int count = 0;
  while (fscanf(fp, "%d", &score) == 1) {
    sum += score;
    count++;
  }
  fclose(fp);

  if (count > 0) {
    printf("读取 %d 个分数，平均 %.1f\\n", count, (double)sum / count);
  } else {
    printf("文件里没有数据\\n");
  }
  return 0;
}
`,
    tags: ['文件', '读写', '平均分'],
    level: 3,
    focus: 'flow',
  },
  {
    id: 'array-average',
    title: '数组统计：平均分、最高分与最低分',
    description: '一次遍历同时完成求和、求最大值和求最小值。',
    language: 'c',
    code: `#include <stdio.h>

int main() {
  int scores[6] = {88, 76, 95, 60, 82, 71};
  int n = 6;
  int sum = 0;
  int max = scores[0];
  int min = scores[0];

  for (int i = 0; i < n; i++) {
    sum += scores[i];
    if (scores[i] > max) {
      max = scores[i];
    }
    if (scores[i] < min) {
      min = scores[i];
    }
  }

  printf("平均 %.1f，最高 %d，最低 %d\\n", (double)sum / n, max, min);
  return 0;
}
`,
    tags: ['数组', '遍历', '最值'],
    level: 2,
    focus: 'trace',
  },
  {
    id: 'fibonacci',
    title: '递归斐波那契：一棵调用树',
    description: '同一个递归函数被展开成两个分支，适合观察调用图与重复计算。',
    language: 'c',
    code: `#include <stdio.h>

int fibonacci(int n) {
  if (n <= 2) {
    return 1;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
  for (int i = 1; i <= 10; i++) {
    printf("%d ", fibonacci(i));
  }
  printf("\\n");
  return 0;
}
`,
    tags: ['递归', '斐波那契', '调用图'],
    level: 3,
    focus: 'calls',
  },
  {
    id: 'string-length',
    title: '字符串长度：数到 \\0 为止',
    description: '不调用 strlen，手写循环数出字符个数，理解 \\0 作为结束标记。',
    language: 'c',
    code: `#include <stdio.h>

int main() {
  char text[] = "CodeViz";
  int length = 0;

  while (text[length] != '\\0') {
    length++;
  }

  printf("%s 有 %d 个字符\\n", text, length);
  printf("字符数组占用 %d 字节\\n", (int)sizeof(text));
  return 0;
}
`,
    tags: ['字符串', '字符数组', '循环'],
    level: 2,
    focus: 'memory',
  },
  {
    id: 'matrix-add',
    title: '矩阵相加：二维数组与嵌套循环',
    description: '用二维数组表示矩阵，逐行逐列相加并格式化输出。',
    language: 'c',
    code: `#include <stdio.h>

int main() {
  int a[2][3] = {{1, 2, 3}, {4, 5, 6}};
  int b[2][3] = {{10, 20, 30}, {40, 50, 60}};
  int c[2][3] = {{0}};

  for (int i = 0; i < 2; i++) {
    for (int j = 0; j < 3; j++) {
      c[i][j] = a[i][j] + b[i][j];
    }
  }

  for (int i = 0; i < 2; i++) {
    for (int j = 0; j < 3; j++) {
      printf("%4d", c[i][j]);
    }
    printf("\\n");
  }
  return 0;
}
`,
    tags: ['二维数组', '矩阵', '嵌套循环'],
    level: 3,
    focus: 'memory',
  },
  {
    id: 'pointer-array',
    title: '指针遍历数组：p + i 的移动',
    description: '让指针指向数组首元素，用指针算术逐个访问元素。',
    language: 'c',
    code: `#include <stdio.h>

int main() {
  int a[5] = {10, 20, 30, 40, 50};
  int *p = a;
  int sum = 0;

  for (int i = 0; i < 5; i++) {
    sum += *(p + i);
    printf("第 %d 个元素：%d\\n", i, *(p + i));
  }
  printf("总和：%d\\n", sum);
  return 0;
}
`,
    tags: ['指针', '数组', '指针算术'],
    level: 3,
    focus: 'memory',
  },
];

export default samples;
