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
  return {
    ...state,
    ...patch,
  };
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

  return records.filter((record) => {
    const normalizedRecordPath = normalizePath(record.filePath);

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

    return true;
  });
}

function normalizePath(filePath?: string): string {
  if (!filePath) {
    return '';
  }

  return filePath.replace(/\\/g, '/');
}
