import type { CodeSample } from '../types';

/**
 * C++ 示例库
 * ------------------------------------------------------------------
 * 所有代码均为原创教学示例，可用 g++ -std=c++17 -fsyntax-only 通过。
 * focus 表示该示例最能展示的图形能力：类结构、流程图或单步执行。
 */
const samples: CodeSample[] = [
  {
    id: 'cpp-bigint',
    title: 'BigInt：自己实现大整数',
    description: '一个完整的 C++ 类：私有缓冲区、深拷贝、运算符重载与动态内存管理。类图、调用图、堆内存都能看，也能单步跑完 —— 每次 new/delete 都对应到具体行。',
    language: 'cpp',
    code: `#include <iostream>
#include <cstddef>
#include <cstring>
using namespace std;

class BigInt {
    bool   isZero;   // true => 0
    size_t len;      // dights/length
    size_t size;     // capacity of s (>= len + 1) 
    char*  s;        // string: s[0] => highest, s[len-1] => lowest, s[len] = '\\0'
    void alloc(size_t cap);
    void fromSizeT(size_t v);
    void fromCStr(const char* str);
    int cmp(const BigInt& o) const;
public:
    BigInt(size_t v = 0);
    BigInt(const char* str);
    BigInt(const BigInt& o);
    BigInt& operator=(const BigInt& o);
    ~BigInt();
    friend BigInt operator+(const BigInt& left, const BigInt& right);
    friend BigInt operator*(const BigInt& left, const BigInt& right);
    BigInt& operator+=(const BigInt& right);
    BigInt& operator*=(const BigInt& right);
    bool operator==(const BigInt& o) const;
    bool operator!=(const BigInt& o) const;
    bool operator< (const BigInt& o) const;
    bool operator<=(const BigInt& o) const;
    bool operator> (const BigInt& o) const;
    bool operator>=(const BigInt& o) const;
    friend ostream& operator<<(ostream& os, const BigInt& b);
};

void BigInt::alloc(size_t cap){
    if (cap < 1) cap = 1;       // for '\\0'
    char* old = s;              // old buf => old, copied from s
    const size_t oldCap = size; // old cap => oldCap
    s = new char[cap];          // new buf => s, new cap => cap
    s[0] = '\\0';                // new buf init
    if (old != nullptr){
        // keep the last position for '\\0' and move at minimal times
        const size_t n = (oldCap < cap - 1) ? oldCap : (cap - 1);
        for (size_t i = 0; i < n; ++i) s[i] = old[i];
        s[n] = '\\0';
        delete[] old;           
    }
    size = cap;
    if (len >= size) len = size - 1; // avoid buffer overflow
}

void BigInt::fromSizeT(size_t v){
    if (v == 0){
        isZero = true;
        len = 1;
        alloc(2);
        s[0] = '0';
        s[1] = '\\0';
        return;
    }
    size_t t = v, n = 0; // v => value; n => digits, size + 1
    while (t){           // count digits
        t /= 10;
        ++n;
    }
    alloc(n + 1);
    len = n;
    isZero = false;
    for (size_t i = n; i-- > 0; ){
        // fill in the buffer in converse order
        s[i] = char('0' + v % 10);
        v /= 10;
    }
    s[len] = '\\0';
}

void BigInt::fromCStr(const char* str){
    if (str == nullptr || *str == '\\0'){
        isZero = true;
        len = 1;
        alloc(2);
        s[0] = '0';
        s[1] = '\\0';
        return;
    }
    while (*str == '0') ++str; // skip leading 0
    const size_t n = strlen(str);
    alloc(n + 1);
    len = n;
    isZero = false;
    memcpy(s, str, n + 1);
}

int BigInt::cmp(const BigInt& o) const{
    // len == 0 => 0 (equal)
    const bool this0 = isZero || len == 0;
    const bool o0 = o.isZero || o.len == 0;
    if (this0 && o0) return 0;
    // 只要一方是 0，另一方非 0 就能立刻定序（原来少了 o0 的分支，导致 == 永远为假）
    if (this0) return -1;
    if (o0) return 1;
    // compare len
    if (len != o.len) return (len < o.len) ? -1 : 1;
    // compare value (from the highest diff digit)
    for (size_t i = 0; i < len; ++i){
        if (s[i] != o.s[i]) return (s[i] < o.s[i]) ? -1 : 1;
    }
    return 0;
}

BigInt::BigInt(size_t v) : isZero(true), len(0), size(0), s(nullptr){
    fromSizeT(v);
}

BigInt::BigInt(const char* str) : isZero(true), len(0), size(0), s(nullptr){
    fromCStr(str);
}

BigInt::BigInt(const BigInt& o) : isZero(true), len(0), size(0), s(nullptr){
    // deep copy: 必须按 o.size 分配，否则只有 1 字节，memcpy 会越界
    alloc(o.size);
    isZero = o.isZero;
    len = o.len;
    size = o.size;
    memcpy(s, o.s, len + 1);
}

BigInt& BigInt::operator=(const BigInt& o){
    if (this != &o){
        alloc(o.size); // size => old cap
        isZero = o.isZero;
        len = o.len;
        if (o.s != nullptr) memcpy(s, o.s, len + 1);
        else{
            isZero = true;
            len = 1;
            s[0] = '0';
            s[1] = '\\0';
        }
    }
    return *this;
}

BigInt::~BigInt(){
    delete[] s;
    s = nullptr;
}

BigInt operator+(const BigInt& left, const BigInt& right){
    BigInt temp = left;
    temp += right;
    return temp;
}

BigInt operator*(const BigInt& left, const BigInt& right){
    BigInt temp = left;
    temp *= right;
    return temp;
}

BigInt& BigInt::operator+=(const BigInt& right){
    const BigInt* longer;
    const BigInt* shorter;
    // len comparison
    if (len > right.len){
        longer = this;
        shorter = &right;
    } else {
        longer = &right;
        shorter = this;
    }
    char* temp = new char[longer->len + 1]; // temp[0] => lowest
    int carry = 0;
    size_t i = 0;
    for ( ; i < shorter->len; ++i){
        // add two short parts: 两边各自按自己的 len 对齐（都从最低位开始数）
        int sum = (shorter->s[shorter->len - 1 - i] - '0')
        + (longer->s[longer->len - 1 - i] - '0') + carry;
        temp[i] = (char)('0' + sum % 10);
        carry = sum / 10;
    }
    for ( ; i < longer->len; ++i){
        // remaining part: 这里必须用 longer->len 对齐，用 shorter->len 会越界
        int sum = (longer->s[longer->len - 1 - i] - '0') + carry;
        temp[i] = (char)('0' + sum % 10);
        carry = sum / 10;
    }
    size_t newLen = longer->len;
    // Don't forget to carry!
    if (carry > 0){
        temp[i++] = (char)('0' + carry);
        newLen = longer->len + 1;
    }
    len = newLen;
    size = newLen + 1;
    delete[] s;
    s = new char[size];
    for (size_t j = 0; j < len; ++j){
        // write back this->s in converse order to keep s[0] the highest
        s[j] = temp[len - 1 - j];
    }
    s[len] = '\\0';
    // 维护 isZero：0 + 0 才是 0，其它情况一律非零
    isZero = (len == 1 && s[0] == '0');
    delete[] temp;
    return *this;
}

BigInt& BigInt::operator*=(const BigInt& right){
    const BigInt* longer;
    const BigInt* shorter;
    if (len > right.len){
        longer = this;
        shorter = &right;
    } else {
        longer = &right;
        shorter = this;
    }
    // 一位 × longer 最多 longer->len + 1 位
    const size_t prodCap = longer->len + 1;
    // 再按位权左移最多 shorter->len - 1 位，末尾留 '\\0'
    const size_t bufCap = prodCap + shorter->len + 1;

    char* temp = new char[prodCap];  // 单个数字 × longer 的结果，temp[0] 是最低位
    char* buf  = new char[bufCap];   // 高位在前 + '\\0'，用来构造 tempInt2
    BigInt tempInt;                  // 累加器，初值 0
    // 从低位到高位循环 shorter 的每一位
    for (size_t i = 0; i < shorter->len; ++i){
        const int d = (int)(shorter->s[shorter->len - 1 - i] - '0');
        if (d == 0) continue;        // 该位是 0，贡献为 0，直接跳过

        // 该数字与 longer 逐位相乘，含进位，低位在 temp
        int carry = 0;
        size_t tempLen = longer->len;
        for (size_t k = 0; k < longer->len; ++k){
            int prod = d * (int)(longer->s[longer->len - 1 - k] - '0') + carry;
            temp[k] = (char)('0' + prod % 10);
            carry = prod / 10;
        }
        if (carry > 0) temp[tempLen++] = (char)('0' + carry);

        // 按位权左移 i 位：高位是乘积，末尾补 i 个 '0'，buf 存"高位在前"的 C 字符串
        size_t n = 0;
        for (size_t k = tempLen; k-- > 0; ) buf[n++] = temp[k];
        for (size_t k = 0; k < i; ++k) buf[n++] = '0';
        buf[n] = '\\0';

        // 生成 tempInt2 并累加
        BigInt tempInt2(buf);
        tempInt += tempInt2;
    }

    delete[] temp;
    delete[] buf;

    // 用累加结果整理 this（赋值运算符会重新分配 this->s）
    *this = tempInt;
    return *this;   // 返回 *this
}

bool BigInt::operator==(const BigInt& o) const{
    return (cmp(o) == 0);
}

bool BigInt::operator!=(const BigInt& o) const{
    return !(*this == o);
}

bool BigInt::operator<(const BigInt& o) const{
    return (cmp(o) < 0);
}

bool BigInt::operator<=(const BigInt& o) const{
    return (cmp(o) <= 0);
}

bool BigInt::operator>(const BigInt& o) const{
    return (cmp(o) > 0);
}

bool BigInt::operator>=(const BigInt& o) const{
    return (cmp(o) >= 0);
}

ostream& operator<<(ostream& os, const BigInt& b){
    if (b.isZero || b.len == 0){
        os << '0';
    } else {
        for (size_t i = 0; i < b.len; ++i) os << b.s[i];
    }
    return os;
}

int main(){
    BigInt x1("9999999999");
    BigInt x2("1"); 
    cout << x1 << "+" << x2 << " = " << (x1 + x2) << endl;
    BigInt x3("2100000000"); 
    BigInt x4("2100000000");
    cout << x3 << "+" << x4 << " = " << (x3 += x4) << endl;    
    BigInt y1(99);
    BigInt y2("99");        
    size_t v = 0;    
    BigInt y3(v);
    cout << y1 << "*" << y2 << " = " << (y1 * y2) << endl;    
    cout << y1 << "*" << y3 << " = " << (y1 * y3) << endl;
    BigInt y4("9999999999");
    BigInt y5("9999999999");
    cout << y4 << "*" << y5 << " = " << (y4 *= y5) << endl;
    return 0;
}`,
    tags: ['类与对象', '运算符重载', '动态内存'],
    level: 3,
    focus: 'classes'
  },

  {
    id: 'cpp-heap-array',
    title: '堆上开一个数组',
    description: '长度在运行时才确定：new int[n] 申请、下标读写、求和、delete[] 归还，单步执行里能看见堆块。',
    language: 'cpp',
    code: `#include <iostream>

int main() {
  int n = 5;
  int* a = new int[n];

  for (int i = 0; i < n; i++) {
    a[i] = i * i;
  }

  int sum = 0;
  for (int i = 0; i < n; i++) {
    sum += a[i];
  }

  std::cout << "sum = " << sum << std::endl;

  delete[] a;
  a = nullptr;
  return 0;
}`,
    tags: ['动态内存', 'new', 'delete[]'],
    level: 2,
    focus: 'trace'
  },
  {
    id: 'cpp-heap-leak',
    title: '忘了 delete 会怎样',
    description: '同一段逻辑，一个函数释放了内存、另一个没有。运行单步执行，看「堆内存检查」如何指出泄漏。',
    language: 'cpp',
    code: `#include <iostream>

int* makeBlock(int value) {
  int* p = new int(value);
  return p;
}

int main() {
  int* a = makeBlock(11);
  std::cout << "*a = " << *a << std::endl;
  delete a;
  a = nullptr;

  int* b = makeBlock(22);
  std::cout << "*b = " << *b << std::endl;
  // 故意不释放 b：堆内存检查会报告 1 处泄漏
  return 0;
}`,
    tags: ['动态内存', '内存泄漏', '自查'],
    level: 3,
    focus: 'trace'
  },
  {
    id: 'cpp-hello',
    title: 'C++ 的第一次问候',
    description: '用固定变量演示 cout 的链式输出：文本与数值交替拼接，最后算出一个带小数的结果。',
    language: 'cpp',
    code: `#include <iostream>

int main() {
  int apples = 7;
  int pears = 6;
  int total = apples + pears;

  std::cout << "apples = " << apples << std::endl;
  std::cout << "pears  = " << pears << std::endl;
  std::cout << "total  = " << total << std::endl;

  double average = total / 2.0;
  std::cout << "average = " << average << std::endl;
  return 0;
}`,
    tags: ['控制台输出', '流式输出', '命名空间'],
    level: 2,
    focus: 'trace',
  },
  {
    id: 'reference-swap',
    title: '用引用交换两个变量',
    description: '通过引用参数交换两个变量，体会“别名”参数如何避开拷贝并改到实参。',
    language: 'cpp',
    code: `#include <iostream>

// a 和 b 是实参的别名，函数内修改会直接落到调用者的变量上
void swapByReference(int& a, int& b) {
  int temp = a;
  a = b;
  b = temp;
}

int main() {
  int x = 3;
  int y = 8;

  std::cout << "before: x=" << x << ", y=" << y << std::endl;
  swapByReference(x, y);
  std::cout << "after:  x=" << x << ", y=" << y << std::endl;
  return 0;
}`,
    tags: ['引用', '函数参数', '交换'],
    level: 2,
    focus: 'flow',
  },
  {
    id: 'class-rectangle',
    title: 'Rectangle：第一个封装类',
    description: '用 Rectangle 类封装宽高、构造函数与面积方法，演示私有数据与公开接口的配合。',
    language: 'cpp',
    code: `#include <iostream>

class Rectangle {
public:
  Rectangle(double width, double height) {
    width_ = width > 0 ? width : 0;
    height_ = height > 0 ? height : 0;
  }

  double area() const {
    return width_ * height_;
  }

  double perimeter() const {
    return 2 * (width_ + height_);
  }

  void setWidth(double width) {
    if (width > 0) {
      width_ = width;
    }
  }

  double width() const { return width_; }
  double height() const { return height_; }

private:
  double width_ = 1.0;
  double height_ = 1.0;
};

int main() {
  Rectangle rect(4.0, 2.5);
  std::cout << "area = " << rect.area() << std::endl;
  std::cout << "perimeter = " << rect.perimeter() << std::endl;

  rect.setWidth(10.0);
  std::cout << "new width = " << rect.width() << std::endl;
  return 0;
}`,
    tags: ['类与对象', '封装', '构造函数'],
    level: 2,
    focus: 'classes',
  },
  {
    id: 'class-student',
    title: 'Student：构造、析构与 static 计数',
    description: '在 Student 类中演示构造函数、析构函数与 static 成员计数器。',
    language: 'cpp',
    code: `#include <iostream>
#include <string>

class Student {
public:
  Student(const std::string& name, int score) {
    name_ = name;
    score_ = score;
    id_ = ++count_;
    std::cout << "create student " << name_ << std::endl;
  }

  ~Student() {
    std::cout << "destroy student " << name_ << std::endl;
  }

  void print() const {
    std::cout << "#" << id_ << " " << name_ << " score=" << score_ << std::endl;
  }

  static int totalCreated() {
    return count_;
  }

private:
  std::string name_;
  int score_ = 0;
  int id_ = 0;
  static int count_;
};

int Student::count_ = 0;

int main() {
  Student alice("Alice", 92);
  {
    Student bob("Bob", 85);
    bob.print();
  }
  alice.print();
  std::cout << "total created = " << Student::totalCreated() << std::endl;
  return 0;
}`,
    tags: ['构造析构', '静态成员', '对象生命周期'],
    level: 2,
    focus: 'classes',
  },
  {
    id: 'inheritance-animal',
    title: 'Animal 家族：继承与重写',
    description: '让 Dog 和 Cat 继承 Animal 并重写 sound，通过基类指针观察虚函数调用 —— 单步看 introduce() 里那句 sound() 是怎么分派到 Dog 的。',
    language: 'cpp',
    code: `#include <iostream>
#include <string>

class Animal {
public:
  Animal(const std::string& name) { name_ = name; }
  virtual ~Animal() {}

  virtual std::string sound() const { return "..."; }

  void introduce() const {
    std::cout << name_ << " says " << sound() << std::endl;
  }

protected:
  std::string name_;
};

class Dog : public Animal {
public:
  Dog(const std::string& name) : Animal(name) {}

  std::string sound() const override { return "Woof"; }
};

class Cat : public Animal {
public:
  Cat(const std::string& name) : Animal(name) {}

  std::string sound() const override { return "Meow"; }
};

int main() {
  Dog dog("Buddy");
  Cat cat("Mimi");
  dog.introduce();
  cat.introduce();

  Animal* pet = &dog;
  std::cout << "pet says " << pet->sound() << std::endl;
  return 0;
}`,
    tags: ['继承', '函数重写', '虚函数'],
    level: 2,
    focus: 'classes',
  },
  {
    id: 'shape-polymorphism',
    title: 'Shape：多态图形计算',
    description: '用抽象基类 Shape、纯虚函数与虚析构实现一组图形的统一面积计算，单步能看到 delete 时先 ~Circle 再 ~Shape。',
    language: 'cpp',
    code: `#include <iostream>

class Shape {
public:
  virtual ~Shape() {}
  virtual double area() const = 0;
  virtual const char* name() const = 0;
};

class Circle : public Shape {
public:
  Circle(double radius) { radius_ = radius; }

  double area() const override { return 3.14159 * radius_ * radius_; }
  const char* name() const override { return "Circle"; }

private:
  double radius_ = 0.0;
};

class Rectangle : public Shape {
public:
  Rectangle(double width, double height) {
    width_ = width;
    height_ = height;
  }

  double area() const override { return width_ * height_; }
  const char* name() const override { return "Rectangle"; }

private:
  double width_ = 0.0;
  double height_ = 0.0;
};

double totalArea(const Shape* shapes[], int count) {
  double sum = 0.0;
  for (int i = 0; i < count; i++) {
    sum += shapes[i]->area();
  }
  return sum;
}

int main() {
  const int kCount = 2;
  const Shape* shapes[kCount] = {new Circle(2.0), new Rectangle(3.0, 4.0)};

  for (int i = 0; i < kCount; i++) {
    std::cout << shapes[i]->name() << " area = " << shapes[i]->area() << std::endl;
  }
  std::cout << "total area = " << totalArea(shapes, kCount) << std::endl;

  for (int i = 0; i < kCount; i++) {
    delete shapes[i];
  }
  return 0;
}`,
    tags: ['多态', '抽象类', '虚析构'],
    level: 3,
    focus: 'classes',
  },
  {
    id: 'template-max',
    title: 'maxValue：一个函数模板',
    description: '用函数模板 maxValue 让同一份比较逻辑服务 int、double 与 string。',
    language: 'cpp',
    code: `#include <iostream>
#include <string>

template <typename T>
T maxValue(const T& a, const T& b) {
  return a > b ? a : b;
}

int main() {
  std::cout << maxValue(3, 9) << std::endl;
  std::cout << maxValue(2.5, 1.5) << std::endl;
  std::cout << maxValue(std::string("apple"), std::string("pear")) << std::endl;
  return 0;
}`,
    tags: ['函数模板', '泛型', '类型推导'],
    level: 2,
    focus: 'flow',
  },
  {
    id: 'template-stack',
    title: 'Stack<T>：类模板',
    description: '用类模板 Stack<T> 演示带类型参数的栈容器及其 push/pop 行为。',
    language: 'cpp',
    code: `#include <iostream>

template <typename T>
class Stack {
public:
  Stack() { top_ = -1; }

  bool empty() const { return top_ == -1; }
  bool full() const { return top_ == kCapacity - 1; }

  bool push(const T& value) {
    if (full()) {
      return false;
    }
    top_++;
    items_[top_] = value;
    return true;
  }

  bool pop(T& value) {
    if (empty()) {
      return false;
    }
    value = items_[top_];
    top_--;
    return true;
  }

private:
  static const int kCapacity = 8;
  T items_[kCapacity];
  int top_ = -1;
};

int main() {
  Stack<int> stack;
  stack.push(10);
  stack.push(20);
  stack.push(30);

  int value = 0;
  while (stack.pop(value)) {
    std::cout << value << " ";
  }
  std::cout << std::endl;
  return 0;
}`,
    tags: ['类模板', '栈', '封装'],
    level: 3,
    focus: 'classes',
  },
  {
    id: 'stl-vector',
    title: 'vector：动态数组入门',
    description: '用 vector 保存成绩、用范围 for 遍历求和，再用 sort 把成绩排序。',
    language: 'cpp',
    code: `#include <algorithm>
#include <iostream>
#include <vector>

int main() {
  std::vector<int> scores = {72, 95, 88, 60, 100};
  scores.push_back(78);
  std::cout << "size = " << scores.size() << std::endl;

  int sum = 0;
  for (int score : scores) {
    sum += score;
  }
  std::cout << "sum = " << sum << std::endl;

  std::sort(scores.begin(), scores.end());
  std::cout << "sorted: ";
  for (int score : scores) {
    std::cout << score << " ";
  }
  std::cout << std::endl;
  return 0;
}`,
    tags: ['动态数组', '范围遍历', '排序'],
    level: 2,
    focus: 'flow',
  },
  {
    id: 'vector-stats',
    title: 'vector + string：成绩统计',
    description: '用 vector 与 string 统计一组成绩的最小值、最大值与平均值。',
    language: 'cpp',
    code: `#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

int main() {
  std::vector<std::string> names = {"Ada", "Linus", "Grace"};
  names.push_back("Ken");

  std::cout << "names: ";
  for (const std::string& name : names) {
    std::cout << name << " ";
  }
  std::cout << std::endl;

  std::vector<int> scores = {80, 92, 75, 100, 88};
  std::sort(scores.begin(), scores.end());
  std::cout << "min = " << scores.front()
            << ", max = " << scores.back() << std::endl;

  int sum = 0;
  for (int score : scores) {
    sum += score;
  }
  double average = static_cast<double>(sum) / scores.size();
  std::cout << "average = " << average << std::endl;
  return 0;
}`,
    tags: ['动态数组', '字符串', '统计'],
    level: 3,
    focus: 'flow',
  },
];

export default samples;
