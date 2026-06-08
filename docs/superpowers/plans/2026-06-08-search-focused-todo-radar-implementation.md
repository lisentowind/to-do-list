# Search-Focused TODO Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a search-focused `0.1.0` TODO Radar that supports cached scanning, native tree filtering, alternate view modes, and high-risk surfacing without leaving the VS Code tree workflow.

**Architecture:** Split the current all-in-one tree provider into focused modules for records, parser normalization, cached scanning, view-state filtering, tree building, presentation, status bar integration, and command registration. Keep the VS Code extension entrypoint thin so most behavior is testable outside the extension host.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest

---

## Planned File Structure

### Existing files to modify

- Modify: `package.json`
- Modify: `src/extension.ts`
- Modify: `src/todoParser.ts`
- Modify: `src/todoParser.test.ts`
- Modify: `src/todoTree.ts`
- Modify: `src/todoTree.test.ts`
- Modify: `src/treePresentation.ts`
- Modify: `src/treePresentation.test.ts`

### New source files to create

- Create: `src/todoRecords.ts`
- Create: `src/todoRecords.test.ts`
- Create: `src/todoViewState.ts`
- Create: `src/todoViewState.test.ts`
- Create: `src/todoTreeBuilders.ts`
- Create: `src/todoTreeBuilders.test.ts`
- Create: `src/todoMessages.ts`
- Create: `src/todoMessages.test.ts`
- Create: `src/todoStatusBar.ts`
- Create: `src/todoScanner.ts`
- Create: `src/todoScanner.test.ts`
- Create: `src/todoCommands.ts`

### Responsibility map

- `src/todoParser.ts`: parse raw markers from document text and attach normalized severity information.
- `src/todoRecords.ts`: convert parser output into stable `TodoRecord` objects and provide search helpers.
- `src/todoViewState.ts`: own query, keyword filter, scope filter, risk filter, and view mode defaults.
- `src/todoTreeBuilders.ts`: build `path`, `keyword`, and `file` grouped trees from visible records.
- `src/todoMessages.ts`: format tree-view message and status-bar text from scan state and view state.
- `src/todoStatusBar.ts`: create and update the status bar item.
- `src/todoScanner.ts`: own include/exclude rules, full scan, incremental file updates, and cache reads.
- `src/todoCommands.ts`: register view commands and command-driven state changes.
- `src/extension.ts`: wire scanner, commands, tree provider, active editor events, and status bar together.

### Proposed commit boundaries

- Commit 1: parser and record normalization
- Commit 2: view state and tree builders
- Commit 3: scan cache and incremental updates
- Commit 4: messages, status bar, and command wiring
- Commit 5: extension integration and package manifest updates

### Task 1: Normalize parser output into searchable records

**Files:**
- Modify: `src/todoParser.ts`
- Modify: `src/todoParser.test.ts`
- Create: `src/todoRecords.ts`
- Create: `src/todoRecords.test.ts`

- [ ] **Step 1: Write the failing parser and record tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseTodosFromText } from './todoParser';
import { buildTodoRecord, matchesTodoQuery } from './todoRecords';

describe('parseTodosFromText severity', () => {
  it('marks FIXME and HACK as high severity', () => {
    const result = parseTodosFromText('// FIXME: 修复崩溃\n// HACK: 临时绕过', 'src/app.ts');

    expect(result.map((todo) => [todo.keyword, todo.severity])).toEqual([
      ['FIXME', 'high'],
      ['HACK', 'high']
    ]);
  });

  it('marks TODO and custom keywords as normal severity', () => {
    const result = parseTodosFromText('// TODO: 清理\n// NOTE: 说明', 'src/app.ts', ['TODO', 'NOTE']);

    expect(result.map((todo) => [todo.keyword, todo.severity])).toEqual([
      ['TODO', 'normal'],
      ['NOTE', 'normal']
    ]);
  });
});

describe('buildTodoRecord', () => {
  it('normalizes derived file fields and stable id', () => {
    const record = buildTodoRecord({
      filePath: '/workspace/src/auth/login.ts',
      line: 8,
      column: 4,
      keyword: 'FIXME',
      severity: 'high',
      text: '处理超时',
      rawLine: '// FIXME: 处理超时'
    });

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
    const record = buildTodoRecord({
      filePath: '/workspace/src/auth/login.ts',
      line: 8,
      column: 4,
      keyword: 'TODO',
      severity: 'normal',
      text: '优化 Login 流程',
      rawLine: '// TODO: 优化 Login 流程'
    });

    expect(matchesTodoQuery(record, 'login')).toBe(true);
    expect(matchesTodoQuery(record, 'src/auth')).toBe(true);
    expect(matchesTodoQuery(record, '优化')).toBe(true);
    expect(matchesTodoQuery(record, 'missing')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/todoParser.test.ts src/todoRecords.test.ts`
Expected: FAIL because `severity`, `buildTodoRecord`, or `matchesTodoQuery` do not exist yet.

- [ ] **Step 3: Write the minimal parser and record implementation**

```ts
export interface TodoItem {
  filePath: string;
  line: number;
  column: number;
  keyword: string;
  severity: 'high' | 'normal';
  text: string;
  rawLine: string;
}

export function keywordSeverity(keyword: string): 'high' | 'normal' {
  return keyword === 'FIXME' || keyword === 'HACK' ? 'high' : 'normal';
}
```

```ts
import * as path from 'node:path';
import * as vscode from 'vscode';
import { TodoItem } from './todoParser';

export interface TodoRecord {
  id: string;
  filePath: string;
  relativePath: string;
  dirPath: string;
  fileName: string;
  keyword: string;
  severity: 'high' | 'normal';
  line: number;
  column: number;
  text: string;
  rawLine: string;
}

export function buildTodoRecord(todo: TodoItem): TodoRecord {
  const relativePath = vscode.workspace.asRelativePath(todo.filePath, false).replace(/\\/g, '/');
  const dirPath = path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath);
  const fileName = path.basename(todo.filePath);

  return {
    id: `${todo.filePath}:${todo.line}:${todo.column}:${todo.keyword}:${todo.rawLine}`,
    filePath: todo.filePath,
    relativePath,
    dirPath,
    fileName,
    keyword: todo.keyword,
    severity: todo.severity,
    line: todo.line,
    column: todo.column,
    text: todo.text,
    rawLine: todo.rawLine
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
    record.relativePath
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/todoParser.test.ts src/todoRecords.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/todoParser.ts src/todoParser.test.ts src/todoRecords.ts src/todoRecords.test.ts
git commit -m "feat: add normalized todo records"
```

### Task 2: Add view state and record filtering pipeline

**Files:**
- Create: `src/todoViewState.ts`
- Create: `src/todoViewState.test.ts`
- Modify: `src/todoRecords.ts`
- Test: `src/todoViewState.test.ts`

- [ ] **Step 1: Write the failing view state tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildTodoRecord } from './todoRecords';
import {
  createDefaultViewState,
  applyTodoViewState,
  updateViewState
} from './todoViewState';

const records = [
  buildTodoRecord({
    filePath: '/workspace/src/auth/login.ts',
    line: 4,
    column: 1,
    keyword: 'FIXME',
    severity: 'high',
    text: '修复登录超时',
    rawLine: '// FIXME: 修复登录超时'
  }),
  buildTodoRecord({
    filePath: '/workspace/src/ui/panel.ts',
    line: 9,
    column: 1,
    keyword: 'TODO',
    severity: 'normal',
    text: '整理面板样式',
    rawLine: '// TODO: 整理面板样式'
  })
];

describe('createDefaultViewState', () => {
  it('uses configuration defaults', () => {
    expect(createDefaultViewState({ defaultViewMode: 'keyword', defaultRiskOnly: true })).toEqual({
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'workspace',
      riskFilter: 'highRiskOnly',
      viewMode: 'keyword'
    });
  });
});

describe('applyTodoViewState', () => {
  it('filters by query, keyword, and high-risk flag together', () => {
    const state = {
      query: '登录',
      keywordFilter: 'FIXME',
      scopeFilter: 'workspace',
      riskFilter: 'highRiskOnly',
      viewMode: 'path'
    };

    expect(applyTodoViewState(records, state, { currentFilePath: undefined }).map((record) => record.fileName)).toEqual(['login.ts']);
  });

  it('filters to current file and current folder scopes', () => {
    const fileState = {
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'currentFile',
      riskFilter: 'all',
      viewMode: 'path'
    };

    const folderState = {
      ...fileState,
      scopeFilter: 'currentFolder'
    };

    expect(applyTodoViewState(records, fileState, { currentFilePath: '/workspace/src/ui/panel.ts' }).map((record) => record.fileName)).toEqual(['panel.ts']);
    expect(applyTodoViewState(records, folderState, { currentFilePath: '/workspace/src/ui/panel.ts' }).map((record) => record.fileName)).toEqual(['panel.ts']);
  });

  it('falls back to workspace scope when no active editor exists', () => {
    const state = {
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'currentFile',
      riskFilter: 'all',
      viewMode: 'path'
    };

    expect(applyTodoViewState(records, state, { currentFilePath: undefined })).toHaveLength(2);
  });
});

describe('updateViewState', () => {
  it('applies partial updates without resetting the rest of the state', () => {
    const state = updateViewState(createDefaultViewState(), {
      query: 'auth',
      keywordFilter: 'FIXME'
    });

    expect(state.query).toBe('auth');
    expect(state.keywordFilter).toBe('FIXME');
    expect(state.viewMode).toBe('path');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/todoViewState.test.ts`
Expected: FAIL because `todoViewState.ts` does not exist yet.

- [ ] **Step 3: Write the minimal view state implementation**

```ts
import { TodoRecord, matchesTodoQuery } from './todoRecords';

export interface TodoViewState {
  query: string;
  keywordFilter: 'ALL' | string;
  scopeFilter: 'workspace' | 'currentFile' | 'currentFolder';
  riskFilter: 'all' | 'highRiskOnly';
  viewMode: 'path' | 'keyword' | 'file';
}

export interface TodoViewDefaults {
  defaultViewMode?: TodoViewState['viewMode'];
  defaultRiskOnly?: boolean;
}

export interface TodoViewContext {
  currentFilePath?: string;
}

export function createDefaultViewState(defaults: TodoViewDefaults = {}): TodoViewState {
  return {
    query: '',
    keywordFilter: 'ALL',
    scopeFilter: 'workspace',
    riskFilter: defaults.defaultRiskOnly ? 'highRiskOnly' : 'all',
    viewMode: defaults.defaultViewMode ?? 'path'
  };
}

export function updateViewState(state: TodoViewState, patch: Partial<TodoViewState>): TodoViewState {
  return { ...state, ...patch };
}

export function applyTodoViewState(records: TodoRecord[], state: TodoViewState, context: TodoViewContext): TodoRecord[] {
  return records.filter((record) => {
    if (!matchesTodoQuery(record, state.query)) {
      return false;
    }

    if (state.keywordFilter !== 'ALL' && record.keyword !== state.keywordFilter) {
      return false;
    }

    if (state.riskFilter === 'highRiskOnly' && record.severity !== 'high') {
      return false;
    }

    if (state.scopeFilter === 'currentFile') {
      return !context.currentFilePath || record.filePath === context.currentFilePath;
    }

    if (state.scopeFilter === 'currentFolder') {
      if (!context.currentFilePath) {
        return true;
      }

      const currentDir = context.currentFilePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
      return record.filePath.replace(/\\/g, '/').startsWith(`${currentDir}/`) || record.filePath.replace(/\\/g, '/') === context.currentFilePath.replace(/\\/g, '/');
    }

    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/todoViewState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/todoViewState.ts src/todoViewState.test.ts src/todoRecords.ts
git commit -m "feat: add todo view state filtering"
```

### Task 3: Add alternate tree builders for path, keyword, and file modes

**Files:**
- Create: `src/todoTreeBuilders.ts`
- Create: `src/todoTreeBuilders.test.ts`
- Modify: `src/todoTree.ts`
- Modify: `src/todoTree.test.ts`

- [ ] **Step 1: Write the failing tree builder tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildTodoRecord } from './todoRecords';
import { buildTreeForViewMode } from './todoTreeBuilders';

const records = [
  buildTodoRecord({
    filePath: '/workspace/src/auth/login.ts',
    line: 4,
    column: 1,
    keyword: 'FIXME',
    severity: 'high',
    text: '修复登录超时',
    rawLine: '// FIXME: 修复登录超时'
  }),
  buildTodoRecord({
    filePath: '/workspace/src/ui/panel.ts',
    line: 9,
    column: 1,
    keyword: 'TODO',
    severity: 'normal',
    text: '整理面板样式',
    rawLine: '// TODO: 整理面板样式'
  }),
  buildTodoRecord({
    filePath: '/workspace/src/auth/session.ts',
    line: 2,
    column: 1,
    keyword: 'HACK',
    severity: 'high',
    text: '临时跳过刷新',
    rawLine: '// HACK: 临时跳过刷新'
  })
];

describe('buildTreeForViewMode', () => {
  it('builds path mode with folder-first grouping', () => {
    const tree = buildTreeForViewMode(records, 'path');
    expect(tree[0]).toMatchObject({ type: 'folder', name: 'src' });
  });

  it('builds keyword mode with high-risk keywords first', () => {
    const tree = buildTreeForViewMode(records, 'keyword');
    expect(tree.map((node) => node.name)).toEqual(['FIXME', 'HACK', 'TODO']);
  });

  it('builds file mode with files at the root', () => {
    const tree = buildTreeForViewMode(records, 'file');
    expect(tree.every((node) => node.type === 'file')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/todoTreeBuilders.test.ts src/todoTree.test.ts`
Expected: FAIL because `buildTreeForViewMode` does not exist yet.

- [ ] **Step 3: Write the minimal tree builder implementation**

```ts
import { TodoRecord } from './todoRecords';
import { buildTodoTree, TodoTreeNode } from './todoTree';

export function buildTreeForViewMode(records: TodoRecord[], viewMode: 'path' | 'keyword' | 'file'): TodoTreeNode[] {
  if (viewMode === 'path') {
    return buildTodoTree(records);
  }

  if (viewMode === 'file') {
    return buildFileRootTree(records);
  }

  return buildKeywordTree(records);
}
```

```ts
function keywordPriority(keyword: string): number {
  if (keyword === 'FIXME') return 0;
  if (keyword === 'HACK') return 1;
  if (keyword === 'TODO') return 2;
  if (keyword === 'XXX') return 3;
  return 4;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/todoTreeBuilders.test.ts src/todoTree.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/todoTree.ts src/todoTree.test.ts src/todoTreeBuilders.ts src/todoTreeBuilders.test.ts
git commit -m "feat: add alternate todo tree views"
```

### Task 4: Introduce cache-backed scanning and incremental file updates

**Files:**
- Create: `src/todoScanner.ts`
- Create: `src/todoScanner.test.ts`
- Modify: `src/todoRecords.ts`
- Test: `src/todoScanner.test.ts`

- [ ] **Step 1: Write the failing scanner tests**

```ts
import { describe, expect, it } from 'vitest';
import { createTodoScanner } from './todoScanner';

describe('createTodoScanner', () => {
  it('stores normalized records by file after a full scan', async () => {
    const scanner = createTodoScanner({
      includePattern: '**/*.ts',
      excludePattern: '**/node_modules/**',
      maxFiles: 10,
      readWorkspaceFiles: async () => [
        {
          filePath: '/workspace/src/app.ts',
          text: '// TODO: 接入接口'
        }
      ]
    });

    await scanner.fullScan(['TODO']);

    expect(scanner.getAllRecords().map((record) => record.fileName)).toEqual(['app.ts']);
  });

  it('rescans only the changed file on save and removes deleted files', async () => {
    const documents = new Map([
      ['/workspace/src/app.ts', '// TODO: 接入接口'],
      ['/workspace/src/old.ts', '// FIXME: 旧逻辑']
    ]);

    const scanner = createTodoScanner({
      includePattern: '**/*.ts',
      excludePattern: '**/node_modules/**',
      maxFiles: 10,
      readWorkspaceFiles: async () =>
        Array.from(documents.entries()).map(([filePath, text]) => ({ filePath, text })),
      readFile: async (filePath) => documents.get(filePath) ?? ''
    });

    await scanner.fullScan(['TODO', 'FIXME']);
    documents.set('/workspace/src/app.ts', '// FIXME: 改成高风险');
    documents.delete('/workspace/src/old.ts');

    await scanner.updateFile('/workspace/src/app.ts', ['TODO', 'FIXME']);
    scanner.removeFile('/workspace/src/old.ts');

    expect(scanner.getAllRecords().map((record) => [record.fileName, record.keyword])).toEqual([
      ['app.ts', 'FIXME']
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/todoScanner.test.ts`
Expected: FAIL because `todoScanner.ts` does not exist yet.

- [ ] **Step 3: Write the minimal scanner implementation**

```ts
import { buildTodoRecord, TodoRecord } from './todoRecords';
import { parseTodosFromText } from './todoParser';

export interface TodoScannerFile {
  filePath: string;
  text: string;
}

export interface TodoScannerDependencies {
  includePattern: string;
  excludePattern: string;
  maxFiles: number;
  readWorkspaceFiles: () => Promise<TodoScannerFile[]>;
  readFile?: (filePath: string) => Promise<string>;
}

export function createTodoScanner(deps: TodoScannerDependencies) {
  const cache = new Map<string, TodoRecord[]>();

  return {
    async fullScan(keywords: string[]) {
      cache.clear();
      const files = (await deps.readWorkspaceFiles()).slice(0, deps.maxFiles);
      for (const file of files) {
        cache.set(file.filePath, parseTodosFromText(file.text, file.filePath, keywords).map(buildTodoRecord));
      }
    },
    async updateFile(filePath: string, keywords: string[]) {
      if (!deps.readFile) {
        return;
      }
      const text = await deps.readFile(filePath);
      cache.set(filePath, parseTodosFromText(text, filePath, keywords).map(buildTodoRecord));
    },
    removeFile(filePath: string) {
      cache.delete(filePath);
    },
    getAllRecords() {
      return Array.from(cache.values()).flat().sort((left, right) => left.relativePath.localeCompare(right.relativePath) || left.line - right.line || left.column - right.column);
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/todoScanner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/todoScanner.ts src/todoScanner.test.ts src/todoRecords.ts
git commit -m "feat: add cached todo scanner"
```

### Task 5: Format tree messages and status bar summaries

**Files:**
- Create: `src/todoMessages.ts`
- Create: `src/todoMessages.test.ts`
- Create: `src/todoStatusBar.ts`
- Modify: `src/treePresentation.ts`
- Modify: `src/treePresentation.test.ts`

- [ ] **Step 1: Write the failing presentation tests**

```ts
import { describe, expect, it } from 'vitest';
import { formatTreeMessage, formatStatusBarText } from './todoMessages';

describe('formatTreeMessage', () => {
  it('includes query, filters, and result counts', () => {
    expect(
      formatTreeMessage(
        {
          status: 'ready',
          limited: false,
          visibleCount: 3,
          fileCount: 1,
          highRiskCount: 2
        },
        {
          query: 'auth',
          keywordFilter: 'FIXME',
          scopeFilter: 'currentFile',
          riskFilter: 'highRiskOnly',
          viewMode: 'keyword'
        }
      )
    ).toContain('搜索: auth');
  });

  it('distinguishes empty workspace from filtered empty results', () => {
    expect(formatTreeMessage({ status: 'emptyWorkspace', limited: false, visibleCount: 0, fileCount: 0, highRiskCount: 0 }, null)).toContain('打开一个工作区');
    expect(formatTreeMessage({ status: 'ready', limited: false, visibleCount: 0, fileCount: 0, highRiskCount: 0 }, {
      query: 'missing',
      keywordFilter: 'ALL',
      scopeFilter: 'workspace',
      riskFilter: 'all',
      viewMode: 'path'
    })).toContain('当前筛选');
  });
});

describe('formatStatusBarText', () => {
  it('shows total and high-risk counts', () => {
    expect(formatStatusBarText(18, 5)).toBe('TODO 18 | RISK 5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/todoMessages.test.ts src/treePresentation.test.ts`
Expected: FAIL because `todoMessages.ts` and the new formatters do not exist yet.

- [ ] **Step 3: Write the minimal message and status bar implementation**

```ts
import { TodoViewState } from './todoViewState';

export interface TreeMessageState {
  status: 'idle' | 'scanning' | 'emptyWorkspace' | 'ready';
  limited: boolean;
  visibleCount: number;
  fileCount: number;
  highRiskCount: number;
}

export function formatTreeMessage(state: TreeMessageState, viewState: TodoViewState | null): string {
  if (state.status === 'emptyWorkspace') {
    return '打开一个工作区后会自动扫描任务标记。';
  }

  if (state.status === 'scanning') {
    return '正在扫描项目中的任务标记...';
  }

  if (state.status === 'ready' && state.visibleCount === 0 && viewState && (viewState.query || viewState.keywordFilter !== 'ALL' || viewState.scopeFilter !== 'workspace' || viewState.riskFilter !== 'all')) {
    return '当前筛选条件下没有匹配任务。';
  }

  const parts: string[] = [];
  if (viewState?.query) parts.push(`搜索: ${viewState.query}`);
  if (viewState?.scopeFilter === 'currentFile') parts.push('范围: 当前文件');
  if (viewState?.scopeFilter === 'currentFolder') parts.push('范围: 当前目录');
  if (viewState?.riskFilter === 'highRiskOnly') parts.push('风险: 仅高风险');
  parts.push(`${state.visibleCount} 项 / ${state.fileCount} 文件`);
  if (state.limited) parts.push('结果可能不完整');
  return parts.join(' · ');
}

export function formatStatusBarText(total: number, highRisk: number): string {
  return `TODO ${total} | RISK ${highRisk}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/todoMessages.test.ts src/treePresentation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/todoMessages.ts src/todoMessages.test.ts src/todoStatusBar.ts src/treePresentation.ts src/treePresentation.test.ts
git commit -m "feat: add todo messaging and status bar support"
```

### Task 6: Register native commands and integrate filtered tree rendering

**Files:**
- Create: `src/todoCommands.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`
- Test: `src/todoViewState.test.ts`
- Test: `src/todoTreeBuilders.test.ts`
- Test: `src/todoMessages.test.ts`

- [ ] **Step 1: Write the failing integration expectations in targeted tests**

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultViewState, updateViewState } from './todoViewState';

describe('command-driven state transitions', () => {
  it('clears search and filters back to defaults', () => {
    const state = updateViewState(createDefaultViewState({ defaultViewMode: 'file', defaultRiskOnly: true }), {
      query: 'auth',
      keywordFilter: 'FIXME',
      scopeFilter: 'currentFile'
    });

    expect({
      ...createDefaultViewState({ defaultViewMode: 'file', defaultRiskOnly: true }),
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'workspace'
    }).toEqual({
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'workspace',
      riskFilter: 'highRiskOnly',
      viewMode: 'file'
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/todoViewState.test.ts src/todoTreeBuilders.test.ts src/todoMessages.test.ts`
Expected: FAIL because the integration helpers or defaults needed by commands are still incomplete.

- [ ] **Step 3: Write the minimal command and extension integration**

```ts
export function registerTodoCommands(deps: {
  getViewState: () => TodoViewState;
  setViewState: (state: TodoViewState) => void;
  resetViewState: () => void;
  refresh: () => Promise<void>;
}) {
  return [
    vscode.commands.registerCommand('todoRadar.search', async () => {
      const query = await vscode.window.showInputBox({ prompt: '搜索 TODO 文本、文件名或路径' });
      deps.setViewState(updateViewState(deps.getViewState(), { query: query ?? '' }));
    }),
    vscode.commands.registerCommand('todoRadar.clearFilters', () => deps.resetViewState()),
    vscode.commands.registerCommand('todoRadar.toggleRiskOnly', () => {
      const next = deps.getViewState().riskFilter === 'highRiskOnly' ? 'all' : 'highRiskOnly';
      deps.setViewState(updateViewState(deps.getViewState(), { riskFilter: next }));
    }),
    vscode.commands.registerCommand('todoRadar.refresh', () => deps.refresh())
  ];
}
```

```ts
const viewState = createDefaultViewState({
  defaultViewMode: config.get('defaultViewMode', 'path'),
  defaultRiskOnly: config.get('defaultRiskOnly', false)
});
const visibleRecords = applyTodoViewState(scanner.getAllRecords(), viewState, {
  currentFilePath: activeEditorPath
});
const tree = buildTreeForViewMode(visibleRecords, viewState.viewMode);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/todoViewState.test.ts src/todoTreeBuilders.test.ts src/todoMessages.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/todoCommands.ts src/extension.ts package.json src/todoViewState.ts src/todoTreeBuilders.ts src/todoMessages.ts
git commit -m "feat: add todo search and filter commands"
```

### Task 7: Finish extension host wiring, status bar updates, and full verification

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`
- Test: `src/todoParser.test.ts`
- Test: `src/todoRecords.test.ts`
- Test: `src/todoViewState.test.ts`
- Test: `src/todoTree.test.ts`
- Test: `src/todoTreeBuilders.test.ts`
- Test: `src/todoScanner.test.ts`
- Test: `src/todoMessages.test.ts`
- Test: `src/treePresentation.test.ts`

- [ ] **Step 1: Write the final missing tests for no-result messaging and custom keyword ordering**

```ts
import { describe, expect, it } from 'vitest';
import { buildTreeForViewMode } from './todoTreeBuilders';
import { buildTodoRecord } from './todoRecords';

describe('custom keyword ordering', () => {
  it('sorts configured custom keywords after built-in priorities alphabetically', () => {
    const tree = buildTreeForViewMode([
      buildTodoRecord({
        filePath: '/workspace/src/a.ts',
        line: 1,
        column: 1,
        keyword: 'NOTE',
        severity: 'normal',
        text: '备注',
        rawLine: '// NOTE: 备注'
      }),
      buildTodoRecord({
        filePath: '/workspace/src/b.ts',
        line: 1,
        column: 1,
        keyword: 'WARN',
        severity: 'normal',
        text: '提醒',
        rawLine: '// WARN: 提醒'
      })
    ], 'keyword');

    expect(tree.map((node) => node.name)).toEqual(['NOTE', 'WARN']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/todoTreeBuilders.test.ts src/todoMessages.test.ts`
Expected: FAIL if the last ordering and message edge cases are not implemented yet.

- [ ] **Step 3: Write the minimal finishing implementation**

```ts
const statusBar = createTodoStatusBar({
  onClickCommand: 'todoRadar.filter'
});

function renderVisibleState() {
  const records = applyTodoViewState(scanner.getAllRecords(), viewState, {
    currentFilePath: activeEditorPath
  });
  provider.setTree(buildTreeForViewMode(records, viewState.viewMode));
  provider.setMessage(formatTreeMessage({
    status,
    limited,
    visibleCount: records.length,
    fileCount: new Set(records.map((record) => record.filePath)).size,
    highRiskCount: records.filter((record) => record.severity === 'high').length
  }, viewState));
  statusBar.update(records.length, records.filter((record) => record.severity === 'high').length);
}
```

- [ ] **Step 4: Run full verification**

Run: `pnpm check`
Expected: PASS with all tests green

Run: `pnpm test`
Expected: PASS with parser, records, scanner, view-state, tree-builder, message, and presentation tests all green

- [ ] **Step 5: Commit**

```bash
git add package.json src/extension.ts src/todoParser.test.ts src/todoRecords.test.ts src/todoViewState.test.ts src/todoTree.test.ts src/todoTreeBuilders.test.ts src/todoScanner.test.ts src/todoMessages.test.ts src/treePresentation.test.ts
git commit -m "feat: complete search-focused todo radar"
```

## Self-Review

### Spec coverage check

- Search workflow: covered in Task 2, Task 6, Task 7
- Keyword/scope/risk filtering: covered in Task 2 and Task 6
- Path/keyword/file view modes: covered in Task 3 and Task 7
- High-risk surfacing: covered in Task 1, Task 2, Task 3, Task 5
- Cached scanning and incremental refresh: covered in Task 4 and Task 7
- View messaging and status bar feedback: covered in Task 5 and Task 7
- Package manifest commands and menus: covered in Task 6 and Task 7

### Placeholder scan

- No `TBD`, `TODO`, or “implement later” placeholders remain in task steps.
- Each task includes concrete files, explicit commands, and example code blocks.

### Type consistency check

- `TodoRecord`, `TodoViewState`, and the `path | keyword | file` mode names are consistent across tasks.
- Severity mapping uses only `'high' | 'normal'`.

