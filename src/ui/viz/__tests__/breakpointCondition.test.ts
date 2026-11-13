import { describe, expect, it } from 'vitest';
import type { RuntimeVar, TraceStep } from '../../../engine/types';
import { conditionMatches, validateCondition } from '../breakpointCondition';

function variable(name: string, valueText: string, typeText = 'int'): RuntimeVar {
  return { name, typeText, valueText, category: 'int' } as RuntimeVar;
}

function step(vars: RuntimeVar[]): TraceStep {
  return { line: 1, depth: 0, vars } as unknown as TraceStep;
}

const STEP = step([
  variable('i', '10'),
  variable('n', '0'),
  variable('c', "'x'", 'char'),
  variable('flag', 'true', 'bool'),
  variable('name', '"codeviz"', 'string'),
  variable('a', 'BigInt { sign: 1, len: 20, size: 21, s: -> heap#1[0] }', 'BigInt'),
]);

describe('条件断点：条件求值', () => {
  it('数字比较', () => {
    expect(conditionMatches('i == 10', STEP)).toBe(true);
    expect(conditionMatches('i != 10', STEP)).toBe(false);
    expect(conditionMatches('i > 9', STEP)).toBe(true);
    expect(conditionMatches('i <= 9', STEP)).toBe(false);
    expect(conditionMatches('n == 0', STEP)).toBe(true);
  });

  it('用变量互相比较', () => {
    expect(conditionMatches('i > n', STEP)).toBe(true);
    expect(conditionMatches('n >= i', STEP)).toBe(false);
  });

  it('字符串与字符', () => {
    expect(conditionMatches("c == 'x'", STEP)).toBe(true);
    expect(conditionMatches('c == \'y\'', STEP)).toBe(false);
    expect(conditionMatches('name == "codeviz"', STEP)).toBe(true);
    expect(conditionMatches("name != 'codeviz'", STEP)).toBe(false);
  });

  it('逻辑运算与括号', () => {
    expect(conditionMatches('i == 10 && n == 0', STEP)).toBe(true);
    expect(conditionMatches('i == 10 && n == 1', STEP)).toBe(false);
    expect(conditionMatches('i == 11 || n == 0', STEP)).toBe(true);
    expect(conditionMatches('!(i == 10)', STEP)).toBe(false);
    expect(conditionMatches('(i == 10 || n == 5) && flag', STEP)).toBe(true);
  });

  it('布尔变量真值判断', () => {
    expect(conditionMatches('flag', STEP)).toBe(true);
    expect(conditionMatches('!flag', STEP)).toBe(false);
    expect(conditionMatches('n', STEP)).toBe(false);
  });

  it('结构体 / 类对象取字段', () => {
    expect(conditionMatches('a.len == 20', STEP)).toBe(true);
    expect(conditionMatches('a.len > 10', STEP)).toBe(true);
    expect(conditionMatches('a.sign == -1', STEP)).toBe(false);
    expect(conditionMatches('a->size == 21', STEP)).toBe(true);
  });

  it('空条件视为普通断点，恒命中', () => {
    expect(conditionMatches(undefined, STEP)).toBe(true);
    expect(conditionMatches('', STEP)).toBe(true);
    expect(conditionMatches('   ', STEP)).toBe(true);
  });

  it('变量不存在或写错时不命中，也不抛错', () => {
    expect(conditionMatches('missing == 1', STEP)).toBe(false);
    expect(conditionMatches('i ==== 10', STEP)).toBe(false);
    expect(conditionMatches('i ==', STEP)).toBe(false);
  });
});

describe('条件断点：语法检查', () => {
  it('合法条件返回 null', () => {
    expect(validateCondition('i == 10')).toBeNull();
    expect(validateCondition('a.len > 3 && i != 0')).toBeNull();
    expect(validateCondition('')).toBeNull();
  });

  it('写错时给出可读提示', () => {
    expect(validateCondition('i ==')).toContain('不完整');
    expect(validateCondition('i $$ 3')).toContain('不支持');
    expect(validateCondition('(i == 3')).toContain('括号');
    expect(validateCondition('i == 3 &&& n')).not.toBeNull();
  });
});
