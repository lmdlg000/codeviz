/**
 * 教学子集解释器 + 执行轨迹
 * ------------------------------------------------------------------
 * 设计取舍：
 * - 用宿主 JS 递归实现函数调用（深度上限 64），执行到每条语句时记录
 *   TraceStep，保证 UI 可以逐步回放；
 * - 作用域用 Scope 链：全局 → 函数参数帧 → 块级作用域；
 * - 指针用 Ref（可读写引用）表示，支持 &x、*p、指针交换、指向数组元素；
 * - 只支持教学子集，遇到不支持的写法立即返回 supported=false。
 */
import type {
  HeapBlockSnapshot,
  RuntimeVar,
  SimulateOptions,
  TraceError,
  TraceEvent,
  TraceHeapIssue,
  TraceResult,
  TraceStep,
} from './types';
import { DEFAULT_MAX_STEPS, MAX_TRACE_STEPS } from './types';
import type { ClassDeclNode, ExprNode, FieldDeclNode, FuncDeclNode, ParamNode, ProgramNode, StmtNode } from './ast';
import type { FormatSpec } from './io';
import { flattenBinaryChain, parseFormat, rootName } from './io';
import { buildSupportRegistry, findUnsupportedProgram } from './support';
import {
  arrayElementRef,
  arrayElementTexts,
  arrayToPointer,
  asInt,
  asNumber,
  baseTypeName,
  boolValue,
  categoryOfValue,
  charDisplay,
  charsOf,
  coerceValue,
  countElements,
  escapeText,
  floatValue,
  formatValue,
  intValue,
  isCharType,
  isFloatType,
  isPointerType,
  isStringType,
  nullValue,
  stringValue,
  truthy,
  voidValue,
} from './values';
import type { ArrayValue, MapEntryValue, MapValue, PointerValue, Ref, RValue, StructValue } from './values';
import { exprToText, formatNumber, scalarSize, truncateText } from './utils';

const MAX_CALL_DEPTH = 64;
const OPS_LIMIT = 200000;

class SimError extends Error {
  readonly kind: 'runtime' | 'unsupported';
  readonly line: number;
  constructor(message: string, line: number, kind: 'runtime' | 'unsupported' = 'runtime') {
    super(message);
    this.name = 'SimError';
    this.kind = kind;
    this.line = line;
  }
}

class StepLimitError extends Error {
  constructor() {
    super('step limit');
    this.name = 'StepLimitError';
  }
}

class OpsLimitError extends Error {
  constructor() {
    super('ops limit');
    this.name = 'OpsLimitError';
  }
}

interface Slot {
  name: string;
  value: RValue;
  ref: Ref;
  typeText: string;
  category: ReturnType<typeof categoryOfValue>;
  isConst: boolean;
}

class Scope {
  readonly vars = new Map<string, Slot>();
  constructor(readonly parent: Scope | null) {}
}

interface Frame {
  fn: FuncDeclNode | null;
  name: string;
  line: number;
  scopes: Scope[];
  /** 成员函数调用时的 this 对象，用于裸字段名回退与 this-> 访问 */
  thisValue?: StructValue;
}

type Signal =
  | { kind: 'normal' }
  | { kind: 'return'; value: RValue; ref?: Ref }
  | { kind: 'break' }
  | { kind: 'continue' };

const NORMAL: Signal = { kind: 'normal' };

function lastSegment(name: string): string {
  const index = name.lastIndexOf('::');
  return index >= 0 ? name.slice(index + 2) : name;
}

/** 纯取值不会产生副作用的左值：a、a.b、a[i]、*p */
function isSimpleLvalue(node: ExprNode): boolean {
  switch (node.kind) {
    case 'ident':
      return true;
    case 'member':
      return node.op !== '::' && isSimpleLvalue(node.object);
    case 'index':
      return isSimpleLvalue(node.object) && isSimpleLvalue(node.index);
    case 'unary':
      return node.op === '*' && isSimpleLvalue(node.operand);
    default:
      return false;
  }
}

function trimZeros(text: string): string {
  if (!text.includes('.')) return text;
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * 短文本复用同一个字符串实例。
 * 轨迹里塞满了 `'0'` `'\0'` `int` 这类重复文本，几千步下来会造出大量
 * 内容相同但各自独立的字符串；intern 之后内存直接降到可忽略。
 */
const textPool = new Map<string, string>();
function internText(text: string): string {
  const pooled = textPool.get(text);
  if (pooled !== undefined) return pooled;
  if (textPool.size < 4096) textPool.set(text, text);
  return text;
}

function flattenClasses(program: ProgramNode): ClassDeclNode[] {
  const result: ClassDeclNode[] = [];
  const visit = (cls: ClassDeclNode): void => {
    result.push(cls);
    for (const nested of cls.nested) visit(nested);
  };
  for (const cls of program.classes) visit(cls);
  return result;
}

/** `std::vector<int>` → 'int'；不是 vector 就返回 undefined */
function vectorElemType(typeText: string): string | undefined {
  const match = /(?:^|::)\s*vector\s*<(.+)>\s*$/.exec(typeText.trim());
  return match ? match[1].trim() : undefined;
}

/** `std::map<string, int>` → ['string', 'int']；名字不匹配就返回 undefined */
function templateArgsOf(typeText: string, name: string): string[] | undefined {
  const match = new RegExp(`(?:^|::)\\s*${name}\\s*<(.+)>\\s*$`).exec(typeText.trim());
  if (!match) return undefined;
  return splitTemplateArgs(match[1])
    .map((part) => part.trim())
    .filter(Boolean);
}

/** 去掉 `const` / 引用，容器里存的都是值 */
function plainType(text: string): string {
  return text
    .replace(/\b(const|constexpr|volatile|typename)\b/g, '')
    .replace(/[*&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface AssocInfo {
  kind: 'map' | 'set';
  keyType: string;
  valueType: string;
}

/** `std::map<K, V>` / `std::set<K>` */
function assocTypeOf(typeText: string): AssocInfo | undefined {
  const mapArgs = templateArgsOf(typeText, 'map');
  if (mapArgs && mapArgs.length >= 2) {
    return { kind: 'map', keyType: plainType(mapArgs[0]), valueType: plainType(mapArgs[1]) };
  }
  const setArgs = templateArgsOf(typeText, 'set');
  if (setArgs && setArgs.length >= 1) {
    return { kind: 'set', keyType: plainType(setArgs[0]), valueType: 'void' };
  }
  return undefined;
}

/** `std::stack<int>` / `std::queue<int>` / `std::priority_queue<int>` */
function adapterTypeOf(typeText: string): { adapter: 'stack' | 'queue' | 'priority_queue'; elemType: string } | undefined {
  for (const adapter of ['stack', 'queue', 'priority_queue'] as const) {
    const args = templateArgsOf(typeText, adapter);
    if (args && args.length >= 1) return { adapter, elemType: plainType(args[0]) };
  }
  return undefined;
}

/** `std::pair<A, B>` */
function pairTypeOf(typeText: string): { first: string; second: string } | undefined {
  const args = templateArgsOf(typeText, 'pair');
  if (!args || args.length < 2) return undefined;
  return { first: plainType(args[0]), second: plainType(args[1]) };
}

/** 展开模板时要跟着替换的字段：只动类型文本，不碰标识符 */
const TEMPLATE_TYPE_KEYS: ReadonlySet<string> = new Set([
  'typeText',
  'base',
  'baseType',
  'returnType',
  'signature',
  'elemType',
]);

/** 把类型文本里的模板参数换成具体类型（`T&` → `int&`） */
function applyBindings(text: string, bindings: Map<string, string>): string {
  if (bindings.size === 0 || !text) return text;
  let out = text;
  for (const [param, value] of bindings) {
    out = out.replace(new RegExp(`\\b${param}\\b`, 'g'), () => value);
  }
  return out;
}

/** `std::map<int, std::string>, 8` → ['std::map<int, std::string>', ' 8'] */
function splitTemplateArgs(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '<' || char === '(' || char === '[') depth++;
    else if (char === '>' || char === ')' || char === ']') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** 解析编译期常量（`static const int kCapacity = 8`）的字面量 */
function parseConstIntText(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return Number.parseInt(trimmed, 16);
  return undefined;
}

function collectEnums(program: ProgramNode): Map<string, number> {
  const values = new Map<string, number>();
  for (const enumDecl of program.enums) {
    let next = 0;
    for (const enumerator of enumDecl.enumerators) {
      if (enumerator.valueText) {
        const parsed = Number(enumerator.valueText);
        if (Number.isFinite(parsed)) next = parsed;
      }
      values.set(enumerator.name, next);
      next++;
    }
  }
  return values;
}

/** 解释器内部的堆块：用 ArrayValue 统一承载，标量也当成 1 个元素的数组 */
interface HeapBlock {
  id: number;
  label: string;
  elemType: string;
  isArray: boolean;
  array: ArrayValue;
  /** 指向数组第 0 个元素的引用，标量指针就用它 */
  ref: Ref;
  freed: boolean;
  line: number;
}

const MAX_HEAP_BLOCKS = 64;

/** 可以写成 f(x) 形式的内置类型转换 */
const BUILTIN_CAST_NAMES: ReadonlySet<string> = new Set([
  'char',
  'short',
  'int',
  'long',
  'float',
  'double',
  'bool',
  'unsigned',
  'signed',
  'size_t',
]);
const HEAP_PREVIEW = 16;

/** 解释器主类 */
class Interpreter {
  private program: ProgramNode;
  private stepLimit: number;
  private globalScope = new Scope(null);
  private frames: Frame[] = [];
  private steps: TraceStep[] = [];
  private outputText = '';
  private lastSnapshot = new Map<string, string>();
  private truncated = false;
  private ops = 0;
  private input: string;
  private inputPos = 0;
  private currentLine = 1;
  /** 全局变量初始化期间不记录步骤，保证首步是 start */
  private quiet = false;
  private functionMap = new Map<string, FuncDeclNode>();
  /** 非成员运算符重载：operator+ 等可能有多个，按类型挑 */
  private freeFunctions = new Map<string, FuncDeclNode[]>();
  /** 类外定义的成员函数：`类名::方法名` → 实现（class.methods 里往往只有声明） */
  private methodIndex = new Map<string, FuncDeclNode[]>();

  private indexMethod(fn: FuncDeclNode): void {
    if (!fn.className || !fn.body) return;
    const key = `${lastSegment(fn.className)}::${fn.name}`;
    const list = this.methodIndex.get(key) ?? [];
    list.push(fn);
    this.methodIndex.set(key, list);
  }
  private classMap = new Map<string, ClassDeclNode>();
  /** 类模板：`template <typename T> class Stack` 的原型，按模板参数现场展开 */
  private classTemplates = new Map<string, ClassDeclNode>();
  /** 函数模板：`template <typename T> T maxValue(...)`，按实参类型推导 */
  private fnTemplates = new Map<string, FuncDeclNode[]>();
  /** 已展开出来的具体类型缓存（键就是 `Stack<int>` 这样的名字） */
  private typeCache = new Map<string, string>();
  /** 静态常量成员：类名 → 名字 → 值（`static const int kCapacity = 8`） */
  private staticConsts = new Map<string, Map<string, number>>();
  /** 类名 → 直接基类列表（单继承为主，多继承按声明顺序平铺） */
  private parents = new Map<string, string[]>();
  /** 最近一次「返回引用」的调用交出来的左值，供 `at(v,1) = 9` 这类写法使用 */
  private refReturnSlot: Ref | undefined;

  /** 从自己到最顶层基类的顺序：Dog → Animal */
  private classChain(className: string): string[] {
    const chain: string[] = [];
    const walk = (name: string, depth: number): void => {
      if (depth > 16 || chain.includes(name)) return;
      chain.push(name);
      for (const base of this.parents.get(name) ?? []) walk(base, depth + 1);
    };
    walk(lastSegment(className), 0);
    return chain;
  }

  /** base 是 derived 的基类（或同一个类）吗 */
  private isAncestorOf(base: string, derived: string): boolean {
    return this.classChain(derived).includes(lastSegment(base));
  }

  /**
   * 基类子对象的布局顺序：按声明顺序，每个基类自己的基类排在它前面
   * （`class C : public A, public B` → A、B；菱形时祖先只出现一次）。
   */
  private baseLayout(className: string): string[] {
    const result: string[] = [];
    const visit = (name: string, depth: number): void => {
      if (depth > 16) return;
      for (const base of this.parents.get(name) ?? []) {
        visit(base, depth + 1);
        if (!result.includes(base)) result.push(base);
      }
    };
    visit(lastSegment(className), 0);
    return result;
  }

  /**
   * 兄弟基类里同名的字段：C++ 里写 `c.x` 会有二义性，必须写成 `c.A::x`。
   * 返回真正冲突的那几个基类名，没有冲突就返回 undefined。
   */
  private ambiguousField(className: string, field: string): string[] | undefined {
    const base = lastSegment(className);
    const owners = this.baseLayout(base).filter((name) =>
      (this.classMap.get(name)?.fields ?? []).some((item) => !item.isStatic && item.name === field),
    );
    if (owners.length < 2) return undefined;
    // 有继承关系的两个基类不算冲突（更派生的那份隐藏基类的同名字段）
    const distinct = owners.filter((owner) => !owners.some((other) => owner !== other && this.isAncestorOf(owner, other)));
    return distinct.length > 1 ? distinct : undefined;
  }

  /** 兄弟基类同名字段：给一句和 C++ 编译器同义的提示，而不是悄悄只用其中一份 */
  private assertFieldNotAmbiguous(typeName: string, field: string, line: number): void {
    const owners = this.ambiguousField(typeName, field);
    if (!owners) return;
    throw new SimError(
      `${field} 在 ${owners.join(' 和 ')} 里都有定义，直接写 ${field} 会有二义性；请写成 ${owners[0]}::${field} 指明是哪一份（或给字段改个名字）。`,
      line,
    );
  }

  /** 一个类是否抽象：链上有纯虚函数、且更派生的类没有实现它 */
  private abstractMethodOf(className: string): FuncDeclNode | undefined {
    const chain = this.classChain(className);
    for (let i = chain.length - 1; i >= 0; i--) {
      const cls = this.classMap.get(chain[i]);
      for (const method of cls?.methods ?? []) {
        if (!method.isPureVirtual) continue;
        // chain.slice(0, i) 是比声明处更派生的那几个类
        const implemented = chain.slice(0, i).some((derived) => {
          const derivedCls = this.classMap.get(derived);
          const inline = derivedCls?.methods.some(
            (item) => item.name === method.name && !item.isPureVirtual,
          );
          const outOfLine = (this.methodIndex.get(`${derived}::${method.name}`) ?? []).length > 0;
          return Boolean(inline) || outOfLine;
        });
        if (!implemented) return method;
      }
    }
    return undefined;
  }
  /* ============================== 模板展开 ============================== */

  /**
   * 把 `Stack<int>` 展开成一个真正的类（就像编译器做的实例化），
   * 之后再走普通类的构造 / 成员调用 / 析构流程，不必到处特判模板。
   * 不是类模板的类型原样返回。
   */
  private concretizeType(base: string, typeText?: string): string {
    const text = (typeText ?? '').trim();
    const lt = text.indexOf('<');
    if (lt < 0) return base;
    const close = text.lastIndexOf('>');
    if (close <= lt) return base;
    const rawName = text
      .slice(0, lt)
      .replace(/\b(const|volatile|static|typename|struct|class)\s+/g, '')
      .trim();
    const name = lastSegment(rawName);
    if (!this.classTemplates.has(name)) return base;
    return this.instantiateClass(name, text.slice(lt + 1, close));
  }

  /** 类模板实例化：绑定模板参数 → 换掉所有类型文本 → 注册成一个普通类 */
  private instantiateClass(templateName: string, argText: string): string {
    const key = `${templateName}<${argText}>`;
    if (this.typeCache.has(key)) return key;
    const tpl = this.classTemplates.get(templateName);
    if (!tpl) return templateName;
    // 先占位，避免 `Stack<Stack<int>>` 这类自引用把递归撑开
    this.typeCache.set(key, key);

    const bindings = this.bindTemplateArgs(tpl.templateParams ?? [], argText);
    const instance = this.substituteTypes(tpl, bindings);
    instance.name = key;
    instance.isTemplate = false;
    instance.templateParams = undefined;
    // 构造 / 析构函数的名字跟着类型走：`Stack<int>` 的构造函数就叫 `Stack<int>`
    for (const method of instance.methods) {
      if (lastSegment(method.className ?? '') === templateName) method.className = key;
      if (method.name === templateName) method.name = key;
      if (method.name === `~${templateName}`) method.name = `~${key}`;
    }

    // `T items_[kCapacity]`：维度是静态常量，展开时就能算出真实长度
    this.registerStatics(key, instance.fields);
    const consts = this.staticConsts.get(key) ?? new Map<string, number>();
    for (const field of instance.fields) {
      if (!field.arrayDimTexts || field.arrayDimTexts.length === 0) continue;
      field.arrayDims = field.arrayDims.map((dim, index) => {
        if (dim !== null) return dim;
        const text = field.arrayDimTexts?.[index] ?? '';
        return consts.get(text) ?? parseConstIntText(text) ?? null;
      });
    }

    this.classMap.set(key, instance);
    for (const method of instance.methods) {
      if (!method.body) continue;
      const mkey = `${key}::${method.name}`;
      const list = this.methodIndex.get(mkey) ?? [];
      list.push(method);
      this.methodIndex.set(mkey, list);
    }
    const bases = instance.bases.map((base) => lastSegment(base.name)).filter(Boolean);
    if (bases.length > 0) this.parents.set(key, bases);
    return key;
  }

  private registerStatics(className: string, fields: FieldDeclNode[]): void {
    const consts = new Map<string, number>();
    for (const field of fields) {
      if (!field.isStatic) continue;
      const value = parseConstIntText(field.initText ?? '');
      if (value !== undefined) consts.set(field.name, value);
    }
    if (consts.size > 0) this.staticConsts.set(className, consts);
  }

  private bindTemplateArgs(params: string[], argText: string): Map<string, string> {
    const bindings = new Map<string, string>();
    if (params.length === 0) return bindings;
    const args = splitTemplateArgs(argText);
    for (let i = 0; i < params.length; i++) {
      const value = args[i]?.trim();
      if (value) bindings.set(params[i], value);
    }
    return bindings;
  }

  /** 深拷贝一份声明，并把类型文本里的模板参数换成具体类型 */
  private substituteTypes<T>(node: T, bindings: Map<string, string>): T {
    const walk = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(walk);
      if (!value || typeof value !== 'object') return value;
      const source = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(source)) {
        const item = source[key];
        if (typeof item === 'string' && TEMPLATE_TYPE_KEYS.has(key)) {
          out[key] = applyBindings(item, bindings);
        } else if (key === 'arrayDimTexts' && Array.isArray(item)) {
          out[key] = item.map((text) => (typeof text === 'string' ? applyBindings(text, bindings) : text));
        } else {
          out[key] = walk(item);
        }
      }
      return out;
    };
    return walk(node) as T;
  }

  /** 函数模板：拿实参类型推导出 `T`，再展开成普通函数 */
  private instantiateFunction(templates: FuncDeclNode[], args: RValue[]): FuncDeclNode | undefined {
    for (const tpl of templates) {
      const bindings = this.deduceTemplateArgs(tpl, args);
      if (!bindings) continue;
      const key = `${tpl.name}<${[...bindings.values()].join(',')}>`;
      const cached = this.fnInstances.get(key);
      if (cached) return cached;
      const instance = this.substituteTypes(tpl, bindings);
      instance.isTemplate = false;
      instance.templateParams = undefined;
      this.fnInstances.set(key, instance);
      return instance;
    }
    return undefined;
  }

  private deduceTemplateArgs(tpl: FuncDeclNode, args: RValue[]): Map<string, string> | undefined {
    const params = tpl.templateParams ?? [];
    if (params.length === 0) return undefined;
    const bindings = new Map<string, string>();
    for (let i = 0; i < tpl.params.length; i++) {
      const arg = args[i];
      if (!arg) continue;
      const stripped = tpl.params[i].typeText
        .replace(/\b(const|volatile|typename|class|static)\b/g, '')
        .replace(/[*&\s]/g, '');
      if (!params.includes(stripped)) continue;
      const value = this.valueTypeText(arg);
      if (!value) continue;
      const existing = bindings.get(stripped);
      // 同一个 T 推出两个不同类型（maxValue(1, 2.5)）在 C++ 里就是调用失败
      if (existing && existing !== value) return undefined;
      bindings.set(stripped, value);
    }
    return bindings.size > 0 ? bindings : undefined;
  }

  /** 值的类型文本，用于函数模板的类型推导 */
  private valueTypeText(value: RValue): string {
    switch (value.t) {
      case 'struct':
        return value.typeName;
      case 'string':
        return value.typeText || 'std::string';
      case 'pointer':
        return `${value.elemType}*`;
      case 'array':
        return value.elemType;
      case 'int':
        return value.typeText || 'int';
      case 'float':
        return value.typeText || 'double';
      case 'null':
        return '';
      default:
        return '';
    }
  }

  private enumValues: Map<string, number>;
  /** 已展开的函数模板实例：`maxValue<int>` → 具体函数 */
  private fnInstances = new Map<string, FuncDeclNode>();
  /** new 出来的堆块，按申请顺序排列 */
  private heapBlocks: HeapBlock[] = [];
  /** 数组对象 → 所属堆块，用于判断指针是否指向已释放内存 */
  private heapIndex = new Map<ArrayValue, HeapBlock>();
  private nextHeapId = 1;
  private heapPeak = 0;
  private heapIssues: TraceHeapIssue[] = [];
  private leaksCollected = false;
  /** 上一份堆快照的内容签名，用于连续步复用同一份快照对象 */
  private heapKey = '';
  private heapCache: HeapBlockSnapshot[] | undefined;
  /** 执行 operator<< 时，把 os << x 的文本收集到这里 */
  private captureSink: string[] | null = null;
  /**
   * 表达式产生的临时类对象（函数按值返回 / 类名当构造函数用）。
   * C++ 里它们的生命周期到「完整表达式」结束，这里用语句边界近似：
   * 语句执行完统一调用析构，避免临时对象的堆缓冲变成假泄漏。
   */
  private temps: StructValue[] = [];

  constructor(program: ProgramNode, options: SimulateOptions) {
    this.program = program;
    this.stepLimit = Math.min(Math.max(options.maxSteps ?? DEFAULT_MAX_STEPS, 10), MAX_TRACE_STEPS);
    this.input = options.stdin ?? '';
    this.enumValues = collectEnums(program);

    for (const cls of flattenClasses(program)) {
      if (cls.isTemplate) {
        // 模板本身不参与运行：等看到 `Stack<int>` 再按参数展开出一个真正的类
        if (!this.classTemplates.has(cls.name)) this.classTemplates.set(cls.name, cls);
        continue;
      }
      if (!this.classMap.has(cls.name)) this.classMap.set(cls.name, cls);
      this.registerStatics(cls.name, cls.fields);
      const bases = cls.bases.map((base) => lastSegment(base.name)).filter(Boolean);
      if (bases.length > 0) this.parents.set(lastSegment(cls.name), bases);
    }
    for (const fn of program.functions) {
      if (!fn.body) continue;
      if (fn.isTemplate) {
        if (fn.templateParams && fn.templateParams.length > 0) {
          const list = this.fnTemplates.get(fn.name) ?? [];
          list.push(fn);
          this.fnTemplates.set(fn.name, list);
          continue;
        }
      }
      if (!this.functionMap.has(fn.name)) this.functionMap.set(fn.name, fn);
      if (fn.className) this.indexMethod(fn);
      if (!fn.className && fn.name.startsWith('operator')) {
        const list = this.freeFunctions.get(fn.name) ?? [];
        list.push(fn);
        this.freeFunctions.set(fn.name, list);
      }
    }
    for (const cls of this.classMap.values()) {
      for (const method of cls.methods) {
        const key = `${lastSegment(cls.name)}::${method.name}`;
        const list = this.methodIndex.get(key) ?? [];
        if (method.body) list.push(method);
        this.methodIndex.set(key, list);
        if (!method.body) continue;
        if (!this.functionMap.has(method.name)) this.functionMap.set(method.name, method);
      }
    }
  }

  run(): TraceResult {
    const mainFn = this.findMain();
    if (!mainFn) {
      return this.unsupportedResult(1, '没有找到 main 函数，无法执行。');
    }
    try {
      this.quiet = true;
      this.initGlobals();
      this.quiet = false;
      this.emit({ event: 'start', description: '开始执行 main 函数', line: mainFn.line }, true);
      this.callFunction(mainFn, [], mainFn.line);
      this.finishEnd(false);
      return this.successResult();
    } catch (error) {
      if (error instanceof StepLimitError) {
        this.truncated = true;
        this.finishEnd(true);
        return this.successResult();
      }
      if (error instanceof OpsLimitError) {
        const message = `循环或计算次数超过 ${OPS_LIMIT} 次，可能是死循环或数据规模过大。`;
        this.pushErrorStep(message, this.currentLine, 'limit');
        this.truncated = true;
        this.finishEnd(true);
        return this.failureResult({ message, line: this.currentLine, kind: 'limit' }, true, true);
      }
      if (error instanceof SimError) {
        this.pushErrorStep(error.message, error.line, error.kind === 'unsupported' ? 'unsupported' : 'runtime');
        this.finishEnd(true);
        return this.failureResult(
          { message: error.message, line: error.line, kind: error.kind },
          error.kind !== 'unsupported',
          false,
        );
      }
      const message = '执行过程中遇到了意外错误。';
      this.pushErrorStep(message, this.currentLine, 'runtime');
      this.finishEnd(true);
      return this.failureResult({ message, line: this.currentLine, kind: 'runtime' }, true, false);
    }
  }

  /* ============================== 结果 / 步骤 ============================== */

  private successResult(): TraceResult {
    this.collectLeaks();
    return {
      ok: true,
      supported: true,
      steps: this.steps,
      output: this.outputText,
      truncated: this.truncated,
      maxSteps: this.stepLimit,
      interpreterNote:
        '教学解释器子集：整数 / 浮点 / 字符 / 字符串、数组、循环、递归、指针基础、struct 读写，以及 new / delete 的堆内存。',
      stdinConsumed: this.input.slice(0, this.inputPos),
      heapIssues: this.heapIssues,
      heapPeak: this.heapPeak,
    };
  }

  private failureResult(error: TraceError, supported: boolean, truncated: boolean): TraceResult {
    this.collectLeaks();
    return {
      ok: false,
      supported,
      error,
      steps: this.steps,
      output: this.outputText,
      truncated,
      maxSteps: this.stepLimit,
      stdinConsumed: this.input.slice(0, this.inputPos),
      heapIssues: this.heapIssues,
      heapPeak: this.heapPeak,
    };
  }

  private unsupportedResult(line: number, message: string): TraceResult {
    return {
      ok: false,
      supported: false,
      error: { message, line, kind: 'unsupported' },
      steps: [],
      output: '',
      truncated: false,
      maxSteps: this.stepLimit,
    };
  }

  private findMain(): FuncDeclNode | undefined {
    const candidates = this.program.functions.filter((fn) => fn.name === 'main' && fn.body);
    if (candidates.length > 0) return candidates[0];
    return undefined;
  }

  private pushErrorStep(message: string, line: number, kind: 'runtime' | 'unsupported' | 'limit'): void {
    try {
      this.emit(
        { event: 'error', description: kind === 'limit' ? message : `运行错误：${message}`, line },
        true,
      );
    } catch {
      // 忽略
    }
  }

  private finishEnd(aborted: boolean): void {
    if (this.steps.length > 0 && this.steps[this.steps.length - 1].event === 'end') return;
    this.emit(
      {
        event: 'end',
        description: aborted
          ? this.truncated
            ? `已达到步数 / 次数上限（最多 ${this.stepLimit} 步），追踪提前结束。`
            : '执行因错误提前结束。'
          : '程序执行结束',
        line: this.currentLine,
      },
      true,
    );
  }

  private tick(): void {
    this.ops++;
    if (this.ops > OPS_LIMIT) throw new OpsLimitError();
  }

  private emit(
    options: {
      event: TraceEvent;
      description: string;
      line?: number;
      conditionResult?: boolean;
      outputChunk?: string;
    },
    force = false,
  ): void {
    if (this.quiet) return;
    if (!force && this.steps.length >= this.stepLimit) {
      this.truncated = true;
      throw new StepLimitError();
    }
    const line = options.line ?? this.currentLine;
    const frame = this.frames[this.frames.length - 1];
    const vars = this.buildRuntimeVars();
    const step: TraceStep = {
      index: this.steps.length,
      line,
      functionName: frame ? frame.name : 'main',
      depth: Math.max(0, this.frames.length - 1),
      event: options.event,
      description: truncateText(options.description, 90),
      vars,
      callStack: this.frames.map((f) => ({ functionName: f.name, line: f.line })),
      stdout: this.outputText,
    };
    const heap = this.heapSnapshot();
    if (heap) step.heap = heap;
    if (options.conditionResult !== undefined) step.conditionResult = options.conditionResult;
    if (options.outputChunk !== undefined) step.outputChunk = options.outputChunk;
    this.steps.push(step);
  }

  private visibleSlots(): Slot[] {
    const frame = this.frames[this.frames.length - 1];
    const ordered: Slot[] = [];
    const indexByName = new Map<string, number>();
    if (frame) {
      for (const scope of frame.scopes) {
        for (const slot of scope.vars.values()) {
          const index = indexByName.get(slot.name);
          if (index === undefined) {
            indexByName.set(slot.name, ordered.length);
            ordered.push(slot);
          } else {
            ordered[index] = slot;
          }
        }
      }
    }
    const localNames = new Set(ordered.map((slot) => slot.name));
    const result: Slot[] = [];
    for (const slot of this.globalScope.vars.values()) {
      if (!localNames.has(slot.name)) result.push(slot);
    }
    result.push(...ordered);
    return result;
  }

  private buildRuntimeVars(): RuntimeVar[] {
    const slots = this.visibleSlots();
    const nextSnapshot = new Map<string, string>();
    const vars: RuntimeVar[] = slots.map((slot) => {
      const valueText = formatValue(slot.value);
      nextSnapshot.set(slot.name, valueText);
      const entry: RuntimeVar = {
        name: slot.name,
        typeText: internText(slot.typeText),
        valueText: internText(valueText),
        category: slot.category,
        changed: this.lastSnapshot.get(slot.name) !== valueText,
      };
      if (slot.value.t === 'array') {
        entry.arrayValues = arrayElementTexts(slot.value);
      } else if (slot.value.t === 'map') {
        // map / set 在内存视图里也按「一格一个条目」画，键值一目了然
        entry.arrayValues = slot.value.entries.map((item) =>
          item.value === null ? formatValue(item.key, 1) : `${formatValue(item.key, 1)}: ${formatValue(item.value, 1)}`,
        );
      } else if (slot.value.t === 'pointer') {
        entry.pointerTarget = slot.value.target ? slot.value.label : slot.value.str !== undefined ? '(字符串常量)' : '空指针';
      }
      return entry;
    });
    this.lastSnapshot = nextSnapshot;
    return vars;
  }

  private printOutput(chunk: string, line: number): void {
    if (chunk.length === 0) return;
    this.outputText += chunk;
    this.emit({
      event: 'output',
      description: `输出 ${escapeText(chunk, 50)}`,
      line,
      outputChunk: chunk,
    });
  }

  /* ============================== 作用域 ============================== */

  private currentFrame(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }

  private currentScope(): Scope {
    const frame = this.currentFrame();
    if (!frame) return this.globalScope;
    return frame.scopes[frame.scopes.length - 1];
  }

  private lookupSlot(name: string, line: number): Slot {
    const frame = this.currentFrame();
    if (frame) {
      for (let i = frame.scopes.length - 1; i >= 0; i--) {
        const slot = frame.scopes[i].vars.get(name);
        if (slot) return slot;
      }
    }
    const globalSlot = this.globalScope.vars.get(name);
    if (globalSlot) return globalSlot;
    // 成员函数内部可以直接写字段名：回退到 this 对应对象的字段
    const self = frame?.thisValue;
    if (self && (self.fields.has(name) || this.ambiguousField(self.typeName, name))) {
      this.assertFieldNotAmbiguous(self.typeName, name, line);
      const fieldType = self.fieldTypes.get(name) ?? 'int';
      return {
        name,
        value: self.fields.get(name) ?? intValue(0, fieldType),
        ref: {
          get: () => self.fields.get(name) ?? intValue(0, fieldType),
          set: (next) => {
            self.fields.set(name, next);
          },
          label: `this->${name}`,
          typeText: fieldType,
        },
        typeText: fieldType,
        category: categoryOfValue(self.fields.get(name) ?? intValue(0, fieldType)),
        isConst: false,
      };
    }
    // 静态常量成员（`static const int kCapacity = 8`）在成员函数里可以直接写名字
    if (self) {
      const consts = this.staticConsts.get(lastSegment(self.typeName));
      const constant = consts?.get(name);
      if (constant !== undefined) return this.makeSlot(name, intValue(constant, 'int'), 'int', true);
    }
    throw new SimError(`变量 ${name} 在使用前没有声明。`, line);
  }

  private makeSlot(name: string, value: RValue, typeText: string, isConst = false): Slot {
    const slot: Slot = {
      name,
      value,
      ref: {
        get: () => slot.value,
        set: (next) => {
          slot.value = next;
        },
        label: name,
        typeText,
      },
      typeText,
      category: categoryOfValue(value),
      isConst,
    };
    return slot;
  }

  private declare(name: string, value: RValue, typeText: string, isConst = false): Slot {
    const slot = this.makeSlot(name, value, typeText, isConst);
    this.currentScope().vars.set(name, slot);
    return slot;
  }

  private declareGlobal(name: string, value: RValue, typeText: string): Slot {
    const slot = this.makeSlot(name, value, typeText);
    this.globalScope.vars.set(name, slot);
    return slot;
  }

  /**
   * 声明一个引用变量（`int& r = a;`）：不拷贝，直接绑到目标对象的 ref 上。
   * 之后 `r = 5` 改的就是 `a`，和 C++ 的别名语义一致。
   */
  private declareBound(name: string, target: Ref, typeText: string, isConst = false): Slot {
    const value = target.get();
    const slot: Slot = {
      name,
      value,
      ref: {
        get: () => target.get(),
        set: (next) => target.set(next),
        label: name,
        typeText,
      },
      typeText,
      category: categoryOfValue(value),
      isConst,
    };
    this.currentScope().vars.set(name, slot);
    return slot;
  }

  /* ============================== 全局变量初始化 ============================== */

  private initGlobals(): void {
    for (const decl of this.program.globals) {
      const base = this.concretizeType(decl.typeSpec.base, decl.typeSpec.text);
      for (const declarator of decl.declarators) {
        if (!declarator.name) continue;
        const typeText = this.declTypeText(decl.typeSpec.text, declarator);
        const value = this.instantiateDeclarator(
          declarator,
          base,
          typeText,
        );
        this.declareGlobal(declarator.name, value, typeText);
      }
    }
  }

  /* ============================== 语句执行 ============================== */

  private execStmt(stmt: StmtNode): Signal {
    // 每条语句结束都清理本语句产生的临时对象（相当于「完整表达式」边界）。
    // 嵌套语句用各自的 mark，已清理过的不会被重复析构。
    const mark = this.temps.length;
    try {
      return this.execStmtInner(stmt);
    } finally {
      this.releaseTemps(mark);
    }
  }

  private execStmtInner(stmt: StmtNode): Signal {
    this.tick();
    this.currentLine = stmt.line;
    const frame = this.currentFrame();
    if (frame) frame.line = stmt.line;

    switch (stmt.kind) {
      case 'block': {
        const scope = new Scope(this.currentScope());
        const current = this.currentFrame();
        if (!current) return NORMAL;
        current.scopes.push(scope);
        try {
          for (const inner of stmt.statements) {
            const signal = this.execStmt(inner);
            if (signal.kind !== 'normal') return signal;
          }
          return NORMAL;
        } finally {
          current.scopes.pop();
          this.destroyScope(scope);
        }
      }
      case 'decl':
        this.execDecl(stmt);
        return NORMAL;
      case 'expr':
        this.execExprStatement(stmt.expr);
        return NORMAL;
      case 'if': {
        const condition = this.evalExpr(stmt.cond);
        const result = truthy(condition);
        this.emit({
          event: 'branch',
          description: `判断 ${exprToText(stmt.cond)} → ${result ? '真' : '假'}`,
          line: stmt.line,
          conditionResult: result,
        });
        if (result) return this.execStmt(stmt.then);
        if (stmt.else) return this.execStmt(stmt.else);
        return NORMAL;
      }
      case 'while':
        return this.execWhile(stmt);
      case 'doWhile':
        return this.execDoWhile(stmt);
      case 'for':
        return this.execFor(stmt);
      case 'rangeFor':
        return this.execRangeFor(stmt);
      case 'switch':
        return this.execSwitch(stmt);
      case 'return': {
        let value = stmt.expr ? this.evalExpr(stmt.expr) : voidValue();
        // 按值返回类对象时必须「当场」拷贝：等到函数帧退出再拷，
        // 局部对象的析构已经把堆缓冲 delete 掉了（会读到 \0）。
        const fn = this.currentFrame()?.fn;
        const byValue = !(fn && fn.returnType.includes('&'));
        if (value.t === 'struct' && byValue) {
          // return T(...) / return a + b：返回值本身就是刚构造的临时对象，
          // 直接移交所有权（等价于 C++17 的拷贝省略），不再多构造一次。
          if (this.isTemp(value)) this.adoptTemp(value);
          else value = this.copyObject(value, stmt.line);
        }
        // `int& at(...)`：把「返回的那个左值」也带出去，`at(v,1) = 9` 才写得进去
        let ref: Ref | undefined;
        if (!byValue && stmt.expr && isSimpleLvalue(stmt.expr)) {
          try {
            ref = this.resolveLValue(stmt.expr);
          } catch {
            ref = undefined;
          }
        }
        this.emit({
          event: 'return',
          description: stmt.expr ? `返回 ${formatValue(value)}` : '返回（void）',
          line: stmt.line,
        });
        return { kind: 'return', value, ref };
      }
      case 'break':
        this.emit({ event: 'break', description: '跳出当前循环 / switch', line: stmt.line });
        return { kind: 'break' };
      case 'continue':
        this.emit({ event: 'continue', description: '进入下一次循环', line: stmt.line });
        return { kind: 'continue' };
      case 'empty':
        return NORMAL;
      case 'goto':
        throw new SimError('goto 语句暂不支持单步执行。', stmt.line, 'unsupported');
      case 'labeled':
        return this.execStmt(stmt.statement);
      case 'unknown':
        throw new SimError(`无法解析的语句：${stmt.text}`, stmt.line, 'unsupported');
      default:
        return NORMAL;
    }
  }

  private execExprStatement(expr: ExprNode): void {
    const stepsBefore = this.steps.length;
    if (expr.kind === 'assign') {
      const value = this.evalExpr(expr);
      this.emit({
        event: 'assign',
        description: `执行 ${exprToText(expr)}，${exprToText(expr.target)} 变为 ${formatValue(value)}`,
        line: expr.line,
      });
      return;
    }
    if (expr.kind === 'unary' && (expr.op === '++' || expr.op === '--')) {
      const value = this.evalExpr(expr);
      this.emit({
        event: 'assign',
        description: `执行 ${exprToText(expr)}，${exprToText(expr.operand)} 变为 ${formatValue(value)}`,
        line: expr.line,
      });
      return;
    }
    if (expr.kind === 'postfix') {
      this.evalExpr(expr);
      // 后缀自增表达式的值是自增前的那个，所以这里重新读一次变量的当前值再报
      let after: RValue | undefined;
      try {
        after = this.resolveLValue(expr.operand).get();
      } catch {
        after = undefined;
      }
      this.emit({
        event: 'assign',
        description: after
          ? `执行 ${exprToText(expr)}，${exprToText(expr.operand)} 变为 ${formatValue(after)}`
          : `执行 ${exprToText(expr)}`,
        line: expr.line,
      });
      return;
    }
    this.evalExpr(expr);
    if (this.steps.length === stepsBefore) {
      this.emit({
        event: 'step',
        description: `执行 ${truncateText(exprToText(expr), 50)}`,
        line: expr.line,
      });
    }
  }

  private execDecl(stmt: StmtNode & { kind: 'decl' }): void {
    const typeSpec = stmt.decl.typeSpec;
    // `Stack<int> stack;` 先把类模板展开成具体类，后面全按普通类处理
    const base = this.concretizeType(typeSpec.base, typeSpec.text);
    for (const declarator of stmt.decl.declarators) {
      if (!declarator.name) continue;
      const typeText = this.declTypeText(typeSpec.text, declarator);
      // 引用变量（`int& r = a`）不拷贝，直接绑定到初始化式指向的那个对象
      if (declarator.isReference && declarator.init) {
        const target = this.argRef(declarator.init);
        if (target) {
          this.declareBound(declarator.name, target, typeText, typeSpec.isConst);
          this.emit({
            event: 'declare',
            description: `声明 ${declarator.name}，引用 ${exprToText(declarator.init)} = ${formatValue(target.get())}`,
            line: declarator.line,
          });
          continue;
        }
      }
      const value = this.instantiateDeclarator(declarator, base, typeText);
      // `const BigInt* p` 的 const 修饰的是指向的内容，指针本身仍可改指
      const pointerMutable = declarator.pointerDepth > 0 || declarator.isReference;
      this.declare(declarator.name, value, typeText, typeSpec.isConst && !pointerMutable);
      this.emit({
        event: 'declare',
        description: declarator.init
          ? `声明 ${declarator.name} = ${formatValue(value)}`
          : `声明 ${declarator.name}`,
        line: declarator.line,
      });
    }
  }

  private execWhile(stmt: StmtNode & { kind: 'while' }): Signal {
    let iteration = 0;
    for (;;) {
      const condition = this.evalExpr(stmt.cond);
      const result = truthy(condition);
      iteration++;
      this.emit({
        event: 'loop',
        description: `第 ${iteration} 次判断 ${exprToText(stmt.cond)} → ${result ? '真' : '假'}`,
        line: stmt.line,
        conditionResult: result,
      });
      if (!result) return NORMAL;
      const signal = this.execStmt(stmt.body);
      if (signal.kind === 'break') return NORMAL;
      if (signal.kind === 'return') return signal;
      // continue → 进入下一次判断
    }
  }

  private execDoWhile(stmt: StmtNode & { kind: 'doWhile' }): Signal {
    let iteration = 0;
    for (;;) {
      const signal = this.execStmt(stmt.body);
      if (signal.kind === 'break') return NORMAL;
      if (signal.kind === 'return') return signal;
      const condition = this.evalExpr(stmt.cond);
      const result = truthy(condition);
      iteration++;
      this.emit({
        event: 'loop',
        description: `第 ${iteration} 次判断 ${exprToText(stmt.cond)} → ${result ? '真' : '假'}`,
        line: stmt.line,
        conditionResult: result,
      });
      if (!result) return NORMAL;
    }
  }

  private execFor(stmt: StmtNode & { kind: 'for' }): Signal {
    const scope = new Scope(this.currentScope());
    const frame = this.currentFrame();
    if (!frame) return NORMAL;
    frame.scopes.push(scope);
    try {
      if (stmt.init) {
        const signal = this.execStmt(stmt.init);
        if (signal.kind !== 'normal') return signal;
      }
      for (const expr of stmt.initExprs) this.evalExpr(expr);

      let iteration = 0;
      for (;;) {
        let result = true;
        if (stmt.cond) {
          const condition = this.evalExpr(stmt.cond);
          result = truthy(condition);
        }
        iteration++;
        this.emit({
          event: 'loop',
          description: stmt.cond
            ? `第 ${iteration} 次判断 ${exprToText(stmt.cond)} → ${result ? '真' : '假'}`
            : `第 ${iteration} 次循环`,
          line: stmt.line,
          conditionResult: result,
        });
        if (!result) return NORMAL;
        const signal = this.execStmt(stmt.body);
        if (signal.kind === 'break') return NORMAL;
        if (signal.kind === 'return') return signal;
        for (const update of stmt.update) {
          const value = this.evalExpr(update);
          this.emit({
            event: 'assign',
            description: `执行 ${exprToText(update)}，${this.updateTargetText(update)}变为 ${formatValue(value)}`,
            line: update.line,
          });
        }
      }
    } finally {
      frame.scopes.pop();
    }
  }

  private updateTargetText(update: ExprNode): string {
    if (update.kind === 'assign') return `${exprToText(update.target)} `;
    if (update.kind === 'postfix') return `${exprToText(update.operand)} `;
    if (update.kind === 'unary' && (update.op === '++' || update.op === '--')) return `${exprToText(update.operand)} `;
    return '';
  }

  private execRangeFor(stmt: StmtNode & { kind: 'rangeFor' }): Signal {
    const iterable = this.evalExpr(stmt.iterable);
    if (iterable.t === 'map') return this.execMapRangeFor(stmt, iterable);
    let items: RValue[];
    if (iterable.t === 'array') items = iterable.elems;
    else if (iterable.t === 'string') {
      items = Array.from(iterable.v).map((ch) => intValue(ch.charCodeAt(0), 'char'));
    } else {
      throw new SimError('范围 for 只能遍历数组或字符串。', stmt.line, 'unsupported');
    }
    const elemTypeText = iterable.t === 'array' ? iterable.elemType : 'int';
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const scope = new Scope(this.currentScope());
      const frame = this.currentFrame();
      if (!frame) return NORMAL;
      frame.scopes.push(scope);
      try {
        // `for (int& x : v)` 绑到元素本身，改 x 就是改容器里的元素
        if (stmt.byReference && iterable.t === 'array') {
          const elementRef = arrayElementRef(iterable, index, `${stmt.varName}`);
          this.declareBound(stmt.varName, elementRef, elemTypeText || 'int');
        } else {
          this.declare(stmt.varName, item, elemTypeText || 'int');
        }
        this.emit({
          event: 'declare',
          description: `遍历元素 ${stmt.varName} = ${formatValue(item)}`,
          line: stmt.line,
        });
        const signal = this.execStmt(stmt.body);
        if (signal.kind === 'break') return NORMAL;
        if (signal.kind === 'return') return signal;
      } finally {
        frame.scopes.pop();
      }
    }
    return NORMAL;
  }

  /** `for (const auto& p : m)`：map 每次给一个 pair，set 每次给一个键 */
  private execMapRangeFor(stmt: StmtNode & { kind: 'rangeFor' }, map: MapValue): Signal {
    const entryType = map.kind === 'set' ? map.keyType : `pair<${map.keyType}, ${map.valueType}>`;
    // 复制一份条目名单：循环体里 erase 不至于打乱遍历
    const entries = map.entries.slice();
    for (const entry of entries) {
      const item = this.mapIterationItem(map, entry);
      const frame = this.currentFrame();
      if (!frame) return NORMAL;
      const scope = new Scope(this.currentScope());
      frame.scopes.push(scope);
      try {
        if (stmt.byReference) this.declareBound(stmt.varName, { get: () => item, set: () => undefined, label: stmt.varName, typeText: entryType }, entryType);
        else this.declare(stmt.varName, item, entryType);
        this.emit({
          event: 'declare',
          description: `遍历元素 ${stmt.varName} = ${formatValue(item)}`,
          line: stmt.line,
        });
        const signal = this.execStmt(stmt.body);
        if (stmt.byReference) this.syncMapItem(map, entry, item);
        if (signal.kind === 'break') return NORMAL;
        if (signal.kind === 'return') return signal;
      } finally {
        frame.scopes.pop();
      }
    }
    return NORMAL;
  }

  private execSwitch(stmt: StmtNode & { kind: 'switch' }): Signal {
    const target = this.evalExpr(stmt.expr);
    let startIndex = -1;
    let defaultIndex = -1;
    for (let i = 0; i < stmt.cases.length; i++) {
      const caseNode = stmt.cases[i];
      if (caseNode.isDefault) {
        defaultIndex = i;
        continue;
      }
      if (!caseNode.valueExpr) continue;
      if (startIndex >= 0) continue;
      const caseValue = this.evalExpr(caseNode.valueExpr);
      if (this.valuesEqual(target, caseValue)) startIndex = i;
    }
    if (startIndex < 0) startIndex = defaultIndex;
    this.emit({
      event: 'branch',
      description:
        startIndex >= 0
          ? `switch(${exprToText(stmt.expr)}) 匹配 ${stmt.cases[startIndex].label}`
          : `switch(${exprToText(stmt.expr)}) 没有匹配的 case`,
      line: stmt.line,
      conditionResult: startIndex >= 0,
    });
    if (startIndex < 0) return NORMAL;
    for (let i = startIndex; i < stmt.cases.length; i++) {
      for (const inner of stmt.cases[i].statements) {
        const signal = this.execStmt(inner);
        if (signal.kind === 'break') return NORMAL;
        if (signal.kind === 'return') return signal;
        if (signal.kind === 'continue') return signal;
      }
    }
    return NORMAL;
  }

  private valuesEqual(left: RValue, right: RValue): boolean {
    if (left.t === 'string' || right.t === 'string') {
      return (charsOf(left) ?? formatValue(left)) === (charsOf(right) ?? formatValue(right));
    }
    return asNumber(left) === asNumber(right);
  }

  /* ============================== 声明实例化 ============================== */

  private declTypeText(baseText: string, declarator: { pointerDepth: number; isReference: boolean }): string {
    let text = baseText;
    if (declarator.pointerDepth > 0) text += '*'.repeat(declarator.pointerDepth);
    if (declarator.isReference) text += '&';
    return text;
  }

  private instantiateDeclarator(
    declarator: { name: string; pointerDepth: number; isReference: boolean; arrayDims: (number | null)[]; init?: ExprNode },
    base: string,
    typeText: string,
  ): RValue {
    if (declarator.arrayDims.length > 0) {
      const dims = declarator.arrayDims.map((d) => (d === null ? 0 : d));
      return this.createArray(base, declarator.pointerDepth, dims, declarator.init);
    }
    if (declarator.pointerDepth > 0) {
      if (!declarator.init) return nullValue();
      const value = this.evalExpr(declarator.init);
      return this.coercePointer(value, base);
    }
    // std::vector<T> 用动态数组承载：push_back / size / begin / end 都能逐步看到
    const vectorElem = vectorElemType(typeText);
    if (vectorElem) return this.createVectorValue(vectorElem, declarator.init, typeText);
    // 关联容器 / 容器适配器 / pair
    const assoc = assocTypeOf(typeText);
    if (assoc) return this.createMapValue(assoc, declarator.init, typeText);
    const adapter = adapterTypeOf(typeText);
    if (adapter) {
      return this.createAdapterValue(adapter.adapter, adapter.elemType, declarator.init, typeText);
    }
    const pairTypes = pairTypeOf(typeText);
    if (pairTypes) return this.createPairValue(pairTypes.first, pairTypes.second, declarator.init, typeText);
    if (isStringType(base) && !isPointerType(typeText)) {
      if (!declarator.init) return stringValue('', base);
      return coerceValue(this.evalExpr(declarator.init), typeText);
    }
    const className = lastSegment(base);
    if (this.classMap.has(className)) {
      const cls = this.classMap.get(className) as ClassDeclNode;
      if (declarator.init && declarator.init.kind === 'initlist') {
        return this.createStructValue(cls.name, declarator.init);
      }
      if (declarator.init && declarator.init.kind === 'call') {
        const args = declarator.init.args.map((arg) => this.evalExpr(arg));
        return this.constructObject(cls.name, args, declarator.init.line);
      }
      if (declarator.init) {
        // Point c = a + b; 采用表达式的值；同类对象优先走拷贝构造，保证深拷贝
        const evaluated = this.evalExpr(declarator.init);
        if (evaluated.t === 'struct') {
          // 用基类变量接派生类对象 = 对象切片（多态信息在这里丢掉）
          return this.sliceTo(evaluated, cls.name, declarator.init.line);
        }
        return this.constructObject(cls.name, [], declarator.init.line);
      }
      // 无初始化器时，如果有默认构造函数也要执行一次
      return this.constructObject(cls.name, [], 1);
    }
    if (!declarator.init) return this.defaultScalar(base, typeText);
    return coerceValue(this.evalExpr(declarator.init), typeText);
  }

  /** `std::vector<T>` 的运行时表示：一个可增长的数组 */
  private createVectorValue(elemType: string, init: ExprNode | undefined, typeText: string): ArrayValue {
    const items = init && init.kind === 'initlist' ? init.items : [];
    const elems = items.map((item) =>
      item.kind === 'initlist' ? this.createVectorValue(elemType, item, typeText) : this.coerceVectorElement(item, elemType),
    );
    return { t: 'array', elems, dims: [elems.length], elemType, typeText };
  }

  private coerceVectorElement(expr: ExprNode, elemType: string): RValue {
    const value = this.evalExpr(expr);
    if (isStringType(elemType)) return stringValue(this.toText(value), elemType);
    return coerceValue(value, elemType);
  }

  /* ---------- std::map / std::set / std::pair / 容器适配器 ---------- */

  /** `std::map<K, V> m = {{"a", 1}};` */
  private createMapValue(
    info: AssocInfo,
    init: ExprNode | undefined,
    typeText: string,
  ): MapValue {
    const value: MapValue = {
      t: 'map',
      kind: info.kind,
      keyType: info.keyType,
      valueType: info.valueType,
      typeText,
      entries: [],
    };
    const items = init && init.kind === 'initlist' ? init.items : [];
    for (const item of items) {
      if (info.kind === 'set') {
        this.mapInsertEntry(value, this.coerceKey(item, info.keyType), null);
        continue;
      }
      if (item.kind !== 'initlist' || item.items.length < 2) continue;
      const key = this.coerceKey(item.items[0], info.keyType);
      const entryValue = coerceValue(this.evalExpr(item.items[1]), info.valueType);
      this.mapInsertEntry(value, key, entryValue);
    }
    return value;
  }

  /** `std::stack<int> s;` / `queue` / `priority_queue`：底层还是数组，只是进出口不同 */
  private createAdapterValue(
    adapter: 'stack' | 'queue' | 'priority_queue',
    elemType: string,
    init: ExprNode | undefined,
    typeText: string,
  ): ArrayValue {
    const items = init && init.kind === 'initlist' ? init.items : [];
    const elems = items.map((item) => this.coerceVectorElement(item, elemType));
    const value: ArrayValue = { t: 'array', elems, dims: [elems.length], elemType, typeText, adapter };
    if (adapter === 'priority_queue') this.sortAdapter(value);
    return value;
  }

  /** 优先队列：按「最大堆」语义保持有序，top() 取末尾（最大）的那个 */
  private sortAdapter(array: ArrayValue): void {
    array.elems.sort((left, right) => this.compareForSort(left, right));
  }

  private createPairValue(
    first: string,
    second: string,
    init: ExprNode | undefined,
    typeText: string,
  ): StructValue {
    const pair = this.createStructValue('pair', undefined);
    pair.typeText = typeText;
    pair.fields.set('first', this.defaultScalar(first, first));
    pair.fieldTypes.set('first', first);
    pair.fields.set('second', this.defaultScalar(second, second));
    pair.fieldTypes.set('second', second);
    if (!init) return pair;
    const items = init.kind === 'initlist' ? init.items : init.kind === 'call' ? init.args : [];
    if (items[0]) pair.fields.set('first', coerceValue(this.evalExpr(items[0]), first));
    if (items[1]) pair.fields.set('second', coerceValue(this.evalExpr(items[1]), second));
    return pair;
  }

  private coerceKey(expr: ExprNode, keyType: string): RValue {
    const value = this.evalExpr(expr);
    if (isStringType(keyType)) return stringValue(this.toText(value), keyType);
    return coerceValue(value, keyType);
  }

  /** 有序表里找键：找不到返回 -1（map / set 都按 key 升序排着） */
  private mapKeyIndex(map: MapValue, key: RValue): number {
    return map.entries.findIndex((entry) => this.valuesEqual(entry.key, key));
  }

  /** 插入 / 覆盖一个条目，保持按 key 升序 */
  private mapInsertEntry(map: MapValue, key: RValue, value: RValue | null): boolean {
    const index = this.mapKeyIndex(map, key);
    if (index >= 0) {
      if (value !== null) map.entries[index].value = value;
      return false;
    }
    const entry: MapEntryValue = { key, value };
    const at = map.entries.findIndex((item) => this.compareForSort(key, item.key) < 0);
    if (at < 0) map.entries.push(entry);
    else map.entries.splice(at, 0, entry);
    return true;
  }

  /** 读取 m[k]：map 里没有这个键就按 C++ 语义插入一个默认值 */
  private mapIndexRead(map: MapValue, keyExpr: ExprNode, line: number): RValue {
    if (map.kind === 'set') throw new SimError('std::set 不能用下标访问，请用 count() / insert()。', line, 'unsupported');
    const key = this.coerceKey(keyExpr, map.keyType);
    const index = this.mapKeyIndex(map, key);
    if (index >= 0) return map.entries[index].value ?? this.defaultScalar(map.valueType, map.valueType);
    const empty = this.defaultScalar(map.valueType, map.valueType);
    this.mapInsertEntry(map, key, empty);
    return empty;
  }

  /** `m[k] = v`：拿到条目 value 的引用，缺键时先插入 */
  private mapIndexRef(map: MapValue, keyExpr: ExprNode, label: string, line: number): Ref {
    if (map.kind === 'set') throw new SimError('std::set 不能用下标访问，请用 insert() / count()。', line, 'unsupported');
    const key = this.coerceKey(keyExpr, map.keyType);
    if (this.mapKeyIndex(map, key) < 0) {
      this.mapInsertEntry(map, key, this.defaultScalar(map.valueType, map.valueType));
    }
    const entry = map.entries[this.mapKeyIndex(map, key)];
    return {
      get: () => entry.value ?? this.defaultScalar(map.valueType, map.valueType),
      set: (value) => {
        entry.value = value;
      },
      label,
      typeText: map.valueType,
    };
  }

  /** map / set 的成员函数 */
  private evalMapCall(map: MapValue, method: string, expr: ExprNode & { kind: 'call' }): RValue | undefined {
    const keyArg = (): RValue => this.coerceKey(expr.args[0], map.keyType);
    switch (method) {
      case 'size':
        return intValue(map.entries.length);
      case 'empty':
        return boolValue(map.entries.length === 0);
      case 'clear':
        map.entries.length = 0;
        return voidValue();
      case 'count':
        if (!expr.args[0]) return intValue(0);
        return intValue(this.mapKeyIndex(map, keyArg()) >= 0 ? 1 : 0);
      case 'contains':
        if (!expr.args[0]) return boolValue(false);
        return boolValue(this.mapKeyIndex(map, keyArg()) >= 0);
      case 'at': {
        if (!expr.args[0]) throw new SimError('at() 需要一个键。', expr.line);
        const index = this.mapKeyIndex(map, keyArg());
        if (index < 0) {
          throw new SimError(`map::at 找不到这个键（运行时会抛 out_of_range）。`, expr.line, 'runtime');
        }
        return map.entries[index].value ?? intValue(0, map.valueType);
      }
      case 'erase':
        if (!expr.args[0]) return intValue(0);
        {
          const index = this.mapKeyIndex(map, keyArg());
          if (index < 0) return intValue(0);
          map.entries.splice(index, 1);
          return intValue(1);
        }
      case 'insert':
        if (map.kind === 'set') {
          const key = keyArg();
          return boolValue(this.mapInsertEntry(map, key, null));
        }
        {
          const arg = expr.args[0];
          if (!arg) return boolValue(false);
          const pair = this.evalExpr(arg);
          if (pair.t !== 'struct' || !pair.fields.has('first')) {
            throw new SimError('insert() 需要一个键值对，例如 m.insert({"a", 1})。', expr.line, 'unsupported');
          }
          const key = coerceValue(pair.fields.get('first') as RValue, map.keyType);
          const value = coerceValue(pair.fields.get('second') as RValue, map.valueType);
          return boolValue(this.mapInsertEntry(map, key, value));
        }
      case 'begin':
      case 'end':
      case 'find':
        throw new SimError(
          `map / set 的迭代器（${method}()）暂不支持单步执行，请用 count() / contains() / at() 或范围 for。`,
          expr.line,
          'unsupported',
        );
      default:
        return undefined;
    }
  }

  /** 范围 for 遍历 map / set 时的元素：map 给出 pair，set 给出键 */
  private mapIterationItem(map: MapValue, entry: MapEntryValue): RValue {
    if (map.kind === 'set') return entry.key;
    const pair = this.createStructValue('pair', undefined);
    pair.typeText = `pair<${map.keyType}, ${map.valueType}>`;
    pair.fields.set('first', entry.key);
    pair.fieldTypes.set('first', map.keyType);
    pair.fields.set('second', entry.value ?? this.defaultScalar(map.valueType, map.valueType));
    pair.fieldTypes.set('second', map.valueType);
    return pair;
  }

  /** 按引用遍历时，循环体改过的 pair 要写回表里 */
  private syncMapItem(map: MapValue, entry: MapEntryValue, item: RValue): void {
    if (map.kind === 'set' || item.t !== 'struct') return;
    const nextKey = item.fields.get('first');
    const nextValue = item.fields.get('second');
    if (nextValue !== undefined) entry.value = nextValue;
    if (nextKey && !this.valuesEqual(nextKey, entry.key)) {
      map.entries.sort((left, right) => this.compareForSort(left.key, right.key));
      entry.key = nextKey;
    }
  }

  /** begin() / end()：指向同一个数组的偏移指针，std::sort 靠它确定区间 */
  private vectorIterator(array: ArrayValue, offset: number, line: number): PointerValue {
    return {
      t: 'pointer',
      label: `${array.elemType} 迭代器`,
      target: null,
      elemType: array.elemType,
      typeText: `${array.elemType}*`,
      array,
      offset,
    };
  }

  private coercePointer(value: RValue, base: string): RValue {
    if (value.t === 'array') return arrayToPointer(value, 'arr');
    if (value.t === 'pointer' || value.t === 'null') return value;
    if (value.t === 'string') {
      return {
        t: 'pointer',
        label: '(字符串常量)',
        target: null,
        elemType: 'char',
        typeText: `${base}*`,
        offset: 0,
        str: value.v,
      };
    }
    return nullValue();
  }

  private defaultScalar(base: string, typeText: string): RValue {
    if (isStringType(typeText)) return stringValue('', typeText);
    if (isCharType(typeText)) return intValue(0, typeText);
    if (isFloatType(typeText)) return floatValue(0, typeText);
    if (/bool/.test(typeText)) return boolValue(false);
    return intValue(0, typeText || base || 'int');
  }

  private createArray(
    base: string,
    pointerDepth: number,
    dims: number[],
    init: ExprNode | undefined,
  ): ArrayValue {
    const className = lastSegment(base);
    const cls = this.classMap.get(className);
    const elemType = pointerDepth > 0 ? `${base}*` : base;
    let resolvedDims = dims.slice();
    if (resolvedDims.length === 0) resolvedDims = [0];
    if (init) {
      if (init.kind === 'initlist' && resolvedDims[0] <= 0) resolvedDims[0] = init.items.length;
      if (init.kind === 'string' && resolvedDims[0] <= 0) resolvedDims[0] = Array.from(init.value).length + 1;
    }
    resolvedDims = resolvedDims.map((d) => (d > 0 ? d : 1));

    // 多维数组按行嵌套，这样 a[0][2] 与 a[0] 都能自然工作
    if (resolvedDims.length > 1) {
      const rows = resolvedDims[0];
      const initItems = init && init.kind === 'initlist' ? init.items : [];
      const elems: RValue[] = [];
      for (let i = 0; i < rows; i++) {
        elems.push(this.createArray(base, pointerDepth, resolvedDims.slice(1), initItems[i]));
      }
      return {
        t: 'array',
        elems,
        dims: resolvedDims,
        elemType: pointerDepth > 0 ? `${base}*` : base,
        typeText: `${base}${resolvedDims.map((d) => `[${d}]`).join('')}`,
      };
    }

    const total = countElements(resolvedDims);
    const elems: RValue[] = new Array(total);

    const makeDefault = (): RValue => {
      // `Circle* arr[2]` 里的元素是指针，不是类对象
      if (cls && pointerDepth === 0) return this.createStructValue(cls.name, undefined);
      if (pointerDepth > 0) return nullValue();
      return this.defaultScalar(base, elemType);
    };
    for (let i = 0; i < total; i++) elems[i] = makeDefault();

    if (init) {
      if (init.kind === 'string' && isCharType(elemType)) {
        const chars = Array.from(init.value);
        for (let i = 0; i < total; i++) elems[i] = intValue(i < chars.length ? chars[i].charCodeAt(0) : 0, elemType);
      } else if (cls && pointerDepth === 0) {
        if (init.kind === 'initlist') {
          for (let i = 0; i < Math.min(total, init.items.length); i++) {
            const item = init.items[i];
            if (item.kind === 'initlist') elems[i] = this.createStructValue(cls.name, item);
            else elems[i] = this.createStructValue(cls.name, undefined);
          }
        }
      } else if (isCharType(elemType) && resolvedDims.length >= 2 && init.kind === 'initlist' && init.items.every((item) => item.kind === 'string')) {
        const rowLength = resolvedDims[resolvedDims.length - 1];
        init.items.forEach((item, row) => {
          if (item.kind !== 'string') return;
          const chars = Array.from(item.value);
          for (let col = 0; col < rowLength; col++) {
            const index = row * rowLength + col;
            if (index < total) {
              elems[index] = intValue(col < chars.length ? chars[col].charCodeAt(0) : 0, elemType);
            }
          }
        });
      } else {
        const flat: ExprNode[] = [];
        const flatten = (expr: ExprNode): void => {
          if (expr.kind === 'initlist') {
            for (const item of expr.items) flatten(item);
            return;
          }
          flat.push(expr);
        };
        if (init.kind === 'initlist') flatten(init);
        for (let i = 0; i < Math.min(total, flat.length); i++) {
          elems[i] = pointerDepth > 0
            ? this.coercePointer(this.evalExpr(flat[i]), base)
            : coerceValue(this.evalExpr(flat[i]), elemType);
        }
      }
    }

    return {
      t: 'array',
      elems,
      dims: resolvedDims,
      elemType,
      typeText: `${base}${resolvedDims.map((d) => `[${d}]`).join('')}`,
    };
  }

  /** 找非成员运算符重载：优先第二个参数类型匹配 */
  private findFreeOperator(name: string, rightType: string | null): FuncDeclNode | undefined {
    const candidates = this.freeFunctions.get(name);
    if (!candidates || candidates.length === 0) return undefined;
    if (rightType) {
      const matched = candidates.find(
        (fn) => lastSegment(baseTypeName(fn.params[1]?.base ?? '')) === lastSegment(rightType),
      );
      if (matched) return matched;
    }
    return candidates[0];
  }

  /**
   * 运算符重载分派：先试成员方法，再试非成员函数。
   * 返回 undefined 表示没有重载，调用方继续走内置语义。
   */
  private tryOperatorOverload(
    op: string,
    left: RValue,
    right: RValue,
    line: number,
  ): RValue | undefined {
    const methodName = `operator ${op}`;
    if (left.t === 'struct') {
      const member = this.findMethod(left.typeName, methodName, [right]);
      if (member) return this.callFunction(member, [right], line, left);
    }
    if (left.t !== 'struct' && right.t !== 'struct') return undefined;
    const free = this.findFreeOperator(methodName, right.t === 'struct' ? right.typeName : null);
    if (!free) return undefined;
    return this.callFunction(free, [left, right], line);
  }

  /** 调用 operator<<(ostream&, const T&)，把输出「接」回 cout 的缓冲 */
  private runStreamOperator(value: StructValue, line: number): string | null {
    const fn = this.findFreeOperator('operator <<', value.typeName);
    if (!fn) return null;
    const previous = this.captureSink;
    this.captureSink = [];
    try {
      this.callFunction(fn, [voidValue(), value], line);
      return this.captureSink.join('');
    } finally {
      this.captureSink = previous;
    }
  }

  /** 在类里找可调用的方法：参数个数完全匹配优先，其次看默认参数 */
  /**
   * 类外定义的成员函数拿不到类内声明里的默认参数（`BigInt(size_t v = 0);`
   * 只有声明带 `= 0`），这里把默认值补到实现上，否则 `BigInt t;` 会找不到构造函数。
   */
  private inheritDefaults(fn: FuncDeclNode, prototypes: FuncDeclNode[]): FuncDeclNode {
    if (!fn.params.some((param) => !param.defaultValue)) return fn;
    const proto = prototypes.find(
      (candidate) =>
        candidate !== fn &&
        candidate.params.length === fn.params.length &&
        candidate.params.some((param) => param.defaultValue),
    );
    if (!proto) return fn;
    const params = fn.params.map((param, index) =>
      param.defaultValue ? param : { ...param, defaultValue: proto.params[index]?.defaultValue },
    );
    return { ...fn, params };
  }

  /** 默认参数在 AST 里是源码文本，这里把它变成运行期值（只覆盖常见字面量） */
  private evalDefaultParam(param: ParamNode): RValue {
    const text = (param.defaultValue ?? '').trim();
    if (!text) return this.defaultScalar(baseTypeName(param.typeText), param.typeText);
    return this.evalLiteralText(text, param.typeText);
  }

  /**
   * 把源码里的字面量文本变成运行期值。
   * 默认参数与成员默认值在 AST 里都只留了文本，不走这条路就只能瞎猜。
   */
  private evalLiteralText(text: string, typeText: string): RValue {
    if (!text) return this.defaultScalar(baseTypeName(typeText), typeText);
    if (text === 'nullptr' || text === 'NULL') return nullValue();
    if (text === 'true' || text === 'false') return boolValue(text === 'true');
    if (/^-?0x[0-9a-fA-F]+$/.test(text)) return intValue(parseInt(text, 16), typeText);
    if (/^-?\d+$/.test(text)) return intValue(Number(text), typeText);
    if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(text)) return floatValue(Number(text), typeText);
    if (text.startsWith("'")) {
      const inner = text.slice(1, -1);
      const char = inner === '\\0' ? 0 : inner.replace(/^\\/, '').charCodeAt(0);
      return intValue(char, typeText);
    }
    if (text.startsWith('"')) return stringValue(text.slice(1, -1), typeText);
    return this.defaultScalar(baseTypeName(typeText), typeText);
  }

  private scoreParams(method: FuncDeclNode, args: RValue[]): number {
    let score = 0;
    for (let i = 0; i < args.length && i < method.params.length; i++) {
      const param = method.params[i];
      const arg = args[i];
      const typeText = param.typeText;
      if (param.isPointer || typeText.includes('*')) {
        if (arg.t === 'string') score += 4;
        else if (arg.t === 'pointer' || arg.t === 'null') score += 4;
        else score -= 2;
        continue;
      }
      if (param.isReference || typeText.includes('&')) {
        if (arg.t === 'struct') {
          score += lastSegment(baseTypeName(typeText)) === lastSegment(arg.typeName) ? 5 : 1;
        }
        continue;
      }
      if (isStringType(typeText)) {
        score += arg.t === 'string' ? 5 : -2;
        continue;
      }
      if (isFloatType(typeText)) {
        score += arg.t === 'float' ? 4 : arg.t === 'int' ? 1 : -2;
        continue;
      }
      if (arg.t === 'int') score += 3;
      else if (arg.t === 'struct') score -= 3;
    }
    return score;
  }

  /**
   * 找方法：先在本类找，找不到再沿继承链往上（Dog → Animal）。
   * 从「动态类型」出发调用就是虚函数分派，从「静态类型」出发就是非虚的静态绑定。
   */
  private findMethod(
    className: string,
    name: string,
    args: RValue[] | number,
  ): FuncDeclNode | undefined {
    for (const ancestor of this.classChain(className)) {
      const found = this.findMethodIn(ancestor, name, args);
      if (found) return found;
    }
    return undefined;
  }

  /** 只在指定类里找方法（不看基类），用于析构链、构造链 */
  private findMethodIn(
    className: string,
    name: string,
    args: RValue[] | number,
  ): FuncDeclNode | undefined {
    const argCount = typeof args === 'number' ? args : args.length;
    const cls = this.classMap.get(lastSegment(className));
    if (!cls) return undefined;
    const key = `${lastSegment(className)}::${name}`;
    const prototypes = cls.methods.filter((method) => method.name === name);
    const candidates = [
      ...cls.methods.filter((method) => method.name === name && method.body),
      ...(this.methodIndex.get(key) ?? []),
    ].map((method) => this.inheritDefaults(method, prototypes));
    if (candidates.length === 0) {
      // 只有声明没有实现（纯虚函数就是这种）：仍然认这个签名，
      // 让调用点报「纯虚函数没有实现」而不是「没有这个成员函数」
      return cls.methods.find((method) => method.name === name && method.params.length === argCount);
    }
    const exact = candidates.filter((method) => method.params.length === argCount);
    if (exact.length > 0) {
      if (typeof args === 'number') return exact[0];
      // 重载解析：按实参类型打分，分高者优先（否则 BigInt("123") 会误选 size_t 构造）
      let best = exact[0];
      let bestScore = this.scoreParams(best, args);
      for (const candidate of exact.slice(1)) {
        const score = this.scoreParams(candidate, args);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      return best;
    }
    return candidates.find((method) => {
      const required = method.params.filter((param) => !param.defaultValue).length;
      return required <= argCount && argCount <= method.params.length;
    });
  }

  /** 构造一个类对象：铺好字段后执行构造函数（基类由构造链在 callFunction 里先跑） */
  private constructObject(className: string, args: RValue[], line: number): StructValue {
    const name = lastSegment(className);
    const pure = this.abstractMethodOf(name);
    if (pure) {
      throw new SimError(
        `${name} 里有纯虚函数 ${pure.name}()，它是抽象类，不能直接创建对象。请用派生类或者指针。`,
        line,
      );
    }
    const value = this.createStructValue(name, undefined);
    const ctor = this.findMethodIn(name, name, args);
    if (ctor) this.callFunction(ctor, args, line, value);
    return value;
  }

  /**
   * 构造链：`Dog(name) : Animal(name)` 先构造基类。
   * 必须在本函数帧里求值基类实参 —— 那里才看得见 Dog 自己的参数 name。
   */
  private runBaseCtors(fn: FuncDeclNode, thisValue: StructValue, line: number): void {
    const className = lastSegment(fn.className ?? thisValue.typeName);
    for (const base of this.parents.get(className) ?? []) {
      const baseName = lastSegment(base);
      const entry = fn.ctorInit?.find((item) => lastSegment(item.name) === baseName);
      const args = entry ? entry.args.map((arg) => this.evalExpr(arg)) : [];
      const baseCtor = this.findMethodIn(baseName, baseName, args);
      if (baseCtor) this.callFunction(baseCtor, args, line, thisValue);
    }
  }

  /** 这一类（含基类）有没有析构函数 */
  private hasDestructor(className: string): boolean {
    return this.classChain(className).some((name) => Boolean(this.findMethodIn(name, `~${name}`, 0)));
  }

  /** 找真正的拷贝构造函数：单个参数且是同类对象的引用或指针 */
  private findCopyCtor(className: string): FuncDeclNode | undefined {
    const name = lastSegment(className);
    const key = `${name}::${name}`;
    const cls = this.classMap.get(name);
    const candidates = [
      ...(cls?.methods.filter((method) => method.name === name && method.body) ?? []),
      ...(this.methodIndex.get(key) ?? []),
    ];
    return candidates.find((method) => {
      if (method.params.length !== 1) return false;
      const param = method.params[0];
      const isTargetClass = lastSegment(baseTypeName(param.typeText)) === name;
      return isTargetClass && (param.isReference || param.isPointer || param.typeText.includes('&'));
    });
  }

  /** 拷贝一个类对象：有拷贝构造就调用它（深拷贝），否则按 C++ 隐式拷贝构造逐字段拷贝 */
  private copyObject(source: StructValue, line: number): StructValue {
    const name = lastSegment(source.typeName);
    const copyCtor = this.findCopyCtor(name);
    if (copyCtor) {
      const copy = this.createStructValue(name, undefined);
      this.callFunction(copyCtor, [source], line, copy);
      return copy;
    }
    // 隐式拷贝构造：字段逐个复制（指针仍是浅拷贝，这正是初学者踩坑的地方）
    return this.cloneObject(source);
  }

  /** 隐式拷贝：新对象 + 逐字段复制（不调用任何构造函数） */
  private cloneObject(source: StructValue): StructValue {
    const name = lastSegment(source.typeName);
    const clone = this.createStructValue(name, undefined);
    for (const [field, value] of source.fields) clone.fields.set(field, value);
    clone.fieldTypes = new Map(source.fieldTypes);
    return clone;
  }

  /**
   * 按「目标声明类型」拷贝一个对象。目标是基类时就是**对象切片**：
   * 只留下基类那一份字段，派生部分连同多态信息一起被切掉。
   */
  private sliceTo(source: StructValue, targetType: string, line: number): StructValue {
    const target = lastSegment(targetType);
    if (!this.classMap.has(target)) return source;
    if (lastSegment(source.typeName) === target) return this.copyObject(source, line);
    const sliced = this.createStructValue(target, undefined);
    for (const [field, value] of source.fields) {
      if (sliced.fields.has(field)) sliced.fields.set(field, value);
    }
    return sliced;
  }

  /** 赋值 / 按值传参时按目标声明类型落位（类对象会切片，指针不动） */
  private copyForTarget(source: RValue, targetType: string, line: number): RValue {
    if (source.t !== 'struct' || !targetType) return source;
    const target = lastSegment(targetType.replace(/[&*]/g, '').trim());
    if (!this.classMap.has(target)) return source;
    return this.sliceTo(source, target, line);
  }

  /** 作用域结束时销毁其中的类对象（调用析构函数，按声明逆序） */
  private destroyScope(scope: Scope): void {
    const slots = [...scope.vars.values()];
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i].name === 'this') continue;
      this.destroyValue(slots[i].value);
    }
  }

  private destroyValue(value: RValue): void {
    if (value.t === 'struct') {
      // 析构顺序和构造相反：先自己，再按基类声明顺序倒着析构各个基类
      const order = [lastSegment(value.typeName), ...this.baseLayout(value.typeName).reverse()];
      for (const className of order) {
        const dtor = this.findMethodIn(className, `~${className}`, 0);
        if (dtor) this.callFunction(dtor, [], this.currentLine, value);
      }
      return;
    }
    if (value.t === 'array') {
      for (const element of value.elems) this.destroyValue(element);
    }
  }

  /** 把一个由表达式产生的类对象登记为临时对象，语句结束时析构 */
  private registerTemp(value: StructValue): void {
    if (!this.hasDestructor(value.typeName)) return;
    this.temps.push(value);
  }

  /** 临时对象被变量 / 字段接管：取消登记，交给作用域管理 */
  private adoptTemp(value: RValue): RValue {
    if (value.t !== 'struct') return value;
    const index = this.temps.lastIndexOf(value);
    if (index >= 0) this.temps.splice(index, 1);
    return value;
  }

  private isTemp(value: RValue): boolean {
    return value.t === 'struct' && this.temps.includes(value);
  }

  /** 语句结束：析构本语句产生的临时对象（先登记的先生效，和 C++ 顺序一致） */
  private releaseTemps(mark: number): void {
    while (this.temps.length > mark) {
      const value = this.temps.pop() as StructValue;
      this.destroyValue(value);
    }
  }

  private createStructValue(typeName: string, init: ExprNode | undefined): StructValue {
    const name = lastSegment(typeName);
    const value: StructValue = {
      t: 'struct',
      typeName: name,
      fields: new Map(),
      fieldTypes: new Map(),
      typeText: name,
    };
    const cls = this.classMap.get(name);
    if (!cls) return value;
    // 对象布局和 C++ 一致：基类子对象在前（按声明顺序），自己的字段在后。
    // 平铺成一张字段表之后，派生类里直接写基类字段名就能取到。
    // 兄弟基类里同名的那几个字段不能互相覆盖，用 `Base::name` 做存储键区分开。
    const duplicated = new Set(this.duplicatedFields(name));
    for (const base of this.baseLayout(name)) {
      const baseCls = this.classMap.get(base);
      if (baseCls) this.layoutFields(value, baseCls, undefined, duplicated);
    }
    this.layoutFields(value, cls, init, duplicated);
    return value;
  }

  /** 兄弟基类里撞名的字段（需要 `Base::name` 才能访问的那些） */
  private duplicatedFields(className: string): string[] {
    const owners = new Map<string, string[]>();
    const collect = (cls: ClassDeclNode | undefined): void => {
      for (const field of cls?.fields ?? []) {
        if (field.isStatic) continue;
        const list = owners.get(field.name) ?? [];
        if (!list.includes(cls!.name)) list.push(cls!.name);
        owners.set(field.name, list);
      }
    };
    const name = lastSegment(className);
    for (const base of this.baseLayout(name)) collect(this.classMap.get(base));
    collect(this.classMap.get(name));
    const result: string[] = [];
    for (const [field, list] of owners) {
      if (list.length < 2) continue;
      // 有继承关系的两份不算撞名：更派生的那份直接隐藏基类的同名字段
      const visible = list.filter((owner) => !list.some((other) => owner !== other && this.isAncestorOf(owner, other)));
      if (visible.length > 1) result.push(field);
    }
    return result;
  }

  private layoutFields(
    value: StructValue,
    cls: ClassDeclNode,
    init: ExprNode | undefined,
    duplicated: Set<string>,
  ): void {
    const fields = cls.fields.filter((field) => !field.isStatic);
    const initItems = init && init.kind === 'initlist' ? init.items : [];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const fieldType = this.fieldTypeText(field);
      const key = duplicated.has(field.name) ? `${cls.name}::${field.name}` : field.name;
      value.fieldTypes.set(key, fieldType);
      value.fields.set(key, this.defaultFieldValue(field, initItems[i]));
    }
  }

  private fieldTypeText(field: FieldDeclNode): string {
    let text = field.typeText;
    if (field.pointerDepth > 0) text += '*'.repeat(field.pointerDepth);
    if (field.isReference) text += '&';
    return text;
  }

  private defaultFieldValue(field: FieldDeclNode, init: ExprNode | undefined): RValue {
    const typeText = this.fieldTypeText(field);
    const dims = field.arrayDims.map((d) => (d === null ? 0 : d));
    if (dims.length > 0) {
      return this.createArray(field.base, field.pointerDepth, dims, init);
    }
    // 成员默认值写在声明处（`double radius_ = 0.0;`）时只有源码文本
    const literal = !init && field.initText ? this.evalLiteralText(field.initText, typeText) : undefined;
    if (literal) return literal;
    if (field.pointerDepth > 0) {
      return init ? this.coercePointer(this.evalExpr(init), field.base) : nullValue();
    }
    const className = lastSegment(field.base);
    if (this.classMap.has(className)) {
      return this.createStructValue(className, init);
    }
    if (isStringType(field.typeText)) {
      return init ? coerceValue(this.evalExpr(init), field.typeText) : stringValue('', field.typeText);
    }
    if (init) return coerceValue(this.evalExpr(init), typeText);
    return this.defaultScalar(field.base, typeText);
  }

  /* ============================== 表达式求值 ============================== */

  private evalExpr(expr: ExprNode): RValue {
    this.tick();
    switch (expr.kind) {
      case 'number':
        if (expr.isFloat) {
          return floatValue(expr.value, /[fF]$/.test(expr.raw) ? 'float' : 'double');
        }
        return intValue(expr.value, 'int');
      case 'string':
        return stringValue(expr.value);
      case 'char':
        return intValue(expr.value.length > 0 ? expr.value.charCodeAt(0) : 0, 'char');
      case 'bool':
        return boolValue(expr.value);
      case 'null':
        return nullValue();
      case 'ident':
        return this.evalIdent(expr);
      case 'unary':
        return this.evalUnary(expr);
      case 'postfix':
        return this.evalIncDec(expr.operand, expr.op, false, expr.line);
      case 'binary':
        return this.evalBinary(expr);
      case 'assign':
        return this.evalAssign(expr);
      case 'ternary':
        return truthy(this.evalExpr(expr.cond)) ? this.evalExpr(expr.whenTrue) : this.evalExpr(expr.whenFalse);
      case 'call':
        return this.evalCall(expr);
      case 'index': {
        const object = this.evalExpr(expr.object);
        if (object.t === 'map') return this.mapIndexRead(object, expr.index, expr.line);
        const index = asInt(this.evalExpr(expr.index));
        return this.readElement(object, index, expr.line, expr);
      }
      case 'member':
        return this.evalMember(expr);
      case 'cast': {
        const value = this.evalExpr(expr.expr);
        if (isPointerType(expr.typeText)) {
          if (value.t === 'int' && value.v === 0) return nullValue();
          return value;
        }
        return coerceValue(value, expr.typeText);
      }
      case 'sizeof':
        return intValue(this.sizeOfExpr(expr), 'int');
      case 'new':
        return this.evalNew(expr);
      case 'delete':
        return this.evalDelete(expr);
      case 'initlist': {
        const elems = expr.items.map((item) =>
          item.kind === 'initlist' ? this.evalExpr({ ...item, kind: 'initlist' }) : this.evalExpr(item),
        );
        return {
          t: 'array',
          elems,
          dims: [elems.length],
          elemType: 'int',
          typeText: 'initializer_list',
        };
      }
      case 'comma': {
        let last: RValue = voidValue();
        for (const item of expr.items) last = this.evalExpr(item);
        return last;
      }
      case 'lambda':
        throw new SimError('lambda 表达式暂不支持单步执行。', expr.line, 'unsupported');
      case 'unknown':
      default:
        throw new SimError(`表达式 ${exprToText(expr)} 暂不支持单步执行。`, expr.line, 'unsupported');
    }
  }

  private evalIdent(expr: ExprNode & { kind: 'ident' }): RValue {
    if (expr.name === 'endl') return stringValue('\n');
    const enumValue = this.enumValues.get(expr.name);
    if (enumValue !== undefined) return intValue(enumValue, 'int');
    if (expr.name === 'std') throw new SimError('std 命名空间不能直接当作值使用。', expr.line, 'unsupported');
    const slot = this.lookupSlot(expr.name, expr.line);
    return slot.ref.get();
  }

  private evalUnary(expr: ExprNode & { kind: 'unary' }): RValue {
    if (expr.op === '&') {
      // &a[i] 保留数组信息，这样 p = &a[2] 之后 p[1] 仍然可用
      if (expr.operand.kind === 'index') {
        const indexExpr = expr.operand;
        const object = this.evalExpr(indexExpr.object);
        const index = asInt(this.evalExpr(indexExpr.index));
        if (object.t === 'array') {
          if (index < 0 || index >= object.elems.length) {
            throw new SimError(`数组下标 ${index} 越界（长度 ${object.elems.length}）。`, expr.line);
          }
          return {
            t: 'pointer',
            label: this.elementLabel(indexExpr, index),
            target: arrayElementRef(object, index, this.elementLabel(indexExpr, index)),
            elemType: object.elemType,
            typeText: `${object.elemType}*`,
            array: object,
            offset: index,
          };
        }
        if (object.t === 'pointer' && object.array) {
          const absolute = object.offset + index;
          if (absolute < 0 || absolute >= object.array.elems.length) {
            throw new SimError(`指针下标 ${index} 越界。`, expr.line);
          }
          return {
            ...object,
            label: this.elementLabel(indexExpr, index),
            offset: absolute,
          };
        }
      }
      const ref = this.resolveLValue(expr.operand);
      const typeText = ref.typeText ?? 'int';
      return {
        t: 'pointer',
        label: ref.label,
        target: ref,
        elemType: baseTypeName(typeText),
        typeText: `${typeText}*`,
        offset: 0,
      };
    }
    if (expr.op === '*') {
      const pointer = this.evalExpr(expr.operand);
      return this.derefValue(pointer, expr.line, expr);
    }
    if (expr.op === '++' || expr.op === '--') {
      return this.evalIncDec(expr.operand, expr.op, true, expr.line);
    }
    const value = this.evalExpr(expr.operand);
    switch (expr.op) {
      case '-':
        if (value.t === 'float') return floatValue(-value.v, value.typeText);
        return intValue(-asInt(value), value.t === 'int' ? value.typeText : 'int');
      case '+':
        return value;
      case '!':
        return boolValue(!truthy(value));
      case '~':
        return intValue(~asInt(value), 'int');
      default:
        throw new SimError(`一元运算符 ${expr.op} 暂不支持。`, expr.line, 'unsupported');
    }
  }

  private evalIncDec(operand: ExprNode, op: '++' | '--' | string, prefix: boolean, line: number): RValue {
    const ref = this.resolveLValue(operand);
    const current = ref.get();
    const delta = op === '++' ? 1 : -1;
    let next: RValue;
    if (current.t === 'float') next = floatValue(current.v + delta, current.typeText);
    else if (current.t === 'int') next = intValue(current.v + delta, current.typeText);
    else if (current.t === 'pointer' && current.array) {
      next = { ...current, offset: current.offset + delta };
    } else {
      throw new SimError('这个值不能自增 / 自减。', line);
    }
    ref.set(next);
    return prefix ? next : current;
  }

  private evalBinary(expr: ExprNode & { kind: 'binary' }): RValue {
    if (expr.op === '&&') {
      if (!truthy(this.evalExpr(expr.left))) return boolValue(false);
      return boolValue(truthy(this.evalExpr(expr.right)));
    }
    if (expr.op === '||') {
      if (truthy(this.evalExpr(expr.left))) return boolValue(true);
      return boolValue(truthy(this.evalExpr(expr.right)));
    }
    if (expr.op === '<<') {
      const { base } = flattenBinaryChain(expr, '<<');
      if (/(^|::)cout$/.test(rootName(base))) return this.execCout(expr);
      // 正在执行 operator<< 里的 os << x：os 是形参，求值为 void
      if (this.captureSink) {
        const leftValue = this.evalExpr(expr.left);
        if (leftValue.t === 'void') {
          const rightValue = this.evalExpr(expr.right);
          this.captureSink.push(this.toText(rightValue));
          return leftValue;
        }
        const rightValue = this.evalExpr(expr.right);
        return this.binaryOp(expr.op, leftValue, rightValue, expr.line);
      }
    }
    if (expr.op === '>>') {
      const { base } = flattenBinaryChain(expr, '>>');
      if (/(^|::)cin$/.test(rootName(base))) return this.execCin(expr);
    }
    const left = this.evalExpr(expr.left);
    const right = this.evalExpr(expr.right);
    return this.binaryOp(expr.op, left, right, expr.line);
  }

  private binaryOp(op: string, left: RValue, right: RValue, line: number): RValue {
    const overloaded = this.tryOperatorOverload(op, left, right, line);
    if (overloaded !== undefined) return overloaded;
    // 字符串拼接 / 比较
    if (op === '+' && (left.t === 'string' || right.t === 'string')) {
      return stringValue(this.toText(left) + this.toText(right));
    }
    if ((op === '==' || op === '!=') && (left.t === 'string' || right.t === 'string')) {
      const equal = this.toText(left) === this.toText(right);
      return boolValue(op === '==' ? equal : !equal);
    }
    // std::string 的大小比较：按字典序（`maxValue` 这类模板要在 string 上比较）
    if ((op === '<' || op === '<=' || op === '>' || op === '>=') && (left.t === 'string' || right.t === 'string')) {
      const a = this.toText(left);
      const b = this.toText(right);
      const result = op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
      return boolValue(result);
    }
    // 数组名在指针运算里退化成指向首元素的指针（`a + 3`）
    if (left.t === 'array' && (op === '+' || op === '-') && right.t !== 'pointer' && right.t !== 'array') {
      const base = arrayToPointer(left, 'arr');
      const delta = asInt(right) * (op === '+' ? 1 : -1);
      return { ...base, offset: delta, label: `${base.label}${op}${Math.abs(delta)}` };
    }
    // 指针运算
    if (left.t === 'pointer' && (op === '+' || op === '-') && right.t !== 'pointer') {
      const delta = asInt(right) * (op === '+' ? 1 : -1);
      return { ...left, offset: left.offset + delta, label: `${left.array ? this.arrayBaseLabel(left.label) : left.label}${op}${Math.abs(delta)}` };
    }
    if (left.t === 'pointer' && (op === '==' || op === '!=')) {
      const rightIsNull = right.t === 'null' || (right.t === 'int' && right.v === 0);
      const leftIsNull = left.target === null && left.array === undefined && left.str === undefined;
      const equal = rightIsNull ? leftIsNull : right.t === 'pointer' && left.label === right.label;
      return boolValue(op === '==' ? equal : !equal);
    }
    if (right.t === 'pointer' && (op === '==' || op === '!=')) {
      return this.binaryOp(op, right, left, line);
    }

    switch (op) {
      case '+':
        return this.arithmetic(left, right, (a, b) => a + b);
      case '-':
        return this.arithmetic(left, right, (a, b) => a - b);
      case '*':
        return this.arithmetic(left, right, (a, b) => a * b);
      case '/': {
        const divisor = asNumber(right);
        if (divisor === 0) throw new SimError('除数为 0，无法继续执行。', line);
        const leftNumber = asNumber(left);
        if (left.t === 'float' || right.t === 'float') {
          return floatValue(leftNumber / divisor, this.resultFloatType(left, right));
        }
        return intValue(Math.trunc(leftNumber / divisor), this.resultIntType(left, right));
      }
      case '%': {
        const divisor = asInt(right);
        if (divisor === 0) throw new SimError('取余的除数为 0，无法继续执行。', line);
        return intValue(asInt(left) % divisor, this.resultIntType(left, right));
      }
      case '<':
      case '<=':
      case '>':
      case '>=': {
        const a = asNumber(left);
        const b = asNumber(right);
        const result = op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
        return boolValue(result);
      }
      case '==':
      case '!=': {
        const equal = asNumber(left) === asNumber(right);
        return boolValue(op === '==' ? equal : !equal);
      }
      case '&':
        return intValue(asInt(left) & asInt(right), 'int');
      case '|':
        return intValue(asInt(left) | asInt(right), 'int');
      case '^':
        return intValue(asInt(left) ^ asInt(right), 'int');
      case '<<':
        return intValue(asInt(left) << (asInt(right) & 31), 'int');
      case '>>':
        return intValue(asInt(left) >> (asInt(right) & 31), 'int');
      default:
        throw new SimError(`运算符 ${op} 暂不支持单步执行。`, line, 'unsupported');
    }
  }

  private arithmetic(
    left: RValue,
    right: RValue,
    operation: (a: number, b: number) => number,
  ): RValue {
    const a = asNumber(left);
    const b = asNumber(right);
    const result = operation(a, b);
    if (left.t === 'float' || right.t === 'float') {
      return floatValue(result, this.resultFloatType(left, right));
    }
    return intValue(result, this.resultIntType(left, right));
  }

  private resultFloatType(left: RValue, right: RValue): string {
    if (left.t === 'float' && /double/i.test(left.typeText)) return left.typeText;
    if (right.t === 'float' && /double/i.test(right.typeText)) return right.typeText;
    return 'float';
  }

  private resultIntType(left: RValue, right: RValue): string {
    if (left.t === 'int' && !/bool|char/.test(left.typeText)) return left.typeText;
    if (right.t === 'int' && !/bool|char/.test(right.typeText)) return right.typeText;
    return 'int';
  }

  private evalAssign(expr: ExprNode & { kind: 'assign' }): RValue {
    const ref = this.resolveLValue(expr.target);
    if (expr.op === '=') {
      const raw = this.evalExpr(expr.value);
      // 类对象赋值优先走 operator=：否则只是把字段别名过去，
      // 右侧临时对象析构后左侧的堆缓冲就悬空了（BigInt 里必踩）。
      const current = ref.get();
      if (current.t === 'struct' && raw.t === 'struct' && raw !== current) {
        const assign = this.findMethod(current.typeName, 'operator =', [raw]);
        if (assign) {
          this.callFunction(assign, [raw], expr.line, current);
          return current;
        }
        // 没有 operator=：按隐式拷贝赋值逐字段复制（赋给基类变量时会切片）
        const copy = this.copyForTarget(raw, ref.typeText || current.typeName, expr.line);
        ref.set(copy);
        return copy;
      }
      const value = this.coerceForRef(this.adoptTemp(raw), ref);
      ref.set(value);
      return value;
    }
    const current = ref.get();
    const right = this.evalExpr(expr.value);
    // a += b：优先调用成员 operator+=，避免退化成 operator+ 造成递归
    if (current.t === 'struct') {
      const member = this.findMethod(current.typeName, `operator ${expr.op}`, [right]);
      if (member) {
        const outcome = this.callFunction(member, [right], expr.line, current);
        if (outcome.t === 'struct' && outcome !== current) ref.set(outcome);
        return outcome;
      }
    }
    const baseOp = expr.op.slice(0, -1);
    let next: RValue;
    if (baseOp === '+' && (current.t === 'string' || right.t === 'string')) {
      next = stringValue(this.toText(current) + this.toText(right));
    } else {
      next = this.binaryOp(baseOp, current, right, expr.line);
    }
    const value = this.coerceForRef(next, ref);
    ref.set(value);
    return value;
  }

  private coerceForRef(value: RValue, ref: Ref): RValue {
    if (ref.typeText) return coerceValue(value, ref.typeText);
    return value;
  }

  private evalCall(expr: ExprNode & { kind: 'call' }): RValue {
    const callee = expr.callee;
    if (callee.kind === 'member' && callee.op !== '::') {
      return this.evalMemberCall(expr, callee);
    }
    const name = expr.name || (callee.kind === 'ident' ? callee.name : '');
    // char(x) / int(x) 这种函数式类型转换
    if (BUILTIN_CAST_NAMES.has(name) && expr.args.length === 1) {
      return coerceValue(this.evalExpr(expr.args[0]), name);
    }
    // Point(1, 2) 这种临时对象：类名当构造函数用
    if (this.classMap.has(lastSegment(name))) {
      const args = expr.args.map((arg) => this.evalExpr(arg));
      const temp = this.constructObject(lastSegment(name), args, expr.line);
      this.registerTemp(temp);
      return temp;
    }
    switch (name) {
      case 'string': {
        // std::string("apple") / std::string(3, 'a')：函数式构造
        if (expr.args.length === 0) return stringValue('');
        if (expr.args.length === 1) return stringValue(this.toText(this.evalExpr(expr.args[0])));
        const count = Math.max(0, asInt(this.evalExpr(expr.args[0])));
        const char = String.fromCharCode(asInt(this.evalExpr(expr.args[1])));
        return stringValue(char.repeat(count));
      }
      case 'make_pair': {
        const first = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        const second = expr.args[1] ? this.evalExpr(expr.args[1]) : intValue(0);
        const firstType = this.valueTypeText(first) || 'int';
        const secondType = this.valueTypeText(second) || 'int';
        const pair = this.createStructValue('pair', undefined);
        pair.typeText = `pair<${firstType}, ${secondType}>`;
        pair.fields.set('first', first);
        pair.fieldTypes.set('first', firstType);
        pair.fields.set('second', second);
        pair.fieldTypes.set('second', secondType);
        return pair;
      }
      case 'printf':
        return this.builtinPrintf(expr);
      case 'scanf':
        return this.builtinScanf(expr);
      case 'puts': {
        const arg = this.evalExpr(expr.args[0] ?? { kind: 'null', line: expr.line, column: expr.column, endLine: expr.endLine, endColumn: expr.endColumn });
        const text = charsOf(arg) ?? this.toText(arg);
        this.printOutput(`${text}\n`, expr.line);
        return intValue(0);
      }
      case 'putchar': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        this.printOutput(String.fromCharCode(asInt(value)), expr.line);
        return intValue(asInt(value));
      }
      case 'memcpy':
      case 'memset':
      case 'memcmp':
        return this.builtinMem(name, expr);
      case 'strlen': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : stringValue('');
        const text = charsOf(value) ?? '';
        return intValue(Array.from(text).length);
      }
      case 'abs':
      case 'fabs': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        return name === 'fabs' ? floatValue(Math.abs(asNumber(value))) : intValue(Math.abs(asInt(value)));
      }
      case 'sqrt': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        return floatValue(Math.sqrt(asNumber(value)));
      }
      case 'pow': {
        const base = expr.args[0] ? asNumber(this.evalExpr(expr.args[0])) : 0;
        const exponent = expr.args[1] ? asNumber(this.evalExpr(expr.args[1])) : 0;
        return floatValue(Math.pow(base, exponent));
      }
      case 'floor': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        return floatValue(Math.floor(asNumber(value)));
      }
      case 'ceil': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        return floatValue(Math.ceil(asNumber(value)));
      }
      case 'max':
      case 'min': {
        const left = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        const right = expr.args[1] ? this.evalExpr(expr.args[1]) : intValue(0);
        const a = asNumber(left);
        const b = asNumber(right);
        const result = name === 'max' ? Math.max(a, b) : Math.min(a, b);
        if (left.t === 'float' || right.t === 'float') return floatValue(result);
        return intValue(result, left.t === 'int' ? left.typeText : 'int');
      }
      case 'toupper':
      case 'tolower': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        const code = asInt(value);
        const text = String.fromCharCode(code);
        return intValue((name === 'toupper' ? text.toUpperCase() : text.toLowerCase()).charCodeAt(0), 'char');
      }
      case 'sort':
      case 'stable_sort':
      case 'reverse':
        return this.builtinRangeSort(name, expr);
      case 'malloc':
      case 'calloc':
        return this.evalMalloc(expr, name === 'calloc');
      case 'free':
        return this.evalFree(expr);
      case 'getchar': {
        const char = this.readRawChar('字符');
        return intValue(char.charCodeAt(0), 'char');
      }
      case 'atoi':
      case 'atof':
      case 'stoi': {
        const text = this.textOfArg(expr.args[0]).trim();
        if (name === 'atof') return floatValue(Number.parseFloat(text) || 0);
        if (name === 'stoi' && !/^[+-]?\d/.test(text)) {
          throw new SimError(`stoi 无法把 "${truncateText(text, 12)}" 转成整数。`, expr.line);
        }
        return intValue(Number.parseInt(text, 10) || 0);
      }
      case 'to_string': {
        return stringValue(this.textOfArg(expr.args[0]));
      }
      case 'labs': {
        const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
        return intValue(Math.abs(asInt(value)));
      }
      case 'sin':
      case 'cos':
      case 'tan':
      case 'fmod': {
        const first = expr.args[0] ? asNumber(this.evalExpr(expr.args[0])) : 0;
        const second = expr.args[1] ? asNumber(this.evalExpr(expr.args[1])) : 0;
        if (name === 'fmod') {
          if (second === 0) throw new SimError('fmod 的除数不能是 0。', expr.line);
          return floatValue(first % second);
        }
        const fn = name === 'sin' ? Math.sin : name === 'cos' ? Math.cos : Math.tan;
        return floatValue(fn(first));
      }
      case 'isdigit':
      case 'isalpha':
      case 'isalnum':
      case 'isspace':
      case 'isupper':
      case 'islower': {
        const code = expr.args[0] ? asInt(this.evalExpr(expr.args[0])) : 0;
        const char = String.fromCharCode(code);
        const test =
          name === 'isdigit'
            ? /[0-9]/.test(char)
            : name === 'isalpha'
              ? /[A-Za-z]/.test(char)
              : name === 'isalnum'
                ? /[0-9A-Za-z]/.test(char)
                : name === 'isspace'
                  ? /\s/.test(char)
                  : name === 'isupper'
                    ? /[A-Z]/.test(char)
                    : /[a-z]/.test(char);
        return intValue(test ? 1 : 0);
      }
      case 'strcpy':
      case 'strncpy': {
        const source = this.textOfArg(expr.args[1]);
        const target = this.evalScanTarget(expr.args[0], expr.line);
        const limit =
          name === 'strncpy' && expr.args[2] ? Math.max(0, asInt(this.evalExpr(expr.args[2]))) : undefined;
        const chars = Array.from(source);
        if (limit === undefined) {
          this.writeCharsToTarget(target, chars.join(''));
        } else {
          this.writeCharsToTarget(target, chars.slice(0, limit).join(''));
        }
        return stringValue(source);
      }
      case 'strcat': {
        const target = this.evalScanTarget(expr.args[0], expr.line);
        const existing = this.arrayTextOf(target.array);
        const source = this.textOfArg(expr.args[1]);
        this.writeCharsToTarget(target, `${existing}${source}`);
        return stringValue(`${existing}${source}`);
      }
      case 'strcmp':
      case 'strncmp': {
        const left = this.textOfArg(expr.args[0]);
        const right = this.textOfArg(expr.args[1]);
        const limit =
          name === 'strncmp' && expr.args[2] ? Math.max(0, asInt(this.evalExpr(expr.args[2]))) : Number.MAX_SAFE_INTEGER;
        const a = Array.from(left).slice(0, limit);
        const b = Array.from(right).slice(0, limit);
        const length = Math.min(a.length, b.length);
        let result = 0;
        for (let i = 0; i < length; i++) {
          const diff = a[i].charCodeAt(0) - b[i].charCodeAt(0);
          if (diff !== 0) {
            result = diff < 0 ? -1 : 1;
            break;
          }
        }
        if (result === 0 && a.length !== b.length && limit > length) {
          result = a.length < b.length ? -1 : 1;
        }
        return intValue(result);
      }
      default:
        break;
    }

    if (this.isTypeCastName(name)) {
      const value = expr.args[0] ? this.evalExpr(expr.args[0]) : intValue(0);
      return coerceValue(value, name);
    }

    // 成员函数内部直接写 sound()：先按当前对象的实际类型找，
    // 这样 introduce() 里那句 sound() 才会分派到 Dog::sound（多态）
    const self = this.currentFrame()?.thisValue;
    const { values: args, refs: argRefs } = this.evalArgs(expr.args);
    if (self) {
      const method = this.findMethod(self.typeName, name, args);
      if (method) return this.callFunction(method, args, expr.line, self, argRefs);
    }

    const fn = this.functionMap.get(name);
    if (!fn) {
      // 函数模板：按实参类型推导 T 之后现场展开一份具体函数
      const templates = this.fnTemplates.get(name);
      if (templates && templates.length > 0) {
        const instance = this.instantiateFunction(templates, args);
        if (instance) return this.callFunction(instance, args, expr.line);
        throw new SimError(
          `无法把函数模板 ${name}() 的模板参数推导出来（实参类型不一致？），暂不支持单步执行。`,
          expr.line,
          'unsupported',
        );
      }
      if (name === 'exit' || name === 'abort') throw new SimError(`函数 ${name}() 暂不支持单步执行。`, expr.line, 'unsupported');
      throw new SimError(`调用了源码中没有定义的函数 ${name}()。`, expr.line, 'unsupported');
    }
    // 类外定义的成员函数（BigInt::alloc 这种）沿用当前 this
    const implicitThis = fn.className ? self : undefined;
    return this.callFunction(fn, args, expr.line, implicitThis, argRefs);
  }

  /* ============================== 堆内存 ============================== */

  /** 分配一块堆内存并返回指向它的指针（new 与 malloc 共用） */
  private allocateBlock(
    elemType: string,
    length: number,
    line: number,
    isArray: boolean,
  ): { block: HeapBlock; pointer: PointerValue } {
    const alive = this.heapBlocks.filter((item) => !item.freed).length;
    if (alive >= MAX_HEAP_BLOCKS) {
      throw new SimError(`堆上同时存在的内存块超过 ${MAX_HEAP_BLOCKS} 个，教学解释器停止继续分配。`, line);
    }
    const safeLength = Math.max(1, length);
    const base = lastSegment(elemType);
    const cls = this.classMap.get(base);
    const makeDefault = (): RValue =>
      cls ? this.createStructValue(cls.name, undefined) : this.defaultScalar(base, elemType);
    const elems: RValue[] = [];
    for (let i = 0; i < safeLength; i++) elems.push(makeDefault());

    const typeText = isArray ? `${elemType}[${safeLength}]` : elemType;
    const array: ArrayValue = { t: 'array', elems, dims: [safeLength], elemType, typeText };
    const id = this.nextHeapId++;
    const label = `heap#${id}`;
    const block: HeapBlock = {
      id,
      label,
      elemType,
      isArray,
      array,
      ref: arrayElementRef(array, 0, `${label}[0]`),
      freed: false,
      line,
    };
    this.heapBlocks.push(block);
    this.heapIndex.set(array, block);
    this.heapPeak = Math.max(this.heapPeak, this.heapBlocks.filter((item) => !item.freed).length);

    return {
      block,
      pointer: {
        t: 'pointer',
        label: `${label}[0]`,
        target: block.ref,
        elemType,
        typeText: `${elemType}*`,
        array,
        offset: 0,
      },
    };
  }

  /** new T / new T(初值) / new T[n] */
  private evalNew(expr: ExprNode & { kind: 'new' }): RValue {
    const rawType = (expr.typeText || 'int').replace(/\s+/g, '');
    const elemType = this.concretizeType(baseTypeName(rawType), rawType);
    const isArray = Boolean(expr.arraySize);

    let length = 1;
    if (isArray) {
      length = expr.arraySize ? asInt(this.evalExpr(expr.arraySize)) : 0;
      if (length <= 0) throw new SimError('new[] 的长度必须大于 0。', expr.line);
    }

    const { block, pointer } = this.allocateBlock(elemType, length, expr.line, isArray);
    // new T / new T[n] 里 T 是类时要真的跑构造函数（虚拟函数表只有构造之后才成立）
    if (this.classMap.has(lastSegment(elemType))) {
      const ctorArgs = expr.args.map((arg) => this.evalExpr(arg));
      for (let i = 0; i < block.array.elems.length; i++) {
        block.array.elems[i] = this.constructObject(elemType, i === 0 ? ctorArgs : [], expr.line);
      }
    } else if (!isArray && expr.args.length > 0) {
      block.array.elems[0] = coerceValue(this.evalExpr(expr.args[0]), elemType);
    }

    this.emit({
      event: 'declare',
      description: `new ${block.array.typeText} → ${block.label}（${block.array.elems.length} 个 ${elemType}${
        isArray ? '' : '，值 ' + formatValue(block.array.elems[0])
      }）`,
      line: expr.line,
    });
    return pointer;
  }

  /**
   * std::sort / std::reverse：参数是同一个容器的 begin / end 迭代器。
   * 只改这段区间，和真实算法一致（不会动区间外的元素）。
   */
  private builtinRangeSort(name: string, expr: ExprNode & { kind: 'call' }): RValue {
    const first = expr.args[0] ? this.evalExpr(expr.args[0]) : undefined;
    const last = expr.args[1] ? this.evalExpr(expr.args[1]) : undefined;
    const array = first && first.t === 'array' ? first : first && first.t === 'pointer' ? first.array : undefined;
    const lastArray = last && last.t === 'array' ? last : last && last.t === 'pointer' ? last.array : undefined;
    if (!first || !last || !array || lastArray !== array) {
      throw new SimError(
        `${name}() 目前只支持「同一个容器的 begin(), end()」这种区间写法。`,
        expr.line,
        'unsupported',
      );
    }
    const from = first.t === 'pointer' ? Math.max(0, first.offset) : 0;
    const to = last.t === 'pointer' ? Math.min(array.elems.length, last.offset) : array.elems.length;
    const slice = array.elems.slice(from, to);
    if (name === 'reverse') slice.reverse();
    else slice.sort((a, b) => this.compareForSort(a, b));
    array.elems.splice(from, slice.length, ...slice);
    return voidValue();
  }

  private compareForSort(left: RValue, right: RValue): number {
    if (left.t === 'string' || right.t === 'string') {
      const a = this.toText(left);
      const b = this.toText(right);
      return a < b ? -1 : a > b ? 1 : 0;
    }
    const a = asNumber(left);
    const b = asNumber(right);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /**
   * 解析 malloc / calloc 的字节数，还原成「元素类型 + 个数」。
   * 只认最常见的两种写法：`malloc(n * sizeof(T))` 与 `calloc(n, sizeof(T))`；
   * 其它情况按 char 数组处理（1 字节 1 格），并在提示里说明。
   */
  private mallocSpec(expr: ExprNode & { kind: 'call' }, isCalloc: boolean): { elemType: string; length: number } {
    const sizeofTypeOf = (node: ExprNode | undefined): string | null => {
      if (!node || node.kind !== 'sizeof') return null;
      if (node.expr) return exprToText(node.expr);
      return node.typeText ?? null;
    };

    if (isCalloc) {
      const count = expr.args[0] ? asInt(this.evalExpr(expr.args[0])) : 0;
      const type = sizeofTypeOf(expr.args[1]);
      return { elemType: type ? baseTypeName(type) : 'char', length: count };
    }

    const arg = expr.args[0];
    if (arg && arg.kind === 'binary' && arg.op === '*') {
      const rightType = sizeofTypeOf(arg.right);
      if (rightType) {
        return { elemType: baseTypeName(rightType), length: asInt(this.evalExpr(arg.left)) };
      }
      const leftType = sizeofTypeOf(arg.left);
      if (leftType) {
        return { elemType: baseTypeName(leftType), length: asInt(this.evalExpr(arg.right)) };
      }
    }
    const bytes = arg ? asInt(this.evalExpr(arg)) : 0;
    return { elemType: 'char', length: bytes };
  }

  private evalMalloc(expr: ExprNode & { kind: 'call' }, isCalloc: boolean): RValue {
    const spec = this.mallocSpec(expr, isCalloc);
    if (spec.length <= 0) throw new SimError(`${isCalloc ? 'calloc' : 'malloc'} 申请的大小必须大于 0。`, expr.line);
    const { block, pointer } = this.allocateBlock(spec.elemType, spec.length, expr.line, true);
    this.emit({
      event: 'declare',
      description: `${isCalloc ? 'calloc' : 'malloc'} ${block.array.typeText} → ${block.label}（${
        block.array.elems.length
      } 个 ${spec.elemType}，需手动 free）`,
      line: expr.line,
    });
    return pointer;
  }

  /** free(p) 与 delete p 共用的释放逻辑 */
  private releaseBlock(value: RValue, line: number, viaFree: boolean): void {
    if (value.t === 'null') {
      this.emit({ event: 'assign', description: `${viaFree ? 'free' : 'delete'} 空指针：什么也不会发生`, line });
      return;
    }
    if (value.t !== 'pointer') {
      throw new SimError(`${viaFree ? 'free' : 'delete'} 需要指针，这个表达式不是指针。`, line);
    }
    const block = value.array ? this.heapIndex.get(value.array) : undefined;
    if (!block) {
      const kind = viaFree ? 'invalid-free' : 'invalid-free';
      this.heapIssues.push({
        kind,
        message: `第 ${line} 行 ${viaFree ? 'free' : 'delete'} 的地址不是堆上申请的`,
        line,
      });
      throw new SimError(`这个地址不是 ${viaFree ? 'malloc / calloc' : 'new'} 出来的，不能释放。`, line);
    }
    if (block.freed) {
      this.heapIssues.push({
        kind: 'double-free',
        message: `${block.label} 被重复释放（第 ${line} 行，最初在第 ${block.line} 行申请）`,
        line,
        blockId: block.id,
      });
      throw new SimError(
        `${block.label} 已经释放过了：重复释放是未定义行为，程序可能崩溃。`,
        line,
      );
    }
    // 释放前先析构里面的类对象（与 C++ 语义一致）
    for (const element of block.array.elems) this.destroyValue(element);
    block.freed = true;
  }

  /** delete p / delete[] p */
  private evalDelete(expr: ExprNode & { kind: 'delete' }): RValue {
    const value = this.evalExpr(expr.expr);
    if (value.t === 'pointer' && value.array) {
      const block = this.heapIndex.get(value.array);
      if (block && block.freed) {
        this.releaseBlock(value, expr.line, false);
        return voidValue();
      }
      if (block && expr.isArray !== block.isArray) {
        throw new SimError(
          block.isArray
            ? `${block.label} 是 new[] 申请的数组，必须用 delete[] 释放。`
            : `${block.label} 是单个对象，应该用 delete 而不是 delete[]。`,
          expr.line,
        );
      }
    }
    this.releaseBlock(value, expr.line, false);
    const block = value.t === 'pointer' && value.array ? this.heapIndex.get(value.array) : undefined;
    if (block) {
      this.emit({
        event: 'assign',
        description: `delete${block.isArray ? '[]' : ''} ${block.label}（释放 ${block.array.elems.length} 个 ${block.elemType}）`,
        line: expr.line,
      });
    }
    return voidValue();
  }

  /** free(p) */
  private evalFree(expr: ExprNode & { kind: 'call' }): RValue {
    const value = expr.args[0] ? this.evalExpr(expr.args[0]) : nullValue();
    const block = value.t === 'pointer' && value.array ? this.heapIndex.get(value.array) : undefined;
    this.releaseBlock(value, expr.line, true);
    if (block) {
      this.emit({
        event: 'assign',
        description: `free ${block.label}（释放 ${block.array.elems.length} 个 ${block.elemType}）`,
        line: expr.line,
      });
    }
    return voidValue();
  }

  /** 指针指向的堆块是否已经被释放 */
  private assertHeapAlive(array: ArrayValue | undefined, line: number): void {
    if (!array) return;
    const block = this.heapIndex.get(array);
    if (!block || !block.freed) return;
    this.heapIssues.push({
      kind: 'use-after-free',
      message: `第 ${line} 行使用了已释放的 ${block.label}（在第 ${block.line} 行申请，已释放）`,
      line,
      blockId: block.id,
    });
    throw new SimError(
      `${block.label} 已经释放了，再去读写它就是「释放后使用」，结果不可预期。`,
      line,
    );
  }

  /** 当前堆状态快照，供 UI 逐步展示 */
  private heapSnapshot(): HeapBlockSnapshot[] | undefined {
    if (this.heapBlocks.length === 0) {
      this.heapKey = '';
      this.heapCache = undefined;
      return undefined;
    }
    const owners = new Map<number, string[]>();
    const note = (name: string, value: RValue): void => {
      if (value.t !== 'pointer' || !value.array) return;
      const block = this.heapIndex.get(value.array);
      if (!block) return;
      const list = owners.get(block.id) ?? [];
      if (!list.includes(name)) list.push(name);
      owners.set(block.id, list);
    };
    for (const slot of this.globalScope.vars.values()) note(slot.name, slot.value);
    for (const frame of this.frames) {
      for (const scope of frame.scopes) {
        for (const slot of scope.vars.values()) note(slot.name, slot.value);
      }
    }

    // 先算内容签名：堆没变化的连续步直接复用上一份快照（引用共享）。
    // 带类与动态内存的长程序会有几千步、绝大多数步堆是不动的，
    // 不做这件事单次执行的轨迹能到几十 MB。
    const previews: string[][] = [];
    const parts: string[] = [];
    for (const block of this.heapBlocks) {
      const all = arrayElementTexts(block.array);
      const values = all.slice(0, HEAP_PREVIEW).map(internText);
      previews.push(values);
      parts.push(
        `${block.id}|${block.freed ? 1 : 0}|${all.length}|${(owners.get(block.id) ?? []).join(',')}|${values.join('\u0001')}`,
      );
    }
    const key = parts.join('\u0002');
    if (key === this.heapKey && this.heapCache) return this.heapCache;

    const snapshots = this.heapBlocks.map((block, index) => {
      const values = previews[index];
      const length = block.array.elems.length;
      return {
        id: block.id,
        label: internText(block.label),
        elemType: internText(block.elemType),
        isArray: block.isArray,
        length,
        values,
        hidden: Math.max(0, length - values.length),
        freed: block.freed,
        line: block.line,
        owners: (owners.get(block.id) ?? []).map(internText),
      };
    });
    this.heapKey = key;
    this.heapCache = snapshots;
    return snapshots;
  }

  /** 结束时统计泄漏：申请了但没有释放的块 */
  private collectLeaks(): void {
    if (this.leaksCollected) return;
    this.leaksCollected = true;
    for (const block of this.heapBlocks) {
      if (block.freed) continue;
      this.heapIssues.push({
        kind: 'leak',
        message: `${block.label}（${block.isArray ? `${block.elemType}[${block.array.elems.length}]` : block.elemType}）在第 ${block.line} 行申请，程序结束前一直没有释放`,
        line: block.line,
        blockId: block.id,
      });
    }
  }

  private isTypeCastName(name: string): boolean {
    return /^(int|long|short|char|float|double|bool|unsigned|signed|size_t)$/.test(name);
  }

  /** 实参是简单左值时给出它的引用，供引用参数直接绑定 */
  private argRef(expr: ExprNode): Ref | undefined {
    if (!isSimpleLvalue(expr) && !(expr.kind === 'call' && this.returnsReference(expr))) return undefined;
    try {
      return this.resolveLValue(expr);
    } catch {
      return undefined;
    }
  }

  /** 这个调用绑定的是不是「返回引用」的函数（只有它们能出现在赋值号左边） */
  private returnsReference(expr: ExprNode & { kind: 'call' }): boolean {
    const anyRef = (list: FuncDeclNode[] | undefined): boolean =>
      (list ?? []).some((fn) => fn.returnType.includes('&'));
    const callee = expr.callee;
    if (callee.kind === 'ident') {
      const single = this.functionMap.get(callee.name);
      if (single) return single.returnType.includes('&');
      return anyRef(this.freeFunctions.get(callee.name));
    }
    if (callee.kind === 'member') {
      for (const cls of this.classMap.values()) {
        if (cls.methods.some((method) => method.name === callee.name && method.returnType.includes('&'))) {
          return true;
        }
      }
      for (const [key, list] of this.methodIndex) {
        if (key.endsWith(`::${callee.name}`) && anyRef(list)) return true;
      }
    }
    return false;
  }

  /**
   * 调用一个返回引用的函数，把「它返回的那个左值」取出来。
   * `at(v, 1) = 9`、`int& r = at(v, 1)`、`swap(at(v,0), at(v,1))` 都靠它。
   */
  private callRef(expr: ExprNode & { kind: 'call' }): Ref | undefined {
    if (!this.returnsReference(expr)) return undefined;
    const saved = this.refReturnSlot;
    this.refReturnSlot = undefined;
    try {
      this.evalExpr(expr);
      return this.refReturnSlot;
    } finally {
      this.refReturnSlot = saved;
    }
  }

  /** 一次求出所有实参的值，同时留下左值实参的引用 */
  private evalArgs(args: ExprNode[]): { values: RValue[]; refs: (Ref | undefined)[] } {
    const refs = args.map((arg) => this.argRef(arg));
    const values = args.map((arg, index) => refs[index]?.get() ?? this.evalExpr(arg));
    return { values, refs };
  }

  private evalMemberCall(expr: ExprNode & { kind: 'call' }, callee: ExprNode & { kind: 'member' }): RValue {
    let object = this.evalExpr(callee.object);
    // p->f() 先解引用，拿到实际对象再做分派
    if (callee.op === '->') object = this.derefValue(object, expr.line, callee);
    const method = callee.name;
    if (object.t === 'map') {
      const handled = this.evalMapCall(object, method, expr);
      if (handled !== undefined) return handled;
    }
    if (method === 'length' || method === 'size') {
      if (object.t === 'string') return intValue(Array.from(object.v).length);
      if (object.t === 'array') return intValue(object.elems.length);
    }
    if (object.t === 'array') {
      // std::vector 的成员：因为用数组承载，这里就是改数组本身
      const resized = (): void => {
        object.dims = [object.elems.length];
      };
      // 容器适配器（stack / queue / priority_queue）只从两端进出
      const adapter = object.adapter;
      if (adapter && (method === 'push' || method === 'pop')) {
        if (method === 'push') {
          const value = expr.args[0] ? this.coerceVectorElement(expr.args[0], object.elemType) : voidValue();
          object.elems.push(value);
          if (adapter === 'priority_queue') this.sortAdapter(object);
          resized();
          return voidValue();
        }
        // stack / priority_queue 从尾部出，queue 从头部出
        if (adapter === 'queue') object.elems.shift();
        else object.elems.pop();
        resized();
        return voidValue();
      }
      if (method === 'push_back') {
        const value = expr.args[0] ? this.coerceVectorElement(expr.args[0], object.elemType) : voidValue();
        object.elems.push(value);
        resized();
        return voidValue();
      }
      if (method === 'pop_back') {
        object.elems.pop();
        resized();
        return voidValue();
      }
      if (method === 'front') return object.elems[0] ?? intValue(0, object.elemType);
      if (method === 'back') return object.elems[object.elems.length - 1] ?? intValue(0, object.elemType);
      // stack::top / priority_queue::top 都在「出口」那一端
      if (method === 'top' && adapter) {
        return object.elems[object.elems.length - 1] ?? intValue(0, object.elemType);
      }
      if (method === 'clear') {
        object.elems.length = 0;
        resized();
        return voidValue();
      }
      if (method === 'empty') return boolValue(object.elems.length === 0);
      if (method === 'begin') return this.vectorIterator(object, 0, expr.line);
      if (method === 'end') return this.vectorIterator(object, object.elems.length, expr.line);
    }
    if (method === 'c_str' && object.t === 'string') return object;
    // `at` 是容器 / 字符串的下标访问；用户类里自己写的 at() 走下面的方法分派
    if (method === 'at' && expr.args[0] && object.t !== 'struct') {
      const index = asInt(this.evalExpr(expr.args[0]));
      return this.readElement(object, index, expr.line, expr);
    }
    // 用户自定义类的成员函数：找到同名同参数个数的方法，把对象当作 this 传进去
    if (object.t === 'struct') {
      const { values: args, refs } = this.evalArgs(expr.args);
      const target = this.resolveMethodCall(object, method, args, callee.object);
      if (target) {
        return this.callFunction(target, args, expr.line, object, refs);
      }
      throw new SimError(`类 ${object.typeName} 没有可匹配的成员函数 ${method}()。`, expr.line);
    }
    throw new SimError(`成员函数 ${method}() 暂不支持单步执行。`, expr.line, 'unsupported');
  }

  /**
   * 成员函数调用解析：
   * - 虚函数按「实际对象类型」查（Dog 对象就调 Dog::sound）；
   * - 非虚函数按「指针 / 变量的静态类型」查（Animal* 就只能调到 Animal 的那份）。
   * 这正是多态那一节最容易讲错的地方，所以两条路径分开走。
   */
  private resolveMethodCall(
    object: StructValue,
    name: string,
    args: RValue[],
    objectExpr?: ExprNode,
  ): FuncDeclNode | undefined {
    const dynamicType = lastSegment(object.typeName);
    const staticType = objectExpr ? this.staticClassOf(objectExpr) : undefined;
    const startType = staticType && this.isAncestorOf(staticType, dynamicType) ? staticType : dynamicType;
    // 虚函数：先按实际对象类型找，找不到再回到静态类型（纯虚声明本身没有函数体）
    if (startType !== dynamicType && this.isVirtualMethod(startType, name)) {
      const dynamic = this.findMethod(dynamicType, name, args);
      if (dynamic) return dynamic;
    }
    return this.findMethod(startType, name, args);
  }

  /** 表达式声明的（静态）类名，只认变量名这一种最常见的形式 */
  private staticClassOf(expr: ExprNode): string | undefined {
    if (expr.kind !== 'ident') return undefined;
    try {
      const slot = this.lookupSlot(expr.name, expr.line);
      const base = lastSegment(baseTypeName(slot.typeText));
      return this.classMap.has(base) ? base : undefined;
    } catch {
      return undefined;
    }
  }

  /** 这个方法在继承链上是不是虚的（声明里带 virtual / override / = 0 都算） */
  private isVirtualMethod(className: string, name: string): boolean {
    return this.classChain(className).some((ancestor) => {
      const cls = this.classMap.get(ancestor);
      const declared = cls?.methods.some(
        (method) => method.name === name && (method.isVirtual || method.isPureVirtual),
      );
      if (declared) return true;
      return Boolean(this.methodIndex.get(`${ancestor}::${name}`)?.some((method) => method.isVirtual));
    });
  }

  private evalMember(expr: ExprNode & { kind: 'member' }): RValue {
    if (expr.op === '::') {
      if (expr.name === 'endl') return stringValue('\n');
      // 兄弟基类同名字段的限定写法：`c.A::x`（成员函数里直接写 `A::x`）
      const qualified = this.qualifiedFieldTarget(expr);
      if (qualified) {
        const fieldType = qualified.object.fieldTypes.get(qualified.key) ?? 'int';
        return qualified.object.fields.get(qualified.key) ?? intValue(0, fieldType);
      }
      throw new SimError(`命名空间成员 ${exprToText(expr)} 暂不支持单步执行。`, expr.line, 'unsupported');
    }
    let object = this.evalExpr(expr.object);
    if (expr.op === '->') object = this.derefValue(object, expr.line, expr);
    if (object.t === 'struct') {
      this.assertFieldNotAmbiguous(object.typeName, expr.name, expr.line);
      const value = object.fields.get(expr.name);
      if (value === undefined) {
        throw new SimError(`结构体 ${object.typeName} 没有成员 ${expr.name}。`, expr.line);
      }
      return value;
    }
    throw new SimError(`${exprToText(expr)} 暂不支持读取。`, expr.line, 'unsupported');
  }

  /**
   * `c.A::x` / 成员函数里的 `A::x`：定位到具体是哪一份基类字段。
   * 返回 undefined 表示这不是字段限定（例如 `std::vector`），交给上层报错。
   */
  private qualifiedFieldTarget(
    expr: ExprNode & { kind: 'member' },
  ): { object: StructValue; key: string } | undefined {
    let object: StructValue | undefined;
    let baseName = '';
    if (expr.object.kind === 'member' && expr.object.op === '.') {
      const target = this.evalExpr(expr.object.object);
      if (target.t !== 'struct') return undefined;
      object = target;
      baseName = expr.object.name;
    } else if (expr.object.kind === 'ident') {
      object = this.currentFrame()?.thisValue;
      baseName = expr.object.name;
    }
    if (!object) return undefined;
    const key = `${lastSegment(baseName)}::${expr.name}`;
    if (!object.fields.has(key)) return undefined;
    return { object, key };
  }

  private sizeOfExpr(expr: ExprNode & { kind: 'sizeof' }): number {
    if (expr.typeText) return this.sizeOfTypeText(expr.typeText);
    if (!expr.expr) return 4;
    if (expr.expr.kind === 'ident') {
      try {
        const slot = this.lookupSlot(expr.expr.name, expr.line);
        if (slot.value.t === 'array') {
          const elemSize = this.sizeOfTypeText(slot.value.elemType);
          return elemSize * slot.value.elems.length;
        }
        return this.sizeOfTypeText(slot.typeText);
      } catch {
        return 4;
      }
    }
    if (expr.expr.kind === 'string') return Array.from(expr.expr.value).length + 1;
    return 4;
  }

  private sizeOfTypeText(typeText: string): number {
    if (isPointerType(typeText)) return 8;
    if (isStringType(typeText)) return 32;
    const base = lastSegment(baseTypeName(typeText));
    const cls = this.classMap.get(base);
    if (cls) {
      let total = 0;
      // sizeof 要算上基类子对象
      for (const ancestor of this.classChain(base).slice().reverse()) {
        const ancestorCls = this.classMap.get(ancestor);
        for (const field of ancestorCls?.fields ?? []) {
          if (field.isStatic) continue;
          const dims = field.arrayDims.map((d) => (d === null ? 0 : d));
          total += this.sizeOfTypeText(this.fieldTypeText(field)) * countElements(dims);
        }
      }
      return Math.max(1, total);
    }
    return scalarSize(base, 0);
  }

  private readElement(object: RValue, index: number, line: number, expr: ExprNode): RValue {
    if (object.t === 'array') {
      if (index < 0 || index >= object.elems.length) {
        throw new SimError(`数组下标 ${index} 越界（长度 ${object.elems.length}）。`, line);
      }
      this.assertHeapAlive(object, line);
      return object.elems[index];
    }
    if (object.t === 'pointer') {
      if (object.array) {
        const absolute = object.offset + index;
        if (absolute < 0 || absolute >= object.array.elems.length) {
          throw new SimError(`指针下标 ${index} 越界。`, line);
        }
        this.assertHeapAlive(object.array, line);
        return object.array.elems[absolute];
      }
      if (index === 0 && object.target) return object.target.get();
      if (object.str !== undefined && index >= 0 && index < object.str.length) {
        return intValue(object.str.charCodeAt(index), 'char');
      }
      throw new SimError(`空指针或无效指针不能取下标。`, line);
    }
    if (object.t === 'string') {
      const chars = Array.from(object.v);
      if (index < 0 || index >= chars.length) {
        throw new SimError(`字符串下标 ${index} 越界（长度 ${chars.length}）。`, line);
      }
      return intValue(chars[index].charCodeAt(0), 'char');
    }
    if (object.t === 'null') throw new SimError('空指针不能取下标。', line);
    throw new SimError(`${exprToText(expr)} 不能取下标。`, line, 'unsupported');
  }

  private resolveLValue(expr: ExprNode): Ref {
    switch (expr.kind) {
      case 'call': {
        // `at(v, 1) = 9` / `++at(v, 0)`：函数返回的是引用，写进去就是改原对象
        const ref = this.callRef(expr);
        if (ref) return ref;
        break;
      }
      case 'ident': {
        if (this.enumValues.has(expr.name)) {
          throw new SimError(`${expr.name} 是枚举常量，不能被赋值。`, expr.line);
        }
        const slot = this.lookupSlot(expr.name, expr.line);
        if (slot.isConst) throw new SimError(`常量 ${expr.name} 不能被赋值。`, expr.line);
        return slot.ref;
      }
      case 'index': {
        const object = this.evalExpr(expr.object);
        if (object.t === 'map') {
          return this.mapIndexRef(object, expr.index, exprToText(expr), expr.line);
        }
        const index = asInt(this.evalExpr(expr.index));
        if (object.t === 'array') {
          if (index < 0 || index >= object.elems.length) {
            throw new SimError(`数组下标 ${index} 越界（长度 ${object.elems.length}）。`, expr.line);
          }
          this.assertHeapAlive(object, expr.line);
          return arrayElementRef(object, index, this.elementLabel(expr, index));
        }
        if (object.t === 'pointer' && object.array) {
          const absolute = object.offset + index;
          if (absolute < 0 || absolute >= object.array.elems.length) {
            throw new SimError(`指针下标 ${index} 越界。`, expr.line);
          }
          this.assertHeapAlive(object.array, expr.line);
          return arrayElementRef(object.array, absolute, this.elementLabel(expr, index));
        }
        if (object.t === 'string') {
          throw new SimError('暂时不能修改字符串中的单个字符。', expr.line, 'unsupported');
        }
        throw new SimError('空指针不能通过下标赋值。', expr.line);
      }
      case 'unary': {
        if (expr.op === '*') {
          const pointer = this.evalExpr(expr.operand);
          return this.derefRef(pointer, expr.line, expr);
        }
        break;
      }
      case 'member': {
        if (expr.op === '::') {
          const qualified = this.qualifiedFieldTarget(expr);
          if (!qualified) throw new SimError('这个成员不能被赋值。', expr.line);
          const { object, key } = qualified;
          const fieldType = object.fieldTypes.get(key) ?? 'int';
          return {
            get: () => object.fields.get(key) ?? intValue(0, fieldType),
            set: (value) => {
              object.fields.set(key, value);
            },
            label: exprToText(expr),
            typeText: fieldType,
          };
        }
        let object = this.evalExpr(expr.object);
        if (expr.op === '->') object = this.derefValue(object, expr.line, expr);
        if (object.t === 'struct') {
          this.assertFieldNotAmbiguous(object.typeName, expr.name, expr.line);
          const fieldType = object.fieldTypes.get(expr.name) ?? 'int';
          return {
            get: () => object.fields.get(expr.name) ?? intValue(0, fieldType),
            set: (value) => {
              object.fields.set(expr.name, value);
            },
            label: exprToText(expr),
            typeText: fieldType,
          };
        }
        throw new SimError(`不能给 ${exprToText(expr)} 赋值。`, expr.line);
      }
      default:
        break;
    }
    throw new SimError(`不能给 ${exprToText(expr)} 赋值。`, expr.line);
  }

  private elementLabel(expr: ExprNode & { kind: 'index' }, index: number): string {
    if (expr.object.kind === 'ident') return `${expr.object.name}[${index}]`;
    return `元素[${index}]`;
  }

  private derefValue(value: RValue, line: number, expr: ExprNode): RValue {
    if (value.t === 'null') throw new SimError('解引用空指针会导致程序崩溃。', line);
    if (value.t !== 'pointer') throw new SimError(`${exprToText(expr)} 不是指针。`, line);
    if (value.array) {
      const absolute = value.offset;
      if (absolute < 0 || absolute >= value.array.elems.length) {
        throw new SimError('指针指向了数组范围之外。', line);
      }
      this.assertHeapAlive(value.array, line);
      return value.array.elems[absolute];
    }
    if (value.target) return value.target.get();
    if (value.str !== undefined) {
      return value.offset < value.str.length
        ? intValue(value.str.charCodeAt(value.offset), 'char')
        : intValue(0, 'char');
    }
    throw new SimError('空指针不能解引用。', line);
  }

  private derefRef(value: RValue, line: number, expr: ExprNode): Ref {
    if (value.t === 'null') throw new SimError('解引用空指针会导致程序崩溃。', line);
    if (value.t !== 'pointer') throw new SimError(`${exprToText(expr)} 不是指针。`, line);
    if (value.array) {
      const absolute = value.offset;
      if (absolute < 0 || absolute >= value.array.elems.length) {
        throw new SimError('指针指向了数组范围之外。', line);
      }
      // 写入路径也要拦住「释放后使用」：*p = x 与 p[i] = x 都走这里
      this.assertHeapAlive(value.array, line);
      const label = value.label;
      return arrayElementRef(value.array, absolute, label);
    }
    if (value.target) return value.target;
    throw new SimError('不能修改字符串常量。', line);
  }

  /* ============================== 输入输出 ============================== */

  private toText(value: RValue): string {
    switch (value.t) {
      case 'int':
        if (isCharType(value.typeText)) return String.fromCharCode(value.v);
        if (/bool/.test(value.typeText)) return value.v !== 0 ? '1' : '0';
        return String(value.v);
      case 'float':
        return formatNumber(value.v);
      case 'string':
        return value.v;
      case 'array': {
        const text = charsOf(value);
        return text ?? formatValue(value);
      }
      case 'pointer':
        return value.str ?? value.label;
      case 'null':
        return '0';
      case 'struct':
        return formatValue(value);
      default:
        return '';
    }
  }

  private execCout(expr: ExprNode & { kind: 'binary' }): RValue {
    const { items } = flattenBinaryChain(expr, '<<');
    let chunk = '';
    for (const item of items) {
      if (item.kind === 'ident' && item.name === 'endl') {
        chunk += '\n';
        continue;
      }
      if (item.kind === 'member' && item.name === 'endl') {
        chunk += '\n';
        continue;
      }
      const value = this.evalExpr(item);
      if (value.t === 'void') continue;
      if (value.t === 'struct') {
        const text = this.runStreamOperator(value, expr.line);
        if (text !== null) {
          chunk += text;
          continue;
        }
      }
      chunk += this.toText(value);
    }
    this.printOutput(chunk, expr.line);
    return intValue(0);
  }

  private execCin(expr: ExprNode & { kind: 'binary' }): RValue {
    const { items } = flattenBinaryChain(expr, '>>');
    for (const item of items) {
      const ref = this.resolveLValue(item);
      const typeText = ref.typeText ?? 'int';
      let value: RValue;
      if (isCharType(typeText)) {
        this.skipWhitespace();
        value = intValue(this.readRawChar('字符').charCodeAt(0), 'char');
      } else if (isStringType(typeText)) {
        value = stringValue(this.readToken('字符串'));
      } else if (isFloatType(typeText)) {
        value = floatValue(this.readNumberToken(typeText));
      } else {
        value = intValue(this.readNumberToken(typeText));
      }
      ref.set(coerceValue(value, typeText));
      this.emit({
        event: 'assign',
        description: `从输入读入 ${ref.label} = ${formatValue(ref.get())}`,
        line: expr.line,
      });
    }
    return intValue(0);
  }

  /** memcpy / memset / memcmp：按字节处理，元素宽度大于 1 时按元素个数换算 */
  private builtinMem(name: string, expr: ExprNode & { kind: 'call' }): RValue {
    const target = expr.args[0] ? this.evalExpr(expr.args[0]) : nullValue();
    const second = expr.args[1] ? this.evalExpr(expr.args[1]) : intValue(0);
    const count = expr.args[2] ? asInt(this.evalExpr(expr.args[2])) : 0;

    const readByte = (value: RValue, index: number): number => {
      if (value.t === 'string') return index < value.v.length ? value.v.charCodeAt(index) : 0;
      if (value.t === 'pointer') {
        if (value.str !== undefined) {
          const pos = value.offset + index;
          return pos < value.str.length ? value.str.charCodeAt(pos) : 0;
        }
        if (value.array) {
          const pos = value.offset + index;
          const element = value.array.elems[pos];
          return element ? asInt(element) : 0;
        }
      }
      if (value.t === 'array') {
        const element = value.elems[index];
        return element ? asInt(element) : 0;
      }
      return asInt(value);
    };

    const writeByte = (value: RValue, index: number, byte: number): void => {
      const array = value.t === 'array' ? value : value.t === 'pointer' ? value.array : undefined;
      if (!array) return;
      const offset = value.t === 'pointer' ? value.offset : 0;
      const pos = offset + index;
      if (pos < 0 || pos >= array.elems.length) return;
      array.elems[pos] = intValue(byte, array.elemType);
    };

    if (name === 'memcpy') {
      for (let i = 0; i < count; i++) writeByte(target, i, readByte(second, i));
      return target;
    }
    if (name === 'memset') {
      const byte = asInt(second);
      for (let i = 0; i < count; i++) writeByte(target, i, byte);
      return target;
    }
    // memcmp
    for (let i = 0; i < count; i++) {
      const diff = readByte(target, i) - readByte(second, i);
      if (diff !== 0) return intValue(diff < 0 ? -1 : 1);
    }
    return intValue(0);
  }

  private builtinPrintf(expr: ExprNode & { kind: 'call' }): RValue {
    const formatValue_ = this.evalExpr(expr.args[0] ?? {
      kind: 'string',
      value: '',
      raw: '""',
      line: expr.line,
      column: expr.column,
      endLine: expr.endLine,
      endColumn: expr.endColumn,
    });
    const format = charsOf(formatValue_) ?? this.toText(formatValue_);
    const specs = parseFormat(format);
    let out = '';
    let cursor = 0;
    let argIndex = 1;
    for (const spec of specs) {
      out += format.slice(cursor, spec.start);
      cursor = spec.end;
      if (spec.conv === '%') {
        out += '%';
        continue;
      }
      if (spec.dynamicWidth) {
        const widthExpr = expr.args[argIndex];
        argIndex++;
        if (!widthExpr) throw new SimError('printf 的动态宽度缺少参数。', expr.line);
        const width = asInt(this.evalExpr(widthExpr));
        spec.width = Math.abs(width);
        if (width < 0) spec.flags += '-';
      }
      const argExpr = expr.args[argIndex];
      argIndex++;
      if (!argExpr) {
        throw new SimError(`printf 的格式串需要更多参数（缺少第 ${argIndex - 1} 个）。`, expr.line);
      }
      out += this.formatSpecValue(spec, this.evalExpr(argExpr));
    }
    out += format.slice(cursor);
    this.printOutput(out, expr.line);
    return intValue(out.length);
  }

  private formatSpecValue(spec: FormatSpec, value: RValue): string {
    let text: string;
    switch (spec.conv) {
      case 'd':
      case 'i':
        text = String(asInt(value));
        break;
      case 'u':
        text = String(asInt(value) >>> 0);
        break;
      case 'o':
        text = (asInt(value) >>> 0).toString(8);
        break;
      case 'x':
        text = (asInt(value) >>> 0).toString(16);
        break;
      case 'X':
        text = (asInt(value) >>> 0).toString(16).toUpperCase();
        break;
      case 'f':
      case 'F': {
        const precision = spec.precision ?? 6;
        text = asNumber(value).toFixed(precision);
        break;
      }
      case 'e':
      case 'E': {
        const precision = spec.precision ?? 6;
        text = asNumber(value).toExponential(precision);
        if (spec.conv === 'E') text = text.toUpperCase();
        break;
      }
      case 'g':
      case 'G': {
        const number = asNumber(value);
        text = spec.precision !== null ? trimZeros(number.toPrecision(spec.precision)) : formatNumber(number);
        if (spec.conv === 'G') text = text.toUpperCase();
        break;
      }
      case 'c': {
        if (value.t === 'string') text = value.v.charAt(0);
        else text = String.fromCharCode(asInt(value));
        break;
      }
      case 's': {
        text = charsOf(value) ?? this.toText(value);
        if (spec.precision !== null) text = Array.from(text).slice(0, spec.precision).join('');
        break;
      }
      case 'p': {
        if (value.t === 'pointer') text = value.target ? value.label : '0x0';
        else text = '0x0';
        break;
      }
      default:
        return spec.raw;
    }
    return this.padText(text, spec);
  }

  private padText(text: string, spec: FormatSpec): string {
    let result = text;
    if (spec.flags.includes('+') && !result.startsWith('-') && /^[0-9]/.test(result)) result = `+${result}`;
    else if (spec.flags.includes(' ') && !result.startsWith('-') && /^[0-9]/.test(result)) result = ` ${result}`;
    const width = spec.width ?? 0;
    if (result.length >= width) return result;
    const zeroPad = spec.flags.includes('0') && !spec.flags.includes('-') && /^[-+ ]?[0-9]/.test(result);
    const paddingLength = width - result.length;
    if (spec.flags.includes('-')) return result + ' '.repeat(paddingLength);
    if (zeroPad) {
      if (result.startsWith('-') || result.startsWith('+') || result.startsWith(' ')) {
        return result[0] + '0'.repeat(paddingLength) + result.slice(1);
      }
      return '0'.repeat(paddingLength) + result;
    }
    return ' '.repeat(paddingLength) + result;
  }

  private builtinScanf(expr: ExprNode & { kind: 'call' }): RValue {
    const formatValue_ = this.evalExpr(expr.args[0] ?? {
      kind: 'string',
      value: '',
      raw: '""',
      line: expr.line,
      column: expr.column,
      endLine: expr.endLine,
      endColumn: expr.endColumn,
    });
    const format = charsOf(formatValue_) ?? this.toText(formatValue_);
    const specs = parseFormat(format);
    let argIndex = 1;
    let assigned = 0;
    for (const spec of specs) {
      if (spec.conv === '%' || spec.conv === 'n') continue;
      if (spec.suppressed) {
        if (spec.conv === 'c') this.readRawChar('字符');
        else this.readToken('输入');
        continue;
      }
      const argExpr = expr.args[argIndex];
      argIndex++;
      if (!argExpr) throw new SimError('scanf 的格式串需要更多参数。', expr.line);
      const target = this.evalScanTarget(argExpr, expr.line);
      if (spec.conv === 's') {
        const text = this.readToken('字符串');
        if (target.array) {
          const chars = Array.from(text);
          for (let i = 0; i < target.array.elems.length; i++) {
            target.array.elems[i] = intValue(i < chars.length ? chars[i].charCodeAt(0) : 0, 'char');
          }
          target.ref.set(target.array.elems[0] ?? intValue(0, 'char'));
        } else {
          target.ref.set(stringValue(text));
        }
        assigned++;
        this.emit({
          event: 'assign',
          description: `从输入读入 ${target.label} = "${text}"`,
          line: expr.line,
        });
        continue;
      }
      let value: RValue;
      if (spec.conv === 'c') {
        value = intValue(this.readRawChar('字符').charCodeAt(0), 'char');
      } else if (spec.conv === 'f' || spec.conv === 'e' || spec.conv === 'g') {
        value = floatValue(this.readNumberToken('浮点数'));
      } else if ('diuoxX'.includes(spec.conv)) {
        value = intValue(this.readNumberToken('整数'));
      } else {
        value = stringValue(this.readToken('输入'));
      }
      target.ref.set(coerceValue(value, target.typeText));
      assigned++;
      this.emit({
        event: 'assign',
        description: `从输入读入 ${target.label} = ${formatValue(target.ref.get())}`,
        line: expr.line,
      });
    }
    return intValue(assigned);
  }

  /** 把实参读成字符串（字符数组 / std::string / 字面量都适用） */
  private textOfArg(expr: ExprNode | undefined): string {
    if (!expr) return '';
    const value = this.evalExpr(expr);
    return charsOf(value) ?? this.toText(value);
  }

  /** 读出字符数组到第一个 \0 为止的内容 */
  private arrayTextOf(array?: ArrayValue): string {
    if (!array) return '';
    const chars: string[] = [];
    for (const elem of array.elems) {
      const code = elem.t === 'int' ? elem.v : 0;
      if (code === 0) break;
      chars.push(String.fromCharCode(code));
    }
    return chars.join('');
  }

  /** 把字符串写入字符数组（不足部分补 \0），或直接覆盖 std::string */
  private writeCharsToTarget(
    target: { ref: Ref; typeText: string; label: string; array?: ArrayValue },
    text: string,
  ): void {
    if (target.array) {
      const capacity = target.array.elems.length;
      const chars = Array.from(text);
      for (let i = 0; i < capacity; i++) {
        target.array.elems[i] = intValue(i < chars.length ? chars[i].charCodeAt(0) : 0, 'char');
      }
      if (capacity > 0) target.ref.set(target.array.elems[0]);
      return;
    }
    target.ref.set(stringValue(text));
  }

  private evalScanTarget(
    expr: ExprNode,
    line: number,
  ): { ref: Ref; typeText: string; label: string; array?: ArrayValue } {
    const value = this.evalExpr(expr);
    if (value.t === 'pointer') {
      if (value.target) {
        return {
          ref: value.target,
          typeText: value.target.typeText ?? value.elemType ?? 'int',
          label: value.label,
        };
      }
      if (value.array) {
        return {
          ref: arrayElementRef(value.array, 0, value.label),
          typeText: value.array.elemType,
          label: value.label,
          array: value.array,
        };
      }
      throw new SimError('scanf 收到了空指针。', line);
    }
    if (value.t === 'array') {
      return {
        ref: arrayElementRef(value, 0, '数组'),
        typeText: 'char',
        label: '数组',
        array: value,
      };
    }
    if (value.t === 'null') throw new SimError('scanf 收到了空指针。', line);
    throw new SimError('scanf 需要变量的地址，例如 &x（%s 可以传字符数组名）。', line);
  }

  private skipWhitespace(): void {
    while (this.inputPos < this.input.length && /\s/.test(this.input[this.inputPos])) this.inputPos++;
  }

  private readToken(what: string): string {
    this.skipWhitespace();
    if (this.inputPos >= this.input.length) {
      throw new SimError(`输入数据不足：还需要一个${what}。`, this.currentLine);
    }
    const start = this.inputPos;
    while (this.inputPos < this.input.length && !/\s/.test(this.input[this.inputPos])) this.inputPos++;
    return this.input.slice(start, this.inputPos);
  }

  private readRawChar(what: string): string {
    if (this.inputPos >= this.input.length) {
      throw new SimError(`输入数据不足：还需要一个${what}。`, this.currentLine);
    }
    const char = this.input[this.inputPos];
    this.inputPos++;
    return char;
  }

  private readNumberToken(what: string): number {
    const token = this.readToken(what);
    const number = Number(token);
    if (!Number.isFinite(number)) {
      throw new SimError(`无法把输入 "${token}" 解析为${what}。`, this.currentLine);
    }
    return number;
  }

  private arrayBaseLabel(label: string): string {
    return label.replace(/\[\d+\]$/, '');
  }

  /* ============================== 函数调用 ============================== */

  private callFunction(
    fn: FuncDeclNode,
    args: RValue[],
    callLine: number,
    thisValue?: StructValue,
    argRefs?: (Ref | undefined)[],
  ): RValue {
    if (this.frames.length >= MAX_CALL_DEPTH) {
      throw new SimError(`递归层数超过 ${MAX_CALL_DEPTH} 层，可能是没有终止条件的递归。`, callLine, 'runtime');
    }
    if (fn.isPureVirtual) {
      throw new SimError(
        `纯虚函数 ${lastSegment(fn.name)}() 在 ${lastSegment(fn.className ?? '')} 里没有实现 —— 抽象类只能通过派生类对象调用。`,
        callLine,
      );
    }
    const displayName = fn.className ? `${fn.className}::${fn.name}` : fn.name;
    this.emit({
      event: 'call',
      description: `调用 ${displayName}(${args.map((arg) => formatValue(arg)).join(', ')})`,
      line: callLine,
    });

    const parentScope = this.currentScope();
    const frame: Frame = {
      fn,
      name: displayName,
      line: fn.line,
      scopes: [new Scope(parentScope === this.globalScope ? this.globalScope : parentScope)],
    };
    if (thisValue) {
      frame.thisValue = thisValue;
      const selfRef: Ref = {
        get: () => thisValue,
        set: () => undefined,
        label: 'this',
        typeText: `${thisValue.typeName}*`,
      };
      const thisPointer: PointerValue = {
        t: 'pointer',
        label: 'this',
        target: selfRef,
        elemType: thisValue.typeName,
        typeText: `${thisValue.typeName}*`,
        offset: 0,
      };
      frame.scopes[0].vars.set('this', {
        name: 'this',
        value: thisPointer,
        // 这个 ref 返回的是指针本身（`longer = this` 要拿到指针），
        // 指针的 target 才指向对象（`*this` 用它）
        ref: {
          get: () => thisPointer,
          set: () => undefined,
          label: 'this',
          typeText: `${thisValue.typeName}*`,
        },
        typeText: `${thisValue.typeName}*`,
        category: 'pointer',
        isConst: true,
      });
    }
    this.frames.push(frame);

    for (let i = 0; i < fn.params.length; i++) {
      const param = fn.params[i];
      if (!param.name || param.name === '...') continue;
      const provided = i < args.length ? args[i] : undefined;
      // 引用参数绑定到实参本身：`bool pop(T& value)` 里写 value 要改到调用方的变量
      const ref = provided !== undefined ? argRefs?.[i] : undefined;
      if (ref && (param.isReference || (param.typeText.includes('&') && !param.isPointer))) {
        const value = ref.get();
        frame.scopes[0].vars.set(param.name, {
          name: param.name,
          value,
          ref,
          typeText: param.typeText,
          category: categoryOfValue(value),
          isConst: false,
        });
        continue;
      }
      // 省略实参时要求默认值：`BigInt(size_t v = 0)` 里的 v 必须是 0 而不是 null
      const arg = provided !== undefined ? provided : this.evalDefaultParam(param);
      const value = this.coerceParam(arg, param);
      const slot = this.makeSlot(param.name, value, param.typeText);
      frame.scopes[0].vars.set(param.name, slot);
    }

    // 构造链：基类先构造（`Dog(name) : Animal(name)` 里的 name 就是这里的参数）
    if (thisValue && (fn.isConstructor || lastSegment(fn.name) === lastSegment(fn.className ?? ''))) {
      this.runBaseCtors(fn, thisValue, callLine);
    }
    // 构造初始化列表：x(a), y(b) 在函数体之前执行
    if (thisValue && fn.ctorInit && fn.ctorInit.length > 0) {
      for (const entry of fn.ctorInit) {
        const fieldName = entry.name.replace(/^this->/, '');
        if (!thisValue.fields.has(fieldName)) continue;
        const fieldType = thisValue.fieldTypes.get(fieldName) ?? 'int';
        const arg = entry.args[0] ? this.evalExpr(entry.args[0]) : voidValue();
        thisValue.fields.set(fieldName, coerceValue(arg, fieldType));
      }
    }

    let result: RValue = voidValue();
    let explicit = false;
    let returnedRef: Ref | undefined;
    try {
      if (fn.body) {
        const signal = this.execStmt(fn.body);
        if (signal.kind === 'return') {
          result = signal.value;
          returnedRef = signal.ref;
          explicit = true;
        }
      }
      if (!explicit) {
        this.emit({
          event: 'return',
          description: `函数 ${displayName} 结束`,
          line: fn.endLine,
        });
        result = this.defaultReturnValue(fn.returnType);
      }
    } finally {
      this.frames.pop();
    }
    // 返回引用的函数：把「返回的那个左值」留在槽里，调用方可以往里写
    if (fn.returnType.includes('&')) this.refReturnSlot = returnedRef;
    // 按值返回的类对象是调用方的临时对象，到调用语句结束才析构
    if (result.t === 'struct' && !fn.returnType.includes('&')) {
      this.registerTemp(result);
    }
    return result;
  }

  private coerceParam(arg: RValue, param: ParamNode): RValue {
    // 引用参数不做拷贝，直接绑定到实参对象（写入会反映到调用方）
    if (param.isReference || (param.typeText.includes('&') && !param.isPointer)) return arg;
    if (param.isPointer || param.isArray) {
      if (arg.t === 'array') return arrayToPointer(arg, param.name);
      if (arg.t === 'pointer' || arg.t === 'null') return arg;
      if (arg.t === 'string') {
        return {
          t: 'pointer',
          label: '(字符串常量)',
          target: null,
          elemType: 'char',
          typeText: param.typeText,
          offset: 0,
          str: arg.v,
        };
      }
      return nullValue();
    }
    // 按值传类对象：以形参的声明类型落位，传派生类给基类形参就是对象切片
    if (arg.t === 'struct' && this.classMap.has(lastSegment(baseTypeName(param.typeText)))) {
      return this.copyForTarget(arg, param.typeText, this.currentLine);
    }
    if (isStringType(param.typeText)) return coerceValue(arg, param.typeText);
    return coerceValue(arg, param.typeText);
  }

  private defaultReturnValue(returnType: string): RValue {
    if (!returnType || /^\s*void\s*$/.test(returnType)) return voidValue();
    if (isFloatType(returnType)) return floatValue(0, returnType);
    if (isPointerType(returnType)) return nullValue();
    if (isStringType(returnType)) return stringValue('');
    return intValue(0, returnType);
  }
}

/* ============================== 对外入口 ============================== */

/** 对已解析的 ProgramNode 执行教学解释器，返回执行轨迹 */
export function simulateProgram(program: ProgramNode, options: SimulateOptions = {}): TraceResult {
  const maxSteps = Math.min(Math.max(options.maxSteps ?? DEFAULT_MAX_STEPS, 10), MAX_TRACE_STEPS);
  try {
    const classes = flattenClasses(program);
    const registry = buildSupportRegistry(program, classes);
    const mainFn = program.functions.find((fn) => fn.name === 'main' && fn.body);
    const issue = findUnsupportedProgram(program, registry, mainFn);
    if (issue) {
      return {
        ok: false,
        supported: false,
        error: { message: issue.message, line: issue.line, kind: 'unsupported' },
        steps: [],
        output: '',
        truncated: false,
        maxSteps,
        interpreterNote: '这段代码超出了教学解释器的支持范围，可以改用静态分析查看结构。',
      };
    }
    const interpreter = new Interpreter(program, { maxSteps, stdin: options.stdin });
    return interpreter.run();
  } catch (error) {
    return {
      ok: false,
      supported: false,
      error: {
        message: `执行引擎无法处理这段代码。${error instanceof Error ? `（${error.message}）` : ''}`,
        kind: 'unsupported',
        line: 1,
      },
      steps: [],
      output: '',
      truncated: false,
      maxSteps,
    };
  }
}

/** 供测试使用：把值格式化成展示文本 */
export function formatRuntimeValue(value: RValue): string {
  return formatValue(value);
}

/** 供测试使用：字符展示 */
export function formatChar(code: number): string {
  return charDisplay(code);
}
