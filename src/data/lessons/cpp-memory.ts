import type { Lesson } from '../types';

const lesson: Lesson = {
  id: 'cpp-memory',
  chapterId: 'cpp-start',
  order: 2,
  title: '动态内存：new 与 delete 的真面目',
  subtitle: '在堆上亲手申请一块内存，再亲手还回去——漏还、重复还、还了还用，都在这里现形',
  description:
    '讲清 new / delete 与栈变量的区别，用单步执行观察堆块的诞生与释放，并演示泄漏、重复释放、释放后使用这三种经典事故。',
  difficulty: 3,
  minutes: 30,
  objectives: [
    '说清栈变量与堆内存的区别：谁负责回收、活多久、大小何时确定',
    '用 `new` / `new T(初值)` / `new T[n]` 申请，用 `delete` / `delete[]` 配对释放',
    '在单步执行里看懂「堆」视图：块编号、元素、谁指向它、是否已释放',
    '识别泄漏、重复释放、释放后使用三种事故，并说出各自的典型症状',
    '养成 `delete` 之后置空指针的习惯，知道智能指针能替你做这件事'
  ],
  blocks: [
    {
      type: 'text',
      body:
        '前面所有变量都住在**栈**上：函数一返回，它的栈帧就整体消失，变量跟着没了。这带来两个限制——活不过函数调用，长度必须在编译期定下来。\n\n' +
        '**堆**（free store）就是为了绕开这两条：`new` 在堆上申请一块内存，它一直存在，直到你用 `delete` 明确还回去。代价是——**还的责任在你身上**，编译器不会替你收尾。初学者几乎所有内存问题，都出在"忘了还、还了两次、还了还在用"。'
    },
    {
      type: 'compare',
      left: {
        title: '栈变量',
        language: 'cpp',
        code: `void f() {
  int a[3] = {1, 2, 3};
}          // 函数结束，a 自动消失`
      },
      right: {
        title: '堆内存',
        language: 'cpp',
        code: `int* p = new int[3];
// ... 函数结束也不会消失
delete[] p;   // 只有这一句能还回去`
      },
      caption: '栈由编译器自动回收，堆由你手动回收——这就是全部区别，也是全部风险。'
    },
    { type: 'heading', text: '一、三个基本动作：申请、使用、释放' },
    {
      type: 'code',
      language: 'cpp',
      title: 'new_basic.cpp',
      caption: '`new int(42)` 申请一个 int 并初始化为 42；`*p` 就是那块内存里的值。',
      code: `#include <iostream>

int main() {
  int* p = new int(42);        // 申请一块存 int 的内存
  std::cout << "*p = " << *p << std::endl;

  *p = 7;                      // 通过指针改写堆上的值
  std::cout << "改写后 *p = " << *p << std::endl;

  delete p;                    // 还给系统
  p = nullptr;                 // 置空，避免误用
  return 0;
}
`
    },
    {
      type: 'text',
      body:
        '`p` 本身只是一个指针变量（住在栈上，8 字节），它保存的是堆上那块 `int` 的地址。所以「指针销毁」和「内存释放」是两件事：函数结束时 `p` 没了，但堆上那块内存还在，除非你 `delete`。\n\n' +
        '数组版本要多一对中括号：`new T[n]` 必须配 `delete[]`。写成 `delete p` 就是未定义行为——教学解释器会直接指出来。'
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'new_array.cpp',
      caption: '长度可以是运行期才确定的变量——这正是堆比数组灵活的地方。',
      code: `#include <iostream>

int main() {
  int n = 5;
  int* a = new int[n];         // 长度到运行时才确定

  for (int i = 0; i < n; i++) {
    a[i] = i * i;              // 像数组一样用下标
  }

  int sum = 0;
  for (int i = 0; i < n; i++) {
    sum += a[i];
  }
  std::cout << "平方和 = " << sum << std::endl;

  delete[] a;                  // 数组必须用 delete[]
  a = nullptr;
  return 0;
}
`
    },
    {
      type: 'diagram',
      diagram: {
        kind: 'trace',
        code: `#include <iostream>

int main() {
  int* p = new int(10);
  std::cout << "*p = " << *p << std::endl;
  *p = 20;
  std::cout << "*p = " << *p << std::endl;
  delete p;
  p = nullptr;
  return 0;
}
`,
        autoplay: false
      },
      title: '单步看堆块的一生',
      caption: '切到「堆」这一栏：`heap#1` 出现 → 元素随 `*p = 20` 变化 → `delete` 后标记为已释放。'
    },
    { type: 'heading', text: '二、三种经典事故' },
    {
      type: 'list',
      ordered: true,
      items: [
        '**内存泄漏**：`new` 了但没 `delete`。程序不崩溃、结果也正确，只是内存越吃越多，长时间运行才会挂。',
        '**重复释放**：同一块内存 `delete` 两次。轻则崩溃，重则被利用来执行任意代码。',
        '**释放后使用**（use-after-free）：`delete` 之后还通过指针读写。那块内存可能已经分给别人了，你写进去的数据会破坏别人的内容。'
      ]
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'leak.cpp',
      caption: '这段代码能正常跑完，但堆上留下了一个没人管的块——单步执行结束时会给出「1 处泄漏」。',
      code: `#include <iostream>

int main() {
  int* p = new int(99);
  std::cout << *p << std::endl;
  // 忘了 delete
  return 0;
}
`
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'double_free.cpp',
      caption: '第二次 delete 会直接中断执行，并说明"已经被释放过了"。',
      code: `#include <iostream>

int main() {
  int* p = new int(1);
  delete p;
  delete p;       // 同一块内存释放两次
  return 0;
}
`
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'use_after_free.cpp',
      caption: '指针还在，指向的内存已经不归你了。',
      code: `#include <iostream>

int main() {
  int* p = new int(5);
  delete p;
  std::cout << *p << std::endl;   // 释放后继续读
  return 0;
}
`
    },
    {
      type: 'note',
      tone: 'danger',
      title: '为什么这些错误"有时能跑、有时崩溃"',
      body:
        '`delete` 只是把这块内存还给分配器，**不会清零、也不会改你的指针**。所以释放后读取，常常还能读到旧值，看起来"没问题"——直到那块内存被分给别人。这类 bug 的特点是：测试环境正常、演示正常，一到用户机器上就随机崩溃。'
    },
    { type: 'heading', text: '三、三条保命习惯' },
    {
      type: 'steps',
      items: [
        {
          title: 'delete 之后立刻置空',
          body: '`delete p; p = nullptr;` 之后如果又误用 p，解引用空指针会当场崩在那一行，而不是几小时后在别处崩——崩溃点离 bug 越近越好。对空指针 `delete` 是安全的，什么都不会发生。'
        },
        {
          title: '谁申请，谁释放；成对出现',
          body: '把 `new` 和 `delete` 写在同一个函数、同一层作用域里，中间不要 return 早退。凡是需要多个出口的函数，先用 `std::vector` 或智能指针，别手写裸指针。'
        },
        {
          title: '能用容器和智能指针就别用裸 new',
          body: '`std::vector<int> v(n);` 会自动释放；`std::unique_ptr<int> p = std::make_unique<int>(42);` 在离开作用域时自动 delete。裸 new 只留给"确实需要手动管理生命周期"的少数场合。'
        }
      ]
    },
    {
      type: 'code',
      language: 'cpp',
      title: 'smart.cpp',
      caption: '标准库队列、容器、智能指针都是 RAII：对象销毁时自动还内存，不需要你记着。',
      code: `#include <iostream>
#include <memory>
#include <vector>

int main() {
  std::vector<int> v(3, 7);                 // 自动管理，离开作用域自动释放
  std::cout << "v[0] = " << v[0] << std::endl;

  std::unique_ptr<int> p = std::make_unique<int>(42);
  std::cout << "*p = " << *p << std::endl;
  // 不需要 delete，p 离开作用域时自动释放
  return 0;
}
`
    },
    {
      type: 'table',
      headers: ['动作', 'C 的写法', 'C++ 的写法'],
      rows: [
        ['申请一个对象', '`malloc(sizeof(int))`', '`new int(初值)`'],
        ['申请数组', '`malloc(n * sizeof(int))`', '`new int[n]`'],
        ['释放对象', '`free(p)`', '`delete p`'],
        ['释放数组', '`free(p)`', '`delete[] p`'],
        ['失败时', '返回 `NULL`', '抛 `std::bad_alloc`'],
        ['是否调用构造/析构', '否', '是']
      ]
    },
    {
      type: 'try',
      language: 'cpp',
      prompt:
        '写一个 `int* makeArray(int n)`，返回 `new int[n]` 并把每个元素初始化为下标值；在 main 里调用它、打印、再 `delete[]`。然后故意删掉 `delete[]` 那一行，重新运行单步执行，看看「堆内存检查」里多了什么。',
      code: `#include <iostream>

int* makeArray(int n) {
  int* a = new int[n];
  for (int i = 0; i < n; i++) {
    a[i] = i;
  }
  return a;
}

int main() {
  int* data = makeArray(4);
  for (int i = 0; i < 4; i++) {
    std::cout << data[i] << " ";
  }
  std::cout << std::endl;
  delete[] data;
  return 0;
}
`
    },
    {
      type: 'pitfalls',
      title: '易错警示 · 自查清单',
      items: [
        {
          mistake: '`new[]` 用 `delete` 释放',
          wrong: 'int* a = new int[5];\ndelete a;',
          right: 'int* a = new int[5];\ndelete[] a;',
          why: '`new[]` 与 `delete[]` 必须配对。混用是未定义行为：可能只析构第一个元素，也可能直接崩溃。'
        },
        {
          mistake: 'delete 之后继续用这个指针',
          wrong: 'delete p;\nstd::cout << *p;',
          right: 'delete p;\np = nullptr;',
          why: '`delete` 只把内存还给分配器，不改你的指针。此时 `p` 是悬空指针，读到的可能是别人的数据。'
        },
        {
          mistake: '两个指针指向同一块内存，各 delete 一次',
          wrong: 'int* q = p;\ndelete p;\ndelete q;',
          right: 'int* q = p;\ndelete p;\nq = nullptr;',
          why: '重复释放同一地址是未定义行为；崩溃信息常常指向第二次 delete，但根因是所有权没有理清。'
        },
        {
          mistake: '函数里 new，异常或提前 return 时漏了 delete',
          wrong: 'int* p = new int[10];\nif (bad()) return -1;\ndelete[] p;',
          right: '用 std::vector<int> 或 std::unique_ptr',
          why: '每个提前返回的分支都是一条泄漏路径。手写 new 时要么保证只有一个出口，要么交给 RAII。'
        },
        {
          mistake: '以为 delete 会把内存清零',
          wrong: 'delete p;  // 以为 *p 变成 0',
          right: 'delete 之后不要再访问 p',
          why: '释放只是交还使用权，内容通常原样留着（glibc 会写一些管理信息），读到什么完全不可预期。'
        }
      ]
    }
  ],
  keyPoints: [
    '`new` 在堆上分配、`delete` 归还；栈变量由编译器自动回收，堆内存必须手动回收。',
    '`new T[n]` 与 `delete[]` 配对，`new T` 与 `delete` 配对，混用是未定义行为。',
    '指针销毁 ≠ 内存释放：函数返回后指针没了，堆上的块还在，除非你 delete。',
    '泄漏不报错、重复释放会崩、释放后使用最难查——三者都能在单步执行的「堆」视图里看见。',
    '习惯：delete 后置空，优先用 `std::vector` / `std::unique_ptr` 代替裸 new。'
  ],
  quiz: [
    {
      id: 'cppm-q1',
      question: '`int* a = new int[10];` 之后，正确的释放语句是？',
      options: ['`delete a;`', '`delete[] a;`', '`free(a);`', '`a = nullptr;` 就够了'],
      answer: 1,
      explanation:
        '`new[]` 申请的是数组，必须用 `delete[]` 释放，它会对每个元素调用析构函数并释放整块内存。`delete a` 只处理一个对象，是未定义行为；`free` 与 `new` 不配对。'
    },
    {
      id: 'cppm-q2',
      question: '下面哪段代码会造成内存泄漏？',
      options: [
        '`int* p = new int(1); delete p;`',
        '`int* p = new int(1);`（函数直接返回，没有 delete）',
        '`int* p = new int[3]; delete[] p;`',
        '`int a[3] = {1,2,3};`（函数返回）'
      ],
      answer: 1,
      explanation:
        '`new` 出来却没有 `delete`，函数返回后指针变量消失，那块堆内存再也无法访问——这就是泄漏。栈数组会随函数返回自动回收，不算泄漏。'
    },
    {
      id: 'cppm-q3',
      question: '`delete p;` 之后紧接着执行 `std::cout << *p;`，会发生什么？',
      options: [
        '输出 0，因为 delete 会清零',
        '输出原来的值，完全安全',
        '属于「释放后使用」，结果不可预期，可能读到垃圾值或崩溃',
        '编译期就会报错'
      ],
      answer: 2,
      explanation:
        '`delete` 只归还内存，不清零也不修改指针。此时 `p` 是悬空指针，那块内存可能已被分配给别人，读到的内容完全不可预期，编译器也不会拦你。'
    }
  ]
};

export default lesson;
