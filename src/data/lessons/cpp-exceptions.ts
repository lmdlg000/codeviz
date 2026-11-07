import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'cpp-exceptions',
  chapterId: 'cpp-oop',
  order: 5,
  title: '异常处理：把「出错」和「正常流程」分开',
  subtitle: '`throw` 抛出、`catch` 接住，中间的函数不用层层判断返回值',
  description:
    '讲清 try / throw / catch 的执行路径、栈展开时析构函数为什么必须可靠，以及异常与错误码该怎么选。',
  difficulty: 3,
  minutes: 26,
  objectives: [
    '写出 `try` / `throw` / `catch` 三段结构，并说清抛出后控制流跳到哪',
    '按类型匹配 catch，用 `const T&` 捕获以避免切片与拷贝',
    '解释栈展开：异常穿过函数时局部对象会被析构，这正是 RAII 的价值',
    '说明为什么析构函数里不该抛异常，以及 `catch(...)` 的风险',
    '在「返回错误码」与「抛异常」之间做出有理由的选择'
  ],
  blocks: [
    {
      type: 'text',
      body:
        'C 里出错只能靠返回值：`-1`、`NULL`、`EOF`。问题是调用层越多，检查代码越啰嗦，而且**返回值只有一个**——既想返回结果又想返回错误码，只能搞出参或全局变量。\n\n' +
        '异常换了个思路：正常路径一路往下写，出错时 `throw` 直接把控制权交给**上层的 catch**，中间的调用层既不检查也不处理，甚至可以完全不知道有这回事。'
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'try_basic.cpp',
      caption: '`throw` 之后，`divide` 里剩下的语句不会再执行，控制权直接跳到 `catch`。',
      code: `#include <iostream>
#include <stdexcept>

double divide(double a, double b) {
  if (b == 0) {
    throw std::invalid_argument("除数不能为 0");
  }
  return a / b;
}

int main() {
  try {
    std::cout << divide(6, 2) << std::endl;   // 3
    std::cout << divide(1, 0) << std::endl;   // 抛异常，这行不会执行
    std::cout << "这一行不会打印" << std::endl;
  } catch (const std::invalid_argument& e) {
    std::cout << "捕获到：" << e.what() << std::endl;
  }
  std::cout << "程序继续往下走" << std::endl;
  return 0;
}
`
    },
    {
      type: 'table',
      headers: ['写法', '说明'],
      rows: [
        ['`throw 表达式;`', '抛出一个对象（值或临时对象），类型决定谁能接住'],
        ['`try { ... }`', '把可能抛异常的代码包起来'],
        ['`catch (const T& e)`', '按类型匹配；`const&` 避免拷贝与被切片'],
        ['`catch (...)`', '接住所有类型，代价是拿不到具体信息'],
        ['`throw;`', '在 catch 里重新抛出当前异常，交给外层处理']
      ]
    },
    {
      type: 'note',
      tone: 'warn',
      title: 'catch 是按类型匹配，且只匹配一次',
      body:
        '`catch` 从上往下匹配，**第一个匹配上的就执行**，之后不再尝试。所以派生类要写在基类前面：先 `catch (const std::runtime_error&)` 再 `catch (const std::exception&)`；反过来的话派生类永远轮不到。'
    },
    { type: 'heading', text: '一、栈展开：异常穿过函数时发生了什么' },
    {
      type: 'text',
      body:
        '异常从抛出点向上找 catch 的过程中，会**逐层销毁**经过的作用域里的局部对象——这叫**栈展开**（stack unwinding）。这意味着：只要资源交给对象的析构函数管理，它就会被正确释放；而裸 `new` 出来的指针，如果还没 `delete` 就抛了异常，就泄漏了。\n\n' +
        '这就是 **RAII**（资源获取即初始化）的由来：把资源绑在对象生命周期上，让析构函数负责回收，异常路径和正常路径都能覆盖。'
    },
    {
      type: 'compare',
      left: {
        title: '裸 new：异常一来就泄漏',
        language: 'cpp',
        code: `void work() {
  int* p = new int[100];
  mayThrow();     // 抛异常
  delete[] p;     // 永远执行不到
}`
      },
      right: {
        title: 'vector：栈展开时自动释放',
        language: 'cpp',
        code: `void work() {
  std::vector<int> v(100);
  mayThrow();     // 抛异常
  // v 的析构函数会被调用，内存自动归还
}`
      },
      caption: '同样抛异常，左边泄漏 400 字节，右边什么都不漏——差别只在「谁负责释放」。'
    },
    {
      type: 'note',
      tone: 'danger',
      title: '析构函数里不要抛异常',
      body:
        '栈展开过程中如果析构函数再抛一个异常，就会出现「两个异常同时存在」，C++ 直接调用 `std::terminate` 结束进程。所以析构函数里只做释放，出错就吞掉或记日志；确实可能失败的操作（如 `close`、`flush`）应该在正常路径里显式处理。'
    },
    { type: 'heading', text: '二、异常还是错误码' },
    {
      type: 'table',
      headers: ['场景', '推荐方式', '理由'],
      rows: [
        ['真正的异常情况（文件打不开、参数非法、内存不足）', '抛异常', '调用方通常无能为力，只想中断当前流程'],
        ['可预期的常规分支（找没找到、是否到达末尾）', '返回值 / 可选类型', '不是错误，用异常会让控制流变得难读'],
        ['性能敏感的热路径', '错误码', '异常有运行时开销，且会让编译器难以优化'],
        ['构造函数失败', '抛异常', '构造函数没有返回值，只能靠异常表示失败'],
        ['析构函数', '不抛', '栈展开中再抛会 terminate']
      ]
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'raii_guard.cpp',
      caption: '把「必须成对做的事」放进一个类的构造/析构里，异常也不会漏。',
      code: `#include <iostream>
#include <stdexcept>

class Buffer {
  int* data;
  int size;
public:
  Buffer(int n) : data(new int[n]), size(n) {
    std::cout << "申请了 " << size << " 个 int" << std::endl;
  }
  ~Buffer() {
    delete[] data;
    std::cout << "释放了" << std::endl;   // 无论正常返回还是抛异常都会执行
  }
  int& at(int i) { return data[i]; }
};

void work() {
  Buffer buf(3);
  buf.at(0) = 1;
  throw std::runtime_error("中途出事");
}

int main() {
  try {
    work();
  } catch (const std::exception& e) {
    std::cout << "捕获：" << e.what() << std::endl;
  }
  std::cout << "结束" << std::endl;
  return 0;
}
`
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
        {
          mistake: '用 `catch (...)` 吞掉所有异常',
          wrong: 'catch (...) { /* 什么都不做 */ }',
          right: 'catch (const std::exception& e) { log(e.what()); throw; }',
          why: '接住却不处理、也不重新抛出，等于把 bug 藏起来：程序继续跑在错误状态上。'
        },
        {
          mistake: '先 catch 基类，再 catch 派生类',
          wrong: 'catch (const std::exception& e) {...}\ncatch (const std::runtime_error& e) {...}',
          right: 'catch (const std::runtime_error& e) {...}\ncatch (const std::exception& e) {...}',
          why: 'catch 自上而下匹配，基类在前会把派生类异常全部吃掉，后面的分支变成死代码。'
        },
        {
          mistake: '按值捕获 `catch (T e)`',
          wrong: 'catch (std::exception e) { ... }',
          right: 'catch (const std::exception& e) { ... }',
          why: '按值捕获会拷贝并**切片**（派生类信息丢失），还可能有额外开销；用 `const T&`。'
        },
        {
          mistake: '在析构函数里抛异常',
          wrong: '~Buffer() { if (bad) throw std::runtime_error("x"); }',
          right: '~Buffer() { /* 只释放，不抛 */ }',
          why: '栈展开时再抛第二个异常会直接 terminate，程序连清理都来不及。'
        },
        {
          mistake: '把异常当普通控制流用（用 throw 跳出循环）',
          wrong: 'for (...) { if (found) throw Found(); }',
          right: '用 break / return / 标志位',
          why: '异常应当表示「异常情况」。用它做常规跳转会破坏可读性，还会拖慢性能。'
        }
      ]
    }
  ],
  keyPoints: [
    '`throw` 把控制权交给最近的匹配 `catch`，抛出点之后的语句不再执行。',
    'catch 按类型自上而下匹配，派生类必须写在基类前面，捕获用 `const T&`。',
    '栈展开会销毁经过作用域的局部对象，所以 RAII 对象的资源一定会被释放。',
    '析构函数不要抛异常；`catch(...)` 接住后要么处理要么重新抛出。',
    '异常用于「异常情况」，可预期的分支用返回值；构造函数失败只能靠异常。'
  ],
  quiz: [
    {
      id: 'cppe-q1',
      question: '`throw` 之后，同一个函数里它下面的语句会怎样？',
      options: [
        '继续执行到函数结束',
        '不再执行，控制权交给匹配的 catch',
        '被编译器删掉',
        '先执行 finally 再抛出'
      ],
      answer: 1,
      explanation:
        '`throw` 立即中断当前函数的正常流程，开始栈展开，直到找到匹配的 catch。C++ 没有 finally，清理工作交给析构函数。'
    },
    {
      id: 'cppe-q2',
      question: '为什么析构函数里不应该抛异常？',
      options: [
        '析构函数不能包含 throw 关键字',
        '栈展开过程中再抛异常会导致 std::terminate',
        '析构函数没有返回值',
        '会降低编译速度'
      ],
      answer: 1,
      explanation:
        '异常处理期间若析构函数又抛出异常，两个异常同时存在，C++ 运行时直接调用 `std::terminate` 终止程序。'
    },
    {
      id: 'cppe-q3',
      question: '下面哪种情况最适合用异常而不是返回值？',
      options: [
        '在数组里查找某个值，没找到',
        '读取文件时文件不存在',
        '遍历容器到达末尾',
        '判断一个数是否为偶数'
      ],
      answer: 1,
      explanation:
        '「没找到」「到达末尾」「是否偶数」都是正常结果分支，用返回值更清晰；文件打不开属于异常情况，调用方通常只能中断流程并报错。'
    }
  ]
};

export default lesson;
