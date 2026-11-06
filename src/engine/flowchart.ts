/**
 * 结构化流程图构建
 * ------------------------------------------------------------------
 * 把函数体 AST 降低成一棵结构化的 FlowchartNode 树：
 * - 顺序语句合并成 process 节点（保留每行行号）；
 * - if / while / for / do / switch 变成对应结构节点；
 * - return / break / continue 作为终止路径的叶子；
 * - scanf / cin → input，printf / cout → output，其它调用 → call。
 * 所有节点 id 以函数 id 为前缀，稳定且全局唯一。
 */
import type { FlowchartData, FlowchartNode, SwitchCaseFlow } from './types';
import type { FuncDeclNode, StmtNode, SwitchCaseNode } from './ast';
import { detectCallExpression, detectIOExpression } from './io';
import { exprToText, oneLine, shortType, stmtToText, truncateText } from './utils';

export interface FlowchartFunctionInput {
  id: string;
  displayName: string;
  node: FuncDeclNode;
}

class FlowchartBuilder {
  private readonly fnId: string;
  private counter = 0;
  private count = 0;

  constructor(fnId: string) {
    this.fnId = fnId;
  }

  get nodeCount(): number {
    return this.count;
  }

  private nextId(): string {
    this.counter++;
    return `${this.fnId}_n${this.counter}`;
  }

  private make(
    kind: FlowchartNode['kind'],
    line: number,
    label: string,
    extra: Partial<FlowchartNode> = {},
  ): FlowchartNode {
    this.count++;
    return {
      id: this.nextId(),
      kind,
      line,
      label,
      ...extra,
    };
  }

  build(node: FuncDeclNode): FlowchartData {
    const bodyNodes = node.body ? this.lowerStatements(node.body.statements) : [];
    if (bodyNodes.length === 0) {
      bodyNodes.push(
        this.make('process', node.line, '空函数体', {
          code: node.signature,
          lines: [node.line],
        }),
      );
    }
    const start = this.make('start', node.line, '开始', { code: node.signature });
    const end = this.make('end', node.endLine, '结束');
    const entry = this.make('block', node.line, node.name || '函数', {
      children: [start, ...bodyNodes, end],
      endLine: node.endLine,
    });
    // entry 的 id 也要以函数 id 开头
    entry.id = `${this.fnId}_entry`;
    return {
      functionId: this.fnId,
      functionName: node.name || '函数',
      entry,
      nodeCount: this.count,
    };
  }

  /* ---------------- 顺序语句降低 ---------------- */

  private lowerStatements(statements: StmtNode[]): FlowchartNode[] {
    const result: FlowchartNode[] = [];
    let group: StmtNode[] = [];

    const flush = (): void => {
      if (group.length === 0) return;
      result.push(this.makeProcess(group));
      group = [];
    };

    for (const stmt of statements) {
      if (stmt.kind === 'empty') continue;
      if (stmt.kind === 'block') {
        flush();
        result.push(...this.lowerStatements(stmt.statements));
        continue;
      }
      if (stmt.kind === 'labeled') {
        flush();
        result.push(...this.lowerStatements([stmt.statement]));
        continue;
      }
      if (this.isSimple(stmt)) {
        group.push(stmt);
        continue;
      }
      flush();
      result.push(...this.lowerStructured(stmt));
    }
    flush();
    return result;
  }

  private isSimple(stmt: StmtNode): boolean {
    if (stmt.kind === 'decl') return true;
    if (stmt.kind === 'empty') return true;
    if (stmt.kind !== 'expr') return false;
    if (detectIOExpression(stmt.expr)) return false;
    if (detectCallExpression(stmt.expr)) return false;
    return true;
  }

  private describeStatement(stmt: StmtNode): string {
    if (stmt.kind === 'decl') {
      const names = stmt.decl.declarators
        .map((d) => {
          const dims = d.arrayDims.length > 0 ? `[${d.arrayDims.map((x) => (x === null ? '' : String(x))).join('][')}]` : '';
          return `${d.name}${dims}`;
        })
        .join('、');
      return `声明 ${shortType(stmt.decl.typeSpec.text)} ${names}`;
    }
    if (stmt.kind === 'expr') return oneLine(exprToText(stmt.expr));
    return oneLine(stmtToText(stmt));
  }

  private makeProcess(group: StmtNode[]): FlowchartNode {
    const descriptions = group.map((s) => this.describeStatement(s));
    const joined = descriptions.join('；');
    const label = truncateText(joined, 30);
    const lines: number[] = [];
    for (const stmt of group) lines.push(stmt.line);
    const first = group[0];
    const last = group[group.length - 1];
    return this.make('process', first.line, label, {
      endLine: last.endLine,
      code: truncateText(group.map((s) => oneLine(stmtToText(s))).join(' '), 160),
      lines,
    });
  }

  /* ---------------- 结构语句降低 ---------------- */

  private lowerStructured(stmt: StmtNode): FlowchartNode[] {
    switch (stmt.kind) {
      case 'if':
        return [this.lowerIf(stmt)];
      case 'while':
      case 'doWhile':
      case 'for':
      case 'rangeFor':
        return [this.lowerLoop(stmt)];
      case 'switch':
        return [this.lowerSwitch(stmt)];
      case 'return':
        return [
          this.make('return', stmt.line, stmt.expr ? `返回 ${truncateText(oneLine(exprToText(stmt.expr)), 20)}` : '返回', {
            code: oneLine(stmtToText(stmt)),
          }),
        ];
      case 'break':
        return [this.make('break', stmt.line, '跳出循环', { code: 'break;' })];
      case 'continue':
        return [this.make('continue', stmt.line, '进入下一次循环', { code: 'continue;' })];
      case 'goto':
        return [this.make('process', stmt.line, `跳转到 ${stmt.label}`, { code: `goto ${stmt.label};` })];
      case 'expr': {
        const io = detectIOExpression(stmt.expr);
        if (io) {
          return [
            this.make(io.kind === 'input' ? 'input' : 'output', stmt.line, io.label, {
              code: oneLine(stmtToText(stmt)),
            }),
          ];
        }
        const call = detectCallExpression(stmt.expr);
        if (call) {
          return [
            this.make('call', stmt.line, call.label, {
              callName: call.name,
              calls: [call.name],
              code: oneLine(stmtToText(stmt)),
            }),
          ];
        }
        return [this.makeProcess([stmt])];
      }
      case 'decl':
        return [this.makeProcess([stmt])];
      case 'unknown':
        return [
          this.make('process', stmt.line, '无法解析的语句', {
            code: stmt.text,
          }),
        ];
      case 'block':
        return this.lowerStatements(stmt.statements);
      case 'labeled':
        return this.lowerStructured(stmt.statement);
      case 'empty':
        return [];
      default:
        return [];
    }
  }

  private lowerBranch(stmt: StmtNode, fallbackLine: number): FlowchartNode {
    if (stmt.kind === 'block') {
      const children = this.lowerStatements(stmt.statements);
      return this.make('block', stmt.line, '分支', {
        children,
        endLine: stmt.endLine,
      });
    }
    const children = this.lowerStatements([stmt]);
    return this.make('block', stmt.line || fallbackLine, '分支', {
      children,
      endLine: stmt.endLine,
    });
  }

  private lowerIf(stmt: StmtNode & { kind: 'if' }): FlowchartNode {
    const condition = oneLine(exprToText(stmt.cond));
    const yes = this.lowerBranch(stmt.then, stmt.line);
    const no = stmt.else
      ? this.lowerBranch(stmt.else, stmt.line)
      : this.make('block', stmt.line, '否', { children: [] });
    return this.make('decision', stmt.line, `判断 ${truncateText(condition, 18)}`, {
      condition,
      yes,
      no,
      code: oneLine(stmtToText(stmt)),
      endLine: stmt.endLine,
    });
  }

  private lowerLoop(stmt: StmtNode & { kind: 'while' | 'doWhile' | 'for' | 'rangeFor' }): FlowchartNode {
    const body = this.lowerBranch(stmt.body, stmt.line);
    if (stmt.kind === 'while') {
      const condition = oneLine(exprToText(stmt.cond));
      return this.make('loop', stmt.line, `当 ${truncateText(condition, 22)}`, {
        condition,
        body,
        loopKind: 'while',
        testAfter: false,
        code: oneLine(stmtToText(stmt)),
        endLine: stmt.endLine,
      });
    }
    if (stmt.kind === 'doWhile') {
      const condition = oneLine(exprToText(stmt.cond));
      return this.make('loop', stmt.line, 'do-while 循环', {
        condition,
        body,
        loopKind: 'do',
        testAfter: true,
        code: oneLine(stmtToText(stmt)),
        endLine: stmt.endLine,
      });
    }
    if (stmt.kind === 'rangeFor') {
      const condition = oneLine(exprToText(stmt.iterable));
      return this.make('loop', stmt.line, `遍历 ${truncateText(condition, 20)}`, {
        condition,
        body,
        loopKind: 'for',
        testAfter: false,
        code: oneLine(stmtToText(stmt)),
        endLine: stmt.endLine,
      });
    }
    const initText = this.describeForInit(stmt);
    const condition = stmt.cond ? oneLine(exprToText(stmt.cond)) : 'true';
    const updateText = stmt.update.map((e) => oneLine(exprToText(e))).join(', ');
    const label = truncateText(
      `for (${[initText, condition, updateText].filter((t) => t.length > 0).join('; ')})`,
      30,
    );
    return this.make('loop', stmt.line, label, {
      condition,
      body,
      loopKind: 'for',
      testAfter: false,
      code: oneLine(stmtToText(stmt)),
      endLine: stmt.endLine,
    });
  }

  private describeForInit(stmt: StmtNode & { kind: 'for' }): string {
    if (stmt.init) {
      const names = stmt.init.decl.declarators
        .map((d) => `${d.name}${d.init ? ` = ${oneLine(exprToText(d.init))}` : ''}`)
        .join(', ');
      return names;
    }
    return stmt.initExprs.map((e) => oneLine(exprToText(e))).join(', ');
  }

  private lowerSwitch(stmt: StmtNode & { kind: 'switch' }): FlowchartNode {
    const condition = oneLine(exprToText(stmt.expr));
    const cases: SwitchCaseFlow[] = stmt.cases.map((caseNode) => this.lowerCase(caseNode));
    return this.make('switch', stmt.line, `分支选择 ${truncateText(condition, 16)}`, {
      condition,
      cases,
      code: oneLine(stmtToText(stmt)),
      endLine: stmt.endLine,
    });
  }

  private lowerCase(caseNode: SwitchCaseNode): SwitchCaseFlow {
    const body = this.make('block', caseNode.line, caseNode.label, {
      children: this.lowerStatements(caseNode.statements),
      endLine: caseNode.endLine,
    });
    return {
      label: caseNode.label,
      line: caseNode.line,
      isDefault: caseNode.isDefault,
      body,
    };
  }
}

/** 为一批函数生成流程图（只处理有函数体的函数） */
export function buildFlowcharts(functions: FlowchartFunctionInput[]): FlowchartData[] {
  const result: FlowchartData[] = [];
  for (const fn of functions) {
    if (!fn.node.body) continue;
    try {
      const builder = new FlowchartBuilder(fn.id);
      result.push(builder.build(fn.node));
    } catch {
      // 单个函数流程图构建失败不影响其它函数
    }
  }
  return result;
}
