import * as vscode from 'vscode';
import { formatStatusBarText } from './todoMessages';

export interface TodoStatusBarController {
  dispose(): void;
  setEnabled(enabled: boolean): void;
  update(total: number, highRisk: number): void;
}

export function createTodoStatusBar(command: string): TodoStatusBarController {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  item.command = command;

  return {
    dispose(): void {
      item.dispose();
    },

    setEnabled(enabled: boolean): void {
      if (!enabled) {
        item.hide();
        return;
      }

      item.show();
    },

    update(total: number, highRisk: number): void {
      item.text = formatStatusBarText(total, highRisk);
      item.tooltip = `共 ${total} 项任务，其中 ${highRisk} 项高风险`;
    },
  };
}
