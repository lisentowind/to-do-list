import * as path from 'node:path';
import * as vscode from 'vscode';
import { TodoItem, parseTodosFromText } from './todoParser';
import { getDefaultExpansionState } from './treePresentation';
import { buildTodoTree, TodoFileNode, TodoFolderNode, TodoTreeItem, TodoTreeNode } from './todoTree';

interface TodoSummary {
  total: number;
  files: number;
  byKeyword: Record<string, number>;
}

interface TodoLeafNode {
  type: 'todo';
  todo: TodoTreeItem;
}

interface TodoMessageNode {
  type: 'message';
  label: string;
  description?: string;
  iconId?: string;
}

type TodoTreeElement = TodoFolderNode | TodoFileNode | TodoLeafNode | TodoMessageNode;
type TodoProviderStatus = 'idle' | 'scanning' | 'emptyWorkspace' | 'ready';

const INCLUDE_PATTERN = '**/*.{js,jsx,ts,tsx,vue,svelte,py,go,java,kt,rs,php,rb,cs,c,cpp,h,hpp,swift,md,mdx,json,yaml,yml,css,scss,less,html}';
const EXCLUDE_PATTERN = '**/{node_modules,.git,dist,out,build,coverage,.next,.nuxt,vendor,target}/**';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new TodoRadarTreeProvider();
  const treeView = vscode.window.createTreeView<TodoTreeElement>(TodoRadarTreeProvider.viewId, {
    treeDataProvider: provider,
    showCollapseAll: true
  });

  provider.attachTreeView(treeView);

  context.subscriptions.push(
    provider,
    treeView,
    vscode.commands.registerCommand('todoRadar.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('todoRadar.openTodo', (todo: TodoItem | TodoTreeItem) => openTodo(todo)),
    vscode.workspace.onDidSaveTextDocument(() => provider.refreshSoon()),
    vscode.workspace.onDidCreateFiles(() => provider.refreshSoon()),
    vscode.workspace.onDidDeleteFiles(() => provider.refreshSoon()),
    vscode.workspace.onDidRenameFiles(() => provider.refreshSoon())
  );

  void provider.refresh();
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered in activate.
}

class TodoRadarTreeProvider implements vscode.TreeDataProvider<TodoTreeElement>, vscode.Disposable {
  static readonly viewId = 'todoRadar.panel';

  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TodoTreeElement | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private treeView?: vscode.TreeView<TodoTreeElement>;
  private refreshTimer?: NodeJS.Timeout;
  private status: TodoProviderStatus = 'idle';
  private todos: TodoTreeItem[] = [];
  private tree: TodoTreeNode[] = [];
  private summary: TodoSummary = emptySummary();

  attachTreeView(treeView: vscode.TreeView<TodoTreeElement>): void {
    this.treeView = treeView;
    this.updateViewState();
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    this.onDidChangeTreeDataEmitter.dispose();
  }

  refreshSoon(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      void this.refresh();
    }, 350);
  }

  async refresh(): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
      this.status = 'emptyWorkspace';
      this.todos = [];
      this.tree = [];
      this.summary = emptySummary();
      this.updateViewState();
      this.onDidChangeTreeDataEmitter.fire(undefined);
      return;
    }

    this.status = 'scanning';
    this.updateViewState();
    this.onDidChangeTreeDataEmitter.fire(undefined);

    const config = vscode.workspace.getConfiguration('todoRadar');
    const keywords = config.get<string[]>('keywords', ['TODO', 'FIXME', 'HACK', 'XXX']);
    const files = await vscode.workspace.findFiles(INCLUDE_PATTERN, EXCLUDE_PATTERN, 2500);
    const todos: TodoItem[] = [];

    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        todos.push(...parseTodosFromText(document.getText(), file.fsPath, keywords));
      } catch {
        // Ignore files VS Code cannot decode as text.
      }
    }

    const sortedTodos = todos.sort((left, right) => {
      const fileCompare = left.filePath.localeCompare(right.filePath);
      if (fileCompare !== 0) {
        return fileCompare;
      }

      return left.line - right.line || left.column - right.column;
    });

    this.todos = sortedTodos.map(toTreeTodo);
    this.tree = buildTodoTree(this.todos);
    this.summary = summarizeTodos(sortedTodos);
    this.status = 'ready';
    this.updateViewState();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: TodoTreeElement): vscode.TreeItem {
    if (isMessageNode(element)) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.id = `message:${element.label}`;
      item.description = element.description;
      item.iconPath = new vscode.ThemeIcon(element.iconId ?? 'info');
      return item;
    }

    if (isFolderNode(element)) {
      const item = new vscode.TreeItem(element.name, toCollapsibleState(getDefaultExpansionState('folder')));
      item.id = `folder:${element.path}`;
      item.description = `${element.count} 项`;
      item.tooltip = `${element.path} · ${element.count} 项`;
      item.iconPath = new vscode.ThemeIcon('folder');
      return item;
    }

    if (isFileNode(element)) {
      const item = new vscode.TreeItem(element.name, toCollapsibleState(getDefaultExpansionState('file')));
      item.id = `file:${element.path}`;
      item.description = `${element.count} 项`;
      item.tooltip = `${element.path} · ${element.count} 项`;
      item.resourceUri = vscode.Uri.file(element.todos[0].filePath);
      return item;
    }

    const label = element.todo.text || element.todo.rawLine;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.id = `todo:${element.todo.filePath}:${element.todo.line}:${element.todo.column}:${element.todo.keyword}`;
    item.description = `${element.todo.keyword} · 第 ${element.todo.line} 行`;
    item.tooltip = `${element.todo.relativePath}:${element.todo.line}\n${element.todo.rawLine}`;
    item.iconPath = new vscode.ThemeIcon(keywordIcon(element.todo.keyword));
    item.command = {
      command: 'todoRadar.openTodo',
      title: '打开 TODO',
      arguments: [element.todo]
    };
    return item;
  }

  getChildren(element?: TodoTreeElement): TodoTreeElement[] {
    if (!element) {
      return this.getRootNodes();
    }

    if (isFolderNode(element)) {
      return element.children;
    }

    if (isFileNode(element)) {
      return element.todos.map((todo) => ({
        type: 'todo',
        todo
      }));
    }

    return [];
  }

  private getRootNodes(): TodoTreeElement[] {
    if (this.tree.length > 0) {
      return this.tree;
    }

    if (this.status === 'scanning') {
      return [
        {
          type: 'message',
          label: '正在扫描任务标记',
          description: '扫描完成后会按目录和文件分组展示',
          iconId: 'sync'
        }
      ];
    }

    if (this.status === 'emptyWorkspace') {
      return [
        {
          type: 'message',
          label: '还没有打开工作区',
          description: '打开项目后会自动扫描 TODO / FIXME / HACK / XXX',
          iconId: 'folder-opened'
        }
      ];
    }

    if (this.status === 'ready') {
      return [
        {
          type: 'message',
          label: '未发现任务标记',
          description: '当前工作区没有匹配的 TODO / FIXME / HACK / XXX',
          iconId: 'pass'
        }
      ];
    }

    return [
      {
        type: 'message',
        label: '等待首次扫描',
        description: '使用标题栏刷新按钮可以重新扫描',
        iconId: 'clock'
      }
    ];
  }

  private updateViewState(): void {
    if (!this.treeView) {
      return;
    }

    this.treeView.message = formatViewMessage(this.status, this.summary);
  }
}

async function openTodo(todo: TodoItem): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(todo.filePath));
  const editor = await vscode.window.showTextDocument(document, {
    preview: false,
    selection: new vscode.Range(todo.line - 1, Math.max(todo.column - 1, 0), todo.line - 1, Math.max(todo.column - 1, 0))
  });

  const line = document.lineAt(Math.max(todo.line - 1, 0));
  editor.revealRange(line.range, vscode.TextEditorRevealType.InCenter);
}

function summarizeTodos(todos: TodoItem[]): TodoSummary {
  const files = new Set(todos.map((todo) => todo.filePath));
  const byKeyword = todos.reduce<Record<string, number>>((result, todo) => {
    result[todo.keyword] = (result[todo.keyword] ?? 0) + 1;
    return result;
  }, {});

  return {
    total: todos.length,
    files: files.size,
    byKeyword
  };
}

function toTreeTodo(todo: TodoItem): TodoTreeItem {
  return {
    ...todo,
    fileName: path.basename(todo.filePath),
    relativePath: vscode.workspace.asRelativePath(todo.filePath, false)
  };
}

function formatViewMessage(status: TodoProviderStatus, summary: TodoSummary): string {
  if (status === 'emptyWorkspace') {
    return '打开一个工作区后会自动扫描任务标记。';
  }

  if (status === 'scanning') {
    return summary.total > 0
      ? `正在重新扫描... 当前结果 ${summary.total} 项 / ${summary.files} 个文件`
      : '正在扫描项目中的任务标记...';
  }

  if (status === 'ready' && summary.total === 0) {
    return '扫描完成，没有发现 TODO / FIXME / HACK / XXX。';
  }

  if (status !== 'ready') {
    return '等待扫描任务信号...';
  }

  const keywordSummary = Object.entries(summary.byKeyword)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([keyword, count]) => `${keyword} ${count}`)
    .join(' · ');

  return keywordSummary
    ? `共 ${summary.total} 项，涉及 ${summary.files} 个文件 · ${keywordSummary}`
    : `共 ${summary.total} 项，涉及 ${summary.files} 个文件`;
}

function emptySummary(): TodoSummary {
  return {
    total: 0,
    files: 0,
    byKeyword: {}
  };
}

function keywordIcon(keyword: string): string {
  if (keyword === 'FIXME') {
    return 'error';
  }

  if (keyword === 'HACK') {
    return 'gear';
  }

  if (keyword === 'XXX') {
    return 'warning';
  }

  return 'note';
}

function toCollapsibleState(state: ReturnType<typeof getDefaultExpansionState>): vscode.TreeItemCollapsibleState {
  if (state === 'expanded') {
    return vscode.TreeItemCollapsibleState.Expanded;
  }

  return vscode.TreeItemCollapsibleState.None;
}

function isFolderNode(element: TodoTreeElement): element is TodoFolderNode {
  return 'type' in element && element.type === 'folder';
}

function isFileNode(element: TodoTreeElement): element is TodoFileNode {
  return 'type' in element && element.type === 'file';
}

function isMessageNode(element: TodoTreeElement): element is TodoMessageNode {
  return 'type' in element && element.type === 'message';
}
