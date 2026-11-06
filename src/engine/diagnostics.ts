/**
 * 诊断规则
 * ------------------------------------------------------------------
 * 目标：给初学者可执行的中文提示，同时避免对合法代码误报。
 * 规则覆盖：括号 / 分号、缺少返回值、条件里误用赋值、scanf 缺 &、
 * 数组越界、未使用变量、除零、printf 参数数量、空循环体、未定义函数、
 * 重复定义、解析跳过等。最多输出 40 条，按行号排序。
 */
import type { Diagnostic, DiagnosticSeverity } from './types';
import type { AnalysisModel } from './model';
import type { FuncDeclNode } from './ast';
import { collectExprs, walkExpr, walkStmt } from './ast';
import type { ExprNode } from './ast';
import type { LexIssue } from './tokenizer';
import { parseFormat, printfArgCount, scanfNeedsAddress } from './io';
import { truncateText } from './utils';

export interface DiagnosticInput {
  model: AnalysisModel;
  parserDiagnostics: Diagnostic[];
  lexIssues: LexIssue[];
  maxLines?: number;
}

const STD_FUNCTION_NAMES: ReadonlySet<string> = new Set([
  'printf',
  'scanf',
  'puts',
  'gets',
  'putchar',
  'getchar',
  'strlen',
  'strcpy',
  'strcat',
  'strcmp',
  'memset',
  'memcpy',
  'malloc',
  'calloc',
  'realloc',
  'free',
  'fopen',
  'fclose',
  'fprintf',
  'fscanf',
  'fgets',
  'fputs',
  'fread',
  'fwrite',
  'sqrt',
  'pow',
  'fabs',
  'abs',
  'sin',
  'cos',
  'tan',
  'floor',
  'ceil',
  'rand',
  'srand',
  'time',
  'exit',
  'sort',
  'max',
  'min',
  'tolower',
  'toupper',
  'getline',
  'push_back',
  'pop_back',
  'size',
  'length',
  'substr',
  'c_str',
  'begin',
  'end',
  'find',
  'insert',
  'erase',
  'empty',
  'at',
]);

const TARGET_CAP = 40;

export function buildDiagnostics(input: DiagnosticInput): Diagnostic[] {
  const { model } = input;
  const diagnostics: Diagnostic[] = [];

  const add = (
    severity: DiagnosticSeverity,
    message: string,
    line: number,
    rule: string,
    hint?: string,
    column?: number,
  ): void => {
    diagnostics.push({ severity, message, line, rule, hint, column });
  };

  // ---------- 解析器与词法问题 ----------
  for (const diagnostic of input.parserDiagnostics) {
    diagnostics.push(diagnostic);
  }
  for (const issue of input.lexIssues) {
    add('error', issue.message, issue.line, issue.rule, '检查字符串 / 注释是否完整闭合。', issue.column);
  }

  // ---------- 行数上限 ----------
  const totalLines = input.model.code.split(/\r\n|\r|\n/).length;
  const maxLines = input.maxLines ?? 500;
  if (totalLines > maxLines) {
    add(
      'error',
      `代码共 ${totalLines} 行，超过 ${maxLines} 行建议上限。图表仍会尽量分析，但建议拆成更小的片段。`,
      Math.min(maxLines + 1, totalLines),
      'line-limit',
      '把与演示无关的代码删掉，或只粘贴想分析的那个函数。',
    );
  }

  // ---------- 全局名字集合 ----------
  const globalNames = new Set(model.globals.map((g) => g.name));
  const knownFunctionNames = new Set<string>();
  for (const record of model.records) knownFunctionNames.add(record.node.name);
  for (const cls of model.classes) knownFunctionNames.add(cls.name);

  // ---------- 逐函数规则 ----------
  for (const record of model.records) {
    const body = record.node.body;
    if (!body) continue;

    const localNames = new Set(record.locals.map((l) => l.name));
    const paramNames = new Set(record.params.map((p) => p.name));
    const declaredNames = new Set<string>([...localNames, ...paramNames, ...globalNames]);
    const arraysInScope = new Map<string, number[]>();
    for (const global of model.globals) {
      if (global.isArray && global.arrayDims) arraysInScope.set(global.name, global.arrayDims);
    }
    for (const local of record.locals) {
      if (local.isArray && local.arrayDims) arraysInScope.set(local.name, local.arrayDims);
    }
    const pointerNames = new Set<string>();
    for (const global of model.globals) if (global.isPointer) pointerNames.add(global.name);
    for (const local of record.locals) if (local.isPointer) pointerNames.add(local.name);
    for (const param of record.params) if (param.isPointer) pointerNames.add(param.name);

    // 2. 非 void 函数缺少返回值（构造函数 / 析构函数不算）
    const returnTypeText = record.node.returnType.trim();
    const voidLike =
      returnTypeText === '' ||
      record.node.isConstructor === true ||
      record.node.isDestructor === true ||
      /^void$/.test(returnTypeText);
    if (
      record.node.name !== 'main' &&
      !voidLike &&
      !record.hasReturnOnAllPaths
    ) {
      add(
        'warning',
        `函数 ${record.node.name} 声明返回 ${record.node.returnType || '一个值'}，但存在没有 return 的执行路径。`,
        record.node.line,
        'missing-return',
        '检查 if / else 是否覆盖了所有情况，或在函数末尾补一个 return。',
      );
    }

    // 3. 条件中误用赋值
    const checkCondition = (cond: ExprNode | undefined, keyword: string): void => {
      walkExpr(cond, (expr) => {
        if (expr.kind !== 'assign' || expr.op !== '=') return;
        const target = expr.target;
        if (target.kind === 'ident' && declaredNames.has(target.name)) {
          add(
            'warning',
            `${keyword} 的条件里使用了赋值 =（给 ${target.name} 赋值），是不是想写 == 比较？`,
            expr.line,
            'assignment-in-condition',
            `如果确实想赋值，请先单独写一行 ${target.name} = ...; 再判断。`,
          );
        }
      });
    };

    walkStmt(body, (stmt) => {
      if (stmt.kind === 'if') checkCondition(stmt.cond, 'if');
      else if (stmt.kind === 'while') checkCondition(stmt.cond, 'while');
      else if (stmt.kind === 'doWhile') checkCondition(stmt.cond, 'do-while');
      else if (stmt.kind === 'for') checkCondition(stmt.cond ?? undefined, 'for');

      // 9. 空循环体
      if (
        (stmt.kind === 'while' || stmt.kind === 'for' || stmt.kind === 'doWhile') &&
        stmt.body.kind === 'empty'
      ) {
        add(
          'info',
          '循环体是空的（可能多写了一个分号），循环会空转。',
          stmt.line,
          'empty-loop-body',
          '把分号去掉，改用 { } 包住要重复执行的语句。',
        );
      }
    });

    // 4 / 8. scanf / printf 格式串
    for (const expr of collectExprs(body)) {
      if (expr.kind !== 'call') continue;
      if (expr.name === 'scanf' || expr.name === 'fscanf') {
        const formatIndex = expr.name === 'fscanf' ? 1 : 0;
        const formatExpr = expr.args[formatIndex];
        if (!formatExpr || formatExpr.kind !== 'string') continue;
        const specs = parseFormat(formatExpr.value);
        const conversions = specs.filter((s) => s.conv !== '%' && !s.suppressed);
        const args = expr.args.slice(formatIndex + 1);
        if (args.length < conversions.length) {
          add(
            'warning',
            `scanf 的格式串需要 ${conversions.length} 个参数，实际只提供了 ${args.length} 个。`,
            expr.line,
            'scanf-arg-count',
            '数一数格式串里的 %d / %f / %s，为每一个都提供对应的变量地址。',
          );
        } else if (args.length > conversions.length) {
          add(
            'info',
            `scanf 的参数比格式串里的转换符多（${args.length} > ${conversions.length}）。`,
            expr.line,
            'scanf-arg-count',
            '多余的参数不会生效，可以删掉或补充对应的格式符。',
          );
        }
        for (let i = 0; i < conversions.length && i < args.length; i++) {
          const spec = conversions[i];
          const arg = args[i];
          if (scanfNeedsAddress(spec)) {
            const isAddress = arg.kind === 'unary' && arg.op === '&';
            // 数组 / 指针本身就会退化成地址，scanf("%d", arr) 是合法的
            const isDecayedPointer =
              arg.kind === 'ident' && (arraysInScope.has(arg.name) || pointerNames.has(arg.name));
            if (!isAddress && !isDecayedPointer) {
              add(
                'warning',
                `scanf 的 %${spec.conv} 需要变量的地址，应写成 &变量名。`,
                arg.line,
                'scanf-missing-address',
                `试试 scanf("...", &${arg.kind === 'ident' ? arg.name : '变量'});`,
              );
            }
          } else if (spec.conv === 's') {
            const isArrayArg = arg.kind === 'ident' && arraysInScope.has(arg.name);
            const isPointerArg = arg.kind === 'ident' && pointerNames.has(arg.name);
            if (!isArrayArg && !isPointerArg && !(arg.kind === 'unary' && arg.op === '&')) {
              add(
                'info',
                'scanf 的 %s 需要字符数组（或已指向缓冲区的指针）。',
                arg.line,
                'scanf-string-target',
                '先声明 char buf[64]; 再写 scanf("%s", buf);',
              );
            }
          }
        }
        continue;
      }

      if (expr.name === 'printf') {
        const formatExpr = expr.args[0];
        if (!formatExpr || formatExpr.kind !== 'string') continue;
        const specs = parseFormat(formatExpr.value);
        let expected = printfArgCount(specs);
        for (const spec of specs) {
          if (spec.dynamicWidth) expected++;
        }
        const actual = expr.args.length - 1;
        if (actual < expected) {
          add(
            'warning',
            `printf 的格式串需要 ${expected} 个参数，实际只提供了 ${actual} 个。`,
            expr.line,
            'printf-arg-mismatch',
            '对照格式串里的 %d / %f / %s 检查参数数量。',
          );
        } else if (actual > expected) {
          add(
            'info',
            `printf 的参数比格式串里的转换符多（${actual} > ${expected}）。`,
            expr.line,
            'printf-arg-mismatch',
            '多余的参数不会输出，检查是否漏写了格式符。',
          );
        }
      }
    }

    // 5. 数组下标越界 / 7. 除零 / 未定义函数
    for (const expr of collectExprs(body)) {
      if (expr.kind === 'index' && expr.index.kind === 'number') {
        const indexValue = expr.index.value;
        let dims: number[] | undefined;
        let dimension = 0;
        if (expr.object.kind === 'ident') {
          dims = arraysInScope.get(expr.object.name);
          dimension = 0;
        } else if (expr.object.kind === 'index' && expr.object.object.kind === 'ident') {
          dims = arraysInScope.get(expr.object.object.name);
          dimension = 1;
        }
        if (dims && dims.length > dimension) {
          const limit = dims[dimension];
          if (limit > 0 && (indexValue < 0 || indexValue >= limit)) {
            add(
              'warning',
              `数组下标 ${indexValue} 超出范围，合法下标是 0 ~ ${limit - 1}。`,
              expr.line,
              'array-index-out-of-bounds',
              'C / C++ 数组下标从 0 开始，访问越界会导致未定义行为。',
            );
          }
        }
      }
      if (expr.kind === 'binary' && (expr.op === '/' || expr.op === '%')) {
        if (expr.right.kind === 'number' && expr.right.value === 0) {
          add(
            'warning',
            `除数是字面量 0，运行时会出错。`,
            expr.line,
            'division-by-zero',
            '确认除数不是 0，或在做除法前先判断除数是否为零。',
          );
        }
      }
    }

    // 6. 未使用的局部变量（参数不算）
    for (const local of record.locals) {
      if (local.used) continue;
      if (local.name.startsWith('_')) continue;
      add(
        'info',
        `变量 ${local.name} 声明后没有使用。`,
        local.line,
        'unused-variable',
        '删掉它，或检查是不是漏写了使用这个变量的代码。',
      );
    }

    // 11. 调用了源码中未定义的函数
    const reportedCalls = new Set<string>();
    for (const call of record.calls) {
      const name = call.callee;
      if (!name || reportedCalls.has(name)) continue;
      if (knownFunctionNames.has(name) || STD_FUNCTION_NAMES.has(name)) continue;
      reportedCalls.add(name);
      add(
        'info',
        `函数 ${name}() 没有在这段代码中定义，可能是标准库或外部函数。`,
        call.line,
        'undefined-function',
        `检查拼写；如果它来自头文件，请确认 #include 是否正确。`,
      );
    }
  }

  // 12. 重复定义
  const seenDefinitions = new Map<string, number>();
  const visitFunction = (fn: FuncDeclNode): void => {
    if (!fn.body) return;
    const key = `${fn.className ?? ''}|${fn.name}|${fn.params.map((p) => p.typeText).join(',')}`;
    const first = seenDefinitions.get(key);
    if (first === undefined) {
      seenDefinitions.set(key, fn.line);
    } else {
      add(
        'warning',
        `函数 ${fn.name} 被重复定义（第一次在第 ${first} 行）。`,
        fn.line,
        'duplicate-definition',
        '同一个函数在程序中只能有一份实现，删掉重复的或改名。',
      );
    }
  };
  for (const fn of model.program.functions) visitFunction(fn);
  for (const cls of model.classes) for (const method of cls.methods) visitFunction(method);

  // ---------- 去重 / 排序 / 截断 ----------
  const deduped: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.rule}|${diagnostic.line}|${diagnostic.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(diagnostic);
  }

  const rank: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };
  deduped.sort((a, b) => a.line - b.line || rank[a.severity] - rank[b.severity]);

  let kept = deduped;
  if (kept.length > TARGET_CAP) {
    const important = kept.filter((d) => d.severity !== 'info');
    const infos = kept.filter((d) => d.severity === 'info');
    kept = [...important, ...infos].slice(0, TARGET_CAP);
  }
  kept.sort((a, b) => a.line - b.line || rank[a.severity] - rank[b.severity]);

  // 保证提示文案不会过长
  return kept.map((diagnostic) => ({
    ...diagnostic,
    message: truncateText(diagnostic.message, 90),
    hint: diagnostic.hint ? truncateText(diagnostic.hint, 100) : undefined,
  }));
}
