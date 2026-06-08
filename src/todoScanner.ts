import { buildTodoRecord, TodoRecord } from './todoRecords';
import { parseTodosFromText } from './todoParser';

export interface TodoScannerFile {
  filePath: string;
  text: string;
}

export interface TodoScannerDependencies {
  maxFiles: number;
  readWorkspaceFiles: () => Promise<TodoScannerFile[]>;
  readFile?: (filePath: string) => Promise<string>;
  toRelativePath?: (filePath: string) => string;
}

export function createTodoScanner(deps: TodoScannerDependencies) {
  const cache = new Map<string, TodoRecord[]>();

  return {
    async fullScan(keywords: string[]): Promise<void> {
      cache.clear();

      const files = (await deps.readWorkspaceFiles()).slice(0, deps.maxFiles);

      for (const file of files) {
        cache.set(
          file.filePath,
          buildRecords(file.filePath, file.text, keywords, deps.toRelativePath),
        );
      }
    },

    async updateFile(filePath: string, keywords: string[]): Promise<void> {
      if (!deps.readFile) {
        return;
      }

      const text = await deps.readFile(filePath);
      cache.set(
        filePath,
        buildRecords(filePath, text, keywords, deps.toRelativePath),
      );
    },

    removeFile(filePath: string): void {
      cache.delete(filePath);
    },

    getAllRecords(): TodoRecord[] {
      return Array.from(cache.values())
        .flat()
        .sort(
          (left, right) =>
            left.relativePath.localeCompare(right.relativePath) ||
            left.line - right.line ||
            left.column - right.column,
        );
    },
  };
}

function buildRecords(
  filePath: string,
  text: string,
  keywords: string[],
  toRelativePath?: (filePath: string) => string,
): TodoRecord[] {
  return parseTodosFromText(text, filePath, keywords).map((todo) =>
    buildTodoRecord(todo, {
      relativePath: toRelativePath?.(filePath),
    }),
  );
}
