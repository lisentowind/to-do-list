import { TodoViewState } from './todoViewState';

export interface TreeMessageState {
  status: 'idle' | 'scanning' | 'emptyWorkspace' | 'ready';
  limited: boolean;
  visibleCount: number;
  fileCount: number;
  highRiskCount: number;
}

export function formatTreeMessage(
  state: TreeMessageState,
  viewState: TodoViewState | null,
): string {
  if (state.status === 'emptyWorkspace') {
    return '打开一个工作区后会自动扫描任务标记。';
  }

  if (state.status === 'scanning') {
    return '正在扫描项目中的任务标记...';
  }

  if (state.status === 'ready' && state.visibleCount === 0 && hasActiveFilters(viewState)) {
    return '当前筛选条件下没有匹配任务。';
  }

  const parts: string[] = [];

  if (viewState?.query) {
    parts.push(`搜索: ${viewState.query}`);
  }

  if (viewState?.scopeFilter === 'currentFile') {
    parts.push('范围: 当前文件');
  }

  if (viewState?.scopeFilter === 'currentFolder') {
    parts.push('范围: 当前目录');
  }

  if (viewState?.riskFilter === 'highRiskOnly') {
    parts.push('风险: 仅高风险');
  }

  parts.push(`${state.visibleCount} 项 / ${state.fileCount} 文件`);

  if (state.limited) {
    parts.push('结果可能不完整');
  }

  return parts.join(' · ');
}

export function formatStatusBarText(total: number, highRisk: number): string {
  return `TODO ${total} | RISK ${highRisk}`;
}

function hasActiveFilters(viewState: TodoViewState | null): boolean {
  if (!viewState) {
    return false;
  }

  return Boolean(
    viewState.query ||
      viewState.keywordFilter !== 'ALL' ||
      viewState.scopeFilter !== 'workspace' ||
      viewState.riskFilter !== 'all',
  );
}
