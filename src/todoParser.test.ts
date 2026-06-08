import { describe, expect, it } from 'vitest';
import { parseTodosFromText } from './todoParser';

describe('parseTodosFromText', () => {
  it('finds TODO markers with one-based line numbers', () => {
    const result = parseTodosFromText('const a = 1;\n// TODO: 接入真实接口\nconsole.log(a);', 'src/app.ts');

    expect(result).toEqual([
      {
        filePath: 'src/app.ts',
        line: 2,
        column: 4,
        keyword: 'TODO',
        severity: 'normal',
        text: '接入真实接口',
        rawLine: '// TODO: 接入真实接口'
      }
    ]);
  });

  it('supports configured keywords case-insensitively', () => {
    const result = parseTodosFromText('// fixme 修复边界\n// hack: 临时兼容', 'src/app.ts', ['FIXME', 'HACK']);

    expect(result.map((todo) => [todo.keyword, todo.severity, todo.text])).toEqual([
      ['FIXME', 'high', '修复边界'],
      ['HACK', 'high', '临时兼容']
    ]);
  });

  it('trims common comment punctuation after the keyword', () => {
    const result = parseTodosFromText('/* TODO - 清理缓存 */\n# XXX：补充权限校验', 'src/app.ts');

    expect(result.map((todo) => todo.text)).toEqual(['清理缓存 */', '补充权限校验']);
  });

  it('limits long todo text for stable rendering', () => {
    const longText = 'a'.repeat(180);
    const [todo] = parseTodosFromText(`// TODO: ${longText}`, 'src/app.ts');

    expect(todo.text).toHaveLength(120);
    expect(todo.text.endsWith('...')).toBe(true);
    expect(todo.severity).toBe('normal');
  });

  it('marks custom keywords as normal severity by default', () => {
    const [todo] = parseTodosFromText('// NOTE: 说明信息', 'src/app.ts', ['NOTE']);

    expect(todo.keyword).toBe('NOTE');
    expect(todo.severity).toBe('normal');
  });
});
