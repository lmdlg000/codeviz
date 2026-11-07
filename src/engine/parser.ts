/**
 * 容错递归下降 + Pratt 表达式解析器
 * ------------------------------------------------------------------
 * 设计要点：
 * - 每次解析失败都只影响当前"语句 / 声明"，recover 后继续，绝不整体中断；
 * - 类成员、类外定义（A::f）、构造函数、模板前缀、范围 for 等教学代码常见写法
 *   都做了处理；无法识别的语法变成 Unknown 节点并记一条 diagnostic；
 * - 表达式使用优先级爬升（Pratt），只覆盖分析 / 解释器需要子集。
 */
import type {
  AccessKind,
  BaseSpec,
  BlockStmt,
  ClassDeclNode,
  DeclaratorNode,
  DeclStmt,
  DoWhileStmt,
  EnumDeclNode,
  ExprNode,
  FieldDeclNode,
  ForStmt,
  FuncDeclNode,
  IfStmt,
  ParamNode,
  ProgramNode,
  RangeForStmt,
  StmtNode,
  SwitchCaseNode,
  SwitchStmt,
  TypeSpec,
  TypedefNode,
  VarDeclNode,
  WhileStmt,
} from './ast';
import { createEmptyProgram } from './ast';
import type { Token } from './tokenizer';
import type { Diagnostic } from './types';
import { BINARY_PRECEDENCE, exprToText, isBuiltinTypeName } from './utils';

/** 解析失败的内部信号（会被 recover 捕获，不会冒泡到 analyzeCode 之外） */
class ParseError extends Error {
  readonly rule: string;
  constructor(message: string, rule = 'parse-error') {
    super(message);
    this.name = 'ParseError';
    this.rule = rule;
  }
}

export interface ParseResult {
  program: ProgramNode;
  diagnostics: Diagnostic[];
  parseErrors: number;
}

interface QualFlags {
  specifiers: string[];
  isConst: boolean;
  isStatic: boolean;
  isVirtual: boolean;
  isInline: boolean;
  isExplicit: boolean;
  isConstexpr: boolean;
  isTypedef: boolean;
}

function emptyQuals(): QualFlags {
  return {
    specifiers: [],
    isConst: false,
    isStatic: false,
    isVirtual: false,
    isInline: false,
    isExplicit: false,
    isConstexpr: false,
    isTypedef: false,
  };
}

const TYPE_WORDS = new Set([
  'void',
  'bool',
  'char',
  'short',
  'int',
  'long',
  'float',
  'double',
  'signed',
  'unsigned',
  'wchar_t',
  'char8_t',
  'char16_t',
  'char32_t',
  'auto',
  'size_t',
]);

const QUAL_WORDS = new Set([
  'const',
  'volatile',
  'static',
  'extern',
  'register',
  'inline',
  'virtual',
  'explicit',
  'friend',
  'mutable',
  'constexpr',
  'consteval',
  'thread_local',
  'typename',
  'typedef',
]);

const ACCESS_WORDS = new Set(['public', 'private', 'protected']);

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);

interface DeclaratorHeader {
  name: string;
  className?: string;
  pointerDepth: number;
  isReference: boolean;
  arrayDims: (number | null)[];
  isFunctionPointer: boolean;
  startTok: Token;
}

interface FunctionTailOptions {
  name: string;
  className?: string;
  returnType: string;
  baseType: string;
  startTok: Token;
  quals: QualFlags;
  access?: AccessKind;
  isConstructor?: boolean;
  isDestructor?: boolean;
  isTemplate?: boolean;
  /** 返回类型上的指针层数（如 char *name()） */
  pointerDepth?: number;
  isReference?: boolean;
}

interface MemberParseResult {
  access?: AccessKind;
  fields?: FieldDeclNode[];
  methods?: FuncDeclNode[];
  nested?: ClassDeclNode[];
}

function lastSegment(name: string): string {
  const idx = name.lastIndexOf('::');
  return idx >= 0 ? name.slice(idx + 2) : name;
}

function baseNameOfTypeText(text: string): string {
  let result = text.trim();
  result = result.replace(/\b(const|volatile|static|extern|register|inline|virtual|explicit|mutable|constexpr|typename|struct|class|union|enum)\b/g, '');
  result = result.replace(/<[^<>]*>/g, '');
  result = result.replace(/<[^<>]*>/g, '');
  result = result.trim();
  if (!result) return '';
  const parts = result.split('::');
  return parts[parts.length - 1].trim();
}

export class Parser {
  private tokens: Token[];
  private pos = 0;
  private program: ProgramNode = createEmptyProgram();
  private diagnostics: Diagnostic[] = [];
  private knownTypes = new Set<string>();
  private pendingTemplate = false;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.knownTypes = new Set([
      'int',
      'char',
      'float',
      'double',
      'void',
      'bool',
      'long',
      'short',
      'unsigned',
      'signed',
      'size_t',
      'string',
      'std::string',
      'vector',
      'std::vector',
      'map',
      'std::map',
      'pair',
      'std::pair',
    ]);
  }

  parse(): ParseResult {
    this.parseTopLevelItems();
    // parseErrors 只统计"跳过并恢复"的次数（recoverFromError 中累加），
    // 单条缺少分号这类可继续解析的错误只记 diagnostic。
    return {
      program: this.program,
      diagnostics: this.diagnostics,
      parseErrors: this.program.parseErrors,
    };
  }

  /* ============================== 基础游标 ============================== */

  private peek(offset = 0): Token {
    const index = this.pos + offset;
    if (index >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[index];
  }

  private atEnd(): boolean {
    return this.peek().kind === 'eof';
  }

  private check(text: string): boolean {
    return this.peek().text === text;
  }

  private match(text: string): boolean {
    if (this.check(text)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== 'eof') this.pos++;
    return token;
  }

  private prev(): Token {
    return this.tokens[Math.max(0, this.pos - 1)];
  }

  private expect(text: string, message?: string): Token {
    if (this.check(text)) return this.advance();
    const token = this.peek();
    throw new ParseError(message ?? `这里需要 "${text}"，但遇到了 "${token.text || '文件末尾'}"。`, 'unexpected-token');
  }

  private expectName(message = '这里需要一个名字。'): Token {
    const token = this.peek();
    if (token.kind === 'ident' || token.kind === 'keyword') return this.advance();
    throw new ParseError(message, 'missing-name');
  }

  private span(startTok: Token): { line: number; column: number; endLine: number; endColumn: number } {
    const end = this.prev();
    return {
      line: startTok.line,
      column: startTok.column,
      endLine: end.endLine,
      endColumn: end.endColumn,
    };
  }

  private addDiag(
    severity: 'error' | 'warning' | 'info',
    message: string,
    line: number,
    rule: string,
    column?: number,
  ): void {
    const exists = this.diagnostics.some((d) => d.rule === rule && d.line === line && d.message === message);
    if (exists) return;
    this.diagnostics.push({ severity, message, line, column, rule });
  }

  /* ============================== 顶层 ============================== */

  private parseTopLevelItems(): void {
    while (!this.atEnd()) {
      const before = this.pos;
      try {
        this.parseTopLevelOne();
      } catch (err) {
        this.recoverFromError(err, before);
      }
      if (this.pos === before && !this.atEnd()) this.advance();
    }
  }

  private parseTopLevelOne(): void {
    const tok = this.peek();

    if (tok.kind === 'preproc') {
      this.handlePreproc(tok);
      this.advance();
      return;
    }
    if (tok.text === ';') {
      this.advance();
      return;
    }
    if (tok.text === '}') {
      this.addDiag('error', '发现多余的右花括号 }，请检查括号是否成对。', tok.line, 'unmatched-brace', tok.column);
      this.advance();
      return;
    }
    if (tok.text === 'namespace') {
      this.parseNamespace();
      return;
    }
    if (tok.text === 'extern' && this.peek(1).kind === 'string') {
      this.advance();
      this.advance();
      if (this.check('{')) {
        this.advance();
        this.parseTopLevelItems();
        this.expect('}');
      } else {
        this.skipToSemi();
      }
      return;
    }
    if (tok.text === 'template') {
      this.consumeTemplatePrefix();
      this.pendingTemplate = true;
      try {
        this.parseTopLevelOne();
      } finally {
        this.pendingTemplate = false;
      }
      return;
    }
    if (tok.text === 'using') {
      this.parseUsing();
      return;
    }
    if (tok.text === 'typedef') {
      this.parseTypedef();
      return;
    }
    if (tok.text === 'static_assert') {
      this.skipToSemi();
      return;
    }

    // 类外构造函数 / 析构函数：Rectangle::Rectangle(...) / Rectangle::~Rectangle()
    const ctorInfo = this.outOfLineCtorInfo();
    if (ctorInfo) {
      const startTok = this.peek();
      this.advance(); // Rectangle
      this.advance(); // ::
      if (ctorInfo.isDestructor) this.advance(); // ~
      this.advance(); // 方法名
      const quals = emptyQuals();
      const fn = this.parseFunctionTail({
        name: ctorInfo.name,
        className: ctorInfo.className,
        returnType: '',
        baseType: 'void',
        startTok,
        quals,
        isConstructor: !ctorInfo.isDestructor,
        isDestructor: ctorInfo.isDestructor,
        isTemplate: this.pendingTemplate,
      });
      this.program.functions.push(fn);
      this.program.items.push(fn);
      return;
    }

    if (this.isTypeDefinitionStart()) {
      this.parseTypeDefinitionWithDeclarators(tok);
      return;
    }

    const startTok = tok;
    const spec = this.parseDeclSpecifiers();
    if (!spec) {
      throw new ParseError(`无法识别的顶层声明，已跳过 "${tok.text || '文件末尾'}"。`, 'unrecognized-declaration');
    }
    this.parseDeclarationRest(spec, startTok, 'top');
  }

  private handlePreproc(tok: Token): void {
    const include = /^\s*#\s*include\s*([<"])([^>"]+)[>"]/.exec(tok.text);
    if (include) {
      this.program.includes.push({
        path: include[2].trim(),
        system: include[1] === '<',
        line: tok.line,
      });
    }
  }

  private parseNamespace(): void {
    this.advance(); // namespace
    let name = '';
    if (this.peek().kind === 'ident') name = this.advance().text;
    this.program.namespaces.push(name);
    if (this.check('{')) {
      this.advance();
      this.parseTopLevelItems();
      this.expect('}');
    } else {
      this.skipToSemi();
    }
  }

  private parseUsing(): void {
    this.advance(); // using
    if (this.check('namespace')) {
      this.advance();
      if (this.peek().kind === 'ident') this.program.namespaces.push(this.advance().text);
      this.skipToSemi();
      return;
    }
    if (this.peek().kind === 'ident' && this.peek(1).text === '=') {
      const alias = this.advance().text;
      this.advance(); // =
      const parts: string[] = [];
      while (!this.check(';') && !this.atEnd()) {
        parts.push(this.advance().text);
      }
      this.program.typedefs[alias] = parts.join(' ');
      this.knownTypes.add(alias);
      this.expectSemi();
      return;
    }
    this.skipToSemi();
  }

  private parseTypedef(): void {
    const startTok = this.expect('typedef');
    if (this.isTypeDefinitionStart()) {
      const classCount = this.program.classes.length;
      const enumCount = this.program.enums.length;
      const node = this.parseTypeDefinition(true);
      let definedName = '';
      if (this.program.classes.length > classCount) definedName = this.program.classes[this.program.classes.length - 1].name;
      else if (this.program.enums.length > enumCount) definedName = this.program.enums[this.program.enums.length - 1].name;

      while (!this.check(';') && !this.atEnd()) {
        const header = this.parseDeclaratorHeader();
        const alias = header.name;
        if (alias) {
          this.program.typedefs[alias] = definedName;
          this.knownTypes.add(alias);
          const typedefNode: TypedefNode = {
            kind: 'typedef',
            name: alias,
            target: definedName,
            ...this.span(startTok),
          };
          this.program.items.push(typedefNode);
          if (node && node.kind === 'class' && /^anon_/.test(node.name)) {
            node.name = alias;
            definedName = alias;
          }
        }
        if (!this.match(',')) break;
      }
      this.expectSemi();
      return;
    }
    const spec = this.parseDeclSpecifiers();
    if (!spec) {
      this.skipToSemi();
      return;
    }
    while (!this.check(';') && !this.atEnd()) {
      const header = this.parseDeclaratorHeader();
      if (header.isFunctionPointer && this.check('(')) this.skipBalanced('(', ')');
      if (header.name) {
        this.program.typedefs[header.name] = spec.text;
        this.knownTypes.add(header.name);
        this.program.items.push({
          kind: 'typedef',
          name: header.name,
          target: spec.text,
          ...this.span(startTok),
        });
      }
      if (!this.match(',')) break;
    }
    this.expectSemi();
  }

  /** 顶层类型定义后可能跟变量声明：struct Point { ... } p1, p2; */
  private parseTypeDefinitionWithDeclarators(startTok: Token): void {
    const node = this.parseTypeDefinition();
    const typeName = node ? node.name : '';
    if (this.check(';')) {
      this.advance();
      return;
    }
    const spec: TypeSpec = {
      text: typeName,
      base: typeName,
      isConst: false,
      isStatic: false,
      isUnsigned: false,
      isLong: false,
      isTemplate: false,
    };
    const decls: DeclaratorNode[] = [];
    decls.push(this.finishDeclarator(this.parseDeclaratorHeader(), spec));
    while (this.match(',')) decls.push(this.finishDeclarator(this.parseDeclaratorHeader(), spec));
    this.expectSemi();
    const varDecl: VarDeclNode = {
      kind: 'vardecl',
      typeSpec: spec,
      declarators: decls,
      ...this.span(startTok),
    };
    this.program.globals.push(varDecl);
    this.program.items.push(varDecl);
  }

  private isTypeDefinitionStart(): boolean {
    const head = this.peek().text;
    if (!['struct', 'class', 'union', 'enum'].includes(head)) return false;
    let i = 1;
    if (this.peek(i).kind === 'ident') i++;
    if (head === 'enum' && (this.peek(i).text === 'class' || this.peek(i).text === 'struct')) i++;
    for (let j = i; j < i + 80; j++) {
      const token = this.peek(j);
      if (token.kind === 'eof') return false;
      if (token.text === '{') return true;
      if (token.text === ';' || token.text === '=') return false;
    }
    return false;
  }

  private outOfLineCtorInfo(): { className: string; name: string; isDestructor: boolean } | null {
    if (this.peek(0).kind !== 'ident') return null;
    const first = this.peek(0).text;
    if (this.peek(1).text !== '::') return null;
    let i = 2;
    let isDestructor = false;
    if (this.peek(i).text === '~') {
      isDestructor = true;
      i++;
    }
    if (this.peek(i).kind !== 'ident') return null;
    const second = this.peek(i).text;
    if (this.peek(i + 1).text !== '(') return null;
    if (!isDestructor && first !== second) return null;
    return { className: first, name: isDestructor ? `~${second}` : second, isDestructor };
  }

  /* ============================== 类型定义 ============================== */

  private parseTypeDefinition(nested = false): ClassDeclNode | EnumDeclNode | null {
    if (this.check('enum')) return this.parseEnumDef(nested);

    const kwTok = this.advance();
    let name = '';
    if (this.peek().kind === 'ident') name = this.advance().text;
    if (this.check('final')) this.advance();

    const bases: BaseSpec[] = [];
    if (this.check(':')) {
      this.advance();
      while (!this.atEnd() && !this.check('{')) {
        let access: AccessKind = 'default';
        if (ACCESS_WORDS.has(this.peek().text)) access = this.advance().text as AccessKind;
        if (this.check('virtual')) this.advance();
        const baseName = this.parseQualifiedNameText();
        bases.push({ name: baseName, access });
        if (!this.match(',')) break;
      }
    }

    const classNode = this.parseClassBody(kwTok, name, bases);
    if (!name) {
      name = `anon_${kwTok.text}_${this.program.classes.length + 1}`;
      classNode.name = name;
    }
    this.knownTypes.add(name);
    this.program.classes.push(classNode);
    if (!nested) this.program.items.push(classNode);
    return classNode;
  }

  private parseEnumDef(nested: boolean): EnumDeclNode | null {
    const startTok = this.expect('enum');
    let isEnumClass = false;
    if (this.check('class') || this.check('struct')) {
      isEnumClass = true;
      this.advance();
    }
    let name = '';
    if (this.peek().kind === 'ident') name = this.advance().text;
    if (this.check(':')) {
      this.advance();
      this.parseTypePart(emptyQuals());
    }
    if (!this.check('{')) {
      // 只是前向声明 / 变量声明
      return null;
    }
    this.advance();
    const enumerators: { name: string; valueText?: string; line: number }[] = [];
    while (!this.atEnd() && !this.check('}')) {
      const id = this.expectName('枚举值需要一个名字。');
      let valueText: string | undefined;
      if (this.match('=')) {
        const expr = this.parseConditional();
        valueText = exprToText(expr);
      }
      enumerators.push({ name: id.text, valueText, line: id.line });
      if (!this.match(',')) break;
    }
    this.expect('}');
    const node: EnumDeclNode = {
      kind: 'enum',
      name,
      enumerators,
      isEnumClass,
      ...this.span(startTok),
    };
    if (name) {
      this.knownTypes.add(name);
      this.program.enums.push(node);
    }
    if (!nested) this.program.items.push(node);
    return node;
  }

  private parseClassBody(
    kwTok: Token,
    className: string,
    bases: BaseSpec[],
  ): ClassDeclNode {
    this.expect('{');
    let access: AccessKind = kwTok.text === 'class' ? 'private' : 'public';
    const fields: FieldDeclNode[] = [];
    const methods: FuncDeclNode[] = [];
    const nestedClasses: ClassDeclNode[] = [];

    while (!this.atEnd() && !this.check('}')) {
      const before = this.pos;
      try {
        const result = this.parseClassMember(className || 'anon', access);
        if (result.access) access = result.access;
        if (result.fields) fields.push(...result.fields);
        if (result.methods) methods.push(...result.methods);
        if (result.nested) nestedClasses.push(...result.nested);
      } catch (err) {
        this.recoverFromError(err, before);
      }
      if (this.pos === before && !this.atEnd()) this.advance();
    }

    if (this.atEnd()) {
      const token = this.peek();
      this.addDiag('error', '类 / 结构体缺少右花括号 }。', kwTok.line, 'unmatched-brace', token.column);
    } else {
      this.expect('}');
    }
    const node: ClassDeclNode = {
      kind: 'class',
      name: className,
      classKind: kwTok.text === 'class' ? 'class' : kwTok.text === 'union' ? 'union' : 'struct',
      bases,
      fields,
      methods,
      nested: nestedClasses,
      isTemplate: this.pendingTemplate,
      ...this.span(kwTok),
    };
    return node;
  }

  private parseClassMember(className: string, access: AccessKind): MemberParseResult {
    const tok = this.peek();

    if (this.check(';')) {
      this.advance();
      return {};
    }
    if (ACCESS_WORDS.has(tok.text) && this.peek(1).text === ':') {
      this.advance();
      this.advance();
      return { access: tok.text as AccessKind };
    }
    if (tok.text === 'template') {
      this.consumeTemplatePrefix();
      const result = this.parseClassMember(className, access);
      for (const method of result.methods ?? []) method.isTemplate = true;
      return result;
    }
    if (tok.text === 'friend') {
      this.skipFriend();
      return {};
    }
    if (tok.text === 'using') {
      this.parseUsing();
      return {};
    }
    if (tok.text === 'typedef') {
      this.parseTypedef();
      return {};
    }
    if (tok.text === 'static_assert') {
      this.skipToSemi();
      return {};
    }
    if (this.isTypeDefinitionStart()) {
      const nestedNode = this.parseTypeDefinition(true);
      const typeName = nestedNode ? nestedNode.name : '';
      const fields: FieldDeclNode[] = [];
      if (!this.check(';')) {
        const spec: TypeSpec = {
          text: typeName,
          base: typeName,
          isConst: false,
          isStatic: false,
          isUnsigned: false,
          isLong: false,
          isTemplate: false,
        };
        let header = this.parseDeclaratorHeader();
        for (;;) {
          fields.push(this.buildField(header, spec, access));
          if (!this.match(',')) break;
          header = this.parseDeclaratorHeader();
        }
      }
      this.expectSemi();
      return {
        fields,
        nested: nestedNode && nestedNode.kind === 'class' ? [nestedNode] : [],
      };
    }

    const quals = this.parseQualifiers();

    // 析构函数
    if (this.check('~')) {
      this.advance();
      const nameTok = this.expectName();
      const fn = this.parseFunctionTail({
        name: `~${nameTok.text}`,
        className,
        returnType: '',
        baseType: 'void',
        startTok: tok,
        quals,
        access,
        isDestructor: true,
      });
      return { methods: [fn] };
    }

    // 构造函数
    if (this.peek().kind === 'ident' && this.peek().text === className && this.peek(1).text === '(') {
      this.advance();
      const fn = this.parseFunctionTail({
        name: className,
        className,
        returnType: '',
        baseType: 'void',
        startTok: tok,
        quals,
        access,
        isConstructor: true,
      });
      return { methods: [fn] };
    }

    // 转换运算符 operator bool() const;
    if (this.check('operator')) {
      this.advance();
      let opName = 'operator ';
      while (!this.atEnd() && !this.check('(')) {
        opName += this.advance().text;
      }
      const fn = this.parseFunctionTail({
        name: opName.trim(),
        className,
        returnType: '',
        baseType: 'void',
        startTok: tok,
        quals,
        access,
        isConstructor: false,
      });
      fn.isOperator = true;
      return { methods: [fn] };
    }

    const spec = this.parseTypePart(quals);
    if (!spec) {
      throw new ParseError(`无法识别的类成员："${this.peek().text}"。`, 'class-member');
    }
    const header = this.parseDeclaratorHeader();

    if (this.check('(')) {
      const fn = this.parseFunctionTail({
        name: header.name,
        className,
        returnType: spec.text,
        baseType: spec.base,
        startTok: tok,
        quals,
        access,
        pointerDepth: header.pointerDepth,
        isReference: header.isReference,
      });
      return { methods: [fn] };
    }

    // 字段（可能有多个，逗号分隔）
    const fields: FieldDeclNode[] = [];
    let current = header;
    for (;;) {
      let initText: string | undefined;
      if (this.match('=')) {
        const init = this.parseInitializer();
        initText = exprToText(init);
      }
      if (this.check(':')) {
        this.advance();
        this.parseAssignment();
      }
      fields.push(this.buildField(current, spec, access, initText));
      if (!this.match(',')) break;
      current = this.parseDeclaratorHeader();
    }
    this.expectSemi();
    return { fields };
  }

  private buildField(
    header: DeclaratorHeader,
    spec: TypeSpec,
    access: AccessKind,
    initText?: string,
  ): FieldDeclNode {
    return {
      name: header.name,
      typeText: spec.text,
      base: spec.base,
      access,
      isStatic: spec.isStatic,
      isConst: spec.isConst,
      pointerDepth: header.pointerDepth,
      isReference: header.isReference,
      arrayDims: header.arrayDims,
      initText,
      ...this.span(header.startTok),
    };
  }

  /* ============================== 声明 ============================== */

  private parseQualifiers(): QualFlags {
    const flags = emptyQuals();
    for (;;) {
      const text = this.peek().text;
      if (!QUAL_WORDS.has(text)) break;
      flags.specifiers.push(text);
      if (text === 'const') flags.isConst = true;
      if (text === 'static') flags.isStatic = true;
      if (text === 'virtual') flags.isVirtual = true;
      if (text === 'inline') flags.isInline = true;
      if (text === 'explicit') flags.isExplicit = true;
      if (text === 'constexpr') flags.isConstexpr = true;
      if (text === 'typedef') flags.isTypedef = true;
      this.advance();
    }
    return flags;
  }

  private deriveBaseType(words: string[]): string {
    const set = new Set(words);
    const longCount = words.filter((w) => w === 'long').length;
    if (set.has('bool')) return 'bool';
    if (set.has('char')) return 'char';
    if (set.has('wchar_t')) return 'wchar_t';
    if (set.has('char8_t')) return 'char8_t';
    if (set.has('char16_t')) return 'char16_t';
    if (set.has('char32_t')) return 'char32_t';
    if (set.has('float')) return 'float';
    if (set.has('double')) return longCount > 0 ? 'long double' : 'double';
    if (set.has('void')) return 'void';
    if (set.has('auto')) return 'auto';
    if (set.has('size_t')) return 'size_t';
    if (set.has('int')) {
      if (longCount > 0) return 'long long';
      if (set.has('unsigned')) return 'unsigned int';
      if (set.has('short')) return 'short';
      return 'int';
    }
    if (set.has('short')) return 'short';
    if (longCount > 0) return longCount > 1 ? 'long long' : 'long';
    if (set.has('unsigned')) return 'unsigned int';
    if (set.has('signed')) return 'int';
    return words.join(' ');
  }

  private consumeTemplateArgText(): string {
    // 当前 token 是 '<'
    let depth = 0;
    let text = '';
    let guard = 0;
    while (!this.atEnd() && guard++ < 400) {
      const token = this.advance();
      text += token.text;
      if (token.text === '<') depth++;
      else if (token.text === '>') depth--;
      else if (token.text === '>>') depth -= 2;
      else if (token.text === '<<') depth += 2;
      if (depth <= 0) break;
    }
    if (text.startsWith('<') && text.endsWith('>')) return text;
    return text;
  }

  private parseQualifiedNameText(): string {
    let text = '';
    if (this.match('::')) text = '::';
    const first = this.expectName('这里需要一个类型名。');
    text += first.text;
    for (;;) {
      if (this.check('<')) {
        text += this.consumeTemplateArgText();
        continue;
      }
      if (this.check('::')) {
        this.advance();
        text += '::';
        if (this.peek().kind === 'ident' || this.peek().kind === 'keyword') text += this.advance().text;
        continue;
      }
      break;
    }
    return text;
  }

  private parseTypePart(quals: QualFlags): TypeSpec | null {
    const words: string[] = [];
    while (TYPE_WORDS.has(this.peek().text)) {
      words.push(this.advance().text);
    }

    let typeText = '';
    let base = '';
    let isTemplate = false;

    if (words.length > 0) {
      typeText = words.join(' ');
      base = this.deriveBaseType(words);
    } else if (['struct', 'class', 'union', 'enum'].includes(this.peek().text)) {
      const keyword = this.advance().text;
      let tag = '';
      if (this.peek().kind === 'ident') tag = this.advance().text;
      typeText = `${keyword} ${tag}`.trim();
      base = tag;
    } else if (this.check('decltype')) {
      this.advance();
      if (this.check('(')) this.skipBalanced('(', ')');
      typeText = 'decltype(...)';
      base = 'auto';
    } else if (this.peek().kind === 'ident' || this.check('::')) {
      let text = '';
      if (this.match('::')) text = '::';
      text += this.expectName('这里需要一个类型名。').text;
      for (;;) {
        if (this.check('<')) {
          text += this.consumeTemplateArgText();
          isTemplate = true;
          continue;
        }
        if (this.check('::')) {
          this.advance();
          text += '::';
          if (this.peek().kind === 'ident' || this.peek().kind === 'keyword') {
            text += this.advance().text;
          }
          continue;
        }
        break;
      }
      typeText = text;
      base = baseNameOfTypeText(text);
    } else {
      return null;
    }

    if (this.check('const')) {
      this.advance();
      typeText += ' const';
      quals.isConst = true;
    }

    const prefix = quals.specifiers.filter((s) => s !== 'typedef').join(' ');
    const fullText = prefix ? `${prefix} ${typeText}` : typeText;
    return {
      text: fullText,
      base,
      isConst: quals.isConst,
      isStatic: quals.isStatic,
      isUnsigned: words.includes('unsigned'),
      isLong: words.includes('long'),
      isTemplate,
    };
  }

  private parseDeclSpecifiers(): TypeSpec | null {
    const quals = this.parseQualifiers();
    return this.parseTypePart(quals);
  }

  private parseDeclaratorHeader(): DeclaratorHeader {
    let pointerDepth = 0;
    let isReference = false;
    let isFunctionPointer = false;

    for (;;) {
      if (this.check('*')) {
        this.advance();
        pointerDepth++;
        while (this.check('const') || this.check('volatile')) this.advance();
        continue;
      }
      if (this.check('&')) {
        this.advance();
        isReference = true;
        continue;
      }
      if (this.check('&&')) {
        this.advance();
        isReference = true;
        continue;
      }
      if (this.check('...')) {
        this.advance();
        continue;
      }
      break;
    }

    const startTok = this.peek();
    let name = '';
    let className: string | undefined;

    if (this.check('(') && this.peek(1).text === '*') {
      // 函数指针：int (*fp)(int)
      this.advance();
      while (this.check('*') || this.check('&')) {
        if (this.check('*')) pointerDepth++;
        this.advance();
      }
      if (this.peek().kind === 'ident') name = this.advance().text;
      this.expect(')');
      isFunctionPointer = true;
    } else if (this.check('~')) {
      this.advance();
      const id = this.expectName();
      name = `~${id.text}`;
    } else if (this.check('operator')) {
      this.advance();
      let opName = 'operator ';
      while (!this.atEnd() && !this.check('(') && !this.check(';') && !this.check('{')) {
        opName += this.advance().text;
      }
      name = opName.trim();
    } else if (this.peek().kind === 'ident' || this.peek().kind === 'keyword') {
      name = this.advance().text;
    }

    while (this.check('::')) {
      this.advance();
      className = className ? `${className}::${name}` : name;
      if (this.check('~')) {
        this.advance();
        const id = this.expectName();
        name = `~${id.text}`;
      } else if (this.check('operator')) {
        // 类外定义：BigInt& BigInt::operator=(const BigInt& o) —— 这里也要吃掉运算符符号
        this.advance();
        let opName = 'operator ';
        while (!this.atEnd() && !this.check('(') && !this.check(';') && !this.check('{')) {
          opName += this.advance().text;
        }
        name = opName.trim();
      } else if (this.peek().kind === 'ident' || this.peek().kind === 'keyword') {
        name = this.advance().text;
      } else {
        name = '';
        break;
      }
    }

    const arrayDims: (number | null)[] = [];
    while (this.check('[')) {
      this.advance();
      let dim: number | null = null;
      if (!this.check(']')) {
        const expr = this.parseAssignment();
        if (expr.kind === 'number') dim = expr.value;
        // 常量标识符等无法在解析期求值，保留 null
      }
      this.expect(']');
      arrayDims.push(dim);
    }

    return { name, className, pointerDepth, isReference, arrayDims, isFunctionPointer, startTok };
  }

  private finishDeclarator(header: DeclaratorHeader, spec: TypeSpec): DeclaratorNode {
    let init: ExprNode | undefined;
    let initText: string | undefined;

    if (this.check('(')) {
      const callStart = this.peek();
      this.advance();
      const args: ExprNode[] = [];
      while (!this.atEnd() && !this.check(')')) {
        args.push(this.parseAssignment());
        if (!this.match(',')) break;
      }
      this.expect(')');
      init = {
        kind: 'call',
        callee: {
          kind: 'ident',
          name: spec.base,
          line: callStart.line,
          column: callStart.column,
          endLine: callStart.endLine,
          endColumn: callStart.endColumn,
        },
        args,
        name: spec.base,
        ...this.span(header.startTok),
      };
      initText = exprToText(init);
    } else if (this.check('{')) {
      init = this.parseInitList();
      initText = exprToText(init);
    } else if (this.match('=')) {
      init = this.parseInitializer();
      initText = exprToText(init);
    } else if (this.check(':')) {
      // 位域
      this.advance();
      this.parseAssignment();
    }

    return {
      name: header.name,
      pointerDepth: header.pointerDepth,
      isReference: header.isReference,
      arrayDims: header.arrayDims,
      init,
      initText,
      isFunctionPointer: header.isFunctionPointer,
      ...this.span(header.startTok),
    };
  }

  /** 顶层声明：函数定义 / 原型 / 全局变量 */
  private parseDeclarationRest(spec: TypeSpec, startTok: Token, mode: 'top' | 'statement'): void {
    const header = this.parseDeclaratorHeader();
    if (header.isFunctionPointer) {
      if (this.check('(')) this.skipBalanced('(', ')');
      this.skipToSemi();
      return;
    }
    if (this.check('(') && !(mode === 'statement' && this.isClassType(spec.base) && header.name !== spec.base)) {
      const fn = this.parseFunctionTail({
        name: header.name,
        className: header.className,
        returnType: spec.text,
        baseType: spec.base,
        startTok,
        pointerDepth: header.pointerDepth,
        isReference: header.isReference,
        quals: {
          specifiers: [],
          isConst: spec.isConst,
          isStatic: spec.isStatic,
          isVirtual: false,
          isInline: false,
          isExplicit: false,
          isConstexpr: false,
          isTypedef: false,
        },
        isTemplate: this.pendingTemplate,
      });
      if (mode === 'top') {
        this.program.functions.push(fn);
        this.program.items.push(fn);
      } else {
        // 局部函数原型：注册但不参与类模型
        this.program.functions.push(fn);
      }
      return;
    }

    const declarators: DeclaratorNode[] = [this.finishDeclarator(header, spec)];
    while (this.match(',')) {
      declarators.push(this.finishDeclarator(this.parseDeclaratorHeader(), spec));
    }
    this.expectSemi();
    const varDecl: VarDeclNode = {
      kind: 'vardecl',
      typeSpec: spec,
      declarators,
      ...this.span(startTok),
    };
    if (mode === 'top') {
      this.program.globals.push(varDecl);
      this.program.items.push(varDecl);
    }
  }

  private isClassType(name: string): boolean {
    const base = lastSegment(name);
    for (const cls of this.program.classes) {
      if (cls.name === base) return true;
    }
    return this.knownTypes.has(base) && !isBuiltinTypeName(base);
  }

  /** 从类型文本中剔除函数修饰符，得到干净的返回类型 */
  private cleanReturnTypeText(text: string): string {
    return text
      .replace(
        /\b(virtual|static|inline|explicit|friend|constexpr|consteval|mutable|extern|register|thread_local|typedef)\b/g,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 解析参数列表（当前 token 是 '('） */
  private parseParams(): ParamNode[] {
    this.expect('(');
    const params: ParamNode[] = [];
    if (this.match(')')) return params;

    while (!this.atEnd() && !this.check(')')) {
      if (this.check('...')) {
        const token = this.advance();
        params.push({
          name: '...',
          typeText: '...',
          base: '...',
          isPointer: false,
          isReference: false,
          isArray: false,
          line: token.line,
          column: token.column,
          endLine: token.endLine,
          endColumn: token.endColumn,
        });
        if (!this.match(',')) break;
        continue;
      }
      const startTok = this.peek();
      const spec = this.parseDeclSpecifiers();
      if (!spec) {
        // 无法识别的参数：跳过该 token，保持容错
        this.addDiag('warning', '这个函数参数无法识别，已忽略。', this.peek().line, 'param-parse', this.peek().column);
        this.advance();
        if (!this.match(',')) break;
        continue;
      }
      const header = this.parseDeclaratorHeader();
      let defaultValue: string | undefined;
      if (this.match('=')) {
        const expr = this.parseAssignment();
        defaultValue = exprToText(expr);
      }
      const isPointer = header.pointerDepth > 0;
      const isArray = header.arrayDims.length > 0;
      params.push({
        name: header.name,
        typeText: spec.text,
        base: spec.base,
        isPointer,
        isReference: header.isReference,
        isArray,
        arrayDims: header.arrayDims.length > 0 ? header.arrayDims : undefined,
        defaultValue,
        ...this.span(startTok),
      });
      if (!this.match(',')) break;
    }
    this.expect(')');
    if (params.length === 1 && params[0].typeText === 'void' && !params[0].name) {
      return [];
    }
    return params;
  }

  private parseFunctionTail(options: FunctionTailOptions): FuncDeclNode {
    const params = this.parseParams();

    let isConst = false;
    let isPureVirtual = false;
    let isVirtual = options.quals.isVirtual;
    let isStatic = options.quals.isStatic;
    let isInline = options.quals.isInline;
    let isExplicit = options.quals.isExplicit;
    let trailingReturn: string | null = null;
    let ctorInitText: string | undefined;
    let ctorInit: { name: string; args: ExprNode[] }[] | undefined;

    let guard = 0;
    while (guard++ < 40) {
      if (this.check('const')) {
        isConst = true;
        this.advance();
        continue;
      }
      if (this.check('volatile')) {
        this.advance();
        continue;
      }
      if (this.check('override') || this.check('final')) {
        // override 意味着这是一个虚函数（C++11 起）
        if (this.check('override')) isVirtual = true;
        this.advance();
        continue;
      }
      if (this.check('noexcept')) {
        this.advance();
        if (this.check('(')) this.skipBalanced('(', ')');
        continue;
      }
      if (this.check('->')) {
        this.advance();
        const retType = this.parseTypePart(emptyQuals());
        trailingReturn = retType ? retType.text : '';
        continue;
      }
      if (this.check('=')) {
        this.advance();
        if (this.check('0')) {
          isPureVirtual = true;
          this.advance();
        } else {
          this.advance();
        }
        continue;
      }
      if (this.check(':')) {
        this.advance();
        const initStart = this.pos;
        const entries: { name: string; args: ExprNode[] }[] = [];
        while (!this.atEnd() && !this.check('{') && !this.check(';')) {
          let entryName = '';
          while (
            !this.atEnd() &&
            !this.check('(') &&
            !this.check('{') &&
            !this.check(',') &&
            !this.check(';')
          ) {
            entryName += this.advance().text;
          }
          const args: ExprNode[] = [];
          if (this.check('(')) {
            this.advance();
            while (!this.atEnd() && !this.check(')')) {
              args.push(this.parseAssignment());
              if (!this.match(',')) break;
            }
            this.expect(')');
          } else if (this.check('{')) {
            this.advance();
            while (!this.atEnd() && !this.check('}')) {
              args.push(this.parseAssignment());
              if (!this.match(',')) break;
            }
            this.expect('}');
          }
          entries.push({ name: entryName.trim(), args });
          if (!this.match(',')) break;
        }
        ctorInitText = this.tokensText(initStart, this.pos);
        ctorInit = entries;
        continue;
      }
      break;
    }

    let body: BlockStmt | undefined;
    let isPrototype = false;
    if (this.check('{')) {
      body = this.parseBlock();
    } else if (this.check(';')) {
      this.advance();
      isPrototype = true;
    } else if (this.check(':')) {
      // 少数情况下初始化列表在循环里没被吃掉
      this.skipToBraceOrSemi();
      if (this.check('{')) body = this.parseBlock();
      else if (this.check(';')) {
        this.advance();
        isPrototype = true;
      } else {
        throw new ParseError('函数声明缺少函数体或分号。', 'missing-body');
      }
    } else if (this.atEnd() || this.check('}')) {
      isPrototype = true;
    } else {
      const token = this.peek();
      throw new ParseError(`函数 "${options.name}" 的声明无法继续解析。`, 'function-parse');
    }

    const className = options.className;
    const simpleName = className ? lastSegment(className) : '';
    const isConstructor = options.isConstructor === true || (!!className && !options.isDestructor && options.name === simpleName);
    const isDestructor = options.isDestructor === true || options.name.startsWith('~');
    const isOperator = options.name.startsWith('operator');

    // 返回类型：去掉 virtual/static/inline 等修饰符，再补回指针 / 引用星号
    let returnType = '';
    if (!isConstructor && !isDestructor) {
      returnType = this.cleanReturnTypeText(trailingReturn ?? options.returnType);
      const pointerDepth = options.pointerDepth ?? 0;
      if (pointerDepth > 0) returnType += '*'.repeat(pointerDepth);
      if (options.isReference) returnType += '&';
      if (!returnType) returnType = 'void';
    }

    const modifierText = [
      isVirtual ? 'virtual' : '',
      isStatic ? 'static' : '',
      isInline ? 'inline' : '',
      isExplicit ? 'explicit' : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');
    const paramText = params
      .map((p) => (p.name && p.name !== '...' ? `${p.typeText} ${p.name}` : p.typeText))
      .join(', ');
    const signatureParts = [
      modifierText,
      isConstructor || isDestructor ? '' : returnType,
      `${options.name}(${paramText})`,
    ].filter((part) => part.length > 0);
    const signature = `${signatureParts.join(' ')}${isConst ? ' const' : ''}${isPureVirtual ? ' = 0' : ''}`;

    return {
      kind: 'function',
      name: options.name,
      className,
      returnType,
      baseType: isConstructor || isDestructor ? '' : options.baseType,
      params,
      body,
      isPrototype,
      isVirtual,
      isStatic,
      isConst,
      isPureVirtual,
      isInline,
      isExplicit,
      isTemplate: options.isTemplate === true,
      isOperator,
      isConstructor,
      isDestructor,
      specifiers: options.quals.specifiers,
      ctorInitText,
      ctorInit,
      access: options.access,
      signature,
      ...this.span(options.startTok),
    };
  }

  /* ============================== 语句 ============================== */

  private parseBlock(): BlockStmt {
    const startTok = this.expect('{');
    const statements: StmtNode[] = [];
    while (!this.atEnd() && !this.check('}')) {
      const before = this.pos;
      try {
        statements.push(this.parseStatement());
      } catch (err) {
        this.recoverFromError(err, before);
      }
      if (this.pos === before && !this.atEnd()) this.advance();
    }
    if (this.atEnd()) {
      const token = this.peek();
      this.addDiag('error', '代码块缺少右花括号 }。', startTok.line, 'unmatched-brace', token.column);
    } else {
      this.expect('}');
    }
    return { kind: 'block', statements, ...this.span(startTok) };
  }

  private parseStatement(): StmtNode {
    const tok = this.peek();

    switch (tok.text) {
      case '{':
        return this.parseBlock();
      case ';': {
        this.advance();
        return { kind: 'empty', ...this.span(tok) };
      }
      case 'if':
        return this.parseIf();
      case 'while':
        return this.parseWhile();
      case 'do':
        return this.parseDoWhile();
      case 'for':
        return this.parseFor();
      case 'switch':
        return this.parseSwitch();
      case 'break': {
        this.advance();
        if (this.peek().kind === 'ident') this.advance();
        this.expectSemi();
        return { kind: 'break', ...this.span(tok) };
      }
      case 'continue': {
        this.advance();
        this.expectSemi();
        return { kind: 'continue', ...this.span(tok) };
      }
      case 'return':
        return this.parseReturn();
      case 'goto': {
        this.advance();
        const label = this.expectName('goto 后面需要标签名。');
        this.expectSemi();
        return { kind: 'goto', label: label.text, ...this.span(tok) };
      }
      case 'case':
      case 'default':
        throw new ParseError('case / default 只能出现在 switch 语句内部。', 'unexpected-case');
      case 'else':
        throw new ParseError('这个 else 没有对应的 if。', 'dangling-else');
      case 'typedef': {
        this.parseTypedef();
        return { kind: 'empty', ...this.span(tok) };
      }
      case 'using': {
        this.parseUsing();
        return { kind: 'empty', ...this.span(tok) };
      }
      case 'namespace': {
        this.parseNamespace();
        return { kind: 'empty', ...this.span(tok) };
      }
      case 'public':
      case 'private':
      case 'protected':
        throw new ParseError(`${tok.text} 只能出现在类定义中。`, 'access-outside-class');
      default:
        break;
    }

    // 标签语句
    if ((tok.kind === 'ident' || tok.kind === 'keyword') && this.peek(1).text === ':') {
      this.advance();
      this.advance();
      let statement: StmtNode;
      if (this.check('}')) {
        statement = { kind: 'empty', ...this.span(tok) };
      } else {
        statement = this.parseStatement();
      }
      return { kind: 'labeled', label: tok.text, statement, ...this.span(tok) };
    }

    if (this.looksLikeDeclaration()) {
      const startTok = this.peek();
      const quals = this.parseQualifiers();
      if (quals.isTypedef) {
        this.skipToSemi();
        return { kind: 'empty', ...this.span(startTok) };
      }
      const spec = this.parseTypePart(quals);
      if (!spec) {
        throw new ParseError(`无法识别的声明："${this.peek().text}"。`, 'unrecognized-declaration');
      }
      const header = this.parseDeclaratorHeader();
      if (header.isFunctionPointer) {
        if (this.check('(')) this.skipBalanced('(', ')');
        this.skipToSemi();
        return { kind: 'empty', ...this.span(startTok) };
      }
      if (this.check('(') && !(this.isClassType(spec.base) && header.name !== spec.base)) {
        // 局部函数原型
        this.parseParams();
        this.expectSemi();
        return { kind: 'empty', ...this.span(startTok) };
      }
      const declarators: DeclaratorNode[] = [this.finishDeclarator(header, spec)];
      while (this.match(',')) {
        declarators.push(this.finishDeclarator(this.parseDeclaratorHeader(), spec));
      }
      this.expectSemi();
      const decl: VarDeclNode = {
        kind: 'vardecl',
        typeSpec: spec,
        declarators,
        ...this.span(startTok),
      };
      return { kind: 'decl', decl, ...this.span(startTok) };
    }

    const startTok = this.peek();
    const expr = this.parseCommaExpr();
    this.expectSemi();
    return { kind: 'expr', expr, ...this.span(startTok) };
  }

  private parseIf(): IfStmt {
    const startTok = this.advance();
    this.expect('(');
    const cond = this.parseCommaExpr();
    this.expect(')');
    const thenStmt = this.parseStatement();
    let elseStmt: StmtNode | undefined;
    if (this.check('else')) {
      this.advance();
      elseStmt = this.parseStatement();
    }
    return { kind: 'if', cond, then: thenStmt, else: elseStmt, ...this.span(startTok) };
  }

  private parseWhile(): WhileStmt {
    const startTok = this.advance();
    this.expect('(');
    const cond = this.parseCommaExpr();
    this.expect(')');
    const body = this.parseStatement();
    return { kind: 'while', cond, body, ...this.span(startTok) };
  }

  private parseDoWhile(): DoWhileStmt {
    const startTok = this.advance();
    const body = this.parseStatement();
    if (!this.check('while')) {
      throw new ParseError('do 语句后面需要 while。', 'missing-while');
    }
    this.advance();
    this.expect('(');
    const cond = this.parseCommaExpr();
    this.expect(')');
    this.expectSemi();
    return { kind: 'doWhile', body, cond, ...this.span(startTok) };
  }

  private isRangeForAhead(): boolean {
    let depth = 0;
    for (let i = 0; i < 120; i++) {
      const token = this.peek(i);
      if (token.kind === 'eof') return false;
      const text = token.text;
      if (text === '(' || text === '[' || text === '{') depth++;
      else if (text === ')' || text === ']' || text === '}') {
        if (depth === 0) return false;
        depth--;
      } else if (depth === 0) {
        if (text === ';') return false;
        if (text === ':') return true;
        if (text === '?') return false;
      }
    }
    return false;
  }

  private parseFor(): ForStmt | RangeForStmt {
    const startTok = this.advance();
    this.expect('(');

    if (this.isRangeForAhead()) {
      let declText = '';
      let varName = '';
      if (this.looksLikeDeclaration()) {
        const quals = this.parseQualifiers();
        const spec = this.parseTypePart(quals);
        const header = this.parseDeclaratorHeader();
        declText = `${spec ? spec.text : ''} ${header.name}`.trim();
        varName = header.name;
      } else {
        const id = this.expectName('范围 for 需要一个循环变量。');
        varName = id.text;
        declText = id.text;
      }
      this.expect(':');
      const iterable = this.parseAssignment();
      this.expect(')');
      const body = this.parseStatement();
      return { kind: 'rangeFor', declText, varName, iterable, body, ...this.span(startTok) };
    }

    let init: DeclStmt | null = null;
    const initExprs: ExprNode[] = [];
    if (!this.check(';')) {
      if (this.looksLikeDeclaration()) {
        const declStart = this.peek();
        const quals = this.parseQualifiers();
        const spec = this.parseTypePart(quals);
        if (!spec) throw new ParseError('for 的初始化声明无法识别。', 'for-init');
        const header = this.parseDeclaratorHeader();
        const declarators: DeclaratorNode[] = [this.finishDeclarator(header, spec)];
        while (this.match(',')) {
          declarators.push(this.finishDeclarator(this.parseDeclaratorHeader(), spec));
        }
        this.expectSemi();
        const decl: VarDeclNode = {
          kind: 'vardecl',
          typeSpec: spec,
          declarators,
          ...this.span(declStart),
        };
        init = { kind: 'decl', decl, ...this.span(declStart) };
      } else {
        while (!this.atEnd() && !this.check(';')) {
          initExprs.push(this.parseAssignment());
          if (!this.match(',')) break;
        }
        this.expect(';');
      }
    } else {
      this.advance();
    }

    const cond = this.check(';') ? null : this.parseCommaExpr();
    this.expect(';');

    const update: ExprNode[] = [];
    while (!this.atEnd() && !this.check(')')) {
      update.push(this.parseAssignment());
      if (!this.match(',')) break;
    }
    this.expect(')');
    const body = this.parseStatement();
    return { kind: 'for', init, initExprs, cond, update, body, ...this.span(startTok) };
  }

  private parseSwitch(): SwitchStmt {
    const startTok = this.advance();
    this.expect('(');
    const expr = this.parseCommaExpr();
    this.expect(')');
    this.expect('{');
    const cases: SwitchCaseNode[] = [];
    while (!this.atEnd() && !this.check('}')) {
      const before = this.pos;
      try {
        if (this.check('case')) {
          const caseTok = this.advance();
          const valueExpr = this.parseConditional();
          this.expect(':');
          cases.push({
            label: `case ${exprToText(valueExpr)}`,
            isDefault: false,
            valueExpr,
            statements: [],
            ...this.span(caseTok),
          });
        } else if (this.check('default')) {
          const caseTok = this.advance();
          this.expect(':');
          cases.push({
            label: 'default',
            isDefault: true,
            statements: [],
            ...this.span(caseTok),
          });
        } else {
          if (cases.length === 0) {
            // 在第一个 case 之前出现语句：建一个隐式 case 承接
            cases.push({
              label: 'case ?',
              isDefault: false,
              statements: [],
              ...this.span(this.peek()),
            });
          }
          cases[cases.length - 1].statements.push(this.parseStatement());
        }
      } catch (err) {
        this.recoverFromError(err, before);
      }
      if (this.pos === before && !this.atEnd()) this.advance();
    }
    this.expect('}');
    return { kind: 'switch', expr, cases, ...this.span(startTok) };
  }

  private parseReturn(): StmtNode {
    const startTok = this.advance();
    let expr: ExprNode | undefined;
    if (!this.check(';') && !this.check('}') && !this.atEnd()) {
      expr = this.parseCommaExpr();
    }
    this.expectSemi();
    return { kind: 'return', expr, ...this.span(startTok) };
  }

  /* ============================== 表达式 ============================== */

  private parseCommaExpr(): ExprNode {
    const startTok = this.peek();
    const first = this.parseAssignment();
    if (!this.check(',')) return first;
    const items: ExprNode[] = [first];
    while (this.match(',')) {
      if (this.check(')') || this.check(';') || this.atEnd()) break;
      items.push(this.parseAssignment());
    }
    return { kind: 'comma', items, ...this.span(startTok) };
  }

  private parseAssignment(): ExprNode {
    const startTok = this.peek();
    const left = this.parseConditional();
    const op = this.peek().text;
    if (ASSIGN_OPS.has(op)) {
      this.advance();
      const right = this.parseAssignment();
      return { kind: 'assign', op, target: left, value: right, ...this.span(startTok) };
    }
    return left;
  }

  private parseConditional(): ExprNode {
    const startTok = this.peek();
    const cond = this.parseBinaryExpr(3);
    if (this.check('?')) {
      this.advance();
      const whenTrue = this.parseAssignment();
      this.expect(':');
      const whenFalse = this.parseAssignment();
      return {
        kind: 'ternary',
        cond,
        whenTrue,
        whenFalse,
        ...this.span(startTok),
      };
    }
    return cond;
  }

  private parseBinaryExpr(minPrec: number): ExprNode {
    const startTok = this.peek();
    let left = this.parseUnary();
    for (;;) {
      const op = this.peek().text;
      const prec = BINARY_PRECEDENCE[op];
      if (prec === undefined || prec < minPrec) break;
      this.advance();
      const right = this.parseBinaryExpr(prec + 1);
      left = { kind: 'binary', op, left, right, ...this.span(startTok) };
    }
    return left;
  }

  private parseUnary(): ExprNode {
    const tok = this.peek();

    if (['-', '+', '!', '~', '&', '*', '++', '--'].includes(tok.text) && tok.kind === 'punct') {
      this.advance();
      const operand = this.parseUnary();
      return { kind: 'unary', op: tok.text, operand, ...this.span(tok) };
    }

    if (tok.text === 'sizeof') {
      this.advance();
      if (this.check('(')) {
        const saved = this.pos;
        try {
          this.advance();
          const spec = this.parseTypePart(emptyQuals());
          if (spec && (isBuiltinTypeName(spec.base) || this.knownTypes.has(spec.base) || this.knownTypes.has(spec.text))) {
            while (this.check('*')) this.advance();
            if (this.check(')')) {
              this.advance();
              return { kind: 'sizeof', typeText: spec.text, ...this.span(tok) };
            }
          }
        } catch {
          // 回退为表达式
        }
        this.pos = saved;
      }
      const operand = this.parseUnary();
      return { kind: 'sizeof', expr: operand, ...this.span(tok) };
    }

    if (tok.text === 'new') {
      this.advance();
      const spec = this.parseTypePart(emptyQuals());
      const typeText = spec ? spec.text : 'int';
      let arraySize: ExprNode | undefined;
      if (this.check('[')) {
        this.advance();
        arraySize = this.parseCommaExpr();
        this.expect(']');
      }
      const args: ExprNode[] = [];
      if (this.check('(')) {
        this.advance();
        while (!this.atEnd() && !this.check(')')) {
          args.push(this.parseAssignment());
          if (!this.match(',')) break;
        }
        this.expect(')');
      }
      return { kind: 'new', typeText, args, arraySize, ...this.span(tok) };
    }

    if (tok.text === 'delete') {
      this.advance();
      let isArray = false;
      if (this.check('[')) {
        this.advance();
        this.expect(']');
        isArray = true;
      }
      const expr = this.parseUnary();
      return { kind: 'delete', expr, isArray, ...this.span(tok) };
    }

    if (tok.text === '(') {
      const castType = this.tryCastTypeText();
      if (castType) {
        const expr = this.parseUnary();
        return { kind: 'cast', typeText: castType, expr, ...this.span(tok) };
      }
    }

    return this.parsePostfix(this.parsePrimary());
  }

  private tryCastTypeText(): string | null {
    const saved = this.pos;
    if (!this.check('(')) return null;
    const next = this.peek(1);
    const startsType =
      TYPE_WORDS.has(next.text) ||
      QUAL_WORDS.has(next.text) ||
      ['struct', 'class', 'union', 'enum', 'size_t'].includes(next.text) ||
      (next.kind === 'ident' && this.knownTypes.has(next.text)) ||
      next.text === '::';
    if (!startsType) return null;
    try {
      this.advance();
      const spec = this.parseTypePart(emptyQuals());
      if (!spec) {
        this.pos = saved;
        return null;
      }
      // 指针 / 引用的星号必须留在类型文本里，否则 (int*) 会退化成 (int)，
      // 强转后的指针被当成整数转换，堆指针就丢了
      let castText = spec.text;
      while (this.check('*') || this.check('&')) castText += this.advance().text;
      if (!this.check(')')) {
        this.pos = saved;
        return null;
      }
      this.advance();
      if (!this.canStartExpression()) {
        this.pos = saved;
        return null;
      }
      return castText;
    } catch {
      this.pos = saved;
      return null;
    }
  }

  private canStartExpression(): boolean {
    const token = this.peek();
    if (token.kind === 'number' || token.kind === 'string' || token.kind === 'char') return true;
    if (token.kind === 'ident') return true;
    if (token.kind === 'keyword') {
      return ['true', 'false', 'nullptr', 'new', 'delete', 'sizeof', 'this', 'static_cast', 'dynamic_cast', 'reinterpret_cast', 'const_cast'].includes(token.text);
    }
    return ['(', '!', '~', '-', '+', '&', '*', '++', '--', '{'].includes(token.text);
  }

  private parsePostfix(base: ExprNode): ExprNode {
    let expr = base;
    let guard = 0;
    while (!this.atEnd() && guard++ < 64) {
      if (this.check('(')) {
        const callTok = this.peek();
        this.advance();
        const args: ExprNode[] = [];
        while (!this.atEnd() && !this.check(')')) {
          args.push(this.parseAssignment());
          if (!this.match(',')) break;
        }
        this.expect(')');
        expr = {
          kind: 'call',
          callee: expr,
          args,
          name: this.calleeName(expr),
          ...this.span(callTok),
        };
        continue;
      }
      if (this.check('[')) {
        const startTok = this.peek();
        this.advance();
        const index = this.parseCommaExpr();
        this.expect(']');
        expr = { kind: 'index', object: expr, index, ...this.span(startTok) };
        continue;
      }
      if (this.check('.') || this.check('->') || this.check('::')) {
        const startTok = this.peek();
        const op = this.advance().text as '.' | '->' | '::';
        let name = '';
        if (this.peek().kind === 'ident' || this.peek().kind === 'keyword') name = this.advance().text;
        else if (this.check('~')) {
          this.advance();
          name = `~${this.peek().kind === 'ident' ? this.advance().text : ''}`;
        }
        expr = { kind: 'member', object: expr, name, op, ...this.span(startTok) };
        continue;
      }
      if (this.check('++') || this.check('--')) {
        const startTok = this.peek();
        const op = this.advance().text as '++' | '--';
        expr = { kind: 'postfix', op, operand: expr, ...this.span(startTok) };
        continue;
      }
      break;
    }
    return expr;
  }

  private calleeName(expr: ExprNode): string {
    if (expr.kind === 'ident') return expr.name;
    if (expr.kind === 'member') return expr.name;
    if (expr.kind === 'cast') return expr.typeText;
    return '';
  }

  private parsePrimary(): ExprNode {
    const tok = this.peek();

    if (tok.kind === 'number') {
      this.advance();
      return {
        kind: 'number',
        value: tok.num ?? 0,
        raw: tok.text,
        isFloat: tok.isFloat === true,
        ...this.span(tok),
      };
    }
    if (tok.kind === 'string') {
      this.advance();
      let value = tok.value ?? '';
      while (this.peek().kind === 'string') {
        value += this.peek().value ?? '';
        this.advance();
      }
      return { kind: 'string', value, raw: tok.text, ...this.span(tok) };
    }
    if (tok.kind === 'char') {
      this.advance();
      return { kind: 'char', value: tok.value ?? '', raw: tok.text, ...this.span(tok) };
    }
    if (tok.text === 'true' || tok.text === 'false') {
      this.advance();
      return { kind: 'bool', value: tok.text === 'true', ...this.span(tok) };
    }
    if (tok.text === 'nullptr' || tok.text === 'NULL') {
      this.advance();
      return { kind: 'null', ...this.span(tok) };
    }
    if (tok.text === '(') {
      this.advance();
      const expr = this.parseCommaExpr();
      this.expect(')');
      return expr;
    }
    if (tok.text === '{') {
      return this.parseInitList();
    }
    if (tok.text === '[') {
      // lambda：整体跳过
      const startTok = tok;
      let text = '';
      let guard = 0;
      while (!this.atEnd() && guard++ < 400) {
        if (this.check('[')) {
          text += this.collectBalanced('[', ']');
          continue;
        }
        if (this.check('(')) {
          text += this.collectBalanced('(', ')');
          continue;
        }
        if (this.check('{')) {
          text += this.collectBalanced('{', '}');
          break;
        }
        break;
      }
      return { kind: 'lambda', text: text || '[]', ...this.span(startTok) };
    }
    if (tok.text === '::') {
      this.advance();
      const name = this.expectName();
      return { kind: 'ident', name: name.text, ...this.span(tok) };
    }
    if (tok.kind === 'ident' || tok.kind === 'keyword') {
      this.advance();
      return { kind: 'ident', name: tok.text, ...this.span(tok) };
    }

    this.advance();
    return { kind: 'unknown', text: tok.text, ...this.span(tok) };
  }

  private parseInitList(): ExprNode {
    const startTok = this.expect('{');
    const items: ExprNode[] = [];
    while (!this.atEnd() && !this.check('}')) {
      // 指派初始化器：.x = 1 / [2] = 3
      if (this.check('.') && this.peek(1).kind === 'ident' && this.peek(2).text === '=') {
        this.advance();
        this.advance();
        this.advance();
      } else if (this.check('[')) {
        this.advance();
        this.parseAssignment();
        this.expect(']');
        this.match('=');
      }
      items.push(this.parseInitializer());
      if (!this.match(',')) break;
    }
    this.expect('}');
    return { kind: 'initlist', items, ...this.span(startTok) };
  }

  private parseInitializer(): ExprNode {
    if (this.check('{')) return this.parseInitList();
    return this.parseAssignment();
  }

  /* ============================== 容错辅助 ============================== */

  private looksLikeDeclaration(): boolean {
    const token = this.peek();

    if (token.kind === 'keyword') {
      return (
        TYPE_WORDS.has(token.text) ||
        QUAL_WORDS.has(token.text) ||
        token.text === 'struct' ||
        token.text === 'class' ||
        token.text === 'enum' ||
        token.text === 'union'
      );
    }
    if (token.kind !== 'ident') return false;

    if (this.knownTypes.has(token.text)) {
      const next = this.peek(1);
      if (next.kind === 'ident') return true;
      if (next.text === '&' || next.text === '*' || next.text === '::' || next.text === '<') return true;
      return false;
    }

    let i = 1;
    let sawQualified = false;
    while (this.peek(i).text === '::') {
      sawQualified = true;
      i += 2;
    }
    if (sawQualified) {
      if (this.peek(i).text === '<') i = this.skipBalancedIndex(i, '<', '>');
      return this.peek(i).kind === 'ident';
    }

    const next = this.peek(1);
    if (next.kind === 'ident') return true;
    if (next.text === '&' || next.text === '*') {
      const after = this.peek(2);
      if (after.kind === 'ident') {
        const follow = this.peek(3).text;
        if ([';', '=', '(', ')', ',', '[', '{', ':', '*'].includes(follow)) return true;
      }
      return false;
    }
    if (next.text === '<') {
      const after = this.skipBalancedIndex(1, '<', '>');
      return this.peek(after).kind === 'ident';
    }
    return false;
  }

  private skipBalancedIndex(startIndex: number, open: string, close: string): number {
    let depth = 0;
    for (let i = startIndex; i < startIndex + 400; i++) {
      const token = this.peek(i);
      if (token.kind === 'eof') return i;
      if (token.text === open) depth++;
      else if (token.text === close) {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return startIndex + 1;
  }

  private collectBalanced(open: string, close: string): string {
    let depth = 0;
    let text = '';
    let guard = 0;
    while (!this.atEnd() && guard++ < 600) {
      const token = this.advance();
      text += token.text;
      if (token.text === open) depth++;
      else if (token.text === close) {
        depth--;
        if (depth === 0) break;
      }
    }
    return text;
  }

  private skipBalanced(open: string, close: string): void {
    if (!this.check(open)) return;
    this.collectBalanced(open, close);
  }

  private skipToSemi(): void {
    let depth = 0;
    let guard = 0;
    while (!this.atEnd() && guard++ < 4000) {
      const token = this.peek();
      if (token.text === '{') depth++;
      else if (token.text === '}') {
        if (depth === 0) return;
        depth--;
      } else if (token.text === ';' && depth === 0) {
        this.advance();
        return;
      }
      this.advance();
    }
  }

  private skipToBraceOrSemi(): void {
    let guard = 0;
    while (!this.atEnd() && guard++ < 4000) {
      if (this.check('{') || this.check(';')) return;
      this.advance();
    }
  }

  private skipFriend(): void {
    this.advance(); // friend
    let depth = 0;
    let guard = 0;
    while (!this.atEnd() && guard++ < 1000) {
      const token = this.peek();
      if (token.text === ';' && depth === 0) {
        this.advance();
        return;
      }
      if (token.text === '{') depth++;
      else if (token.text === '}') {
        if (depth === 0) return;
        depth--;
      }
      this.advance();
    }
  }

  private consumeTemplatePrefix(): void {
    this.advance(); // template
    if (this.check('<')) this.consumeTemplateArgText();
  }

  private tokensText(start: number, end: number): string {
    let text = '';
    for (let i = start; i < end && i < this.tokens.length; i++) {
      const token = this.tokens[i];
      if (!token) continue;
      if (text && /[A-Za-z0-9_]$/.test(text) && /^[A-Za-z0-9_]/.test(token.text)) text += ' ';
      text += token.text;
    }
    return text.trim();
  }

  private expectSemi(): void {
    if (this.match(';')) return;
    if (this.check('}') || this.atEnd()) return;
    const token = this.peek();
    this.addDiag(
      'error',
      '这里缺少分号 ;，语句可能没有正确结束。',
      token.line,
      'missing-semicolon',
      token.column,
    );
  }

  private recoverFromError(err: unknown, startPos: number): void {
    const isParseError = err instanceof ParseError;
    const message = isParseError ? err.message : '这段代码无法解析，已跳过。';
    const rule = isParseError ? err.rule : 'parse-error';
    const token = this.peek();
    this.addDiag('error', message, token.line, rule, token.column);
    this.program.parseErrors++;

    if (this.pos === startPos) this.advance();

    let depth = 0;
    let guard = 0;
    while (!this.atEnd() && guard++ < 8000) {
      const current = this.peek();
      if (current.text === '{') depth++;
      else if (current.text === '}') {
        if (depth === 0) return;
        depth--;
      } else if (current.text === ';' && depth === 0) {
        this.advance();
        return;
      }
      this.advance();
    }
  }
}

/** 便捷入口：token 流 → ProgramNode + 诊断 */
export function parseTokens(tokens: Token[]): ParseResult {
  const parser = new Parser(tokens);
  return parser.parse();
}
