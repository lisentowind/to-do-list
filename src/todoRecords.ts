import * as path from 'node:path';
import { TodoItem } from './todoParser';

export interface TodoRecord extends TodoItem {
  id: string;
  relativePath: string;
  dirPath: string;
  fileName: string;
}

interface BuildTodoRecordOptions {
  relativePath?: string;
}

export function buildTodoRecord(todo: TodoItem, options: BuildTodoRecordOptions = {}): TodoRecord {
  const relativePath = normalizePath(options.relativePath ?? todo.filePath);
  const dirPath = path.posix.dirname(relativePath);

  return {
    ...todo,
    id: `${todo.filePath}:${todo.line}:${todo.column}:${todo.keyword}:${todo.rawLine}`,
    relativePath,
    dirPath: dirPath === '.' ? '' : dirPath,
    fileName: path.basename(relativePath),
  };
}

export function matchesTodoQuery(record: TodoRecord, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [
    record.text,
    record.rawLine,
    record.fileName,
    record.relativePath,
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
}
