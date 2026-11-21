/**
 * 趣谈：教程没展开、实验室也不做单步的冷门操作
 * ------------------------------------------------------------------
 * 这里不追求"全"，只收录学生最容易在教材边角或考试里撞见、
 * 但又没法在浏览器教学解释器里安全复现的写法。
 * 每条都给出"为什么不能直接跑"和"本机怎么验证"，避免只看热闹。
 */
import type { SourceLanguage } from '../engine/types';

export type TriviaTone = 'amber' | 'rose' | 'sky' | 'violet';

export interface TriviaItem {
  id: string;
  title: string;
  /** 一句话点出"冷"在哪里 */
  teaser: string;
  tone: TriviaTone;
  tags: string[];
  language: SourceLanguage;
  code: string;
  /** 这段代码在做什么 */
  explain: string;
  /** 为什么实验室不能/不适合单步执行 */
  whyNot: string;
  /** 本机怎么跑 */
  local: string;
  /** 考试/面试里真正的考点 */
  catch?: string;
}

export const TRIVIA_ITEMS: TriviaItem[] = [
  {
    id: 'file-io',
    title: '文件 IO：为什么考试爱考，实验室偏不跑',
    teaser: 'FILE* 是一块不透明的"句柄"，浏览器里没有真实磁盘。',
    tone: 'rose',
    tags: ['文件', '考试高频', 'fopen'],
    language: 'c',
    code: `#include <stdio.h>
#include <stdlib.h>

void main() {
  FILE *fp = fopen("a.txt", "r");
  int a, sum = 0;
  do {
    fscanf(fp, "%d", &a);
    sum += a;
  } while (sum < 10);
  fclose(fp);
  printf("%d\\n", sum);
}`,
    explain:
      '这是新手考试常见写法：打开文本文件或从 stdin 读整数，反复累加直到满足条件。fopen 返回 FILE* 句柄；fscanf 的返回值是"成功读入的项数"，读到文件末尾会返回 EOF（-1）。',
    whyNot:
      '实验室运行在浏览器沙箱里，没有真实文件系统；fopen / fscanf / fclose 全部命中 unsupported 预检，页面会明确提示"函数 fopen() 暂不支持单步执行"，而不是假装读到了数据。文件操作还涉及缓冲、编码和权限，模拟出来反而会教错。',
    local:
      '把代码存成 exam.c，同目录放一个 a.txt，用 gcc exam.c -o exam && ./exam 运行。把 fscanf 的返回值打印出来看看，比死记 EOF 更有用。',
    catch:
      '这段代码本身有两个坑：void main 不是标准写法（应是 int main）；do-while 至少执行一次，文件为空时 a 未初始化就参与累加，属于未定义行为。考试里常借此考"返回值检查 + 循环边界"。',
  },
  {
    id: 'rand',
    title: 'rand() 每次都"随机"，为什么反而不适合单步',
    teaser: '随机数不可重现，就无法做"每一步都可回放"的教学。',
    tone: 'amber',
    tags: ['随机', 'srand', '可复现'],
    language: 'c',
    code: `#include <stdio.h>
#include <stdlib.h>
#include <time.h>

int main() {
  srand((unsigned)time(NULL));
  for (int i = 0; i < 5; i++) {
    printf("%d ", rand() % 100);
  }
  return 0;
}`,
    explain:
      'rand() 生成的是伪随机数；srand(seed) 设种子，种子相同则序列完全相同。time(NULL) 用当前时间当种子，所以每次运行都不一样。',
    whyNot:
      '单步执行的核心是"同一份代码每次跑出同一条轨迹"。真随机会让变量监视、断点和考试判分全部失去意义，因此 rand/srand 被明确排除。',
    local:
      'gcc rand.c -o rand && ./rand 连跑两次看差异；再把 srand(42) 写死，两次输出就一样了——这就是"伪随机"。',
    catch:
      'rand() % 100 的分布并不完美（低位周期性更强），考试通常只要求"能取到 0~99"，工程上要关心分布时应换更现代的做法。',
  },
  {
    id: 'realloc',
    title: 'realloc：旧指针可能一夜之间作废',
    teaser: '它可能原地扩，也可能搬走整块内存——这是"释放后使用"的高发区。',
    tone: 'amber',
    tags: ['动态内存', '指针失效', 'realloc'],
    language: 'c',
    code: `#include <stdio.h>
#include <stdlib.h>

int main() {
  int *p = malloc(3 * sizeof(int));
  for (int i = 0; i < 3; i++) p[i] = i;

  int *q = realloc(p, 6 * sizeof(int));  // 可能搬移
  if (q == NULL) { free(p); return 1; }  // 失败时 p 仍然有效
  p = q;                                 // 之后只能用新指针

  for (int i = 3; i < 6; i++) p[i] = i;
  free(p);
  return 0;
}`,
    explain:
      'realloc(p, n) 把 p 指向的块调整到 n 字节。若后面有足够空间就原地扩展；否则另找一块、复制旧内容、释放旧块，返回新地址。失败时返回 NULL，旧块不动。',
    whyNot:
      '实验室已经能单步 malloc / calloc / free，但 realloc 的"原地还是搬移"取决于运行时堆布局，模拟结果会误导；而且搬运后旧指针悬空，正是教学里要强调的坑，做不好反而弱化了警示。',
    local:
      'gcc -fsanitize=address realloc.c -o realloc && ./realloc。故意在 realloc 后继续用 p，Sanitizer 会直接报 use-after-free。',
    catch:
      '千万别写 p = realloc(p, n)：失败时返回 NULL 会把原来的 p 覆盖掉，整块内存泄漏。先用临时变量接住。',
  },
  {
    id: 'qsort',
    title: 'qsort：C 语言用函数指针当比较器',
    teaser: '没有 lambda 的年代，比较规则得写成一个函数。',
    tone: 'violet',
    tags: ['函数指针', '排序', 'qsort'],
    language: 'c',
    code: `#include <stdio.h>
#include <stdlib.h>

int cmp(const void *a, const void *b) {
  int x = *(const int *)a, y = *(const int *)b;
  return (x > y) - (x < y);   // 升序，且不会溢出
}

int main() {
  int v[] = {3, 1, 2};
  qsort(v, 3, sizeof(int), cmp);
  for (int i = 0; i < 3; i++) printf("%d ", v[i]);
  return 0;
}`,
    explain:
      'qsort 的第四个参数是函数指针：void* 是"不知道类型的地址"，要先转回具体类型再解引用。比较器返回负数/0/正数表示小于/相等/大于。',
    whyNot:
      '实验室的 sort 比较器走的是"函数名或 lambda"这条简化路径；qsort 的 void* 强转与元素大小计算属于更底层的 C 技巧，单步展示价值不高。',
    local: 'gcc qsort.c -o qsort && ./qsort，输出 1 2 3。把 cmp 改成返回 y - x 试降序。',
    catch:
      '直接 return x - y 在 x 很大、y 很小（或相反）时会整数溢出；(x>y)-(x<y) 才是安全写法。',
  },
  {
    id: 'getline',
    title: 'getline 与 fgets：读一整行时空格去哪了',
    teaser: 'scanf("%s") 遇到空格就停，读句子得换工具。',
    tone: 'sky',
    tags: ['输入', 'getline', 'fgets'],
    language: 'cpp',
    code: `#include <iostream>
#include <string>
using namespace std;

int main() {
  string line;
  getline(cin, line);            // 读整行，保留空格
  cout << "[" << line << "]" << endl;

  int n;
  cin >> n;                      // 只读一个数
  cout << n << endl;
  return 0;
}`,
    explain:
      'cin >> x 会跳过前导空白并在遇到下一个空白时停止；getline(cin, s) 一直读到换行，把空格也收进来（但换行符本身不留在字符串里）。',
    whyNot:
      '实验室的输入是"启动时填一次 stdin"的快照，内存里是字节序列；整行读取与混合读取牵涉输入缓冲区状态，回放语义复杂，所以只支持 cin >> 与 scanf 的常规用法。',
    local: 'gcc -std=c++17 line.cpp -lstdc++ -o line && ./line，输入 "hello world" 再输入 42。',
    catch:
      '先 cin >> n 再 getline 时，getline 会立刻读到上一次留下的换行，得到空串。这时要先 cin.ignore() 丢掉换行。',
  },
  {
    id: 'unordered-map',
    title: 'unordered_map：快，但"有序"没了',
    teaser: 'map 用红黑树保序，unordered_map 用哈希表换速度。',
    tone: 'violet',
    tags: ['哈希表', 'unordered_map', '复杂度'],
    language: 'cpp',
    code: `#include <iostream>
#include <unordered_map>
#include <map>
using namespace std;

int main() {
  unordered_map<string, int> h;
  map<string, int> t;
  h["b"] = 1; h["a"] = 2;
  t["b"] = 1; t["a"] = 2;

  for (auto& p : h) cout << p.first << " ";  // 顺序不确定
  cout << "| ";
  for (auto& p : t) cout << p.first << " ";  // a b
  cout << endl;
  return 0;
}`,
    explain:
      'unordered_map 平均 O(1) 查找，但不保证遍历顺序；map 是 O(log n)，始终按 key 升序。需要按序输出、范围查询就用 map，只关心"键→值"就用 unordered_map。',
    whyNot:
      '哈希表的桶布局与 hash 实现有关，浏览器教学解释器只实现有序 map/set，避免把"某次运行的桶顺序"误当成语言保证。',
    local: 'gcc -std=c++17 hash.cpp -lstdc++ -o hash && ./hash，多跑几次看 unordered 那半边顺序是否变化。',
    catch:
      'unordered_map 的迭代器在 rehash（元素变多触发扩容）后全部失效；map 的迭代器则稳定得多。',
  },
  {
    id: 'smart-pointer',
    title: '智能指针：把 delete 交给作用域',
    teaser: 'unique_ptr / shared_ptr 是 RAII 在内存管理上的直接应用。',
    tone: 'sky',
    tags: ['RAII', 'unique_ptr', 'shared_ptr'],
    language: 'cpp',
    code: `#include <iostream>
#include <memory>
using namespace std;

int main() {
  unique_ptr<int> a(new int(10));   // 独占，不可复制
  auto b = make_unique<int>(20);    // 推荐写法

  shared_ptr<int> s1 = make_shared<int>(30);
  {
    auto s2 = s1;                   // 引用计数 +1
    cout << *s2 << endl;            // 30
  }                                 // s2 销毁，计数 -1
  cout << *s1 << endl;              // 仍然 30
  return 0;                         // a/b/s1 自动释放
}`,
    explain:
      'unique_ptr 独占所有权，离开作用域自动 delete；shared_ptr 用引用计数共享所有权，最后一个持有者析构时才释放。手写 new/delete 容易漏掉异常路径，智能指针让析构函数替你做。',
    whyNot:
      '实验室用"堆块快照 + 泄漏检查"来讲 new/delete 的生命周期，这是最直观的教学模型；智能指针引入引用计数、移动语义和自定义删除器，属于工程进阶，单步展示反而模糊了"谁真正释放"。',
    local: 'gcc -std=c++14 smart.cpp -lstdc++ -o smart && ./smart；再用 -fsanitize=address 跑一遍确认无泄漏。',
    catch:
      '两个 shared_ptr 互相持有会形成循环引用，引用计数永远不到 0——这时要把其中一边改成 weak_ptr。',
  },
  {
    id: 'comma-and-goto',
    title: '逗号表达式与 goto：能写，但不该多写',
    teaser: '教学解释器直接拒绝 goto；有些技巧则只是"看着聪明"。',
    tone: 'amber',
    tags: ['goto', '逗号运算符', '可读性'],
    language: 'c',
    code: `#include <stdio.h>

int main() {
  int i = 0, sum = 0;

  for (i = 0, sum = 0; i < 3; i++, sum += i) {
    // 逗号表达式：依次求值，取最后一项的值
  }
  printf("%d\\n", sum);   // 3

  // 等价写法更推荐：
  sum = 0;
  for (i = 0; i < 3; i++) sum += i;
  return 0;
}`,
    explain:
      '逗号运算符从左到右依次求值，整个表达式的值是最后一项。for 的初始化和更新区常借它塞多个动作，但把副作用藏进表达式里，读代码的人很容易漏看。',
    whyNot:
      'goto 会让控制流不再是结构化的，单步轨迹虽然能画，但"跳到哪里"依赖标签解析，教学价值低于"告诉学生别这么写"；实验室对此给出明确的不支持提示。逗号表达式本身能解析，但这里把它和 goto 放在一起讲，是因为二者都属于"编译器允许、团队规范常禁止"。',
    local: 'gcc comma.c -o comma && ./comma；再试试把 goto 版本编译运行，体会控制流跳转。',
    catch:
      'C++ 里 goto 不能跳过有初始化器的变量声明（会绕过构造），这是比 C 更严格的约束。',
  },
];
