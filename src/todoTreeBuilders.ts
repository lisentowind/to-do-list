import { buildTodoTree, TodoFileNode, TodoTreeItem, TodoTreeNode } from './todoTree';
import { TodoRecord } from './todoRecords';

type ViewMode = 'path' | 'keyword' | 'file';

const KEYWORD_PRIORITY = ['FIXME', 'HACK', 'TODO', 'XXX'] as const;

export function buildTreeForViewMode(
  records: TodoRecord[],
  viewMode: ViewMode,
): TodoTreeNode[] {
  if (viewMode === 'path') {
    return buildTodoTree(records);
  }

  if (viewMode === 'file') {
    return buildFileTree(records);
  }

  return buildKeywordTree(records);
}

function buildKeywordTree(records: TodoRecord[]): TodoTreeNode[] {
  const recordsByKeyword = new Map<string, TodoRecord[]>();

  for (const record of records) {
    const keywordRecords = recordsByKeyword.get(record.keyword) ?? [];
    keywordRecords.push(record);
    recordsByKeyword.set(record.keyword, keywordRecords);
  }

  return Array.from(recordsByKeyword.entries())
    .sort(([leftKeyword], [rightKeyword]) => compareKeywords(leftKeyword, rightKeyword))
    .map(([keyword, keywordRecords]) => {
      const children = buildFileTree(keywordRecords);

      return {
        type: 'folder' as const,
        name: keyword,
        path: `keyword:${keyword}`,
        count: keywordRecords.length,
        children,
      };
    });
}

function buildFileTree(records: TodoRecord[]): TodoTreeNode[] {
  const recordsByFile = new Map<string, TodoRecord[]>();

  for (const record of records) {
    const fileRecords = recordsByFile.get(record.relativePath) ?? [];
    fileRecords.push(record);
    recordsByFile.set(record.relativePath, fileRecords);
  }

  return Array.from(recordsByFile.entries())
    .map(([relativePath, fileRecords]) => createFileNode(relativePath, fileRecords))
    .sort(compareFileNodes);
}

function createFileNode(relativePath: string, records: TodoRecord[]): TodoFileNode {
  return {
    type: 'file',
    name: records[0]?.fileName ?? relativePath.split('/').pop() ?? relativePath,
    path: relativePath,
    count: records.length,
    todos: sortTodos(records),
  };
}

function compareKeywords(left: string, right: string): number {
  const leftPriority = KEYWORD_PRIORITY.indexOf(left as (typeof KEYWORD_PRIORITY)[number]);
  const rightPriority = KEYWORD_PRIORITY.indexOf(right as (typeof KEYWORD_PRIORITY)[number]);

  if (leftPriority !== -1 || rightPriority !== -1) {
    if (leftPriority === -1) {
      return 1;
    }

    if (rightPriority === -1) {
      return -1;
    }

    return leftPriority - rightPriority;
  }

  return left.localeCompare(right, 'zh-Hans-CN');
}

function compareFileNodes(left: TodoTreeNode, right: TodoTreeNode): number {
  return left.path.localeCompare(right.path, 'zh-Hans-CN');
}

function sortTodos<T extends TodoTreeItem>(todos: T[]): T[] {
  return [...todos].sort(
    (left, right) => left.line - right.line || left.column - right.column,
  );
}
