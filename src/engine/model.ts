/**
 * 分析过程中的共享模型
 * ------------------------------------------------------------------
 * analyzer 构建 FunctionRecord / AnalysisModel，memory、outline、diagnostics
 * 在自己的文件里消费这份模型，避免互相 import 造成循环依赖。
 */
import type { ClassDeclNode, ExprNode, FuncDeclNode, ProgramNode } from './ast';
import type { CallSite, ParameterInfo, SourceLanguage, VariableInfo } from './types';
import type { SupportRegistry, UnsupportedIssue } from './support';

export interface FunctionRecord {
  node: FuncDeclNode;
  id: string;
  /** 展示名：普通函数为 name，成员函数为 Class::name */
  displayName: string;
  className?: string;
  hasBody: boolean;
  params: ParameterInfo[];
  locals: VariableInfo[];
  calls: CallSite[];
  complexity: number;
  maxNesting: number;
  /** 是否所有路径都有 return（void 函数恒为 true） */
  hasReturnOnAllPaths: boolean;
  /** 解释器支持度检查结果，null 表示完全支持 */
  supportIssue: UnsupportedIssue | null;
  /** 是否处在递归环里（含间接递归），由调用图分析后填充 */
  recursive: boolean;
}

export interface AnalysisModel {
  code: string;
  language: SourceLanguage;
  program: ProgramNode;
  classes: ClassDeclNode[];
  classByName: Map<string, ClassDeclNode>;
  records: FunctionRecord[];
  globals: VariableInfo[];
  /** 类 / 结构体名 → 估算字节数 */
  typeSizes: Map<string, number>;
  /** 变量 id → 初始化表达式（供内存模型 / 诊断使用） */
  varInits: Map<string, ExprNode>;
  supportRegistry: SupportRegistry;
}
