import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'c10-files',
  chapterId: 'c-data',
  order: 5,
  title: '文件：把数据留在磁盘上',
  subtitle: '用 FILE 指针写入与读取，让程序结束后数据还在',
  description:
    '认识文件流与 FILE 指针，用 fopen、fprintf、fscanf 与 fclose 完成一次可靠的写入、读取与统计。',
  difficulty: 3,
  minutes: 26,
  objectives: [
    '说明 FILE 指针与文件流的作用，知道 fopen 的两个参数',
    '用三种常用模式打开文件，并检查 fopen 是否成功',
    '用 fprintf 写入、用 fscanf 的返回值控制读取循环',
    '处理“文件为空、读不到数据”的情况，避免除零与不完整写入',
  ],
  blocks: [
    {
      type: 'text',
      body: '程序里的变量都住在内存里，程序一退出，它们就消失了。想让成绩表、日志、配置在关掉程序后还留着，就要把数据写到**文件**（file）里。文件是磁盘上的数据集合，程序通过一个叫文件指针的“遥控器”对它读写。这一课我们从打开、写入、关闭开始，再走一遍读取与统计的完整流程。',
    },
    { type: 'heading', text: '一、文件与 FILE 指针' },
    {
      type: 'text',
      body: '标准库把文件抽象成**流**（stream）：打开文件时，`fopen` 返回一个 `FILE *` 指针，之后所有读写都通过它进行。`fopen` 需要两个参数：路径和打开模式。模式 `"r"` 表示只读，文件必须已经存在；`"w"` 表示只写，文件不存在会新建，存在则清空；`"a"` 表示追加，在文件末尾继续写。打开可能失败，所以一定要判断返回值是不是 `NULL`，失败时给出提示再退出，不要拿着空指针继续读写。',
    },
    {
      type: 'text',
      body: '文件里的内容本质上是一串字节。文本模式把字节按字符处理，读写数字时依靠格式串完成“数字与文本”的转换；二进制模式则直接读写内存中的字节表示。初学阶段处理成绩、名单这类数据，文本模式已经足够，生成的文件还能直接用记事本打开检查。',
    },
    {
      type: 'steps',
      items: [
        {
          title: '打开文件',
          body: '用 `fopen` 拿到 `FILE *`，立刻检查它是否为 `NULL`；失败通常意味着路径不对或没有权限。',
        },
        {
          title: '读写数据',
          body: '用 `fprintf`、`fscanf` 按键值格式处理，也可以用 `fputs`、`fgets` 按整行处理。',
        },
        {
          title: '关闭文件',
          body: '调用 `fclose`，把缓冲区里的数据真正写回磁盘，同时释放系统资源。',
        },
      ],
    },
    { type: 'heading', text: '二、写入：把分数存进文件' },
    {
      type: 'code',
      language: 'c',
      title: 'write_scores.c',
      caption: '用 "w" 模式打开，写入四个分数，每个分数占一行。',
      code: `#include <stdio.h>

int main() {
  int scores[4] = {92, 78, 85, 60};

  FILE *fp = fopen("scores.txt", "w");
  if (fp == NULL) {
    printf("无法打开文件写入\\n");
    return 1;
  }

  for (int i = 0; i < 4; i++) {
    fprintf(fp, "%d\\n", scores[i]);
  }

  fclose(fp);
  printf("写入完成\\n");
  return 0;
}
`,
    },
    {
      type: 'text',
      body: '`fprintf` 的用法和 `printf` 几乎一样，只是第一个参数换成了文件指针。换行符 `\\n` 要自己写，文件不会自动帮你分行。写入完成后必须 `fclose`：数据可能先待在一小块缓冲区里，关闭时才真正落盘；忘记关闭还可能导致文件被占用，或者程序异常退出时丢掉最后一段内容。',
    },
    {
      type: 'text',
      body: '注意文件里保存的是“92”这两个字符再加一个换行，而不是整数 92 在内存中的四个字节。正因为存成了文本，才可以直接用记事本打开检查；代价是同样的数字占用的空间更大，读写时也多了一次转换。',
    },
    {
      type: 'diagram',
      title: '写入文件的处理步骤',
      diagram: {
        kind: 'flow',
        functionName: 'writeScores',
        code: `#include <stdio.h>

void writeScore(FILE *fp, int score) {
  fprintf(fp, "%d\\n", score);
}

void writeScores() {
  FILE *fp;
  fp = fopen("scores.txt", "w");
  if (fp == NULL) {
    printf("打开失败\\n");
    return;
  }

  int scores[4] = {92, 78, 85, 60};
  for (int i = 0; i < 4; i++) {
    writeScore(fp, scores[i]);
  }

  fclose(fp);
}

int main() {
  writeScores();
  return 0;
}
`,
      },
      caption:
        '开始 → 打开文件 → 判断是否成功 → 循环调用 writeScore 写入 → 关闭文件 → 结束；fopen、fclose 会显示为调用节点。',
    },
    { type: 'heading', text: '三、读取：把文件变回数据' },
    {
      type: 'text',
      body: '读取与写入是对称的：用 `"r"` 模式打开，`fscanf(fp, "%d", &score)` 按格式读一个整数。它返回成功读到的项数，到达文件末尾时返回 `EOF`，所以常见写法是 `while (fscanf(...) == 1)`：只要还能读到一个整数就继续。循环结束后用 `count` 记录读了多少个，再做除法求平均；还要处理 `count == 0` 的情况，避免除以零。',
    },
    {
      type: 'code',
      language: 'c',
      title: 'read_scores.c',
      caption: '用 fscanf 的返回值控制循环；读完后先关闭文件再计算。',
      code: `#include <stdio.h>

int main() {
  FILE *fp = fopen("scores.txt", "r");
  if (fp == NULL) {
    printf("文件打开失败\\n");
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
    printf("共 %d 个分数，平均 %.1f\\n", count, (double)sum / count);
  } else {
    printf("文件里没有数据\\n");
  }
  return 0;
}
`,
    },
    {
      type: 'diagram',
      title: '读取并求平均的处理步骤',
      diagram: {
        kind: 'flow',
        functionName: 'readAverage',
        code: `#include <stdio.h>

double readAverage() {
  FILE *fp;
  fp = fopen("scores.txt", "r");
  if (fp == NULL) {
    return 0.0;
  }

  int score = 0;
  int sum = 0;
  int count = 0;
  while (fscanf(fp, "%d", &score) == 1) {
    sum += score;
    count++;
  }

  fclose(fp);

  if (count == 0) {
    return 0.0;
  }
  return (double)sum / count;
}

int main() {
  printf("%.1f\\n", readAverage());
  return 0;
}
`,
      },
      caption:
        '循环条件是“还能成功读到一个数”；读完后关闭文件，再处理除零风险；fopen、fclose 会显示为调用节点。',
    },
    {
      type: 'text',
      body: '这段代码包含两个提前返回：打不开文件时返回 0.0，读到的个数为 0 时也返回 0.0。真实项目里更常见的做法是返回一个特殊值或让调用者知道“没有数据”，但初学阶段先把“不崩溃、不除零”放在第一位。另一个好习惯是读取前清空变量，避免上一次循环的值残留下来。',
    },
    {
      type: 'text',
      body: '除了 `fscanf`，标准库还提供 `fgets` 按整行读取，适合处理带空格的文本；处理纯数字时 `fscanf` 更省事。无论用哪种方式，都建议先打开生成的文件看一眼：行数、顺序、数值是否和预期一致。如果写入和读取用的格式不一致——比如写入用 `%d`，读取却用 `%f`——读出来的结果就会错位。',
    },
    { type: 'heading', text: '四、常见坑与好习惯' },
    {
      type: 'list',
      items: [
        '打开后先判断 `NULL`，失败就提示并结束，不要硬着头皮读写。',
        '每次 `fopen` 成功都要有对应的 `fclose`，写完立刻关闭最稳妥。',
        '`"w"` 会清空原文件；想保留旧内容追加，应使用 `"a"`。',
        '用 `fscanf` 的返回值控制循环，不要写 `while (!feof(fp))`，那样容易多读一次。',
        '路径是相对当前工作目录的；不同运行方式可能在不同目录，找不到文件先检查路径。',
        '读写之前先约定格式：每行一个数字、用逗号分隔还是固定宽度。格式一旦确定，写入与读取必须保持一致。',
      ],
    },
    {
      type: 'code',
      language: 'c',
      title: 'append_score.c',
      caption: '用 "a" 模式在文件末尾追加，不会清空已有内容。',
      code: `#include <stdio.h>

int main() {
  FILE *fp = fopen("scores.txt", "a");
  if (fp == NULL) {
    printf("无法追加\\n");
    return 1;
  }

  fprintf(fp, "%d\\n", 100);
  fclose(fp);
  printf("追加完成\\n");
  return 0;
}
`,
    },
    {
      type: 'table',
      headers: ['模式', '含义', '文件不存在时'],
      rows: [
        ['`"r"`', '只读，从文件开头开始', '打开失败，返回 `NULL`'],
        ['`"w"`', '只写，清空原有内容', '创建新文件'],
        ['`"a"`', '追加，写到文件末尾', '创建新文件'],
        ['`"r+"`', '读写，从文件开头开始', '打开失败，返回 `NULL`'],
      ],
    },
    {
      type: 'note',
      tone: 'warn',
      title: '文件 I/O 不在单步执行的范围内',
      body: '浏览器里的单步执行只支持教学子集，`fopen`、`fprintf` 这类操作会明确提示“不支持”。课程里的文件示例请在本机用编译器运行，观察工作目录里生成的文件；在页面上仍可以用流程图、结构大纲和内存图理解代码结构。',
    },
    {
      type: 'note',
      tone: 'tip',
      title: '先写后读，分两步验证',
      body: '第一次写文件时，不要急着同时写读。先运行写入程序，确认文件真的出现在工作目录、内容符合预期；再单独运行读取程序。这样一旦出错，你能立刻判断问题在“写”还是“读”，比一口气写两百行再调试轻松得多。',
    },
    { type: 'heading', text: '小结' },
    {
      type: 'text',
      body: '文件通过 `FILE *` 指针操作：`fopen` 打开，`fprintf` 与 `fscanf` 读写，`fclose` 关闭。模式决定文件是只读、清空重写还是追加，打开失败时 `fopen` 返回 `NULL`。读取循环用 `fscanf` 的返回值控制，读到文件末尾自然结束，同时别忘了处理“一个数都没读到”的情况。到这里，C 语言的数据组织部分就完整了：数组、函数、指针、结构体与文件，足够写出有模有样的小程序。',
    },
    {
      type: 'try',
      language: 'c',
      code: `#include <stdio.h>

int main() {
  int data[3] = {70, 85, 90};

  FILE *fp = fopen("demo.txt", "w");
  if (fp == NULL) {
    printf("打开失败\\n");
    return 1;
  }

  for (int i = 0; i < 3; i++) {
    fprintf(fp, "%d\\n", data[i]);
  }
  fclose(fp);

  printf("已写入 demo.txt\\n");
  return 0;
}
`,
      prompt:
        '在实验室查看这段代码的流程图和内存布局，再把它复制到本机编译运行，看看工作目录里多出的文件。把 `"w"` 改成 `"a"` 连续运行两次，比较两次文件内容有什么不同。',
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
    {
      mistake: "fopen 之后不检查是否成功",
      wrong: "FILE *fp = fopen(\"a.txt\", \"r\");\nfscanf(fp, ...);",
      right: "FILE *fp = fopen(\"a.txt\", \"r\");\nif (fp == NULL) { perror(\"a.txt\"); return 1; }",
      why: "文件不存在或没有权限时 fopen 返回 NULL，继续用会导致程序崩溃。"
    },
    {
      mistake: "用 \"w\" 模式打开已有文件",
      wrong: "fopen(\"data.txt\", \"w\");  // 原内容被清空",
      right: "fopen(\"data.txt\", \"a\");  // 追加",
      why: "\"w\" 会截断文件；只想追加用 \"a\"，读写已有内容用 \"r+\"。"
    },
    {
      mistake: "忘记 fclose，或没判断读到文件末尾",
      wrong: "while (!feof(fp)) { fscanf(...); }",
      right: "while (fscanf(fp, \"%d\", &x) == 1) { ... }",
      why: "feof 要等读过一次失败后才为真，会多处理一遍旧数据；直接用读取函数的返回值判断更可靠。"
    }
      ]
    },
  ],
  keyPoints: [
    '文件通过 FILE * 指针操作：fopen 打开，fclose 关闭。',
    '模式 "r" 只读、"w" 清空重写、"a" 追加，打开失败返回 NULL。',
    'fprintf、fscanf 的用法与 printf、scanf 类似，第一个参数是文件指针。',
    '用 while (fscanf(...) == 1) 控制读取循环，并处理 count 为 0 的情况。',
    '单步执行解释器不支持文件 I/O，文件示例请在本机编译运行。',
  ],
  quiz: [
    {
      id: 'c10-q1',
      question: '如果一个文件已经存在，用 `"w"` 模式打开它会怎样？',
      options: ['保留原内容并追加到末尾', '清空原有内容，从头开始写', '打开失败，返回 NULL', '自动切换为只读模式'],
      answer: 1,
      explanation:
        '`"w"` 表示只写：文件存在时先清空，不存在时创建。想保留旧内容继续写，应使用追加模式 `"a"`。',
    },
    {
      id: 'c10-q2',
      question: '`fopen` 打开文件失败时，返回值是什么？',
      options: ['0', 'NULL', 'EOF', '1'],
      answer: 1,
      explanation:
        '`fopen` 失败时返回空指针 `NULL`，所以打开之后要立刻判断 `fp == NULL`，再决定是否继续读写。',
    },
    {
      id: 'c10-q3',
      question: '读取循环 `while (fscanf(fp, "%d", &x) == 1)` 会在什么时候结束？',
      options: [
        '读到数值 0 时',
        '读到文件末尾或遇到无法匹配的数据时',
        '只有调用 fclose 时',
        '永远不会结束',
      ],
      answer: 1,
      explanation:
        '`fscanf` 返回成功读到的项数。读不到整数（到达文件末尾或格式不匹配）时不再返回 1，循环条件为假，循环结束。数值 0 本身是合法数据，不会让它停止。',
    },
  ],
  labSampleId: 'score-file',
};

export default lesson;
