import { describe, expect, it } from 'vitest';
import { buildTodoRecord } from './todoRecords';
import {
  applyTodoViewState,
  createDefaultViewState,
  updateViewState,
} from './todoViewState';

const records = [
  buildTodoRecord(
    {
      filePath: '/workspace/src/auth/login.ts',
      line: 4,
      column: 1,
      keyword: 'FIXME',
      severity: 'high',
      text: '修复登录超时',
      rawLine: '// FIXME: 修复登录超时',
    },
    {
      relativePath: 'src/auth/login.ts',
    },
  ),
  buildTodoRecord(
    {
      filePath: '/workspace/src/ui/panel.ts',
      line: 9,
      column: 1,
      keyword: 'TODO',
      severity: 'normal',
      text: '整理面板样式',
      rawLine: '// TODO: 整理面板样式',
    },
    {
      relativePath: 'src/ui/panel.ts',
    },
  ),
];

describe('createDefaultViewState', () => {
  it('uses configuration defaults', () => {
    expect(
      createDefaultViewState({
        defaultViewMode: 'keyword',
        defaultRiskOnly: true,
      }),
    ).toEqual({
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'workspace',
      riskFilter: 'highRiskOnly',
      viewMode: 'keyword',
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
      viewMode: 'path',
    } as const;

    expect(
      applyTodoViewState(records, state, { currentFilePath: undefined }).map(
        (record) => record.fileName,
      ),
    ).toEqual(['login.ts']);
  });

  it('filters to current file and current folder scopes', () => {
    const fileState = {
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'currentFile',
      riskFilter: 'all',
      viewMode: 'path',
    } as const;

    const folderState = {
      ...fileState,
      scopeFilter: 'currentFolder',
    } as const;

    expect(
      applyTodoViewState(records, fileState, {
        currentFilePath: '/workspace/src/ui/panel.ts',
      }).map((record) => record.fileName),
    ).toEqual(['panel.ts']);
    expect(
      applyTodoViewState(records, folderState, {
        currentFilePath: '/workspace/src/ui/panel.ts',
      }).map((record) => record.fileName),
    ).toEqual(['panel.ts']);
  });

  it('filters to a user-selected folder scope', () => {
    const state = {
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'selectedFolder',
      selectedFolderPath: 'src/auth',
      riskFilter: 'all',
      viewMode: 'path',
    } as const;

    expect(
      applyTodoViewState(records, state, {
        currentFilePath: '/workspace/src/ui/panel.ts',
      }).map((record) => record.fileName),
    ).toEqual(['login.ts']);
  });

  it('falls back to workspace scope when no active editor exists', () => {
    const state = {
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'currentFile',
      riskFilter: 'all',
      viewMode: 'path',
    } as const;

    expect(
      applyTodoViewState(records, state, { currentFilePath: undefined }),
    ).toHaveLength(2);
  });
});

describe('updateViewState', () => {
  it('applies partial updates without resetting the rest of the state', () => {
    const state = updateViewState(createDefaultViewState(), {
      query: 'auth',
      keywordFilter: 'FIXME',
    });

    expect(state.query).toBe('auth');
    expect(state.keywordFilter).toBe('FIXME');
    expect(state.viewMode).toBe('path');
  });

  it('clears a selected folder path when switching back to a non-folder scope', () => {
    const state = updateViewState(
      {
        ...createDefaultViewState(),
        scopeFilter: 'selectedFolder',
        selectedFolderPath: 'src/auth',
      },
      {
        scopeFilter: 'workspace',
      },
    );

    expect(state.scopeFilter).toBe('workspace');
    expect(state.selectedFolderPath).toBeUndefined();
  });

  it('falls back to workspace when the selected folder resolves to the project root', () => {
    const state = updateViewState(createDefaultViewState(), {
      scopeFilter: 'selectedFolder',
      selectedFolderPath: '.',
    });

    expect(state.scopeFilter).toBe('workspace');
    expect(state.selectedFolderPath).toBeUndefined();
  });
});
