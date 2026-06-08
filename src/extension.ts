import * as vscode from 'vscode';
import { formatTreeMessage } from './todoMessages';
import { TodoRecord } from './todoRecords';
import { createTodoScanner } from './todoScanner';
import { createTodoStatusBar } from './todoStatusBar';
import { getDefaultExpansionState } from './treePresentation';
import { registerTodoCommands } from './todoCommands';
import { buildTreeForViewMode } from './todoTreeBuilders';
import { TodoFileNode, TodoFolderNode, TodoTreeItem, TodoTreeNode } from './todoTree';
import { createDefaultViewState, applyTodoViewState, TodoViewState } from './todoViewState';

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

const DEFAULT_INCLUDE_PATTERN =
  '**/*.{js,jsx,ts,tsx,vue,svelte,py,go,java,kt,rs,php,rb,cs,c,cpp,h,hpp,swift,md,mdx,json,yaml,yml,css,scss,less,html}';
const DEFAULT_EXCLUDE_PATTERN =
  '**/{node_modules,.git,dist,out,build,coverage,.next,.nuxt,vendor,target}/**';

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('todoRadar');
  const defaultViewMode = config.get<TodoViewState['viewMode']>('defaultViewMode', 'path');
  const defaultRiskOnly = config.get<boolean>('defaultRiskOnly', false);
  const autoRefresh = config.get<boolean>('autoRefresh', true);
  const statusBarEnabled = config.get<boolean>('statusBarEnabled', true);
  const maxFiles = config.get<number>('maxFiles', 2500);
  const keywords = config.get<string[]>('keywords', ['TODO', 'FIXME', 'HACK', 'XXX']);

  let viewState = createDefaultViewState({
    defaultViewMode,
    defaultRiskOnly,
  });

  const scanner = createTodoScanner({
    maxFiles,
    readWorkspaceFiles: async () => {
      const includeGlobs = config.get<string[]>('includeGlobs', []);
      const excludeGlobs = config.get<string[]>('excludeGlobs', []);
      const includePattern = includeGlobs.length > 0 ? `{${includeGlobs.join(',')}}` : DEFAULT_INCLUDE_PATTERN;
      const excludePattern = [DEFAULT_EXCLUDE_PATTERN, ...excludeGlobs].join(',');
      const files = await vscode.workspace.findFiles(includePattern, excludePattern, maxFiles);

      return Promise.all(
        files.map(async (file) => {
          const document = await vscode.workspace.openTextDocument(file);
          return {
            filePath: file.fsPath,
            text: document.getText(),
          };
        }),
      );
    },
    readFile: async (filePath) => {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      return document.getText();
    },
  });

  const provider = new TodoRadarTreeProvider();
  const treeView = vscode.window.createTreeView<TodoTreeElement>(TodoRadarTreeProvider.viewId, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  const statusBar = createTodoStatusBar('todoRadar.filter');

  provider.attachTreeView(treeView);
  statusBar.setEnabled(statusBarEnabled);

  const refreshVisibleState = (status: TodoProviderStatus, limited = false): void => {
    const records = applyTodoViewState(scanner.getAllRecords(), viewState, {
      currentFilePath: vscode.window.activeTextEditor?.document.uri.fsPath,
    });
    const tree = buildTreeForViewMode(records, viewState.viewMode);
    const visibleHighRiskCount = records.filter((record) => record.severity === 'high').length;
    const visibleFileCount = new Set(records.map((record) => record.filePath)).size;

    provider.setStatus(status);
    provider.setTree(tree);
    provider.setMessage(
      formatTreeMessage(
        {
          status,
          limited,
          visibleCount: records.length,
          fileCount: visibleFileCount,
          highRiskCount: visibleHighRiskCount,
        },
        viewState,
      ),
    );
    statusBar.update(records.length, visibleHighRiskCount);
  };

  const refresh = async (): Promise<void> => {
    if (!vscode.workspace.workspaceFolders?.length) {
      provider.setTree([]);
      provider.setStatus('emptyWorkspace');
      provider.setMessage(
        formatTreeMessage(
          {
            status: 'emptyWorkspace',
            limited: false,
            visibleCount: 0,
            fileCount: 0,
            highRiskCount: 0,
          },
          viewState,
        ),
      );
      statusBar.update(0, 0);
      return;
    }

    refreshVisibleState('scanning');
    await scanner.fullScan(keywords);
    refreshVisibleState('ready');
  };

  const setViewState = (nextViewState: TodoViewState): void => {
    viewState = nextViewState;
    refreshVisibleState(provider.getStatus());
  };

  context.subscriptions.push(
    provider,
    treeView,
    statusBar,
    ...registerTodoCommands(
      {
        getKeywords: () => keywords,
        getViewState: () => viewState,
        setViewState,
        resetViewState: () => {
          setViewState(
            createDefaultViewState({
              defaultViewMode,
              defaultRiskOnly,
            }),
          );
        },
        refresh,
      },
      {
        defaultViewMode,
        defaultRiskOnly,
      },
    ),
    vscode.commands.registerCommand('todoRadar.openTodo', (todo: TodoTreeItem) =>
      openTodo(todo),
    ),
    ...(autoRefresh
      ? [
          vscode.workspace.onDidSaveTextDocument(async (document) => {
            await scanner.updateFile(document.uri.fsPath, keywords);
            refreshVisibleState('ready');
          }),
          vscode.workspace.onDidCreateFiles(async (event) => {
            for (const file of event.files) {
              await scanner.updateFile(file.fsPath, keywords);
            }
            refreshVisibleState('ready');
          }),
          vscode.workspace.onDidDeleteFiles((event) => {
            for (const file of event.files) {
              scanner.removeFile(file.fsPath);
            }
            refreshVisibleState('ready');
          }),
          vscode.workspace.onDidRenameFiles(async (event) => {
            for (const file of event.files) {
              scanner.removeFile(file.oldUri.fsPath);
              await scanner.updateFile(file.newUri.fsPath, keywords);
            }
            refreshVisibleState('ready');
          }),
        ]
      : []),
    vscode.window.onDidChangeActiveTextEditor(() => {
      if (
        viewState.scopeFilter === 'currentFile' ||
        viewState.scopeFilter === 'currentFolder'
      ) {
        refreshVisibleState(provider.getStatus());
      }
    }),
  );

  void refresh();
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered in activate.
}

class TodoRadarTreeProvider
  implements vscode.TreeDataProvider<TodoTreeElement>, vscode.Disposable
{
  static readonly viewId = 'todoRadar.panel';

  private readonly onDidChangeTreeDataEmitter =
    new vscode.EventEmitter<TodoTreeElement | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private treeView?: vscode.TreeView<TodoTreeElement>;
  private tree: TodoTreeNode[] = [];
  private message = '等待扫描任务信号...';
  private status: TodoProviderStatus = 'idle';

  attachTreeView(treeView: vscode.TreeView<TodoTreeElement>): void {
    this.treeView = treeView;
    this.treeView.message = this.message;
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  getStatus(): TodoProviderStatus {
    return this.status;
  }

  setStatus(status: TodoProviderStatus): void {
    this.status = status;
  }

  setTree(tree: TodoTreeNode[]): void {
    this.tree = tree;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  setMessage(message: string): void {
    this.message = message;
    if (this.treeView) {
      this.treeView.message = message;
    }
  }

  getTreeItem(element: TodoTreeElement): vscode.TreeItem {
    if (isMessageNode(element)) {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None,
      );
      item.id = `message:${element.label}`;
      item.description = element.description;
      item.iconPath = new vscode.ThemeIcon(element.iconId ?? 'info');
      return item;
    }

    if (isFolderNode(element)) {
      const item = new vscode.TreeItem(
        element.name,
        toCollapsibleState(getDefaultExpansionState('folder')),
      );
      item.id = `folder:${element.path}`;
      item.description = `${element.count} 项`;
      item.tooltip = `${element.path} · ${element.count} 项`;
      item.iconPath = new vscode.ThemeIcon('folder');
      return item;
    }

    if (isFileNode(element)) {
      const item = new vscode.TreeItem(
        element.name,
        toCollapsibleState(getDefaultExpansionState('file')),
      );
      item.id = `file:${element.path}`;
      item.description = `${element.count} 项`;
      item.tooltip = `${element.path} · ${element.count} 项`;
      item.resourceUri = vscode.Uri.file(element.todos[0].filePath);
      return item;
    }

    const label = element.todo.text || element.todo.rawLine;
    const item = new vscode.TreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
    );
    item.id = `todo:${element.todo.filePath}:${element.todo.line}:${element.todo.column}:${element.todo.keyword}`;
    item.description = `${element.todo.keyword} · 第 ${element.todo.line} 行`;
    item.tooltip = `${element.todo.relativePath}:${element.todo.line}\n${element.todo.rawLine}`;
    item.iconPath = new vscode.ThemeIcon(keywordIcon(element.todo.keyword));
    item.command = {
      command: 'todoRadar.openTodo',
      title: '打开 TODO',
      arguments: [element.todo],
    };
    contextMenusForTodo(item, element.todo);
    return item;
  }

  getChildren(element?: TodoTreeElement): TodoTreeElement[] {
    if (!element) {
      if (this.tree.length > 0) {
        return this.tree;
      }

      if (this.status === 'emptyWorkspace') {
        return [
          {
            type: 'message',
            label: '还没有打开工作区',
            description: '打开项目后会自动扫描 TODO / FIXME / HACK / XXX',
            iconId: 'folder-opened',
          },
        ];
      }

      if (this.status === 'ready') {
        return [
          {
            type: 'message',
            label: '未发现任务标记',
            description: '当前工作区没有匹配的 TODO / FIXME / HACK / XXX',
            iconId: 'pass',
          },
        ];
      }

      return [
        {
          type: 'message',
          label: '正在扫描任务标记',
          description: '扫描完成后会按当前视图模式展示',
          iconId: 'sync',
        },
      ];
    }

    if (isFolderNode(element)) {
      return element.children;
    }

    if (isFileNode(element)) {
      return element.todos.map((todo) => ({
        type: 'todo',
        todo,
      }));
    }

    return [];
  }
}

async function openTodo(todo: TodoTreeItem): Promise<void> {
  try {
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(todo.filePath),
    );
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
      selection: new vscode.Range(
        todo.line - 1,
        Math.max(todo.column - 1, 0),
        todo.line - 1,
        Math.max(todo.column - 1, 0),
      ),
    });

    const line = document.lineAt(Math.max(todo.line - 1, 0));
    editor.revealRange(line.range, vscode.TextEditorRevealType.InCenter);
  } catch {
    void vscode.window.showWarningMessage('对应文件已不存在，无法打开该任务。');
  }
}

function contextMenusForTodo(
  item: vscode.TreeItem,
  todo: TodoTreeItem,
): void {
  item.contextValue = 'todoItem';
  item.tooltip = `${todo.relativePath}:${todo.line}\n${todo.rawLine}`;
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

function toCollapsibleState(
  state: ReturnType<typeof getDefaultExpansionState>,
): vscode.TreeItemCollapsibleState {
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
