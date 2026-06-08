import { describe, expect, it } from 'vitest';
import { buildTodoRecord, matchesTodoQuery } from './todoRecords';

describe('buildTodoRecord', () => {
  it('normalizes derived file fields and stable id', () => {
    const record = buildTodoRecord(
      {
        filePath: '/workspace/src/auth/login.ts',
        line: 8,
        column: 4,
        keyword: 'FIXME',
        severity: 'high',
        text: '处理超时',
        rawLine: '// FIXME: 处理超时'
      },
      {
        relativePath: 'src/auth/login.ts'
      }
    );

    expect(record).toMatchObject({
      relativePath: 'src/auth/login.ts',
      dirPath: 'src/auth',
      fileName: 'login.ts',
      severity: 'high'
    });
    expect(record.id).toBe('/workspace/src/auth/login.ts:8:4:FIXME:// FIXME: 处理超时');
  });
});

describe('matchesTodoQuery', () => {
  it('matches text, rawLine, fileName, and relativePath case-insensitively', () => {
    const record = buildTodoRecord(
      {
        filePath: '/workspace/src/auth/login.ts',
        line: 8,
        column: 4,
        keyword: 'TODO',
        severity: 'normal',
        text: '优化 Login 流程',
        rawLine: '// TODO: 优化 Login 流程'
      },
      {
        relativePath: 'src/auth/login.ts'
      }
    );

    expect(matchesTodoQuery(record, 'login')).toBe(true);
    expect(matchesTodoQuery(record, 'src/auth')).toBe(true);
    expect(matchesTodoQuery(record, '优化')).toBe(true);
    expect(matchesTodoQuery(record, 'missing')).toBe(false);
  });
});
