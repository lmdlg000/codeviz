import type { CodeSample } from '../types';

/**
 * C 语言入门示例（content-c）
 * 每个示例都是完整、可编译的 C 程序，同时符合 C++ 语法，
 * 方便初学者把代码直接粘贴进实验室，从流程图、内存、单步执行等角度观察。
 */
const samples: CodeSample[] = [
  {
    id: 'hello-world',
    title: 'Hello, CodeViz',
    description: '最短的完整 C 程序：认识 main 函数、printf 与 return 0。',
    language: 'c',
    tags: ['入门', 'printf', '程序结构'],
    level: 1,
    focus: 'trace',
    code: `// hello.c —— 第一段完整程序
#include <stdio.h>

int main(void) {
  printf("Hello, CodeViz!\\n");
  printf("这是我写下的第一行 C 代码。\\n");
  return 0;
}
`,
  },
  {
    id: 'circle-area',
    title: '计算圆的面积',
    description: '用 const 定义圆周率，用 double 保存半径，一步步算出面积与周长。',
    language: 'c',
    tags: ['变量', '浮点数', '格式化输出'],
    level: 1,
    focus: 'memory',
    code: `// circle.c —— 计算圆的面积与周长
#include <stdio.h>

int main(void) {
  const double PI = 3.1415926;
  double radius = 3.0;
  double area = PI * radius * radius;
  double perimeter = 2.0 * PI * radius;

  printf("半径: %.1f\\n", radius);
  printf("面积: %.2f\\n", area);
  printf("周长: %.2f\\n", perimeter);
  return 0;
}
`,
  },
  {
    id: 'temp-convert',
    title: '摄氏与华氏',
    description: '把摄氏温度换算成华氏温度，再换算回来，体会表达式的计算顺序。',
    language: 'c',
    tags: ['运算符', '表达式', '类型转换'],
    level: 1,
    focus: 'flow',
    code: `// temperature.c —— 摄氏度与华氏度互换
#include <stdio.h>

int main(void) {
  double celsius = 26.0;
  double fahrenheit = celsius * 9.0 / 5.0 + 32.0;
  double back = (fahrenheit - 32.0) * 5.0 / 9.0;

  printf("摄氏度: %.1f\\n", celsius);
  printf("华氏度: %.1f\\n", fahrenheit);
  printf("换算回摄氏度: %.1f\\n", back);
  return 0;
}
`,
  },
  {
    id: 'grade-level',
    title: '成绩分档',
    description: '用 if 与 else if 把 0 到 100 的分数映射成 A 到 E 五个等级。',
    language: 'c',
    tags: ['选择结构', 'if', '多分支'],
    level: 2,
    focus: 'flow',
    code: `// grade.c —— 用 if / else if 给分数分档
#include <stdio.h>

int main(void) {
  int score = 87;

  if (score < 0 || score > 100) {
    printf("分数不合法\\n");
  } else if (score >= 90) {
    printf("等级 A\\n");
  } else if (score >= 80) {
    printf("等级 B\\n");
  } else if (score >= 70) {
    printf("等级 C\\n");
  } else if (score >= 60) {
    printf("等级 D\\n");
  } else {
    printf("等级 E\\n");
  }
  return 0;
}
`,
  },
  {
    id: 'sum-1-to-100',
    title: '1 到 100 求和',
    description: '用 for 循环把 1 到 100 累加起来，再用数学公式验算结果。',
    language: 'c',
    tags: ['循环', 'for', '累加'],
    level: 1,
    focus: 'flow',
    code: `// sum.c —— 用 for 循环累加 1 到 100
#include <stdio.h>

int main(void) {
  int sum = 0;

  for (int i = 1; i <= 100; i++) {
    sum += i;
  }

  printf("1 + 2 + ... + 100 = %d\\n", sum);

  int check = (1 + 100) * 100 / 2;
  printf("用公式验算: %d\\n", check);
  return 0;
}
`,
  },
  {
    id: 'even-odd',
    title: '判断奇偶',
    description: '一个整数除以 2 的余数只有两种情况，用 if / else 分开处理。',
    language: 'c',
    tags: ['if', '取模', '奇偶'],
    level: 1,
    focus: 'trace',
    code: `// even_odd.c —— 用余数判断奇偶
#include <stdio.h>

int main(void) {
  int number = 17;
  int remainder = number % 2;

  if (remainder == 0) {
    printf("%d 是偶数。\\n", number);
  } else {
    printf("%d 是奇数，余数是 %d。\\n", number, remainder);
  }
  return 0;
}
`,
  },
  {
    id: 'calculator-switch',
    title: '四则运算小计算器',
    description: '用 switch 根据运算符字符选择要执行的那一段计算。',
    language: 'c',
    tags: ['switch', '多分支', '字符'],
    level: 2,
    focus: 'flow',
    code: `// calculator.c —— 用 switch 实现四则运算
#include <stdio.h>

int main(void) {
  double a = 12.0;
  double b = 8.0;
  char op = '/';

  switch (op) {
    case '+':
      printf("%.1f + %.1f = %.1f\\n", a, b, a + b);
      break;
    case '-':
      printf("%.1f - %.1f = %.1f\\n", a, b, a - b);
      break;
    case '*':
      printf("%.1f * %.1f = %.1f\\n", a, b, a * b);
      break;
    case '/':
      if (b != 0.0) {
        printf("%.1f / %.1f = %.1f\\n", a, b, a / b);
      } else {
        printf("除数不能为 0\\n");
      }
      break;
    default:
      printf("不认识的运算符: %c\\n", op);
  }
  return 0;
}
`,
  },
  {
    id: 'countdown',
    title: '倒计时发射',
    description: 'do-while 先把循环体执行一次，再决定要不要继续，适合倒计时。',
    language: 'c',
    tags: ['do-while', '循环', '倒计时'],
    level: 1,
    focus: 'trace',
    code: `// countdown.c —— do-while 倒计时
#include <stdio.h>

int main(void) {
  int seconds = 5;

  do {
    printf("%d...\\n", seconds);
    seconds--;
  } while (seconds > 0);

  printf("点火，起飞!\\n");
  return 0;
}
`,
  },
  {
    id: 'multiplication-table',
    title: '九九乘法表',
    description: '两层 for 循环嵌套，外层控制行、内层控制列，打印一张乘法表。',
    language: 'c',
    tags: ['嵌套循环', 'for', '格式化'],
    level: 2,
    focus: 'flow',
    code: `// table.c —— 嵌套循环打印九九乘法表
#include <stdio.h>

int main(void) {
  for (int row = 1; row <= 9; row++) {
    for (int col = 1; col <= row; col++) {
      printf("%d*%d=%-2d ", row, col, row * col);
    }
    printf("\\n");
  }
  return 0;
}
`,
  },
  {
    id: 'prime-check',
    title: '判断素数',
    description: '只需试除到平方根附近，找到因子就用 break 提前跳出循环。',
    language: 'c',
    tags: ['循环', 'break', '判断'],
    level: 2,
    focus: 'flow',
    code: `// prime.c —— 用 for + break 判断素数
#include <stdio.h>

int main(void) {
  int number = 97;
  int isPrime = 1;

  if (number < 2) {
    isPrime = 0;
  } else {
    for (int i = 2; i * i <= number; i++) {
      if (number % i == 0) {
        isPrime = 0;
        break;
      }
    }
  }

  if (isPrime) {
    printf("%d 是素数\\n", number);
  } else {
    printf("%d 不是素数\\n", number);
  }
  return 0;
}
`,
  },
];

export default samples;
