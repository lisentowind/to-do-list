import { describe, expect, it } from 'vitest';
import { buildTodoTree } from './todoTree';

describe('buildTodoTree', () => {
  it('groups todos into folders, files, and sorted entries', () => {
    const tree = buildTodoTree([
      {
        filePath: '/workspace/src/components/Panel.tsx',
        fileName: 'Panel.tsx',
        relativePath: 'src/components/Panel.tsx',
        line: 12,
        column: 4,
        keyword: 'TODO',
        text: '补充空态',
        rawLine: '// TODO: 补充空态'
      },
      {
        filePath: '/workspace/README.md',
        fileName: 'README.md',
        relativePath: 'README.md',
        line: 8,
        column: 1,
        keyword: 'HACK',
        text: '临时说明',
        rawLine: 'HACK: 临时说明'
      },
      {
        filePath: '/workspace/src/app.ts',
        fileName: 'app.ts',
        relativePath: 'src/app.ts',
        line: 20,
        column: 4,
        keyword: 'FIXME',
        text: '处理异常',
        rawLine: '// FIXME: 处理异常'
      },
      {
        filePath: '/workspace/src/components/Panel.tsx',
        fileName: 'Panel.tsx',
        relativePath: 'src/components/Panel.tsx',
        line: 3,
        column: 4,
        keyword: 'XXX',
        text: '历史兼容',
        rawLine: '// XXX: 历史兼容'
      }
    ]);

    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({
      type: 'folder',
      name: 'src',
      path: 'src',
      count: 3
    });
    expect(tree[1]).toMatchObject({
      type: 'file',
      name: 'README.md',
      path: 'README.md',
      count: 1
    });

    if (tree[0].type !== 'folder') {
      throw new Error('expected folder node');
    }

    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0]).toMatchObject({
      type: 'folder',
      name: 'components',
      path: 'src/components',
      count: 2
    });
    expect(tree[0].children[1]).toMatchObject({
      type: 'file',
      name: 'app.ts',
      path: 'src/app.ts',
      count: 1
    });

    const componentsNode = tree[0].children[0];
    if (componentsNode.type !== 'folder') {
      throw new Error('expected nested folder node');
    }

    expect(componentsNode.children).toHaveLength(1);
    expect(componentsNode.children[0]).toMatchObject({
      type: 'file',
      name: 'Panel.tsx',
      path: 'src/components/Panel.tsx',
      count: 2
    });

    const panelNode = componentsNode.children[0];
    if (panelNode.type !== 'file') {
      throw new Error('expected file node');
    }

    expect(panelNode.todos.map((todo) => [todo.line, todo.keyword])).toEqual([
      [3, 'XXX'],
      [12, 'TODO']
    ]);
  });

  it('normalizes windows paths when creating nested folders', () => {
    const tree = buildTodoTree([
      {
        filePath: 'C:\\workspace\\src\\lib\\util.ts',
        fileName: 'util.ts',
        relativePath: 'src\\lib\\util.ts',
        line: 4,
        column: 1,
        keyword: 'TODO',
        text: '兼容 windows 路径',
        rawLine: '// TODO: 兼容 windows 路径'
      }
    ]);

    expect(tree).toMatchObject([
      {
        type: 'folder',
        name: 'src',
        children: [
          {
            type: 'folder',
            name: 'lib',
            children: [
              {
                type: 'file',
                name: 'util.ts',
                path: 'src/lib/util.ts',
                count: 1
              }
            ]
          }
        ]
      }
    ]);
  });
});
