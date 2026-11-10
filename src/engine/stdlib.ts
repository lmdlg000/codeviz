/**
 * 标准库覆盖表（唯一事实来源）
 * ------------------------------------------------------------------
 * - 解释器支持的函数（support: 'trace'）直接由本表生成，避免"UI 说支持、
 *   执行却报不支持"的两套口径；
 * - support: 'static' 表示可被词法/语法/调用图识别，但单步执行会明确提示；
 * - header 用于第一行列标题，也是"该函数来自哪个头文件"的教学信息。
 */

export type StdlibSupport = 'trace' | 'static';

export interface StdlibEntry {
  /** 函数 / 对象名，不含括号 */
  name: string;
  /** 声明示例，带参数名方便初学者照抄 */
  signature: string;
  support: StdlibSupport;
  /** 一句话说明或注意事项 */
  note: string;
}

export interface StdlibGroup {
  id: string;
  title: string;
  header: string;
  /** 该组在课程中的对应小节，便于跳转 */
  lessonId?: string;
  entries: StdlibEntry[];
}

const trace = (name: string, signature: string, note: string): StdlibEntry => ({
  name,
  signature,
  support: 'trace',
  note,
});

const stat = (name: string, signature: string, note: string): StdlibEntry => ({
  name,
  signature,
  support: 'static',
  note,
});

export const STDLIB_GROUPS: StdlibGroup[] = [
  {
    id: 'stdio',
    title: '标准输入输出',
    header: '<stdio.h>',
    lessonId: 'c-hello',
    entries: [
      trace('printf', 'int printf(const char *fmt, ...)', '支持 %d %i %u %c %s %f %.2f %x %o %% 与宽度、左对齐。'),
      trace('scanf', 'int scanf(const char *fmt, ...)', '除 %s 外必须传地址 &x；返回值是成功读入的项数。'),
      trace('getchar', 'int getchar(void)', '读一个字符（不跳过空白），返回值是 int，可与 EOF 比较。'),
      trace('putchar', 'int putchar(int c)', '输出一个字符，返回输出的字符。'),
      trace('puts', 'int puts(const char *s)', '输出字符串并自动换行。'),
      stat('gets', 'char *gets(char *s)', '会读入整行，但无法限制长度，现代标准已删除，改用 fgets。'),
      stat('sprintf', 'int sprintf(char *buf, const char *fmt, ...)', '格式化到字符数组，注意缓冲区长度。'),
      stat('fgets', 'char *fgets(char *s, int n, FILE *fp)', '文件 / 标准输入的安全读行方式。'),
    ],
  },
  {
    id: 'string',
    title: '字符串处理',
    header: '<string.h>',
    lessonId: 'c-arrays',
    entries: [
      trace('strlen', 'size_t strlen(const char *s)', '统计到 \\0 为止的字符数，不含 \\0。'),
      trace('strcpy', 'char *strcpy(char *dst, const char *src)', '目标数组必须放得下 src + \\0。'),
      trace('strncpy', 'char *strncpy(char *dst, const char *src, size_t n)', '最多复制 n 个字符，可能不会补 \\0。'),
      trace('strcat', 'char *strcat(char *dst, const char *src)', '追加到 dst 末尾，同样要预留 \\0。'),
      trace('strcmp', 'int strcmp(const char *a, const char *b)', '相等返回 0；不能用 == 比较字符串内容。'),
      trace('memcpy', 'void *memcpy(void *dst, const void *src, size_t n)', '按字节复制 n 个字节，源与目标不能重叠。'),
      trace('memset', 'void *memset(void *dst, int ch, size_t n)', '把 n 个字节填成同一个值，常用于清零。'),
      trace('memcmp', 'int memcmp(const void *a, const void *b, size_t n)', '按字节比较前 n 个字节，相等返回 0。'),
      trace('strncmp', 'int strncmp(const char *a, const char *b, size_t n)', '只比较前 n 个字符。'),
      stat('strchr', 'char *strchr(const char *s, int c)', '查找字符首次出现位置。'),
      stat('strstr', 'char *strstr(const char *s, const char *sub)', '查找子串首次出现位置。'),
    ],
  },
  {
    id: 'ctype',
    title: '字符分类',
    header: '<ctype.h>',
    lessonId: 'c-data',
    entries: [
      trace('isdigit', 'int isdigit(int c)', '是数字字符返回非 0。'),
      trace('isalpha', 'int isalpha(int c)', '是字母返回非 0。'),
      trace('isalnum', 'int isalnum(int c)', '是字母或数字返回非 0。'),
      trace('isupper', 'int isupper(int c)', '是大写字母返回非 0。'),
      trace('islower', 'int islower(int c)', '是小写字母返回非 0。'),
      trace('isspace', 'int isspace(int c)', '空格 / 制表符 / 换行等空白字符。'),
      trace('toupper', 'int toupper(int c)', '转大写，非字母原样返回。'),
      trace('tolower', 'int tolower(int c)', '转小写，非字母原样返回。'),
    ],
  },
  {
    id: 'math',
    title: '数学函数',
    header: '<math.h>',
    lessonId: 'c-operators',
    entries: [
      trace('sqrt', 'double sqrt(double x)', 'x 为负数时返回 NaN。'),
      trace('pow', 'double pow(double x, double y)', '返回 x 的 y 次方。'),
      trace('fabs', 'double fabs(double x)', '浮点绝对值；整型用 abs / labs。'),
      trace('floor', 'double floor(double x)', '向下取整，返回 double。'),
      trace('ceil', 'double ceil(double x)', '向上取整，返回 double。'),
      trace('sin', 'double sin(double x)', '参数是弧度，不是角度。'),
      trace('cos', 'double cos(double x)', '参数是弧度。'),
      trace('tan', 'double tan(double x)', '参数是弧度。'),
      trace('fmod', 'double fmod(double x, double y)', '浮点取余，符号跟随 x。'),
      stat('log', 'double log(double x)', '自然对数，x 必须大于 0。'),
      stat('exp', 'double exp(double x)', 'e 的 x 次方。'),
    ],
  },
  {
    id: 'stdlib',
    title: '转换与通用工具',
    header: '<stdlib.h>',
    lessonId: 'c-functions',
    entries: [
      trace('abs', 'int abs(int x)', '整型绝对值，浮点请用 fabs。'),
      trace('labs', 'long labs(long x)', 'long 型绝对值。'),
      trace('atoi', 'int atoi(const char *s)', '字符串转整数，遇到非数字就停止，不做错误检查。'),
      trace('atof', 'double atof(const char *s)', '字符串转浮点数。'),
      stat('rand', 'int rand(void)', '伪随机数，单步执行中不可重现，故不追踪。'),
      stat('srand', 'void srand(unsigned seed)', '设置随机种子，通常配合 time(NULL)。'),
      trace('malloc', 'void *malloc(size_t size)', '按字节申请，返回 void*；单步执行会还原成数组块并跟踪释放。'),
      trace('calloc', 'void *calloc(size_t n, size_t size)', '申请 n 个元素并清零，等价于 malloc + memset。'),
      trace('free', 'void free(void *p)', '释放 malloc / calloc 的内存；与 new 混用是未定义行为。'),
      stat('realloc', 'void *realloc(void *p, size_t size)', '重新分配大小，可能搬移内存，旧指针失效。'),
      stat('qsort', 'void qsort(void *base, size_t n, size_t size, cmp)', '通用排序，需配合函数指针。'),
    ],
  },
  {
    id: 'cpp-io',
    title: 'C++ 输入输出',
    header: '<iostream>',
    lessonId: 'c11-classes',
    entries: [
      trace('cout', 'std::cout << x << std::endl;', '链式输出，endl 会换行并刷新缓冲区。'),
      trace('cin', 'std::cin >> x;', '自动按类型解析，不需要格式串；读到输入结束返回 false，可以写 while (cin >> x)。'),
      trace('endl', 'std::endl', '换行符 + flush。'),
      stat('setw', 'std::setw(8)', '设置下一次输出的最小宽度，需要 <iomanip>。'),
      stat('getline', 'std::getline(std::cin, s)', '读一整行，包含空格。'),
    ],
  },
  {
    id: 'cpp-string',
    title: 'std::string',
    header: '<string>',
    lessonId: 'c11-classes',
    entries: [
      trace('length', 's.length()', '返回字符个数，与 size() 等价。'),
      trace('size', 's.size()', '返回字符个数。'),
      trace('at', 's.at(i)', '带边界检查的下标访问。'),
      trace('c_str', 's.c_str()', '转成 const char*，供 printf 等 C 函数使用。'),
      trace('stoi', 'int stoi(const std::string &s)', '字符串转 int，非法输入会抛异常。'),
      trace('to_string', 'std::to_string(x)', '数值转字符串。'),
      stat('substr', 's.substr(pos, len)', '取子串，pos 越界会抛异常。'),
      stat('find', 's.find("x")', '找不到时返回 std::string::npos。'),
      stat('push_back', 's.push_back(c)', '尾部追加一个字符。'),
    ],
  },
  {
    id: 'stl',
    title: 'STL 容器与算法',
    header: '<vector> <map> <set> <algorithm>',
    lessonId: 'c13-templates',
    entries: [
      trace('vector', 'std::vector<int> v;', '动态数组：push_back / size / 下标 / 范围 for 都可单步观察。'),
      trace('map', 'std::map<string,int> m;', '有序键值对，按 key 自动排序；m[k] 缺键会插入默认值。'),
      trace('set', 'std::set<int> s;', '自动去重的有序集合，用 insert / count / erase。'),
      trace('pair', 'std::pair<int,int> p;', '两个值的组合，用 p.first / p.second 访问。'),
      trace('make_pair', 'std::make_pair(a, b)', '按实参类型推出 pair 的两个类型。'),
      trace('stack', 'std::stack<int> s;', '后进先出：push / pop / top / size / empty。'),
      trace('queue', 'std::queue<int> q;', '先进先出：push / pop / front / back / size / empty。'),
      trace('priority_queue', 'std::priority_queue<int> pq;', '每次弹出最大值：push / pop / top。'),
      trace('sort', 'std::sort(v.begin(), v.end());', '需 <algorithm>，默认升序；单步执行会真实重排区间。'),
      trace('reverse', 'std::reverse(v.begin(), v.end());', '原地反转区间，与 sort 同一套迭代器区间。'),
    ],
  },
];

/** 解释器可单步执行的全部标准库函数 / 对象名 */
export const STDLIB_TRACE_NAMES: ReadonlySet<string> = new Set(
  STDLIB_GROUPS.flatMap((group) => group.entries.filter((entry) => entry.support === 'trace').map((entry) => entry.name)).concat([
    // 解释器内部的通用工具（不属于某个具体头文件）
    'max',
    'min',
  ]),
);

export const STDLIB_STATIC_NAMES: ReadonlySet<string> = new Set(
  STDLIB_GROUPS.flatMap((group) => group.entries.filter((entry) => entry.support === 'static').map((entry) => entry.name)),
);

export const STDLIB_ALL_NAMES: ReadonlySet<string> = new Set([...STDLIB_TRACE_NAMES, ...STDLIB_STATIC_NAMES]);
