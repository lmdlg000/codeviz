/**
 * 结构大纲：program → include / 全局声明 / class / struct / function → 主要语句
 * 供 UI 展示"AST 摘要树"，点击节点可定位源码行。
 */
import type { OutlineNode } from './types';
import type { AnalysisModel, FunctionRecord } from './model';
import type { StmtNode } from './ast';
import { detectCallExpression } from './io';
import { exprToText, oneLine, shortType, stmtToText, truncateText } from './utils';

const MAX_DEPTH = 12;

class OutlineBuilder {
  private counter = 0;

  private nextId(): string {
    this.counter++;
    return `outline_${this.counter}`;
  }

  build(model: AnalysisModel): OutlineNode {
    const root: OutlineNode = {
      id: 'outline_root',
      kind: 'program',
      label: '程序',
      line: 1,
      children: [],
    };
    const children = root.children as OutlineNode[];

    // 1. 预处理包含
    for (const include of model.program.includes) {
      children.push({
        id: this.nextId(),
        kind: 'include',
        label: include.system ? `#include <${include.path}>` : `#include "${include.path}"`,
        detail: include.system ? '系统头文件' : '本地头文件',
        line: include.line,
      });
    }

    // 2. 全局变量（含 typedef / enum 摘要）
    const globalItems = model.program.items.filter((item) => item.kind === 'vardecl');
    for (const item of globalItems) {
      if (item.kind !== 'vardecl') continue;
      const names = item.declarators.map((d) => d.name).join('、');
      children.push({
        id: this.nextId(),
        kind: 'global',
        label: `${shortType(item.typeSpec.text)} ${names}`,
        line: item.line,
        endLine: item.endLine,
        children: item.declarators.map((declarator) => ({
          id: this.nextId(),
          kind: 'declaration' as const,
          label: `${declarator.name}${declarator.init ? ` = ${truncateText(oneLine(exprToText(declarator.init)), 30)}` : ''}`,
          line: declarator.line,
          endLine: declarator.endLine,
        })),
      });
    }

    for (const item of model.program.items) {
      if (item.kind === 'typedef') {
        children.push({
          id: this.nextId(),
          kind: 'other',
          label: `typedef ${item.name}`,
          detail: item.target,
          line: item.line,
        });
      } else if (item.kind === 'enum') {
        children.push({
          id: this.nextId(),
          kind: 'other',
          label: `enum ${item.name}`,
          detail: item.enumerators.map((e) => e.name).join(', '),
          line: item.line,
          endLine: item.endLine,
        });
      }
    }

    // 3. 类 / 结构体
    for (const cls of model.classes) {
      const classChildren: OutlineNode[] = [];
      for (const field of cls.fields) {
        classChildren.push({
          id: this.nextId(),
          kind: 'declaration',
          label: `${shortType(field.typeText)} ${field.name}${field.arrayDims.length ? '[]' : ''}`,
          detail: field.access,
          line: field.line,
        });
      }
      for (const method of cls.methods) {
        classChildren.push(this.declNode(method, 2, cls.name));
      }
      children.push({
        id: this.nextId(),
        kind: cls.classKind === 'class' ? 'class' : 'struct',
        label: `${cls.classKind} ${cls.name}`,
        detail: cls.bases.map((b) => b.name).join(', ') || undefined,
        line: cls.line,
        endLine: cls.endLine,
        children: classChildren,
      });
    }

    // 4. 函数
    for (const record of model.records) {
      if (record.className) continue;
      children.push(this.functionNode(record, 1));
    }

    return root;
  }

  private functionNode(record: FunctionRecord, depth: number): OutlineNode {
    return this.declNode(record.node, depth, record.className);
  }

  private declNode(node: FunctionRecord['node'], depth: number, className?: string): OutlineNode {
    const children = node.body ? this.statementList(node.body.statements, depth + 1) : [];
    return {
      id: this.nextId(),
      kind: 'function',
      label: node.signature,
      detail: className,
      line: node.line,
      endLine: node.endLine,
      children,
    };
  }

  private statementList(statements: StmtNode[], depth: number): OutlineNode[] {
    if (depth > MAX_DEPTH) return [];
    return statements.map((statement) => this.statementNode(statement, depth));
  }

  private statementNode(statement: StmtNode, depth: number): OutlineNode {
    const base = {
      id: this.nextId(),
      line: statement.line,
      endLine: statement.endLine,
    };
    switch (statement.kind) {
      case 'block':
        return {
          ...base,
          kind: 'block',
          label: '代码块',
          children: this.statementList(statement.statements, depth + 1),
        };
      case 'decl':
        return {
          ...base,
          kind: 'declaration',
          label: truncateText(
            oneLine(
              `${shortType(statement.decl.typeSpec.text)} ${statement.decl.declarators
                .map((d) => d.name)
                .join('、')}`,
            ),
            40,
          ),
          detail: statement.decl.declarators
            .filter((d) => d.init)
            .map((d) => `${d.name} = ${oneLine(exprToText(d.init))}`)
            .join('；') || undefined,
        };
      case 'expr': {
        const call = detectCallExpression(statement.expr);
        if (call) {
          return {
            ...base,
            kind: 'call',
            label: truncateText(oneLine(stmtToText(statement)), 40),
            detail: call.name,
          };
        }
        if (statement.expr.kind === 'assign') {
          return {
            ...base,
            kind: 'assignment',
            label: truncateText(oneLine(exprToText(statement.expr)), 40),
          };
        }
        return {
          ...base,
          kind: 'other',
          label: truncateText(oneLine(stmtToText(statement)), 40),
        };
      }
      case 'if': {
        const children: OutlineNode[] = [];
        children.push(...this.branchNodes(statement.then, depth + 1));
        if (statement.else) {
          children.push({
            id: this.nextId(),
            kind: 'block',
            label: 'else',
            line: statement.else.line,
            endLine: statement.else.endLine,
            children: this.branchNodes(statement.else, depth + 1),
          });
        }
        return {
          ...base,
          kind: 'if',
          label: truncateText(`if (${oneLine(exprToText(statement.cond))})`, 44),
          children,
        };
      }
      case 'while':
        return {
          ...base,
          kind: 'loop',
          label: truncateText(`while (${oneLine(exprToText(statement.cond))})`, 44),
          children: this.branchNodes(statement.body, depth + 1),
        };
      case 'doWhile':
        return {
          ...base,
          kind: 'loop',
          label: truncateText(`do ... while (${oneLine(exprToText(statement.cond))})`, 44),
          children: this.branchNodes(statement.body, depth + 1),
        };
      case 'for': {
        const initText = statement.init
          ? statement.init.decl.declarators
              .map((d) => `${d.name}${d.init ? ` = ${oneLine(exprToText(d.init))}` : ''}`)
              .join(', ')
          : statement.initExprs.map((e) => oneLine(exprToText(e))).join(', ');
        const condText = statement.cond ? oneLine(exprToText(statement.cond)) : '';
        const updateText = statement.update.map((e) => oneLine(exprToText(e))).join(', ');
        return {
          ...base,
          kind: 'loop',
          label: truncateText(`for (${initText}; ${condText}; ${updateText})`, 48),
          children: this.branchNodes(statement.body, depth + 1),
        };
      }
      case 'rangeFor':
        return {
          ...base,
          kind: 'loop',
          label: truncateText(`for (${statement.declText} : ${oneLine(exprToText(statement.iterable))})`, 44),
          children: this.branchNodes(statement.body, depth + 1),
        };
      case 'switch':
        return {
          ...base,
          kind: 'switch',
          label: truncateText(`switch (${oneLine(exprToText(statement.expr))})`, 44),
          children: statement.cases.map((caseNode) => ({
            id: this.nextId(),
            kind: 'block' as const,
            label: caseNode.label,
            line: caseNode.line,
            children: this.statementList(caseNode.statements, depth + 1),
          })),
        };
      case 'return':
        return {
          ...base,
          kind: 'return',
          label: truncateText(stmtToText(statement), 44),
        };
      case 'break':
      case 'continue':
      case 'goto':
      case 'labeled':
      case 'empty':
        return {
          ...base,
          kind: 'other',
          label: truncateText(stmtToText(statement), 40),
        };
      case 'unknown':
        return {
          ...base,
          kind: 'other',
          label: truncateText(statement.text, 40),
        };
      default:
        return { ...base, kind: 'other', label: '语句' };
    }
  }

  private branchNodes(statement: StmtNode, depth: number): OutlineNode[] {
    if (depth > MAX_DEPTH) return [];
    if (statement.kind === 'block') return this.statementList(statement.statements, depth);
    return [this.statementNode(statement, depth)];
  }
}

/** 构建结构大纲 */
export function buildOutline(model: AnalysisModel): OutlineNode {
  return new OutlineBuilder().build(model);
}
