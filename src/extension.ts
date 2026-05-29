import * as path from 'node:path';
import * as vscode from 'vscode';
import { TodoItem, parseTodosFromText } from './todoParser';

interface TodoSummary {
  total: number;
  files: number;
  byKeyword: Record<string, number>;
}

const INCLUDE_PATTERN = '**/*.{js,jsx,ts,tsx,vue,svelte,py,go,java,kt,rs,php,rb,cs,c,cpp,h,hpp,swift,md,mdx,json,yaml,yml,css,scss,less,html}';
const EXCLUDE_PATTERN = '**/{node_modules,.git,dist,out,build,coverage,.next,.nuxt,vendor,target}/**';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new TodoRadarViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TodoRadarViewProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.commands.registerCommand('todoRadar.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('todoRadar.openTodo', (todo: TodoItem) => openTodo(todo)),
    vscode.workspace.onDidSaveTextDocument(() => provider.refreshSoon()),
    vscode.workspace.onDidCreateFiles(() => provider.refreshSoon()),
    vscode.workspace.onDidDeleteFiles(() => provider.refreshSoon()),
    vscode.workspace.onDidRenameFiles(() => provider.refreshSoon())
  );
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered in activate.
}

class TodoRadarViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'todoRadar.panel';

  private view?: vscode.WebviewView;
  private todos: TodoItem[] = [];
  private refreshTimer?: NodeJS.Timeout;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.onDidReceiveMessage((message: { command?: string; todo?: TodoItem }) => {
      if (message.command === 'refresh') {
        void this.refresh();
      }

      if (message.command === 'openTodo' && message.todo) {
        void openTodo(message.todo);
      }
    });

    webviewView.webview.html = getWebviewHtml(webviewView.webview);
    void this.refresh();
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
      this.todos = [];
      this.postState('emptyWorkspace');
      return;
    }

    this.postState('scanning');

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

    this.todos = todos.sort((left, right) => {
      const fileCompare = left.filePath.localeCompare(right.filePath);
      return fileCompare === 0 ? left.line - right.line : fileCompare;
    });
    this.postState('ready');
  }

  private postState(status: 'ready' | 'scanning' | 'emptyWorkspace'): void {
    if (!this.view) {
      return;
    }

    this.view.webview.postMessage({
      type: 'todoRadar.state',
      status,
      todos: this.todos.map(toWebviewTodo),
      summary: summarizeTodos(this.todos)
    });
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

function toWebviewTodo(todo: TodoItem): TodoItem & { fileName: string; relativePath: string } {
  return {
    ...todo,
    fileName: path.basename(todo.filePath),
    relativePath: vscode.workspace.asRelativePath(todo.filePath, false)
  };
}

function getWebviewHtml(webview: vscode.Webview): string {
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TODO 雷达</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-editor-background);
      --panel: var(--vscode-sideBar-background);
      --panel-2: color-mix(in srgb, var(--panel) 88%, white 12%);
      --border: var(--vscode-panel-border);
      --text: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-textLink-foreground);
      --accent-soft: color-mix(in srgb, var(--accent) 15%, transparent);
      --track: color-mix(in srgb, var(--text) 8%, transparent);
      --todo: #5B8FF9;
      --fixme: #E8684A;
      --hack: #F6BD16;
      --xxx: #9270CA;
      font-family: var(--vscode-font-family);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-width: 0;
      color: var(--text);
      background: var(--bg);
    }

    .shell {
      min-height: 100vh;
      padding: 12px;
      display: grid;
      gap: 12px;
    }

    header {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(135deg, var(--panel), var(--panel-2));
      padding: 14px;
    }

    .eyebrow {
      color: var(--accent);
      font-size: 11px;
      letter-spacing: 0;
      margin: 0 0 6px;
    }

    h1 {
      font-size: 20px;
      line-height: 1.2;
      margin: 0 0 8px;
      font-weight: 600;
    }

    .status {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
      margin: 0;
    }

    .status::before {
      content: "";
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      margin-right: 7px;
      background: var(--accent);
      vertical-align: 1px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .stat {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel);
      padding: 12px;
      min-width: 0;
    }

    .stat strong {
      display: block;
      color: var(--text);
      font-size: 25px;
      line-height: 1.1;
      font-weight: 600;
    }

    .stat span {
      color: var(--muted);
      font-size: 11px;
    }

    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    button, select {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      color: var(--text);
      min-height: 32px;
      font: inherit;
      font-size: 12px;
    }

    button {
      cursor: pointer;
      padding: 0 10px;
    }

    button:hover {
      border-color: var(--accent);
      background: var(--accent-soft);
    }

    select {
      flex: 1;
      min-width: 0;
      padding: 0 8px;
    }

    .panel {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel);
      padding: 12px;
      min-width: 0;
    }

    .panel h2 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 600;
    }

    .section-note {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      margin: 0 0 12px;
    }

    .keyword-summary {
      display: grid;
      gap: 10px;
    }

    .keyword-row {
      display: grid;
      gap: 6px;
    }

    .keyword-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      font-size: 12px;
    }

    .track {
      height: 7px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--track);
    }

    .fill {
      height: 100%;
      min-width: 2px;
      border-radius: inherit;
      background: var(--accent);
    }

    .list {
      display: grid;
      gap: 8px;
    }

    .todo {
      width: 100%;
      text-align: left;
      min-height: 0;
      padding: 10px;
      border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
      border-radius: 10px;
      background: color-mix(in srgb, var(--panel) 92%, var(--text) 8%);
      display: block;
    }

    .todo:hover {
      border-color: var(--accent);
      transform: translateY(-1px);
    }

    .todo-top {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }

    .keyword {
      color: #ffffff;
      background: var(--todo);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
    }

    .keyword.FIXME {
      background: var(--fixme);
    }

    .keyword.HACK {
      background: var(--hack);
      color: #1f1f1f;
    }

    .keyword.XXX {
      background: var(--xxx);
    }

    .line {
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }

    .text {
      display: block;
      margin: 9px 0 7px;
      color: var(--text);
      font-size: 13px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .path {
      color: var(--muted);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .empty {
      border: 1px dashed var(--border);
      border-radius: 10px;
      color: var(--muted);
      padding: 18px 12px;
      text-align: center;
      background: color-mix(in srgb, var(--panel) 92%, var(--text) 8%);
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <p class="eyebrow">PROJECT SIGNAL SCAN</p>
      <h1>TODO 雷达</h1>
      <p class="status" id="status">等待扫描任务信号...</p>
    </header>

    <section class="stats" aria-label="扫描统计">
      <div class="stat"><strong id="total">0</strong><span>任务信号</span></div>
      <div class="stat"><strong id="files">0</strong><span>涉及文件</span></div>
    </section>

    <section class="toolbar" aria-label="筛选工具">
      <select id="filter" title="按标记筛选">
        <option value="ALL">全部标记</option>
      </select>
      <button id="refresh" type="button" title="刷新扫描">刷新</button>
    </section>

    <section class="panel" aria-label="标记分布">
      <h2>标记分布</h2>
      <p class="section-note">按任务类型聚合，快速判断风险与清理优先级。</p>
      <div class="keyword-summary" id="keywordSummary"></div>
    </section>

    <section class="panel" aria-label="TODO 列表">
      <h2>任务明细</h2>
      <p class="section-note">点击条目可定位到源文件中的对应行。</p>
      <div class="list" id="list"></div>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const statusEl = document.getElementById('status');
    const totalEl = document.getElementById('total');
    const filesEl = document.getElementById('files');
    const filterEl = document.getElementById('filter');
    const listEl = document.getElementById('list');
    const refreshEl = document.getElementById('refresh');
    const keywordSummaryEl = document.getElementById('keywordSummary');
    let todos = [];
    let summary = { total: 0, files: 0, byKeyword: {} };

    refreshEl.addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });

    filterEl.addEventListener('change', renderList);

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type !== 'todoRadar.state') {
        return;
      }

      todos = message.todos ?? [];
      summary = message.summary ?? { total: 0, files: 0, byKeyword: {} };
      totalEl.textContent = String(summary.total);
      filesEl.textContent = String(summary.files);

      if (message.status === 'scanning') {
        statusEl.textContent = '正在扫描项目任务信号...';
      } else if (message.status === 'emptyWorkspace') {
        statusEl.textContent = '还没有打开工作区。';
      } else {
        statusEl.textContent = summary.total > 0 ? '扫描完成，发现可追踪任务。' : '扫描完成，没有发现 TODO。';
      }

      renderFilter();
      renderKeywordSummary();
      renderList();
    });

    function renderFilter() {
      const current = filterEl.value;
      const keywords = Object.keys(summary.byKeyword).sort();
      filterEl.innerHTML = '<option value="ALL">全部标记</option>' + keywords
        .map((keyword) => '<option value="' + escapeHtml(keyword) + '">' + escapeHtml(keyword) + ' (' + summary.byKeyword[keyword] + ')</option>')
        .join('');
      filterEl.value = keywords.includes(current) ? current : 'ALL';
    }

    function renderKeywordSummary() {
      const entries = Object.entries(summary.byKeyword).sort((left, right) => right[1] - left[1]);

      if (entries.length === 0) {
        keywordSummaryEl.innerHTML = '<div class="empty">暂无可统计的标记</div>';
        return;
      }

      const max = Math.max(...entries.map((entry) => entry[1]), 1);
      keywordSummaryEl.innerHTML = entries.map(([keyword, count]) => {
        const width = Math.max((count / max) * 100, 2);
        return '<div class="keyword-row">' +
          '<div class="keyword-head"><span><span class="keyword ' + escapeHtml(keyword) + '">' + escapeHtml(keyword) + '</span></span><span class="line">' + count + ' 个</span></div>' +
          '<div class="track"><div class="fill" style="width:' + width + '%;background:' + keywordColor(keyword) + '"></div></div>' +
        '</div>';
      }).join('');
    }

    function renderList() {
      const keyword = filterEl.value;
      const visibleTodos = keyword === 'ALL' ? todos : todos.filter((todo) => todo.keyword === keyword);

      if (visibleTodos.length === 0) {
        listEl.innerHTML = '<div class="empty">当前筛选下没有任务信号</div>';
        return;
      }

      listEl.innerHTML = visibleTodos.map((todo, index) => {
        return '<button class="todo" type="button" data-index="' + index + '">' +
          '<span class="todo-top"><span class="keyword ' + escapeHtml(todo.keyword) + '">' + escapeHtml(todo.keyword) + '</span><span class="line">第 ' + todo.line + ' 行</span></span>' +
          '<span class="text">' + escapeHtml(todo.text || todo.rawLine) + '</span>' +
          '<span class="path">' + escapeHtml(todo.relativePath) + '</span>' +
        '</button>';
      }).join('');

      Array.from(listEl.querySelectorAll('.todo')).forEach((button, index) => {
        button.addEventListener('click', () => {
          vscode.postMessage({ command: 'openTodo', todo: visibleTodos[index] });
        });
      });
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function keywordColor(keyword) {
      if (keyword === 'FIXME') return 'var(--fixme)';
      if (keyword === 'HACK') return 'var(--hack)';
      if (keyword === 'XXX') return 'var(--xxx)';
      return 'var(--todo)';
    }
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
