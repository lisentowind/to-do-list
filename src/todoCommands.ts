import * as vscode from 'vscode';
import { createDefaultViewState, TodoViewState, updateViewState } from './todoViewState';

export interface TodoCommandController {
  getKeywords(): string[];
  getViewState(): TodoViewState;
  setViewState(viewState: TodoViewState): void;
  resetViewState(): void;
  refresh(): Promise<void>;
}

export function registerTodoCommands(
  controller: TodoCommandController,
  defaults: {
    defaultViewMode: TodoViewState['viewMode'];
    defaultRiskOnly: boolean;
  },
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('todoRadar.search', async () => {
      const query = await vscode.window.showInputBox({
        prompt: '搜索 TODO 文本、文件名或路径',
        value: controller.getViewState().query,
      });

      if (query === undefined) {
        return;
      }

      controller.setViewState(
        updateViewState(controller.getViewState(), { query }),
      );
    }),
    vscode.commands.registerCommand('todoRadar.filter', async () => {
      const picks: vscode.QuickPickItem[] = [
        { label: '全部关键字', description: 'keyword:ALL' },
        ...controller.getKeywords().map((keyword) => ({
          label: keyword,
          description: `keyword:${keyword}`,
        })),
        { label: '全部范围', description: 'scope:workspace' },
        { label: '当前文件', description: 'scope:currentFile' },
        { label: '当前目录', description: 'scope:currentFolder' },
        { label: '全部风险', description: 'risk:all' },
        { label: '仅高风险', description: 'risk:highRiskOnly' },
      ];

      const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: '选择一个筛选条件',
      });

      if (!pick?.description) {
        return;
      }

      const [kind, value] = pick.description.split(':');

      if (kind === 'keyword') {
        controller.setViewState(
          updateViewState(controller.getViewState(), {
            keywordFilter: value,
          }),
        );
        return;
      }

      if (kind === 'scope') {
        controller.setViewState(
          updateViewState(controller.getViewState(), {
            scopeFilter: value as TodoViewState['scopeFilter'],
          }),
        );
        return;
      }

      if (kind === 'risk') {
        controller.setViewState(
          updateViewState(controller.getViewState(), {
            riskFilter: value as TodoViewState['riskFilter'],
          }),
        );
      }
    }),
    vscode.commands.registerCommand('todoRadar.sort', async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: '按目录', value: 'path' },
          { label: '按关键字风险', value: 'keyword' },
          { label: '按文件', value: 'file' },
        ],
        {
          placeHolder: '选择视图模式',
        },
      );

      if (!pick) {
        return;
      }

      controller.setViewState(
        updateViewState(controller.getViewState(), {
          viewMode: pick.value as TodoViewState['viewMode'],
        }),
      );
    }),
    vscode.commands.registerCommand('todoRadar.clearFilters', () => {
      controller.setViewState(
        createDefaultViewState({
          defaultViewMode: defaults.defaultViewMode,
          defaultRiskOnly: defaults.defaultRiskOnly,
        }),
      );
    }),
    vscode.commands.registerCommand('todoRadar.focusCurrentFile', () => {
      controller.setViewState(
        updateViewState(controller.getViewState(), {
          scopeFilter: 'currentFile',
        }),
      );
    }),
    vscode.commands.registerCommand('todoRadar.focusCurrentFolder', () => {
      controller.setViewState(
        updateViewState(controller.getViewState(), {
          scopeFilter: 'currentFolder',
        }),
      );
    }),
    vscode.commands.registerCommand('todoRadar.toggleRiskOnly', () => {
      const riskFilter =
        controller.getViewState().riskFilter === 'highRiskOnly'
          ? 'all'
          : 'highRiskOnly';

      controller.setViewState(
        updateViewState(controller.getViewState(), {
          riskFilter,
        }),
      );
    }),
    vscode.commands.registerCommand('todoRadar.copyTodo', async (todo?: { rawLine?: string; text?: string }) => {
      const value = todo?.rawLine ?? todo?.text;
      if (!value) {
        return;
      }

      await vscode.env.clipboard.writeText(value);
    }),
    vscode.commands.registerCommand('todoRadar.copyTodoPath', async (todo?: { relativePath?: string; line?: number }) => {
      if (!todo?.relativePath || !todo?.line) {
        return;
      }

      await vscode.env.clipboard.writeText(`${todo.relativePath}:${todo.line}`);
    }),
    vscode.commands.registerCommand('todoRadar.refresh', () => controller.refresh()),
  ];
}
