import { describe, expect, it } from 'vitest';
import { buildTodoRecord } from './todoRecords';
import { buildTreeForViewMode } from './todoTreeBuilders';

const records = [
  buildTodoRecord(
    {
      filePath: '/workspace/src/app.ts',
      line: 9,
      column: 2,
      keyword: 'TODO',
      severity: 'normal',
      text: '补充应用初始化',
      rawLine: '// TODO: 补充应用初始化',
    },
    {
      relativePath: 'src/app.ts',
    },
  ),
  buildTodoRecord(
    {
      filePath: '/workspace/src/app.ts',
      line: 9,
      column: 1,
      keyword: 'TODO',
      severity: 'normal',
      text: '同一行更靠前的任务',
      rawLine: '// TODO: 同一行更靠前的任务',
    },
    {
      relativePath: 'src/app.ts',
    },
  ),
  buildTodoRecord(
    {
      filePath: '/workspace/src/components/button.ts',
      line: 3,
      column: 4,
      keyword: 'FIXME',
      severity: 'high',
      text: '修复按钮态',
      rawLine: '// FIXME: 修复按钮态',
    },
    {
      relativePath: 'src/components/button.ts',
    },
  ),
  buildTodoRecord(
    {
      filePath: '/workspace/tests/button.test.ts',
      line: 7,
      column: 3,
      keyword: 'NOTE',
      severity: 'normal',
      text: '补充边界样例',
      rawLine: '// NOTE: 补充边界样例',
    },
    {
      relativePath: 'tests/button.test.ts',
    },
  ),
  buildTodoRecord(
    {
      filePath: '/workspace/src/components/button.ts',
      line: 11,
      column: 2,
      keyword: 'HACK',
      severity: 'normal',
      text: '暂时兼容旧主题',
      rawLine: '// HACK: 暂时兼容旧主题',
    },
    {
      relativePath: 'src/components/button.ts',
    },
  ),
];

describe('buildTreeForViewMode', () => {
  it('reuses the path tree when view mode is path', () => {
    expect(buildTreeForViewMode(records, 'path')).toMatchObject([
      {
        type: 'folder',
        name: 'src',
        path: 'src',
        count: 4,
      },
      {
        type: 'folder',
        name: 'tests',
        path: 'tests',
        count: 1,
      },
    ]);
  });

  it('groups records by keyword with priority ordering and file children', () => {
    const tree = buildTreeForViewMode(records, 'keyword');

    expect(tree.map((node) => node.name)).toEqual([
      'FIXME',
      'HACK',
      'TODO',
      'NOTE',
    ]);

    const todoNode = tree[2];
    if (todoNode.type !== 'folder') {
      throw new Error('expected keyword folder node');
    }

    expect(todoNode.path).toBe('keyword:TODO');
    expect(todoNode.count).toBe(2);
    expect(todoNode.children).toMatchObject([
      {
        type: 'file',
        name: 'app.ts',
        path: 'src/app.ts',
        count: 2,
      },
    ]);

    const fileNode = todoNode.children[0];
    if (fileNode.type !== 'file') {
      throw new Error('expected file node');
    }

    expect(fileNode.path).toBe('src/app.ts');
    expect(fileNode.todos.map((todo) => [todo.line, todo.column])).toEqual([
      [9, 1],
      [9, 2],
    ]);
  });

  it('groups records by file at the top level using relative path ordering', () => {
    const tree = buildTreeForViewMode(
      [
        ...records,
        buildTodoRecord(
          {
            filePath: '/workspace/tests/app.ts',
            line: 2,
            column: 1,
            keyword: 'TODO',
            severity: 'normal',
            text: '测试同名文件排序',
            rawLine: '// TODO: 测试同名文件排序',
          },
          {
            relativePath: 'tests/app.ts',
          },
        ),
      ],
      'file',
    );

    expect(tree).toHaveLength(4);
    expect(tree.map((node) => node.path)).toEqual([
      'src/app.ts',
      'src/components/button.ts',
      'tests/app.ts',
      'tests/button.test.ts',
    ]);

    const appNode = tree[0];
    if (appNode.type !== 'file') {
      throw new Error('expected file node');
    }

    expect(appNode.path).toBe('src/app.ts');
    expect(appNode.count).toBe(2);
    expect(appNode.todos.map((todo) => [todo.line, todo.column])).toEqual([
      [9, 1],
      [9, 2],
    ]);
  });
});
