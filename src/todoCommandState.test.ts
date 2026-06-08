import { describe, expect, it } from 'vitest';
import { createDefaultViewState, updateViewState } from './todoViewState';

describe('command-driven state transitions', () => {
  it('clears search and filters back to defaults', () => {
    const state = updateViewState(
      createDefaultViewState({
        defaultViewMode: 'file',
        defaultRiskOnly: true,
      }),
      {
        query: 'auth',
        keywordFilter: 'FIXME',
        scopeFilter: 'currentFile',
      },
    );

    expect({
      ...createDefaultViewState({
        defaultViewMode: 'file',
        defaultRiskOnly: true,
      }),
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'workspace',
    }).toEqual({
      query: '',
      keywordFilter: 'ALL',
      scopeFilter: 'workspace',
      riskFilter: 'highRiskOnly',
      viewMode: 'file',
    });

    expect(state.query).toBe('auth');
  });
});
