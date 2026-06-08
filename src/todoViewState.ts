import { TodoRecord, matchesTodoQuery } from './todoRecords';

export interface TodoViewState {
  query: string;
  keywordFilter: 'ALL' | string;
  scopeFilter:
    | 'workspace'
    | 'currentFile'
    | 'currentFolder'
    | 'selectedFolder';
  selectedFolderPath?: string;
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

export function createDefaultViewState(
  defaults: TodoViewDefaults = {},
): TodoViewState {
  return {
    query: '',
    keywordFilter: 'ALL',
    scopeFilter: 'workspace',
    riskFilter: defaults.defaultRiskOnly ? 'highRiskOnly' : 'all',
    viewMode: defaults.defaultViewMode ?? 'path',
  };
}

export function updateViewState(
  state: TodoViewState,
  patch: Partial<TodoViewState>,
): TodoViewState {
  return normalizeViewState({
    ...state,
    ...patch,
  });
}

export function applyTodoViewState(
  records: TodoRecord[],
  state: TodoViewState,
  context: TodoViewContext,
): TodoRecord[] {
  const currentFilePath = normalizePath(context.currentFilePath);
  const currentFolderPath = currentFilePath
    ? currentFilePath.split('/').slice(0, -1).join('/')
    : '';
  const selectedFolderPath = normalizeRelativePath(state.selectedFolderPath);

  return records.filter((record) => {
    const normalizedRecordPath = normalizePath(record.filePath);
    const normalizedRelativePath = normalizeRelativePath(record.relativePath);

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
      return !currentFilePath || normalizedRecordPath === currentFilePath;
    }

    if (state.scopeFilter === 'currentFolder') {
      if (!currentFolderPath) {
        return true;
      }

      return (
        normalizedRecordPath === currentFilePath ||
        normalizedRecordPath.startsWith(`${currentFolderPath}/`)
      );
    }

    if (state.scopeFilter === 'selectedFolder') {
      if (!selectedFolderPath) {
        return true;
      }

      return (
        normalizedRelativePath === selectedFolderPath ||
        normalizedRelativePath.startsWith(`${selectedFolderPath}/`)
      );
    }

    return true;
  });
}

function normalizeViewState(state: TodoViewState): TodoViewState {
  const selectedFolderPath = normalizeRelativePath(state.selectedFolderPath);

  if (state.scopeFilter !== 'selectedFolder') {
    const { selectedFolderPath: _selectedFolderPath, ...rest } = state;
    return rest;
  }

  if (!selectedFolderPath) {
    const { selectedFolderPath: _selectedFolderPath, ...rest } = state;
    return {
      ...rest,
      scopeFilter: 'workspace',
    };
  }

  return {
    ...state,
    selectedFolderPath,
  };
}

function normalizePath(filePath?: string): string {
  if (!filePath) {
    return '';
  }

  return filePath.replace(/\\/g, '/');
}

function normalizeRelativePath(filePath?: string): string {
  const normalized = normalizePath(filePath)
    .replace(/^\.?\//, '')
    .replace(/\/+$/, '');

  return normalized === '.' ? '' : normalized;
}
