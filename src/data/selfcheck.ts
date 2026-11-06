/**
 * 自查清单（易错警示的可执行版本）
 * ------------------------------------------------------------------
 * 每条规则要么能被引擎自动判定（rules 非空），要么需要人眼确认（manual）。
 * 实验室「概览」用它生成勾选式清单，课程内嵌的 pitfalls 块用同一套措辞。
 */

export interface SelfCheckItem {
  id: string;
  /** 一句话结论式标题 */
  title: string;
  /** 为什么要查 / 怎么查 */
  detail: string;
  /** 命中这些诊断规则就说明这条没过 */
  rules: string[];
  /** 相关课程，便于跳转复习 */
  lessonId?: string;
}

export const SELF_CHECK_ITEMS: SelfCheckItem[] = [
  {
    id: 'syntax',
    title: '括号、引号、注释都成对闭合',
    detail: '每写一个 { 就先补上 }；字符串和注释必须闭合，否则后面的代码会被整段吞掉。',
    rules: ['unterminated-string', 'unterminated-comment', 'unterminated-char', 'engine-error'],
    lessonId: 'c01-hello',
  },
  {
    id: 'printf',
    title: 'printf 的占位符数量和参数数量一致',
    detail: '%d 对应 int，%f 对应 double，%c 对应 char，%s 对应 char*；漏一个参数会打印垃圾值。',
    rules: ['printf-arg-mismatch'],
    lessonId: 'c01-hello',
  },
  {
    id: 'scanf',
    title: 'scanf 的每个变量都写了 &',
    detail: '只有字符数组名（%s）不加 &，其余都要传地址，并且参数个数与格式串一一对应。',
    rules: ['scanf-missing-address', 'scanf-arg-count', 'scanf-string-target'],
    lessonId: 'c01-hello',
  },
  {
    id: 'bounds',
    title: '数组下标始终在 0 ~ n-1 之间',
    detail: 'int a[5] 的合法下标是 0..4；循环写 i <= 5 就越界，多出来的那个格子会踩坏别的变量。',
    rules: ['array-index-out-of-bounds'],
    lessonId: 'c06-arrays',
  },
  {
    id: 'divide',
    title: '除以变量前先判断它不是 0',
    detail: '整数除以 0 会直接崩溃，浮点会得到 inf；能约掉变量的地方先讨论是否为 0。',
    rules: ['division-by-zero'],
    lessonId: 'c03-operators',
  },
  {
    id: 'assign',
    title: 'if / while 的条件里没有误写 =',
    detail: 'if (x = 1) 是赋值，永远为真；比较要用 ==，把常量写在左边（1 == x）能提前报错。',
    rules: ['assignment-in-condition'],
    lessonId: 'c04-selection',
  },
  {
    id: 'return',
    title: '有返回值的函数在每条分支上都 return',
    detail: 'if 里 return 了，else 分支也要有；漏掉的那条路径会返回不确定的值。',
    rules: ['missing-return'],
    lessonId: 'c07-functions',
  },
  {
    id: 'loop-semicolon',
    title: 'for / while 后面没有多写一个分号',
    detail: 'for (...) ; { } 会让循环体变成空语句，循环白跑一遍，后面的大括号只是普通代码块。',
    rules: ['empty-loop-body', 'do-while'],
    lessonId: 'c05-loops',
  },
  {
    id: 'duplicate',
    title: '同一个函数只有一份实现',
    detail: '声明可以出现多次，带函数体的定义只能有一次，否则链接阶段会报重复定义。',
    rules: ['duplicate-definition'],
    lessonId: 'c07-functions',
  },
  {
    id: 'spelling',
    title: '函数名拼写正确、头文件已包含',
    detail: 'printf 拼成 print、strlen 忘了 <string.h>，都会在编译或链接时报错。',
    rules: ['undefined-function'],
    lessonId: 'c07-functions',
  },
  {
    id: 'strcmp',
    title: '字符串比较用 strcmp，不要用 ==',
    detail: 'char 数组名比较的是地址，两个内容相同的字符串 == 也可能为假；相等判断要写 strcmp(a, b) == 0。',
    rules: [],
    lessonId: 'c06-arrays',
  },
  {
    id: 'init',
    title: '变量使用前一定赋过值',
    detail: '局部变量不初始化就是随机值，累加器、计数器在使用前先清零。',
    rules: [],
    lessonId: 'c02-data',
  },
  {
    id: 'off-by-one',
    title: '循环边界没有差一错误',
    detail: '遍历 n 个元素用 i < n；求 1..n 的和用 i <= n。写完后拿 n = 0、n = 1 各手算一遍。',
    rules: [],
    lessonId: 'c05-loops',
  },
  {
    id: 'pointer',
    title: '指针使用前已经指向有效内存',
    detail: '定义指针时就初始化（int *p = &x 或 nullptr），解引用前确认它不是空指针、也没有越界。',
    rules: [],
    lessonId: 'c08-pointers',
  },
  {
    id: 'recursion',
    title: '递归有出口，并且每次都在靠近出口',
    detail: '先写终止条件，再写递归调用；参数必须变化，否则会栈溢出。',
    rules: [],
    lessonId: 'c07-functions',
  },
];
